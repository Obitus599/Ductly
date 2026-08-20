import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSupabase = { from: vi.fn() };
vi.mock("@/utils/supabase/admin", () => ({
  supabaseAdmin: new Proxy({}, {
    get: (_target, prop) => {
      if (prop === "from") return mockSupabase.from;
      return undefined;
    },
  }),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

import { GET } from "@/app/api/discount/validate/route";

function makeRequest(url: string): NextRequest {
  return new NextRequest(`http://localhost:3000${url}`, { method: "GET" });
}

describe("GET /api/discount/validate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "discount_codes") {
        return {
          select: () => ({
            eq: () => ({
              returns: () => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        };
      }
      return {};
    });
  });

  it("returns valid + discounted breakdown for a valid code", async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "discount_codes") {
        return {
          select: () => ({
            eq: () => ({
              returns: () => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { code: "DUCTLY-TEST1", discount_percent: 50, active: true, expires_at: null, max_uses: null, used_count: 0 },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      return {};
    });
    // signature 549 × 2 thermostats = 109800 fils net
    const res = await GET(makeRequest("/api/discount/validate?code=DUCTLY-TEST1&plan=signature&thermostats=2"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.valid).toBe(true);
    expect(data.percent).toBe(50);
    expect(data.savingsFils).toBe(54900);
    expect(data.netFils).toBe(54900);
    expect(data.vatFils).toBe(2745);
    expect(data.totalFils).toBe(57645);
  });

  it("returns invalid for an unknown code", async () => {
    const res = await GET(makeRequest("/api/discount/validate?code=DUCTLY-NOPE&plan=signature&thermostats=2"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.valid).toBe(false);
    expect(data.reason).toBe("not_found");
  });

  it("returns 400 for an invalid plan", async () => {
    const res = await GET(makeRequest("/api/discount/validate?code=DUCTLY-TEST1&plan=platinum&thermostats=2"));
    expect(res.status).toBe(400);
  });
});
