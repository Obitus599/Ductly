import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";

interface BookingRow {
  id: string;
  slot_start: string;
  slot_end: string;
  address: string;
  status: string;
  team_id: string | null;
  customer_id: string;
  payment_intent_id: string | null;
  created_at: string;
}

/**
 * GET /api/manage/[token]
 *
 * Retrieves booking details for the customer management page.
 * The token in the URL authenticates access — no login needed.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = await checkRateLimit(`manage:${clientIp}`, 30, 5 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const { token } = await params;

  if (!token || !token.startsWith("bk_") || token.length < 20) {
    return NextResponse.json({ error: "Invalid token." }, { status: 400 });
  }

  const { data: booking, error } = await supabaseAdmin
    .from("bookings")
    .select("id, slot_start, slot_end, address, status, team_id, customer_id, payment_intent_id, created_at")
    .eq("manage_token", token)
    .returns<BookingRow[]>()
    .single();

  if (error || !booking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  // Fetch customer name + email for display
  const { data: customer } = await supabaseAdmin
    .from("customers")
    .select("name, email, phone")
    .eq("id", booking.customer_id)
    .returns<{ name: string; email: string; phone: string }[]>()
    .single();

  // Check if cancellation/reschedule is still allowed (24h before slot_start)
  const hoursUntilSlot = (new Date(booking.slot_start).getTime() - Date.now()) / (1000 * 60 * 60);
  const canModify = booking.status === "confirmed" && hoursUntilSlot >= 24;

  return NextResponse.json({
    booking: {
      id: booking.id,
      slot_start: booking.slot_start,
      slot_end: booking.slot_end,
      address: booking.address,
      status: booking.status,
      created_at: booking.created_at,
    },
    customer: customer ? { name: customer.name, email: customer.email } : null,
    can_cancel: canModify,
    can_reschedule: canModify,
    hours_until_slot: Math.round(hoursUntilSlot),
    policy: canModify
      ? "Free cancellation available."
      : booking.status !== "confirmed"
        ? "This booking cannot be modified."
        : "Cancellation window has passed (less than 24 hours before appointment).",
  });
}
