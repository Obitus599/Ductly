import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/admin-auth", () => ({
  requireAdmin: vi.fn().mockReturnValue(null),
  requireSameOrigin: vi.fn().mockReturnValue(null),
}));

const mockSupabase = { from: vi.fn() };
vi.mock("@/utils/supabase/admin", () => ({
  supabaseAdmin: new Proxy({}, {
    get: (_t, prop) => (prop === "from" ? mockSupabase.from : undefined),
  }),
}));

import { GET, POST } from "@/app/api/admin/schedule-blackouts/route";
import { DELETE } from "@/app/api/admin/schedule-blackouts/[id]/route";

type Init = { method?: string; body?: string; headers?: Record<string, string> };
function makeReq(url: string, init?: Init): NextRequest {
  return new NextRequest(url, init);
}

describe("POST /api/admin/schedule-blackouts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupNoConflicts() {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "bookings") {
        return {
          select: () => ({
            lt: () => ({
              gt: () => ({
                in: () => ({
                  returns: vi.fn().mockResolvedValue({ data: [] }),
                  eq: () => ({
                    returns: vi.fn().mockResolvedValue({ data: [] }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "schedule_blackouts") {
        return {
          insert: () => ({
            select: () => ({
              returns: () => ({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: "bo-1",
                    team_id: null,
                    starts_at: "2026-06-01T08:00:00Z",
                    ends_at: "2026-06-01T18:00:00Z",
                    reason: "Public holiday",
                    created_by: null,
                    created_at: "2026-05-19T00:00:00Z",
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
  }

  it("returns 400 on invalid JSON", async () => {
    const req = makeReq("http://localhost/api/admin/schedule-blackouts", {
      method: "POST",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when starts_at/ends_at/reason missing", async () => {
    const req = makeReq("http://localhost/api/admin/schedule-blackouts", {
      method: "POST",
      body: JSON.stringify({ reason: "x" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when ends_at <= starts_at", async () => {
    const req = makeReq("http://localhost/api/admin/schedule-blackouts", {
      method: "POST",
      body: JSON.stringify({
        starts_at: "2026-06-01T10:00:00Z",
        ends_at: "2026-06-01T10:00:00Z",
        reason: "x",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when reason exceeds 500 chars", async () => {
    const req = makeReq("http://localhost/api/admin/schedule-blackouts", {
      method: "POST",
      body: JSON.stringify({
        starts_at: "2026-06-01T08:00:00Z",
        ends_at: "2026-06-01T18:00:00Z",
        reason: "x".repeat(501),
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 409 when confirmed bookings conflict with the window", async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "bookings") {
        return {
          select: () => ({
            lt: () => ({
              gt: () => ({
                in: () => ({
                  returns: vi.fn().mockResolvedValue({
                    data: [
                      {
                        id: "book-1",
                        slot_start: "2026-06-01T09:00:00Z",
                        slot_end: "2026-06-01T10:30:00Z",
                        team_id: "team-1",
                        customers: { name: "Alex" },
                      },
                    ],
                  }),
                }),
              }),
            }),
          }),
        };
      }
      return {};
    });

    const req = makeReq("http://localhost/api/admin/schedule-blackouts", {
      method: "POST",
      body: JSON.stringify({
        starts_at: "2026-06-01T08:00:00Z",
        ends_at: "2026-06-01T18:00:00Z",
        reason: "Public holiday",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.conflicts).toHaveLength(1);
    expect(data.error).toMatch(/conflict/i);
  });

  it("creates a global blackout when no conflicts and no team_id", async () => {
    setupNoConflicts();
    const req = makeReq("http://localhost/api/admin/schedule-blackouts", {
      method: "POST",
      body: JSON.stringify({
        starts_at: "2026-06-01T08:00:00Z",
        ends_at: "2026-06-01T18:00:00Z",
        reason: "Public holiday",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.blackout.id).toBe("bo-1");
    expect(data.blackout.team_id).toBeNull();
  });
});

describe("GET /api/admin/schedule-blackouts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.from.mockImplementation(() => ({
      select: () => ({
        order: () => ({
          gte: () => ({
            lte: () => ({
              returns: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: "bo-1",
                    team_id: null,
                    starts_at: "2026-06-01T08:00:00Z",
                    ends_at: "2026-06-01T18:00:00Z",
                    reason: "Public holiday",
                    created_by: null,
                    created_at: "2026-05-19T00:00:00Z",
                  },
                ],
              }),
            }),
            returns: vi.fn().mockResolvedValue({
              data: [],
            }),
          }),
        }),
      }),
    }));
  });

  it("returns blackouts within a date window", async () => {
    const req = makeReq(
      "http://localhost/api/admin/schedule-blackouts?from=2026-06-01&to=2026-06-30"
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.blackouts)).toBe(true);
    expect(data.blackouts).toHaveLength(1);
  });
});

describe("DELETE /api/admin/schedule-blackouts/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 on a malformed id", async () => {
    const req = makeReq("http://localhost/api/admin/schedule-blackouts/bad-id", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: "bad-id" }) });
    expect(res.status).toBe(400);
  });

  it("returns 200 on a valid uuid (idempotent)", async () => {
    mockSupabase.from.mockImplementation(() => ({
      delete: () => ({
        eq: () => ({
          select: () => ({
            returns: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    }));
    const validUuid = "11111111-2222-3333-4444-555555555555";
    const req = makeReq(`http://localhost/api/admin/schedule-blackouts/${validUuid}`, {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: validUuid }) });
    expect(res.status).toBe(200);
  });
});
