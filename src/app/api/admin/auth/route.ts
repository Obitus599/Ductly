import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/client-ip";
import { requireSameOrigin } from "@/lib/admin-auth";
import { isAdminUser } from "@/lib/admin-identity";

/**
 * POST /api/admin/auth
 * Authenticates admin user via Supabase Auth (email/password).
 * Sets the auth session cookie for subsequent requests.
 */
export async function POST(request: NextRequest) {
  try {
    const csrfError = requireSameOrigin(request);
    if (csrfError) return csrfError;

    // Rate limit BEFORE doing any work: 5 attempts per 15 minutes per IP.
    // This is the credential-stuffing / brute-force gate.
    // fail-closed: if the limiter backend is down, a brute-forcer must not
    // get an unlimited-guess window against admin credentials.
    const clientIp = getClientIp(request);
    const rl = await checkRateLimit(`admin-auth:${clientIp}`, 5, 15 * 60 * 1000, {
      failClosed: true,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many sign-in attempts. Try again in 15 minutes." },
        { status: 429 }
      );
    }

    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 }
      );
    }

    // Authenticated is not authorized. Only hand out an admin cookie if
    // THIS user is actually an admin (role claim or ADMIN_EMAILS). A
    // self-registered customer signing in here must get 401, not a cookie
    // that every downstream gate then rejects.
    if (!isAdminUser(data.user)) {
      return NextResponse.json(
        { error: "This account is not authorized for the admin area." },
        { status: 403 }
      );
    }

    // Set auth token as httpOnly cookie
    const response = NextResponse.json({ success: true });

    response.cookies.set("admin-token", data.session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8, // 8 hours
    });

    response.cookies.set("admin-refresh", data.session.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch {
    return NextResponse.json(
      { error: "Authentication failed." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/auth
 * Logs out the admin user: REVOKES the session server-side, then clears the
 * cookies. Clearing cookies alone is cosmetic — the access token stays valid
 * until its natural expiry, and the refresh token could still mint new ones,
 * so a token captured before "logout" would keep working. Revoking the
 * refresh token at GoTrue actually ends the session.
 */
export async function DELETE(request: NextRequest) {
  const csrfError = requireSameOrigin(request);
  if (csrfError) return csrfError;

  const accessToken = request.cookies.get("admin-token")?.value;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (accessToken && supabaseUrl && anonKey) {
    // GoTrue /logout revokes the refresh token(s) for this session. Best
    // effort: even if it fails we still clear the cookies below.
    try {
      await fetch(`${supabaseUrl}/auth/v1/logout?scope=global`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, apikey: anonKey },
        signal: AbortSignal.timeout(5_000),
      });
    } catch (err) {
      console.error("Admin logout revocation failed:", err);
    }
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set("admin-token", "", { maxAge: 0, path: "/" });
  response.cookies.set("admin-refresh", "", { maxAge: 0, path: "/" });
  return response;
}
