import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { requireAdmin } from "@/lib/admin-auth";

interface BlackoutRow {
  id: string;
  team_id: string | null;
  starts_at: string;
  ends_at: string;
  reason: string;
  created_by: string | null;
  created_at: string;
}

/**
 * GET /api/admin/schedule-blackouts?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns blackouts that overlap the [from, to] window. Both params
 * optional — without them, returns all future blackouts.
 */
export async function GET(request: NextRequest) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  let query = supabaseAdmin
    .from("schedule_blackouts")
    .select("id, team_id, starts_at, ends_at, reason, created_by, created_at")
    .order("starts_at", { ascending: true });

  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
    query = query.gte("ends_at", `${from}T00:00:00+04:00`);
  } else {
    // Default: only future + currently-active blackouts
    query = query.gte("ends_at", new Date().toISOString());
  }

  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    query = query.lte("starts_at", `${to}T23:59:59+04:00`);
  }

  const { data, error } = await query.returns<BlackoutRow[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ blackouts: data ?? [] });
}

/**
 * POST /api/admin/schedule-blackouts
 * Body: { team_id?: string | null, starts_at: ISO, ends_at: ISO, reason: string }
 *
 * Creates a blackout. Returns 409 if confirmed bookings already occupy
 * the proposed range — admin must cancel/reschedule them first.
 */
export async function POST(request: NextRequest) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  let body: { team_id?: string | null; starts_at?: string; ends_at?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { team_id, starts_at, ends_at, reason } = body;

  if (!starts_at || !ends_at || !reason || typeof reason !== "string") {
    return NextResponse.json(
      { error: "starts_at, ends_at, and reason are required." },
      { status: 400 }
    );
  }

  const startsDate = new Date(starts_at);
  const endsDate = new Date(ends_at);
  if (isNaN(startsDate.getTime()) || isNaN(endsDate.getTime())) {
    return NextResponse.json({ error: "Invalid date format." }, { status: 400 });
  }
  if (endsDate <= startsDate) {
    return NextResponse.json({ error: "ends_at must be after starts_at." }, { status: 400 });
  }
  if (reason.length > 500) {
    return NextResponse.json({ error: "reason is too long (max 500 chars)." }, { status: 400 });
  }

  // Conflict check: confirmed bookings inside this window
  let conflictQuery = supabaseAdmin
    .from("bookings")
    .select("id, slot_start, slot_end, team_id, customers(name)")
    .lt("slot_start", endsDate.toISOString())
    .gt("slot_end", startsDate.toISOString())
    .in("status", ["pending", "confirmed"]);

  if (team_id) {
    conflictQuery = conflictQuery.eq("team_id", team_id);
  }

  const { data: conflicts, error: conflictError } = await conflictQuery.returns<
    {
      id: string;
      slot_start: string;
      slot_end: string;
      team_id: string | null;
      customers: { name: string } | null;
    }[]
  >();

  if (conflictError) {
    return NextResponse.json({ error: conflictError.message }, { status: 500 });
  }

  if (conflicts && conflicts.length > 0) {
    return NextResponse.json(
      {
        error: "Existing bookings conflict with this blackout window. Cancel or reschedule them first.",
        conflicts,
      },
      { status: 409 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("schedule_blackouts")
    .insert({
      team_id: team_id ?? null,
      starts_at: startsDate.toISOString(),
      ends_at: endsDate.toISOString(),
      reason: reason.trim(),
      created_by: request.headers.get("x-admin-email") ?? null,
    } as never)
    .select("id, team_id, starts_at, ends_at, reason, created_by, created_at")
    .returns<BlackoutRow[]>()
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to create blackout." },
      { status: 500 }
    );
  }

  return NextResponse.json({ blackout: data });
}
