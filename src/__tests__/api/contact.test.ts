import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock Supabase before importing the route
vi.mock("@/utils/supabase/admin", () => ({
  supabaseAdmin: {
    from: () => ({
      insert: vi.fn().mockReturnValue({ error: null }),
    }),
  },
}));

// Mock rate limiter to always allow
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

import { POST } from "@/app/api/contact/route";

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/contact", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/contact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when name is missing", async () => {
    const res = await POST(makeRequest({ email: "a@b.com" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/name/i);
  });

  it("returns 400 when email is missing", async () => {
    const res = await POST(makeRequest({ name: "Alex" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid email format", async () => {
    const res = await POST(makeRequest({ name: "Alex", email: "not-an-email" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/email/i);
  });

  it("returns 200 for valid submission", async () => {
    const res = await POST(makeRequest({
      name: "Alex",
      email: "alex@example.com",
      topic: "General",
      message: "Hello!",
    }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it("accepts submission without optional fields", async () => {
    const res = await POST(makeRequest({
      name: "Alex",
      email: "alex@example.com",
    }));
    expect(res.status).toBe(200);
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new NextRequest("http://localhost:3000/api/contact", {
      method: "POST",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
