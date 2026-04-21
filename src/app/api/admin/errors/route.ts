import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { requireAdmin } from "@/lib/admin-auth";

/**
 * GET /api/admin/errors?page=1&flow=
 * View error log entries.
 */
export async function GET(request: NextRequest) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  const supabase = supabaseAdmin;
  const { searchParams } = new URL(request.url);

  const flow = searchParams.get("flow")?.trim() || "";
  const page = parseInt(searchParams.get("page") || "1");
  const limit = 30;
  const offset = (page - 1) * limit;

  let query = supabase
    .from("error_log")
    .select("id, flow_name, error_message, payload, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (flow) {
    query = query.eq("flow_name", flow);
  }

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get distinct flow names for filter dropdown
  const { data: flows } = await supabase
    .from("error_log")
    .select("flow_name")
    .order("flow_name");

  const uniqueFlows = Array.from(new Set((flows ?? []).map((f: { flow_name: string }) => f.flow_name)));

  return NextResponse.json({
    errors: data ?? [],
    flows: uniqueFlows,
    total: count ?? 0,
    page,
    pages: Math.ceil((count ?? 0) / limit),
  });
}
