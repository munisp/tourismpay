/**
 * Prometheus Metrics — GDS Standalone
 * Exposes /metrics endpoint for Prometheus scraping.
 * Tracks HTTP request duration, status codes, active connections, and business metrics.
 */
import express from "express";

interface MetricBucket {
  count: number;
  sum: number;
  buckets: Map<number, number>;
}

class SimpleCounter {
  private counts = new Map<string, number>();
  constructor(public name: string, public help: string) {}

  inc(labels: Record<string, string> = {}, value = 1): void {
    const key = this.labelsKey(labels);
    this.counts.set(key, (this.counts.get(key) || 0) + value);
  }

  serialize(): string {
    const lines: string[] = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];
    for (const [key, val] of this.counts) {
      lines.push(`${this.name}${key} ${val}`);
    }
    return lines.join("\n");
  }

  private labelsKey(labels: Record<string, string>): string {
    const entries = Object.entries(labels);
    if (entries.length === 0) return "";
    return `{${entries.map(([k, v]) => `${k}="${v}"`).join(",")}}`;
  }
}

class SimpleGauge {
  private values = new Map<string, number>();
  constructor(public name: string, public help: string) {}

  set(labels: Record<string, string>, value: number): void {
    this.values.set(this.labelsKey(labels), value);
  }

  inc(labels: Record<string, string> = {}, value = 1): void {
    const key = this.labelsKey(labels);
    this.values.set(key, (this.values.get(key) || 0) + value);
  }

  dec(labels: Record<string, string> = {}, value = 1): void {
    const key = this.labelsKey(labels);
    this.values.set(key, (this.values.get(key) || 0) - value);
  }

  serialize(): string {
    const lines: string[] = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} gauge`];
    for (const [key, val] of this.values) {
      lines.push(`${this.name}${key} ${val}`);
    }
    return lines.join("\n");
  }

  private labelsKey(labels: Record<string, string>): string {
    const entries = Object.entries(labels);
    if (entries.length === 0) return "";
    return `{${entries.map(([k, v]) => `${k}="${v}"`).join(",")}}`;
  }
}

class SimpleHistogram {
  private data = new Map<string, MetricBucket>();
  private bucketBounds: number[];
  constructor(public name: string, public help: string, buckets?: number[]) {
    this.bucketBounds = buckets || [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
  }

  observe(labels: Record<string, string>, value: number): void {
    const key = this.labelsKey(labels);
    if (!this.data.has(key)) {
      const buckets = new Map<number, number>();
      for (const b of this.bucketBounds) buckets.set(b, 0);
      this.data.set(key, { count: 0, sum: 0, buckets });
    }
    const d = this.data.get(key)!;
    d.count++;
    d.sum += value;
    for (const b of this.bucketBounds) {
      if (value <= b) d.buckets.set(b, (d.buckets.get(b) || 0) + 1);
    }
  }

  serialize(): string {
    const lines: string[] = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`];
    for (const [key, d] of this.data) {
      const labelStr = key ? key.slice(0, -1) + "," : "{";
      for (const b of this.bucketBounds) {
        lines.push(`${this.name}_bucket${labelStr}le="${b}"} ${d.buckets.get(b) || 0}`);
      }
      lines.push(`${this.name}_bucket${labelStr}le="+Inf"} ${d.count}`);
      lines.push(`${this.name}_sum${key} ${d.sum}`);
      lines.push(`${this.name}_count${key} ${d.count}`);
    }
    return lines.join("\n");
  }

  private labelsKey(labels: Record<string, string>): string {
    const entries = Object.entries(labels);
    if (entries.length === 0) return "";
    return `{${entries.map(([k, v]) => `${k}="${v}"`).join(",")}}`;
  }
}

// --- Metrics instances ---
export const httpRequestDuration = new SimpleHistogram(
  "gds_http_request_duration_seconds",
  "HTTP request duration in seconds"
);

export const httpRequestTotal = new SimpleCounter(
  "gds_http_requests_total",
  "Total HTTP requests"
);

export const httpActiveConnections = new SimpleGauge(
  "gds_http_active_connections",
  "Currently active HTTP connections"
);

export const businessMetrics = {
  pnrCreated: new SimpleCounter("gds_pnr_created_total", "Total PNRs created"),
  bookingsConfirmed: new SimpleCounter("gds_bookings_confirmed_total", "Total bookings confirmed"),
  commissionSplits: new SimpleCounter("gds_commission_splits_total", "Total commission splits executed"),
  settlementSagas: new SimpleCounter("gds_settlement_sagas_total", "Total settlement sagas executed"),
  searchQueries: new SimpleCounter("gds_search_queries_total", "Total search queries"),
  cacheHits: new SimpleCounter("gds_cache_hits_total", "Cache hits"),
  cacheMisses: new SimpleCounter("gds_cache_misses_total", "Cache misses"),
};

// --- Metrics middleware ---
export function metricsMiddleware(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const start = process.hrtime.bigint();
  httpActiveConnections.inc();

  res.on("finish", () => {
    const durationNs = Number(process.hrtime.bigint() - start);
    const durationS = durationNs / 1e9;
    const labels = {
      method: req.method,
      route: req.route?.path || req.path,
      status: String(res.statusCode),
    };
    httpRequestDuration.observe(labels, durationS);
    httpRequestTotal.inc(labels);
    httpActiveConnections.dec();
  });

  next();
}

// --- Metrics endpoint ---
export function metricsEndpoint(_req: express.Request, res: express.Response): void {
  const output = [
    httpRequestDuration.serialize(),
    httpRequestTotal.serialize(),
    httpActiveConnections.serialize(),
    businessMetrics.pnrCreated.serialize(),
    businessMetrics.bookingsConfirmed.serialize(),
    businessMetrics.commissionSplits.serialize(),
    businessMetrics.settlementSagas.serialize(),
    businessMetrics.searchQueries.serialize(),
    businessMetrics.cacheHits.serialize(),
    businessMetrics.cacheMisses.serialize(),
  ].filter(s => s.includes("\n")).join("\n\n");

  res.set("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
  res.send(output + "\n");
}
