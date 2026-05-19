import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock the supabase middleware (updateSession)
vi.mock("@/utils/supabase/middleware", () => ({
  updateSession: vi.fn().mockImplementation(async (req: NextRequest) => {
    const { NextResponse } = await import("next/server");
    return NextResponse.next();
  }),
}));

// Mock global fetch for Supabase auth verification
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { middleware } from "@/middleware";

function makeRequest(path: string, cookie?: string): NextRequest {
  const url = `http://localhost:3000${path}`;
  const headers = new Headers();
  if (cookie) {
    headers.set("cookie", `admin-token=${cookie}`);
  }
  return new NextRequest(url, { headers });
}

describe("middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    // Without ADMIN_API_KEY set, middleware.ts:17 skips auth in non-prod
    // (a dev convenience). Tests must simulate prod-like config.
    process.env.ADMIN_API_KEY = "test-admin-key";
  });

  it("allows non-admin routes through without auth check", async () => {
    const res = await middleware(makeRequest("/"));
    expect(res.status).toBe(200);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("allows /admin/login without auth check", async () => {
    const res = await middleware(makeRequest("/admin/login"));
    expect(res.status).toBe(200);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("allows /api/admin/auth without auth check", async () => {
    const res = await middleware(makeRequest("/api/admin/auth"));
    expect(res.status).toBe(200);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("redirects to login when no admin-token cookie on /admin", async () => {
    const res = await middleware(makeRequest("/admin"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/admin/login");
  });

  it("redirects to login when no admin-token cookie on /admin/bookings", async () => {
    const res = await middleware(makeRequest("/admin/bookings"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/admin/login");
  });

  it("allows /admin with valid token (Supabase returns 200)", async () => {
    mockFetch.mockResolvedValue({ ok: true });
    const res = await middleware(makeRequest("/admin", "valid-jwt"));
    // Should pass through (not redirect)
    expect(res.status).toBe(200);
  });

  it("redirects to login and clears cookie when token is invalid", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401 });
    const res = await middleware(makeRequest("/admin", "expired-jwt"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/admin/login");
    // Cookie should be cleared
    const cookies = res.headers.getSetCookie();
    expect(cookies.some((c: string) => c.includes("admin-token") && c.includes("Max-Age=0"))).toBe(true);
  });

  it("FAILS CLOSED when Supabase verification fails (network error)", async () => {
    // Security: a Supabase outage must not turn a long-expired admin
    // cookie into a valid session. Pre-2026-05-19 this returned 200
    // (open-on-error) — see middleware.ts for the post-hoc fix.
    mockFetch.mockRejectedValue(new Error("network timeout"));
    const res = await middleware(makeRequest("/admin", "some-token"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/admin/login");
    const cookies = res.headers.getSetCookie();
    expect(cookies.some((c: string) => c.includes("admin-token") && c.includes("Max-Age=0"))).toBe(true);
  });

  it("allows public API routes through", async () => {
    const res = await middleware(makeRequest("/api/slots?date=2025-04-15"));
    expect(res.status).toBe(200);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
