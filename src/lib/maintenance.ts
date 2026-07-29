import { supabaseAdmin } from "@/utils/supabase/admin";
import { reconcileTabbyPayments, type ReconcileResult } from "@/lib/tabby-reconcile";

/**
 * Periodic housekeeping.
 *
 * These sweeps used to be piggybacked on customer traffic to /api/slots,
 * which meant they only ran when someone happened to open the booking
 * page — exactly the wrong coupling for retention deletes and payment
 * reconciliation, which must happen on quiet days too. Point a scheduler
 * at POST /api/cron/cleanup to run them on a real timer.
 */

/**
 * Pending bookings older than this are swept to `expired` so the slot
 * frees. MUST stay comfortably above the slowest realistic hosted
 * checkout — sweeping a customer who is mid-payment strands a captured
 * charge on a booking that can no longer be confirmed.
 */
export const STALE_BOOKING_TTL_MINS = 45;

export interface MaintenanceResult {
  expiredBookings: number;
  deletedLocks: number;
  deletedVerificationCodes: number;
  deletedErrorLogs: number;
  tabby: ReconcileResult | null;
  errors: string[];
}

/** Expire abandoned pre-payment bookings. Safe to call often. */
export async function expireStaleBookings(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_BOOKING_TTL_MINS * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("bookings")
    .update({ status: "expired" } as never)
    .eq("status", "pending")
    .lt("created_at", cutoff)
    .select("id")
    .returns<{ id: string }[]>();

  if (error) {
    console.error("expireStaleBookings failed:", error.message);
    return 0;
  }
  return data?.length ?? 0;
}

/** Drop expired pre-payment slot holds. */
export async function cleanupExpiredLocks(): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("booking_locks")
    .delete()
    .lt("expires_at", new Date().toISOString())
    .select("id")
    .returns<{ id: string }[]>();

  if (error) {
    console.error("cleanupExpiredLocks failed:", error.message);
    return 0;
  }
  return data?.length ?? 0;
}

async function callCleanupRpc(fn: string): Promise<number> {
  try {
    const { data, error } = await (supabaseAdmin.rpc as Function)(fn, {});
    if (error) {
      console.warn(`${fn} failed:`, error.message);
      return 0;
    }
    return Number(data) || 0;
  } catch (err) {
    console.warn(`${fn} threw:`, err);
    return 0;
  }
}

export async function runMaintenance(
  options: { reconcileTabby?: boolean } = {}
): Promise<MaintenanceResult> {
  const errors: string[] = [];
  const result: MaintenanceResult = {
    expiredBookings: 0,
    deletedLocks: 0,
    deletedVerificationCodes: 0,
    deletedErrorLogs: 0,
    tabby: null,
    errors,
  };

  // Each step is independent — one failing sweep must not skip the rest.
  const step = async (label: string, run: () => Promise<void>) => {
    try {
      await run();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`maintenance:${label} failed:`, message);
      errors.push(`${label}: ${message}`);
    }
  };

  await step("expire_stale_bookings", async () => {
    result.expiredBookings = await expireStaleBookings();
  });
  await step("cleanup_locks", async () => {
    result.deletedLocks = await cleanupExpiredLocks();
  });
  // Retention: verification_codes hold raw email/phone identifiers, and
  // error_log rows can carry request payloads. Neither is useful past its
  // debugging window and both are PDPL liability if kept.
  await step("cleanup_verification_codes", async () => {
    result.deletedVerificationCodes = await callCleanupRpc("cleanup_verification_codes");
  });
  await step("cleanup_error_log", async () => {
    result.deletedErrorLogs = await callCleanupRpc("cleanup_error_log");
  });

  if (options.reconcileTabby !== false) {
    await step("tabby_reconcile", async () => {
      result.tabby = await reconcileTabbyPayments();
    });
  }

  return result;
}
