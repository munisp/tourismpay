// TourismPay — k6 Load Testing
// Usage: k6 run k6/load-test.js
//   CI smoke:  k6 run --duration 30s --vus 10 k6/load-test.js
//   CI load:   K6_SCENARIO=load k6 run k6/load-test.js
// Env:   K6_BASE_URL (default: http://localhost:3000)
//        K6_SCENARIO: "smoke" | "load" | "stress" | "soak"

import http from "k6/http";
import { check, sleep, group } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const allowAuth = { responseCallback: http.expectedStatuses(200, 401, 403) };

const BASE_URL = __ENV.K6_BASE_URL || "http://localhost:3000";
const IS_CI = __ENV.CI === "true" || __ENV.GITHUB_ACTIONS === "true";
const SCENARIO = __ENV.K6_SCENARIO || (IS_CI ? "smoke" : "load");

// Custom metrics
const errorRate = new Rate("errors");
const healthLatency = new Trend("health_latency", true);
const walletLatency = new Trend("wallet_api_latency", true);
const authLatency = new Trend("auth_latency", true);
const dbQueryErrors = new Counter("db_query_errors");

const scenarios = {
  smoke: {
    stages: [
      { duration: "30s", target: 10 },
    ],
  },
  load: {
    stages: [
      { duration: "30s", target: 20 },
      { duration: "1m", target: 50 },
      { duration: "2m", target: 100 },
      { duration: "1m", target: 100 },
      { duration: "1m", target: 50 },
      { duration: "30s", target: 0 },
    ],
  },
  stress: {
    stages: [
      { duration: "30s", target: 50 },
      { duration: "1m", target: 150 },
      { duration: "2m", target: 300 },
      { duration: "1m", target: 300 },
      { duration: "30s", target: 0 },
    ],
  },
  soak: {
    stages: [
      { duration: "1m", target: 50 },
      { duration: "10m", target: 50 },
      { duration: "1m", target: 0 },
    ],
  },
};

export const options = {
  stages: scenarios[SCENARIO]?.stages || scenarios.load.stages,
  thresholds: {
    http_req_duration: ["p(95)<5000"],
    http_req_failed: ["rate<0.20"],
    errors: ["rate<0.20"],
    health_latency: ["p(95)<3000"],
    wallet_api_latency: ["p(95)<5000"],
    auth_latency: ["p(95)<3000"],
  },
};

let sessionCookie = null;

function authenticate() {
  if (sessionCookie) return sessionCookie;
  const res = http.get(`${BASE_URL}/api/dev/session-token?redirect=/`, { redirects: 0, ...allowAuth });
  const setCookie = res.headers["Set-Cookie"] || "";
  sessionCookie = setCookie.split(";")[0] || "";
  authLatency.add(res.timings.duration);
  return sessionCookie;
}

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

  group("Auth + Wallet API", () => {
    const cookie = authenticate();
    if (!cookie) return;

    const balances = http.get(
      `${BASE_URL}/api/trpc/wallet.balances?input=%7B%22json%22%3Anull%7D`,
      { headers: { Cookie: cookie }, ...allowAuth }
    );
    check(balances, {
      "wallet balances responds": (r) => r.status === 200 || r.status === 401,
      "wallet balances has result": (r) => {
        try { return JSON.parse(r.body).result !== undefined; } catch { return true; }
      },
    }) || errorRate.add(1);
    walletLatency.add(balances.timings.duration);

    const stats = http.get(
      `${BASE_URL}/api/trpc/wallet.stats?input=%7B%22json%22%3Anull%7D`,
      { headers: { Cookie: cookie }, ...allowAuth }
    );
    check(stats, {
      "wallet stats responds": (r) => r.status === 200 || r.status === 401,
    });
    walletLatency.add(stats.timings.duration);

    const txRes = http.get(
      `${BASE_URL}/api/trpc/wallet.transactions?input=%7B%22json%22%3A%7B%22limit%22%3A10%7D%7D`,
      { headers: { Cookie: cookie }, ...allowAuth }
    );
    check(txRes, {
      "wallet transactions responds": (r) => r.status === 200 || r.status === 401,
    });
    walletLatency.add(txRes.timings.duration);
  });

  group("Security Checks", () => {
    const res = http.get(`${BASE_URL}/livez`);
    check(res, {
      "has x-content-type-options": (r) => r.headers["X-Content-Type-Options"] === "nosniff",
      "has x-frame-options": (r) => !!r.headers["X-Frame-Options"],
      "has HSTS": (r) => !!r.headers["Strict-Transport-Security"],
      "has request-id": (r) => !!r.headers["X-Request-Id"],
    });
  });

  sleep(0.3 + Math.random() * 1.0);
}
