import { fireN8nWebhook } from "@/lib/n8n";
import { formatSlotForDispatch } from "@/lib/dispatch-format";

/**
 * Operations alerts — internal WhatsApp notifications to the owners
 * (Mattia + Ashwini) whenever the calendar changes or a job is reported
 * not-completed.
 *
 * Every alert flows through one shared n8n workflow → the single
 * parametrised `ductly_ops_alert` WhatsApp template, which fans out to
 * both operator numbers. The recipient numbers live in n8n, not here.
 *
 * DORMANT BY DEFAULT: if N8N_WEBHOOK_OPS_ALERT is unset, fireOpsAlert is
 * a no-op. That lets this code ship and sit wired into every mutation
 * point ahead of the Meta template approval + operator numbers — flip
 * the env var on once both exist and alerts start flowing, with zero
 * further code changes.
 */
export type OpsAlertEvent =
  | "new_booking"
  | "reschedule"
  | "cancellation"
  | "blackout"
  | "blackout_removed"
  | "job_not_completed";

/** Human-readable label sent to the template (variable 1). */
const EVENT_LABELS: Record<OpsAlertEvent, string> = {
  new_booking: "New Booking",
  reschedule: "Reschedule",
  cancellation: "Cancellation",
  blackout: "Calendar Blocked",
  blackout_removed: "Block Removed",
  job_not_completed: "Job NOT Completed",
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
 * caller — failures are logged to error_log by fireN8nWebhook.
 */
export function fireOpsAlert(event: OpsAlertEvent, details: OpsAlertDetails): void {
  const url = process.env.N8N_WEBHOOK_OPS_ALERT;
  if (!url) return; // dormant until configured

  const whenHuman = details.slotStart
    ? formatSlotForDispatch(details.slotStart)
    : "";

  fireN8nWebhook("ops_alert", url, {
    event: "ops_alert",
    alert_type: event,
    alert_label: EVENT_LABELS[event],
    booking_id: details.bookingId || "",
    customer_name: details.customerName || "",
    customer_phone: details.customerPhone || "",
    slot_start: details.slotStart || "",
    when_human: whenHuman,
    address: details.address || "",
    team_name: details.teamName || "",
    extra: details.extra || "",
    source: details.source || "",
  });
}
