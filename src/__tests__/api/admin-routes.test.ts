import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Shared mocks ───────────────────────────────────────────────────────────

// Mock admin auth — always allow (tested separately in admin-auth.test.ts)
vi.mock("@/lib/admin-auth", () => ({
  requireAdmin: vi.fn().mockReturnValue(null),
}));

// Mock supabaseAdmin (admin routes use service role client)
const mockSupabaseClient = { from: vi.fn(), };
vi.mock("@/utils/supabase/admin", () => ({
  supabaseAdmin: new Proxy({}, {
    get: (_t, prop) => (prop === "from" ? mockSupabaseClient.from : undefined),
  }),
}));

// ─── Admin bookings route ───────────────────────────────────────────────────

describe("GET /api/admin/bookings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns paginated bookings", async () => {
    mockSupabaseClient.from.mockReturnValue({
      select: () => ({
        order: () => ({
          range: () => ({
            eq: vi.fn(),
            gte: vi.fn(),
            returns: vi.fn().mockResolvedValue({
              data: [
                { id: "b1", slot_start: "2025-04-15T10:00:00+04:00", status: "confirmed" },
              ],
              count: 1,
              error: null,
            }),
          }),
        }),
      }),
    });

    const { GET } = await import("@/app/api/admin/bookings/route");
    const req = new NextRequest("http://localhost:3000/api/admin/bookings?page=1");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.bookings).toHaveLength(1);
    expect(data.page).toBe(1);
    expect(data.total).toBe(1);
  });

  it("returns 500 when Supabase query fails", async () => {
    mockSupabaseClient.from.mockReturnValue({
      select: () => ({
        order: () => ({
          range: () => ({
            returns: vi.fn().mockResolvedValue({
              data: null,
              count: null,
              error: { message: "table not found" },
            }),
          }),
        }),
      }),
    });

    const { GET } = await import("@/app/api/admin/bookings/route");
    const req = new NextRequest("http://localhost:3000/api/admin/bookings");
    const res = await GET(req);
    expect(res.status).toBe(500);
  });
});

// ─── Admin teams PATCH ──────────────────────────────────────────────────────

describe("PATCH /api/admin/teams", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.from.mockReturnValue({
      update: () => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });
  });

  it("returns 400 when id is missing", async () => {
    const { PATCH } = await import("@/app/api/admin/teams/route");
    const req = new NextRequest("http://localhost:3000/api/admin/teams", {
      method: "PATCH",
      body: JSON.stringify({ active: false }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when no valid fields are provided", async () => {
    const { PATCH } = await import("@/app/api/admin/teams/route");
    const req = new NextRequest("http://localhost:3000/api/admin/teams", {
      method: "PATCH",
      body: JSON.stringify({ id: "team-1", malicious_field: "drop table" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/no valid fields/i);
  });

  it("updates team with whitelisted fields only", async () => {
    const { PATCH } = await import("@/app/api/admin/teams/route");
    const req = new NextRequest("http://localhost:3000/api/admin/teams", {
      method: "PATCH",
      body: JSON.stringify({
        id: "team-1",
        active: false,
        name: "New Name",
        whatsapp_number: "+971501234567",
        evil_field: "malicious",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it("returns 500 when Supabase update fails", async () => {
    mockSupabaseClient.from.mockReturnValue({
      update: () => ({
        eq: vi.fn().mockResolvedValue({ error: { message: "constraint violation" } }),
      }),
    });

    const { PATCH } = await import("@/app/api/admin/teams/route");
    const req = new NextRequest("http://localhost:3000/api/admin/teams", {
      method: "PATCH",
      body: JSON.stringify({ id: "team-1", active: true }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req);
    expect(res.status).toBe(500);
  });
});

// ─── Admin teams GET ────────────────────────────────────────────────────────

describe("GET /api/admin/teams", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns teams with schedules and workloads merged", async () => {
    mockSupabaseClient.from.mockReturnValue({
      select: () => ({
        order: () => ({
          returns: vi.fn().mockResolvedValue({
            data: [{ id: "t1", name: "Alpha", whatsapp_number: null, active: true, created_at: "2025-01-01" }],
          }),
        }),
        returns: vi.fn().mockResolvedValue({
          data: [
            { id: "s1", team_id: "t1", day_of_week: 1, start_time: "08:00", end_time: "18:00", active: true },
          ],
        }),
      }),
    });

    const { GET } = await import("@/app/api/admin/teams/route");
    const req = new NextRequest("http://localhost:3000/api/admin/teams");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.teams).toBeDefined();
    expect(data.teams[0]).toHaveProperty("schedules");
  });
});

// ─── Admin auth route ───────────────────────────────────────────────────────

describe("DELETE /api/admin/auth (logout)", () => {
  it("clears auth cookies and returns success", async () => {
    const { DELETE } = await import("@/app/api/admin/auth/route");
    const res = await DELETE();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    // Verify cookies are cleared
    const cookies = res.headers.getSetCookie();
    expect(cookies.some((c: string) => c.includes("admin-token") && c.includes("Max-Age=0"))).toBe(true);
    expect(cookies.some((c: string) => c.includes("admin-refresh") && c.includes("Max-Age=0"))).toBe(true);
  });
});
