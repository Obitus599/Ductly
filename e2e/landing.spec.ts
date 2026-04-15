import { test, expect } from "@playwright/test";

test.describe("Landing page", () => {
  test("loads and displays hero section", async ({ page }) => {
    await page.goto("/");
    // Check page title / heading
    await expect(page.locator("h1")).toBeVisible();
    // Check CTA button exists
    await expect(page.locator('a[href="#pricing"]').first()).toBeVisible();
  });

  test("navigation links work", async ({ page }) => {
    await page.goto("/");

    // Pricing section anchor scrolls into view
    await page.click('a[href="#pricing"]');
    await expect(page.locator("#pricing")).toBeInViewport();

    // FAQ section
    await page.click('a[href="#faq"]');
    await expect(page.locator("#faq")).toBeInViewport();

    // Contact section
    await page.click('a[href="#contact"]');
    await expect(page.locator("#contact")).toBeInViewport();
  });

  test("footer links to privacy and terms pages", async ({ page }) => {
    await page.goto("/");

    // Scroll to footer
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);

    // Privacy link exists
    const privacyLink = page.locator('a[href="/privacy"]');
    await expect(privacyLink).toBeVisible();

    // Terms link exists
    const termsLink = page.locator('a[href="/terms"]');
    await expect(termsLink).toBeVisible();
  });

  test("pricing cards link to booking page with plan param", async ({ page }) => {
    await page.goto("/");
    await page.locator("#pricing").scrollIntoViewIfNeeded();

    // Find a "Choose Plan" button/link that goes to /book?plan=...
    const bookLinks = page.locator('a[href^="/book?plan="]');
    const count = await bookLinks.count();
    expect(count).toBeGreaterThanOrEqual(3); // essential, signature, elite
  });
});
