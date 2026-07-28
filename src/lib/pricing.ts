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

export const PLANS: Record<string, PlanConfig> = {
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

export type PlanTier = keyof typeof PLANS;

export const PLAN_TIERS = Object.keys(PLANS) as PlanTier[];

export const PLAN_OPTIONS = Object.values(PLANS);

export function calcJobDuration(plan: PlanConfig, thermostats: number): number {
  return plan.setupMins + plan.perThermostatMins * Math.max(1, thermostats);
}
