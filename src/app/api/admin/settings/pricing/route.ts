import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { requireAdmin, requireSameOrigin } from "@/lib/admin-auth";
import { clearPricingCache } from "@/lib/pricing";

interface PricingRow {
  plan_key: string;
  rate: number;
}

/**
 * GET /api/admin/settings/pricing
 * Returns current pricing config from DB.
 */
export async function GET(request: NextRequest) {
  const authError = await requireAdmin(request);
  if (authError) return authError;

  const { data, error } = await supabaseAdmin
    .from("pricing_config")
    .select("plan_key, rate")
    .order("plan_key")
    .returns<PricingRow[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ pricing: data ?? [] });
}

/**
 * PATCH /api/admin/settings/pricing
 * Body: { rates: { essential?: number, signature?: number, elite?: number } }
 * Updates the rate for one or more plans and busts the in-memory cache.
 */
export async function PATCH(request: NextRequest) {
  const csrfError = requireSameOrigin(request);
  if (csrfError) return csrfError;
  const authError = await requireAdmin(request);
  if (authError) return authError;

  let body: { rates?: Record<string, number> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.rates || typeof body.rates !== "object") {
    return NextResponse.json({ error: "rates object is required." }, { status: 400 });
  }

  const allowedPlans = ["essential", "signature", "elite"];
  const updated: PricingRow[] = [];

  for (const [key, rate] of Object.entries(body.rates)) {
    if (!allowedPlans.includes(key)) continue;
    const rateNum = Math.max(1, Math.min(100000, Math.floor(Number(rate) || 1)));

    const { data, error } = await supabaseAdmin
      .from("pricing_config")
      .upsert({ plan_key: key, rate: rateNum, updated_at: new Date().toISOString() } as never, { onConflict: "plan_key" })
      .select("plan_key, rate")
      .returns<PricingRow[]>()
      .single();

    if (!error && data) {
      updated.push(data);
    }
  }

  clearPricingCache();

  return NextResponse.json({ pricing: updated });
}
