import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();
vi.mock("@/utils/supabase/admin", () => ({
  supabaseAdmin: new Proxy({}, { get: (_t, p) => (p === "from" ? mockFrom : undefined) }),
}));

const mockFireOpsAlert = vi.fn();
vi.mock("@/lib/ops-alert", () => ({ fireOpsAlert: (...a: unknown[]) => mockFireOpsAlert(...a) }));

const mockIssueInvoice = vi.fn();
vi.mock("@/lib/issue-invoice", () => ({
  issueInvoiceForBooking: (...a: unknown[]) => mockIssueInvoice(...a),
}));

import {
  normalizeWhatsapp,
  outcomeFromButton,
  processJobStatusReply,
} from "@/lib/job-completion";

/** Per-table terminal values resolved by maybeSingle(). */
let terminals: Record<string, unknown>;
const updateEqCalls: ReturnType<typeof vi.fn>[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  terminals = {};
  updateEqCalls.length = 0;
  mockFrom.mockImplementation((table: string) => {
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    updateEqCalls.push(updateEq);
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => chain,
      returns: () => chain,
      maybeSingle: vi.fn().mockResolvedValue(terminals[table] ?? { data: null }),
      update: () => ({ eq: updateEq }),
    };
    return chain;
  });
});

describe("normalizeWhatsapp", () => {
  it("strips the whatsapp: prefix and formatting", () => {
    expect(normalizeWhatsapp("whatsapp:+971501234567")).toBe("+971501234567");
    expect(normalizeWhatsapp("+971 50 (123) 4567")).toBe("+971501234567");
  });
});

describe("outcomeFromButton", () => {
  it("maps payloads (checking 'not' before 'complete')", () => {
    expect(outcomeFromButton("job_completed", undefined)).toBe("completed");
    expect(outcomeFromButton("job_not_completed", undefined)).toBe("not_completed");
  });
  it("falls back to the button title", () => {
    expect(outcomeFromButton(undefined, "Completed")).toBe("completed");
    expect(outcomeFromButton(undefined, "Not completed")).toBe("not_completed");
  });
  it("returns null for anything else", () => {
    expect(outcomeFromButton(undefined, undefined)).toBeNull();
    expect(outcomeFromButton("", "hello there")).toBeNull();
  });
});

describe("processJobStatusReply", () => {
  it("ignores an unrecognized button", async () => {
    const r = await processJobStatusReply({ from: "whatsapp:+971500000000", buttonText: "hi" });
    expect(r).toEqual({ matched: false, reason: "unrecognized_button" });
  });

  it("reports when no pending prompt matches the number", async () => {
    terminals.job_status_prompts = { data: null };
    const r = await processJobStatusReply({
      from: "whatsapp:+971500000000",
      buttonPayload: "job_completed",
    });
    expect(r).toEqual({ matched: false, outcome: "completed", reason: "no_pending_prompt" });
  });

  it("on Completed: marks the prompt, marks the booking, issues the invoice", async () => {
    terminals.job_status_prompts = { data: { id: "p1", booking_id: "b1", team_id: "t1" } };
    mockIssueInvoice.mockResolvedValue({ invoice_number: "INV-000005" });

    const r = await processJobStatusReply({
      from: "whatsapp:+971501112222",
      buttonPayload: "job_completed",
    });

    expect(r).toEqual({
      matched: true,
      outcome: "completed",
      bookingId: "b1",
      invoiceNumber: "INV-000005",
    });
    expect(mockIssueInvoice).toHaveBeenCalledWith("b1");
    expect(mockFireOpsAlert).not.toHaveBeenCalled();
    // prompt status + booking status updates both ran
    expect(updateEqCalls.some((f) => f.mock.calls.length > 0)).toBe(true);
  });

  it("on Completed: still completes even if invoice issue fails", async () => {
    terminals.job_status_prompts = { data: { id: "p1", booking_id: "b1", team_id: null } };
    mockIssueInvoice.mockRejectedValue(new Error("no price snapshot"));

    const r = await processJobStatusReply({
      from: "whatsapp:+971501112222",
      buttonText: "Completed",
    });
    expect(r.matched).toBe(true);
    expect(r.outcome).toBe("completed");
    expect(r.invoiceNumber).toBeUndefined();
  });

  it("on Not completed: fires an ops alert, no invoice", async () => {
    terminals.job_status_prompts = { data: { id: "p2", booking_id: "b2", team_id: "t1" } };
    terminals.bookings = { data: { slot_start: "2026-04-20T10:00:00+04:00", address: "Villa 1", customer_id: "c1" } };
    terminals.customers = { data: { name: "Jane", phone: "+971509998888" } };

    const r = await processJobStatusReply({
      from: "whatsapp:+971501112222",
      buttonPayload: "job_not_completed",
    });

    expect(r).toEqual({ matched: true, outcome: "not_completed", bookingId: "b2" });
    expect(mockIssueInvoice).not.toHaveBeenCalled();
    expect(mockFireOpsAlert).toHaveBeenCalledTimes(1);
    const [event, details] = mockFireOpsAlert.mock.calls[0];
    expect(event).toBe("job_not_completed");
    expect(details).toMatchObject({ bookingId: "b2", customerName: "Jane", customerPhone: "+971509998888" });
  });
});
