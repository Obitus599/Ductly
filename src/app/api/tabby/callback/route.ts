import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { retrievePayment, capturePayment, refundPayment, tabbyConfigured } from "@/lib/tabby";
import { confirmPaidBooking } from "@/lib/booking-confirmation";

/**
 * GET /api/tabby/callback?booking_id=&session_id=&result=success|cancel|failure
 *
 * Tabby's hosted checkout redirects the customer's browser here. We NEVER
 * trust the `result` param — the success page is shown ONLY when we have
 * positively confirmed the booking ourselves (retrieve → AUTHORIZED/CLOSED
 * → capture → confirm). Anything else — a Tabby outage, a non-terminal
 * payment, a missing payment id — lands on the neutral "we're confirming"
 * page, because a success screen for an unpaid booking is worse than a
 * slow one. The Tabby webhook is the safety net either way.
 */
export async function POST(request: NextRequest) {
  return handle(request);
}
export async function GET(request: NextRequest) {
  return handle(request);
}

/**
 * Base URL for the customer redirect.
 *
 * `Host` / `X-Forwarded-Host` are attacker-controllable, so we only honour
 * them when they match the origin we're actually deployed at. Otherwise a
 * crafted request could bounce a customer (with their booking id) to an
 * attacker-controlled look-alike host.
 */
function resolvedBaseUrl(request: NextRequest): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const host =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    "";

  if (appUrl) {
    try {
      const configured = new URL(appUrl);
      if (host && host.toLowerCase() === configured.host.toLowerCase()) {
        return `${proto}://${host}`;
      }
      return configured.origin;
    } catch {
      // Malformed env var — fall through to the header/origin path.
    }
  }

  if (host) return `${proto}://${host}`;
  return request.nextUrl.origin;
}

