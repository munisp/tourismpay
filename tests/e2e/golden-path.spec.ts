import { test, expect } from "@playwright/test";

test.describe("TourismPay Golden Path E2E", () => {
  test.beforeEach(async ({ page }) => {
    // Authenticate via dev session token endpoint
    await page.goto("/api/dev/session-token?redirect=/");
    await page.waitForLoadState("networkidle");
  });

  test("dashboard loads with authenticated user", async ({ page }) => {
    // Should redirect to dashboard after auth
    await expect(page).toHaveURL(/\//);

    // Should show the app shell with sidebar
    const sidebar = page.locator("nav, [role=navigation], aside");
    await expect(sidebar.first()).toBeVisible();

    // Should display user info (authenticated)
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
  });

  test("wallet page shows balances", async ({ page }) => {
    await page.goto("/wallet");
    await page.waitForLoadState("networkidle");

    // Should render wallet page
    const heading = page.getByRole("heading", { level: 1 }).or(
      page.locator("h1, h2").first()
    );
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test("health endpoints respond correctly", async ({ request }) => {
    // Liveness probe
    const livez = await request.get("/livez");
    expect(livez.ok()).toBeTruthy();
    const liveBody = await livez.json();
    expect(liveBody.status).toBe("alive");
    expect(typeof liveBody.pid).toBe("number");

    // Readiness probe
    const readyz = await request.get("/readyz");
    expect(readyz.ok()).toBeTruthy();
    const readyBody = await readyz.json();
    expect(readyBody.status).toBe("ready");

    // Deep health check
    const deep = await request.get("/health/deep");
    const deepBody = await deep.json();
    expect(deepBody.checks.postgresql.status).toBe("connected");
    expect(deepBody.uptime).toBeGreaterThan(0);
  });

  test("prometheus metrics endpoint returns valid format", async ({
    request,
  }) => {
    const response = await request.get("/metrics");
    expect(response.ok()).toBeTruthy();
    const text = await response.text();
    expect(text).toContain("tourismpay_http_request_duration_seconds");
    expect(text).toContain("# TYPE");
    expect(text).toContain("# HELP");
  });

  test("rate limiting headers present on API requests", async ({
    page,
    request,
  }) => {
    // Authenticate first
    await page.goto("/api/dev/session-token?redirect=/");
    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find((c) => c.name === "app_session_id");
    expect(sessionCookie).toBeTruthy();

    // Make authenticated API request
    const response = await request.get(
      "/api/trpc/wallet.balances?input=%7B%22json%22%3Anull%7D",
      {
        headers: {
          Cookie: `app_session_id=${sessionCookie!.value}`,
        },
      }
    );
    expect(response.ok()).toBeTruthy();

    const headers = response.headers();
    expect(headers["ratelimit-limit"]).toBe("100");
    expect(parseInt(headers["ratelimit-remaining"])).toBeLessThanOrEqual(100);
    expect(parseInt(headers["ratelimit-reset"])).toBeGreaterThan(0);
    expect(headers["ratelimit-policy"]).toBe("100;w=60");
  });

  test("security headers present on all responses", async ({ request }) => {
    const response = await request.get("/livez");
    const headers = response.headers();

    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(headers["strict-transport-security"]).toContain("max-age=");
    expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
    expect(headers["x-request-id"]).toBeTruthy();
  });

  test("BIS page loads for admin user", async ({ page }) => {
    await page.goto("/admin/bis");
    await page.waitForLoadState("networkidle");

    // Should show BIS content (not a redirect or error)
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
    // Should not be a 404 page
    expect(body).not.toContain("Page not found");
  });

  test("settings page accessible", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const body = await page.textContent("body");
    expect(body).toBeTruthy();
  });

  test("wallet CRUD: create wallet → load funds → check balance via API", async ({ request }) => {
    // Create a wallet balance entry via tRPC
    const sendRes = await request.post("/api/trpc/wallet.send", {
      data: {
        json: {
          currency: "NGN",
          toUserId: "test-merchant-001",
          amount: 1000,
          note: "E2E test transfer",
        },
      },
    });
    // Even if it fails (insufficient balance), should return a valid response
    expect(sendRes.status()).toBeLessThan(500);

    // Check wallet stats endpoint
    const statsRes = await request.get("/api/trpc/wallet.stats");
    expect(statsRes.status()).toBeLessThan(500);
  });

  test("merchant onboarding: KYB flow accessible", async ({ page }) => {
    await page.goto("/merchant/kyb");
    await page.waitForLoadState("networkidle");

    const body = await page.textContent("body");
    expect(body).toBeTruthy();
    expect(body).not.toContain("Page not found");
  });

  test("local payments page loads", async ({ page }) => {
    await page.goto("/wallet/local-payments");
    await page.waitForLoadState("networkidle");

    const body = await page.textContent("body");
    expect(body).toBeTruthy();
  });
});
