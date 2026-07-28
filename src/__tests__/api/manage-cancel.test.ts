import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockRefundCreate = vi.fn();
vi.mock("@/lib/stripe", () => ({
  stripe: {
    refunds: { create: (...args: unknown[]) => mockRefundCreate(...args) },
  },
}));

const mockTabbyRefund = vi.fn().mockResolvedValue({ ok: true, paymentStatus: "REFUNDED" });
vi.mock("@/lib/tabby", () => ({
  refundPayment: (...args: unknown[]) => mockTabbyRefund(...args),
  tabbyConfigured: () => true,
}));

const mockSupabase = { from: vi.fn() };
vi.mock("@/utils/supabase/admin", () => ({
  supabaseAdmin: new Proxy({}, {
    get: (_t, prop) => (prop === "from" ? mockSupabase.from : undefined),
  }),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

import { POST } from "@/app/api/manage/[token]/cancel/route";

function makeRequest(token: string, body: Record<string, unknown> = {}): [NextRequest, { params: Promise<{ token: string }> }] {
  const req = new NextRequest(`http://localhost:3000/api/manage/${token}/cancel`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
  return [req, { params: Promise.resolve({ token }) }];
}

// Future slot: 48 hours from now
const futureSlot = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
// Past slot: 2 hours from now (within 24h window)
const soonSlot = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

function setupMock(status = "confirmed", slotStart = futureSlot) {
  mockSupabase.from.mockImplementation((table: string) => {
    if (table === "bookings") {
      return {
        select: () => ({
          eq: () => ({
            returns: () => ({
              single: vi.fn().mockResolvedValue({
                data: { id: "book-1", status, slot_start: slotStart, payment_intent_id: "pi_test", payment_provider: null, tabby_payment_id: null, price_total_fils: 36645, team_id: "team-1", customer_id: "cust-1" },
                error: null,
              }),
            }),
          }),
        }),
        // Claim chains .eq().eq().select().returns() (1 row = claimed);
        // the refund-outcome update is .eq() awaited.
        update: () => ({
          eq: () => ({
            eq: () => ({
              select: () => ({
                returns: vi.fn().mockResolvedValue({ data: [{ id: "book-1" }], error: null }),
              }),
            }),
            then: (resolve: (v: unknown) => unknown) =>
              Promise.resolve({ error: null }).then(resolve),
          }),
        }),
      };
    }
    if (table === "slot_locks") {
      return {
        delete: () => ({
          eq: vi.fn().mockResolvedValue({}),
        }),
      };
    }
    if (table === "error_log") {
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    }
    if (table === "customers") {
      return {
        select: () => ({
          eq: () => ({
            returns: () => ({
              single: vi.fn().mockResolvedValue({
                data: { name: "Jane Doe", phone: "+971501234567", email: "jane@example.com" },
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

describe("POST /api/manage/[token]/cancel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRefundCreate.mockResolvedValue({ id: "re_test", status: "succeeded" });
  });

  it("returns 400 for invalid token", async () => {
    const res = await POST(...makeRequest("bad"));
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
    const res = await POST(...makeRequest("bk_abcdef1234567890abcdef"));
    expect(res.status).toBe(404);
  });

  it("returns 409 when booking is not confirmed", async () => {
    setupMock("cancelled");
    const res = await POST(...makeRequest("bk_abcdef1234567890abcdef"));
    expect(res.status).toBe(409);
  });

  it("returns 422 when within 24h cancellation window", async () => {
    setupMock("confirmed", soonSlot);
    const res = await POST(...makeRequest("bk_abcdef1234567890abcdef"));
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error).toContain("24 hours");
  });

  it("cancels booking and issues refund successfully", async () => {
    setupMock("confirmed", futureSlot);
    const res = await POST(...makeRequest("bk_abcdef1234567890abcdef", { reason: "Changed plans" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.refund_id).toBe("re_test");
    expect(data.refund_status).toBe("succeeded");
    // Now routed through the shared provider-aware helper, which sends an
    // idempotency key so a retried cancel can't double-refund.
    expect(mockRefundCreate).toHaveBeenCalledWith(
      { payment_intent: "pi_test" },
      { idempotencyKey: "refund_book-1" }
    );
  });

  it("issues a TABBY refund for a BNPL booking (not a silent no-op)", async () => {
    setupMock("confirmed", futureSlot);
    // Override the booking to be a Tabby booking with no payment_intent.
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "bookings") {
        return {
          select: () => ({
            eq: () => ({
              returns: () => ({
                single: vi.fn().mockResolvedValue({
                  data: { id: "book-1", status: "confirmed", slot_start: futureSlot, payment_intent_id: null, payment_provider: "tabby", tabby_payment_id: "pay_tabby_1", price_total_fils: 36645, team_id: "team-1", customer_id: "cust-1" },
                  error: null,
                }),
              }),
            }),
          }),
          update: () => ({
            eq: () => ({
              eq: () => ({ select: () => ({ returns: vi.fn().mockResolvedValue({ data: [{ id: "book-1" }], error: null }) }) }),
              then: (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
            }),
          }),
        };
      }
      if (table === "slot_locks") return { delete: () => ({ eq: vi.fn().mockResolvedValue({}) }) };
      if (table === "error_log") return { insert: vi.fn().mockResolvedValue({ error: null }) };
      if (table === "customers") {
        return {
          select: () => ({ eq: () => ({ returns: () => ({ single: vi.fn().mockResolvedValue({ data: { name: "Jane", phone: "+9715", email: "j@x.co" }, error: null }) }) }) }),
        };
      }
      return {};
    });

    const res = await POST(...makeRequest("bk_abcdef1234567890abcdef"));
    expect(res.status).toBe(200);
    const data = await res.json();
    // Stripe must NOT be called for a Tabby booking.
    expect(mockRefundCreate).not.toHaveBeenCalled();
    // Tabby refund succeeded via the mocked Tabby client.
    expect(data.refund_status).toBe("succeeded");
  });

  it("still cancels booking when Stripe refund fails", async () => {
    setupMock("confirmed", futureSlot);
    mockRefundCreate.mockRejectedValue(new Error("Stripe error"));
    const res = await POST(...makeRequest("bk_abcdef1234567890abcdef"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.refund_status).toBe("failed");
    expect(data.message).toContain("follow up");
  });
});
