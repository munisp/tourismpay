// TourismPay — k6 Load Testing
// Usage: k6 run k6/load-test.js
// Env:   K6_BASE_URL (default: http://localhost:3000)

import http from "k6/http";
import { check, sleep, group } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.K6_BASE_URL || "http://localhost:3000";

// Custom metrics
const errorRate = new Rate("errors");
const walletLatency = new Trend("wallet_latency", true);
const healthLatency = new Trend("health_latency", true);

export const options = {
  stages: [
    { duration: "30s", target: 10 },   // Warm up
    { duration: "1m", target: 50 },    // Ramp to 50 VUs
    { duration: "2m", target: 100 },   // Sustain 100 VUs
    { duration: "1m", target: 50 },    // Ramp down
    { duration: "30s", target: 0 },    // Cool down
  ],
  thresholds: {
    http_req_duration: ["p(95)<2000"],  // P95 < 2 seconds
    http_req_failed: ["rate<0.05"],     // Error rate < 5%
    errors: ["rate<0.1"],              // Custom error rate < 10%
    wallet_latency: ["p(95)<1500"],    // Wallet P95 < 1.5s
    health_latency: ["p(95)<500"],     // Health P95 < 500ms
  },
};

// Get session cookie once per VU
let sessionCookie = "";

export function setup() {
  const loginRes = http.get(`${BASE_URL}/api/dev/session-token?redirect=/`, {
    redirects: 0,
  });
  const setCookie = loginRes.headers["Set-Cookie"] || "";
  const cookie = setCookie.split(";")[0] || "";
  return { cookie };
}

export default function (data) {
  const params = {
    headers: {
      Cookie: data.cookie,
    },
    tags: {},
  };

  group("Health Endpoints", () => {
    // Liveness probe
    const livez = http.get(`${BASE_URL}/livez`);
    check(livez, {
      "livez is 200": (r) => r.status === 200,
      "livez has alive status": (r) => {
        try { return JSON.parse(r.body).status === "alive"; } catch { return false; }
      },
    }) || errorRate.add(1);
    healthLatency.add(livez.timings.duration);

    // Readiness probe
    const readyz = http.get(`${BASE_URL}/readyz`);
    check(readyz, {
      "readyz is 200": (r) => r.status === 200,
    }) || errorRate.add(1);
    healthLatency.add(readyz.timings.duration);
  });

  group("Wallet Operations", () => {
    // Get balances
    const balances = http.get(
      `${BASE_URL}/api/trpc/wallet.balances?input=%7B%22json%22%3Anull%7D`,
      params
    );
    check(balances, {
      "wallet.balances is 200": (r) => r.status === 200,
      "wallet has result": (r) => {
        try { return JSON.parse(r.body).result !== undefined; } catch { return false; }
      },
    }) || errorRate.add(1);
    walletLatency.add(balances.timings.duration);

    // Get FX rate
    const fxInput = encodeURIComponent(
      JSON.stringify({ json: { fromCurrency: "USDC", toCurrency: "NGN", amount: 100 } })
    );
    const fxRate = http.get(
      `${BASE_URL}/api/trpc/wallet.getFxRate?input=${fxInput}`,
      params
    );
    check(fxRate, {
      "FX rate returns data": (r) => r.status === 200,
    }) || errorRate.add(1);
    walletLatency.add(fxRate.timings.duration);
  });

  group("Metrics Endpoint", () => {
    const metrics = http.get(`${BASE_URL}/metrics`);
    check(metrics, {
      "metrics is 200": (r) => r.status === 200,
      "metrics has prometheus format": (r) => r.body.includes("# TYPE"),
    }) || errorRate.add(1);
  });

  group("Deep Health Check", () => {
    const deep = http.get(`${BASE_URL}/health/deep`);
    check(deep, {
      "deep health responds": (r) => r.status === 200 || r.status === 503,
      "deep health has checks": (r) => {
        try { return JSON.parse(r.body).checks !== undefined; } catch { return false; }
      },
    }) || errorRate.add(1);
    healthLatency.add(deep.timings.duration);
  });

  sleep(0.5 + Math.random() * 1.5);
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: " ", enableColors: true }),
    "k6/results.json": JSON.stringify(data, null, 2),
  };
}

function textSummary(data, opts) {
  const metrics = data.metrics;
  const lines = [
    "TourismPay Load Test Results",
    "============================",
    "",
    `Total Requests: ${metrics.http_reqs?.values?.count || 0}`,
    `Failed Requests: ${metrics.http_req_failed?.values?.passes || 0}`,
    `P95 Latency: ${(metrics.http_req_duration?.values?.["p(95)"] || 0).toFixed(1)}ms`,
    `P99 Latency: ${(metrics.http_req_duration?.values?.["p(99)"] || 0).toFixed(1)}ms`,
    `Error Rate: ${((metrics.errors?.values?.rate || 0) * 100).toFixed(2)}%`,
    "",
    `Wallet P95: ${(metrics.wallet_latency?.values?.["p(95)"] || 0).toFixed(1)}ms`,
    `Health P95: ${(metrics.health_latency?.values?.["p(95)"] || 0).toFixed(1)}ms`,
    "",
  ];
  return lines.join("\n");
}
