import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { requireAdmin, requireSameOrigin } from "@/lib/admin-auth";
import { fireOpsAlert } from "@/lib/ops-alert";

/**
 * GET /api/admin/bookings/[id]
 * Returns full booking detail with customer + team info.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdmin(request);
  if (authError) return authError;

  const { id } = await params;
  const supabase = supabaseAdmin;

  interface BookingDetail {
    id: string; slot_start: string; slot_end: string; address: string;
    status: string; payment_intent_id: string | null; customer_id: string;
    team_id: string | null; manage_token: string | null; rescheduled_from: string | null;
    cancelled_at: string | null; cancelled_by: string | null; cancellation_reason: string | null;
    refund_id: string | null; refund_status: string | null; completed_at: string | null;
    no_show_at: string | null; created_at: string; updated_at: string;
  }

  const { data: booking, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", id)
    .returns<BookingDetail[]>()
    .single();

  if (error || !booking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  // Fetch customer
  const { data: customer } = await supabase
    .from("customers")
    .select("id, name, phone, email, whatsapp_opt_in, created_at")
    .eq("id", booking.customer_id)
    .single();

  // Fetch assigned team
  let team = null;
  if (booking.team_id) {
    const { data } = await supabase
      .from("teams")
      .select("id, name, whatsapp_number, active")
      .eq("id", booking.team_id)
      .single();
    team = data;
  }

  // Fetch all teams for reassignment dropdown
  const { data: allTeams } = await supabase
    .from("teams")
    .select("id, name, active")
    .eq("active", true)
    .order("name");

  // Fetch slot lock for this booking
  const { data: slotLock } = await supabase
    .from("slot_locks")
    .select("id, team_id, slot_start, created_at")
    .eq("booking_id", id)
    .single();

  return NextResponse.json({
    booking,
    customer,
    team,
    all_teams: allTeams ?? [],
    slot_lock: slotLock,
  });
}

/**
 * PATCH /api/admin/bookings/[id]
 * Update booking status or reassign team.
 * Body: { status?, team_id?, reason? }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfError = requireSameOrigin(request);
  if (csrfError) return csrfError;
  const authError = await requireAdmin(request);
  if (authError) return authError;

  const { id } = await params;
  const supabase = supabaseAdmin;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  // Fetch current booking
  const { data: booking, error: fetchError } = await supabase
    .from("bookings")
    .select("id, status, team_id, slot_start, customer_id")
    .eq("id", id)
    .returns<{ id: string; status: string; team_id: string | null; slot_start: string; customer_id: string }[]>()
    .single();

  if (fetchError || !booking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  const allowedStatuses = ["pending", "confirmed", "completed", "cancelled", "no_show"];
  const updates: Record<string, unknown> = {};

  // Status change
  if (body.status && typeof body.status === "string") {
    if (!allowedStatuses.includes(body.status)) {
      return NextResponse.json({ error: `Invalid status: ${body.status}` }, { status: 400 });
    }
    updates.status = body.status;

    if (body.status === "completed") {
      updates.completed_at = new Date().toISOString();
    }
    if (body.status === "no_show") {
      updates.no_show_at = new Date().toISOString();
    }
  }

  // Team reassignment
  if (body.team_id !== undefined) {
    const newTeamId = body.team_id as string | null;

    // Refuse reassignment until the Stripe-webhook scheduling agent
    // has made the initial assignment. Otherwise admin and agent can
    // race and leave bookings.team_id out of sync with slot_locks.
    // The agent typically finishes within 2 seconds of payment.
    if (booking.team_id === null && newTeamId) {
      return NextResponse.json(
        {
          error:
            "Booking is still being auto-assigned. Try again in a moment.",
        },
        { status: 409 }
      );
    }

    if (newTeamId) {
      // Verify team exists and is active
      const { data: team } = await supabase
        .from("teams")
        .select("id, active")
        .eq("id", newTeamId)
        .returns<{ id: string; active: boolean }[]>()
        .single();

      if (!team || !team.active) {
        return NextResponse.json({ error: "Team not found or inactive." }, { status: 400 });
      }
    }

    updates.team_id = newTeamId;

    // Slot lock: upsert by booking_id so we never produce duplicates
    // even if the agent and admin race. Unique constraint on
    // slot_locks(booking_id) enforces invariant at the DB level.
    if (newTeamId && booking.slot_start) {
      await supabase
        .from("slot_locks")
        .upsert(
          {
            team_id: newTeamId,
            slot_start: booking.slot_start,
            booking_id: id,
          } as never,
          { onConflict: "booking_id" }
        );
    } else {
      // Clearing the team — remove the lock.
      await supabase
        .from("slot_locks")
        .delete()
        .eq("booking_id", id);
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const { error: updateError } = await supabase
    .from("bookings")
    .update(updates as never)
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Notify the owners when this PATCH cancels a booking (the dedicated
  // cancel endpoint handles refund-bearing cancellations; this covers
  // a status flip straight to "cancelled" from the admin detail view).
  // Dormant until N8N_WEBHOOK_OPS_ALERT is configured.
  if (updates.status === "cancelled" && booking.status !== "cancelled") {
    const { data: customer } = await supabase
      .from("customers")
      .select("name, phone")
      .eq("id", booking.customer_id)
      .returns<{ name: string; phone: string }[]>()
      .single();

    fireOpsAlert("cancellation", {
      bookingId: booking.id,
      customerName: customer?.name || "",
      customerPhone: customer?.phone || "",
      slotStart: booking.slot_start,
      extra: "By admin · Status change",
      source: "admin_status_patch",
    });
  }

  return NextResponse.json({ success: true, updates });
}
