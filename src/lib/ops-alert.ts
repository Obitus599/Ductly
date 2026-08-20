import { supabaseAdmin } from "@/utils/supabase/admin";
import { sendWhatsAppTemplate } from "@/lib/twilio-whatsapp";
import { formatSlotForDispatch } from "@/lib/dispatch-format";

/**
 * Operations alerts — internal WhatsApp notifications to the owners whenever
 * the calendar changes or a job is reported not-completed.
 *
 * Recipients live in OWNER_WHATSAPP as a COMMA-SEPARATED list of numbers,
 * e.g. "+971558190717,+971502749454". Every alert is fanned out to each
 * number directly via Twilio (the `ductly_ops_alert` Content template) so
 * there is no dependency on n8n for delivery.
 *
 * DORMANT BY DEFAULT: if OWNER_WHATSAPP is unset/empty or the template SID
 * (TWILIO_CONTENT_SID_DUCTLY_OPS_ALERT) is missing, fireOpsAlert is a no-op.
 */
export type OpsAlertEvent =
  | "new_booking"
  | "reschedule"
  | "cancellation"
  | "blackout"
  | "blackout_removed"
  | "job_not_completed"
  | "payment_orphan"
  | "invoice_failed"
  | "refund_required";

/** Human-readable label sent to the template (variable 1). */
const EVENT_LABELS: Record<OpsAlertEvent, string> = {
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

export interface OpsAlertDetails {
  bookingId?: string;
  customerName?: string;
  customerPhone?: string;
  /** ISO slot start — formatted to UAE-local for the "when" line. */
  slotStart?: string;
  address?: string;
  teamName?: string;
  /** Free-form context: reason, old→new slot, refund status, who triggered. */
  extra?: string;
  /** Origin tag for debugging (e.g. "online_booking", "admin"). */
  source?: string;
}

/**
 * Fire-and-forget operations alert. Never blocks or throws into the
 * caller — each send is async and failures are logged to error_log.
 */
export function fireOpsAlert(event: OpsAlertEvent, details: OpsAlertDetails): void {
  const contentSid = process.env.TWILIO_CONTENT_SID_DUCTLY_OPS_ALERT || "";
  const numbers = (process.env.OWNER_WHATSAPP || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (numbers.length === 0 || !contentSid) return; // dormant until configured

  const whenHuman = details.slotStart ? formatSlotForDispatch(details.slotStart) : "";

  const variables: Record<string, string> = {
    "1": EVENT_LABELS[event],
    "2": details.customerName || "",
    "3": whenHuman,
    "4": details.address || "",
    "5": details.teamName || "",
    "6": details.extra || "",
  };

  for (const to of numbers) {
    sendWhatsAppTemplate(to, contentSid, variables)
      .then((res) => {
        if (!res.ok) {
          console.error(`ops_alert WhatsApp failed for ${to}:`, res.errorMessage);
          void supabaseAdmin
            .from("error_log")
            .insert({
              flow_name: "ops_alert_whatsapp",
              error_message: `Ops alert (${event}) to ${to} failed: ${res.errorMessage ?? "unknown"}`,
              payload: { event, booking_id: details.bookingId || "" },
            } as never)
            .then(() => undefined, () => undefined);
        }
      })
      .catch((err) => {
        console.error(`ops_alert WhatsApp error for ${to}:`, err);
      });
  }
}
