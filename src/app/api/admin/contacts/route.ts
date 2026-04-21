import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { requireAdmin } from "@/lib/admin-auth";

/**
 * GET /api/admin/contacts?page=1&tab=submissions|newsletter
 * View contact form submissions and newsletter subscribers.
 */
export async function GET(request: NextRequest) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  const supabase = supabaseAdmin;
  const { searchParams } = new URL(request.url);

  const tab = searchParams.get("tab") || "submissions";
  const page = parseInt(searchParams.get("page") || "1");
  const limit = 20;
  const offset = (page - 1) * limit;

  if (tab === "newsletter") {
    const { data, count, error } = await supabase
      .from("newsletter_subscribers")
      .select("id, email, subscribed_at", { count: "exact" })
      .order("subscribed_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      subscribers: data ?? [],
      total: count ?? 0,
      page,
      pages: Math.ceil((count ?? 0) / limit),
    });
  }

  // Default: contact submissions
  const { data, count, error } = await supabase
    .from("contact_submissions")
    .select("id, name, email, phone, message, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    submissions: data ?? [],
    total: count ?? 0,
    page,
    pages: Math.ceil((count ?? 0) / limit),
  });
}
