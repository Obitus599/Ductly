import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// We need to test validateEnv in isolation, so we import it fresh each test
describe("validateEnv", () => {
  const REQUIRED = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "NEXT_PUBLIC_APP_URL",
  ];

  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = {};
    for (const key of REQUIRED) {
      savedEnv[key] = process.env[key];
    }
    // Ensure all required vars are set for the baseline
    for (const key of REQUIRED) {
      process.env[key] = `test-${key}`;
    }
  });

  afterEach(() => {
    for (const key of REQUIRED) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
    vi.restoreAllMocks();
  });

  it("passes when all required vars are set", async () => {
    const { validateEnv } = await import("./env");
    expect(() => validateEnv()).not.toThrow();
  });

  it("throws when a required var is missing", async () => {
    delete process.env.STRIPE_SECRET_KEY;

    // Need to reimport to get fresh module
    vi.resetModules();
    const { validateEnv } = await import("./env");
    expect(() => validateEnv()).toThrow("STRIPE_SECRET_KEY");
  });

  it("throws listing all missing vars at once", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.NEXT_PUBLIC_APP_URL;

    vi.resetModules();
    const { validateEnv } = await import("./env");
    expect(() => validateEnv()).toThrow(/STRIPE_SECRET_KEY/);
    try {
      validateEnv();
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("STRIPE_SECRET_KEY");
      expect(msg).toContain("NEXT_PUBLIC_APP_URL");
    }
  });

  it("warns about optional vars but does not throw", async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    vi.resetModules();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { validateEnv } = await import("./env");
    expect(() => validateEnv()).not.toThrow();
    expect(warnSpy).toHaveBeenCalled();
  });
});
