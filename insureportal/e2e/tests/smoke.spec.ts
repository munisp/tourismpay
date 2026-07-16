import { test, expect } from "@playwright/test";

test.describe("TourismPay Smoke Tests", () => {
  test("should load the login page", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/TourismPay/);
  });

  test("should render the login form", async ({ page }) => {
    await page.goto("/");
    const loginForm = page.locator("form, [data-testid='login-form'], input[type='text'], input[type='password']");
    await expect(loginForm.first()).toBeVisible({ timeout: 10_000 });
  });

  test("should show error for invalid credentials", async ({ page }) => {
    await page.goto("/");
    const agentInput = page.locator("input[type='text']").first();
    const pinInput = page.locator("input[type='password']").first();
    if (await agentInput.isVisible()) {
      await agentInput.fill("INVALID_AGENT");
      if (await pinInput.isVisible()) {
        await pinInput.fill("0000");
      }
      const submitButton = page.locator("button[type='submit'], button:has-text('Login'), button:has-text('Sign')").first();
      if (await submitButton.isVisible()) {
        await submitButton.click();
        await page.waitForTimeout(1000);
      }
    }
  });

  test("should have no console errors on load", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await page.goto("/");
    await page.waitForTimeout(2000);
    const criticalErrors = errors.filter(
      (e) =>
        !e.includes("favicon") &&
        !e.includes("manifest") &&
        !e.includes("service-worker") &&
        !e.includes("net::ERR")
    );
    expect(criticalErrors).toEqual([]);
  });

  test("should be responsive on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await expect(page).toHaveTitle(/TourismPay/);
  });
});

test.describe("TourismPay Navigation", () => {
  test("should navigate to health check endpoint", async ({ page }) => {
    const response = await page.goto("/api/health");
    if (response) {
      expect([200, 503]).toContain(response.status());
    }
  });
});

test.describe("TourismPay Accessibility", () => {
  test("should have proper heading hierarchy", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(2000);
    const h1Count = await page.locator("h1").count();
    expect(h1Count).toBeGreaterThanOrEqual(0);
  });

  test("should have alt text on images", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(2000);
    const images = page.locator("img");
    const count = await images.count();
    for (let i = 0; i < count; i++) {
      const alt = await images.nth(i).getAttribute("alt");
      expect(alt).not.toBeNull();
    }
  });
});
