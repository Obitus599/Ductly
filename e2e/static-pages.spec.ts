import { test, expect } from "@playwright/test";

test.describe("Static pages", () => {
  test("privacy policy page loads", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.locator("h1")).toContainText("Privacy Policy");
    // Has back link to home
    await expect(page.locator('a[href="/"]').first()).toBeVisible();
  });

  test("terms of service page loads", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.locator("h1")).toContainText("Terms of Service");
    await expect(page.locator('a[href="/"]').first()).toBeVisible();
  });

  test("404 page shows for unknown routes", async ({ page }) => {
    const res = await page.goto("/this-does-not-exist");
    expect(res?.status()).toBe(404);
  });

  test("success page loads (without session_id shows minimal UI)", async ({ page }) => {
    await page.goto("/book/success");
    // Should show the booking confirmed heading even without data
    await expect(page.locator("text=Booking Confirmed")).toBeVisible();
  });
});

test.describe("Health endpoint", () => {
  test("GET /api/health returns JSON", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBeDefined();
    expect(body.checks).toBeDefined();
  });
});
