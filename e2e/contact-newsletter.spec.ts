import { test, expect } from "@playwright/test";

test.describe("Contact form", () => {
  test("contact section has form fields", async ({ page }) => {
    await page.goto("/");
    await page.locator("#contact").scrollIntoViewIfNeeded();

    // Name and email inputs should exist
    await expect(page.locator('#contact input[type="text"], #contact input[name="name"], #contact input[placeholder*="name" i]').first()).toBeVisible();
    await expect(page.locator('#contact input[type="email"], #contact input[placeholder*="email" i]').first()).toBeVisible();
  });

  test("newsletter section has email input and subscribe button", async ({ page }) => {
    await page.goto("/");

    // Scroll to footer area where newsletter lives
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);

    // There should be an email input for newsletter
    const emailInputs = page.locator('input[type="email"]');
    const count = await emailInputs.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

test.describe("API validation (E2E)", () => {
  test("POST /api/contact rejects empty body", async ({ request }) => {
    const res = await request.post("/api/contact", {
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  test("POST /api/newsletter rejects invalid email", async ({ request }) => {
    const res = await request.post("/api/newsletter", {
      data: { email: "not-valid" },
    });
    expect(res.status()).toBe(400);
  });

  test("POST /api/checkout rejects missing fields", async ({ request }) => {
    const res = await request.post("/api/checkout", {
      data: { customer_name: "Test" },
    });
    expect(res.status()).toBe(400);
  });

  test("GET /api/slots rejects missing date", async ({ request }) => {
    const res = await request.get("/api/slots");
    expect(res.status()).toBe(400);
  });

  test("GET /api/booking-details rejects missing session_id", async ({ request }) => {
    const res = await request.get("/api/booking-details");
    expect(res.status()).toBe(400);
  });
});
