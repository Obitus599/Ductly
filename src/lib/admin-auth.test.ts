import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { requireAdmin } from "./admin-auth";

function makeRequest(opts: {
  cookie?: string;
  headerKey?: string;
} = {}): NextRequest {
  const headers = new Headers();
  if (opts.headerKey) {
    headers.set("x-admin-key", opts.headerKey);
  }
  if (opts.cookie) {
    headers.set("cookie", `admin-token=${opts.cookie}`);
  }
  return new NextRequest("http://localhost:3000/api/admin/bookings", {
    headers,
  });
}

describe("requireAdmin", () => {
  let savedKey: string | undefined;
  let savedEnv: string | undefined;

  beforeEach(() => {
    savedKey = process.env.ADMIN_API_KEY;
    savedEnv = process.env.NODE_ENV;
  });

  afterEach(() => {
    if (savedKey === undefined) delete process.env.ADMIN_API_KEY;
    else process.env.ADMIN_API_KEY = savedKey;
    // NODE_ENV is readonly in some TS configs, so wrap in try
    try { (process.env as Record<string, string | undefined>).NODE_ENV = savedEnv; } catch {}
  });

  it("allows request with valid admin-token cookie", () => {
    const req = makeRequest({ cookie: "valid-jwt-token" });
    expect(requireAdmin(req)).toBeNull();
  });

  it("allows request with valid x-admin-key header", () => {
    process.env.ADMIN_API_KEY = "secret-key-123";
    const req = makeRequest({ headerKey: "secret-key-123" });
    expect(requireAdmin(req)).toBeNull();
  });

  it("rejects request with wrong x-admin-key header", () => {
    process.env.ADMIN_API_KEY = "secret-key-123";
    const req = makeRequest({ headerKey: "wrong-key" });
    const res = requireAdmin(req);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  it("rejects request with no auth in production", () => {
    process.env.ADMIN_API_KEY = "secret-key-123";
    const req = makeRequest();
    const res = requireAdmin(req);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  it("allows request without key in non-production when no ADMIN_API_KEY set", () => {
    delete process.env.ADMIN_API_KEY;
    try { (process.env as Record<string, string | undefined>).NODE_ENV = "development"; } catch {}
    const req = makeRequest();
    expect(requireAdmin(req)).toBeNull();
  });

  it("cookie takes precedence over missing header key", () => {
    process.env.ADMIN_API_KEY = "secret-key-123";
    const req = makeRequest({ cookie: "some-token" });
    // Cookie is present so it should pass before checking header
    expect(requireAdmin(req)).toBeNull();
  });
});
