import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { vatFromGross } from "@/lib/vat";

/**
 * GET /api/booking-details?session_id=cs_xxx  (Stripe)
 *              or          ?booking_id=<uuid>  (DB-backed, e.g. Tabby)
 *
 * Retrieves booking details for the success page. The Stripe path reads
 * the Checkout Session; the booking_id path reads the confirmed booking
 * straight from the DB (Tabby has no Stripe session).
 */
export async function GET(request: NextRequest) {
  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = await checkRateLimit(`booking-details:${clientIp}`, 15, 5 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429 }
    );
  }

  // DB-backed path (Tabby and any non-Stripe provider): look the confirmed
  // booking up directly. Only confirmed bookings are exposed.
  const bookingId = request.nextUrl.searchParams.get("booking_id");
  if (bookingId) {
    const { data: booking } = await supabaseAdmin
      .from("bookings")
      .select(
        "status, plan, address, slot_start, thermostats, price_net_fils, price_vat_fils, price_total_fils"
      )
      .eq("id", bookingId)
      .returns<
        {
          status: string;
          plan: string | null;
          address: string | null;
          slot_start: string | null;
          thermostats: number | null;
          price_net_fils: number | null;
          price_vat_fils: number | null;
          price_total_fils: number | null;
        }[]
      >()
      .maybeSingle();

    if (!booking || booking.status !== "confirmed") {
      return NextResponse.json(
        { error: "Booking not found or not yet confirmed." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      plan: booking.plan || "signature",
      address: booking.address || "",
      slot_start: booking.slot_start || "",
      property_type: "",
      bedrooms: "0",
      thermostats: String(booking.thermostats ?? 1),
      price_aed: String(Math.round((booking.price_net_fils || 0) / 100)),
      price_net_fils: booking.price_net_fils || 0,
      price_vat_fils: booking.price_vat_fils || 0,
      price_total_fils: booking.price_total_fils || 0,
    });
  }

  const sessionId = request.nextUrl.searchParams.get("session_id");

  if (!sessionId || !sessionId.startsWith("cs_")) {
    return NextResponse.json(
      { error: "Valid session_id is required." },
      { status: 400 }
    );
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      return NextResponse.json(
        { error: "Payment not completed." },
        { status: 402 }
      );
    }

    const meta = session.metadata || {};

    // Prefer the metadata fils breakdown. For legacy sessions created
    // before the VAT-exclusive split (which have amount_total but no
    // fils breakdown), derive net/VAT from the total so the displayed
    // Subtotal + VAT always reconciles with the Total instead of showing
    // 0.00 / 0.00 against a non-zero total.
    const totalFils =
      Number(meta.price_total_fils) ||
      (typeof session.amount_total === "number" ? session.amount_total : 0);
    let netFils = Number(meta.price_net_fils) || 0;
    let vatFils = Number(meta.price_vat_fils) || 0;
    if ((!netFils || !vatFils) && totalFils > 0) {
      const derived = vatFromGross(totalFils);
      netFils = derived.netFils;
      vatFils = derived.vatFils;
    }

    return NextResponse.json({
      plan: meta.plan || "signature",
      address: meta.address || "",
      slot_start: meta.slot_start || "",
      property_type: meta.property_type || "",
      bedrooms: meta.bedrooms || "0",
      thermostats: meta.thermostats || "1",
      price_aed: meta.price_aed || "0", // net, whole AED (legacy)
      price_net_fils: netFils,
      price_vat_fils: vatFils,
      price_total_fils: totalFils,
    });
  } catch (err) {
    console.error("Failed to retrieve checkout session:", err);
    return NextResponse.json(
      { error: "Could not retrieve booking details." },
      { status: 500 }
    );
  }
}
