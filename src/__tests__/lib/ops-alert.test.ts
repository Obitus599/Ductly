import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockFireN8nWebhook = vi.fn();
vi.mock("@/lib/n8n", () => ({
  fireN8nWebhook: (...args: unknown[]) => mockFireN8nWebhook(...args),
}));

import { fireOpsAlert } from "@/lib/ops-alert";

const OPS_URL = "https://n8n.example.com/webhook/ops-alert";

describe("fireOpsAlert", () => {
  const originalEnv = process.env.N8N_WEBHOOK_OPS_ALERT;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.N8N_WEBHOOK_OPS_ALERT;
    else process.env.N8N_WEBHOOK_OPS_ALERT = originalEnv;
  });

  it("is a no-op when N8N_WEBHOOK_OPS_ALERT is unset (dormant)", () => {
    delete process.env.N8N_WEBHOOK_OPS_ALERT;

    fireOpsAlert("new_booking", { bookingId: "book-1" });

    expect(mockFireN8nWebhook).not.toHaveBeenCalled();
  });

  it("fires to the ops-alert flow with the mapped label and normalized fields", () => {
    process.env.N8N_WEBHOOK_OPS_ALERT = OPS_URL;

    fireOpsAlert("cancellation", {
      bookingId: "book-9",
      customerName: "Jane Doe",
      customerPhone: "+971501234567",
      slotStart: "2026-04-20T10:00:00+04:00",
      extra: "By customer · Refund: succeeded",
      source: "customer_cancellation",
    });

    expect(mockFireN8nWebhook).toHaveBeenCalledTimes(1);
    const [flowName, url, payload] = mockFireN8nWebhook.mock.calls[0];
    expect(flowName).toBe("ops_alert");
    expect(url).toBe(OPS_URL);
    expect(payload).toMatchObject({
      event: "ops_alert",
      alert_type: "cancellation",
      alert_label: "Cancellation",
      booking_id: "book-9",
      customer_name: "Jane Doe",
      customer_phone: "+971501234567",
      slot_start: "2026-04-20T10:00:00+04:00",
      address: "",
      team_name: "",
      extra: "By customer · Refund: succeeded",
      source: "customer_cancellation",
    });
    // when_human is derived from slot_start (UAE-local, 12h)
    expect(payload.when_human).toContain("10:00 AM");
  });

  it("leaves when_human empty when no slotStart is given", () => {
    process.env.N8N_WEBHOOK_OPS_ALERT = OPS_URL;

    fireOpsAlert("blackout", { extra: "All teams" });

    const [, , payload] = mockFireN8nWebhook.mock.calls[0];
    expect(payload.alert_label).toBe("Calendar Blocked");
    expect(payload.when_human).toBe("");
  });

  it("maps every event type to a human label", () => {
    process.env.N8N_WEBHOOK_OPS_ALERT = OPS_URL;

    const expected: Record<string, string> = {
      new_booking: "New Booking",
      reschedule: "Reschedule",
      cancellation: "Cancellation",
      blackout: "Calendar Blocked",
      blackout_removed: "Block Removed",
      job_not_completed: "Job NOT Completed",
      payment_orphan: "PAID but NOT booked",
      invoice_failed: "Invoice FAILED",
    };

    for (const [event, label] of Object.entries(expected)) {
      mockFireN8nWebhook.mockClear();
      fireOpsAlert(event as Parameters<typeof fireOpsAlert>[0], {});
      const [, , payload] = mockFireN8nWebhook.mock.calls[0];
      expect(payload.alert_label).toBe(label);
    }
  });
});
