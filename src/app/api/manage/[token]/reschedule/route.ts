import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { assignTeamToBooking } from "@/lib/scheduling-agent";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/client-ip";
import { fireOpsAlert } from "@/lib/ops-alert";
import { fireN8nWebhook } from "@/lib/n8n";
import {
  buildMapsLink,
  formatSlotForDispatch,
  addressQuality,
} from "@/lib/dispatch-format";
import { PLANS, calcJobDuration } from "@/lib/pricing";

const RESCHEDULE_WINDOW_HOURS = 24;
/** Only used when the booking predates the plan/thermostats snapshot. */
const FALLBACK_JOB_DURATION_MINS = 90;

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
  const clientIp = getClientIp(request);
  const rl = await checkRateLimit(`reschedule:${clientIp}`, 5, 5 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many attempts." }, { status: 429 });
  }

  const { token } = await params;

  if (!token || !token.startsWith("bk_")) {
    return NextResponse.json({ error: "Invalid token." }, { status: 400 });
  }

  let newSlotStart: string;
  let clientSlotEnd: string | undefined;
  try {
    const body = await request.json();
    newSlotStart = body.new_slot_start;
    clientSlotEnd = body.new_slot_end;
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
    .select(
      "id, status, slot_start, slot_end, team_id, address, address_details, customer_id, plan, thermostats, price_net_fils"
    )
    .eq("manage_token", token)
    .returns<
      {
        id: string;
        status: string;
        slot_start: string;
        slot_end: string;
        team_id: string | null;
        address: string;
        address_details: Record<string, unknown> | null;
        customer_id: string;
        plan: string | null;
        thermostats: number | null;
        price_net_fils: number | null;
      }[]
    >()
    .single();

  if (fetchError || !booking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  // Recompute the job window from the booking's OWN plan + thermostats.
  // The old hardcoded 90 minutes silently shrank every Elite/multi-
  // thermostat job on reschedule (an Elite 3-thermostat job is 260 mins),
  // so the slot looked free for a second booking that physically overlaps.
  // A client-supplied new_slot_end is never trusted.
  const planCfg = booking.plan ? PLANS[booking.plan] : undefined;
  const jobDurationMins = planCfg
    ? calcJobDuration(planCfg, booking.thermostats ?? 1)
    : Math.max(
        FALLBACK_JOB_DURATION_MINS,
        Math.round(
          (new Date(booking.slot_end).getTime() -
            new Date(booking.slot_start).getTime()) /
            60000
        ) || FALLBACK_JOB_DURATION_MINS
      );
  if (clientSlotEnd && isNaN(new Date(clientSlotEnd).getTime())) {
    return NextResponse.json({ error: "Invalid new_slot_end." }, { status: 400 });
  }
  const newSlotEnd = new Date(
    new Date(newSlotStart).getTime() + jobDurationMins * 60 * 1000
  ).toISOString();

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
  let reassignedTeamId: string | null = null;
  try {
    const result = await assignTeamToBooking(
      booking.id,
      newSlotStart,
      booking.address
    );
    reassignedTeamId = result.teamId;
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

  const { data: rescheduleCustomer } = await supabase
    .from("customers")
    .select("name, phone")
    .eq("id", booking.customer_id)
    .returns<{ name: string; phone: string }[]>()
    .single();

  // 8. Dispatch to the NEWLY assigned team. Without this the reschedule
  //    moved the job and reassigned the crew, but nobody ever told the
  //    crew — the customer waits at the new time for a team that was
  //    never notified, i.e. a no-show caused by us.
  const n8nDispatchUrl = process.env.N8N_WEBHOOK_TEAM_DISPATCH;
  if (n8nDispatchUrl && reassignedTeamId) {
    const { data: teamData } = await supabase
      .from("teams")
      .select("name, whatsapp_number")
      .eq("id", reassignedTeamId)
      .returns<{ name: string; whatsapp_number: string }[]>()
      .maybeSingle();

    const addrDetails = booking.address_details;

    // PDPL: record that customer PII was shared with this team.
    const { error: accessLogError } = await supabase
      .from("team_data_access")
      .insert({
        team_id: reassignedTeamId,
        booking_id: booking.id,
        shared_fields: ["customer_name", "customer_phone", "address"],
        channel: "n8n_team_dispatch",
      } as never);
    if (accessLogError) {
      console.warn("team_data_access insert failed:", accessLogError.message);
    }

    fireN8nWebhook("team_dispatch", n8nDispatchUrl, {
      event: "team_dispatch",
      booking_id: booking.id,
      team_id: reassignedTeamId,
      team_name: teamData?.name || "",
      team_whatsapp: teamData?.whatsapp_number || "",
      customer_name: rescheduleCustomer?.name || "",
      customer_phone: rescheduleCustomer?.phone || "",
      address: booking.address || "",
      address_quality: addressQuality(addrDetails),
      maps_link: buildMapsLink(addrDetails, booking.address || ""),
      building_name: addrDetails?.building_name || "",
      flat_number: addrDetails?.flat_number || "",
      floor: addrDetails?.floor || "",
      additional_directions: addrDetails?.additional_directions || "",
      slot_start: newSlotStart,
      slot_start_human: formatSlotForDispatch(newSlotStart),
      slot_end: newSlotEnd,
      slot_end_human: formatSlotForDispatch(newSlotEnd),
      plan: booking.plan || "",
      price_aed: booking.price_net_fils
        ? String(Math.round(booking.price_net_fils / 100))
        : "",
      rescheduled_from: oldSlotStart,
      twilio_from: process.env.TWILIO_WHATSAPP_FROM || "",
      content_sid: process.env.TWILIO_CONTENT_SID_TEAM_DISPATCH || "",
    });
  }

  // 9. Notify the owners of the reschedule. Dormant until
  //    N8N_WEBHOOK_OPS_ALERT is configured.
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
