import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { requireAdmin, requireSameOrigin } from "@/lib/admin-auth";
import {
  DISCOUNT_RULE_ID,
  generateUniqueCode,
  type DiscountRule,
  type DiscountCodeRow,
} from "@/lib/discounts";

/**
 * /api/admin/discounts
 *
 * Admin discount-code generator, mirroring the pricing-config pattern:
 *   GET                → campaign rule + all minted codes
 *   PATCH              → update the campaign rule (percent/active/expiry/max uses)
 *   POST /generate     → mint a new unique code at the rule's percent
 * Individual-code ops live in /api/admin/discounts/[code]:
 *   PATCH              → toggle/update a code
 *   POST (reset)       → zero a code's used_count
 *   DELETE             → deactivate a code (soft)
 */

const clampInt = (v: unknown, min: number, max: number): number =>
  Math.max(min, Math.min(max, Math.floor(Number(v) || min)));

export async function GET(request: NextRequest) {
  const authError = await requireAdmin(request);
  if (authError) return authError;

  const [ruleRes, codesRes] = await Promise.all([
    supabaseAdmin
      .from("discount_rules")
      .select("*")
      .eq("id", DISCOUNT_RULE_ID)
      .returns<DiscountRule[]>()
      .maybeSingle(),
    supabaseAdmin
      .from("discount_codes")
      .select("*")
      .order("created_at", { ascending: false })
      .returns<DiscountCodeRow[]>(),
  ]);

  return NextResponse.json({ rule: ruleRes.data ?? null, codes: codesRes.data ?? [] });
}

export async function PATCH(request: NextRequest) {
  const csrfError = requireSameOrigin(request);
  if (csrfError) return csrfError;
  const authError = await requireAdmin(request);
  if (authError) return authError;

  let body: {
    discount_percent?: number;
    active?: boolean;
    expires_at?: string | null;
    max_uses?: number | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.discount_percent !== undefined) {
    patch.discount_percent = clampInt(body.discount_percent, 1, 100);
  }
  if (body.active !== undefined) patch.active = Boolean(body.active);
  if (body.expires_at !== undefined) patch.expires_at = body.expires_at || null;
  if (body.max_uses !== undefined) {
    patch.max_uses =
      body.max_uses === null || Number(body.max_uses) <= 0 ? null : Math.floor(Number(body.max_uses));
  }

  const { data, error } = await supabaseAdmin
    .from("discount_rules")
    .update(patch as never)
    .eq("id", DISCOUNT_RULE_ID)
    .select("*")
    .returns<DiscountRule[]>()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rule: data ?? null });
}

/** POST /api/admin/discounts/generate — mint a code at the rule's percent. */
export async function POST(request: NextRequest) {
  const csrfError = requireSameOrigin(request);
  if (csrfError) return csrfError;
  const authError = await requireAdmin(request);
  if (authError) return authError;

  const { data: rule } = await supabaseAdmin
    .from("discount_rules")
    .select("discount_percent, active")
    .eq("id", DISCOUNT_RULE_ID)
    .returns<{ discount_percent: number; active: boolean }[]>()
    .maybeSingle();

  if (!rule || !rule.active) {
    return NextResponse.json({ error: "Campaign rule is inactive." }, { status: 400 });
  }

  const code = generateUniqueCode();
  const { error } = await supabaseAdmin
    .from("discount_codes")
    .insert({ code, discount_percent: rule.discount_percent } as never);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: row } = await supabaseAdmin
    .from("discount_codes")
    .select("*")
    .eq("code", code)
    .returns<DiscountCodeRow[]>()
    .single();
  return NextResponse.json({ code: row ?? null });
}
