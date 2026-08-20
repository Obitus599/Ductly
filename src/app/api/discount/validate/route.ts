import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/client-ip";
import { PLANS } from "@/lib/pricing";
import { validateCodeForUse, applyDiscount } from "@/lib/discounts";

/**
 * GET /api/discount/validate?code=DUCTLY-XXXXX&plan=signature&thermostats=2
 *
 * Read-only preview of what a code would do to the checkout total. The
 * authoritative application happens server-side in /api/checkout — this
 * endpoint only lets the UI show the discounted price before the customer
 * pays.
 *
 * Response: { valid, code, percent, savingsFils, netFils, vatFils, totalFils }
 *        or  { valid: false, reason }
 */
export async function GET(request: NextRequest) {
  const clientIp = getClientIp(request);
  const rl = await checkRateLimit(`discount-validate:${clientIp}`, 30, 5 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ valid: false, reason: "rate_limited" }, { status: 429 });
  }

  const code = (request.nextUrl.searchParams.get("code") || "").trim().toUpperCase();
  const plan = request.nextUrl.searchParams.get("plan") || "";
  const thermostats = Math.max(1, Math.min(50, Math.floor(Number(request.nextUrl.searchParams.get("thermostats")) || 1)));

  const planCfg = PLANS[plan];
  if (!planCfg) {
    return NextResponse.json({ valid: false, reason: "invalid_plan" }, { status: 400 });
  }

  const check = await validateCodeForUse(code);
  if (!check.ok || check.percent === undefined) {
    return NextResponse.json({ valid: false, reason: check.reason ?? "invalid" });
  }

  const breakdown = applyDiscount(planCfg.rate * thermostats * 100, check.percent);

  return NextResponse.json({
    valid: true,
    code,
    percent: check.percent,
    savingsFils: breakdown.savingsFils,
    netFils: breakdown.netFils,
    vatFils: breakdown.vatFils,
    totalFils: breakdown.totalFils,
  });
}
