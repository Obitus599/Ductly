import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import { UAE_TZ_SUFFIX } from "@/lib/slot-helpers";

interface CalendarBooking {
  id: string;
  slot_start: string;
  slot_end: string;
  address: string;
  status: string;
  team_id: string | null;
  customers: { name: string; phone: string } | null;
}

interface Team {
  id: string;
  name: string;
  active: boolean;
}

/**
 * GET /api/admin/calendar?date=YYYY-MM-DD
 *
 * Returns all bookings for a given date grouped by team, plus team list.
 * Used by the admin calendar/timeline view.
 */
export async function GET(request: NextRequest) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "Missing or invalid date parameter. Use YYYY-MM-DD." },
      { status: 400 }
    );
  }
  // Reject impossible calendar dates (e.g. 2026-02-30)
  const parsedDate = new Date(date + "T12:00:00" + UAE_TZ_SUFFIX);
  if (isNaN(parsedDate.getTime())) {
    return NextResponse.json(
      { error: "Invalid calendar date." },
      { status: 400 }
    );
  }

  const supabase = supabaseAdmin;

  const [{ data: bookings, error: bookingsError }, { data: teams, error: teamsError }] =
    await Promise.all([
      supabase
        .from("bookings")
        .select("id, slot_start, slot_end, address, status, team_id, customers(name, phone)")
        .gte("slot_start", date + "T00:00:00" + UAE_TZ_SUFFIX)
        .lte("slot_start", date + "T23:59:59" + UAE_TZ_SUFFIX)
        .in("status", ["pending", "confirmed", "completed", "no_show"])
        .order("slot_start", { ascending: true })
        .returns<CalendarBooking[]>(),
      supabase
        .from("teams")
        .select("id, name, active")
        .eq("active", true)
        .order("name")
        .returns<Team[]>(),
    ]);

  if (bookingsError || teamsError) {
    return NextResponse.json(
      { error: bookingsError?.message || teamsError?.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    date,
    teams: teams ?? [],
    bookings: bookings ?? [],
  });
}
