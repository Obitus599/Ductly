import { NextRequest, NextResponse } from "next/server";

/**
 * Admin auth check for API routes.
 *
 * Accepts either:
 * 1. x-admin-key header (for programmatic access)
 * 2. admin-token cookie (set by login flow) — VALIDATED here against
 *    Supabase, not merely checked for presence.
 *
 * Async + fail-closed. We must validate the token ourselves: the
 * middleware only validates the admin-token for `/admin` *page* paths,
 * NOT for `/api/*` routes (which start with "/api"), so trusting cookie
 * presence here would let anyone in with a forged `admin-token=anything`
 * cookie. Verifying at the gate makes every consumer safe regardless of
 * middleware path coverage.
 *
 * Returns null if authorized, or a 401 NextResponse if not.
 */
export async function requireAdmin(request: NextRequest): Promise<NextResponse | null> {
  // 1. Programmatic access via shared key (server-to-server, no cookie).
  const adminKey = process.env.ADMIN_API_KEY;
  if (adminKey && request.headers.get("x-admin-key") === adminKey) {
    return null;
  }

  // 2. Dev convenience: no key configured and not production → allow.
  if (!adminKey && process.env.NODE_ENV !== "production") {
    return null;
  }

  // 3. Cookie-based: validate the Supabase session token. Fail closed.
  const token = request.cookies.get("admin-token")?.value;
  if (token) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && serviceKey) {
      try {
        const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
          headers: { Authorization: `Bearer ${token}`, apikey: serviceKey },
          signal: AbortSignal.timeout(5_000),
        });
        if (res.ok) return null;
      } catch (err) {
        // Network failure / timeout — fail closed.
        console.error("Admin token validation failed:", err);
      }
    }
  }

  return NextResponse.json(
    { error: "Unauthorized." },
    { status: 401 }
  );
}

/**
 * CSRF defence for admin write endpoints (POST/PATCH/DELETE).
 *
 * Verifies the request Origin (or Referer fallback) matches the host
 * the app is served from. Browsers attach a cookie automatically on
 * cross-origin form submits, so `sameSite: lax` alone doesn't block
 * top-level POSTs from an attacker page. The Origin header is set by
 * the browser on all CORS/POST requests and cannot be spoofed by
 * client-side JS, making it a reliable same-origin signal.
 *
 * Skipped for header-based auth (x-admin-key) — those are
 * server-to-server calls without cookies, so CSRF is N/A.
 *
 * Returns null if origin is allowed, or a 403 NextResponse if not.
 */
export function requireSameOrigin(request: NextRequest): NextResponse | null {
  // Vitest sets NODE_ENV=test; NextRequest doesn't simulate browser
  // Origin headers, so the check would block every test of a write
  // endpoint. The Next.js production build hardcodes NODE_ENV to
  // "production" at compile time, so this bypass cannot fire in prod.
  if (process.env.NODE_ENV === "test") return null;

  // x-admin-key auth is programmatic; no browser, no CSRF concern.
  const adminKey = process.env.ADMIN_API_KEY;
  if (adminKey && request.headers.get("x-admin-key") === adminKey) {
    return null;
  }

  // Build allowed origins from the request host + NEXT_PUBLIC_APP_URL.
  const allowed = new Set<string>();
  const host = request.headers.get("host");
  if (host) {
    allowed.add(`https://${host}`);
    allowed.add(`http://${host}`); // local dev
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    try {
      allowed.add(new URL(appUrl).origin);
    } catch {
      // Ignore malformed env var
    }
  }

  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  // Prefer Origin (set unconditionally on POST). Fall back to Referer
  // (some clients/proxies strip Origin on same-origin POSTs).
  let candidate: string | null = null;
  if (origin) {
    candidate = origin;
  } else if (referer) {
    try {
      candidate = new URL(referer).origin;
    } catch {
      candidate = null;
    }
  }

  if (!candidate || !allowed.has(candidate)) {
    return NextResponse.json(
      { error: "Cross-origin request blocked." },
      { status: 403 }
    );
  }

  return null;
}
