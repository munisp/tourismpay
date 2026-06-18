/**
 * Integration tests for health, metrics, and readiness endpoints.
 * Tests the production monitoring stack.
 */
import { describe, it, expect, beforeAll } from "vitest";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";

async function fetchJson(path: string) {
  const res = await fetch(`${BASE_URL}${path}`);
  return { status: res.status, body: await res.json(), headers: res.headers };
}

describe("Health & Monitoring Endpoints", () => {
  it("GET /health returns service status with dependency checks", async () => {
    const { status, body } = await fetchJson("/health");
    expect(status).toBe(200);
    expect(body.status).toMatch(/healthy|degraded/);
    expect(body.checks).toBeDefined();
    expect(body.checks.postgresql).toBeDefined();
    expect(body.checks.postgresql.status).toBe("connected");
    expect(body.timestamp).toBeDefined();
    expect(body.uptime).toBeGreaterThan(0);
  });

  it("GET /health/deep returns cascading health checks", async () => {
    const { status, body } = await fetchJson("/health/deep");
    expect([200, 503]).toContain(status);
    expect(body.checks).toBeDefined();
    expect(body.checks.postgresql).toBeDefined();
    expect(body.checks.redis).toBeDefined();
    expect(body.checks.kafka).toBeDefined();
    expect(body.checks.mojaloop).toBeDefined();
    expect(body.checks.keycloak).toBeDefined();
  });

  it("GET /livez returns liveness probe", async () => {
    const { status, body } = await fetchJson("/livez");
    expect(status).toBe(200);
    expect(body.status).toBe("alive");
    expect(body.pid).toBeGreaterThan(0);
  });

  it("GET /readyz returns readiness probe", async () => {
    const { status, body } = await fetchJson("/readyz");
    expect(status).toBe(200);
    expect(body.status).toBe("ready");
  });

  it("GET /metrics returns Prometheus format", async () => {
    const res = await fetch(`${BASE_URL}/metrics`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    const text = await res.text();
    expect(text).toContain("tourismpay_http_request_duration_seconds");
    expect(text).toContain("tourismpay_http_requests_total");
    expect(text).toContain("tourismpay_active_connections");
    expect(text).toContain("# HELP");
    expect(text).toContain("# TYPE");
  });
});

describe("Rate Limiting", () => {
  it("returns X-RateLimit headers on API requests", async () => {
    const res = await fetch(`${BASE_URL}/api/trpc/wallet.getBalances?input=%7B%22json%22%3Anull%7D`);
    expect(res.headers.get("x-ratelimit-limit")).toBeDefined();
    expect(res.headers.get("x-ratelimit-remaining")).toBeDefined();
  });
});

describe("Security Headers", () => {
  it("returns X-Request-ID on all responses", async () => {
    const res = await fetch(`${BASE_URL}/health`);
    expect(res.headers.get("x-request-id")).toBeDefined();
    expect(res.headers.get("x-request-id")!.length).toBeGreaterThan(0);
  });

  it("returns security headers (helmet)", async () => {
    const res = await fetch(`${BASE_URL}/health`);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  });
});
