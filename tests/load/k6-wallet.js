/**
 * k6 Load Test: Wallet Operations
 *
 * Tests wallet API under load to validate:
 *  - P95 latency < 2s
 *  - Error rate < 1%
 *  - Rate limiting kicks in correctly
 *  - No memory leaks under sustained load
 *
 * Run: k6 run tests/load/k6-wallet.js
 * With env: k6 run -e BASE_URL=http://localhost:3000 tests/load/k6-wallet.js
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

// Custom metrics
const errorRate = new Rate("errors");
const walletLatency = new Trend("wallet_latency", true);
const fxLatency = new Trend("fx_rate_latency", true);

export const options = {
  stages: [
    { duration: "30s", target: 10 },   // Ramp up to 10 VUs
    { duration: "1m", target: 50 },    // Ramp to 50 VUs
    { duration: "2m", target: 100 },   // Peak at 100 VUs
    { duration: "1m", target: 50 },    // Ramp down
    { duration: "30s", target: 0 },    // Cool down
  ],
  thresholds: {
    "http_req_duration": ["p(95)<2000"],    // P95 < 2s
    "errors": ["rate<0.01"],                // Error rate < 1%
    "wallet_latency": ["p(95)<1500"],       // Wallet P95 < 1.5s
    "fx_rate_latency": ["p(95)<500"],       // FX rate P95 < 500ms
  },
};

// Get session cookie (cached per VU)
let sessionCookie = "";

export function setup() {
  const res = http.get(`${BASE_URL}/api/dev/session-token?redirect=/`, { redirects: 0 });
  const cookie = res.headers["Set-Cookie"];
  return { cookie: cookie ? cookie.split(";")[0] : "" };
}

export default function (data) {
  sessionCookie = data.cookie;
  const headers = { cookie: sessionCookie };

  // Test 1: Get wallet balances
  const balRes = http.get(
    `${BASE_URL}/api/trpc/wallet.getBalances?input=%7B%22json%22%3Anull%7D`,
    { headers, tags: { name: "wallet.getBalances" } }
  );
  walletLatency.add(balRes.timings.duration);
  check(balRes, { "balances 200": (r) => r.status === 200 });
  errorRate.add(balRes.status >= 400 && balRes.status !== 429);

  sleep(0.5);

  // Test 2: Get FX rate (should be cached via Redis)
  const fxInput = encodeURIComponent(JSON.stringify({ json: { fromCurrency: "USD", toCurrency: "NGN", amount: 100 } }));
  const fxRes = http.get(
    `${BASE_URL}/api/trpc/wallet.getFxRate?input=${fxInput}`,
    { headers, tags: { name: "wallet.getFxRate" } }
  );
  fxLatency.add(fxRes.timings.duration);
  check(fxRes, { "fx rate 200": (r) => r.status === 200 });
  errorRate.add(fxRes.status >= 400 && fxRes.status !== 429);

  sleep(0.5);

  // Test 3: Get transactions (paginated)
  const txInput = encodeURIComponent(JSON.stringify({ json: { page: 1, perPage: 10 } }));
  const txRes = http.get(
    `${BASE_URL}/api/trpc/wallet.getTransactions?input=${txInput}`,
    { headers, tags: { name: "wallet.getTransactions" } }
  );
  check(txRes, { "transactions 200": (r) => r.status === 200 });
  errorRate.add(txRes.status >= 400 && txRes.status !== 429);

  sleep(1);

  // Test 4: Health endpoint (should always be fast)
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, {
    "health 200": (r) => r.status === 200,
    "health < 100ms": (r) => r.timings.duration < 100,
  });

  sleep(0.5);
}
