/**
 * Vitest global setup.
 * Sets dummy env vars so modules that read process.env at import time don't crash.
 */

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_dummy";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
// NODE_ENV is set by the test runner
