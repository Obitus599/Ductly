import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

/**
 * Supabase client with SERVICE ROLE key.
 * Bypasses all RLS policies — use ONLY in server-side API routes,
 * never expose to the browser.
 */
export const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
