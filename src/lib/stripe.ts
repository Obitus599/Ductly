import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-04-30.basil",
  typescript: true,
});

// True when STRIPE_SECRET_KEY is a test-mode key (sk_test_...). Used to
// tag bookings/customers with is_test_data so analytics, n8n
// notifications, and admin views can exclude them.
export const isStripeTestMode = (): boolean =>
  (process.env.STRIPE_SECRET_KEY || "").startsWith("sk_test_");
