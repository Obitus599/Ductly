import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { assignTeamToBooking } from "@/lib/scheduling-agent";
import { fireN8nWebhook } from "@/lib/n8n";
import { fireOpsAlert } from "@/lib/ops-alert";
import {
  buildMapsLink,
  formatSlotForDispatch,
  addressQuality,
} from "@/lib/dispatch-format";
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

      // Defensive: tag the booking based on Stripe's livemode signal,
      // in case the server's STRIPE_SECRET_KEY mode disagrees with the
      // actual event (e.g. webhook secret + key mode mismatch).
      const isTestData = !event.livemode;
      console.log(
        `Payment confirmed for booking ${bookingId} (test_data=${isTestData})`
      );

      // 1. Update booking status to confirmed + store payment ID + generate manage token
      const manageToken = `bk_${crypto.randomBytes(24).toString("hex")}`;
      await supabase
        .from("bookings")
        .update({
          status: "confirmed",
          payment_intent_id: session.payment_intent as string,
          manage_token: manageToken,
          is_test_data: isTestData,
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

          const { data: bookingData, error: bookingDataErr } = await supabase
            .from("bookings")
            .select("customer_id, address_details, slot_end")
            .eq("id", bookingId)
            .returns<{ customer_id: string; address_details: Record<string, unknown> | null; slot_end: string }[]>()
            .single();
          if (bookingDataErr) {
            console.error(`[team_dispatch] bookings select failed for ${bookingId}:`, bookingDataErr.message);
          }

          let dispatchCustomerName = "";
          let dispatchCustomerPhone = "";
          if (bookingData?.customer_id) {
            const { data: dispatchCustomer, error: dispatchCustomerErr } = await supabase
              .from("customers")
              .select("name, phone")
              .eq("id", bookingData.customer_id)
              .returns<{ name: string; phone: string }[]>()
              .single();
            if (dispatchCustomerErr) {
              console.error(`[team_dispatch] customers select failed for ${bookingData.customer_id}:`, dispatchCustomerErr.message);
            }
            if (dispatchCustomer) {
              dispatchCustomerName = dispatchCustomer.name;
              dispatchCustomerPhone = dispatchCustomer.phone;
            }
          }

          // Same fallback ladder as the booking_confirmed branch:
          //   metadata.customer_phone → Stripe session.customer_details.phone
          if (!dispatchCustomerPhone && metadata.customer_phone) {
            console.warn(
              `[team_dispatch] DB phone empty for ${bookingId}; falling back to Stripe metadata phone`
            );
            dispatchCustomerPhone = metadata.customer_phone;
          }
          if (!dispatchCustomerName && metadata.customer_name) {
            dispatchCustomerName = metadata.customer_name;
          }
          if (!dispatchCustomerPhone) {
            const sessionPhone =
              (session.customer_details as { phone?: string } | null)?.phone ?? "";
            if (sessionPhone) {
              console.warn(
                `[team_dispatch] DB + metadata phone empty for ${bookingId}; using Stripe session phone`
              );
              dispatchCustomerPhone = sessionPhone;
            }
          }
          if (!dispatchCustomerPhone) {
            console.error(
              `[team_dispatch] No phone resolved for booking ${bookingId} (customer_id=${bookingData?.customer_id ?? "null"}).`
            );
          }

          const addrDetails = bookingData?.address_details as Record<string, unknown> | null;

          const mapsLink = buildMapsLink(addrDetails, address || "");
          const slotStartHuman = formatSlotForDispatch(slotStart);
          const slotEndIso = (bookingData?.slot_end as string) || "";
          const slotEndHuman = slotEndIso
            ? formatSlotForDispatch(slotEndIso)
            : "";
          const quality = addressQuality(addrDetails);

          // PDPL: record that customer PII was shared with this team.
          // Fire-and-forget; never block dispatch on audit logging.
          supabase
            .from("team_data_access")
            .insert({
              team_id: result.teamId,
              booking_id: bookingId,
              shared_fields: ["customer_name", "customer_phone", "address"],
              channel: "n8n_team_dispatch",
            } as never)
            .then(({ error }) => {
              if (error) {
                console.warn("team_data_access insert failed:", error.message);
              }
            });

          fireN8nWebhook("team_dispatch", n8nDispatchUrl, {
            event: "team_dispatch",
            booking_id: bookingId,
            team_id: result.teamId,
            team_name: teamData?.name || "",
            team_whatsapp: teamData?.whatsapp_number || "",
            customer_name: dispatchCustomerName,
            customer_phone: dispatchCustomerPhone,
            address: address || "",
            address_quality: quality,
            maps_link: mapsLink,
            building_name: addrDetails?.building_name || "",
            flat_number: addrDetails?.flat_number || "",
            floor: addrDetails?.floor || "",
            additional_directions: addrDetails?.additional_directions || "",
            slot_start: slotStart,
            slot_start_human: slotStartHuman,
            slot_end: slotEndIso,
            slot_end_human: slotEndHuman,
            plan: metadata.plan || "",
            price_aed: metadata.price_aed || "",
          });
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
        // Fetch customer phone explicitly (Supabase join may not resolve)
        const { data: bookingRow, error: bookingRowErr } = await supabase
          .from("bookings")
          .select("customer_id, slot_end, address_details, team_id")
          .eq("id", bookingId)
          .returns<{ customer_id: string; slot_end: string; address_details: Record<string, unknown> | null; team_id: string | null }[]>()
          .single();
        if (bookingRowErr) {
          console.error(`[booking_confirmed] bookings select failed for ${bookingId}:`, bookingRowErr.message);
        }

        let customerPhone = "";
        let customerName = "";
        if (bookingRow?.customer_id) {
          const { data: customerRow, error: customerRowErr } = await supabase
            .from("customers")
            .select("name, phone")
            .eq("id", bookingRow.customer_id)
            .returns<{ name: string; phone: string }[]>()
            .single();
          if (customerRowErr) {
            console.error(`[booking_confirmed] customers select failed for ${bookingRow.customer_id}:`, customerRowErr.message);
          }
          if (customerRow) {
            customerName = customerRow.name;
            customerPhone = customerRow.phone;
          }
        }

        // Fallback 1: Stripe metadata captured at checkout time. This
        // is the form-entered phone, so it's the highest-fidelity source
        // and survives any customers table issues (rename, null, etc).
        if (!customerPhone && metadata.customer_phone) {
          console.warn(
            `[booking_confirmed] DB phone empty for booking ${bookingId}; falling back to Stripe metadata phone`
          );
          customerPhone = metadata.customer_phone;
        }
        if (!customerName && metadata.customer_name) {
          customerName = metadata.customer_name;
        }

        // Fallback 2: Stripe-collected customer_details.phone, if
        // phone_number_collection ever gets enabled on the Checkout.
        if (!customerPhone) {
          const sessionPhone =
            (session.customer_details as { phone?: string } | null)?.phone ?? "";
          if (sessionPhone) {
            console.warn(
              `[booking_confirmed] DB + metadata phone empty for ${bookingId}; using Stripe session phone`
            );
            customerPhone = sessionPhone;
          }
        }

        // Final diagnostic if we STILL have nothing — n8n will skip
        // the WhatsApp branch and the error_log row gives us a record.
        if (!customerPhone) {
          console.error(
            `[booking_confirmed] No phone resolved for booking ${bookingId} (customer_id=${bookingRow?.customer_id ?? "null"}). WhatsApp will be skipped.`
          );
        }

        fireN8nWebhook("booking_confirmed", n8nBookingUrl, {
          event: "booking_confirmed",
          booking_id: bookingId,
          customer_name: customerName || session.customer_email || "",
          customer_email: session.customer_email,
          customer_phone: customerPhone,
          address: address || "",
          address_details: bookingRow?.address_details || null,
          slot_start: slotStart,
          slot_end: bookingRow?.slot_end || "",
          team_id: bookingRow?.team_id || null,
          plan: metadata.plan || "",
          price_aed: metadata.price_aed || "",
          manage_token: manageToken,
          payment_intent_id: session.payment_intent,
        });
      }

      // 5. Notify the owners (Mattia + Ashwini) of the new booking.
      //    Independent of the customer-facing flows above — gated by its
      //    own N8N_WEBHOOK_OPS_ALERT env var (dormant until configured).
      fireOpsAlert("new_booking", {
        bookingId,
        customerName: metadata.customer_name || session.customer_email || "",
        customerPhone: metadata.customer_phone || "",
        slotStart,
        address: address || "",
        extra: `${metadata.plan || ""}${metadata.price_aed ? ` · AED ${metadata.price_aed}` : ""}`.trim(),
        source: "online_booking",
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
