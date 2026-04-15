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

  it("falls back to allowed:true and disables DB on RPC error", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const rpcMock = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "function check_rate_limit does not exist" },
    });

    vi.doMock("@/utils/supabase/admin", () => ({
      supabaseAdmin: { rpc: rpcMock },
    }));

    const { checkRateLimit } = await import("./rate-limit");

    // First call: DB fails, should allow and disable
    const result1 = await checkRateLimit("test:key", 5, 60000);
    expect(result1.allowed).toBe(true);
    expect(warnSpy).toHaveBeenCalled();

    // Second call: dbAvailable is now false, should skip DB entirely
    rpcMock.mockClear();
    const result2 = await checkRateLimit("test:key", 5, 60000);
    expect(result2.allowed).toBe(true);
    expect(rpcMock).not.toHaveBeenCalled(); // DB not called at all
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
