export interface PlanConfig {
  key: string;
  label: string;
  rate: number;
  setupMins: number;
  perThermostatMins: number;
  tagline: string;
}

export const PLANS: Record<string, PlanConfig> = {
  essential: {
    key: "essential",
    label: "Essential",
    rate: 349,
    setupMins: 45,
    perThermostatMins: 45,
    tagline: "Basic duct vacuuming. Perfect for light maintenance.",
  },
  signature: {
    key: "signature",
    label: "Signature",
    rate: 549,
    setupMins: 80,
    perThermostatMins: 45,
    tagline: "Full medical-grade sanitizations and restoration.",
  },
  elite: {
    key: "elite",
    label: "Elite",
    rate: 649,
    setupMins: 80,
    perThermostatMins: 60,
    tagline: "Ultimate protection with 12-month air purity guarantee.",
  },
};

export type PlanTier = keyof typeof PLANS;

export const PLAN_TIERS = Object.keys(PLANS) as PlanTier[];

export const PLAN_OPTIONS = Object.values(PLANS);

export function calcJobDuration(plan: PlanConfig, thermostats: number): number {
  return plan.setupMins + plan.perThermostatMins * Math.max(1, thermostats);
}
