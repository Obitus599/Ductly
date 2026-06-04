import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { requireAdmin, requireSameOrigin } from "@/lib/admin-auth";
import { assignTeamToBooking } from "@/lib/scheduling-agent";
import { fireN8nWebhook } from "@/lib/n8n";
import { fireOpsAlert } from "@/lib/ops-alert";
import { buildMapsLink, formatSlotForDispatch, addressQuality } from "@/lib/dispatch-format";
import { UAE_TZ_SUFFIX } from "@/lib/slot-helpers";
import { ADMIN_RECORDED_CONSENT_VERSION } from "@/lib/consent";

/** Plan config — must match shared.tsx / checkout PLAN_CONFIG */
const PLAN_CONFIG: Record<string, { rate: number; setupMins: number; perThermostatMins: number }> = {
  essential: { rate: 349, setupMins: 45, perThermostatMins: 45 },
  signature: { rate: 549, setupMins: 80, perThermostatMins: 45 },
  elite:     { rate: 649, setupMins: 80, perThermostatMins: 60 },
};

/**
 * POST /api/admin/bookings/create
 *
 * Admin-only manual booking creation (phone-in bookings, walk-ins).
 * Bypasses Stripe — booking is created directly in "confirmed" status.
 * Server-side slot_end recalculation from plan + thermostats.
 */
export async function POST(request: NextRequest) {
  const csrfError = requireSameOrigin(request);
  if (csrfError) return csrfError;
  const authError = requireAdmin(request);
  if (authError) return authError;

  // eslint-disable-next-line
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

  // Blackout check — refuse if a global blackout covers this slot, or
  // (when no remaining teams) every active team has a blackout here.
  const { data: overlappingBlackouts } = await supabase
    .from("schedule_blackouts")
    .select("team_id, reason")
    .lt("starts_at", computedSlotEnd)
    .gt("ends_at", slot_start)
    .returns<{ team_id: string | null; reason: string }[]>();

  if (overlappingBlackouts && overlappingBlackouts.length > 0) {
    const globalBlackout = overlappingBlackouts.find((b) => b.team_id === null);
    if (globalBlackout) {
      return NextResponse.json(
        { error: `Time is blocked: ${globalBlackout.reason}` },
        { status: 409 }
      );
    }
    const blackedTeamIds = new Set(overlappingBlackouts.map((b) => b.team_id).filter(Boolean));
    if (blackedTeamIds.size >= totalTeams) {
      return NextResponse.json(
        { error: "All teams are blocked for this time range." },
        { status: 409 }
      );
    }
  }

  // 1. Upsert customer (email optional for phone-in).
  // Admin-created bookings record verbal consent on the customer's
  // behalf — see ADMIN_RECORDED_CONSENT_VERSION sentinel.
  const customerData: Record<string, string | null> = {
    name: customer_name,
    phone: customer_phone,
    consent_given_at: new Date().toISOString(),
    consent_version: ADMIN_RECORDED_CONSENT_VERSION,
    deleted_at: null,
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

  // 4. Immediately notify the assigned team (manual bookings have no Stripe
  //    webhook, so the team-dispatch must fire from here). Mirrors the
  //    dispatch payload built in /api/webhooks/stripe.
  const n8nDispatchUrl = process.env.N8N_WEBHOOK_TEAM_DISPATCH;
  if (n8nDispatchUrl && teamResult.teamId) {
    const { data: teamData } = await supabase
      .from("teams")
      .select("name, whatsapp_number")
      .eq("id", teamResult.teamId)
      .returns<{ name: string; whatsapp_number: string }[]>()
      .single();

    const addrDetails = (address_details || null) as Record<string, unknown> | null;
    const priceAed = planCfg.rate * thermostatCount;

    // PDPL: record that customer PII was shared with this team.
    supabase
      .from("team_data_access")
      .insert({
        team_id: teamResult.teamId,
        booking_id: booking.id,
        shared_fields: ["customer_name", "customer_phone", "address"],
        channel: "n8n_team_dispatch",
      } as never)
      .then(({ error }) => {
        if (error) console.warn("team_data_access insert failed:", error.message);
      });

    fireN8nWebhook("team_dispatch", n8nDispatchUrl, {
      event: "team_dispatch",
      booking_id: booking.id,
      team_id: teamResult.teamId,
      team_name: teamData?.name || "",
      team_whatsapp: teamData?.whatsapp_number || "",
      customer_name: customer_name,
      customer_phone: customer_phone,
      address: address || "",
      address_quality: addressQuality(addrDetails),
      maps_link: buildMapsLink(addrDetails, address || ""),
      building_name: addrDetails?.building_name || "",
      flat_number: addrDetails?.flat_number || "",
      floor: addrDetails?.floor || "",
      additional_directions: addrDetails?.additional_directions || "",
      slot_start,
      slot_start_human: formatSlotForDispatch(slot_start),
      slot_end: computedSlotEnd,
      slot_end_human: formatSlotForDispatch(computedSlotEnd),
      plan,
      price_aed: String(priceAed),
      source: "manual_admin_booking",
    });
  }

  // 5. Notify the owners of the new (manual) booking. Dormant until
  //    N8N_WEBHOOK_OPS_ALERT is configured.
  fireOpsAlert("new_booking", {
    bookingId: booking.id,
    customerName: customer_name,
    customerPhone: customer_phone,
    slotStart: slot_start,
    address: address || "",
    extra: `${plan} · AED ${planCfg.rate * thermostatCount} · Manual booking`,
    source: "manual_admin_booking",
  });

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
