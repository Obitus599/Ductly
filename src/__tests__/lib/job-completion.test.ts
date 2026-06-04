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

/**
 * Per-table terminals:
 *   list   → resolved when the query chain is awaited directly (.returns())
 *   single → resolved by .maybeSingle()
 * The chain is thenable so `await from(t)....returns()` yields `list`.
 */
let terminals: Record<string, { list?: unknown; single?: unknown }>;

beforeEach(() => {
  vi.clearAllMocks();
  terminals = {};
  mockFrom.mockImplementation((table: string) => {
    const t = () => terminals[table] || {};
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      gte: () => chain,
      lt: () => chain,
      is: () => chain,
      order: () => chain,
      limit: () => chain,
      update: () => chain,
      delete: () => chain,
      insert: () => chain,
      returns: () => chain,
      maybeSingle: () => Promise.resolve(t().single ?? { data: null }),
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve(t().list ?? { data: [], error: null }).then(res, rej),
    };
    return chain;
  });
});

describe("normalizeWhatsapp / outcomeFromButton", () => {
  it("normalizes numbers", () => {
    expect(normalizeWhatsapp("whatsapp:+971501234567")).toBe("+971501234567");
    expect(normalizeWhatsapp("+971 50 (123) 4567")).toBe("+971501234567");
  });
  it("maps buttons, checking 'not' before 'complete'", () => {
    expect(outcomeFromButton("job_completed", undefined)).toBe("completed");
    expect(outcomeFromButton("job_not_completed", undefined)).toBe("not_completed");
    expect(outcomeFromButton(undefined, "Completed")).toBe("completed");
    expect(outcomeFromButton(undefined, "Not completed")).toBe("not_completed");
    expect(outcomeFromButton(undefined, undefined)).toBeNull();
  });
});

describe("processJobStatusReply", () => {
  it("ignores an unrecognized button", async () => {
    const r = await processJobStatusReply({ from: "whatsapp:+971500000000", buttonText: "hi" });
    expect(r).toEqual({ matched: false, reason: "unrecognized_button" });
  });

  it("no pending prompt → matched:false", async () => {
    terminals.job_status_prompts = { list: { data: [] } };
    const r = await processJobStatusReply({ from: "whatsapp:+971500000000", buttonPayload: "job_completed" });
    expect(r).toEqual({ matched: false, outcome: "completed", reason: "no_pending_prompt" });
  });

  it("REFUSES to auto-resolve when 2+ prompts are pending (ambiguous)", async () => {
    terminals.job_status_prompts = {
      list: { data: [{ id: "p2", booking_id: "b2" }, { id: "p1", booking_id: "b1" }] },
    };
    const r = await processJobStatusReply({ from: "whatsapp:+971501112222", buttonPayload: "job_completed" });
    expect(r).toEqual({ matched: false, outcome: "completed", reason: "ambiguous_pending" });
    expect(mockIssueInvoice).not.toHaveBeenCalled();
  });

  it("Completed (confirmed booking) → completes + issues invoice", async () => {
    terminals.job_status_prompts = { list: { data: [{ id: "p1", booking_id: "b1", team_id: "t1" }] } };
    terminals.bookings = { list: { data: [{ id: "b1" }] } }; // status='confirmed' update matched 1 row
    mockIssueInvoice.mockResolvedValue({ invoice_number: "INV-000005" });

    const r = await processJobStatusReply({ from: "whatsapp:+971501112222", buttonPayload: "job_completed" });
    expect(r).toEqual({ matched: true, outcome: "completed", bookingId: "b1", invoiceNumber: "INV-000005" });
    expect(mockIssueInvoice).toHaveBeenCalledWith("b1");
  });

  it("Completed on a non-confirmed booking → no invoice (status guard)", async () => {
    terminals.job_status_prompts = { list: { data: [{ id: "p1", booking_id: "b1", team_id: "t1" }] } };
    terminals.bookings = { list: { data: [] } }; // update matched 0 rows (booking not 'confirmed')

    const r = await processJobStatusReply({ from: "whatsapp:+971501112222", buttonText: "Completed" });
    expect(r).toEqual({ matched: true, outcome: "completed", bookingId: "b1", invoiceNumber: undefined });
    expect(mockIssueInvoice).not.toHaveBeenCalled();
  });

  it("Not completed → ops alert, no invoice", async () => {
    terminals.job_status_prompts = { list: { data: [{ id: "p2", booking_id: "b2", team_id: "t1" }] } };
    terminals.bookings = { single: { data: { slot_start: "2026-04-20T10:00:00+04:00", address: "Villa 1", customer_id: "c1" } } };
    terminals.customers = { single: { data: { name: "Jane", phone: "+971509998888" } } };

    const r = await processJobStatusReply({ from: "whatsapp:+971501112222", buttonPayload: "job_not_completed" });
    expect(r).toEqual({ matched: true, outcome: "not_completed", bookingId: "b2" });
    expect(mockIssueInvoice).not.toHaveBeenCalled();
    expect(mockFireOpsAlert).toHaveBeenCalledTimes(1);
    const [event, details] = mockFireOpsAlert.mock.calls[0];
    expect(event).toBe("job_not_completed");
    expect(details).toMatchObject({ bookingId: "b2", customerName: "Jane", customerPhone: "+971509998888" });
  });
});
