import { describe, it, expect, vi, beforeEach } from "vitest";

const mockLimit = vi.fn();

vi.mock("@/utils/supabase/admin", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        limit: (...args: unknown[]) => mockLimit(...args),
      }),
    }),
  },
}));

import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns healthy (200) when supabase is reachable", async () => {
    mockLimit.mockResolvedValue({ error: null });
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("healthy");
    expect(data.checks.supabase).toBe("ok");
  });

  it("returns degraded (503) when supabase returns an error", async () => {
    mockLimit.mockResolvedValue({ error: { message: "connection refused" } });
    const res = await GET();
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.status).toBe("degraded");
    expect(data.checks.supabase).toBe("error");
  });

  it("returns degraded (503) when supabase throws", async () => {
    mockLimit.mockRejectedValue(new Error("network timeout"));
    const res = await GET();
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.status).toBe("degraded");
    expect(data.checks.supabase).toBe("error");
  });
});
