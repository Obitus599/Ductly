import { describe, it, expect } from "vitest";
import { PLANS, PLAN_TIERS, PLAN_OPTIONS, calcJobDuration } from "./pricing";
import { vatFromNet } from "./vat";

/**
 * pricing.ts is the single source of truth for what a customer is charged
 * and how long a crew is booked out for. It had no test file at all, so
 * nothing caught a rate or duration drifting away from what the site,
 * Terms page and chatbot all quote.
 */
describe("PLANS", () => {
  it("exposes exactly the three tiers the API validates against", () => {
    expect(PLAN_TIERS.sort()).toEqual(["elite", "essential", "signature"]);
  });

  it("keys match their own `key` field (lookup by key must be self-consistent)", () => {
    for (const [key, plan] of Object.entries(PLANS)) {
      expect(plan.key).toBe(key);
    }
  });

  it("holds the contracted AED rates", () => {
    // These are the prices printed on the pricing cards and the Terms
    // page. Changing one is a commercial decision, not a refactor — this
    // test is here to make that deliberate.
    expect(PLANS.essential.rate).toBe(349);
    expect(PLANS.signature.rate).toBe(549);
    expect(PLANS.elite.rate).toBe(649);
  });

  it("prices strictly increase with tier", () => {
    expect(PLANS.essential.rate).toBeLessThan(PLANS.signature.rate);
    expect(PLANS.signature.rate).toBeLessThan(PLANS.elite.rate);
  });

  it("every plan has positive, whole-minute durations", () => {
    for (const plan of PLAN_OPTIONS) {
      expect(plan.setupMins).toBeGreaterThan(0);
      expect(plan.perThermostatMins).toBeGreaterThan(0);
      expect(Number.isInteger(plan.setupMins)).toBe(true);
      expect(Number.isInteger(plan.perThermostatMins)).toBe(true);
    }
  });

  it("every plan has a tagline and a non-empty feature list", () => {
    // The chatbot reads `features` for its "Includes:" lines; an empty
    // list silently degrades the bot's answers rather than erroring.
    for (const plan of PLAN_OPTIONS) {
      expect(plan.tagline.length).toBeGreaterThan(0);
      expect(plan.features.length).toBeGreaterThan(0);
      expect(plan.features.every((f) => f.trim().length > 0)).toBe(true);
    }
  });

  it("higher tiers include at least everything the tier below does", () => {
    // Elite is a strict superset of Signature; Signature adds to Essential.
    for (const f of PLANS.signature.features) {
      expect(PLANS.elite.features).toContain(f);
    }
    expect(PLANS.elite.features.length).toBeGreaterThan(PLANS.signature.features.length);
    expect(PLANS.signature.features.length).toBeGreaterThan(PLANS.essential.features.length);
  });
});

describe("calcJobDuration", () => {
  it("is setup + per-thermostat × count", () => {
    // essential: 45 setup + 45 × 2 = 135
    expect(calcJobDuration(PLANS.essential, 2)).toBe(135);
    // elite: 80 setup + 60 × 1 = 140
    expect(calcJobDuration(PLANS.elite, 1)).toBe(140);
    // signature: 80 setup + 45 × 4 = 260
    expect(calcJobDuration(PLANS.signature, 4)).toBe(260);
  });

  it("floors the thermostat count at 1", () => {
    // A 0/negative count must never produce a shorter-than-setup window —
    // that would let a second booking overlap the crew's actual work.
    expect(calcJobDuration(PLANS.essential, 0)).toBe(90);
    expect(calcJobDuration(PLANS.essential, -5)).toBe(90);
  });

  it("grows monotonically with thermostat count", () => {
    let prev = 0;
    for (let n = 1; n <= 10; n++) {
      const d = calcJobDuration(PLANS.signature, n);
      expect(d).toBeGreaterThan(prev);
      prev = d;
    }
  });

  it("never returns less than the setup time", () => {
    for (const plan of PLAN_OPTIONS) {
      expect(calcJobDuration(plan, 1)).toBeGreaterThanOrEqual(plan.setupMins);
    }
  });
});

describe("pricing ↔ VAT integration", () => {
  it("produces whole-fils VAT totals for every plan at 1–10 thermostats", () => {
    // Checkout charges `rate × thermostats × 100` fils net, then adds VAT.
    // A fractional fils would round differently between the Stripe line
    // items, the Tabby amount string and the stored invoice snapshot.
    for (const plan of PLAN_OPTIONS) {
      for (let n = 1; n <= 10; n++) {
        const vat = vatFromNet(plan.rate * n * 100);
        expect(Number.isInteger(vat.netFils)).toBe(true);
        expect(Number.isInteger(vat.vatFils)).toBe(true);
        expect(Number.isInteger(vat.totalFils)).toBe(true);
        expect(vat.netFils + vat.vatFils).toBe(vat.totalFils);
      }
    }
  });
});
