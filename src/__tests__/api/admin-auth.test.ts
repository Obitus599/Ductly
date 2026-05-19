import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSignIn = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: (...args: unknown[]) => mockSignIn(...args),
    },
  }),
}));

const mockCheckRateLimit = vi.fn().mockResolvedValue({ allowed: true });
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

import { POST, DELETE } from "@/app/api/admin/auth/route";

function makePostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/admin/auth", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/admin/auth (login)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when email is missing", async () => {
    const res = await POST(makePostRequest({ password: "pass123" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when password is missing", async () => {
    const res = await POST(makePostRequest({ email: "admin@test.com" }));
    expect(res.status).toBe(400);
  });

  it("returns 401 for invalid credentials", async () => {
    mockSignIn.mockResolvedValue({
      data: { session: null },
      error: { message: "Invalid login credentials" },
    });

    const res = await POST(makePostRequest({ email: "admin@test.com", password: "wrong" }));
    expect(res.status).toBe(401);
  });

  it("returns 200 and sets cookies on successful login", async () => {
    mockSignIn.mockResolvedValue({
      data: {
        session: {
          access_token: "jwt-access-token",
          refresh_token: "jwt-refresh-token",
        },
      },
      error: null,
    });

    const res = await POST(makePostRequest({ email: "admin@test.com", password: "correct" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    const cookies = res.headers.getSetCookie();
    expect(cookies.some((c: string) => c.includes("admin-token=jwt-access-token"))).toBe(true);
    expect(cookies.some((c: string) => c.includes("admin-refresh=jwt-refresh-token"))).toBe(true);
    expect(cookies.some((c: string) => c.includes("HttpOnly"))).toBe(true);
  });

  it("returns 500 for unexpected errors", async () => {
    mockSignIn.mockRejectedValue(new Error("unexpected"));

    const res = await POST(makePostRequest({ email: "admin@test.com", password: "pass" }));
    expect(res.status).toBe(500);
  });

  it("returns 429 when rate-limited (brute-force protection)", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: false });
    const res = await POST(makePostRequest({ email: "admin@test.com", password: "pass" }));
    expect(res.status).toBe(429);
    expect(mockSignIn).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/admin/auth (logout)", () => {
  it("clears both auth cookies", async () => {
    const res = await DELETE();
    expect(res.status).toBe(200);
    const cookies = res.headers.getSetCookie();
    expect(cookies.some((c: string) => c.includes("admin-token") && c.includes("Max-Age=0"))).toBe(true);
    expect(cookies.some((c: string) => c.includes("admin-refresh") && c.includes("Max-Age=0"))).toBe(true);
  });
});
