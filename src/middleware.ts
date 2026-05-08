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

    // Verify token is valid by checking with Supabase
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (supabaseUrl && serviceKey) {
        const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: serviceKey,
          },
        });

        if (!res.ok) {
          // Token expired or invalid — redirect to login
          const loginUrl = new URL("/admin/login", request.url);
          const response = NextResponse.redirect(loginUrl);
          response.cookies.set("admin-token", "", { maxAge: 0, path: "/" });
          return response;
        }
      }
    } catch {
      // If verification fails, allow through (don't lock out on network errors)
    }
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
