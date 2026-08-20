import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockSendWhatsAppTemplate = vi.fn();
vi.mock("@/lib/twilio-whatsapp", () => ({
  sendWhatsAppTemplate: (...args: unknown[]) => mockSendWhatsAppTemplate(...args),
}));
vi.mock("@/utils/supabase/admin", () => ({
  supabaseAdmin: {
    from: () => ({
      insert: () => ({ then: (cb: () => void) => cb() }),
    }),
  },
}));

import { fireOpsAlert } from "@/lib/ops-alert";

const SID = "HXopsalert";

describe("fireOpsAlert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.OWNER_WHATSAPP;
    delete process.env.TWILIO_CONTENT_SID_DUCTLY_OPS_ALERT;
  });

  it("is a no-op when OWNER_WHATSAPP is unset (dormant)", () => {
    delete process.env.OWNER_WHATSAPP;
    process.env.TWILIO_CONTENT_SID_DUCTLY_OPS_ALERT = SID;

    fireOpsAlert("new_booking", { bookingId: "book-1" });

    expect(mockSendWhatsAppTemplate).not.toHaveBeenCalled();
  });

  it("is a no-op when the content SID is missing (dormant)", () => {
    process.env.OWNER_WHATSAPP = "+971558190717";
    delete process.env.TWILIO_CONTENT_SID_DUCTLY_OPS_ALERT;

    fireOpsAlert("new_booking", { bookingId: "book-1" });

    expect(mockSendWhatsAppTemplate).not.toHaveBeenCalled();
  });

  it("fans out to every number in the comma-separated OWNER_WHATSAPP", async () => {
    process.env.OWNER_WHATSAPP = " +971558190717 , +971502749454,+917042009519 ";
    process.env.TWILIO_CONTENT_SID_DUCTLY_OPS_ALERT = SID;
    mockSendWhatsAppTemplate.mockResolvedValue({ ok: true });

    fireOpsAlert("cancellation", {
      bookingId: "book-9",
      customerName: "Jane Doe",
      slotStart: "2026-04-20T10:00:00+04:00",
      extra: "By customer",
    });

    await new Promise((r) => setTimeout(r, 0));

    expect(mockSendWhatsAppTemplate).toHaveBeenCalledTimes(3);
    const tos = mockSendWhatsAppTemplate.mock.calls.map((c) => c[0]);
    expect(tos).toEqual(["+971558190717", "+971502749454", "+917042009519"]);
  });

  it("maps the event label and formats the slot time into template variables", async () => {
    process.env.OWNER_WHATSAPP = "+971558190717";
    process.env.TWILIO_CONTENT_SID_DUCTLY_OPS_ALERT = SID;
    mockSendWhatsAppTemplate.mockResolvedValue({ ok: true });

    fireOpsAlert("new_booking", {
      bookingId: "book-9",
      customerName: "Jane Doe",
      slotStart: "2026-04-20T10:00:00+04:00",
      address: "Business Bay",
      teamName: "Team A",
      extra: "Signature Plan · AED 549",
    });

    await new Promise((r) => setTimeout(r, 0));

    const [, , variables] = mockSendWhatsAppTemplate.mock.calls[0];
    expect(variables).toMatchObject({
      "1": "New Booking",
      "2": "Jane Doe",
      "4": "Business Bay",
      "5": "Team A",
      "6": "Signature Plan · AED 549",
    });
    expect(variables["3"]).toContain("10:00 AM");
  });

  it("maps every event type to a human label", async () => {
    process.env.OWNER_WHATSAPP = "+971558190717";
    process.env.TWILIO_CONTENT_SID_DUCTLY_OPS_ALERT = SID;
    mockSendWhatsAppTemplate.mockResolvedValue({ ok: true });

    const expected: Record<string, string> = {
      new_booking: "New Booking",
      reschedule: "Reschedule",
      cancellation: "Cancellation",
      blackout: "Calendar Blocked",
      blackout_removed: "Block Removed",
      job_not_completed: "Job NOT Completed",
      payment_orphan: "PAID but NOT booked",
      invoice_failed: "Invoice FAILED",
      refund_required: "REFUND REQUIRED",
    };

    for (const [event, label] of Object.entries(expected)) {
      mockSendWhatsAppTemplate.mockClear();
      fireOpsAlert(event as Parameters<typeof fireOpsAlert>[0], {});
      await new Promise((r) => setTimeout(r, 0));
      const [, , variables] = mockSendWhatsAppTemplate.mock.calls[0];
      expect(variables["1"]).toBe(label);
    }
  });
});
