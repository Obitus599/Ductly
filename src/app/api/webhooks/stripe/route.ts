import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
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

      // 1. Update booking status to confirmed + store payment ID + generate manage token
      const manageToken = `bk_${crypto.randomBytes(24).toString("hex")}`;
      await supabase
        .from("bookings")
        .update({
          status: "confirmed",
          payment_intent_id: session.payment_intent as string,
          manage_token: manageToken,
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

        // 3b. Trigger n8n team dispatch webhook
        const n8nDispatchUrl = process.env.N8N_WEBHOOK_TEAM_DISPATCH;
        if (n8nDispatchUrl && result.teamId) {
          const { data: teamData } = await supabase
            .from("teams")
            .select("name, whatsapp_number")
            .eq("id", result.teamId)
            .returns<{ name: string; whatsapp_number: string }[]>()
            .single();

          const { data: bookingData } = await supabase
            .from("bookings")
            .select("address_details, slot_end, customers(name, phone)")
            .eq("id", bookingId)
            .returns<Record<string, unknown>[]>()
            .single();

          const customerInfo = bookingData?.customers as Record<string, unknown> | null;
          const addrDetails = bookingData?.address_details as Record<string, unknown> | null;

          fetch(n8nDispatchUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              event: "team_dispatch",
              booking_id: bookingId,
              team_id: result.teamId,
              team_name: teamData?.name || "",
              team_whatsapp: teamData?.whatsapp_number || "",
              customer_name: customerInfo?.name || "",
              customer_phone: customerInfo?.phone || "",
              address: address || "",
              building_name: addrDetails?.building_name || "",
              flat_number: addrDetails?.flat_number || "",
              floor: addrDetails?.floor || "",
              additional_directions: addrDetails?.additional_directions || "",
              slot_start: slotStart,
              slot_end: bookingData?.slot_end || "",
              plan: metadata.plan || "",
              price_aed: metadata.price_aed || "",
            }),
          }).catch((err) => console.error("n8n dispatch webhook failed:", err));
        }
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

      // 4. Trigger n8n webhook for booking confirmation
      const n8nBookingUrl = process.env.N8N_WEBHOOK_BOOKING_CONFIRMED;
      if (n8nBookingUrl) {
        // Fetch full booking + customer for n8n payload
        const { data: fullBooking } = await supabase
          .from("bookings")
          .select("*, customers(*)")
          .eq("id", bookingId)
          .returns<Record<string, unknown>[]>()
          .single();

        fetch(n8nBookingUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "booking_confirmed",
            booking_id: bookingId,
            customer_name: fullBooking?.customers && typeof fullBooking.customers === "object" ? (fullBooking.customers as Record<string, unknown>).name : metadata.customer_id,
            customer_email: session.customer_email,
            customer_phone: fullBooking?.customers && typeof fullBooking.customers === "object" ? (fullBooking.customers as Record<string, unknown>).phone : "",
            address: address || "",
            address_details: fullBooking?.address_details || null,
            slot_start: slotStart,
            slot_end: fullBooking?.slot_end || "",
            team_id: fullBooking?.team_id || null,
            plan: metadata.plan || "",
            price_aed: metadata.price_aed || "",
            manage_token: manageToken,
            payment_intent_id: session.payment_intent,
          }),
        }).catch((err) => console.error("n8n booking webhook failed:", err));
      }

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
        fetch(n8nFailureUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "payment_failed",
            booking_id: bookingId,
            payment_intent_id: paymentIntent.id,
            error_message: paymentIntent.last_payment_error?.message || "Payment failed",
            customer_email: paymentIntent.receipt_email || "",
          }),
        }).catch((err) => console.error("n8n failure webhook failed:", err));
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
