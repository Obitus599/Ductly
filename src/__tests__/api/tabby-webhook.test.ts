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
const mockStatusUpdate = vi.fn().mockResolvedValue({ error: null });
const mockErrorLogInsert = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/utils/supabase/admin", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === "bookings") {
        return {
          select: () => ({
            eq: () => ({ returns: () => ({ maybeSingle: () => Promise.resolve({ data: bookingData }) }) }),
          }),
          // .update({status}).eq(id).eq("status","pending")
          update: (payload: Record<string, unknown>) => ({
            eq: () => ({
              eq: (...a: unknown[]) => mockStatusUpdate(payload, ...a),
            }),
          }),
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
      if (table === "error_log") return { insert: mockErrorLogInsert };
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

/** Body carrying a valid shared secret — auth is now mandatory. */
function authed(body: unknown, headers: Record<string, string> = {}) {
  return req(body, { authorization: "shh", ...headers });
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
    process.env.TABBY_WEBHOOK_SECRET = "shh";
    mockCapture.mockResolvedValue({ ok: true, paymentStatus: "CLOSED" });
    mockRetrieve.mockResolvedValue({ ok: true, paymentStatus: "CLOSED" });
    mockConfirm.mockResolvedValue({ confirmed: true });
    mockStatusUpdate.mockResolvedValue({ error: null });
  });
  afterEach(() => {
    delete process.env.TABBY_WEBHOOK_SECRET;
  });

  describe("authentication", () => {
    it("fails CLOSED when no secret is configured", async () => {
      delete process.env.TABBY_WEBHOOK_SECRET;
      vi.spyOn(console, "error").mockImplementation(() => {});
      const res = await POST(req({ id: "pay_1", status: "closed", order: { reference_id: "book-1" } }));
      expect(res.status).toBe(500);
      expect(mockConfirm).not.toHaveBeenCalled();
    });

    it("401s when the secret is set but the header is wrong", async () => {
      const res = await POST(req({ id: "pay_1", status: "authorized", order: { reference_id: "book-1" } }, { authorization: "nope" }));
      expect(res.status).toBe(401);
      expect(mockConfirm).not.toHaveBeenCalled();
    });

    it("401s when no auth header is present at all", async () => {
      const res = await POST(req({ id: "pay_1", status: "closed", order: { reference_id: "book-1" } }));
      expect(res.status).toBe(401);
      expect(mockConfirm).not.toHaveBeenCalled();
    });

    it("accepts a matching secret header", async () => {
      const res = await POST(authed({ id: "pay_1", status: "closed", order: { reference_id: "book-1" } }));
      expect(res.status).toBe(200);
      expect(mockConfirm).toHaveBeenCalledTimes(1);
    });

    it("accepts the secret under X-Webhook-Signature (Tabby's default header title)", async () => {
      const res = await POST(req({ id: "pay_1", status: "closed", order: { reference_id: "book-1" } }, { "x-webhook-signature": "shh" }));
      expect(res.status).toBe(200);
      expect(mockConfirm).toHaveBeenCalledTimes(1);
    });

    it("accepts an Authorization: Bearer <secret> registration", async () => {
      const res = await POST(req({ id: "pay_1", status: "closed", order: { reference_id: "book-1" } }, { authorization: "Bearer shh" }));
      expect(res.status).toBe(200);
    });
  });

  describe("the request body is never trusted for a state change", () => {
    it("verifies status server-side even when the body says closed", async () => {
      await POST(authed({ id: "pay_1", status: "closed", order: { reference_id: "book-1" } }));
      expect(mockRetrieve).toHaveBeenCalledWith("pay_1");
    });

    it("does NOT confirm when the body claims closed but Tabby says CREATED", async () => {
      mockRetrieve.mockResolvedValue({ ok: true, paymentStatus: "CREATED" });
      const res = await POST(authed({ id: "pay_1", status: "closed", order: { reference_id: "book-1" } }));
      expect(res.status).toBe(200);
      expect(mockConfirm).not.toHaveBeenCalled();
      expect(mockCapture).not.toHaveBeenCalled();
    });

    it("does NOT expire a booking when the body says expired but Tabby says AUTHORIZED", async () => {
      mockRetrieve.mockResolvedValue({ ok: true, paymentStatus: "AUTHORIZED" });
      await POST(authed({ id: "pay_1", status: "expired", order: { reference_id: "book-1" } }));
      expect(mockStatusUpdate).not.toHaveBeenCalled();
      expect(mockConfirm).toHaveBeenCalledTimes(1);
    });

    it("returns 503 (so Tabby retries) when the status can't be verified", async () => {
      mockRetrieve.mockResolvedValue({ ok: false, errorMessage: "gateway timeout" });
      const res = await POST(authed({ id: "pay_1", status: "closed", order: { reference_id: "book-1" } }));
      expect(res.status).toBe(503);
      expect(mockConfirm).not.toHaveBeenCalled();
      expect(mockErrorLogInsert).toHaveBeenCalled();
    });
  });

  describe("settlement", () => {
    it("AUTHORIZED → captures then confirms", async () => {
      mockRetrieve.mockResolvedValue({ ok: true, paymentStatus: "AUTHORIZED" });
      const res = await POST(authed({ id: "pay_1", status: "authorized", order: { reference_id: "book-1" } }));
      expect(res.status).toBe(200);
      expect(mockCapture).toHaveBeenCalledWith("pay_1", 36645);
      expect(mockConfirm).toHaveBeenCalledTimes(1);
      expect(mockConfirm.mock.calls[0][0]).toMatchObject({ provider: "tabby", paymentRef: "pay_1", bookingId: "book-1" });
    });

    it("CLOSED → confirms without capturing", async () => {
      const res = await POST(authed({ id: "pay_1", status: "closed", order: { reference_id: "book-1" } }));
      expect(res.status).toBe(200);
      expect(mockCapture).not.toHaveBeenCalled();
      expect(mockConfirm).toHaveBeenCalledTimes(1);
    });

    it("refuses to capture when the booking has no price snapshot", async () => {
      mockRetrieve.mockResolvedValue({ ok: true, paymentStatus: "AUTHORIZED" });
      bookingData = { ...BOOKING, price_total_fils: null };
      const res = await POST(authed({ id: "pay_1", status: "authorized", order: { reference_id: "book-1" } }));
      expect(res.status).toBe(200);
      expect(mockCapture).not.toHaveBeenCalled();
      expect(mockConfirm).not.toHaveBeenCalled();
      expect(mockErrorLogInsert).toHaveBeenCalled();
    });

    it("REJECTED → marks payment_failed, does not confirm", async () => {
      mockRetrieve.mockResolvedValue({ ok: true, paymentStatus: "REJECTED" });
      const res = await POST(authed({ id: "pay_1", status: "rejected", order: { reference_id: "book-1" } }));
      expect(res.status).toBe(200);
      expect(mockStatusUpdate).toHaveBeenCalled();
      expect(mockStatusUpdate.mock.calls[0][0]).toEqual({ status: "payment_failed" });
      expect(mockConfirm).not.toHaveBeenCalled();
    });

    it("EXPIRED → marks expired, does not confirm", async () => {
      mockRetrieve.mockResolvedValue({ ok: true, paymentStatus: "EXPIRED" });
      const res = await POST(authed({ id: "pay_1", status: "expired", order: { reference_id: "book-1" } }));
      expect(res.status).toBe(200);
      expect(mockStatusUpdate.mock.calls[0][0]).toEqual({ status: "expired" });
      expect(mockConfirm).not.toHaveBeenCalled();
    });

    it("acks unknown bookings without confirming", async () => {
      bookingData = null;
      const res = await POST(authed({ id: "pay_x", status: "authorized", order: { reference_id: "missing" } }));
      expect(res.status).toBe(200);
      expect(mockConfirm).not.toHaveBeenCalled();
    });
  });
});
