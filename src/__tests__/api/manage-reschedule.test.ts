import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSupabase = { from: vi.fn() };
vi.mock("@/utils/supabase/admin", () => ({
  supabaseAdmin: new Proxy({}, {
    get: (_t, prop) => (prop === "from" ? mockSupabase.from : undefined),
  }),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock("@/lib/scheduling-agent", () => ({
  assignTeamToBooking: vi.fn().mockResolvedValue({ teamId: "team-1", method: "round_robin" }),
}));

import { POST } from "@/app/api/manage/[token]/reschedule/route";

function makeRequest(token: string, body: Record<string, unknown> = {}): [NextRequest, { params: Promise<{ token: string }> }] {
  const req = new NextRequest(`http://localhost:3000/api/manage/${token}/reschedule`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
  return [req, { params: Promise.resolve({ token }) }];
}

const futureSlot = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
const soonSlot = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
const newFutureSlot = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

function setupMock(status = "confirmed", slotStart = futureSlot, existingBookings: unknown[] = []) {
  mockSupabase.from.mockImplementation((table: string) => {
    if (table === "bookings") {
      return {
        select: () => ({
          eq: () => ({
            returns: () => ({
              single: vi.fn().mockResolvedValue({
                data: { id: "book-1", status, slot_start: slotStart, slot_end: slotStart, team_id: "team-1", address: "123 St", customer_id: "cust-1" },
                error: null,
              }),
            }),
          }),
          gte: () => ({
            lte: () => ({
              in: () => ({
                neq: () => ({
                  returns: vi.fn().mockResolvedValue({ data: existingBookings }),
                }),
              }),
            }),
          }),
        }),
        update: () => ({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      };
    }
    if (table === "slot_locks") {
      return {
        delete: () => ({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      };
    }
    if (table === "customers") {
      return {
        select: () => ({
          eq: () => ({
            returns: () => ({
              single: vi.fn().mockResolvedValue({
                data: { name: "Jane Doe", phone: "+971501234567" },
                error: null,
              }),
            }),
          }),
        }),
      };
    }
    if (table === "error_log") {
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    }
    return {};
  });
}

describe("POST /api/manage/[token]/reschedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 for invalid token", async () => {
    const res = await POST(...makeRequest("bad", { new_slot_start: newFutureSlot }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing new_slot_start", async () => {
    const res = await POST(...makeRequest("bk_abcdef1234567890abcdef", {}));
    expect(res.status).toBe(400);
  });

  it("returns 400 for past slot", async () => {
    const res = await POST(...makeRequest("bk_abcdef1234567890abcdef", {
      new_slot_start: "2020-01-01T10:00:00+04:00",
    }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when booking not found", async () => {
    mockSupabase.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          returns: () => ({
            single: vi.fn().mockResolvedValue({ data: null, error: { message: "not found" } }),
          }),
        }),
      }),
    });
    const res = await POST(...makeRequest("bk_abcdef1234567890abcdef", { new_slot_start: newFutureSlot }));
    expect(res.status).toBe(404);
  });

  it("returns 409 when booking is not confirmed", async () => {
    setupMock("cancelled");
    const res = await POST(...makeRequest("bk_abcdef1234567890abcdef", { new_slot_start: newFutureSlot }));
    expect(res.status).toBe(409);
  });

  it("returns 422 when within 24h reschedule window", async () => {
    setupMock("confirmed", soonSlot);
    const res = await POST(...makeRequest("bk_abcdef1234567890abcdef", { new_slot_start: newFutureSlot }));
    expect(res.status).toBe(422);
  });

  it("reschedules successfully when slot is available", async () => {
    setupMock("confirmed", futureSlot, []);
    const res = await POST(...makeRequest("bk_abcdef1234567890abcdef", { new_slot_start: newFutureSlot }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.new_slot_start).toBe(newFutureSlot);
    expect(data.old_slot_start).toBe(futureSlot);
  });

  it("returns 409 when new slot conflicts with existing booking", async () => {
    // Existing booking overlaps with the requested new slot
    setupMock("confirmed", futureSlot, [
      { id: "other", slot_start: newFutureSlot, slot_end: new Date(new Date(newFutureSlot).getTime() + 90 * 60 * 1000).toISOString() },
    ]);
    const res = await POST(...makeRequest("bk_abcdef1234567890abcdef", { new_slot_start: newFutureSlot }));
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toContain("no longer available");
  });
});