async function handle(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const bookingId = params.get("booking_id");
  const sessionId = params.get("session_id") || undefined;
  const result = params.get("result") || "success";

  const redirect = (path: string) =>
    NextResponse.redirect(new URL(path, resolvedBaseUrl(request)));

  if (!bookingId) return redirect("/book");
  if (!tabbyConfigured()) return redirect("/book?payment_failed=1");

  /** Neutral landing: payment may still succeed; the webhook will finish it. */
  const pending = () => redirect(`/book/pending?booking_id=${bookingId}`);

  const { data: booking } = await supabaseAdmin
    .from("bookings")
    .select("id, status, tabby_payment_id, slot_start, address, is_test_data, price_total_fils, customer_id")
    .eq("id", bookingId)
    .returns<
      {
        id: string;
        status: string;
        tabby_payment_id: string | null;
        slot_start: string;
        address: string | null;
        is_test_data: boolean;
        price_total_fils: number | null;
        customer_id: string | null;
      }[]
    >()
    .maybeSingle();

  if (!booking) return redirect("/book");

  // Already finalised by the webhook — nothing to do but land them.
  if (booking.status === "confirmed") {
    return redirect(`/book/success?booking_id=${bookingId}`);
  }

  // Customer contact for dispatch/confirmation fallbacks.
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

  const releaseLock = async () => {
    if (sessionId) {
      await supabaseAdmin.from("booking_locks").delete().eq("session_id", sessionId);
    }
  };
  // Conditional on the CURRENT row, not the snapshot we read above — the
  // webhook may have confirmed this booking in between, and a stale
  // in-memory `status === "pending"` check would happily overwrite it.
  const markStatus = async (status: string) => {
    await supabaseAdmin
      .from("bookings")
      .update({ status } as never)
      .eq("id", bookingId)
      .eq("status", "pending");
  };

  const paymentId = booking.tabby_payment_id;
  if (!paymentId) {
    // Checkout never recorded a payment id. Nothing to verify; the webhook
    // can still find the booking by reference_id. Never claim success.
    return result === "failure"
      ? redirect("/book?payment_failed=1")
      : result === "cancel"
        ? redirect("/book?cancelled=1")
        : pending();
  }

  const retrieved = await retrievePayment(paymentId);
  if (!retrieved.ok) {
    // Tabby unreachable/5xx — we do NOT know whether the customer paid.
    // Make no state change and show the neutral page; the webhook (and
    // the reconciler) will settle it.
    await supabaseAdmin.from("error_log").insert({
      flow_name: "tabby_callback_retrieve",
      error_message: `Could not verify Tabby payment ${paymentId}: ${retrieved.errorMessage ?? "unknown"}`,
      payload: { booking_id: bookingId, payment_id: paymentId },
    } as never);
    return pending();
  }

  const st = retrieved.paymentStatus;

  if (st === "AUTHORIZED" || st === "CLOSED") {
    let captured = st === "CLOSED"; // already captured (e.g. by the webhook)
    if (st === "AUTHORIZED") {
      // Refuse to capture an unknown/zero amount — settling "0.00" would
      // confirm a booking nobody actually paid for.
      const amountFils = booking.price_total_fils;
      if (!amountFils || amountFils <= 0) {
        await supabaseAdmin.from("error_log").insert({
          flow_name: "tabby_capture",
          error_message: `Refusing to capture ${paymentId}: booking ${bookingId} has no price_total_fils`,
          payload: { booking_id: bookingId, payment_id: paymentId },
        } as never);
        return pending();
      }

      const cap = await capturePayment(paymentId, amountFils);
      captured = cap.ok || cap.paymentStatus === "CLOSED";
      if (!captured) {
        // Possible concurrent capture by the webhook — re-check.
        const recheck = await retrievePayment(paymentId);
        captured = recheck.paymentStatus === "CLOSED";
      }
    }
    if (!captured) {
      await supabaseAdmin.from("error_log").insert({
        flow_name: "tabby_capture",
        error_message: `Tabby payment ${paymentId} not captured (status=${st ?? "unknown"})`,
        payload: { booking_id: bookingId, payment_id: paymentId },
      } as never);
      return redirect("/book?payment_failed=1");
    }
    const confirmResult = await confirmPaidBooking({
      bookingId,
      slotStart: booking.slot_start,
      address: booking.address || "",
      provider: "tabby",
      paymentRef: paymentId,
      sessionId,
      isTest: booking.is_test_data,
      fallbackName,
      fallbackPhone,
      fallbackEmail,
    });

    // The booking was expired-then-resold (or the slot has passed): we just
    // captured money we can't honour. Refund it and tell the customer the
    // truth instead of showing a success page.
    if (confirmResult.reason === "slot_unavailable") {
      const refund = await refundPayment(paymentId, booking.price_total_fils || 0, "slot_unavailable");
      if (!refund.ok) {
        await supabaseAdmin.from("error_log").insert({
          flow_name: "tabby_refund_failed",
          error_message: `Auto-refund FAILED for unfulfillable booking ${bookingId} (payment ${paymentId}): ${refund.errorMessage ?? "unknown"} — MANUAL REFUND REQUIRED`,
          payload: { booking_id: bookingId, payment_id: paymentId },
        } as never);
      }
      return redirect("/book?slot_unavailable=1");
    }
    return redirect(`/book/success?booking_id=${bookingId}`);
  }

  if (st === "REJECTED") {
    await markStatus("payment_failed");
    return redirect("/book?payment_failed=1");
  }
  if (st === "EXPIRED") {
    await releaseLock();
    await markStatus("expired");
    return redirect("/book?cancelled=1");
  }

  // CREATED / unknown → payment not terminal yet. Make NO state change.
  // The customer may genuinely have cancelled, so honour an explicit
  // cancel/failure hint for the landing page only — but a "success" hint
  // on a non-terminal payment gets the neutral page, never success.
  if (result === "failure") return redirect("/book?payment_failed=1");
  if (result === "cancel") return redirect("/book?cancelled=1");
  return pending();
}
