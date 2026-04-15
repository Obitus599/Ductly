import { supabaseAdmin } from "@/utils/supabase/admin";

/**
 * Persistent rate limiter backed by Supabase.
 *
 * Uses an atomic PostgreSQL function (check_rate_limit) that increments
 * a counter in a fixed-window table. Works correctly on Vercel serverless
 * where in-memory state is lost between invocations.
 *
 * Falls back to a permissive pass-through if the DB function hasn't been
 * created yet (logs a warning on first failure, then suppresses).
 */

let dbAvailable = true;

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
  if (!dbAvailable) {
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
      // If the function doesn't exist yet, disable DB rate limiting
      // and allow all requests rather than blocking everyone.
      console.warn("Rate limit DB unavailable, allowing request:", error.message);
      dbAvailable = false;
      return { allowed: true };
    }

    return { allowed: data as boolean };
  } catch (err) {
    console.warn("Rate limit check failed:", err);
    return { allowed: true };
  }
}
