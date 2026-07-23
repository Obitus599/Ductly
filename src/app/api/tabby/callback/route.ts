import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { retrievePayment, capturePayment, tabbyConfigured } from "@/lib/tabby";
import { confirmPaidBooking } from "@/lib/booking-confirmation";

/**
 * GET /api/tabby/callback?booking_id=&session_id=&result=success|cancel|failure
 *
 * Tabby's hosted checkout redirects the customer's browser here. We NEVER
 * trust the `result` param alone — the success path verifies the payment
 * server-to-server (retrieve → must be AUTHORIZED/CLOSED), captures it,
 * then runs the shared confirm+dispatch path. The Tabby webhook is the
 * safety net if the customer closes the tab before the redirect.
 */
export async function POST(request: NextRequest) {
  return handle(request);
}
export async function GET(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const bookingId = params.get("booking_id");
  const sessionId = params.get("session_id") || undefined;
  const result = params.get("result") || "success";

  const redirect = (path: string) => NextResponse.redirect(new URL(path, request.url));

  if (!bookingId) return redirect("/book");
  if (!tabbyConfigured()) return redirect("/book?payment_failed=1");

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

  // ── Cancel / failure ─────────────────────────────────────────────
  if (result === "cancel") {
    await releaseLock();
    if (booking.status === "pending") {
      await supabaseAdmin
        .from("bookings")
        .update({ status: "expired" } as never)
        .eq("id", bookingId);
    }
    return redirect("/book?cancelled=1");
  }
  if (result === "failure") {
    if (booking.status === "pending") {
      await supabaseAdmin
        .from("bookings")
        .update({ status: "payment_failed" } as never)
        .eq("id", bookingId);
    }
    return redirect("/book?payment_failed=1");
  }

  // ── Success: verify + capture server-side ────────────────────────
  const paymentId = booking.tabby_payment_id;
  if (!paymentId) return redirect("/book?payment_failed=1");

  const totalFils = booking.price_total_fils || 0;
  const retrieved = await retrievePayment(paymentId);

  let captured = false;
  if (retrieved.paymentStatus === "CLOSED") {
    captured = true; // already captured (e.g. by the webhook)
  } else if (retrieved.paymentStatus === "AUTHORIZED") {
    const cap = await capturePayment(paymentId, totalFils);
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
      error_message: `Tabby payment ${paymentId} not captured (status=${retrieved.paymentStatus ?? "unknown"})`,
      payload: { booking_id: bookingId, payment_id: paymentId },
    } as never);
    return redirect("/book?payment_failed=1");
  }

  await confirmPaidBooking({
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

  return redirect(`/book/success?booking_id=${bookingId}`);
}
