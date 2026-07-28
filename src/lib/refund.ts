import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { refundPayment as tabbyRefund } from "@/lib/tabby";
import { fireOpsAlert } from "@/lib/ops-alert";

/**
 * Provider-aware cancellation refund.
 *
 * The cancel routes previously refunded ONLY through Stripe, gated on
 * `payment_intent_id`. A Tabby booking never has one, so its refund block
 * was skipped, `refund_status` kept its optimistic default `"pending"`,
 * and the customer was told a refund was coming that never was. This
 * routes each booking to the correct provider and, critically, NEVER
 * reports a pending refund that was not actually requested.
 *
 * refund_status maps onto the existing CHECK ('pending','succeeded','failed'):
 *   - succeeded : provider accepted the refund
 *   - failed    : provider rejected it (or a Tabby booking has no payment
 *                 id) — escalated to error_log + ops alert for manual action
 *   - null      : no payment on file (e.g. a manual admin booking) — nothing
 *                 to refund, and we must not claim otherwise
 */
export interface RefundInput {
  bookingId: string;
  paymentProvider: string | null;
  paymentIntentId: string | null;
  tabbyPaymentId: string | null;
  amountFils: number | null;
  reason?: string;
  triggeredBy: "customer" | "admin";
  customerName?: string;
  customerPhone?: string;
  slotStart?: string;
  address?: string;
}

export interface RefundOutcome {
  refundId: string | null;
  /** null means "no payment to refund" — do NOT persist a status. */
  refundStatus: "succeeded" | "failed" | null;
  /** True when a human must finish the refund (provider failed). */
  needsManual: boolean;
}

function isTabby(input: RefundInput): boolean {
  return input.paymentProvider === "tabby" || (!input.paymentIntentId && !!input.tabbyPaymentId);
}

async function escalate(input: RefundInput, detail: string): Promise<void> {
  await supabaseAdmin.from("error_log").insert({
    flow_name: "cancellation_refund_manual_required",
    error_message: `Refund for booking ${input.bookingId} needs manual action: ${detail}`,
    payload: {
      booking_id: input.bookingId,
      provider: input.paymentProvider,
      tabby_payment_id: input.tabbyPaymentId,
      payment_intent_id: input.paymentIntentId,
      amount_fils: input.amountFils,
    },
  } as never);
  fireOpsAlert("refund_required", {
    bookingId: input.bookingId,
    customerName: input.customerName || "",
    customerPhone: input.customerPhone || "",
    slotStart: input.slotStart || "",
    address: input.address || "",
    extra: `${input.triggeredBy} cancel · ${detail}`,
    source: "cancellation_refund",
  });
}

export async function issueCancellationRefund(input: RefundInput): Promise<RefundOutcome> {
  // Tabby (BNPL): refund the captured amount through Tabby's own API.
  if (isTabby(input)) {
    if (!input.tabbyPaymentId) {
      await escalate(input, "Tabby booking has no tabby_payment_id");
      return { refundId: null, refundStatus: "failed", needsManual: true };
    }
    const refund = await tabbyRefund(
      input.tabbyPaymentId,
      input.amountFils || 0,
      input.reason || "customer_cancellation"
    );
    if (!refund.ok) {
      await escalate(input, `Tabby refund failed: ${refund.errorMessage ?? "unknown"}`);
      return { refundId: null, refundStatus: "failed", needsManual: true };
    }
    return { refundId: input.tabbyPaymentId, refundStatus: "succeeded", needsManual: false };
  }

  // Stripe (card).
  if (input.paymentIntentId) {
    try {
      const refund = await stripe.refunds.create(
        { payment_intent: input.paymentIntentId },
        { idempotencyKey: `refund_${input.bookingId}` }
      );
      const status = refund.status ?? "succeeded";
      if (status === "failed" || status === "canceled") {
        await escalate(input, `Stripe refund status ${status}`);
        return { refundId: refund.id, refundStatus: "failed", needsManual: true };
      }
      return { refundId: refund.id, refundStatus: "succeeded", needsManual: false };
    } catch (err) {
      await escalate(input, err instanceof Error ? err.message : "Stripe refund threw");
      return { refundId: null, refundStatus: "failed", needsManual: true };
    }
  }

  // No payment on file — e.g. a manual admin booking. Nothing to refund,
  // and we must not pretend a refund is in flight.
  return { refundId: null, refundStatus: null, needsManual: false };
}

/** Customer-facing message that matches what actually happened. */
export function refundMessage(outcome: RefundOutcome): string {
  if (outcome.refundStatus === "succeeded") {
    return "Booking cancelled. Your refund will appear within 5-10 business days.";
  }
  if (outcome.refundStatus === "failed") {
    return "Booking cancelled. We could not process the refund automatically — our team will follow up shortly.";
  }
  return "Booking cancelled.";
}
