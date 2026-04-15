import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/admin/auth
 * Authenticates admin user via Supabase Auth (email/password).
 * Sets the auth session cookie for subsequent requests.
 */
export async function POST(request: NextRequest) {
  try {
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
 * Logs out the admin user by clearing auth cookies.
 */
export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set("admin-token", "", { maxAge: 0, path: "/" });
  response.cookies.set("admin-refresh", "", { maxAge: 0, path: "/" });
  return response;
}
