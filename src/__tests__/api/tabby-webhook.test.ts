import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────────────
const mockCapture = vi.fn();
const mockRetrieve = vi.fn();
vi.mock("@/lib/tabby", () => ({
  tabbyConfigured: () => true,
  capturePayment: (...a: unknown[]) => mockCapture(...a),
  retrievePayment: (...a: unknown[]) => mockRetrieve(...a),
}));

const mockConfirm = vi.fn();
vi.mock("@/lib/booking-confirmation", () => ({
  confirmPaidBooking: (...a: unknown[]) => mockConfirm(...a),
}));

let bookingData: Record<string, unknown> | null = null;
const mockUpdateEq = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/utils/supabase/admin", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === "bookings") {
        return {
          select: () => ({
            eq: () => ({ returns: () => ({ maybeSingle: () => Promise.resolve({ data: bookingData }) }) }),
          }),
          update: () => ({ eq: mockUpdateEq }),
        };
      }
      if (table === "customers") {
        return {
          select: () => ({
            eq: () => ({
              returns: () => ({
                maybeSingle: () => Promise.resolve({ data: { name: "Ahmed", email: "a@t.com", phone: "+9715" } }),
              }),
            }),
          }),
        };
      }
      if (table === "error_log") return { insert: vi.fn().mockResolvedValue({ error: null }) };
      return {};
    },
  },
}));

import { POST } from "@/app/api/webhooks/tabby/route";

function req(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost:3000/api/webhooks/tabby", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...headers },
  });
}

const BOOKING = {
  id: "book-1",
  status: "pending",
  tabby_payment_id: "pay_1",
  slot_start: "2026-08-01T10:00:00+04:00",
  address: "Dubai Marina",
  is_test_data: true,
  price_total_fils: 36645,
  customer_id: "cust-1",
};

describe("POST /api/webhooks/tabby", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bookingData = { ...BOOKING };
    mockCapture.mockResolvedValue({ ok: true, paymentStatus: "CLOSED" });
    mockRetrieve.mockResolvedValue({ ok: true, paymentStatus: "CLOSED" });
    mockConfirm.mockResolvedValue({ confirmed: true });
  });
  afterEach(() => {
    delete process.env.TABBY_WEBHOOK_SECRET;
  });

  it("401s when the secret is set but the header is wrong", async () => {
    process.env.TABBY_WEBHOOK_SECRET = "shh";
    const res = await POST(req({ id: "pay_1", status: "authorized", order: { reference_id: "book-1" } }, { authorization: "nope" }));
    expect(res.status).toBe(401);
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it("accepts a matching secret header", async () => {
    process.env.TABBY_WEBHOOK_SECRET = "shh";
    const res = await POST(req({ id: "pay_1", status: "closed", order: { reference_id: "book-1" } }, { authorization: "shh" }));
    expect(res.status).toBe(200);
    expect(mockConfirm).toHaveBeenCalledTimes(1);
  });

  it("accepts the secret under X-Webhook-Signature (Tabby's default header title)", async () => {
    process.env.TABBY_WEBHOOK_SECRET = "shh";
    const res = await POST(req({ id: "pay_1", status: "closed", order: { reference_id: "book-1" } }, { "x-webhook-signature": "shh" }));
    expect(res.status).toBe(200);
    expect(mockConfirm).toHaveBeenCalledTimes(1);
  });

  it("authorized → captures then confirms", async () => {
    const res = await POST(req({ id: "pay_1", status: "authorized", order: { reference_id: "book-1" } }));
    expect(res.status).toBe(200);
    expect(mockCapture).toHaveBeenCalledWith("pay_1", 36645);
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(mockConfirm.mock.calls[0][0]).toMatchObject({ provider: "tabby", paymentRef: "pay_1", bookingId: "book-1" });
  });

  it("closed → confirms without capturing", async () => {
    const res = await POST(req({ id: "pay_1", status: "closed", order: { reference_id: "book-1" } }));
    expect(res.status).toBe(200);
    expect(mockCapture).not.toHaveBeenCalled();
    expect(mockConfirm).toHaveBeenCalledTimes(1);
  });

  it("rejected → marks payment_failed, does not confirm", async () => {
    const res = await POST(req({ id: "pay_1", status: "rejected", order: { reference_id: "book-1" } }));
    expect(res.status).toBe(200);
    expect(mockUpdateEq).toHaveBeenCalled();
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it("acks unknown bookings without confirming", async () => {
    bookingData = null;
    const res = await POST(req({ id: "pay_x", status: "authorized", order: { reference_id: "missing" } }));
    expect(res.status).toBe(200);
    expect(mockConfirm).not.toHaveBeenCalled();
  });
});
