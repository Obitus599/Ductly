import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type Stripe from "stripe";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockConstructEvent = vi.fn();
vi.mock("@/lib/stripe", () => ({
  stripe: {
    webhooks: {
      constructEvent: (...args: unknown[]) => mockConstructEvent(...args),
    },
  },
}));

const mockSupabase = { from: vi.fn() };
vi.mock("@/utils/supabase/admin", () => ({
  supabaseAdmin: new Proxy({}, {
    get: (_t, prop) => (prop === "from" ? mockSupabase.from : undefined),
  }),
}));

const mockAssignTeam = vi.fn();
vi.mock("@/lib/scheduling-agent", () => ({
  assignTeamToBooking: (...args: unknown[]) => mockAssignTeam(...args),
}));

import { POST } from "@/app/api/webhooks/stripe/route";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeRequest(body = "raw-body", signature = "sig_test"): NextRequest {
  const headers = new Headers({ "stripe-signature": signature });
  return new NextRequest("http://localhost:3000/api/webhooks/stripe", {
    method: "POST",
    body,
    headers,
  });
}

function makeEvent(type: string, data: Record<string, unknown>): Stripe.Event {
  return {
    id: "evt_test",
    type,
    data: { object: data },
    object: "event",
    api_version: "2025-04-30.basil",
    created: Date.now(),
    livemode: false,
    pending_webhooks: 0,
    request: null,
  } as unknown as Stripe.Event;
}

function setupSupabaseMock(bookingStatus = "pending") {
  mockSupabase.from.mockImplementation((table: string) => {
    if (table === "bookings") {
      // .update().eq() is awaited directly (payment_failed/expired), and
      // the confirm path chains .eq().in().select().returns() (CAS guard).
      const eqResult: Record<string, unknown> = {
        in: () => ({
          select: () => ({
            returns: vi.fn().mockResolvedValue({ data: [{ id: "book-1" }], error: null }),
          }),
        }),
        then: (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
      };
      return {
        select: () => ({
          eq: () => ({
            returns: () => ({
              single: vi.fn().mockResolvedValue({
                data: { status: bookingStatus },
                error: null,
              }),
            }),
          }),
        }),
        update: () => ({
          eq: () => eqResult,
        }),
      };
    }
    if (table === "booking_locks") {
      return {
        delete: () => ({
          eq: vi.fn().mockResolvedValue({}),
        }),
      };
    }
    if (table === "error_log") {
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    }
    return {};
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("POST /api/webhooks/stripe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  });

  // ── Signature verification ──────────────────────────────────────────────

  it("returns 400 when stripe-signature header is missing", async () => {
    const req = new NextRequest("http://localhost:3000/api/webhooks/stripe", {
      method: "POST",
      body: "body",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when signature verification fails", async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("Invalid signature");
    });
    const res = await POST(makeRequest());
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Invalid signature");
  });

  it("returns 500 when STRIPE_WEBHOOK_SECRET is not set", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
  });

  // ── checkout.session.completed ──────────────────────────────────────────

  it("confirms booking on checkout.session.completed", async () => {
    const event = makeEvent("checkout.session.completed", {
      metadata: {
        booking_id: "book-1",
        session_id: "sess-1",
        slot_start: "2025-04-15T10:00:00+04:00",
        address: "123 Test St",
        customer_id: "cust-1",
      },
      payment_intent: "pi_test_123",
    });
    mockConstructEvent.mockReturnValue(event);
    setupSupabaseMock("pending");
    mockAssignTeam.mockResolvedValue({ teamId: "team-1", method: "fallback" });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    // Verify Supabase was called to update booking
    expect(mockSupabase.from).toHaveBeenCalledWith("bookings");
    // Verify team assignment was triggered
    expect(mockAssignTeam).toHaveBeenCalledWith(
      "book-1",
      "2025-04-15T10:00:00+04:00",
      "123 Test St"
    );
  });

  it("skips duplicate webhook (idempotency) when booking already confirmed", async () => {
    const event = makeEvent("checkout.session.completed", {
      metadata: {
        booking_id: "book-1",
        session_id: "sess-1",
        slot_start: "2025-04-15T10:00:00+04:00",
        address: "123 Test St",
      },
      payment_intent: "pi_test_123",
    });
    mockConstructEvent.mockReturnValue(event);
    setupSupabaseMock("confirmed"); // Already confirmed

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    // Team assignment should NOT be triggered
    expect(mockAssignTeam).not.toHaveBeenCalled();
  });

  it("logs error when team assignment fails but still returns 200", async () => {
    const event = makeEvent("checkout.session.completed", {
      metadata: {
        booking_id: "book-1",
        session_id: "sess-1",
        slot_start: "2025-04-15T10:00:00+04:00",
        address: "",
      },
      payment_intent: "pi_test_123",
    });
    mockConstructEvent.mockReturnValue(event);
    setupSupabaseMock("pending");
    mockAssignTeam.mockRejectedValue(new Error("No teams available"));

    const res = await POST(makeRequest());
    expect(res.status).toBe(200); // Webhook should always ack
    expect(mockSupabase.from).toHaveBeenCalledWith("error_log");
  });

  // ── payment_intent.payment_failed ──────────────────────────────────────

  it("handles payment failure — releases lock and updates booking", async () => {
    const event = makeEvent("payment_intent.payment_failed", {
      metadata: { booking_id: "book-2", session_id: "sess-2" },
      id: "pi_failed",
      last_payment_error: { message: "Card declined" },
    });
    mockConstructEvent.mockReturnValue(event);
    setupSupabaseMock("pending");

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(mockSupabase.from).toHaveBeenCalledWith("booking_locks");
    expect(mockSupabase.from).toHaveBeenCalledWith("error_log");
  });

  // ── checkout.session.expired ──────────────────────────────────────────

  it("handles checkout expiry — releases lock and marks booking expired", async () => {
    const event = makeEvent("checkout.session.expired", {
      metadata: { booking_id: "book-3", session_id: "sess-3" },
    });
    mockConstructEvent.mockReturnValue(event);
    setupSupabaseMock("pending");

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(mockSupabase.from).toHaveBeenCalledWith("booking_locks");
    expect(mockSupabase.from).toHaveBeenCalledWith("bookings");
  });

  // ── Unhandled event type ──────────────────────────────────────────────

  it("returns 200 for unhandled event types", async () => {
    const event = makeEvent("charge.refunded", { id: "ch_test" });
    mockConstructEvent.mockReturnValue(event);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.received).toBe(true);
  });
});
