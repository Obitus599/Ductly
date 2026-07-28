import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";
import { verifyAdminToken } from "@/lib/admin-identity";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect admin routes (except login page and auth API)
  if (
    pathname.startsWith("/admin") &&
    !pathname.startsWith("/admin/login") &&
    !pathname.startsWith("/api/admin/auth")
  ) {
    const redirectToLogin = (clearCookie = false) => {
      const response = NextResponse.redirect(new URL("/admin/login", request.url));
      if (clearCookie) response.cookies.set("admin-token", "", { maxAge: 0, path: "/" });
      return response;
    };

    const token = request.cookies.get("admin-token")?.value;

    if (!token) {
      // Dev convenience: no key configured AND an explicit development/test
      // build → skip. Kept in lockstep with lib/admin-auth.ts:requireAdmin
      // (=== development/test, not !== production) so a staging box or an
      // unset NODE_ENV can't leave the admin pages open.
      if (
        !process.env.ADMIN_API_KEY &&
        (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test")
      ) {
        return await updateSession(request);
      }
      return redirectToLogin();
    }

    // Validate the token AND authorize it as an admin (role/allowlist).
    // A valid session for any self-registered Supabase user is NOT admin
    // access. verifyAdminToken fails closed on config/network/parse errors.
    const user = await verifyAdminToken(token);
    if (!user) return redirectToLogin(true);
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
