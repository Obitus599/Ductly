import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { requireAdmin, requireSameOrigin } from "@/lib/admin-auth";
import { assignTeamToBooking } from "@/lib/scheduling-agent";
import { fireN8nWebhook } from "@/lib/n8n";
import { fireOpsAlert } from "@/lib/ops-alert";
import { buildMapsLink, formatSlotForDispatch, addressQuality } from "@/lib/dispatch-format";
import { vatFromNet } from "@/lib/vat";
import { UAE_TZ_SUFFIX } from "@/lib/slot-helpers";
import { ADMIN_RECORDED_CONSENT_VERSION } from "@/lib/consent";
import { PLANS, calcJobDuration } from "@/lib/pricing";

const PLAN_CONFIG = PLANS;

interface CreateBookingBody {
  customer_name: string;
  customer_email?: string;
  customer_phone: string;
  address: string;
  address_details?: Record<string, unknown>;
  property_type?: string;
  bedrooms?: number;
  slot_start: string;
  plan: string;
  thermostats?: number;
  notes?: string;
}

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
  const authError = await requireAdmin(request);
  if (authError) return authError;

  let body: CreateBookingBody;
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
    property_type,
    bedrooms,
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

  // Validate property_type (optional but must be valid if provided)
  if (property_type && !["villa", "apartment", "office"].includes(property_type)) {
    return NextResponse.json(
      { error: "Invalid property_type. Must be villa, apartment, or office." },
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
  const jobDurationMins = calcJobDuration(planCfg, thermostatCount);
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

  // ── Capacity check ────────────────────────────────────────────────────
  // This must be at least as strict as the customer-facing /api/slots
  // filter, or an admin can hand-create a booking into a slot the public
  // site (correctly) refuses to sell. The previous version was weaker in
  // three separate ways, each of which could overbook the day:
  //   • it ignored active booking_locks (customers mid-checkout),
  //   • it skipped unassigned pending bookings entirely,
  //   • it scored occupancy and blackouts independently, so 1 team busy
  //     + the other blacked out read as "1 of 2" twice instead of "2 of 2".
  // Occupied teams, blacked-out teams and held locks are now combined into
  // ONE consumed-capacity number.
  const newStart = slotStartDate.getTime();
  const newEnd = new Date(computedSlotEnd).getTime();
  const overlapsNewSlot = (start: string, end: string) =>
    newStart < new Date(end).getTime() && new Date(start).getTime() < newEnd;

  const dateStr = slot_start.split("T")[0];
  const dayStart = dateStr + "T00:00:00" + UAE_TZ_SUFFIX;
  const dayEnd = dateStr + "T23:59:59" + UAE_TZ_SUFFIX;

  const { data: existingBookings } = await supabase
    .from("bookings")
    .select("id, slot_start, slot_end, team_id")
    .gte("slot_start", dayStart)
    .lte("slot_start", dayEnd)
    .in("status", ["pending", "confirmed"])
    .returns<{ id: string; slot_start: string; slot_end: string; team_id: string | null }[]>();

  // Consumed capacity, deduped by team where we know the team.
  const consumedTeamIds = new Set<string>();
  // Bookings/locks with no team yet still consume ONE unit of capacity
  // each — the scheduler will have to give them a crew.
  let unassignedHolds = 0;

  for (const b of existingBookings ?? []) {
    if (!overlapsNewSlot(b.slot_start, b.slot_end)) continue;
    if (b.team_id) consumedTeamIds.add(b.team_id);
    else unassignedHolds += 1;
  }

  // Active pre-payment holds from customers currently in checkout.
  const { data: activeLocks } = await supabase
    .from("booking_locks")
    .select("slot_start")
    .gte("slot_start", dayStart)
    .lte("slot_start", dayEnd)
    .gt("expires_at", new Date().toISOString())
    .returns<{ slot_start: string }[]>();

  for (const l of activeLocks ?? []) {
    // Locks carry no duration; treat them as occupying the same job
    // window we're about to book.
    const lockStart = new Date(l.slot_start).getTime();
    if (newStart < lockStart + (newEnd - newStart) && lockStart < newEnd) {
      unassignedHolds += 1;
    }
  }

  // Blackouts: a global one blocks outright; per-team ones consume that
  // team's capacity in the SAME tally as bookings above.
  const { data: overlappingBlackouts } = await supabase
    .from("schedule_blackouts")
    .select("team_id, reason")
    .lt("starts_at", computedSlotEnd)
    .gt("ends_at", slot_start)
    .returns<{ team_id: string | null; reason: string }[]>();

  const globalBlackout = (overlappingBlackouts ?? []).find((b) => b.team_id === null);
  if (globalBlackout) {
    return NextResponse.json(
      { error: `Time is blocked: ${globalBlackout.reason}` },
      { status: 409 }
    );
  }
  for (const b of overlappingBlackouts ?? []) {
    if (b.team_id) consumedTeamIds.add(b.team_id);
  }

  if (consumedTeamIds.size + unassignedHolds >= totalTeams) {
    return NextResponse.json(
      {
        error:
          "All teams are occupied or blocked at this time. No available slot for this booking.",
      },
      { status: 409 }
    );
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

  // Financial snapshot — net price × thermostats, 5% VAT on top.
  const manualVat = vatFromNet(planCfg.rate * thermostatCount * 100);

  const bookingPayload: Record<string, unknown> = {
    customer_id: customerId,
    slot_start,
    slot_end: computedSlotEnd,
    address,
    plan,
    thermostats: thermostatCount,
    status: "confirmed",
    manage_token: manageToken,
    price_net_fils: manualVat.netFils,
    price_vat_fils: manualVat.vatFils,
    price_total_fils: manualVat.totalFils,
    vat_rate: manualVat.vatRatePercent,
    currency: "aed",
  };
  if (address_details) bookingPayload.address_details = address_details;
  if (property_type) bookingPayload.property_type = property_type;
  if (bedrooms !== undefined) bookingPayload.bedrooms = bedrooms;
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

    // PDPL: record that customer PII was shared with this team. AWAITED —
    // the disclosure below happens unconditionally, so the audit row must
    // not be fire-and-forget.
    const { error: accessLogError } = await supabase
      .from("team_data_access")
      .insert({
        team_id: teamResult.teamId,
        booking_id: booking.id,
        shared_fields: ["customer_name", "customer_phone", "address"],
        channel: "n8n_team_dispatch",
      } as never);
    if (accessLogError) {
      console.warn("team_data_access insert failed:", accessLogError.message);
      await supabase.from("error_log").insert({
        flow_name: "team_data_access_audit",
        error_message: `PII shared with team ${teamResult.teamId} for booking ${booking.id} but the PDPL access record failed: ${accessLogError.message}`,
        payload: { booking_id: booking.id, team_id: teamResult.teamId },
      } as never);
    }

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
      twilio_from: process.env.TWILIO_WHATSAPP_FROM || "",
      content_sid: process.env.TWILIO_CONTENT_SID_TEAM_DISPATCH || "",
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
    manage_token: manageToken,
  });
}
