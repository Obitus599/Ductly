import { test, expect } from "@playwright/test";

test.describe("Admin access control", () => {
  test("redirects unauthenticated user from /admin to /admin/login", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForURL("**/admin/login");
    expect(page.url()).toContain("/admin/login");
  });

  test("redirects unauthenticated user from /admin/bookings to /admin/login", async ({ page }) => {
    await page.goto("/admin/bookings");
    await page.waitForURL("**/admin/login");
    expect(page.url()).toContain("/admin/login");
  });

  test("admin login page loads with email and password fields", async ({ page }) => {
    await page.goto("/admin/login");
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });
});
