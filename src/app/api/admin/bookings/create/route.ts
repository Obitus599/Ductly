import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import { assignTeamToBooking } from "@/lib/scheduling-agent";
import { UAE_TZ_SUFFIX } from "@/lib/slot-helpers";

/** Plan config — must match shared.tsx / checkout PLAN_CONFIG */
const PLAN_CONFIG: Record<string, { rate: number; setupMins: number; perThermostatMins: number }> = {
  essential: { rate: 500, setupMins: 45, perThermostatMins: 45 },
  signature: { rate: 750, setupMins: 80, perThermostatMins: 45 },
  elite:     { rate: 900, setupMins: 80, perThermostatMins: 60 },
};

/**
 * POST /api/admin/bookings/create
 *
 * Admin-only manual booking creation (phone-in bookings, walk-ins).
 * Bypasses Stripe — booking is created directly in "confirmed" status.
 * Server-side slot_end recalculation from plan + thermostats.
 */
export async function POST(request: NextRequest) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const {
    customer_name,
    customer_email,
    customer_phone,
    address,
    address_details,
    slot_start,
    plan,
    thermostats,
    notes,
  } = body;

  if (!customer_name || !customer_phone || !address || !slot_start || !plan) {
    return NextResponse.json(
      { error: "Missing required fields: customer_name, customer_phone, address, slot_start, plan." },
      { status: 400 }
    );
  }

  // Validate plan
  const planCfg = PLAN_CONFIG[plan];
  if (!planCfg) {
    return NextResponse.json(
      { error: "Invalid plan. Must be essential, signature, or elite." },
      { status: 400 }
    );
  }

  // Validate slot_start format (must contain T separator for date extraction)
  if (typeof slot_start !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(slot_start)) {
    return NextResponse.json(
      { error: "Invalid slot_start — expected ISO 8601 format (e.g. 2026-04-20T10:00:00+04:00)." },
      { status: 400 }
    );
  }
  const slotStartDate = new Date(slot_start);
  if (isNaN(slotStartDate.getTime())) {
    return NextResponse.json(
      { error: "Invalid slot_start timestamp." },
      { status: 400 }
    );
  }

  // Server-side slot_end calculation (never trust client)
  const thermostatCount = Math.max(1, Math.min(50, Math.floor(Number(thermostats) || 1)));
  const jobDurationMins = planCfg.setupMins + planCfg.perThermostatMins * thermostatCount;
  const computedSlotEnd = new Date(slotStartDate.getTime() + jobDurationMins * 60 * 1000).toISOString();

  const supabase = supabaseAdmin;

  // Always check active team count first — can't create bookings with zero teams
  const { data: activeTeams } = await supabase
    .from("teams")
    .select("id")
    .eq("active", true)
    .returns<{ id: string }[]>();

  const totalTeams = activeTeams?.length ?? 0;
  if (totalTeams === 0) {
    return NextResponse.json(
      { error: "No active teams available. Add a team before creating bookings." },
      { status: 409 }
    );
  }

  // Slot collision check — ensure not all teams are occupied at this time
  const dateStr = slot_start.split("T")[0];
  const { data: existingBookings } = await supabase
    .from("bookings")
    .select("id, slot_start, slot_end, team_id")
    .gte("slot_start", dateStr + "T00:00:00" + UAE_TZ_SUFFIX)
    .lte("slot_start", dateStr + "T23:59:59" + UAE_TZ_SUFFIX)
    .in("status", ["pending", "confirmed"])
    .returns<{ id: string; slot_start: string; slot_end: string; team_id: string | null }[]>();

  if (existingBookings && existingBookings.length > 0) {
    const newStart = slotStartDate.getTime();
    const newEnd = new Date(computedSlotEnd).getTime();

    // Deduplicate by team_id — skip unassigned (null) bookings
    const occupiedTeamIds = new Set<string>();
    for (const b of existingBookings) {
      if (!b.team_id) continue; // unassigned bookings don't occupy a team slot
      const bStart = new Date(b.slot_start).getTime();
      const bEnd = new Date(b.slot_end).getTime();
      if (newStart < bEnd && bStart < newEnd) {
        occupiedTeamIds.add(b.team_id);
      }
    }

    if (occupiedTeamIds.size >= totalTeams) {
      return NextResponse.json(
        { error: "All teams are occupied at this time. No available slot for this booking." },
        { status: 409 }
      );
    }
  }

  // 1. Upsert customer (email optional for phone-in)
  const customerData: Record<string, string> = {
    name: customer_name,
    phone: customer_phone,
  };
  if (customer_email) customerData.email = customer_email;

  const upsertOpts = customer_email
    ? { onConflict: "email" }
    : undefined;

  let customerId: string;

  if (customer_email && upsertOpts) {
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .upsert(customerData as never, upsertOpts)
      .select("id")
      .returns<{ id: string }[]>()
      .single();

    if (customerError || !customer) {
      return NextResponse.json(
        { error: "Failed to create customer: " + (customerError?.message ?? "Unknown error") },
        { status: 500 }
      );
    }
    customerId = customer.id;
  } else {
    // No email — just insert new customer
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .insert(customerData as never)
      .select("id")
      .returns<{ id: string }[]>()
      .single();

    if (customerError || !customer) {
      return NextResponse.json(
        { error: "Failed to create customer: " + (customerError?.message ?? "Unknown error") },
        { status: 500 }
      );
    }
    customerId = customer.id;
  }

  // 2. Create booking as confirmed (no payment for manual bookings)
  const manageToken = `bk_${crypto.randomBytes(24).toString("hex")}`;

  const bookingPayload: Record<string, unknown> = {
    customer_id: customerId,
    slot_start,
    slot_end: computedSlotEnd,
    address,
    plan,
    thermostats: thermostatCount,
    status: "confirmed",
    manage_token: manageToken,
  };
  if (address_details) bookingPayload.address_details = address_details;
  if (notes) bookingPayload.notes = notes;

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .insert(bookingPayload as never)
    .select("id")
    .returns<{ id: string }[]>()
    .single();

  if (bookingError || !booking) {
    return NextResponse.json(
      { error: "Failed to create booking: " + (bookingError?.message ?? "Unknown error") },
      { status: 500 }
    );
  }

  // 3. Assign team via Layer 2
  let teamResult: { teamId: string | null; method: string } = { teamId: null, method: "none" };
  try {
    teamResult = await assignTeamToBooking(booking.id, slot_start, address);
  } catch (err) {
    console.error("Team assignment failed for manual booking:", err);
    await supabase.from("error_log").insert({
      flow_name: "manual_booking_agent",
      error_message: err instanceof Error ? err.message : "Unknown error",
      payload: { booking_id: booking.id },
    } as never);
  }

  return NextResponse.json({
    booking_id: booking.id,
    customer_id: customerId,
    team_id: teamResult.teamId,
    team_method: teamResult.method,
    plan,
    thermostats: thermostatCount,
    job_duration_mins: jobDurationMins,
  });
}
