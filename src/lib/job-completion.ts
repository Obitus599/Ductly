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
  // Only a still-confirmed booking can be completed. Scoping the update
  // to status='confirmed' (and checking rows affected) prevents flipping
  // an already-cancelled/refunded, expired, or already-completed booking
  // back to completed — and makes concurrent replies (Twilio retries /
  // double taps) idempotent: the second update matches 0 rows.
  const { data: updated } = await supabaseAdmin
    .from("bookings")
    .update({ status: "completed", completed_at: new Date().toISOString() } as never)
    .eq("id", bookingId)
    .eq("status", "confirmed")
    .select("id")
    .returns<{ id: string }[]>();

  if (!updated || updated.length === 0) {
    console.warn(
      `[job-completion] booking ${bookingId} was not in 'confirmed' state; skipping completion + invoice`
    );
    return undefined;
  }

  // Issue the invoice now so it exists with its number; WhatsApp delivery
  // of the PDF is wired separately once the ductly_invoice template is
  // approved. A missing price snapshot shouldn't fail the completion.
  try {
    const invoice = await issueInvoiceForBooking(bookingId);
    return invoice.invoice_number;
  } catch (err) {
    // Don't fail the completion, but DON'T let a missing invoice be
    // silent either — the booking is now completed and the FTA trail
    // needs this. Record it durably and alert the owners to re-issue
    // via GET /api/invoices/[bookingId].
    const message = err instanceof Error ? err.message : String(err);
    console.error("invoice issue on completion failed:", message);
    await supabaseAdmin
      .from("error_log")
      .insert({
        flow_name: "invoice_on_completion",
        error_message: message,
        payload: { booking_id: bookingId },
      } as never)
      .then(({ error }) => {
        if (error) console.error("error_log insert failed:", error.message);
      });
    fireOpsAlert("invoice_failed", {
      bookingId,
      extra: `Job completed but invoice issuance FAILED (${message}). Re-issue from the admin booking page.`,
      source: "invoice_on_completion",
    });
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

  // The button id alone can't say WHICH booking; we correlate by the
  // replying number's pending prompt. Fetch up to 2 so we can detect
  // ambiguity — if a team has 2+ jobs awaiting a reply we must NOT guess
  // (we'd invoice/complete the wrong booking). The send side must avoid
  // leaving a team with >1 pending prompt (serialize, or embed a
  // booking ref); until then we refuse to auto-resolve the ambiguous case.
  const { data: pending } = await supabaseAdmin
    .from("job_status_prompts")
    .select("id, booking_id, team_id")
    .eq("team_whatsapp", number)
    .eq("status", "pending")
    .order("sent_at", { ascending: false })
    .limit(2)
    .returns<{ id: string; booking_id: string; team_id: string | null }[]>();

  const prompts = pending || [];
  if (prompts.length === 0) return { matched: false, outcome, reason: "no_pending_prompt" };
  if (prompts.length > 1) {
    console.error(
      `[job-completion] ${prompts.length}+ pending prompts for ${number}; refusing to auto-resolve (ambiguous)`
    );
    return { matched: false, outcome, reason: "ambiguous_pending" };
  }
  const prompt = prompts[0];

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
