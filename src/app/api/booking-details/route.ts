import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { checkRateLimit } from "@/lib/rate-limit";

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

    return NextResponse.json({
      plan: meta.plan || "signature",
      address: meta.address || "",
      slot_start: meta.slot_start || "",
      property_type: meta.property_type || "",
      bedrooms: meta.bedrooms || "0",
      thermostats: meta.thermostats || "1",
      price_aed: meta.price_aed || "0",
    });
  } catch (err) {
    console.error("Failed to retrieve checkout session:", err);
    return NextResponse.json(
      { error: "Could not retrieve booking details." },
      { status: 500 }
    );
  }
}
