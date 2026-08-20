import crypto from "crypto";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { vatFromNet, type VatBreakdown } from "@/lib/vat";

/**
 * Discount codes — single source of truth for the popup offer.
 *
 * Mirrors the pricing_config pattern: the admin edits one campaign rule
 * (discount_rules, id=1) and unique codes (discount_codes) are minted per
 * popup claim, snapshotting the percent at issue time.
 *
 * Money stays in integer fils everywhere. VAT is recomputed on the
 * DISCOUNTED net amount (the FTA taxable amount is the discounted price),
 * so the booking's financial snapshot and generated invoice stay correct
 * with no changes to invoice.ts.
 */

export const DISCOUNT_RULE_ID = 1;

/** Characters excluded: 0/O and 1/I are visually ambiguous. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 5;

export interface DiscountRule {
  id: number;
  discount_percent: number;
  active: boolean;
  expires_at: string | null;
  max_uses: number | null;
  used_count: number;
  updated_at: string | null;
}

export interface DiscountCodeRow {
  code: string;
  discount_percent: number;
  active: boolean;
  expires_at: string | null;
  max_uses: number | null;
  used_count: number;
  issued_to_email: string | null;
  issued_to_phone: string | null;
  created_at: string | null;
}

export interface DiscountedBreakdown extends VatBreakdown {
  /** The amount the customer saves (base net − discounted net), fils. */
  savingsFils: number;
  /** The discounted pre-tax net, fils. */
  discountedNetFils: number;
}

/** Normalize a user-entered code: trim + uppercase, `ductly-ab12cd` → `DUCTLY-AB12CD`. */
export function normalizeCode(raw: unknown): string {
  return String(raw ?? "").trim().toUpperCase();
}

/** Generate a unique-looking code, e.g. `DUCTLY-K3M9X` (no 0/O/1/I). */
export function generateUniqueCode(prefix = "DUCTLY"): string {
  const chars = crypto.randomBytes(CODE_LENGTH);
  let suffix = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    suffix += CODE_ALPHABET[chars[i] % CODE_ALPHABET.length];
  }
  return `${prefix}-${suffix}`;
}

/** Read the singleton campaign rule (discount_rules id=1). */
export async function getActiveRule(): Promise<DiscountRule | null> {
  const { data } = await supabaseAdmin
    .from("discount_rules")
    .select("*")
    .eq("id", DISCOUNT_RULE_ID)
    .returns<DiscountRule[]>()
    .maybeSingle();
  return data ?? null;
}

/** Read a single code row by its normalized code. */
export async function getDiscountCode(code: string): Promise<DiscountCodeRow | null> {
  const normalized = normalizeCode(code);
  if (!normalized) return null;
  const { data } = await supabaseAdmin
    .from("discount_codes")
    .select("*")
    .eq("code", normalized)
    .returns<DiscountCodeRow[]>()
    .maybeSingle();
  return data ?? null;
}

export interface CodeValidation {
  ok: boolean;
  reason?: "not_found" | "inactive" | "expired" | "usage_limit";
  percent?: number;
}

function isExpired(expiresAt: string | null): boolean {
  return Boolean(expiresAt && new Date(expiresAt).getTime() <= Date.now());
}

function underLimit(used: number, maxUses: number | null): boolean {
  return maxUses === null || used < maxUses;
}

/** Rule-level validity: used when minting new codes (the popup). */
export async function validateRuleForIssue(): Promise<CodeValidation> {
  const rule = await getActiveRule();
  if (!rule) return { ok: false, reason: "not_found" };
  if (!rule.active) return { ok: false, reason: "inactive" };
  if (isExpired(rule.expires_at)) return { ok: false, reason: "expired" };
  if (!underLimit(rule.used_count, rule.max_uses)) return { ok: false, reason: "usage_limit" };
  return { ok: true, percent: rule.discount_percent };
}

/** Code-level validity: used at checkout and by the validate preview endpoint. */
export async function validateCodeForUse(code: string): Promise<CodeValidation> {
  const row = await getDiscountCode(code);
  if (!row) return { ok: false, reason: "not_found" };
  if (!row.active) return { ok: false, reason: "inactive" };
  if (isExpired(row.expires_at)) return { ok: false, reason: "expired" };
  if (!underLimit(row.used_count, row.max_uses)) return { ok: false, reason: "usage_limit" };
  return { ok: true, percent: row.discount_percent };
}

/**
 * Apply a percent discount to a NET (VAT-exclusive) amount in fils.
 * VAT is recomputed on the discounted net per FTA rules.
 *
 * @param netFils   base pre-tax amount (e.g. plan rate × thermostats × 100)
 * @param percent   whole-number discount, 1–100
 */
export function applyDiscount(netFils: number, percent: number): DiscountedBreakdown {
  const base = Math.round(netFils);
  const pct = Math.max(1, Math.min(100, Math.round(percent)));
  const discountedNet = Math.round((base * (100 - pct)) / 100);
  const vat = vatFromNet(discountedNet);
  return {
    ...vat,
    discountedNetFils: discountedNet,
    savingsFils: base - discountedNet,
  };
}

/** Increment a code's used_count (called once a payment confirms). */
export async function bumpDiscountUsage(code: string): Promise<void> {
  const normalized = normalizeCode(code);
  if (!normalized) return;
  try {
    await (supabaseAdmin.rpc as Function)("increment_discount_usage", { p_code: normalized });
  } catch (err: unknown) {
    // Prefer an atomic RPC; fall back to read-modify-write if the RPC
    // hasn't been deployed yet.
    console.warn("increment_discount_usage RPC failed, using fallback:", err);
    const { data } = await supabaseAdmin
      .from("discount_codes")
      .select("used_count")
      .eq("code", normalized)
      .returns<{ used_count: number }[]>()
      .single();
    if (!data) return;
    const next = (data.used_count ?? 0) + 1;
    await supabaseAdmin
      .from("discount_codes")
      .update({ used_count: next } as never)
      .eq("code", normalized);
  }
}
