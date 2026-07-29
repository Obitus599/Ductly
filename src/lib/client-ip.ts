import type { NextRequest } from "next/server";

/**
 * Trusted client IP for rate-limit keys.
 *
 * `X-Forwarded-For` is caller-controlled. Every proxy in the chain
 * APPENDS the peer it saw, so the list reads
 * `<client-supplied junk>, <what proxy 1 saw>, <what proxy 2 saw>` — the
 * LEFTMOST entry is whatever the attacker typed. Reading `[0]` therefore
 * let one attacker mint an unlimited number of distinct rate-limit keys
 * and walk past every throttle in the app, admin-login brute force
 * included.
 *
 * We instead count back from the RIGHT. With `TRUSTED_PROXY_HOPS = n`,
 * the client address is the n-th entry from the end: the value appended
 * by our own outermost trusted proxy, which a client cannot forge.
 * n defaults to 1 (a single reverse proxy, e.g. nginx/Plesk in front of
 * `next start`). Raise it if you add a CDN in front.
 *
 * When no forwarding headers are present at all (direct connection, or
 * tests) we fall back to `x-real-ip` and finally the literal "unknown" —
 * matching the previous behaviour so a missing header can't accidentally
 * disable throttling for everyone by collapsing to one shared key.
 */
export function trustedProxyHops(): number {
  const raw = Number(process.env.TRUSTED_PROXY_HOPS);
  if (!Number.isFinite(raw) || raw < 1) return 1;
  return Math.floor(raw);
}

export function getClientIp(request: NextRequest | Request): string {
  const headers = request.headers;
  const forwarded = headers.get("x-forwarded-for");

  if (forwarded) {
    const chain = forwarded
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (chain.length > 0) {
      // n-th from the end; clamp to the leftmost entry when the chain is
      // shorter than the configured hop count (misconfigured proxy depth
      // should degrade to "as strict as possible", not throw).
      const idx = Math.max(0, chain.length - trustedProxyHops());
      const ip = chain[idx];
      if (ip) return ip;
    }
  }

  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  return "unknown";
}
