/**
 * Integration tests for authentication and authorization.
 * Tests Keycloak OIDC + Permify ReBAC integration.
 */
import { describe, it, expect } from "vitest";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";

describe("Authentication", () => {
  it("dev session-token endpoint creates valid session", async () => {
    const res = await fetch(`${BASE_URL}/api/dev/session-token?redirect=/`, { redirect: "manual" });
    expect(res.status).toBe(302);
    const cookie = res.headers.get("set-cookie");
    expect(cookie).toContain("app_session_id=");
  });

  it("protected endpoints reject unauthenticated requests", async () => {
    const endpoints = [
      "/api/trpc/wallet.balances?input=%7B%22json%22%3Anull%7D",
      "/api/trpc/bis.stats?input=%7B%22json%22%3Anull%7D",
      "/api/trpc/kyb.stats?input=%7B%22json%22%3Anull%7D",
    ];
    for (const endpoint of endpoints) {
      const res = await fetch(`${BASE_URL}${endpoint}`);
      expect(res.status).toBe(401);
    }
  });

  it("public endpoints are accessible without auth", async () => {
    const endpoints = ["/health", "/livez", "/readyz", "/metrics"];
    for (const endpoint of endpoints) {
      const res = await fetch(`${BASE_URL}${endpoint}`);
      expect(res.status).toBe(200);
    }
  });

  it("Keycloak OIDC config is detectable", async () => {
    // The app should expose whether Keycloak is enabled via health check
    const res = await fetch(`${BASE_URL}/health`);
    const body = await res.json() as { checks: { keycloak: { status: string } } };
    expect(body.checks.keycloak).toBeDefined();
    expect(["configured", "dev_mode"]).toContain(body.checks.keycloak.status);
  });
});

describe("Authorization (Role-Based)", () => {
  let sessionCookie = "";

  it("admin user can access all endpoints", async () => {
    const res = await fetch(`${BASE_URL}/api/dev/session-token?redirect=/`, { redirect: "manual" });
    sessionCookie = (res.headers.get("set-cookie") || "").split(";")[0];

    // Admin should be able to access wallet
    const walletRes = await fetch(`${BASE_URL}/api/trpc/wallet.balances?input=%7B%22json%22%3Anull%7D`, {
      headers: { cookie: sessionCookie },
    });
    expect(walletRes.status).toBe(200);
  });
});
