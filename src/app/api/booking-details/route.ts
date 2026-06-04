import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { checkRateLimit } from "@/lib/rate-limit";
import { vatFromGross } from "@/lib/vat";

/**
 * GET /api/booking-details?session_id=cs_xxx
 *
 * Retrieves booking details from a completed Stripe Checkout Session.
 * Used by the success page to display confirmation info.
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
