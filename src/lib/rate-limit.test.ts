import { describe, it, expect, vi, beforeEach } from "vitest";

// We need fresh module state per test since rate-limit has module-level `dbAvailable`
describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("returns allowed:true when DB says allowed", async () => {
    vi.doMock("@/utils/supabase/admin", () => ({
      supabaseAdmin: {
        rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
      },
    }));

    const { checkRateLimit } = await import("./rate-limit");
    const result = await checkRateLimit("test:key", 5, 60000);
    expect(result.allowed).toBe(true);
  });

  it("returns allowed:false when DB says not allowed", async () => {
    vi.doMock("@/utils/supabase/admin", () => ({
      supabaseAdmin: {
        rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
      },
    }));

    const { checkRateLimit } = await import("./rate-limit");
    const result = await checkRateLimit("test:key", 5, 60000);
    expect(result.allowed).toBe(false);
  });

  it("a RETURNED error fails this request open but does NOT open the breaker", async () => {
    // A per-request data error (e.g. one oversized key) must not disable
    // throttling process-wide. Only a thrown connection error opens the
    // breaker (see the next test).
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const rpcMock = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "some data error" },
    });

    vi.doMock("@/utils/supabase/admin", () => ({
      supabaseAdmin: { rpc: rpcMock },
    }));

    const { checkRateLimit } = await import("./rate-limit");

    const result1 = await checkRateLimit("test:key", 5, 60000);
    expect(result1.allowed).toBe(true);
    expect(warnSpy).toHaveBeenCalled();

    // Second call still probes the DB — the breaker stayed CLOSED.
    rpcMock.mockClear();
    const result2 = await checkRateLimit("test:key", 5, 60000);
    expect(result2.allowed).toBe(true);
    expect(rpcMock).toHaveBeenCalled();
  });

  it("a THROWN error opens the breaker so the next call skips the DB", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const rpcMock = vi.fn().mockRejectedValue(new Error("connection refused"));
    vi.doMock("@/utils/supabase/admin", () => ({
      supabaseAdmin: { rpc: rpcMock },
    }));

    const { checkRateLimit } = await import("./rate-limit");

    const result1 = await checkRateLimit("test:key", 5, 60000);
    expect(result1.allowed).toBe(true);

    rpcMock.mockClear();
    const result2 = await checkRateLimit("test:key", 5, 60000);
    expect(result2.allowed).toBe(true);
    expect(rpcMock).not.toHaveBeenCalled(); // breaker open, DB skipped
  });

  it("caps an over-length key so it can't overflow the rate_limits btree", async () => {
    const rpcMock = vi.fn().mockResolvedValue({ data: true, error: null });
    vi.doMock("@/utils/supabase/admin", () => ({ supabaseAdmin: { rpc: rpcMock } }));

    const { checkRateLimit, safeRateLimitKey } = await import("./rate-limit");
    const huge = "verify-send:email:" + "a".repeat(100_000) + "@x.co";
    expect(safeRateLimitKey(huge).length).toBeLessThanOrEqual(160);

    await checkRateLimit(huge, 5, 60000);
    const sentKey = rpcMock.mock.calls[0][1].p_key as string;
    expect(sentKey.length).toBeLessThanOrEqual(160);
  });

  it("falls back to allowed:true on fetch exception", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.doMock("@/utils/supabase/admin", () => ({
      supabaseAdmin: {
        rpc: vi.fn().mockRejectedValue(new Error("network down")),
      },
    }));

    const { checkRateLimit } = await import("./rate-limit");
    const result = await checkRateLimit("test:key", 5, 60000);
    expect(result.allowed).toBe(true);
  });

  it("converts windowMs to seconds correctly", async () => {
    const rpcMock = vi.fn().mockResolvedValue({ data: true, error: null });
    vi.doMock("@/utils/supabase/admin", () => ({
      supabaseAdmin: { rpc: rpcMock },
    }));

    const { checkRateLimit } = await import("./rate-limit");
    await checkRateLimit("test:key", 10, 300000); // 5 minutes = 300 seconds

    expect(rpcMock).toHaveBeenCalledWith(
      "check_rate_limit",
      { p_key: "test:key", p_limit: 10, p_window_secs: 300 }
    );
  });
});

describe("checkRateLimit — failClosed", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("DENIES when the backend errors and failClosed is set", async () => {
    // Admin sign-in uses this. Failing open there hands a brute-forcer an
    // unlimited-guess window for as long as the limiter is down.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.doMock("@/utils/supabase/admin", () => ({
      supabaseAdmin: {
        rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "db down" } }),
      },
    }));

    const { checkRateLimit } = await import("./rate-limit");
    const result = await checkRateLimit("admin-auth:1.2.3.4", 5, 60000, { failClosed: true });
    expect(result.allowed).toBe(false);
  });

  it("DENIES when the RPC throws and failClosed is set", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.doMock("@/utils/supabase/admin", () => ({
      supabaseAdmin: { rpc: vi.fn().mockRejectedValue(new Error("network down")) },
    }));

    const { checkRateLimit } = await import("./rate-limit");
    const result = await checkRateLimit("admin-auth:1.2.3.4", 5, 60000, { failClosed: true });
    expect(result.allowed).toBe(false);
  });

  it("still hits the DB for a fail-closed caller while the breaker is open", async () => {
    // The circuit breaker short-circuits to "allowed" — a fail-closed
    // caller must never be routed through that path.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const rpcMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("connection refused"))
      .mockResolvedValue({ data: true, error: null });
    vi.doMock("@/utils/supabase/admin", () => ({ supabaseAdmin: { rpc: rpcMock } }));

    const { checkRateLimit } = await import("./rate-limit");
    // First call (a THROWN error from a fail-open caller) trips the breaker.
    await checkRateLimit("checkout:1.2.3.4", 5, 60000);
    rpcMock.mockClear();

    const result = await checkRateLimit("admin-auth:1.2.3.4", 5, 60000, { failClosed: true });
    expect(rpcMock).toHaveBeenCalled();
    expect(result.allowed).toBe(true);
  });

  it("keeps the default fail-OPEN behaviour for customer-facing endpoints", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.doMock("@/utils/supabase/admin", () => ({
      supabaseAdmin: {
        rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "db down" } }),
      },
    }));

    const { checkRateLimit } = await import("./rate-limit");
    const result = await checkRateLimit("checkout:1.2.3.4", 5, 60000);
    expect(result.allowed).toBe(true);
  });
});
