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

import { GET } from "@/app/api/manage/[token]/route";

function makeRequest(token: string): [NextRequest, { params: Promise<{ token: string }> }] {
  const req = new NextRequest(`http://localhost:3000/api/manage/${token}`, { method: "GET" });
  return [req, { params: Promise.resolve({ token }) }];
}

const VALID_TOKEN = "bk_abcdef1234567890abcdef";
const futureSlot = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
const soonSlot = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

function setupBooking(opts: { slot?: string; status?: string; customer?: Record<string, unknown> | null }) {
  const { slot = futureSlot, status = "confirmed", customer = { name: "Alex", email: "a@b.com", phone: "+971" } } = opts;
  mockSupabase.from.mockImplementation((table: string) => {
    if (table === "bookings") {
      return {
        select: () => ({
          eq: () => ({
            returns: () => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: "book-1",
                  slot_start: slot,
                  slot_end: slot,
                  address: "123 Test",
                  status,
                  team_id: "team-1",
                  customer_id: "cust-1",
                  payment_intent_id: "pi_x",
                  created_at: "2026-05-01",
                },
                error: null,
              }),
            }),
          }),
        }),
      };
    }
    if (table === "customers") {
      return {
        select: () => ({
          eq: () => ({
            returns: () => ({
              single: vi.fn().mockResolvedValue({ data: customer }),
            }),
          }),
        }),
      };
    }
    return {};
  });
}

describe("GET /api/manage/[token]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 for malformed token", async () => {
    const res = await GET(...makeRequest("bad"));
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
    const res = await GET(...makeRequest(VALID_TOKEN));
    expect(res.status).toBe(404);
  });

  it("returns booking + customer + can_cancel=true when 48h out", async () => {
    setupBooking({ slot: futureSlot });
    const res = await GET(...makeRequest(VALID_TOKEN));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.booking.id).toBe("book-1");
    expect(data.customer.email).toBe("a@b.com");
    expect(data.can_cancel).toBe(true);
    expect(data.can_reschedule).toBe(true);
  });

  it("returns can_cancel=false when within 24h window", async () => {
    setupBooking({ slot: soonSlot });
    const res = await GET(...makeRequest(VALID_TOKEN));
    const data = await res.json();
    expect(data.can_cancel).toBe(false);
    expect(data.policy).toMatch(/24 hours/i);
  });

  it("returns can_cancel=false when booking is already cancelled", async () => {
    setupBooking({ slot: futureSlot, status: "cancelled" });
    const res = await GET(...makeRequest(VALID_TOKEN));
    const data = await res.json();
    expect(data.can_cancel).toBe(false);
    expect(data.policy).toMatch(/cannot be modified/i);
  });
});
