/**
 * InsurePortal Load Testing — K6 Smoke Test
 *
 * Usage:
 *   k6 run tests/load/k6-smoke.js
 *   k6 run --env BASE_URL=https://staging.insureportal.ng tests/load/k6-smoke.js
 *
 * Scenarios:
 *   smoke   — 1 VU for 30s (verify system works)
 *   load    — ramp to 50 VUs over 5 min
 *   stress  — ramp to 200 VUs over 10 min
 */
import http from "k6/http";
import { check, sleep, group } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

// ── Custom metrics ──────────────────────────────────────────────────────────
const errorRate = new Rate("errors");
const healthCheckDuration = new Trend("health_check_duration", true);
const apiLatency = new Trend("api_latency", true);
const requestCount = new Counter("total_requests");

// ── Configuration ───────────────────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || "http://localhost:5002";

export const options = {
  scenarios: {
    smoke: {
      executor: "constant-vus",
      vus: 1,
      duration: "30s",
      tags: { scenario: "smoke" },
    },
    load: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m", target: 10 },
        { duration: "3m", target: 50 },
        { duration: "1m", target: 0 },
      ],
      startTime: "35s",
      tags: { scenario: "load" },
    },
    stress: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "2m", target: 50 },
        { duration: "5m", target: 200 },
        { duration: "2m", target: 200 },
        { duration: "1m", target: 0 },
      ],
      startTime: "5m40s",
      tags: { scenario: "stress" },
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<2000", "p(99)<5000"],
    errors: ["rate<0.05"],
    health_check_duration: ["p(95)<500"],
    api_latency: ["p(95)<3000"],
  },
};

// ── Test functions ──────────────────────────────────────────────────────────

export default function () {
  group("Health Check", () => {
    const res = http.get(`${BASE_URL}/api/health`);
    healthCheckDuration.add(res.timings.duration);
    requestCount.add(1);
    const passed = check(res, {
      "health status is 200": (r) => r.status === 200,
      "health response time < 500ms": (r) => r.timings.duration < 500,
    });
    errorRate.add(!passed);
  });

  group("API Endpoints", () => {
    // List policies (public query)
    const policiesRes = http.get(`${BASE_URL}/api/trpc/policy.list`, {
      headers: { "Content-Type": "application/json" },
    });
    apiLatency.add(policiesRes.timings.duration);
    requestCount.add(1);
    check(policiesRes, {
      "policies endpoint responds": (r) => [200, 401].includes(r.status),
    });

    // List claims
    const claimsRes = http.get(`${BASE_URL}/api/trpc/claims.list`, {
      headers: { "Content-Type": "application/json" },
    });
    apiLatency.add(claimsRes.timings.duration);
    requestCount.add(1);
    check(claimsRes, {
      "claims endpoint responds": (r) => [200, 401].includes(r.status),
    });

    // Fraud rules
    const fraudRes = http.get(`${BASE_URL}/api/trpc/fraud.getRules`, {
      headers: { "Content-Type": "application/json" },
    });
    apiLatency.add(fraudRes.timings.duration);
    requestCount.add(1);
    check(fraudRes, {
      "fraud endpoint responds": (r) => [200, 401].includes(r.status),
    });
  });

  group("Static Assets", () => {
    const indexRes = http.get(`${BASE_URL}/`);
    requestCount.add(1);
    check(indexRes, {
      "homepage loads": (r) => r.status === 200,
      "homepage has content": (r) => r.body && r.body.length > 100,
    });
  });

  sleep(1);
}

// ── Summary ─────────────────────────────────────────────────────────────────
export function handleSummary(data) {
  return {
    "test-results/load-test-summary.json": JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: " ", enableColors: true }),
  };
}

function textSummary(data, opts) {
  const metrics = data.metrics;
  const lines = [
    "InsurePortal Load Test Results",
    "=".repeat(40),
    `Total Requests: ${metrics.total_requests?.values?.count || 0}`,
    `Error Rate: ${((metrics.errors?.values?.rate || 0) * 100).toFixed(2)}%`,
    `Health Check p95: ${(metrics.health_check_duration?.values?.["p(95)"] || 0).toFixed(0)}ms`,
    `API Latency p95: ${(metrics.api_latency?.values?.["p(95)"] || 0).toFixed(0)}ms`,
    `HTTP Duration p95: ${(metrics.http_req_duration?.values?.["p(95)"] || 0).toFixed(0)}ms`,
  ];
  return lines.join("\n") + "\n";
}
