/**
 * Web Vitals & APM Monitoring — Client-side performance tracking.
 *
 * Captures Core Web Vitals (LCP, FID, CLS, TTFB, INP) and custom
 * application metrics. Sends data to the server for aggregation.
 *
 * Metrics are batched and sent every 30 seconds or on page unload.
 */

interface VitalMetric {
  name: string;
  value: number;
  rating: "good" | "needs-improvement" | "poor";
  timestamp: number;
  route?: string;
}

const metrics: VitalMetric[] = [];
const BATCH_INTERVAL_MS = 30_000;
const API_ENDPOINT = "/api/trpc/system.reportMetrics";

function getRating(name: string, value: number): VitalMetric["rating"] {
  const thresholds: Record<string, [number, number]> = {
    LCP: [2500, 4000],
    FID: [100, 300],
    CLS: [0.1, 0.25],
    TTFB: [800, 1800],
    INP: [200, 500],
  };
  const [good, poor] = thresholds[name] ?? [Infinity, Infinity];
  if (value <= good) return "good";
  if (value <= poor) return "needs-improvement";
  return "poor";
}

function recordMetric(name: string, value: number) {
  metrics.push({
    name,
    value: Math.round(value * 1000) / 1000,
    rating: getRating(name, value),
    timestamp: Date.now(),
    route: window.location.pathname,
  });
}

function flushMetrics() {
  if (metrics.length === 0) return;
  const batch = metrics.splice(0, metrics.length);

  // Use sendBeacon for reliability on page unload
  if (navigator.sendBeacon) {
    navigator.sendBeacon(API_ENDPOINT, JSON.stringify({ metrics: batch }));
  } else {
    fetch(API_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metrics: batch }),
      keepalive: true,
    }).catch(() => {});
  }
}

/**
 * Initialize Web Vitals monitoring.
 * Uses PerformanceObserver API (no external dependencies).
 */
export function initWebVitals() {
  if (typeof window === "undefined" || typeof PerformanceObserver === "undefined") return;

  // Largest Contentful Paint (LCP)
  try {
    new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      const lastEntry = entries[entries.length - 1] as any;
      if (lastEntry) recordMetric("LCP", lastEntry.startTime);
    }).observe({ type: "largest-contentful-paint", buffered: true });
  } catch {}

  // First Input Delay (FID)
  try {
    new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        const fid = entry as any;
        recordMetric("FID", fid.processingStart - fid.startTime);
      }
    }).observe({ type: "first-input", buffered: true });
  } catch {}

  // Cumulative Layout Shift (CLS)
  try {
    let clsValue = 0;
    let clsEntries: any[] = [];
    let sessionValue = 0;
    let sessionEntries: any[] = [];

    new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        const layoutShift = entry as any;
        if (!layoutShift.hadRecentInput) {
          const firstSessionEntry = sessionEntries[0];
          const lastSessionEntry = sessionEntries[sessionEntries.length - 1];

          if (
            sessionValue &&
            layoutShift.startTime - lastSessionEntry.startTime < 1000 &&
            layoutShift.startTime - firstSessionEntry.startTime < 5000
          ) {
            sessionValue += layoutShift.value;
            sessionEntries.push(layoutShift);
          } else {
            sessionValue = layoutShift.value;
            sessionEntries = [layoutShift];
          }

          if (sessionValue > clsValue) {
            clsValue = sessionValue;
            clsEntries = sessionEntries;
            recordMetric("CLS", clsValue);
          }
        }
      }
    }).observe({ type: "layout-shift", buffered: true });
  } catch {}

  // Time to First Byte (TTFB)
  try {
    new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        const nav = entry as PerformanceNavigationTiming;
        recordMetric("TTFB", nav.responseStart - nav.requestStart);
      }
    }).observe({ type: "navigation", buffered: true });
  } catch {}

  // Interaction to Next Paint (INP)
  try {
    let maxINP = 0;
    new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        const inp = entry as any;
        const duration = inp.duration;
        if (duration > maxINP) {
          maxINP = duration;
          recordMetric("INP", duration);
        }
      }
    }).observe({ type: "event", buffered: true } as any);
  } catch {}

  // Batch flush every 30 seconds
  setInterval(flushMetrics, BATCH_INTERVAL_MS);

  // Flush on page unload
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushMetrics();
  });
}

/**
 * Record a custom performance metric.
 */
export function recordCustomMetric(name: string, value: number) {
  recordMetric(`custom.${name}`, value);
}

/**
 * Measure the duration of an async operation.
 */
export async function measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    recordMetric(`custom.${name}`, performance.now() - start);
  }
}
