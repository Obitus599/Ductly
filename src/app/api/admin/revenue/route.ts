import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { requireAdmin } from "@/lib/admin-auth";

interface BookingRow {
  id: string;
  status: string;
  created_at: string;
  slot_start: string;
  payment_intent_id: string | null;
  customers: { name: string; email: string } | null;
}

/**
 * GET /api/admin/revenue?period=7|30|90|365
 *
 * Returns booking overview stats (counts, not AED amounts — revenue is in Stripe).
 * Bounded to 2000 rows to prevent serverless memory issues.
 */
export async function GET(request: NextRequest) {
  const authError = await requireAdmin(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const period = parseInt(searchParams.get("period") || "30");
  const days = [7, 30, 90, 365].includes(period) ? period : 30;

  const supabase = supabaseAdmin;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString();

  // Two parallel queries: summary data (bounded) + recent paid (small)
  const [summaryResult, recentResult] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, status, created_at")
      .gte("created_at", cutoffStr)
      .order("created_at", { ascending: false })
      .limit(2000)
      .returns<{ id: string; status: string; created_at: string }[]>(),

    supabase
      .from("bookings")
      .select("id, status, created_at, slot_start, payment_intent_id, customers(name, email)")
      .gte("created_at", cutoffStr)
      .in("status", ["confirmed", "completed"])
      .not("payment_intent_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(10)
      .returns<BookingRow[]>(),
  ]);

  if (summaryResult.error || recentResult.error) {
    const msg = summaryResult.error?.message || recentResult.error?.message || "Query failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const all = summaryResult.data ?? [];

  // Count by status
  const statusCounts: Record<string, number> = {};
  for (const b of all) {
    statusCounts[b.status] = (statusCounts[b.status] || 0) + 1;
  }

  const paidStatuses = ["confirmed", "completed"];
  const paidCount = all.filter((b) => paidStatuses.includes(b.status)).length;
  const cancelledCount = statusCounts["cancelled"] || 0;
  const failedCount = (statusCounts["payment_failed"] || 0) + (statusCounts["failed"] || 0);

  // Daily breakdown — bucket by UAE local date (UTC+4)
  const UAE_OFFSET_MS = 4 * 60 * 60 * 1000;
  const dailyMap = new Map<string, { total: number; paid: number; cancelled: number }>();
  for (const b of all) {
    // Shift to UAE time before extracting date to avoid off-by-one at day boundary
    const uaeDate = new Date(new Date(b.created_at).getTime() + UAE_OFFSET_MS);
    const day = uaeDate.toISOString().split("T")[0];
    const entry = dailyMap.get(day) || { total: 0, paid: 0, cancelled: 0 };
    entry.total++;
    if (paidStatuses.includes(b.status)) entry.paid++;
    if (b.status === "cancelled") entry.cancelled++;
    dailyMap.set(day, entry);
  }

  // Fill gaps in daily data (using UAE local dates)
  const daily: { date: string; total: number; paid: number; cancelled: number }[] = [];
  const todayUAE = new Date(Date.now() + UAE_OFFSET_MS);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(todayUAE);
    d.setDate(todayUAE.getDate() - i);
    const key = d.toISOString().split("T")[0];
    const entry = dailyMap.get(key) || { total: 0, paid: 0, cancelled: 0 };
    daily.push({ date: key, ...entry });
  }

  return NextResponse.json({
    period: days,
    summary: {
      total_bookings: all.length,
      paid_bookings: paidCount,
      cancelled: cancelledCount,
      failed: failedCount,
      status_counts: statusCounts,
    },
    daily,
    recent_paid: recentResult.data ?? [],
  });
}
