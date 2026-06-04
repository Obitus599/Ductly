import crypto from "crypto";
import { supabaseAdmin } from "@/utils/supabase/admin";

/**
 * Customer contact verification (#7) — OTP codes for email + phone on
 * the public booking page.
 *
 * Codes are 6-digit, stored HASHED (HMAC-SHA256 with VERIFY_CODE_SECRET),
 * single-use, expiring in CODE_TTL_MINUTES with a per-code attempt cap.
 * A successfully verified contact stays "verified" for the checkout gate
 * for VERIFIED_VALID_MINUTES — long enough to finish paying.
 */
export const CODE_TTL_MINUTES = 10;
export const MAX_ATTEMPTS = 5;
export const VERIFIED_VALID_MINUTES = 30;
/**
 * Per-identifier brute-force cap that survives code re-issue. The
 * per-code MAX_ATTEMPTS alone is defeated by requesting a fresh code
 * (which would reset the counter), so we also bound the TOTAL failed
 * guesses across all codes for an identifier within a rolling window.
 */
export const MAX_IDENTIFIER_ATTEMPTS = 10;
export const LOCKOUT_WINDOW_MINUTES = 30;

export type VerifyChannel = "email" | "sms";

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "no_code" | "expired" | "too_many_attempts" | "mismatch" };

function pepper(): string {
  return process.env.VERIFY_CODE_SECRET || "";
}

/** True when the code-hashing secret is configured. */
export function verificationConfigured(): boolean {
  return Boolean(process.env.VERIFY_CODE_SECRET);
}

/** Normalize an identifier: lowercase email; digits-and-plus for phone. */
export function normalizeIdentifier(channel: VerifyChannel, raw: string): string {
  if (channel === "email") return raw.trim().toLowerCase();
  return raw.replace(/[^0-9+]/g, "");
}

/** Cryptographically-random zero-padded 6-digit code. */
export function generateCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashCode(code: string): string {
  return crypto.createHmac("sha256", pepper()).update(code).digest("hex");
}

/**
 * Generate a code, store its hash, and return the plaintext code for the
 * caller to deliver. Any prior unconsumed code for the same
 * identifier+channel is dropped so only the newest is valid.
 */
export async function createAndStoreCode(
  channel: VerifyChannel,
  identifier: string
): Promise<string> {
  const code = generateCode();
  const codeHash = hashCode(code);
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString();

  // Drop only STALE codes (outside the lockout window). Recent codes are
  // intentionally kept so their failed-attempt counts still bound
  // re-issue — verifyCode sums them. Only the newest unconsumed code is
  // ever matchable, so lingering old codes can't be guessed.
  const staleCutoff = new Date(Date.now() - LOCKOUT_WINDOW_MINUTES * 60_000).toISOString();
  await supabaseAdmin
    .from("verification_codes")
    .delete()
    .eq("identifier", identifier)
    .eq("channel", channel)
    .lt("created_at", staleCutoff);

  await supabaseAdmin.from("verification_codes").insert({
    identifier,
    channel,
    code_hash: codeHash,
    expires_at: expiresAt,
    attempts: 0,
  } as never);

  return code;
}

/**
 * Verify a submitted code against the newest unconsumed code for this
 * identifier+channel. On success the code is consumed (single-use); on a
 * wrong guess the attempt counter is incremented.
 */
export async function verifyCode(
  channel: VerifyChannel,
  identifier: string,
  code: string
): Promise<VerifyResult> {
  // Per-identifier lockout that survives code re-issue: sum failed
  // attempts across every code for this identifier+channel in the
  // window. Re-sending a code no longer hands out a fresh guess budget.
  const lockoutSince = new Date(Date.now() - LOCKOUT_WINDOW_MINUTES * 60_000).toISOString();
  const { data: recentCodes } = await supabaseAdmin
    .from("verification_codes")
    .select("attempts")
    .eq("identifier", identifier)
    .eq("channel", channel)
    .gte("created_at", lockoutSince)
    .returns<{ attempts: number }[]>();
  const totalFails = (recentCodes || []).reduce((sum, r) => sum + (r.attempts || 0), 0);
  if (totalFails >= MAX_IDENTIFIER_ATTEMPTS) {
    return { ok: false, reason: "too_many_attempts" };
  }

  const { data: row } = await supabaseAdmin
    .from("verification_codes")
    .select("id, code_hash, expires_at, attempts, consumed_at")
    .eq("identifier", identifier)
    .eq("channel", channel)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .returns<
      {
        id: string;
        code_hash: string;
        expires_at: string;
        attempts: number;
        consumed_at: string | null;
      }[]
    >()
    .maybeSingle();

  if (!row) return { ok: false, reason: "no_code" };
  if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, reason: "expired" };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, reason: "too_many_attempts" };

  const expected = hashCode(code);
  const match =
    expected.length === row.code_hash.length &&
    crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(row.code_hash, "hex"));

  if (!match) {
    await supabaseAdmin
      .from("verification_codes")
      .update({ attempts: row.attempts + 1 } as never)
      .eq("id", row.id);
    return { ok: false, reason: "mismatch" };
  }

  await supabaseAdmin
    .from("verification_codes")
    .update({ consumed_at: new Date().toISOString() } as never)
    .eq("id", row.id);

  return { ok: true };
}

/**
 * Checkout gate: has this contact been verified within the validity
 * window? True iff a consumed code exists for it in the last
 * VERIFIED_VALID_MINUTES.
 */
export async function isContactVerified(
  channel: VerifyChannel,
  identifier: string
): Promise<boolean> {
  const since = new Date(Date.now() - VERIFIED_VALID_MINUTES * 60_000).toISOString();
  const { data } = await supabaseAdmin
    .from("verification_codes")
    .select("id")
    .eq("identifier", identifier)
    .eq("channel", channel)
    .gte("consumed_at", since)
    .limit(1)
    .returns<{ id: string }[]>()
    .maybeSingle();
  return Boolean(data);
}
