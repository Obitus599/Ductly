export interface PlanConfig {
  key: string;
  label: string;
  rate: number;
  setupMins: number;
  perThermostatMins: number;
  tagline: string;
  /**
   * What the plan actually includes. Single source of truth: the pricing
   * cards, the Terms page and the chatbot's knowledge base all read this,
   * so what a customer is told on the site is what the bot repeats.
   */
  features: string[];
}

const DEFAULT_PLANS: Record<string, PlanConfig> = {
  essential: {
    key: "essential",
    label: "Essential",
    rate: 349,
    setupMins: 45,
    perThermostatMins: 45,
    tagline: "Basic duct vacuuming. Perfect for light maintenance.",
    features: [
      "TurboClean™",
      "Fan coil unit cleaning",
      "HEPA vacuuming",
      "Filter cleaning",
    ],
  },
  signature: {
    key: "signature",
    label: "Signature",
    rate: 549,
    setupMins: 80,
    perThermostatMins: 45,
    tagline: "Full medical-grade sanitizations and restoration.",
    features: [
      "TurboClean™",
      "Filter cleaning",
      "Fan coil unit cleaning",
      "Fumigation",
      "Bio-enzyme disinfection",
      "Mold remediation treatment",
      "Black mold remediation",
    ],
  },
  elite: {
    key: "elite",
    label: "Elite",
    rate: 649,
    setupMins: 80,
    perThermostatMins: 60,
    tagline: "Ultimate protection with 12-month air purity guarantee.",
    features: [
      "TurboClean™",
      "Filter cleaning",
      "Fan coil unit cleaning",
      "Fumigation",
      "Bio-enzyme disinfection",
      "Mold remediation treatment",
      "Black mold remediation",
      "AC unit coil deep clean",
      "Air quality analysis",
    ],
  },
};

/** Mutable cache — PLANS points at this reference, updated in-place so consumers always see live values. */
const livePlans: Record<string, PlanConfig> = JSON.parse(JSON.stringify(DEFAULT_PLANS));

let cacheTime = 0;
const CACHE_TTL_MS = 60_000;

function mergeRates(rates: Record<string, number>): void {
  for (const key of Object.keys(livePlans)) {
    if (rates[key] !== undefined) {
      livePlans[key].rate = rates[key];
    } else {
      livePlans[key].rate = DEFAULT_PLANS[key].rate;
    }
  }
}

async function fetchDbRates(): Promise<Record<string, number>> {
  try {
    const { supabaseAdmin } = await import("@/utils/supabase/admin");
    const { data } = await supabaseAdmin
      .from("pricing_config")
      .select("plan_key, rate")
      .returns<{ plan_key: string; rate: number }[]>();
    if (!data || data.length === 0) return {};
    const rates: Record<string, number> = {};
    for (const row of data) {
      if (row.plan_key && typeof row.rate === "number") {
        rates[row.plan_key] = row.rate;
      }
    }
    return rates;
  } catch {
    return {};
  }
}

async function refreshCache(): Promise<void> {
  const rates = await fetchDbRates();
  mergeRates(rates);
  cacheTime = Date.now();
}

/**
 * Invalidate the in-memory cache so the next read picks up fresh DB values.
 * Called by the admin settings API after a rate update.
 */
export function clearPricingCache(): void {
  cacheTime = 0;
}

/**
 * Return the current pricing config. Uses an in-memory cache (60s TTL)
 * that reads from the pricing_config table; falls back to compile-time
 * defaults when the DB is unreachable or the table doesn't exist yet.
 */
export async function getPlans(): Promise<Record<string, PlanConfig>> {
  if (Date.now() - cacheTime < CACHE_TTL_MS) return livePlans;
  await refreshCache();
  return livePlans;
}

/** Live reference to pricing — rates update in-place when the DB cache refreshes. */
export const PLANS: Record<string, PlanConfig> = livePlans;

export type PlanTier = keyof typeof DEFAULT_PLANS;

export const PLAN_TIERS = Object.keys(DEFAULT_PLANS) as PlanTier[];

export const PLAN_OPTIONS: PlanConfig[] = Object.values(livePlans);

export function calcJobDuration(plan: PlanConfig, thermostats: number): number {
  return plan.setupMins + plan.perThermostatMins * Math.max(1, thermostats);
}
