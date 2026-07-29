import { describe, it, expect, vi, beforeEach } from "vitest";

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

let pendingRows: Record<string, unknown>[] = [];
const statusUpdates: Record<string, unknown>[] = [];
const errorLogs: Record<string, unknown>[] = [];

vi.mock("@/utils/supabase/admin", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === "bookings") {
        return {
          select: () => ({
            in: () => ({
              not: () => ({
                lt: () => ({
                  gt: () => ({
                    limit: () => ({
                      returns: () => Promise.resolve({ data: pendingRows }),
                    }),
                  }),
                }),
              }),
            }),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: () => ({
              eq: () => {
                statusUpdates.push(payload);
                return Promise.resolve({ error: null });
              },
            }),
          }),
        };
      }
      if (table === "customers") {
        return {
          select: () => ({
            eq: () => ({
              returns: () => ({
                maybeSingle: () =>
                  Promise.resolve({ data: { name: "A", email: "a@t.com", phone: "+9715" } }),
              }),
            }),
          }),
        };
      }
      if (table === "error_log") {
        return {
          insert: (row: Record<string, unknown>) => {
            errorLogs.push(row);
            return Promise.resolve({ error: null });
          },
        };
      }
      return {};
    },
  },
}));

import { reconcileTabbyPayments } from "@/lib/tabby-reconcile";

const ROW = {
  id: "book-1",
  status: "pending",
  tabby_payment_id: "pay_1",
  slot_start: "2026-08-01T10:00:00+04:00",
  address: "Marina",
  is_test_data: true,
  price_total_fils: 36645,
  customer_id: "cust-1",
};

describe("reconcileTabbyPayments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    statusUpdates.length = 0;
    errorLogs.length = 0;
    pendingRows = [{ ...ROW }];
    mockConfirm.mockResolvedValue({ confirmed: true });
    mockCapture.mockResolvedValue({ ok: true, paymentStatus: "CLOSED" });
  });

  it("captures and confirms an orphaned AUTHORIZED payment", async () => {
    // The gap this closes: the customer approved in Tabby, then the tab
    // closed AND the webhook never arrived. Money authorized, booking
    // stuck pending, authorization silently expiring days later.
    mockRetrieve.mockResolvedValue({ ok: true, paymentStatus: "AUTHORIZED" });

    const result = await reconcileTabbyPayments();

    expect(mockCapture).toHaveBeenCalledWith("pay_1", 36645);
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ scanned: 1, confirmed: 1 });
  });

  it("confirms a CLOSED payment without re-capturing", async () => {
    mockRetrieve.mockResolvedValue({ ok: true, paymentStatus: "CLOSED" });

    const result = await reconcileTabbyPayments();

    expect(mockCapture).not.toHaveBeenCalled();
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(result.confirmed).toBe(1);
  });

  it("recovers a booking the stale sweep already flipped to expired", async () => {
    pendingRows = [{ ...ROW, status: "expired" }];
    mockRetrieve.mockResolvedValue({ ok: true, paymentStatus: "CLOSED" });

    const result = await reconcileTabbyPayments();

    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(result.confirmed).toBe(1);
  });

  it("marks REJECTED payments payment_failed without confirming", async () => {
    mockRetrieve.mockResolvedValue({ ok: true, paymentStatus: "REJECTED" });

    const result = await reconcileTabbyPayments();

    expect(statusUpdates).toEqual([{ status: "payment_failed" }]);
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(result.failed).toBe(1);
  });

  it("marks EXPIRED payments expired without confirming", async () => {
    mockRetrieve.mockResolvedValue({ ok: true, paymentStatus: "EXPIRED" });

    const result = await reconcileTabbyPayments();

    expect(statusUpdates).toEqual([{ status: "expired" }]);
    expect(result.expired).toBe(1);
  });

  it("leaves a CREATED payment alone (customer may still be paying)", async () => {
    mockRetrieve.mockResolvedValue({ ok: true, paymentStatus: "CREATED" });

    const result = await reconcileTabbyPayments();

    expect(statusUpdates).toHaveLength(0);
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(result.stillPending).toBe(1);
  });

  it("makes NO state change when Tabby can't be reached", async () => {
    mockRetrieve.mockResolvedValue({ ok: false, errorMessage: "timeout" });

    const result = await reconcileTabbyPayments();

    expect(statusUpdates).toHaveLength(0);
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(result.errors).toBe(1);
  });

  it("refuses to capture a booking with no price snapshot", async () => {
    pendingRows = [{ ...ROW, price_total_fils: null }];
    mockRetrieve.mockResolvedValue({ ok: true, paymentStatus: "AUTHORIZED" });

    const result = await reconcileTabbyPayments();

    expect(mockCapture).not.toHaveBeenCalled();
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(errorLogs).toHaveLength(1);
    expect(result.errors).toBe(1);
  });

  it("one failing booking doesn't abort the rest of the sweep", async () => {
    pendingRows = [
      { ...ROW, id: "book-1", tabby_payment_id: "pay_1" },
      { ...ROW, id: "book-2", tabby_payment_id: "pay_2" },
    ];
    mockRetrieve
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue({ ok: true, paymentStatus: "CLOSED" });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await reconcileTabbyPayments();

    expect(result.scanned).toBe(2);
    expect(result.errors).toBe(1);
    expect(result.confirmed).toBe(1);
  });

  it("is a no-op with nothing to reconcile", async () => {
    pendingRows = [];
    const result = await reconcileTabbyPayments();
    expect(result.scanned).toBe(0);
    expect(mockRetrieve).not.toHaveBeenCalled();
  });
});
