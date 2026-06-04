import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockFrom = vi.fn();
vi.mock("@/utils/supabase/admin", () => ({
  supabaseAdmin: new Proxy(
    {},
    { get: (_t, prop) => (prop === "from" ? mockFrom : undefined) }
  ),
}));

import {
  generateCode,
  hashCode,
  normalizeIdentifier,
  verifyCode,
  isContactVerified,
  MAX_ATTEMPTS,
} from "@/lib/verification";

/**
 * A chainable Supabase query stub. `.maybeSingle()` resolves `single`;
 * awaiting the chain directly (e.g. the cumulative-attempts `.returns()`
 * query) resolves `list` (default: no rows → sum 0 → no lockout).
 */
function chain(single: unknown, list: unknown = { data: [], error: null }) {
  const updateEq = vi.fn().mockResolvedValue({ error: null });
  const insert = vi.fn().mockResolvedValue({ error: null });
  const c: Record<string, unknown> = {
    select: () => c,
    eq: () => c,
    is: () => c,
    gte: () => c,
    lt: () => c,
    order: () => c,
    limit: () => c,
    returns: () => c,
    delete: () => c,
    maybeSingle: vi.fn().mockResolvedValue(single),
    update: () => ({ eq: updateEq }),
    insert,
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(list).then(res, rej),
    _updateEq: updateEq,
    _insert: insert,
  };
  return c;
}

describe("verification pure helpers", () => {
  beforeEach(() => {
    process.env.VERIFY_CODE_SECRET = "test-pepper";
    vi.clearAllMocks();
  });
  afterEach(() => {
    delete process.env.VERIFY_CODE_SECRET;
  });

  it("generateCode returns a zero-padded 6-digit string", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateCode()).toMatch(/^\d{6}$/);
    }
  });

  it("hashCode is deterministic and depends on the secret", () => {
    const a = hashCode("123456");
    expect(a).toBe(hashCode("123456"));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    process.env.VERIFY_CODE_SECRET = "different";
    expect(hashCode("123456")).not.toBe(a);
  });

  it("normalizeIdentifier lowercases email and strips phone formatting", () => {
    expect(normalizeIdentifier("email", "  Alex@Test.COM ")).toBe("alex@test.com");
    expect(normalizeIdentifier("sms", "+971 50 (308) 9244")).toBe("+971503089244");
  });
});

describe("verifyCode", () => {
  beforeEach(() => {
    process.env.VERIFY_CODE_SECRET = "test-pepper";
    vi.clearAllMocks();
  });

  it("returns no_code when nothing is stored", async () => {
    mockFrom.mockReturnValue(chain({ data: null }));
    expect(await verifyCode("sms", "+971500000000", "123456")).toEqual({
      ok: false,
      reason: "no_code",
    });
  });

  it("returns expired when the code is past expiry", async () => {
    mockFrom.mockReturnValue(
      chain({
        data: {
          id: "v1",
          code_hash: hashCode("123456"),
          expires_at: new Date(Date.now() - 1000).toISOString(),
          attempts: 0,
          consumed_at: null,
        },
      })
    );
    expect(await verifyCode("sms", "+971500000000", "123456")).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("returns too_many_attempts at the cap", async () => {
    mockFrom.mockReturnValue(
      chain({
        data: {
          id: "v1",
          code_hash: hashCode("123456"),
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          attempts: MAX_ATTEMPTS,
          consumed_at: null,
        },
      })
    );
    expect(await verifyCode("sms", "+971500000000", "123456")).toEqual({
      ok: false,
      reason: "too_many_attempts",
    });
  });

  it("locks out per-identifier once cumulative failures hit the cap (survives re-issue)", async () => {
    // Sum of attempts across recent codes (6 + 5 = 11) >= MAX_IDENTIFIER_ATTEMPTS (10).
    mockFrom.mockReturnValue(chain({ data: null }, { data: [{ attempts: 6 }, { attempts: 5 }] }));
    expect(await verifyCode("sms", "+971500000000", "123456")).toEqual({
      ok: false,
      reason: "too_many_attempts",
    });
  });

  it("increments attempts and returns mismatch on a wrong code", async () => {
    const c = chain({
      data: {
        id: "v1",
        code_hash: hashCode("000000"),
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        attempts: 1,
        consumed_at: null,
      },
    });
    mockFrom.mockReturnValue(c);
    const res = await verifyCode("sms", "+971500000000", "123456");
    expect(res).toEqual({ ok: false, reason: "mismatch" });
    expect((c._updateEq as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
  });

  it("consumes the code and returns ok on a correct match", async () => {
    const c = chain({
      data: {
        id: "v1",
        code_hash: hashCode("123456"),
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        attempts: 0,
        consumed_at: null,
      },
    });
    mockFrom.mockReturnValue(c);
    const res = await verifyCode("sms", "+971500000000", "123456");
    expect(res).toEqual({ ok: true });
    expect((c._updateEq as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
  });
});

describe("isContactVerified", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is true when a recent consumed code exists", async () => {
    mockFrom.mockReturnValue(chain({ data: { id: "v1" } }));
    expect(await isContactVerified("email", "alex@test.com")).toBe(true);
  });

  it("is false when none is found", async () => {
    mockFrom.mockReturnValue(chain({ data: null }));
    expect(await isContactVerified("email", "alex@test.com")).toBe(false);
  });
});
