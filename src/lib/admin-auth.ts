import { NextRequest, NextResponse } from "next/server";

/**
 * Admin auth check for API routes.
 *
 * Accepts either:
 * 1. admin-token cookie (set by login flow)
 * 2. x-admin-key header (for programmatic access)
 *
 * Returns null if authorized, or a 401 NextResponse if not.
 */
export function requireAdmin(request: NextRequest): NextResponse | null {
  // Check cookie-based auth (from login page)
  const token = request.cookies.get("admin-token")?.value;
  if (token) {
    // Token presence is sufficient — middleware already validated it
    return null;
  }

  // Check header-based auth (for programmatic access)
  const adminKey = process.env.ADMIN_API_KEY;
  if (adminKey) {
    const provided = request.headers.get("x-admin-key");
    if (provided === adminKey) {
      return null;
    }
  }

  // In development without any key configured, allow access
  if (!adminKey && process.env.NODE_ENV !== "production") {
    return null;
  }

  return NextResponse.json(
    { error: "Unauthorized." },
    { status: 401 }
  );
}
