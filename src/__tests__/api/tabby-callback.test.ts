import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockRetrieve = vi.fn();
const mockCapture = vi.fn();
vi.mock("@/lib/tabby", () => ({
  tabbyConfigured: () => true,
  retrievePayment: (...a: unknown[]) => mockRetrieve(...a),
  capturePayment: (...a: unknown[]) => mockCapture(...a),
}));

const mockConfirm = vi.fn();
vi.mock("@/lib/booking-confirmation", () => ({
  confirmPaidBooking: (...a: unknown[]) => mockConfirm(...a),
}));

let bookingData: Record<string, unknown> | null = null;
const updates: Record<string, unknown>[] = [];
const lockDeletes: unknown[] = [];
vi.mock("@/utils/supabase/admin", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === "bookings") {
        return {
          select: () => ({
            eq: () => ({ returns: () => ({ maybeSingle: () => Promise.resolve({ data: bookingData }) }) }),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: (_c: string, id: string) => { updates.push({ id, ...payload }); return Promise.resolve({ error: null }); },
          }),
        };
      }
      if (table === "customers") {
        return {
          select: () => ({
            eq: () => ({ returns: () => ({ maybeSingle: () => Promise.resolve({ data: { name: "A", email: "a@t.com", phone: "+9715" } }) }) }),
          }),
        };
      }
      if (table === "booking_locks") return { delete: () => ({ eq: (_c: string, v: string) => { lockDeletes.push(v); return Promise.resolve({}); } }) };
      if (table === "error_log") return { insert: vi.fn().mockResolvedValue({ error: null }) };
      return {};
    },
  },
}));

import { GET } from "@/app/api/tabby/callback/route";

function call(qs: string): Promise<Response> {
  return GET(new NextRequest(`http://localhost:3000/api/tabby/callback?${qs}`)) as unknown as Promise<Response>;
}
const loc = (res: Response) => res.headers.get("location") || "";

const BOOKING = {
  id: "book-1", status: "pending", tabby_payment_id: "pay_1",
  slot_start: "2026-08-01T10:00:00+04:00", address: "Marina",
  is_test_data: true, price_total_fils: 36645, customer_id: "cust-1",
};

describe("GET /api/tabby/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updates.length = 0; lockDeletes.length = 0;
    bookingData = { ...BOOKING };
    mockRetrieve.mockResolvedValue({ ok: true, paymentStatus: "AUTHORIZED" });
    mockCapture.mockResolvedValue({ ok: true, paymentStatus: "CLOSED" });
    mockConfirm.mockResolvedValue({ confirmed: true });
  });

  it("AUTHORIZED → captures, confirms, redirects to success", async () => {
    const res = await call("booking_id=book-1&session_id=s1&result=success");
    expect(mockCapture).toHaveBeenCalledWith("pay_1", 36645);
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(loc(res)).toContain("/book/success?booking_id=book-1");
  });

  it("CLOSED → confirms without capturing", async () => {
    mockRetrieve.mockResolvedValue({ ok: true, paymentStatus: "CLOSED" });
    const res = await call("booking_id=book-1&result=success");
    expect(mockCapture).not.toHaveBeenCalled();
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(loc(res)).toContain("/book/success");
  });

  it("does NOT trust result=cancel when Tabby says AUTHORIZED (no orphaned charge)", async () => {
    // The critical case: browser hits the cancel URL but the payment authorized.
    const res = await call("booking_id=book-1&result=cancel");
    expect(mockCapture).toHaveBeenCalledTimes(1);
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(updates.find((u) => u.status === "expired")).toBeUndefined(); // never expired
    expect(loc(res)).toContain("/book/success");
  });

  it("REJECTED → marks payment_failed, no confirm", async () => {
    mockRetrieve.mockResolvedValue({ ok: true, paymentStatus: "REJECTED" });
    const res = await call("booking_id=book-1&result=success");
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(updates.find((u) => u.status === "payment_failed")).toBeTruthy();
    expect(loc(res)).toContain("payment_failed=1");
  });

  it("EXPIRED → releases lock, marks expired, no confirm", async () => {
    mockRetrieve.mockResolvedValue({ ok: true, paymentStatus: "EXPIRED" });
    const res = await call("booking_id=book-1&session_id=s1&result=cancel");
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(updates.find((u) => u.status === "expired")).toBeTruthy();
    expect(lockDeletes).toContain("s1");
    expect(loc(res)).toContain("cancelled=1");
  });

  it("capture failure → logs + payment_failed, no confirm", async () => {
    mockCapture.mockResolvedValue({ ok: false, errorMessage: "declined" });
    mockRetrieve.mockResolvedValue({ ok: true, paymentStatus: "AUTHORIZED" }); // stays AUTHORIZED on recheck
    const res = await call("booking_id=book-1&result=success");
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(loc(res)).toContain("payment_failed=1");
  });

  it("unknown booking → redirects to /book, no confirm", async () => {
    bookingData = null;
    const res = await call("booking_id=missing&result=success");
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(loc(res)).toContain("/book");
  });
});
