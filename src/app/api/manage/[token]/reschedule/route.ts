import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { assignTeamToBooking } from "@/lib/scheduling-agent";
import { checkRateLimit } from "@/lib/rate-limit";
import { fireOpsAlert } from "@/lib/ops-alert";
import { formatSlotForDispatch } from "@/lib/dispatch-format";

const RESCHEDULE_WINDOW_HOURS = 24;
const JOB_DURATION_MINS = 90;

/**
 * POST /api/manage/[token]/reschedule
 *
 * Reschedules a confirmed booking to a new slot.
 * No additional payment — same price carries over.
 *
 * Body: { new_slot_start: string (ISO), new_slot_end?: string (ISO) }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = await checkRateLimit(`reschedule:${clientIp}`, 5, 5 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many attempts." }, { status: 429 });
  }

  const { token } = await params;

  if (!token || !token.startsWith("bk_")) {
    return NextResponse.json({ error: "Invalid token." }, { status: 400 });
  }

  let newSlotStart: string;
  let newSlotEnd: string;
  try {
    const body = await request.json();
    newSlotStart = body.new_slot_start;
    // Default slot_end to slot_start + 90 minutes if not provided
    if (body.new_slot_end) {
      newSlotEnd = body.new_slot_end;
    } else {
      const endDate = new Date(new Date(newSlotStart).getTime() + JOB_DURATION_MINS * 60 * 1000);
      newSlotEnd = endDate.toISOString();
    }
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!newSlotStart || isNaN(new Date(newSlotStart).getTime())) {
    return NextResponse.json({ error: "Valid new_slot_start is required." }, { status: 400 });
  }

  // New slot must be in the future
  if (new Date(newSlotStart).getTime() < Date.now()) {
    return NextResponse.json({ error: "New slot must be in the future." }, { status: 400 });
  }

  const supabase = supabaseAdmin;

  // 1. Fetch the booking
  const { data: booking, error: fetchError } = await supabase
    .from("bookings")
    .select("id, status, slot_start, slot_end, team_id, address, customer_id")
    .eq("manage_token", token)
    .returns<{ id: string; status: string; slot_start: string; slot_end: string; team_id: string | null; address: string; customer_id: string }[]>()
    .single();

  if (fetchError || !booking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  // 2. Validate status
  if (booking.status !== "confirmed") {
    return NextResponse.json(
      { error: `Cannot reschedule a booking with status "${booking.status}".` },
      { status: 409 }
    );
  }

  // 3. Check reschedule window
  const hoursUntilSlot = (new Date(booking.slot_start).getTime() - Date.now()) / (1000 * 60 * 60);
  if (hoursUntilSlot < RESCHEDULE_WINDOW_HOURS) {
    return NextResponse.json(
      {
        error: `Reschedule window has passed. Bookings must be rescheduled at least ${RESCHEDULE_WINDOW_HOURS} hours in advance.`,
        hours_until_slot: Math.round(hoursUntilSlot),
      },
      { status: 422 }
    );
  }

  // 4. Check that the new slot is available (not fully booked)
  const newDate = newSlotStart.split("T")[0];
  const dayStart = `${newDate}T00:00:00+04:00`;
  const dayEnd = `${newDate}T23:59:59+04:00`;

  const { data: existingBookings } = await supabase
    .from("bookings")
    .select("id, slot_start, slot_end")
    .gte("slot_start", dayStart)
    .lte("slot_start", dayEnd)
    .in("status", ["pending", "confirmed"])
    .neq("id", booking.id)
    .returns<{ id: string; slot_start: string; slot_end: string }[]>();

  // Simple overlap check — is any existing booking overlapping the new slot?
  const newStart = new Date(newSlotStart).getTime();
  const newEnd = new Date(newSlotEnd).getTime();
  const hasConflict = (existingBookings || []).some((b) => {
    const bStart = new Date(b.slot_start).getTime();
    const bEnd = new Date(b.slot_end).getTime();
    return newStart < bEnd && bStart < newEnd;
  });

  if (hasConflict) {
    return NextResponse.json(
      { error: "The selected time slot is no longer available. Please choose a different time." },
      { status: 409 }
    );
  }

  const oldSlotStart = booking.slot_start;

  // 5. Delete the old slot lock (frees the old time)
  if (booking.team_id) {
    await supabase
      .from("slot_locks")
      .delete()
      .eq("booking_id", booking.id);
  }

  // 6. Update booking with new slot and clear team assignment
  await supabase
    .from("bookings")
    .update({
      slot_start: newSlotStart,
      slot_end: newSlotEnd,
      rescheduled_from: oldSlotStart,
      team_id: null,
    } as never)
    .eq("id", booking.id);

  // 7. Re-run team assignment for the new slot
  try {
    const result = await assignTeamToBooking(
      booking.id,
      newSlotStart,
      booking.address
    );
    console.log(`Reschedule: reassigned team ${result.teamId} (${result.method}) for booking ${booking.id}`);
  } catch (err) {
    console.error("Reschedule team reassignment failed:", err);
    // Non-blocking — admin can assign manually
    await supabase.from("error_log").insert({
      flow_name: "reschedule_team_assignment",
      error_message: err instanceof Error ? err.message : "Team reassignment failed",
      payload: { booking_id: booking.id, new_slot_start: newSlotStart },
    } as never);
  }

  // 8. Notify the owners of the reschedule. Dormant until
  //    N8N_WEBHOOK_OPS_ALERT is configured.
  const { data: rescheduleCustomer } = await supabase
    .from("customers")
    .select("name, phone")
    .eq("id", booking.customer_id)
    .returns<{ name: string; phone: string }[]>()
    .single();

  fireOpsAlert("reschedule", {
    bookingId: booking.id,
    customerName: rescheduleCustomer?.name || "",
    customerPhone: rescheduleCustomer?.phone || "",
    slotStart: newSlotStart,
    address: booking.address,
    extra: `Was ${formatSlotForDispatch(oldSlotStart)} → Now ${formatSlotForDispatch(newSlotStart)}`,
    source: "customer_reschedule",
  });

  return NextResponse.json({
    success: true,
    booking_id: booking.id,
    old_slot_start: oldSlotStart,
    new_slot_start: newSlotStart,
    new_slot_end: newSlotEnd,
    message: "Booking rescheduled successfully.",
  });
}
