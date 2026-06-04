import { supabaseAdmin } from "@/utils/supabase/admin";
import { fireOpsAlert } from "@/lib/ops-alert";
import { issueInvoiceForBooking } from "@/lib/issue-invoice";

/**
 * Job-completion handling (#9). A team taps the ductly_job_status
 * quick-reply ("Completed" / "Not completed") on WhatsApp; Twilio posts
 * an inbound webhook here.
 *
 *   Completed     → mark the booking completed + issue the tax invoice.
 *   Not completed → alert Mattia + Ashwini (ops alert) to follow up.
 */
export type JobOutcome = "completed" | "not_completed";

export interface JobReplyResult {
  matched: boolean;
  outcome?: JobOutcome;
  bookingId?: string;
  invoiceNumber?: string;
  reason?: string;
}

/** "whatsapp:+9715..." or "+971 50 ..." → "+9715...". */
export function normalizeWhatsapp(raw: string): string {
  return raw.replace(/^whatsapp:/i, "").replace(/[^0-9+]/g, "");
}

/**
 * Map the quick-reply button id (preferred) or title to an outcome.
 * "not" is checked first since "not_completed" also contains "complete".
 */
export function outcomeFromButton(
  payload: string | undefined,
  text: string | undefined
): JobOutcome | null {
  const v = (payload || text || "").toLowerCase();
  if (!v) return null;
  if (v.includes("not")) return "not_completed";
  if (v.includes("complete")) return "completed";
  return null;
}

async function completeJob(bookingId: string): Promise<string | undefined> {
  await supabaseAdmin
    .from("bookings")
    .update({ status: "completed", completed_at: new Date().toISOString() } as never)
    .eq("id", bookingId);

  // Issue the invoice now so it exists with its number; WhatsApp delivery
  // of the PDF is wired separately once the ductly_invoice template is
  // approved. A missing price snapshot shouldn't fail the completion.
  try {
    const invoice = await issueInvoiceForBooking(bookingId);
    return invoice.invoice_number;
  } catch (err) {
    console.error(
      "invoice issue on completion failed:",
      err instanceof Error ? err.message : err
    );
    return undefined;
  }
}

async function alertNotCompleted(bookingId: string): Promise<void> {
  const { data: booking } = await supabaseAdmin
    .from("bookings")
    .select("slot_start, address, customer_id")
    .eq("id", bookingId)
    .returns<{ slot_start: string; address: string | null; customer_id: string }[]>()
    .maybeSingle();

  let customerName = "";
  let customerPhone = "";
  if (booking?.customer_id) {
    const { data: c } = await supabaseAdmin
      .from("customers")
      .select("name, phone")
      .eq("id", booking.customer_id)
      .returns<{ name: string; phone: string }[]>()
      .maybeSingle();
    if (c) {
      customerName = c.name;
      customerPhone = c.phone;
    }
  }

  fireOpsAlert("job_not_completed", {
    bookingId,
    customerName,
    customerPhone,
    slotStart: booking?.slot_start,
    address: booking?.address || "",
    extra: "Team reported the job was NOT completed — please follow up.",
    source: "job_status_reply",
  });
}

/**
 * Process an inbound job-status button reply: match it to the most recent
 * pending prompt for the replying number, record the response, and run
 * the follow-up (invoice or ops alert).
 */
export async function processJobStatusReply(args: {
  from: string;
  buttonPayload?: string;
  buttonText?: string;
}): Promise<JobReplyResult> {
  const number = normalizeWhatsapp(args.from);
  const outcome = outcomeFromButton(args.buttonPayload, args.buttonText);
  if (!outcome) return { matched: false, reason: "unrecognized_button" };

  const { data: prompt } = await supabaseAdmin
    .from("job_status_prompts")
    .select("id, booking_id, team_id")
    .eq("team_whatsapp", number)
    .eq("status", "pending")
    .order("sent_at", { ascending: false })
    .limit(1)
    .returns<{ id: string; booking_id: string; team_id: string | null }[]>()
    .maybeSingle();

  if (!prompt) return { matched: false, outcome, reason: "no_pending_prompt" };

  await supabaseAdmin
    .from("job_status_prompts")
    .update({ status: outcome, responded_at: new Date().toISOString() } as never)
    .eq("id", prompt.id);

  if (outcome === "completed") {
    const invoiceNumber = await completeJob(prompt.booking_id);
    return { matched: true, outcome, bookingId: prompt.booking_id, invoiceNumber };
  }

  await alertNotCompleted(prompt.booking_id);
  return { matched: true, outcome, bookingId: prompt.booking_id };
}
