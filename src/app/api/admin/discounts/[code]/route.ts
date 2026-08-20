import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { requireAdmin, requireSameOrigin } from "@/lib/admin-auth";
import { normalizeCode, type DiscountCodeRow } from "@/lib/discounts";

/**
 * /api/admin/discounts/[code]
 *
 * Per-code operations:
 *   PATCH  → toggle active / update percent / expiry / max_uses
 *   POST   → body { action: "reset" } zeroes used_count
 *   DELETE → deactivate (soft)
 */

export async function PATCH(
  request: NextRequest,
  { params }: { params: { code: string } }
) {
  const csrfError = requireSameOrigin(request);
  if (csrfError) return csrfError;
  const authError = await requireAdmin(request);
  if (authError) return authError;

  let body: { active?: boolean; discount_percent?: number; expires_at?: string | null; max_uses?: number | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const code = normalizeCode(params.code);
  const patch: Record<string, unknown> = {};
  if (body.active !== undefined) patch.active = Boolean(body.active);
  if (body.discount_percent !== undefined) {
    patch.discount_percent = Math.max(1, Math.min(100, Math.floor(Number(body.discount_percent) || 1)));
  }
  if (body.expires_at !== undefined) patch.expires_at = body.expires_at || null;
  if (body.max_uses !== undefined) {
    patch.max_uses =
      body.max_uses === null || Number(body.max_uses) <= 0 ? null : Math.floor(Number(body.max_uses));
  }

  const { data, error } = await supabaseAdmin
    .from("discount_codes")
    .update(patch as never)
    .eq("code", code)
    .select("*")
    .returns<DiscountCodeRow[]>()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ code: data ?? null });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { code: string } }
) {
  const csrfError = requireSameOrigin(request);
  if (csrfError) return csrfError;
  const authError = await requireAdmin(request);
  if (authError) return authError;

  let body: { action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const code = normalizeCode(params.code);
  if (body.action !== "reset") {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("discount_codes")
    .update({ used_count: 0 } as never)
    .eq("code", code);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { code: string } }
) {
  const csrfError = requireSameOrigin(request);
  if (csrfError) return csrfError;
  const authError = await requireAdmin(request);
  if (authError) return authError;

  const code = normalizeCode(params.code);
  // Soft-delete: deactivate so issued codes stop working but history stays.
  const { error } = await supabaseAdmin
    .from("discount_codes")
    .update({ active: false } as never)
    .eq("code", code);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
