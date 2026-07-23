import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { retrievePayment, capturePayment, tabbyConfigured } from "@/lib/tabby";
import { confirmPaidBooking } from "@/lib/booking-confirmation";

/**
 * POST /api/webhooks/tabby
 *
 * Tabby posts on every payment status change (lowercase statuses),
 * regardless of whether the customer completed the browser redirect —
 * so this is the reliability backstop for /api/tabby/callback.
 *
 * Auth: if TABBY_WEBHOOK_SECRET is set, the inbound request must carry it.
 * Tabby echoes back a custom header you define at registration time; we
 * accept whichever common title it's registered under (X-Webhook-Signature
 * per Tabby's docs, or Authorization / X-Tabby-Signature). confirmPaidBooking
 * is idempotent, so a webhook that races the redirect can't double-dispatch.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.TABBY_WEBHOOK_SECRET;
  if (secret) {
    const provided =
      request.headers.get("x-webhook-signature") ||
      request.headers.get("authorization") ||
      request.headers.get("x-tabby-signature") ||
      "";
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
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
  const status = (payload.status || "").toLowerCase();

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

  if (status === "expired") {
    if (booking.status === "pending") {
      await supabaseAdmin.from("bookings").update({ status: "expired" } as never).eq("id", booking.id);
    }
    return NextResponse.json({ received: true });
  }
  if (status === "rejected") {
    if (booking.status === "pending") {
      await supabaseAdmin.from("bookings").update({ status: "payment_failed" } as never).eq("id", booking.id);
    }
    return NextResponse.json({ received: true });
  }

  // authorized → capture then confirm; closed → already captured, confirm.
  if (status === "authorized" || status === "closed") {
    if (!resolvedPaymentId) return NextResponse.json({ received: true });

    if (status === "authorized") {
      const cap = await capturePayment(resolvedPaymentId, booking.price_total_fils || 0);
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

    await confirmPaidBooking({
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
  }

  return NextResponse.json({ received: true });
}
