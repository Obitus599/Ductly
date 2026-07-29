import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { retrievePayment, capturePayment, refundPayment, tabbyConfigured } from "@/lib/tabby";
import { confirmPaidBooking } from "@/lib/booking-confirmation";

/**
 * Refund a captured Tabby payment whose booking turned out to be
 * unfulfillable (slot expired-then-resold or already past). confirmPaidBooking
 * has already logged + ops-alerted the REFUND REQUIRED; here we actually
 * issue it, and if the refund call itself fails, escalate so it's caught.
 */
async function refundUnfulfillable(
  paymentId: string,
  bookingId: string,
  amountFils: number | null
): Promise<void> {
  const refund = await refundPayment(paymentId, amountFils || 0, "slot_unavailable");
  if (!refund.ok) {
    await supabaseAdmin.from("error_log").insert({
      flow_name: "tabby_refund_failed",
      error_message: `Auto-refund FAILED for unfulfillable booking ${bookingId} (payment ${paymentId}): ${refund.errorMessage ?? "unknown"} — MANUAL REFUND REQUIRED`,
      payload: { booking_id: bookingId, payment_id: paymentId, amount_fils: amountFils },
    } as never);
  }
}

/**
 * POST /api/webhooks/tabby
 *
 * Tabby posts on every payment status change, regardless of whether the
 * customer completed the browser redirect — so this is the reliability
 * backstop for /api/tabby/callback.
 *
 * SECURITY — two rules, both learned the hard way:
 *
 *  1. Auth FAILS CLOSED. TABBY_WEBHOOK_SECRET must be set; an unset secret
 *     is a misconfiguration (500), never an open door. Tabby echoes back a
 *     custom header you define at registration time, so we accept whichever
 *     common title it's registered under and compare in constant time.
 *
 *  2. The request BODY IS NEVER TRUSTED for a state change. It tells us
 *     *which* payment to look at; the authoritative status always comes
 *     from a server-to-server retrievePayment. The previous version
 *     confirmed + dispatched a booking on the word "closed" in the body
 *     alone, with no capture and no verification.
 *
 * confirmPaidBooking is idempotent, so a webhook that races the redirect
 * can't double-dispatch.
 */

/** Length-safe constant-time string compare. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    // Still burn a comparison so the reject path isn't measurably faster.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function authorized(request: NextRequest, secret: string): boolean {
  const candidates = [
    request.headers.get("x-webhook-signature"),
    request.headers.get("x-tabby-signature"),
    request.headers.get("authorization"),
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    // Tolerate an `Authorization: Bearer <secret>` registration.
    const value = raw.startsWith("Bearer ") ? raw.slice(7) : raw;
    if (safeEqual(value, secret)) return true;
  }
  return false;
}

export async function POST(request: NextRequest) {
  const secret = process.env.TABBY_WEBHOOK_SECRET;
  if (!secret) {
    // Fail closed. An unauthenticated endpoint that can confirm bookings
    // and trigger dispatch is not an acceptable degraded mode.
    console.error("TABBY_WEBHOOK_SECRET is not set — refusing webhook.");
    return NextResponse.json(
      { error: "Webhook secret not configured." },
      { status: 500 }
    );
  }
  if (!authorized(request, secret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!tabbyConfigured()) {
    return NextResponse.json({ error: "Tabby not configured." }, { status: 503 });
  }

  let payload: {
    id?: string;
    status?: string;
    order?: { reference_id?: string };
  };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const paymentId = payload.id;
  const bookingId = payload.order?.reference_id;

  if (!paymentId && !bookingId) {
    return NextResponse.json({ received: true });
  }

  // Locate the booking by reference_id (our booking id), else by payment id.
  const query = supabaseAdmin
    .from("bookings")
    .select("id, status, tabby_payment_id, slot_start, address, is_test_data, price_total_fils, customer_id");
  const { data: booking } = await (bookingId
    ? query.eq("id", bookingId)
    : query.eq("tabby_payment_id", paymentId as string)
  )
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

  // Ack unknown bookings so Tabby stops retrying.
  if (!booking) return NextResponse.json({ received: true });

  const resolvedPaymentId = paymentId || booking.tabby_payment_id || "";
  if (!resolvedPaymentId) return NextResponse.json({ received: true });

  // ── Authoritative status: ask Tabby, don't read the body. ──────────────
  const retrieved = await retrievePayment(resolvedPaymentId);
  if (!retrieved.ok) {
    await supabaseAdmin.from("error_log").insert({
      flow_name: "tabby_webhook_retrieve",
      error_message: `Could not verify Tabby payment ${resolvedPaymentId}: ${retrieved.errorMessage ?? "unknown"}`,
      payload: { booking_id: booking.id, payment_id: resolvedPaymentId },
    } as never);
    // Non-2xx so Tabby retries — better a duplicate delivery (the confirm
    // path is idempotent) than a silently dropped payment notification.
    return NextResponse.json(
      { error: "Could not verify payment status." },
      { status: 503 }
    );
  }

  const status = (retrieved.paymentStatus || "").toUpperCase();

  if (status === "EXPIRED") {
    await supabaseAdmin
      .from("bookings")
      .update({ status: "expired" } as never)
      .eq("id", booking.id)
      .eq("status", "pending");
    return NextResponse.json({ received: true });
  }
  if (status === "REJECTED") {
    await supabaseAdmin
      .from("bookings")
      .update({ status: "payment_failed" } as never)
      .eq("id", booking.id)
      .eq("status", "pending");
    return NextResponse.json({ received: true });
  }

  // AUTHORIZED → capture then confirm; CLOSED → already captured, confirm.
  if (status === "AUTHORIZED" || status === "CLOSED") {
    if (status === "AUTHORIZED") {
      // Never capture a 0/unknown amount — a null price snapshot is a data
      // bug, and capturing "0.00" would settle the authorization for
      // nothing and leave a confirmed booking that was never paid for.
      const amountFils = booking.price_total_fils;
      if (!amountFils || amountFils <= 0) {
        await supabaseAdmin.from("error_log").insert({
          flow_name: "tabby_webhook_capture",
          error_message: `Refusing to capture ${resolvedPaymentId}: booking ${booking.id} has no price_total_fils`,
          payload: { booking_id: booking.id, payment_id: resolvedPaymentId },
        } as never);
        return NextResponse.json({ received: true });
      }

      const cap = await capturePayment(resolvedPaymentId, amountFils);
      if (!cap.ok && cap.paymentStatus !== "CLOSED") {
        const recheck = await retrievePayment(resolvedPaymentId);
        if (recheck.paymentStatus !== "CLOSED") {
          await supabaseAdmin.from("error_log").insert({
            flow_name: "tabby_webhook_capture",
            error_message: `Capture failed for ${resolvedPaymentId} (${cap.errorMessage ?? "unknown"})`,
            payload: { booking_id: booking.id, payment_id: resolvedPaymentId },
          } as never);
          return NextResponse.json({ received: true });
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
      paymentRef: resolvedPaymentId,
      isTest: booking.is_test_data,
      fallbackName,
      fallbackPhone,
      fallbackEmail,
    });

    // Settled money for a slot that's no longer serviceable (expired then
    // resold, or already past) must be given back, not kept.
    if (confirmResult.reason === "slot_unavailable") {
      await refundUnfulfillable(resolvedPaymentId, booking.id, booking.price_total_fils);
    }
  }

  return NextResponse.json({ received: true });
}
