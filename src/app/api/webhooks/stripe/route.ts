import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { fireN8nWebhook } from "@/lib/n8n";
import { fireOpsAlert } from "@/lib/ops-alert";
import { confirmPaidBooking } from "@/lib/booking-confirmation";
import Stripe from "stripe";

/**
 * POST /api/webhooks/stripe
 *
 * Handles Stripe webhook events:
 *   - checkout.session.completed → confirm booking + dispatch (shared path)
 *   - payment_intent.payment_failed → release lock + log error
 *   - checkout.session.expired → release lock + mark expired
 */
export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header." },
      { status: 400 }
    );
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set.");
    return NextResponse.json(
      { error: "Webhook secret not configured." },
      { status: 500 }
    );
  }

  // Verify Stripe signature
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Webhook signature verification failed:", message);
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${message}` },
      { status: 400 }
    );
  }

  const supabase = supabaseAdmin;

  switch (event.type) {
    // ─── Payment Succeeded ─────────────────────────────────────────────
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const metadata = session.metadata || {};
      const bookingId = metadata.booking_id;
      const sessionId = metadata.session_id;
      const slotStart = metadata.slot_start;
      const address = metadata.address;

      if (!bookingId || !slotStart) {
        // Stripe treats our 200 as success and won't retry — so a
        // payment with broken metadata would silently never dispatch.
        // Persist it for manual triage instead of only console.error.
        console.error("Missing booking metadata in checkout session");
        await supabase.from("error_log").insert({
          flow_name: "stripe_webhook_missing_metadata",
          error_message:
            "checkout.session.completed missing booking_id/slot_start — payment taken, booking NOT dispatched",
          payload: {
            session_id: session.id,
            payment_intent: session.payment_intent,
            customer_email: session.customer_email,
            metadata,
          },
        } as never);
        fireOpsAlert("payment_orphan", {
          customerName: session.customer_email || "",
          extra: `Stripe session ${session.id} was paid but had no booking_id/slot_start — refund/re-book needed.`,
          source: "stripe_webhook",
        });
        break;
      }

      // Defensive: tag the booking based on Stripe's livemode signal, in
      // case the server's STRIPE_SECRET_KEY mode disagrees with the event.
      const isTestData = !event.livemode;
      console.log(
        `Payment confirmed for booking ${bookingId} (test_data=${isTestData})`
      );

      const paymentRef =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : (session.payment_intent as { id?: string } | null)?.id || "";
      // Highest-fidelity phone is the form-entered value carried in metadata;
      // fall back to any Stripe-collected phone.
      const fallbackPhone =
        metadata.customer_phone ||
        (session.customer_details as { phone?: string } | null)?.phone ||
        "";

      await confirmPaidBooking({
        bookingId,
        slotStart,
        address: address || "",
        provider: "stripe",
        paymentRef,
        sessionId,
        isTest: isTestData,
        fallbackName: metadata.customer_name || "",
        fallbackPhone,
        fallbackEmail: session.customer_email || "",
      });

      break;
    }

    // ─── Payment Failed ────────────────────────────────────────────────
    case "payment_intent.payment_failed": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const metadata = paymentIntent.metadata || {};
      const bookingId = metadata.booking_id;
      const sessionId = metadata.session_id;

      console.log(`Payment failed for booking ${bookingId}`);

      // 1. Release booking lock
      if (sessionId) {
        await supabase
          .from("booking_locks")
          .delete()
          .eq("session_id", sessionId);
      }

      // 2. Update booking status
      if (bookingId) {
        await supabase
          .from("bookings")
          .update({ status: "payment_failed" } as never)
          .eq("id", bookingId);
      }

      // 3. Log the failure
      await supabase.from("error_log").insert({
        flow_name: "payment_failed",
        error_message: paymentIntent.last_payment_error?.message || "Payment failed",
        payload: { booking_id: bookingId, payment_intent_id: paymentIntent.id },
      } as never);

      // 4. Trigger n8n webhook for payment failure notification
      const n8nFailureUrl = process.env.N8N_WEBHOOK_PAYMENT_FAILED;
      if (n8nFailureUrl) {
        fireN8nWebhook("payment_failed", n8nFailureUrl, {
          event: "payment_failed",
          booking_id: bookingId ?? "",
          payment_intent_id: paymentIntent.id,
          error_message: paymentIntent.last_payment_error?.message || "Payment failed",
          customer_email: paymentIntent.receipt_email || "",
        });
      }

      break;
    }

    // ─── Checkout Expired (user abandoned payment) ──────────────────────
    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      const metadata = session.metadata || {};
      const bookingId = metadata.booking_id;
      const sessionId = metadata.session_id;

      console.log(`Checkout expired for booking ${bookingId}`);

      // 1. Release booking lock
      if (sessionId) {
        await supabase
          .from("booking_locks")
          .delete()
          .eq("session_id", sessionId);
      }

      // 2. Mark booking as expired
      if (bookingId) {
        await supabase
          .from("bookings")
          .update({ status: "expired" } as never)
          .eq("id", bookingId);
      }

      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
