import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock supabase to avoid real DB calls
vi.mock("@/utils/supabase/admin", () => ({
  supabaseAdmin: {
    from: () => ({
      insert: vi.fn().mockReturnValue({ error: null }),
    }),
  },
}));

// Start with rate limit allowing, then test rejection
const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

import { POST } from "@/app/api/contact/route";

describe("Rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 429 when rate limit is exceeded", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false });

    const req = new NextRequest("http://localhost:3000/api/contact", {
      method: "POST",
      body: JSON.stringify({ name: "Alex", email: "a@b.com" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(429);
  });

  it("allows request when rate limit is not exceeded", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: true });

    const req = new NextRequest("http://localhost:3000/api/contact", {
      method: "POST",
      body: JSON.stringify({ name: "Alex", email: "a@b.com" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});
