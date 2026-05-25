import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { CURRENT_CONSENT_VERSION } from "@/lib/consent";

/**
 * Pricing: plan tier rate × number of thermostats.
 * Duration: setup time + per-thermostat work time.
 */
const PLAN_CONFIG: Record<string, { rate: number; setupMins: number; perThermostatMins: number }> = {
  essential: { rate: 349, setupMins: 45, perThermostatMins: 45 },
  signature: { rate: 549, setupMins: 80, perThermostatMins: 45 },
  elite:     { rate: 699, setupMins: 80, perThermostatMins: 60 },
};

/**
 * POST /api/checkout
 *
 * Creates a Stripe Checkout Session for a duct cleaning booking.
 */
export async function POST(request: NextRequest) {
  // Rate limit: 10 checkout attempts per IP per 5 minutes
  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = await checkRateLimit(`checkout:${clientIp}`, 10, 5 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many checkout attempts. Please wait a few minutes." },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const {
      customer_name,
      customer_email,
      customer_phone,
      address,
      address_details,
      property_type,
      bedrooms,
      thermostats,
      ducts,
      plan,
      slot_start,
      session_id,
      consent_version,
    } = body;

    // Validate required fields
    if (
      !customer_name ||
      !customer_email ||
      !customer_phone ||
      !address ||
      !property_type ||
      bedrooms === undefined ||
      thermostats === undefined ||
      ducts === undefined ||
      !plan ||
      !slot_start ||
      !session_id
    ) {
      return NextResponse.json(
        { error: "Missing required fields." },
        { status: 400 }
      );
    }

    // Enforce string length limits
    if (String(customer_name).length > 200 || String(address).length > 500) {
      return NextResponse.json(
        { error: "Name or address too long." },
        { status: 400 }
      );
    }

    // Validate email format
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customer_email)) {
      return NextResponse.json(
        { error: "Invalid email address." },
        { status: 400 }
      );
    }

    // Validate phone: must contain at least 7 digits, may include +, spaces, dashes
    const phoneDigits = customer_phone.replace(/[^0-9]/g, "");
    if (phoneDigits.length < 7 || phoneDigits.length > 15 || !/^\+?[\d\s-]{7,20}$/.test(customer_phone)) {
      return NextResponse.json(
        { error: "Invalid phone number." },
        { status: 400 }
      );
    }

    // Validate property type
    if (!["villa", "apartment", "office"].includes(property_type)) {
      return NextResponse.json(
        { error: "Invalid property type." },
        { status: 400 }
      );
    }

    // Validate slot_start is a valid ISO timestamp
    if (isNaN(new Date(slot_start).getTime())) {
      return NextResponse.json(
        { error: "Invalid slot_start timestamp." },
        { status: 400 }
      );
    }

    // Validate plan
    if (!PLAN_CONFIG[plan]) {
      return NextResponse.json(
        { error: "Invalid plan. Must be essential, signature, or elite." },
        { status: 400 }
      );
    }

    // PDPL: must have explicit consent matching the current policy version
    if (consent_version !== CURRENT_CONSENT_VERSION) {
      return NextResponse.json(
        { error: "You must accept the current privacy policy to proceed." },
        { status: 400 }
      );
    }

    const thermostatCount = Math.max(1, Math.min(50, Math.floor(Number(thermostats) || 1)));
    const ductCount = Math.max(1, Math.min(200, Math.floor(Number(ducts) || 1)));
    const planKey = plan;

    // Recalculate job duration & slot_end server-side (don't trust client)
    const planCfg = PLAN_CONFIG[planKey];
    const jobDurationMins = planCfg.setupMins + planCfg.perThermostatMins * thermostatCount;
    const computedSlotEnd = new Date(new Date(slot_start).getTime() + jobDurationMins * 60 * 1000).toISOString();

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) {
      console.error("NEXT_PUBLIC_APP_URL is not set.");
      return NextResponse.json(
        { error: "App URL not configured." },
        { status: 500 }
      );
    }

    // Calculate price: tier rate × thermostats
    const rate = planCfg.rate;
    const priceAED = rate * thermostatCount;
    const priceInFils = priceAED * 100;

    // 1. Verify the booking lock is still active
    const { data: lock } = await supabaseAdmin
      .from("booking_locks")
      .select("id")
      .eq("session_id", session_id)
      .eq("slot_start", slot_start)
      .gt("expires_at", new Date().toISOString())
      .returns<{ id: string }[]>()
      .single();

    if (!lock) {
      return NextResponse.json(
        { error: "Booking lock expired. Please select a slot again." },
        { status: 409 }
      );
    }

    // 2. Upsert customer (refresh consent record on every booking)
    const { data: customer, error: customerError } = await supabaseAdmin
      .from("customers")
      .upsert(
        {
          name: customer_name,
          email: customer_email,
          phone: customer_phone,
          consent_given_at: new Date().toISOString(),
          consent_version,
          deleted_at: null,
        } as never,
        { onConflict: "email" }
      )
      .select("id")
      .returns<{ id: string }[]>()
      .single();

    if (customerError || !customer) {
      console.error("Customer upsert error:", customerError);
      return NextResponse.json(
        { error: "Failed to create customer record." },
        { status: 500 }
      );
    }

    // 3. Create booking in pending state
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .insert({
        customer_id: customer.id,
        slot_start,
        slot_end: computedSlotEnd,
        address,
        address_details: address_details || null,
        status: "pending",
      } as never)
      .select("id")
      .returns<{ id: string }[]>()
      .single();

    if (bookingError || !booking) {
      console.error("Booking insert error:", bookingError);
      return NextResponse.json(
        { error: "Failed to create booking." },
        { status: 500 }
      );
    }

    // 4. Build Stripe line item description
    const planName = planKey.charAt(0).toUpperCase() + planKey.slice(1);
    const propertyLabel = property_type === "villa" ? "Villa" : property_type === "office" ? "Office" : "Apartment";
    const bedroomLabel =
      bedrooms === 0
        ? "Studio"
        : `${bedrooms} bedroom${bedrooms > 1 ? "s" : ""}`;

    // 5. Create Stripe Checkout Session
    let checkoutSession;
    try {
      checkoutSession = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        customer_email,
        client_reference_id: booking.id,
        metadata: {
          booking_id: booking.id,
          customer_id: customer.id,
          session_id,
          slot_start,
          address,
          building_name: address_details?.building_name || "",
          flat_number: address_details?.flat_number || "",
          property_type,
          bedrooms: String(bedrooms),
          thermostats: String(thermostatCount),
          ducts: String(ductCount),
          plan: planKey,
          price_aed: String(priceAED),
        },
        payment_intent_data: {
          metadata: {
            booking_id: booking.id,
            customer_id: customer.id,
            session_id,
            slot_start,
            address,
          },
        },
        line_items: [
          {
            price_data: {
              currency: "aed",
              unit_amount: priceInFils,
              product_data: {
                name: `Duct Cleaning — ${planName} Plan`,
                description: `${propertyLabel} — ${bedroomLabel} · ${thermostatCount} thermostat${thermostatCount > 1 ? "s" : ""} · ${ductCount} duct${ductCount > 1 ? "s" : ""}`,
              },
            },
            quantity: 1,
          },
        ],
        success_url: `${appUrl}/book/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/book?cancelled=true&plan=${planKey}`,
      }, {
        idempotencyKey: `checkout_${booking.id}`,
      });
    } catch (stripeError) {
      // Clean up orphaned booking so it doesn't block the slot
      console.error("Stripe session creation failed:", stripeError);
      await supabaseAdmin
        .from("bookings")
        .update({ status: "failed" } as never)
        .eq("id", booking.id);
      return NextResponse.json(
        { error: "Failed to create payment session." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      checkout_url: checkoutSession.url,
      booking_id: booking.id,
      price_aed: priceAED,
    });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session." },
      { status: 500 }
    );
  }
}
