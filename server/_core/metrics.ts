/**
 * Prometheus-compatible metrics endpoint for observability.
 * Exposes business KPIs and system metrics at /metrics.
 *
 * Middleware integration: Redis (cache hit rates), Kafka (event counts),
 * Temporal (workflow durations), OpenSearch (query latency).
 */
import { Request, Response, Router } from "express";
import { logger } from "./logger";

// ─── Metric Types ─────────────────────────────────────────────────────────────

interface CounterMetric {
  name: string;
  help: string;
  labels: Record<string, number>;
}

interface GaugeMetric {
  name: string;
  help: string;
  value: number;
}

interface HistogramMetric {
  name: string;
  help: string;
  buckets: number[];
  observations: number[];
}

// ─── Global Metrics Registry ──────────────────────────────────────────────────

const counters: Map<string, CounterMetric> = new Map();
const gauges: Map<string, GaugeMetric> = new Map();
const histograms: Map<string, HistogramMetric> = new Map();

// ─── Counter Operations ───────────────────────────────────────────────────────

export function incrementCounter(name: string, labels: Record<string, string> = {}, help = ""): void {
  const key = `${name}{${Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(",")}}`;
  const existing = counters.get(key);
  if (existing) {
    existing.labels[key] = (existing.labels[key] || 0) + 1;
  } else {
    counters.set(key, { name, help, labels: { [key]: 1 } });
  }
}

export function getCounterValue(name: string, labels: Record<string, string> = {}): number {
  const key = `${name}{${Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(",")}}`;
  return counters.get(key)?.labels[key] || 0;
}

// ─── Gauge Operations ─────────────────────────────────────────────────────────

export function setGauge(name: string, value: number, help = ""): void {
  gauges.set(name, { name, help, value });
}

export function incrementGauge(name: string, delta = 1): void {
  const existing = gauges.get(name);
  if (existing) existing.value += delta;
  else gauges.set(name, { name, help: "", value: delta });
}

export function decrementGauge(name: string, delta = 1): void {
  const existing = gauges.get(name);
  if (existing) existing.value -= delta;
  else gauges.set(name, { name, help: "", value: -delta });
}

// ─── Histogram Operations ─────────────────────────────────────────────────────

const DEFAULT_BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

export function observeHistogram(name: string, valueMs: number, help = ""): void {
  const existing = histograms.get(name);
  if (existing) {
    existing.observations.push(valueMs);
  } else {
    histograms.set(name, { name, help, buckets: DEFAULT_BUCKETS, observations: [valueMs] });
  }
}

// ─── Timer Utility ────────────────────────────────────────────────────────────

export function startTimer(): () => number {
  const start = performance.now();
  return () => performance.now() - start;
}

// ─── Business Metrics Helpers ─────────────────────────────────────────────────

export function recordPaymentAttempt(status: "success" | "failed" | "timeout", corridor?: string): void {
  incrementCounter("tourismpay_payment_attempts_total", { status, corridor: corridor || "unknown" }, "Total payment attempts");
}

export function recordSettlementLatency(durationMs: number): void {
  observeHistogram("tourismpay_settlement_duration_ms", durationMs, "Settlement processing time");
}

export function recordFraudScore(score: number): void {
  observeHistogram("tourismpay_fraud_score_distribution", score, "Fraud score distribution");
}

export function recordKafkaEvent(topic: string, status: "published" | "failed"): void {
  incrementCounter("tourismpay_kafka_events_total", { topic, status }, "Kafka events published");
}

export function recordRedisOperation(operation: string, hit: boolean): void {
  incrementCounter("tourismpay_redis_operations_total", { operation, hit: String(hit) }, "Redis cache operations");
}

export function recordTemporalWorkflow(queue: string, status: "started" | "completed" | "failed"): void {
  incrementCounter("tourismpay_temporal_workflows_total", { queue, status }, "Temporal workflow executions");
}

