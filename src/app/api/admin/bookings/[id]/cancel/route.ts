import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { requireAdmin } from "@/lib/admin-auth";

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
  const authError = requireAdmin(request);
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
    .select("id, status, payment_intent_id, team_id")
    .eq("id", id)
    .returns<{ id: string; status: string; payment_intent_id: string | null; team_id: string | null }[]>()
    .single();

  if (error || !booking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  if (booking.status === "cancelled") {
    return NextResponse.json({ error: "Booking is already cancelled." }, { status: 409 });
  }

  // 2. Issue refund if requested and payment exists
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

  // 3. Update booking
  await supabase
    .from("bookings")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by: "admin",
      cancellation_reason: reason || null,
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

  return NextResponse.json({
    success: true,
    refund_id: refundId,
    refund_status: refundStatus,
  });
}
