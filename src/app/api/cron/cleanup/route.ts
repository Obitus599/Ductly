import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { runMaintenance } from "@/lib/maintenance";

/**
 * POST /api/cron/cleanup
 *
 * Scheduled housekeeping: expire abandoned bookings, drop stale slot
 * holds, apply retention deletes to verification_codes / error_log, and
 * reconcile any Tabby authorization that neither the redirect nor the
 * webhook managed to settle.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>` (or `x-cron-secret`).
 * Fails closed — an unset CRON_SECRET disables the endpoint entirely
 * rather than exposing an unauthenticated job trigger.
 *
 * Suggested cadence: every 10 minutes.
 */
export const dynamic = "force-dynamic";

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("CRON_SECRET is not set — refusing cleanup request.");
    return NextResponse.json({ error: "Cron secret not configured." }, { status: 503 });
  }

  const auth = request.headers.get("authorization");
  const provided =
    (auth?.startsWith("Bearer ") ? auth.slice(7) : auth) ||
    request.headers.get("x-cron-secret") ||
    "";

  if (!safeEqual(provided, secret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await runMaintenance();
  return NextResponse.json({ ok: result.errors.length === 0, ...result });
}

export async function POST(request: NextRequest) {
  return handle(request);
}

// GET is accepted because several managed schedulers (including Vercel
// Cron) only issue GETs. Same auth, same work.
export async function GET(request: NextRequest) {
  return handle(request);
}
