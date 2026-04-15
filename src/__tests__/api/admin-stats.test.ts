import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/admin-auth", () => ({
  requireAdmin: vi.fn().mockReturnValue(null),
}));

const mockSelect = vi.fn();
vi.mock("@/utils/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    from: () => ({
      select: (...args: unknown[]) => {
        const result = mockSelect(...args);
        return {
          ...result,
          gte: () => ({
            lt: () => result,
          }),
          eq: () => result,
          order: () => ({
            limit: () => ({
              returns: vi.fn().mockResolvedValue({ data: [] }),
            }),
          }),
          returns: vi.fn().mockResolvedValue({ data: [] }),
        };
      },
    }),
  }),
}));

import { GET } from "@/app/api/admin/stats/route";

describe("GET /api/admin/stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({
      count: 10,
      data: [{ id: "t1", name: "Alpha", active: true }],
    });
  });

  it("returns stats object with expected fields", async () => {
    const req = new NextRequest("http://localhost:3000/api/admin/stats");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.stats).toBeDefined();
    expect(data.stats).toHaveProperty("total_bookings");
    expect(data.stats).toHaveProperty("today_bookings");
    expect(data.stats).toHaveProperty("pending");
    expect(data.stats).toHaveProperty("confirmed");
    expect(data.stats).toHaveProperty("active_teams");
    expect(data.stats).toHaveProperty("total_teams");
  });
});
