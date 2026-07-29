import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/scheduling-agent", () => ({
  assignTeamToBooking: vi.fn().mockResolvedValue({ teamId: "team-1", method: "fallback" }),
}));
vi.mock("@/lib/n8n", () => ({ fireN8nWebhook: vi.fn() }));
vi.mock("@/lib/ops-alert", () => ({ fireOpsAlert: vi.fn() }));

// Slot fulfillability check (guards the expired-recovery path). Default to
// fulfillable; the unfulfillable case has its own test.
const mockFulfillable = vi.fn().mockResolvedValue({ ok: true });
vi.mock("@/lib/slot-capacity", () => ({
  isSlotFulfillable: (...a: unknown[]) => mockFulfillable(...a),
}));

let currentStatus = "pending";
/** Statuses the CAS is allowed to transition FROM. */
let casAllowed: string[] = [];
const errorLogs: Record<string, unknown>[] = [];

vi.mock("@/utils/supabase/admin", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === "bookings") {
        return {
          select: () => ({
            eq: () => ({
              returns: () => ({
                single: () => Promise.resolve({ data: { status: currentStatus, slot_end: "2026-08-01T11:30:00+04:00" } }),
                maybeSingle: () => Promise.resolve({ data: { status: currentStatus, slot_end: "2026-08-01T11:30:00+04:00" } }),
              }),
            }),
          }),
          update: () => ({
            eq: () => ({
              in: (_col: string, statuses: string[]) => {
                casAllowed = statuses;
                const matched = statuses.includes(currentStatus);
                return {
                  select: () => ({
                    returns: () =>
                      Promise.resolve({ data: matched ? [{ id: "book-1" }] : [] }),
                  }),
                };
              },
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

import { confirmPaidBooking } from "@/lib/booking-confirmation";

const INPUT = {
  bookingId: "book-1",
  slotStart: "2026-08-01T10:00:00+04:00",
  address: "Marina",
  provider: "tabby" as const,
  paymentRef: "pay_1",
  isTest: true,
};

describe("confirmPaidBooking — compare-and-swap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    errorLogs.length = 0;
    casAllowed = [];
    mockFulfillable.mockResolvedValue({ ok: true });
    // Keep the dispatch/notify side-effects dormant.
    delete process.env.N8N_WEBHOOK_TEAM_DISPATCH;
    delete process.env.N8N_WEBHOOK_BOOKING_CONFIRMED;
    delete process.env.N8N_WEBHOOK_OPS_ALERT;
  });

  it("confirms from pending", async () => {
    currentStatus = "pending";
    const result = await confirmPaidBooking(INPUT);
    expect(result.confirmed).toBe(true);
  });

  it("confirms from payment_failed (a retried payment that eventually succeeded)", async () => {
    currentStatus = "payment_failed";
    const result = await confirmPaidBooking(INPUT);
    expect(result.confirmed).toBe(true);
  });

  it("confirms from expired when the slot is STILL serviceable", async () => {
    // A slow-but-successful payment that landed just after the sweep, and
    // the slot is still free + in the future.
    currentStatus = "expired";
    mockFulfillable.mockResolvedValue({ ok: true });
    const result = await confirmPaidBooking(INPUT);
    expect(result.confirmed).toBe(true);
    expect(casAllowed).toContain("expired");
  });

  it("REFUSES to confirm an expired booking whose slot is no longer serviceable", async () => {
    // The regression this guards: a late settle (reconciler, days later, or
    // a slot that was resold) must NOT confirm and double-sell/serve a past
    // slot. It returns slot_unavailable so the Tabby caller refunds.
    currentStatus = "expired";
    mockFulfillable.mockResolvedValue({ ok: false, reason: "no_capacity" });
    const result = await confirmPaidBooking(INPUT);
    expect(result.confirmed).toBe(false);
    expect(result.reason).toBe("slot_unavailable");
    expect(casAllowed).not.toContain("expired"); // CAS never ran
    expect(errorLogs.some((e) => e.flow_name === "confirm_slot_unavailable")).toBe(true);
  });

  it("is idempotent — a second call on a confirmed booking does nothing", async () => {
    currentStatus = "confirmed";
    const result = await confirmPaidBooking(INPUT);
    expect(result.confirmed).toBe(false);
    expect(result.reason).toBe("already_confirmed");
  });

  it("refuses to confirm a cancelled booking and escalates for refund", async () => {
    // Verified money against a booking we can't fulfil is a
    // captured-but-unfulfillable charge — it must never pass silently.
    currentStatus = "cancelled";
    const result = await confirmPaidBooking(INPUT);
    expect(result.confirmed).toBe(false);
    expect(result.reason).toBe("not_confirmable");
    expect(errorLogs).toHaveLength(1);
    expect(errorLogs[0].flow_name).toBe("confirm_not_confirmable");
    expect(String(errorLogs[0].error_message)).toMatch(/REFUND REQUIRED/);
  });

  it("refuses to confirm a completed booking", async () => {
    currentStatus = "completed";
    const result = await confirmPaidBooking(INPUT);
    expect(result.confirmed).toBe(false);
    expect(errorLogs).toHaveLength(1);
  });
});
