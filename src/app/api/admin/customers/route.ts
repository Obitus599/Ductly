import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { requireAdmin } from "@/lib/admin-auth";

/**
 * GET /api/admin/customers?search=&page=1
 * List customers with search and pagination.
 */
export async function GET(request: NextRequest) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  const supabase = supabaseAdmin;
  const { searchParams } = new URL(request.url);

  const search = searchParams.get("search")?.trim() || "";
  const page = parseInt(searchParams.get("page") || "1");
  const limit = 20;
  const offset = (page - 1) * limit;

  let query = supabase
    .from("customers")
    .select("id, name, phone, email, whatsapp_opt_in, last_booking, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
  }

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch booking counts per customer
  const customerIds = (data ?? []).map((c: { id: string }) => c.id);
  let bookingCounts: Record<string, number> = {};

  if (customerIds.length > 0) {
    const { data: bookings } = await supabase
      .from("bookings")
      .select("customer_id")
      .in("customer_id", customerIds);

    if (bookings) {
      for (const b of bookings as { customer_id: string }[]) {
        bookingCounts[b.customer_id] = (bookingCounts[b.customer_id] ?? 0) + 1;
      }
    }
  }

  const customers = (data ?? []).map((c: { id: string; name: string; phone: string; email: string; whatsapp_opt_in: boolean; last_booking: string | null; created_at: string }) => ({
    ...c,
    booking_count: bookingCounts[c.id] ?? 0,
  }));

  return NextResponse.json({
    customers,
    total: count ?? 0,
    page,
    pages: Math.ceil((count ?? 0) / limit),
  });
}