export function recordOpenSearchQuery(index: string, durationMs: number): void {
  observeHistogram("tourismpay_opensearch_query_duration_ms", durationMs, "OpenSearch query latency");
  incrementCounter("tourismpay_opensearch_queries_total", { index }, "OpenSearch queries");
}

export function setActiveConnections(count: number): void {
  setGauge("tourismpay_active_connections", count, "Active HTTP connections");
}

export function setMiddlewareStatus(service: string, connected: boolean): void {
  setGauge(`tourismpay_middleware_connected{service="${service}"}`, connected ? 1 : 0, "Middleware connection status");
}

// ─── Prometheus Format Serializer ─────────────────────────────────────────────

function serializeMetrics(): string {
  const lines: string[] = [];

  // System metrics
  const memUsage = process.memoryUsage();
  lines.push("# HELP nodejs_heap_used_bytes Node.js heap memory used");
  lines.push("# TYPE nodejs_heap_used_bytes gauge");
  lines.push(`nodejs_heap_used_bytes ${memUsage.heapUsed}`);
  lines.push("# HELP nodejs_heap_total_bytes Node.js heap memory total");
  lines.push("# TYPE nodejs_heap_total_bytes gauge");
  lines.push(`nodejs_heap_total_bytes ${memUsage.heapTotal}`);
  lines.push("# HELP nodejs_rss_bytes Node.js resident set size");
  lines.push("# TYPE nodejs_rss_bytes gauge");
  lines.push(`nodejs_rss_bytes ${memUsage.rss}`);
  lines.push("# HELP process_uptime_seconds Process uptime");
  lines.push("# TYPE process_uptime_seconds gauge");
  lines.push(`process_uptime_seconds ${process.uptime()}`);

  // Counters
  Array.from(counters.entries()).forEach(([key, metric]) => {
    if (metric.help) {
      lines.push(`# HELP ${metric.name} ${metric.help}`);
      lines.push(`# TYPE ${metric.name} counter`);
    }
    const value = metric.labels[key] || 0;
    lines.push(`${key} ${value}`);
  });

  // Gauges
  Array.from(gauges.values()).forEach((metric) => {
    if (metric.help) {
      lines.push(`# HELP ${metric.name} ${metric.help}`);
      lines.push(`# TYPE ${metric.name} gauge`);
    }
    lines.push(`${metric.name} ${metric.value}`);
  });

  // Histograms
  for (const metric of Array.from(histograms.values())) {
    if (metric.observations.length === 0) continue;
    if (metric.help) {
      lines.push(`# HELP ${metric.name} ${metric.help}`);
      lines.push(`# TYPE ${metric.name} histogram`);
    }
    const sorted = [...metric.observations].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, v) => acc + v, 0);
    for (const bucket of metric.buckets) {
      const count = sorted.filter(v => v <= bucket).length;
      lines.push(`${metric.name}_bucket{le="${bucket}"} ${count}`);
    }
    lines.push(`${metric.name}_bucket{le="+Inf"} ${sorted.length}`);
    lines.push(`${metric.name}_sum ${sum}`);
    lines.push(`${metric.name}_count ${sorted.length}`);
  }

  return lines.join("\n") + "\n";
}

// ─── Express Router ───────────────────────────────────────────────────────────

export function createMetricsRouter(): Router {
  const metricsRouter = Router();

  metricsRouter.get("/metrics", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    res.send(serializeMetrics());
  });

  return metricsRouter;
}

// ─── Request Duration Middleware ──────────────────────────────────────────────

export function metricsMiddleware() {
  return (req: Request, res: Response, next: () => void) => {
    const start = performance.now();
    incrementGauge("tourismpay_active_connections");

    res.on("finish", () => {
      const duration = performance.now() - start;
      decrementGauge("tourismpay_active_connections");
      observeHistogram("tourismpay_http_request_duration_ms", duration, "HTTP request duration");
      incrementCounter("tourismpay_http_requests_total", {
        method: req.method,
        status: String(res.statusCode),
        path: req.route?.path || req.path,
      }, "HTTP requests total");
    });

    next();
  };
}

logger.info("[Metrics] Prometheus metrics module loaded");
