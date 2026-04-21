import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { requireAdmin } from "@/lib/admin-auth";

/**
 * GET /api/admin/feedback?page=1&team_id=&min_rating=
 * View feedback entries with team and customer info.
 */
export async function GET(request: NextRequest) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  const supabase = supabaseAdmin;
  const { searchParams } = new URL(request.url);

  const teamFilter = searchParams.get("team_id") || "";
  const minRating = parseInt(searchParams.get("min_rating") || "0");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = 20;
  const offset = (page - 1) * limit;

  let query = supabase
    .from("feedback")
    .select("id, booking_id, customer_id, rating, comment, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (minRating > 0) {
    query = query.gte("rating", minRating);
  }

  const { data: feedbackRows, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Enrich with customer names and team info via bookings
  const bookingIds = Array.from(new Set((feedbackRows ?? []).map((f: { booking_id: string }) => f.booking_id)));
  const customerIds = Array.from(new Set((feedbackRows ?? []).map((f: { customer_id: string }) => f.customer_id)));

  const [{ data: bookings }, { data: customers }] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, team_id, address, slot_start")
      .in("id", bookingIds.length > 0 ? bookingIds : ["__none__"]),
    supabase
      .from("customers")
      .select("id, name, email")
      .in("id", customerIds.length > 0 ? customerIds : ["__none__"]),
  ]);

  const bookingMap = Object.fromEntries((bookings ?? []).map((b: { id: string; team_id: string | null; address: string; slot_start: string }) => [b.id, b]));
  const customerMap = Object.fromEntries((customers ?? []).map((c: { id: string; name: string; email: string }) => [c.id, c]));

  // Get team names
  const teamIds = Array.from(new Set((bookings ?? []).map((b: { team_id: string | null }) => b.team_id).filter(Boolean)));
  let teamMap: Record<string, string> = {};
  if (teamIds.length > 0) {
    const { data: teams } = await supabase
      .from("teams")
      .select("id, name")
      .in("id", teamIds as string[]);
    teamMap = Object.fromEntries((teams ?? []).map((t: { id: string; name: string }) => [t.id, t.name]));
  }

  const feedback = (feedbackRows ?? []).map((f: { id: string; booking_id: string; customer_id: string; rating: number; comment: string | null; created_at: string }) => {
    const booking = bookingMap[f.booking_id];
    const customer = customerMap[f.customer_id];
    return {
      ...f,
      customer_name: customer?.name ?? "Unknown",
      customer_email: customer?.email ?? "",
      team_id: booking?.team_id ?? null,
      team_name: booking?.team_id ? (teamMap[booking.team_id] ?? "Unknown") : "Unassigned",
      address: booking?.address ?? "",
      slot_start: booking?.slot_start ?? "",
    };
  });

  // Filter by team after enrichment (since feedback table doesn't have team_id)
  const filtered = teamFilter
    ? feedback.filter((f: { team_id: string | null }) => f.team_id === teamFilter)
    : feedback;

  // Summary stats
  const { data: summary } = await supabase
    .from("feedback_summary")
    .select("team_id, team_name, avg_rating, review_count")
    .order("team_name");

  // Get all teams for filter dropdown
  const { data: allTeams } = await supabase
    .from("teams")
    .select("id, name")
    .eq("active", true)
    .order("name");

  return NextResponse.json({
    feedback: filtered,
    summary: summary ?? [],
    teams: allTeams ?? [],
    total: teamFilter ? filtered.length : (count ?? 0),
    page,
    pages: teamFilter ? 1 : Math.ceil((count ?? 0) / limit),
  });
}
