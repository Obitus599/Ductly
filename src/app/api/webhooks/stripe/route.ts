import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { assignTeamToBooking } from "@/lib/scheduling-agent";
import Stripe from "stripe";

/**
 * POST /api/webhooks/stripe
 *
 * Handles Stripe webhook events:
 *   - checkout.session.completed → confirm booking + trigger Layer 2 agent
 *   - payment_intent.payment_failed → release lock + log error
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
        console.error("Missing booking metadata in checkout session");
        break;
      }

      // Idempotency: skip if already processed
      const { data: existing } = await supabase
        .from("bookings")
        .select("status")
        .eq("id", bookingId)
        .returns<{ status: string }[]>()
        .single();

      if (existing?.status === "confirmed") {
        console.log(`Booking ${bookingId} already confirmed, skipping duplicate webhook`);
        break;
      }

      console.log(`Payment confirmed for booking ${bookingId}`);

      // 1. Update booking status to confirmed + store payment ID
      await supabase
        .from("bookings")
        .update({
          status: "confirmed",
          payment_intent_id: session.payment_intent as string,
        } as never)
        .eq("id", bookingId);

      // 2. Delete the temporary booking lock
      if (sessionId) {
        await supabase
          .from("booking_locks")
          .delete()
          .eq("session_id", sessionId);
      }

      // 3. Trigger Layer 2 — AI Agent assigns the optimal team
      try {
        const result = await assignTeamToBooking(
          bookingId,
          slotStart,
          address || ""
        );
        console.log(
          `Team assignment: ${result.teamId} via ${result.method} for booking ${bookingId}`
        );
      } catch (agentError) {
        console.error("Team assignment failed:", agentError);

        // Log to error_log table
        await supabase.from("error_log").insert({
          flow_name: "layer2_agent",
          error_message:
            agentError instanceof Error
              ? agentError.message
              : "Unknown agent error",
          payload: { booking_id: bookingId, slot_start: slotStart },
        } as never);
      }

      // 4. TODO: Trigger n8n webhook for booking confirmation
      //    POST to n8n webhook URL with booking details for:
      //    - WhatsApp confirmation to customer (360dialog)
      //    - Email confirmation (Resend)
      //    - Team dispatch notification via WhatsApp

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

      // 4. TODO: Trigger n8n webhook for payment failure notification

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
