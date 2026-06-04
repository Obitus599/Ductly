import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { requireAdmin, requireSameOrigin } from "@/lib/admin-auth";
import { fireN8nWebhook } from "@/lib/n8n";
import { fireOpsAlert } from "@/lib/ops-alert";

/**
 * POST /api/admin/bookings/[id]/cancel
 *
 * Admin cancels a booking. No 24-hour restriction.
 * Body: { reason?: string, issue_refund?: boolean }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfError = requireSameOrigin(request);
  if (csrfError) return csrfError;
  const authError = await requireAdmin(request);
  if (authError) return authError;

  const { id } = await params;
  const supabase = supabaseAdmin;

  let reason = "";
  let issueRefund = true;
  try {
    const body = await request.json();
    reason = body.reason ? String(body.reason).slice(0, 500) : "";
    issueRefund = body.issue_refund !== false;
  } catch {
    // Defaults are fine
  }

  // 1. Fetch booking
  const { data: booking, error } = await supabase
    .from("bookings")
    .select("id, status, payment_intent_id, team_id, customer_id, slot_start")
    .eq("id", id)
    .returns<{ id: string; status: string; payment_intent_id: string | null; team_id: string | null; customer_id: string; slot_start: string }[]>()
    .single();

  if (error || !booking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  // Refuse terminal states: cancelling a completed (and invoiced) or
  // no-show booking would refund a fulfilled job and orphan its FTA
  // invoice. The server is the authority here, not just the admin UI.
  if (["cancelled", "completed", "no_show"].includes(booking.status)) {
    return NextResponse.json(
      { error: `Cannot cancel a booking that is already ${booking.status}.` },
      { status: 409 }
    );
  }

  // 2. CLAIM the cancellation atomically (optimistic concurrency on the
  //    status we just read) BEFORE issuing any refund — so a concurrent
  //    confirm/complete or duplicate request can't cause a double refund.
  const { data: claimed } = await supabase
    .from("bookings")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by: "admin",
      cancellation_reason: reason || null,
    } as never)
    .eq("id", id)
    .eq("status", booking.status)
    .select("id")
    .returns<{ id: string }[]>();

  if (!claimed || claimed.length === 0) {
    return NextResponse.json(
      { error: "Booking status changed concurrently; cancellation aborted." },
      { status: 409 }
    );
  }

  // 3. Now that we own the cancellation, issue the refund if requested.
  let refundId: string | null = null;
  let refundStatus = "pending";

  if (issueRefund && booking.payment_intent_id) {
    try {
      const refund = await stripe.refunds.create({
        payment_intent: booking.payment_intent_id,
      });
      refundId = refund.id;
      refundStatus = refund.status ?? "succeeded";
    } catch (err) {
      console.error("Admin refund failed:", err);
      refundStatus = "failed";
    }
  }

  // 3b. Record the refund outcome on the (already-cancelled) booking.
  await supabase
    .from("bookings")
    .update({
      refund_id: refundId,
      refund_status: issueRefund ? refundStatus : null,
    } as never)
    .eq("id", id);

  // 4. Release slot lock
  if (booking.team_id) {
    await supabase
      .from("slot_locks")
      .delete()
      .eq("booking_id", id);
  }

  // 5. Fetch the customer once for both notifications.
  const { data: customer } = await supabase
    .from("customers")
    .select("name, phone, email")
    .eq("id", booking.customer_id)
    .returns<{ name: string; phone: string; email: string }[]>()
    .single();

  // 5a. Trigger n8n cancellation notification (customer-facing)
  const n8nCancelUrl = process.env.N8N_WEBHOOK_BOOKING_CANCELLED;
  if (n8nCancelUrl) {
    fireN8nWebhook("booking_cancelled_admin", n8nCancelUrl, {
      event: "booking_cancelled",
      booking_id: booking.id,
      customer_name: customer?.name || "",
      customer_phone: customer?.phone || "",
      customer_email: customer?.email || "",
      slot_start: booking.slot_start,
      reason: reason || "No reason provided",
      refund_status: issueRefund ? refundStatus : "no_refund",
      cancelled_by: "admin",
    });
  }

  // 5b. Notify the owners of the cancellation. Dormant until
  //     N8N_WEBHOOK_OPS_ALERT is configured.
  fireOpsAlert("cancellation", {
    bookingId: booking.id,
    customerName: customer?.name || "",
    customerPhone: customer?.phone || "",
    slotStart: booking.slot_start,
    extra: `By admin · Refund: ${issueRefund ? refundStatus : "no_refund"}${reason ? ` · ${reason}` : ""}`,
    source: "admin_cancellation",
  });

  return NextResponse.json({
    success: true,
    refund_id: refundId,
    refund_status: refundStatus,
  });
}
