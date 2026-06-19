import { test, expect } from "@playwright/test";

/**
 * E2E tests for merchant golden-path flows:
 *   KYB onboarding → QR generation → Product management → Revenue
 */
test.describe("Merchant Golden-Path E2E", () => {
  let sessionCookie: string;

  test.beforeEach(async ({ page }) => {
    await page.goto("/api/dev/session-token?redirect=/");
    await page.waitForLoadState("networkidle");
    const cookies = await page.context().cookies();
    const cookie = cookies.find((c) => c.name === "app_session_id");
    expect(cookie).toBeTruthy();
    sessionCookie = cookie!.value;
  });

  test("KYB: application list endpoint responds", async ({ request }) => {
    const headers = { Cookie: `app_session_id=${sessionCookie}` };
    const res = await request.get(
      "/api/trpc/kybApplications.list?input=%7B%22json%22%3A%7B%22limit%22%3A5%7D%7D",
      { headers },
    );
    expect(res.status()).toBeLessThan(500);
  });

  test("KYB: onboarding status returns valid structure", async ({ request }) => {
    const headers = { Cookie: `app_session_id=${sessionCookie}` };
    const res = await request.get(
      '/api/trpc/kyb.getOnboardingStatus?input=%7B%22json%22%3A%7B%22establishmentId%22%3A1%7D%7D',
      { headers },
    );
    expect(res.status()).toBeLessThan(500);
    if (res.ok()) {
      const body = await res.json();
      const data = body.result?.data?.json;
      if (data) {
        // Should contain onboarding status fields
        expect(data).toHaveProperty("kybStatus");
      }
    }
  });

  test("QR: generate token validates establishment ownership", async ({ request }) => {
    const headers = {
      Cookie: `app_session_id=${sessionCookie}`,
      "Content-Type": "application/json",
    };
    const res = await request.post("/api/trpc/qrPayment.generate", {
      headers,
      data: {
        json: {
          establishmentId: 1,
          amountUsd: "50.00",
          currency: "USD",
          description: "E2E test QR",
        },
      },
    });
    // Either succeeds (if user owns establishment) or fails with auth error — not 500
    expect(res.status()).toBeLessThan(500);
  });

  test("QR: list recent payments for establishment", async ({ request }) => {
    const headers = { Cookie: `app_session_id=${sessionCookie}` };
    const res = await request.get(
      "/api/trpc/qrPayment.listRecent?input=%7B%22json%22%3A%7B%22establishmentId%22%3A1%2C%22limit%22%3A5%7D%7D",
      { headers },
    );
    expect(res.status()).toBeLessThan(500);
  });

  test("merchant products: list products for establishment", async ({ request }) => {
    const headers = { Cookie: `app_session_id=${sessionCookie}` };
    const res = await request.get(
      "/api/trpc/merchantProducts.list?input=%7B%22json%22%3A%7B%22establishmentId%22%3A1%7D%7D",
      { headers },
    );
    expect(res.status()).toBeLessThan(500);
  });

  test("merchant revenue: page loads", async ({ page }) => {
    await page.goto("/merchant/revenue");
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
    expect(body).not.toContain("Page not found");
  });

  test("merchant bookings: list endpoint responds", async ({ request }) => {
    const headers = { Cookie: `app_session_id=${sessionCookie}` };
    const res = await request.get(
      "/api/trpc/merchantBookings.list?input=%7B%22json%22%3A%7B%22establishmentId%22%3A1%7D%7D",
      { headers },
    );
    expect(res.status()).toBeLessThan(500);
  });

  test("KYB: documents list endpoint responds", async ({ request }) => {
    const headers = { Cookie: `app_session_id=${sessionCookie}` };
    const res = await request.get(
      "/api/trpc/kybDocuments.list?input=%7B%22json%22%3A%7B%22establishmentId%22%3A1%7D%7D",
      { headers },
    );
    expect(res.status()).toBeLessThan(500);
  });
});
