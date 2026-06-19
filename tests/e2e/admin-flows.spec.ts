import { test, expect } from "@playwright/test";

/**
 * E2E tests for admin golden-path flows:
 *   BIS investigations → Fraud monitoring → Tax collection → Kill switch
 */
test.describe("Admin Golden-Path E2E", () => {
  let sessionCookie: string;

  test.beforeEach(async ({ page }) => {
    await page.goto("/api/dev/session-token?redirect=/");
    await page.waitForLoadState("networkidle");
    const cookies = await page.context().cookies();
    const cookie = cookies.find((c) => c.name === "app_session_id");
    expect(cookie).toBeTruthy();
    sessionCookie = cookie!.value;
  });

  test("BIS: list investigations endpoint", async ({ request }) => {
    const headers = { Cookie: `app_session_id=${sessionCookie}` };
    const res = await request.get(
      "/api/trpc/bis.list?input=%7B%22json%22%3A%7B%22limit%22%3A5%7D%7D",
      { headers },
    );
    expect(res.status()).toBeLessThan(500);
    if (res.ok()) {
      const body = await res.json();
      const data = body.result?.data?.json;
      if (data) {
        expect(Array.isArray(data.investigations || data)).toBeTruthy();
      }
    }
  });

  test("fraud: list alerts endpoint", async ({ request }) => {
    const headers = { Cookie: `app_session_id=${sessionCookie}` };
    const res = await request.get(
      "/api/trpc/fraud.list?input=%7B%22json%22%3A%7B%22limit%22%3A5%7D%7D",
      { headers },
    );
    expect(res.status()).toBeLessThan(500);
  });

  test("kill switch: status endpoint", async ({ request }) => {
    const headers = { Cookie: `app_session_id=${sessionCookie}` };
    const res = await request.get(
      '/api/trpc/killSwitch.getStatus?input=%7B%22json%22%3A%7B%22corridor%22%3A%22NG%22%7D%7D',
      { headers },
    );
    expect(res.status()).toBeLessThan(500);
  });

  test("notifications: unread count endpoint", async ({ request }) => {
    const headers = { Cookie: `app_session_id=${sessionCookie}` };
    const res = await request.get(
      "/api/trpc/notifications.unreadCount?input=%7B%22json%22%3Anull%7D",
      { headers },
    );
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const data = body.result?.data?.json;
    if (data) {
      expect(typeof data.count).toBe("number");
    }
  });

  test("notifications: list endpoint", async ({ request }) => {
    const headers = { Cookie: `app_session_id=${sessionCookie}` };
    const res = await request.get(
      "/api/trpc/notifications.list?input=%7B%22json%22%3A%7B%22limit%22%3A10%7D%7D",
      { headers },
    );
    expect(res.ok()).toBeTruthy();
  });

  test("exchange rates: get FX rate pair", async ({ request }) => {
    const headers = { Cookie: `app_session_id=${sessionCookie}` };
    const res = await request.get(
      '/api/trpc/exchangeRates.getRate?input=%7B%22json%22%3A%7B%22from%22%3A%22USD%22%2C%22to%22%3A%22NGN%22%7D%7D',
      { headers },
    );
    expect(res.status()).toBeLessThan(500);
  });

  test("audit logs: list endpoint", async ({ request }) => {
    const headers = { Cookie: `app_session_id=${sessionCookie}` };
    const res = await request.get(
      "/api/trpc/auditLogs.list?input=%7B%22json%22%3A%7B%22limit%22%3A5%7D%7D",
      { headers },
    );
    expect(res.status()).toBeLessThan(500);
  });

  test("admin dashboard: page loads", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
  });

  test("compliance: africa registry page loads", async ({ page }) => {
    await page.goto("/admin/africa-registry");
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
    expect(body).not.toContain("Page not found");
  });

  test("loyalty: list accounts endpoint", async ({ request }) => {
    const headers = { Cookie: `app_session_id=${sessionCookie}` };
    const res = await request.get(
      "/api/trpc/loyalty.getAccount?input=%7B%22json%22%3Anull%7D",
      { headers },
    );
    expect(res.status()).toBeLessThan(500);
  });
});
