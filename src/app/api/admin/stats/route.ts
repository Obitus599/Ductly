import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  const supabase = supabaseAdmin;

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay()); // Sunday

  // Parallel queries
  const [
    { count: totalBookings },
    { count: todayBookings },
    { count: pendingBookings },
    { count: confirmedBookings },
    { data: teams },
    { data: workloads },
    { data: recentBookings },
  ] = await Promise.all([
    supabase
      .from("bookings")
      .select("*", { count: "exact", head: true }),
    supabase
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .gte("slot_start", todayStr + "T00:00:00")
      .lt("slot_start", todayStr + "T23:59:59"),
    supabase
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("status", "confirmed"),
    supabase
      .from("teams")
      .select("id, name, active")
      .returns<{ id: string; name: string; active: boolean }[]>(),
    supabase
      .from("team_workloads")
      .select("*")
      .returns<{ team_id: string; team_name: string; bookings_this_week: number; bookings_this_month: number }[]>(),
    supabase
      .from("bookings")
      .select("id, slot_start, slot_end, address, status, customer_id, team_id")
      .order("created_at", { ascending: false })
      .limit(10)
      .returns<{ id: string; slot_start: string; slot_end: string; address: string; status: string; customer_id: string; team_id: string | null }[]>(),
  ]);

  return NextResponse.json({
    stats: {
      total_bookings: totalBookings ?? 0,
      today_bookings: todayBookings ?? 0,
      pending: pendingBookings ?? 0,
      confirmed: confirmedBookings ?? 0,
      active_teams: teams?.filter((t) => t.active).length ?? 0,
      total_teams: teams?.length ?? 0,
    },
    workloads: workloads ?? [],
    recent_bookings: recentBookings ?? [],
  });
}
