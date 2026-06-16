/**
 * Load Testing Configuration (3.7)
 * 
 * k6 load test scenarios for TourismPay platform.
 * Tests: payment processing, merchant QR, FX conversion, search, auth.
 * Target: 10,000 concurrent tourists during peak safari season.
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// ─── Custom Metrics ───────────────────────────────────────────────────────────

const paymentLatency = new Trend('payment_latency');
const fxConversionLatency = new Trend('fx_conversion_latency');
const searchLatency = new Trend('search_latency');
const errorRate = new Rate('error_rate');
const paymentCount = new Counter('payment_count');

// ─── Options ──────────────────────────────────────────────────────────────────

export const options = {
  scenarios: {
    // Smoke test (basic functionality)
    smoke: {
      executor: 'constant-vus',
      vus: 5,
      duration: '1m',
      tags: { scenario: 'smoke' },
    },
    // Load test (normal peak)
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 100 },
        { duration: '5m', target: 500 },
        { duration: '3m', target: 1000 },
        { duration: '2m', target: 0 },
      ],
      startTime: '1m',
      tags: { scenario: 'load' },
    },
    // Stress test (peak safari season)
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5m', target: 5000 },
        { duration: '10m', target: 10000 },
        { duration: '5m', target: 0 },
      ],
      startTime: '13m',
      tags: { scenario: 'stress' },
    },
    // Spike test (flash deal notification)
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 5000 },
        { duration: '30s', target: 5000 },
        { duration: '10s', target: 0 },
      ],
      startTime: '34m',
      tags: { scenario: 'spike' },
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<2000'],
    payment_latency: ['p(95)<1000', 'p(99)<3000'],
    fx_conversion_latency: ['p(95)<300'],
    search_latency: ['p(95)<200'],
    error_rate: ['rate<0.01'],
    http_req_failed: ['rate<0.05'],
  },
};

// ─── Configuration ────────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
const API_KEY = __ENV.API_KEY || 'test-key';

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${API_KEY}`,
};

// ─── Test Scenarios ───────────────────────────────────────────────────────────

export default function () {
  group('Health Check', () => {
    const res = http.get(`${BASE_URL}/health`);
    check(res, { 'health OK': (r) => r.status === 200 });
  });

  group('Tourist Payment Flow', () => {
    // 1. Get FX rate
    const fxStart = Date.now();
    const fxRes = http.get(`${BASE_URL}/api/trpc/exchangeRate.getRate?input=${encodeURIComponent(JSON.stringify({ from: 'USD', to: 'KES' }))}`, { headers });
    fxConversionLatency.add(Date.now() - fxStart);
    check(fxRes, { 'FX rate OK': (r) => r.status === 200 });

    // 2. Process payment
    const payStart = Date.now();
    const payRes = http.post(`${BASE_URL}/api/trpc/qrPayment.processPayment`, JSON.stringify({
      merchantId: `merchant_${Math.floor(Math.random() * 100)}`,
      amount: Math.floor(Math.random() * 10000) + 100,
      currency: 'KES',
    }), { headers });
    paymentLatency.add(Date.now() - payStart);
    paymentCount.add(1);
    
    if (payRes.status !== 200) {
      errorRate.add(1);
    } else {
      errorRate.add(0);
    }
    check(payRes, { 'Payment processed': (r) => r.status === 200 || r.status === 401 });

    sleep(1);
  });

  group('Merchant Dashboard', () => {
    // Get transaction history
    const txRes = http.get(`${BASE_URL}/api/trpc/merchantDashboard.getTransactions?input=${encodeURIComponent(JSON.stringify({ page: 1, limit: 20 }))}`, { headers });
    check(txRes, { 'Transactions loaded': (r) => r.status === 200 || r.status === 401 });

    // Get daily revenue
    const revRes = http.get(`${BASE_URL}/api/trpc/merchantDashboard.getRevenue`, { headers });
    check(revRes, { 'Revenue loaded': (r) => r.status === 200 || r.status === 401 });

    sleep(0.5);
  });

  group('Search', () => {
    const searchStart = Date.now();
    const searchRes = http.get(`${BASE_URL}/api/trpc/search.merchants?input=${encodeURIComponent(JSON.stringify({ query: 'restaurant', lat: -1.2921, lng: 36.8219 }))}`, { headers });
    searchLatency.add(Date.now() - searchStart);
    check(searchRes, { 'Search OK': (r) => r.status === 200 || r.status === 401 });

    sleep(0.5);
  });

  sleep(Math.random() * 2);
}
