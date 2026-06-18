/**
 * k6 Load Test — Africa GDS
 * Tests API performance under realistic production load.
 *
 * Usage:
 *   k6 run --vus 50 --duration 5m k6/load-test.js
 *   k6 run --vus 200 --duration 15m k6/load-test.js  # stress test
 */
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.GDS_URL || 'http://localhost:8090';
const API = `${BASE_URL}/api/v1/gds`;

// Custom metrics
const errorRate = new Rate('gds_errors');
const searchLatency = new Trend('gds_search_latency', true);
const bookingLatency = new Trend('gds_booking_latency', true);
const splitLatency = new Trend('gds_split_latency', true);

export const options = {
  stages: [
    { duration: '1m', target: 10 },   // warm up
    { duration: '3m', target: 50 },   // normal load
    { duration: '2m', target: 100 },  // peak load
    { duration: '2m', target: 200 },  // stress
    { duration: '1m', target: 50 },   // recovery
    { duration: '1m', target: 0 },    // cool down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000', 'p(99)<5000'],
    gds_errors: ['rate<0.05'],
    gds_search_latency: ['p(95)<1000'],
    gds_booking_latency: ['p(95)<2000'],
    gds_split_latency: ['p(95)<500'],
  },
};

const COUNTRIES = ['KE', 'NG', 'ZA', 'TZ', 'UG', 'GH', 'RW', 'ET', 'MZ', 'MA'];
const TIERS = ['bronze', 'silver', 'gold', 'platinum'];
const PROMO_CODES = ['WELCOME15', 'SAFARI20', 'STAY5PAY4', 'CORP10', 'GOLD50'];

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default function () {
  const headers = {
    'Content-Type': 'application/json',
    'X-API-Key': 'dev-mode',
  };

  // --- Search (40% of traffic) ---
  group('Search', () => {
    const start = Date.now();
    const res = http.get(`${API}/search`, { headers });
    searchLatency.add(Date.now() - start);
    const ok = check(res, {
      'search returns 200': (r) => r.status === 200,
    });
    errorRate.add(!ok);
  });

  sleep(0.5);

  // --- PNR List (20% of traffic) ---
  group('PNR List', () => {
    const res = http.get(`${API}/pnr`, { headers });
    check(res, {
      'pnr list returns 200': (r) => r.status === 200,
    });
  });

  sleep(0.3);

  // --- Commission Split (15% of traffic) ---
  group('Commission Split', () => {
    const start = Date.now();
    const payload = JSON.stringify({
      gross_amount: Math.floor(Math.random() * 5000) + 100,
      country_code: randomChoice(COUNTRIES),
      agent_tier: randomChoice(TIERS),
      property_tier: 'full',
    });
    const res = http.post(`${API}/commission/split`, payload, { headers });
    splitLatency.add(Date.now() - start);
    const ok = check(res, {
      'split returns 200': (r) => r.status === 200,
    });
    errorRate.add(!ok);
  });

  sleep(0.3);

  // --- Discount Validation (10% of traffic) ---
  group('Discount Validation', () => {
    const code = randomChoice(PROMO_CODES);
    const amount = Math.floor(Math.random() * 2000) + 50;
    const res = http.get(`${API}/discount/validate?code=${code}&amount=${amount}`, { headers });
    check(res, {
      'discount validate returns 200': (r) => r.status === 200,
    });
  });

  sleep(0.3);

  // --- Cancellation Simulate (10% of traffic) ---
  group('Cancellation Simulate', () => {
    const payload = JSON.stringify({
      booking_amount: Math.floor(Math.random() * 3000) + 200,
      policy_type: randomChoice(['flexible', 'moderate', 'strict', 'super_strict']),
      days_before_checkin: Math.floor(Math.random() * 60),
    });
    const res = http.post(`${API}/cancellation/simulate`, payload, { headers });
    check(res, {
      'cancellation sim returns 200': (r) => r.status === 200,
    });
  });

  sleep(0.3);

  // --- Health Deep (5% of traffic) ---
  if (Math.random() < 0.05) {
    group('Health Deep', () => {
      const res = http.get(`${BASE_URL}/health/deep`);
      check(res, {
        'deep health returns': (r) => [200, 503].includes(r.status),
      });
    });
  }

  sleep(Math.random() * 1 + 0.5);
}

export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: '  ', enableColors: true }),
    'k6/load-test-results.json': JSON.stringify(data, null, 2),
  };
}

function textSummary(data, opts) {
  const lines = [];
  lines.push('\n=== GDS Load Test Results ===\n');
  const m = data.metrics;
  if (m.http_req_duration) {
    lines.push(`HTTP Duration P50: ${m.http_req_duration.values['p(50)']?.toFixed(1)}ms`);
    lines.push(`HTTP Duration P95: ${m.http_req_duration.values['p(95)']?.toFixed(1)}ms`);
    lines.push(`HTTP Duration P99: ${m.http_req_duration.values['p(99)']?.toFixed(1)}ms`);
  }
  if (m.http_reqs) {
    lines.push(`Total Requests: ${m.http_reqs.values.count}`);
    lines.push(`Requests/sec: ${m.http_reqs.values.rate?.toFixed(1)}`);
  }
  if (m.gds_errors) {
    lines.push(`Error Rate: ${(m.gds_errors.values.rate * 100).toFixed(2)}%`);
  }
  return lines.join('\n') + '\n';
}
