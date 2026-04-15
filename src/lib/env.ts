/**
 * Validates that all required environment variables are set.
 * Called from instrumentation.ts at server startup.
 */

const REQUIRED_SERVER = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "NEXT_PUBLIC_APP_URL",
] as const;

const OPTIONAL_SERVER = [
  "ADMIN_API_KEY",
  "GOOGLE_MAPS_API_KEY",
  "OPENROUTER_API_KEY",
] as const;

export function validateEnv() {
  const missing: string[] = [];

  for (const key of REQUIRED_SERVER) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n  ${missing.join("\n  ")}\n\nSet these in .env.local or your deployment environment.`
    );
  }

  // Warn about optional but useful vars
  for (const key of OPTIONAL_SERVER) {
    if (!process.env[key]) {
      console.warn(`[env] Optional variable ${key} is not set — related features will be disabled.`);
    }
  }
}
