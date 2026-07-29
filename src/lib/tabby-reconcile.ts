import { supabaseAdmin } from "@/utils/supabase/admin";
import { retrievePayment, capturePayment, refundPayment, tabbyConfigured } from "@/lib/tabby";
import { confirmPaidBooking } from "@/lib/booking-confirmation";

/**
 * Tabby settlement reconciler.
 *
 * Tabby is auth-then-capture: the customer's approval only creates an
 * AUTHORIZED payment, and the money is ours (and the booking real) only
 * after we capture it. Both capture paths — the browser redirect and the
 * webhook — can fail: the customer closes the tab AND Tabby's webhook
 * delivery fails or hits us mid-deploy. What's left is an authorization
 * nobody captured, attached to a booking stuck at `pending`. From the
 * customer's side that reads as "Tabby says approved, Ductly says
 * nothing" — and the authorization silently expires days later.
 *
 * This sweep is the third line of defence: it re-asks Tabby about every
 * unsettled Tabby booking and drives it to a terminal state.
 */

/** Ignore very fresh bookings — the customer may still be paying. */
const MIN_AGE_MINUTES = 20;
/** Tabby authorizations don't live forever; past this we stop asking. */
const MAX_AGE_HOURS = 72;
const MAX_PER_RUN = 50;

export interface ReconcileResult {
  scanned: number;
  confirmed: number;
  failed: number;
  expired: number;
  stillPending: number;
  errors: number;
}

interface PendingTabbyBooking {
  id: string;
  status: string;
  tabby_payment_id: string | null;
  slot_start: string;
  address: string | null;
  is_test_data: boolean;
  price_total_fils: number | null;
  customer_id: string | null;
}

export async function reconcileTabbyPayments(): Promise<ReconcileResult> {
  const result: ReconcileResult = {
    scanned: 0,
    confirmed: 0,
    failed: 0,
    expired: 0,
    stillPending: 0,
    errors: 0,
  };

  if (!tabbyConfigured()) return result;

  const now = Date.now();
  const newestCutoff = new Date(now - MIN_AGE_MINUTES * 60_000).toISOString();
  const oldestCutoff = new Date(now - MAX_AGE_HOURS * 3_600_000).toISOString();

  const { data: bookings } = await supabaseAdmin
    .from("bookings")
    .select(
      "id, status, tabby_payment_id, slot_start, address, is_test_data, price_total_fils, customer_id"
    )
    // `expired` is included: the stale sweep may have moved a booking
    // there while its payment was still in flight, and confirmPaidBooking
    // can recover it.
    .in("status", ["pending", "expired"])
    .not("tabby_payment_id", "is", null)
    .lt("created_at", newestCutoff)
    .gt("created_at", oldestCutoff)
    .limit(MAX_PER_RUN)
    .returns<PendingTabbyBooking[]>();

  for (const booking of bookings ?? []) {
    result.scanned += 1;
    const paymentId = booking.tabby_payment_id;
    if (!paymentId) continue;

    try {
      const retrieved = await retrievePayment(paymentId);
      if (!retrieved.ok) {
        result.errors += 1;
        continue;
      }

      const status = (retrieved.paymentStatus || "").toUpperCase();

      if (status === "EXPIRED") {
        await supabaseAdmin
          .from("bookings")
          .update({ status: "expired" } as never)
          .eq("id", booking.id)
          .eq("status", "pending");
        result.expired += 1;
        continue;
      }

      if (status === "REJECTED") {
        await supabaseAdmin
          .from("bookings")
          .update({ status: "payment_failed" } as never)
          .eq("id", booking.id)
          .eq("status", "pending");
        result.failed += 1;
        continue;
      }

      if (status !== "AUTHORIZED" && status !== "CLOSED") {
        // CREATED — customer never finished. Nothing to settle yet.
        result.stillPending += 1;
        continue;
      }

      if (status === "AUTHORIZED") {
        const amountFils = booking.price_total_fils;
        if (!amountFils || amountFils <= 0) {
          await supabaseAdmin.from("error_log").insert({
            flow_name: "tabby_reconcile",
            error_message: `Refusing to capture ${paymentId}: booking ${booking.id} has no price_total_fils`,
            payload: { booking_id: booking.id, payment_id: paymentId },
          } as never);
          result.errors += 1;
          continue;
        }

        const cap = await capturePayment(paymentId, amountFils);
        if (!cap.ok && cap.paymentStatus !== "CLOSED") {
          const recheck = await retrievePayment(paymentId);
          if (recheck.paymentStatus !== "CLOSED") {
            await supabaseAdmin.from("error_log").insert({
              flow_name: "tabby_reconcile",
              error_message: `Reconcile capture failed for ${paymentId} (${cap.errorMessage ?? "unknown"})`,
              payload: { booking_id: booking.id, payment_id: paymentId },
            } as never);
            result.errors += 1;
            continue;
          }
        }
      }

      let fallbackName = "";
      let fallbackEmail = "";
      let fallbackPhone = "";
      if (booking.customer_id) {
        const { data: customer } = await supabaseAdmin
          .from("customers")
          .select("name, email, phone")
          .eq("id", booking.customer_id)
          .returns<{ name: string; email: string; phone: string }[]>()
          .maybeSingle();
        if (customer) {
          fallbackName = customer.name || "";
          fallbackEmail = customer.email || "";
          fallbackPhone = customer.phone || "";
        }
      }

      const confirmResult = await confirmPaidBooking({
        bookingId: booking.id,
        slotStart: booking.slot_start,
        address: booking.address || "",
        provider: "tabby",
        paymentRef: paymentId,
        isTest: booking.is_test_data,
        fallbackName,
        fallbackPhone,
        fallbackEmail,
      });
      if (confirmResult.confirmed) {
        result.confirmed += 1;
      } else if (confirmResult.reason === "slot_unavailable") {
        // We captured for a slot that's since been resold or has passed.
        // Give the money back rather than keep it for a job we can't do.
        const refund = await refundPayment(paymentId, booking.price_total_fils || 0, "slot_unavailable");
        if (!refund.ok) {
          await supabaseAdmin.from("error_log").insert({
            flow_name: "tabby_refund_failed",
            error_message: `Reconciler auto-refund FAILED for unfulfillable booking ${booking.id} (payment ${paymentId}): ${refund.errorMessage ?? "unknown"} — MANUAL REFUND REQUIRED`,
            payload: { booking_id: booking.id, payment_id: paymentId },
          } as never);
        }
        result.failed += 1;
      } else {
        result.stillPending += 1;
      }
    } catch (err) {
      result.errors += 1;
      console.error(`Tabby reconcile failed for booking ${booking.id}:`, err);
    }
  }

  return result;
}
