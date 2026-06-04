import { supabaseAdmin } from "@/utils/supabase/admin";

/**
 * Persistent rate limiter backed by Supabase.
 *
 * Uses an atomic PostgreSQL function (check_rate_limit) that increments
 * a counter in a fixed-window table.
 *
 * On a backend error it fails OPEN (allows the request) but only opens a
 * short circuit-breaker window before re-probing — so a transient DB blip
 * can't PERMANENTLY disable every throttle until a process restart (the
 * old behaviour latched off forever). A healthy response closes the
 * breaker again.
 */

const CIRCUIT_OPEN_MS = 60_000;
let circuitOpenUntil = 0;

/**
 * Check if a request should be rate-limited.
 *
 * @param key - Unique identifier (e.g. "checkout:192.168.1.1")
 * @param limit - Max requests allowed in the window
 * @param windowMs - Time window in milliseconds
 * @returns { allowed: boolean }
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ allowed: boolean }> {
  // Circuit open after a recent failure — skip the DB until it cools down.
  if (circuitOpenUntil && Date.now() < circuitOpenUntil) {
    return { allowed: true };
  }

  const windowSecs = Math.floor(windowMs / 1000);

  try {
    const { data, error } = await (supabaseAdmin.rpc as Function)("check_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window_secs: windowSecs,
    });

    if (error) {
      // Allow rather than block everyone, but only suppress the DB for a
      // short window so we re-probe instead of latching off forever.
      console.warn("Rate limit DB unavailable, allowing request:", error.message);
      circuitOpenUntil = Date.now() + CIRCUIT_OPEN_MS;
      return { allowed: true };
    }

    circuitOpenUntil = 0; // healthy — close the breaker
    return { allowed: data as boolean };
  } catch (err) {
    console.warn("Rate limit check failed:", err);
    circuitOpenUntil = Date.now() + CIRCUIT_OPEN_MS;
    return { allowed: true };
  }
}
