import { test, expect } from "@playwright/test";

test.describe("Booking flow", () => {
  test("loads booking page with plan from URL", async ({ page }) => {
    await page.goto("/book?plan=signature");

    // Should show the booking wizard
    await expect(page.locator("text=Select a Date")).toBeVisible({ timeout: 10_000 });
  });

  test("booking page shows calendar step by default", async ({ page }) => {
    await page.goto("/book?plan=essential");

    // Calendar should be visible with date selection UI
    await expect(page.locator("text=Select a Date")).toBeVisible({ timeout: 10_000 });
  });

  test("booking page shows plan name", async ({ page }) => {
    await page.goto("/book?plan=elite");

    // The plan should be reflected somewhere in the UI
    const body = await page.textContent("body");
    expect(body?.toLowerCase()).toContain("elite");
  });

  test("booking page accessible without plan defaults gracefully", async ({ page }) => {
    await page.goto("/book");
    // Should still load without crashing
    await expect(page.locator("body")).toBeVisible();
  });
});
