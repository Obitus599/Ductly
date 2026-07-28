import crypto from "crypto";
import { supabaseAdmin } from "@/utils/supabase/admin";

/**
 * Persistent rate limiter backed by Supabase.
 *
 * Uses an atomic PostgreSQL function (check_rate_limit) that increments
 * a counter in a fixed-window table.
 *
 * On a CONNECTION-level failure (thrown network error/timeout) it fails
 * OPEN for a short circuit-breaker window before re-probing, so a
 * transient DB blip can't permanently disable every throttle. A per-key
 * DATA error (e.g. one oversized key) does NOT open the breaker — it fails
 * only that single check, so an attacker can't poison one key to switch
 * off throttling for everyone.
 */

const CIRCUIT_OPEN_MS = 60_000;
let circuitOpenUntil = 0;

// Postgres btree keys must stay well under the ~2704-byte index limit, and
// the key is otherwise attacker-influenced (it embeds the raw email/phone
// on the verify path). Bounding it here means no caller can craft a key
// that overflows the rate_limits primary key and errors the insert.
const MAX_KEY_LEN = 200;

/**
 * Bound a rate-limit key to a safe, non-overflowing length while keeping a
 * readable prefix. Over-length keys keep their first 120 chars plus a hash
 * of the whole, so distinct long keys stay distinct.
 */
export function safeRateLimitKey(key: string): string {
  if (key.length <= MAX_KEY_LEN) return key;
  const digest = crypto.createHash("sha256").update(key).digest("hex").slice(0, 32);
  return `${key.slice(0, 120)}:${digest}`;
}

export interface RateLimitOptions {
  /**
   * Deny instead of allowing when the limiter backend is unavailable.
   *
   * Use for gates where an outage would otherwise hand an attacker an
   * unlimited-guess window — admin sign-in above all. For ordinary
   * customer-facing endpoints keep the default (fail open): a DB blip
   * shouldn't take the whole booking flow down.
   */
  failClosed?: boolean;
}

/**
 * Check if a request should be rate-limited.
 *
 * @param key - Unique identifier (e.g. "checkout:192.168.1.1")
 * @param limit - Max requests allowed in the window
 * @param windowMs - Time window in milliseconds
 * @param options - see RateLimitOptions
 * @returns { allowed: boolean }
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  options: RateLimitOptions = {}
): Promise<{ allowed: boolean }> {
  const onFailure = { allowed: !options.failClosed };

  // Circuit open after a recent failure — skip the DB until it cools down.
  // A fail-closed caller still gets a real check attempt every time; it
  // must never be silently short-circuited into "allowed".
  if (!options.failClosed && circuitOpenUntil && Date.now() < circuitOpenUntil) {
    return { allowed: true };
  }

  const windowSecs = Math.floor(windowMs / 1000);

  try {
    const { data, error } = await (supabaseAdmin.rpc as Function)("check_rate_limit", {
      p_key: safeRateLimitKey(key),
      p_limit: limit,
      p_window_secs: windowSecs,
    });

    if (error) {
      // A returned error is a per-request DATA problem, not proof the DB is
      // down. Fail only THIS check and leave the breaker CLOSED — otherwise
      // one poisoned key would disable throttling process-wide.
      console.warn("Rate limit query error (breaker stays closed):", error.message);
      return onFailure;
    }

    circuitOpenUntil = 0; // healthy — close the breaker
    return { allowed: data as boolean };
  } catch (err) {
    // A THROWN error is connection-level (network/timeout). Open the
    // breaker briefly so we don't hammer a genuinely-down DB.
    console.warn("Rate limit check failed (connection):", err);
    circuitOpenUntil = Date.now() + CIRCUIT_OPEN_MS;
    return onFailure;
  }
}
