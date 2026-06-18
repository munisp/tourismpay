// TourismPay — k6 Load Testing
// Usage: k6 run k6/load-test.js
//   CI:  k6 run --duration 30s --vus 10 k6/load-test.js
// Env:   K6_BASE_URL (default: http://localhost:3000)

import http from "k6/http";
import { check, sleep, group } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.K6_BASE_URL || "http://localhost:3000";
const IS_CI = __ENV.CI === "true" || __ENV.GITHUB_ACTIONS === "true";

// Custom metrics
const errorRate = new Rate("errors");
const healthLatency = new Trend("health_latency", true);

export const options = {
  // Stages are overridden when --duration/--vus CLI args are provided (CI smoke)
  stages: [
    { duration: "30s", target: 10 },
    { duration: "1m", target: 50 },
    { duration: "2m", target: 100 },
    { duration: "1m", target: 50 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p(95)<5000"],  // P95 < 5 seconds (generous for CI)
    http_req_failed: ["rate<0.20"],     // < 20% errors (auth routes may 401)
    errors: ["rate<0.20"],
    health_latency: ["p(95)<3000"],     // Health P95 < 3s (CI runners are slow)
  },
};

export default function () {
  group("Health Endpoints", () => {
    const livez = http.get(`${BASE_URL}/livez`);
    check(livez, {
      "livez is 200": (r) => r.status === 200,
      "livez has alive status": (r) => {
        try { return JSON.parse(r.body).status === "alive"; } catch { return false; }
      },
    }) || errorRate.add(1);
    healthLatency.add(livez.timings.duration);

    const readyz = http.get(`${BASE_URL}/readyz`);
    check(readyz, {
      "readyz is 200": (r) => r.status === 200,
    }) || errorRate.add(1);
    healthLatency.add(readyz.timings.duration);
  });

  group("Public Endpoints", () => {
    const metrics = http.get(`${BASE_URL}/metrics`);
    check(metrics, {
      "metrics is 200": (r) => r.status === 200,
      "metrics has prometheus format": (r) =>
        typeof r.body === "string" && r.body.includes("# TYPE"),
    }) || errorRate.add(1);

    const deep = http.get(`${BASE_URL}/health/deep`);
    check(deep, {
      "deep health responds": (r) => r.status === 200 || r.status === 503,
      "deep health has checks": (r) => {
        try { return JSON.parse(r.body).checks !== undefined; } catch { return false; }
      },
    }) || errorRate.add(1);
    healthLatency.add(deep.timings.duration);
  });

  group("Auth Flow", () => {
    // Attempt session token (only works in NODE_ENV=development)
    const loginRes = http.get(
      `${BASE_URL}/api/dev/session-token?redirect=/`,
      { redirects: 0 }
    );
    const setCookie = loginRes.headers["Set-Cookie"] || "";
    const cookie = setCookie.split(";")[0] || "";

    if (cookie) {
      const balances = http.get(
        `${BASE_URL}/api/trpc/wallet.balances?input=%7B%22json%22%3Anull%7D`,
        { headers: { Cookie: cookie } }
      );
      check(balances, {
        "wallet returns 200 or 401": (r) => r.status === 200 || r.status === 401,
      });
    }
  });

  sleep(0.5 + Math.random() * 1.5);
}
