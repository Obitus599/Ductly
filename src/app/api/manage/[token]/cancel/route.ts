import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { fireN8nWebhook } from "@/lib/n8n";

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
  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
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
    .select("id, status, slot_start, payment_intent_id, team_id, customer_id")
    .eq("manage_token", token)
    .returns<{ id: string; status: string; slot_start: string; payment_intent_id: string | null; team_id: string | null; customer_id: string }[]>()
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

  // 4. Issue Stripe refund
  let refundId: string | null = null;
  let refundStatus: string = "pending";

  if (booking.payment_intent_id) {
    try {
      const refund = await stripe.refunds.create({
        payment_intent: booking.payment_intent_id,
      });
      refundId = refund.id;
      refundStatus = refund.status ?? "succeeded";
    } catch (err) {
      console.error("Stripe refund failed:", err);
      // Log but don't block cancellation — admin can handle manually
      await supabase.from("error_log").insert({
        flow_name: "customer_cancellation_refund",
        error_message: err instanceof Error ? err.message : "Refund failed",
        payload: { booking_id: booking.id, payment_intent_id: booking.payment_intent_id },
      } as never);
      refundStatus = "failed";
    }
  }

  // 5. Update booking status
  await supabase
    .from("bookings")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by: "customer",
      cancellation_reason: reason || null,
      refund_id: refundId,
      refund_status: refundStatus,
    } as never)
    .eq("id", booking.id);

  // 6. Release the slot lock so the slot becomes available again
  if (booking.team_id) {
    await supabase
      .from("slot_locks")
      .delete()
      .eq("booking_id", booking.id);
  }

  // 7. Trigger n8n cancellation notification
  const n8nCancelUrl = process.env.N8N_WEBHOOK_BOOKING_CANCELLED;
  if (n8nCancelUrl) {
    const { data: customer } = await supabase
      .from("customers")
      .select("name, phone, email")
      .eq("id", booking.customer_id)
      .returns<{ name: string; phone: string; email: string }[]>()
      .single();

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

  return NextResponse.json({
    success: true,
    booking_id: booking.id,
    refund_id: refundId,
    refund_status: refundStatus,
    message: refundStatus === "failed"
      ? "Booking cancelled. Refund could not be processed automatically — our team will follow up."
      : "Booking cancelled. Your refund will appear within 5-10 business days.",
  });
}
