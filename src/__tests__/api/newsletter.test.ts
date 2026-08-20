import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/utils/supabase/admin", () => ({
  supabaseAdmin: {
    from: () => ({
      upsert: vi.fn().mockReturnValue({ error: null }),
    }),
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

import { POST } from "@/app/api/newsletter/route";

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/newsletter", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const VALID = { email: "user@example.com", phone: "+971503089244" };

describe("POST /api/newsletter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when email is missing", async () => {
    const res = await POST(makeRequest({ phone: "+971503089244" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty email", async () => {
    const res = await POST(makeRequest({ email: "", phone: "+971503089244" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid email format", async () => {
    const res = await POST(makeRequest({ email: "not-an-email", phone: "+971503089244" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when phone is missing", async () => {
    const res = await POST(makeRequest({ email: "user@example.com" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for a non-UAE / invalid phone", async () => {
    const res = await POST(makeRequest({ email: "user@example.com", phone: "+15551234567" }));
    expect(res.status).toBe(400);
  });

  it("returns 200 for valid email + UAE phone", async () => {
    const res = await POST(makeRequest(VALID));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it("accepts local-format UAE mobile and email with subdomains", async () => {
    const res = await POST(makeRequest({ email: "user@mail.example.co.uk", phone: "050 308 9244" }));
    expect(res.status).toBe(200);
  });
});
