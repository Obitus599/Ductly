import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/client-ip";
import { fireN8nWebhook } from "@/lib/n8n";
import { fireOpsAlert } from "@/lib/ops-alert";
import { issueCancellationRefund, refundMessage } from "@/lib/refund";

const CANCELLATION_WINDOW_HOURS = 24;

/**
 * POST /api/manage/[token]/cancel
 *
 * Cancels a confirmed booking. Issues a full Stripe refund if within
 * the 24-hour cancellation window.
 *
 * Body: { reason?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const clientIp = getClientIp(request);
  const rl = await checkRateLimit(`cancel:${clientIp}`, 5, 5 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many attempts." }, { status: 429 });
  }

  const { token } = await params;

  if (!token || !token.startsWith("bk_")) {
    return NextResponse.json({ error: "Invalid token." }, { status: 400 });
  }

  let reason = "";
  try {
    const body = await request.json();
    reason = body.reason ? String(body.reason).slice(0, 500) : "";
  } catch {
    // No body is fine — reason is optional
  }

  const supabase = supabaseAdmin;

  // 1. Fetch the booking
  const { data: booking, error: fetchError } = await supabase
    .from("bookings")
    .select("id, status, slot_start, payment_intent_id, payment_provider, tabby_payment_id, price_total_fils, team_id, customer_id")
    .eq("manage_token", token)
    .returns<{ id: string; status: string; slot_start: string; payment_intent_id: string | null; payment_provider: string | null; tabby_payment_id: string | null; price_total_fils: number | null; team_id: string | null; customer_id: string }[]>()
    .single();

  if (fetchError || !booking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  // 2. Validate status
  if (booking.status !== "confirmed") {
    return NextResponse.json(
      { error: `Cannot cancel a booking with status "${booking.status}".` },
      { status: 409 }
    );
  }

  // 3. Check cancellation window
  const hoursUntilSlot = (new Date(booking.slot_start).getTime() - Date.now()) / (1000 * 60 * 60);
  if (hoursUntilSlot < CANCELLATION_WINDOW_HOURS) {
    return NextResponse.json(
      {
        error: `Cancellation window has passed. Bookings must be cancelled at least ${CANCELLATION_WINDOW_HOURS} hours in advance.`,
        hours_until_slot: Math.round(hoursUntilSlot),
      },
      { status: 422 }
    );
  }

  // 4. CLAIM the cancellation atomically BEFORE refunding. The
  //    conditional update (status='confirmed' → 'cancelled') ensures only
  //    one actor performs the cancel: a concurrent confirm/cancel or a
  //    duplicate request that doesn't claim a row must NOT issue a Stripe
  //    refund. If 0 rows match, the booking is no longer confirmed.
  const { data: claimed } = await supabase
    .from("bookings")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by: "customer",
      cancellation_reason: reason || null,
    } as never)
    .eq("id", booking.id)
    .eq("status", "confirmed")
    .select("id")
    .returns<{ id: string }[]>();

  if (!claimed || claimed.length === 0) {
    return NextResponse.json(
      { error: "Booking is no longer active and cannot be cancelled." },
      { status: 409 }
    );
  }

  // 7. Fetch the customer once for both the refund escalation context and
  //    the customer-facing + internal notifications.
  const { data: customer } = await supabase
    .from("customers")
    .select("name, phone, email")
    .eq("id", booking.customer_id)
    .returns<{ name: string; phone: string; email: string }[]>()
    .single();

  // 5. Now that we own the cancellation, issue the refund through the
  //    RIGHT provider (Stripe card OR Tabby BNPL). A Tabby booking has no
  //    payment_intent_id, so the old Stripe-only block silently skipped it
  //    and reported a phantom "pending" refund.
  const refund = await issueCancellationRefund({
    bookingId: booking.id,
    paymentProvider: booking.payment_provider,
    paymentIntentId: booking.payment_intent_id,
    tabbyPaymentId: booking.tabby_payment_id,
    amountFils: booking.price_total_fils,
    reason,
    triggeredBy: "customer",
    customerName: customer?.name,
    customerPhone: customer?.phone,
    slotStart: booking.slot_start,
  });

  // 5b. Record the refund outcome on the (already-cancelled) booking, and
  //     ROTATE the manage_token so this now-defunct link stops being a live
  //     key to the account (defence for the leaked/stale-token risk).
  const rotatedToken = `bk_${crypto.randomBytes(24).toString("hex")}`;
  await supabase
    .from("bookings")
    .update({
      refund_id: refund.refundId,
      ...(refund.refundStatus ? { refund_status: refund.refundStatus } : {}),
      manage_token: rotatedToken,
    } as never)
    .eq("id", booking.id);
  const refundStatus = refund.refundStatus ?? "not_applicable";

  // 6. Release the slot lock so the slot becomes available again
  if (booking.team_id) {
    await supabase
      .from("slot_locks")
      .delete()
      .eq("booking_id", booking.id);
  }

  // 7a. Trigger n8n cancellation notification (customer-facing)
  const n8nCancelUrl = process.env.N8N_WEBHOOK_BOOKING_CANCELLED;
  if (n8nCancelUrl) {
    fireN8nWebhook("booking_cancelled_customer", n8nCancelUrl, {
      event: "booking_cancelled",
      booking_id: booking.id,
      customer_name: customer?.name || "",
      customer_phone: customer?.phone || "",
      customer_email: customer?.email || "",
      slot_start: booking.slot_start,
      reason: reason || "No reason provided",
      refund_status: refundStatus,
      cancelled_by: "customer",
    });
  }

  // 7b. Notify the owners of the cancellation. Dormant until
  //     N8N_WEBHOOK_OPS_ALERT is configured.
  fireOpsAlert("cancellation", {
    bookingId: booking.id,
    customerName: customer?.name || "",
    customerPhone: customer?.phone || "",
    slotStart: booking.slot_start,
    extra: `By customer · Refund: ${refundStatus}${reason ? ` · ${reason}` : ""}`,
    source: "customer_cancellation",
  });

  return NextResponse.json({
    success: true,
    booking_id: booking.id,
    refund_id: refund.refundId,
    refund_status: refundStatus,
    message: refundMessage(refund),
  });
}
