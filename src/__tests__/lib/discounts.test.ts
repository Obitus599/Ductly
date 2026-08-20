import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  normalizeCode,
  generateUniqueCode,
  applyDiscount,
  validateCodeForUse,
  validateRuleForIssue,
} from "@/lib/discounts";
import { vatFromNet } from "@/lib/vat";

const mockSupabase = { from: vi.fn() };

vi.mock("@/utils/supabase/admin", () => ({
  supabaseAdmin: new Proxy({}, {
    get: (_target, prop) => {
      if (prop === "from") return mockSupabase.from;
      if (prop === "rpc") return vi.fn().mockResolvedValue({ data: null, error: null });
      return undefined;
    },
  }),
}));

describe("normalizeCode", () => {
  it("trims and uppercases", () => {
    expect(normalizeCode("  ductly-ab12cd ")).toBe("DUCTLY-AB12CD");
  });
  it("handles null/undefined/empty", () => {
    expect(normalizeCode(null)).toBe("");
    expect(normalizeCode("")).toBe("");
  });
});

describe("generateUniqueCode", () => {
  it("produces the expected shape", () => {
    const code = generateUniqueCode();
    expect(code).toMatch(/^DUCTLY-[A-HJ-NP-Z2-9]{5}$/);
  });
  it("avoids ambiguous characters", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateUniqueCode();
      expect(code).not.toMatch(/[01OI]/);
    }
  });
});

describe("applyDiscount", () => {
  it("applies 50% to net and recomputes VAT on the discounted net", () => {
    // Signature 549 × 4 thermostats = 2196 AED net = 219600 fils
    const base = 219600;
    const d = applyDiscount(base, 50);
    // 50% off net: 109800 fils. VAT = 5% of 109800 = 5490.
    expect(d.discountedNetFils).toBe(109800);
    expect(d.netFils).toBe(109800);
    expect(d.vatFils).toBe(5490);
    expect(d.totalFils).toBe(115290);
    expect(d.savingsFils).toBe(109800);
    // Consistency with vatFromNet
    expect(d.vatFils).toBe(vatFromNet(d.netFils).vatFils);
  });

  it("applies a 1% floor and clamps over-100% percents", () => {
    // Percent is clamped to 1..100 — a 0% code behaves as 1%.
    expect(applyDiscount(10000, 0).discountedNetFils).toBe(9900);
    expect(applyDiscount(10000, 120).discountedNetFils).toBe(0);
  });

  it("rounds fils correctly for odd discounts", () => {
    // 1001 fils, 33% → 670.67 → 671 fils
    const d = applyDiscount(1001, 33);
    expect(d.discountedNetFils).toBe(671);
  });
});

describe("validateCodeForUse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "discount_codes") {
        return {
          select: () => ({
            eq: () => ({
              returns: () => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    code: "DUCTLY-TEST1",
                    discount_percent: 50,
                    active: true,
                    expires_at: null,
                    max_uses: null,
                    used_count: 0,
                    issued_to_email: null,
                    issued_to_phone: null,
                    created_at: null,
                  },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      return {};
    });
  });

  it("returns ok for a valid code", async () => {
    const r = await validateCodeForUse("ductly-test1");
    expect(r.ok).toBe(true);
    expect(r.percent).toBe(50);
  });

  it("returns not_found for a missing code", async () => {
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
    const r = await validateCodeForUse("DUCTLY-NOPE");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("not_found");
  });

  it("returns inactive when the code is disabled", async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "discount_codes") {
        return {
          select: () => ({
            eq: () => ({
              returns: () => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { code: "DUCTLY-TEST1", discount_percent: 50, active: false, expires_at: null, max_uses: null, used_count: 0 },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      return {};
    });
    const r = await validateCodeForUse("DUCTLY-TEST1");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("inactive");
  });

  it("returns expired when past expires_at", async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "discount_codes") {
        return {
          select: () => ({
            eq: () => ({
              returns: () => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { code: "DUCTLY-TEST1", discount_percent: 50, active: true, expires_at: new Date(Date.now() - 1000).toISOString(), max_uses: null, used_count: 0 },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      return {};
    });
    const r = await validateCodeForUse("DUCTLY-TEST1");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("expired");
  });

  it("returns usage_limit when max_uses reached", async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "discount_codes") {
        return {
          select: () => ({
            eq: () => ({
              returns: () => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { code: "DUCTLY-TEST1", discount_percent: 50, active: true, expires_at: null, max_uses: 2, used_count: 2 },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      return {};
    });
    const r = await validateCodeForUse("DUCTLY-TEST1");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("usage_limit");
  });
});

describe("validateRuleForIssue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ok with the rule percent when active", async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "discount_rules") {
        return {
          select: () => ({
            eq: () => ({
              returns: () => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 1, discount_percent: 50, active: true, expires_at: null, max_uses: null, used_count: 0 },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      return {};
    });
    const r = await validateRuleForIssue();
    expect(r.ok).toBe(true);
    expect(r.percent).toBe(50);
  });

  it("returns inactive when the campaign is paused", async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "discount_rules") {
        return {
          select: () => ({
            eq: () => ({
              returns: () => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 1, discount_percent: 50, active: false, expires_at: null, max_uses: null, used_count: 0 },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      return {};
    });
    const r = await validateRuleForIssue();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("inactive");
  });
});
