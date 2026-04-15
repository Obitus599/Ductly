import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { requireAdmin } from "@/lib/admin-auth";

interface TeamRow {
  id: string;
  name: string;
  whatsapp_number: string | null;
  active: boolean;
  created_at: string;
}

interface ScheduleRow {
  id: string;
  team_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  active: boolean;
}

export async function GET(request: NextRequest) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  const supabase = supabaseAdmin;

  const [{ data: teams }, { data: schedules }, { data: workloads }] =
    await Promise.all([
      supabase
        .from("teams")
        .select("id, name, whatsapp_number, active, created_at")
        .order("name")
        .returns<TeamRow[]>(),
      supabase
        .from("team_schedules")
        .select("id, team_id, day_of_week, start_time, end_time, active")
        .returns<ScheduleRow[]>(),
      supabase
        .from("team_workloads")
        .select("*")
        .returns<{ team_id: string; team_name: string; bookings_this_week: number; bookings_this_month: number }[]>(),
    ]);

  // Merge schedules into teams
  const teamsWithDetails = (teams ?? []).map((team) => {
    const teamSchedules = (schedules ?? []).filter(
      (s) => s.team_id === team.id
    );
    const workload = (workloads ?? []).find((w) => w.team_id === team.id);
    return {
      ...team,
      schedules: teamSchedules,
      bookings_this_week: workload?.bookings_this_week ?? 0,
      bookings_this_month: workload?.bookings_this_month ?? 0,
    };
  });

  return NextResponse.json({ teams: teamsWithDetails });
}

/**
 * PATCH /api/admin/teams
 * Update team active status or whatsapp_number.
 * Body: { id: string, active?: boolean, whatsapp_number?: string, name?: string }
 */
export async function PATCH(request: NextRequest) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  const supabase = supabaseAdmin;
  const body = await request.json();
  const { id } = body;

  if (!id) {
    return NextResponse.json({ error: "Team id required." }, { status: 400 });
  }

  // Whitelist allowed fields
  const allowed: Record<string, unknown> = {};
  if (typeof body.active === "boolean") allowed.active = body.active;
  if (typeof body.name === "string") allowed.name = body.name;
  if (typeof body.whatsapp_number === "string") allowed.whatsapp_number = body.whatsapp_number;

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const { error } = await supabase
    .from("teams")
    .update(allowed as never)
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
