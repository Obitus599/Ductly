import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { requireAdmin, requireSameOrigin } from "@/lib/admin-auth";

describe("requireAdmin", () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("allows request with valid x-admin-key header", async () => {
    vi.stubEnv("ADMIN_API_KEY", "secret-admin-key");
    const req = new NextRequest("http://localhost:3000/api/admin/bookings", {
      headers: { "x-admin-key": "secret-admin-key" },
    });
    expect(await requireAdmin(req)).toBeNull();
  });

  it("returns 401 when x-admin-key header does not match", async () => {
    vi.stubEnv("ADMIN_API_KEY", "secret-admin-key");
    vi.stubEnv("NODE_ENV", "production");
    const req = new NextRequest("http://localhost:3000/api/admin/bookings", {
      headers: { "x-admin-key": "wrong-key" },
    });
    const result = await requireAdmin(req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it("allows request in dev mode without any auth configured", async () => {
    vi.stubEnv("ADMIN_API_KEY", "");
    vi.stubEnv("NODE_ENV", "development");
    const req = new NextRequest("http://localhost:3000/api/admin/bookings");
    expect(await requireAdmin(req)).toBeNull();
  });

  it("returns 401 in production without any credentials", async () => {
    vi.stubEnv("ADMIN_API_KEY", "");
    vi.stubEnv("NODE_ENV", "production");
    const req = new NextRequest("http://localhost:3000/api/admin/bookings");
    const result = await requireAdmin(req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it("VALIDATES the admin-token cookie — allows when Supabase confirms it", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "svc");
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as never;
    const req = new NextRequest("http://localhost:3000/api/admin/bookings", {
      headers: { cookie: "admin-token=real-jwt" },
    });
    expect(await requireAdmin(req)).toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("REJECTS a forged admin-token cookie — presence is not sufficient (401)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "svc");
    global.fetch = vi.fn().mockResolvedValue({ ok: false }) as never;
    const req = new NextRequest("http://localhost:3000/api/admin/bookings", {
      headers: { cookie: "admin-token=anything" },
    });
    const result = await requireAdmin(req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it("fails closed (401) when token validation throws", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "svc");
    global.fetch = vi.fn().mockRejectedValue(new Error("network")) as never;
    const req = new NextRequest("http://localhost:3000/api/admin/bookings", {
      headers: { cookie: "admin-token=real-jwt" },
    });
    const result = await requireAdmin(req);
    expect(result!.status).toBe(401);
  });
});

describe("requireSameOrigin", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns null in test mode (default bypass)", () => {
    const req = new NextRequest("http://localhost:3000/api/admin/bookings", {
      method: "POST",
      body: JSON.stringify({}),
      headers: {
        "Content-Type": "application/json",
        origin: "https://evil.com",
      },
    });
    const result = requireSameOrigin(req);
    expect(result).toBeNull();
  });

  it("allows matching origin when in non-test mode", () => {
    vi.stubEnv("NODE_ENV", "production");
    const req = new NextRequest("https://ductly.ae/api/admin/bookings/create", {
      method: "POST",
      body: JSON.stringify({}),
      headers: {
        "Content-Type": "application/json",
        host: "ductly.ae",
        origin: "https://ductly.ae",
      },
    });
    const result = requireSameOrigin(req);
    expect(result).toBeNull();
  });

  it("allows http origin in dev / non-test mode", () => {
    vi.stubEnv("NODE_ENV", "development");
    const req = new NextRequest("http://localhost:3000/api/admin/bookings/create", {
      method: "POST",
      body: JSON.stringify({}),
      headers: {
        "Content-Type": "application/json",
        host: "localhost:3000",
        origin: "http://localhost:3000",
      },
    });
    const result = requireSameOrigin(req);
    expect(result).toBeNull();
  });

  it("blocks mismatched origin (403) in non-test mode", () => {
    vi.stubEnv("NODE_ENV", "production");
    const req = new NextRequest("https://ductly.ae/api/admin/bookings/create", {
      method: "POST",
      body: JSON.stringify({}),
      headers: {
        "Content-Type": "application/json",
        host: "ductly.ae",
        origin: "https://evil.com",
      },
    });
    const result = requireSameOrigin(req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it("falls back to referer when origin header is absent", () => {
    vi.stubEnv("NODE_ENV", "production");
    const req = new NextRequest("https://ductly.ae/api/admin/bookings/create", {
      method: "POST",
      body: JSON.stringify({}),
      headers: {
        "Content-Type": "application/json",
        host: "ductly.ae",
        referer: "https://ductly.ae/admin/bookings",
      },
    });
    const result = requireSameOrigin(req);
    expect(result).toBeNull();
  });

  it("allows request with x-admin-key header (CSRF bypass for programmatic access)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ADMIN_API_KEY", "secret-admin-key");
    const req = new NextRequest("https://ductly.ae/api/admin/bookings/create", {
      method: "POST",
      body: JSON.stringify({}),
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": "secret-admin-key",
        host: "ductly.ae",
        origin: "https://evil.com",
      },
    });
    const result = requireSameOrigin(req);
    expect(result).toBeNull();
  });

  it("blocks request with missing origin and referer", () => {
    vi.stubEnv("NODE_ENV", "production");
    const req = new NextRequest("https://ductly.ae/api/admin/bookings/create", {
      method: "POST",
      body: JSON.stringify({}),
      headers: {
        "Content-Type": "application/json",
        host: "ductly.ae",
      },
    });
    const result = requireSameOrigin(req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });
});
