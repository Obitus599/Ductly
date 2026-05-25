import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect admin routes (except login page and auth API)
  if (
    pathname.startsWith("/admin") &&
    !pathname.startsWith("/admin/login") &&
    !pathname.startsWith("/api/admin/auth")
  ) {
    const token = request.cookies.get("admin-token")?.value;

    if (!token) {
      // In development without ADMIN_API_KEY, skip auth
      if (!process.env.ADMIN_API_KEY && process.env.NODE_ENV !== "production") {
        return await updateSession(request);
      }
      const loginUrl = new URL("/admin/login", request.url);
      return NextResponse.redirect(loginUrl);
    }

    // Verify token is valid by checking with Supabase. We deliberately
    // FAIL CLOSED on errors: a transient Supabase outage must not turn
    // a long-expired admin cookie into a valid session.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      // Missing config — refuse rather than guess
      const loginUrl = new URL("/admin/login", request.url);
      return NextResponse.redirect(loginUrl);
    }

    try {
      const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: serviceKey,
        },
        signal: AbortSignal.timeout(5_000),
      });

      if (!res.ok) {
        const loginUrl = new URL("/admin/login", request.url);
        const response = NextResponse.redirect(loginUrl);
        response.cookies.set("admin-token", "", { maxAge: 0, path: "/" });
        return response;
      }
    } catch (err) {
      // Network failure / timeout / abort — fail closed.
      console.error("Admin token verification failed:", err);
      const loginUrl = new URL("/admin/login", request.url);
      const response = NextResponse.redirect(loginUrl);
      response.cookies.set("admin-token", "", { maxAge: 0, path: "/" });
      return response;
    }
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
