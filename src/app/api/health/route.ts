import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabase/admin";

/**
 * GET /api/health
 *
 * Returns service health status. Checks Supabase connectivity.
 */
export async function GET() {
  const checks: Record<string, "ok" | "error"> = {};

  // Check Supabase connection
  try {
    const { error } = await supabaseAdmin
      .from("teams")
      .select("id")
      .limit(1);
    checks.supabase = error ? "error" : "ok";
  } catch {
    checks.supabase = "error";
  }

  const allOk = Object.values(checks).every((v) => v === "ok");

  return NextResponse.json(
    { status: allOk ? "healthy" : "degraded", checks },
    { status: allOk ? 200 : 503 }
  );
}
