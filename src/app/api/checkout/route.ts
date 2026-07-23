import { NextRequest, NextResponse } from "next/server";
import { stripe, isStripeTestMode } from "@/lib/stripe";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { CURRENT_CONSENT_VERSION } from "@/lib/consent";
import { vatFromNet, VAT_RATE_PERCENT } from "@/lib/vat";
import { isContactVerified, normalizeIdentifier } from "@/lib/verification";
import { isUaeMobile } from "@/lib/phone-uae";
import { tabbyConfigured, createCheckoutSession, formatTabbyAmount } from "@/lib/tabby";

/**
 * Pricing: plan tier rate × number of thermostats.
 * Duration: setup time + per-thermostat work time.
 */
const PLAN_CONFIG: Record<string, { rate: number; setupMins: number; perThermostatMins: number }> = {
  essential: { rate: 349, setupMins: 45, perThermostatMins: 45 },
  signature: { rate: 549, setupMins: 80, perThermostatMins: 45 },
  elite:     { rate: 649, setupMins: 80, perThermostatMins: 60 },
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
      payment_method,
    } = body;

    // Which rail: card (Stripe, default) or Tabby BNPL.
    const useTabby = payment_method === "tabby";

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

    // Validate phone: UAE mobile only (accepts 05x, +971, 00971 — all
    // canonicalized to E.164 for storage below). Ductly is UAE-only and
    // dispatch/OTP both need a deliverable UAE number.
    if (!isUaeMobile(customer_phone)) {
      return NextResponse.json(
        { error: "Enter a valid UAE mobile number (e.g. 050 123 4567)." },
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

    // #7 customer verification gate. Off by default so the flow is
    // unchanged until the booking-page OTP UI ships.
    //
    // Email and phone are gated INDEPENDENTLY, because phone OTP rides on
    // WhatsApp (needs a Meta-approved template) while email (Resend) is
    // always available. So:
    //   REQUIRE_CONTACT_VERIFICATION=true  → require a verified EMAIL
    //   REQUIRE_PHONE_VERIFICATION=true    → ALSO require a verified phone
    // Phone is only required when its own flag is on — otherwise an
    // un-verifiable phone (template pending) would block every booking.
    //
    // IMPORTANT: pair each server flag with its NEXT_PUBLIC_ twin so the
    // matching OTP UI renders — a server flag with no UI means customers
    // can never verify and every checkout 403s (a full booking outage).
    if (process.env.REQUIRE_CONTACT_VERIFICATION === "true") {
      const requirePhone = process.env.REQUIRE_PHONE_VERIFICATION === "true";
      const [emailVerified, phoneVerified] = await Promise.all([
        isContactVerified("email", normalizeIdentifier("email", customer_email)),
        requirePhone
          ? isContactVerified("sms", normalizeIdentifier("sms", customer_phone))
          : Promise.resolve(true),
      ]);
      if (!emailVerified || !phoneVerified) {
        return NextResponse.json(
          {
            error: requirePhone
              ? "Please verify your email and phone before booking."
              : "Please verify your email before booking.",
            email_verified: emailVerified,
            phone_verified: phoneVerified,
          },
          { status: 403 }
        );
      }
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

    // Calculate price: tier rate × thermostats. Displayed prices are
    // NET (VAT-exclusive); 5% VAT is added on top at checkout.
    const rate = planCfg.rate;
    const priceAED = rate * thermostatCount;
    const priceInFils = priceAED * 100;
    const vat = vatFromNet(priceInFils);

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

    // 2. Upsert customer (refresh consent record on every booking).
    //    Normalize email/phone for storage so casing/spacing variants
    //    don't create duplicate customers (onConflict dedupes on email),
    //    and so the stored values match the normalized identifiers used by
    //    the verification gate and PDPL export/erasure matching.
    const emailNorm = String(customer_email).trim().toLowerCase();
    const phoneNorm = normalizeIdentifier("sms", customer_phone);
    const testMode = isStripeTestMode();
    const { data: customer, error: customerError } = await supabaseAdmin
      .from("customers")
      .upsert(
        {
          name: customer_name,
          email: emailNorm,
          phone: phoneNorm,
          consent_given_at: new Date().toISOString(),
          consent_version,
          deleted_at: null,
          is_test_data: testMode,
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
        is_test_data: testMode,
        payment_provider: useTabby ? "tabby" : "stripe",
        // Financial snapshot for the FTA tax invoice — persisted here so
        // the invoice never has to recompute or read back from Stripe.
        plan: planKey,
        thermostats: thermostatCount,
        price_net_fils: vat.netFils,
        price_vat_fils: vat.vatFils,
        price_total_fils: vat.totalFils,
        vat_rate: vat.vatRatePercent,
        currency: "aed",
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

    // 3b. Tabby (BNPL) branch — create a Tabby hosted-checkout session and
    //     redirect there instead of Stripe. Same pending booking; the
    //     provider that confirms it is recorded on the row.
    if (useTabby) {
      if (!tabbyConfigured()) {
        await supabaseAdmin
          .from("bookings")
          .update({ status: "failed" } as never)
          .eq("id", booking.id);
        return NextResponse.json(
          { error: "Tabby is not available right now. Please pay by card." },
          { status: 503 }
        );
      }

      const planName = planKey.charAt(0).toUpperCase() + planKey.slice(1);
      const session = await createCheckoutSession({
        bookingId: booking.id,
        amountFils: vat.totalFils,
        currency: "AED",
        description: `Ductly duct cleaning — ${planName} Plan`,
        buyer: { name: customer_name, email: emailNorm, phone: phoneNorm },
        items: [
          {
            title: `Duct Cleaning — ${planName} Plan`,
            quantity: 1,
            unit_price: formatTabbyAmount(vat.totalFils),
            category: "Home Services",
          },
        ],
        merchantUrls: {
          success: `${appUrl}/api/tabby/callback?booking_id=${booking.id}&session_id=${encodeURIComponent(session_id)}&result=success`,
          cancel: `${appUrl}/api/tabby/callback?booking_id=${booking.id}&session_id=${encodeURIComponent(session_id)}&result=cancel`,
          failure: `${appUrl}/api/tabby/callback?booking_id=${booking.id}&session_id=${encodeURIComponent(session_id)}&result=failure`,
        },
      });

      if (!session.ok) {
        await supabaseAdmin
          .from("bookings")
          .update({ status: "failed" } as never)
          .eq("id", booking.id);
        return NextResponse.json(
          { error: "Could not start the Tabby payment. Please pay by card." },
          { status: 502 }
        );
      }

      if (!session.eligible || !session.webUrl) {
        // Customer isn't eligible for Tabby on this order — tell the client
        // to fall back to card. Leave the booking failed so the slot frees.
        await supabaseAdmin
          .from("bookings")
          .update({ status: "failed" } as never)
          .eq("id", booking.id);
        return NextResponse.json(
          {
            error:
              "Tabby isn't available for this order. Please pay by card instead.",
            eligible: false,
            fallback: "card",
            rejection_reason: session.rejectionReason ?? null,
          },
          { status: 422 }
        );
      }

      // Store the Tabby payment id so the return handler + webhook can
      // locate this booking.
      await supabaseAdmin
        .from("bookings")
        .update({ tabby_payment_id: session.paymentId } as never)
        .eq("id", booking.id);

      return NextResponse.json({
        checkout_url: session.webUrl,
        provider: "tabby",
        booking_id: booking.id,
        price_aed: priceAED,
        price_net_fils: vat.netFils,
        price_vat_fils: vat.vatFils,
        price_total_fils: vat.totalFils,
      });
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
        customer_email: emailNorm,
        client_reference_id: booking.id,
        metadata: {
          booking_id: booking.id,
          customer_id: customer.id,
          customer_phone: phoneNorm,
          customer_name,
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
          price_net_fils: String(vat.netFils),
          price_vat_fils: String(vat.vatFils),
          price_total_fils: String(vat.totalFils),
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
              unit_amount: vat.netFils,
              product_data: {
                name: `Duct Cleaning — ${planName} Plan`,
                description: `${propertyLabel} — ${bedroomLabel} · ${thermostatCount} thermostat${thermostatCount > 1 ? "s" : ""} · ${ductCount} duct${ductCount > 1 ? "s" : ""}`,
              },
            },
            quantity: 1,
          },
          {
            // VAT charged as its own line so the customer sees it broken
            // out at checkout — total = net + VAT.
            price_data: {
              currency: "aed",
              unit_amount: vat.vatFils,
              product_data: {
                name: `VAT (${VAT_RATE_PERCENT}%)`,
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
      price_aed: priceAED, // net (VAT-exclusive), whole AED
      price_net_fils: vat.netFils,
      price_vat_fils: vat.vatFils,
      price_total_fils: vat.totalFils,
    });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session." },
      { status: 500 }
    );
  }
}
