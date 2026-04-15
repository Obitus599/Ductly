import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { requireAdmin } from "@/lib/admin-auth";

interface BookingRow {
  id: string;
  slot_start: string;
  slot_end: string;
  address: string;
  status: string;
  payment_intent_id: string | null;
  created_at: string;
  customer_id: string;
  team_id: string | null;
}

export async function GET(request: NextRequest) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  const supabase = supabaseAdmin;
  const { searchParams } = new URL(request.url);

  const status = searchParams.get("status");
  const date = searchParams.get("date");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = 20;
  const offset = (page - 1) * limit;

  let query = supabase
    .from("bookings")
    .select("id, slot_start, slot_end, address, status, payment_intent_id, created_at, customer_id, team_id", { count: "exact" })
    .order("slot_start", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq("status", status);
  }
  if (date) {
    query = query
      .gte("slot_start", date + "T00:00:00")
      .lt("slot_start", date + "T23:59:59");
  }

  const { data, count, error } = await query.returns<BookingRow[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    bookings: data ?? [],
    total: count ?? 0,
    page,
    pages: Math.ceil((count ?? 0) / limit),
  });
}
