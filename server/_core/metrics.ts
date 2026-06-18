/**
 * Prometheus Metrics + Health Checks
 *
 * Exposes /metrics endpoint for Prometheus scraping and /health for k8s probes.
 * Tracks: HTTP request duration, active connections, DB pool, error rates,
 * wallet transaction volume, and business KPIs.
 */
import type { Request, Response, NextFunction } from "express";
import { getDb } from "../db";
import { getRedis } from "./redis";
import { logger } from "./logger";

// ─── Metric Storage ──────────────────────────────────────────────────────────

interface Histogram {
  buckets: Record<number, number>;
  sum: number;
  count: number;
}

interface Counter {
  value: number;
  labels: Record<string, number>;
}

const HISTOGRAM_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

const metrics = {
  httpRequestDuration: new Map<string, Histogram>(),
  httpRequestsTotal: { value: 0, labels: {} } as Counter,
  httpErrorsTotal: { value: 0, labels: {} } as Counter,
  activeConnections: 0,
  dbPoolActive: 0,
  dbPoolIdle: 0,
  walletTransactionsTotal: { value: 0, labels: {} } as Counter,
  walletVolumeNgn: 0,
  bisInvestigationsTotal: 0,
  kybApplicationsTotal: 0,
  settlementVolume: 0,
};

function getHistogram(method: string, route: string): Histogram {
  const key = `${method}:${route}`;
  if (!metrics.httpRequestDuration.has(key)) {
    const buckets: Record<number, number> = {};
    for (const b of HISTOGRAM_BUCKETS) buckets[b] = 0;
    metrics.httpRequestDuration.set(key, { buckets, sum: 0, count: 0 });
  }
  return metrics.httpRequestDuration.get(key)!;
}

// ─── Middleware ───────────────────────────────────────────────────────────────

export function metricsMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    metrics.activeConnections++;
    const start = process.hrtime.bigint();

    res.on("finish", () => {
      metrics.activeConnections--;
      const duration = Number(process.hrtime.bigint() - start) / 1e9;
      const route = req.route?.path || req.path.split("?")[0];
      const method = req.method;

      // Record histogram
      const hist = getHistogram(method, route);
      hist.sum += duration;
      hist.count++;
      for (const bucket of HISTOGRAM_BUCKETS) {
        if (duration <= bucket) {
          hist.buckets[bucket] = (hist.buckets[bucket] || 0) + 1;
        }
      }

      // Count requests
      metrics.httpRequestsTotal.value++;
      const statusLabel = `${res.statusCode}`;
      metrics.httpRequestsTotal.labels[statusLabel] = (metrics.httpRequestsTotal.labels[statusLabel] || 0) + 1;

      // Count errors
      if (res.statusCode >= 400) {
        metrics.httpErrorsTotal.value++;
        metrics.httpErrorsTotal.labels[statusLabel] = (metrics.httpErrorsTotal.labels[statusLabel] || 0) + 1;
      }
    });
    next();
  };
}

// ─── Business Metric Recorders ───────────────────────────────────────────────

export function recordWalletTransaction(type: string, amountKobo: number): void {
  metrics.walletTransactionsTotal.value++;
  metrics.walletTransactionsTotal.labels[type] = (metrics.walletTransactionsTotal.labels[type] || 0) + 1;
  metrics.walletVolumeNgn += amountKobo / 100;
}

export function recordBisInvestigation(): void {
  metrics.bisInvestigationsTotal++;
}

export function recordKybApplication(): void {
  metrics.kybApplicationsTotal++;
}

export function recordSettlement(amountKobo: number): void {
  metrics.settlementVolume += amountKobo / 100;
}

// ─── /metrics Endpoint (Prometheus format) ───────────────────────────────────

export function metricsHandler(_req: Request, res: Response): void {
  const lines: string[] = [];

  // HTTP request duration histogram
  lines.push("# HELP tourismpay_http_request_duration_seconds HTTP request duration in seconds");
  lines.push("# TYPE tourismpay_http_request_duration_seconds histogram");
  metrics.httpRequestDuration.forEach((hist, key) => {
    const [method, route] = key.split(":");
    for (const [bucket, countStr] of Object.entries(hist.buckets)) {
      lines.push(`tourismpay_http_request_duration_seconds_bucket{method="${method}",route="${route}",le="${bucket}"} ${countStr}`);
    }
    lines.push(`tourismpay_http_request_duration_seconds_bucket{method="${method}",route="${route}",le="+Inf"} ${hist.count}`);
    lines.push(`tourismpay_http_request_duration_seconds_sum{method="${method}",route="${route}"} ${hist.sum.toFixed(6)}`);
    lines.push(`tourismpay_http_request_duration_seconds_count{method="${method}",route="${route}"} ${hist.count}`);
  });

  // HTTP total requests
  lines.push("# HELP tourismpay_http_requests_total Total HTTP requests");
  lines.push("# TYPE tourismpay_http_requests_total counter");
  for (const [status, count] of Object.entries(metrics.httpRequestsTotal.labels)) {
    lines.push(`tourismpay_http_requests_total{status="${status}"} ${count}`);
  }

  // Active connections gauge
  lines.push("# HELP tourismpay_active_connections Current active connections");
  lines.push("# TYPE tourismpay_active_connections gauge");
  lines.push(`tourismpay_active_connections ${metrics.activeConnections}`);

  // Wallet transactions
  lines.push("# HELP tourismpay_wallet_transactions_total Total wallet transactions");
  lines.push("# TYPE tourismpay_wallet_transactions_total counter");
  for (const [type, count] of Object.entries(metrics.walletTransactionsTotal.labels)) {
    lines.push(`tourismpay_wallet_transactions_total{type="${type}"} ${count}`);
  }

  // Wallet volume
  lines.push("# HELP tourismpay_wallet_volume_ngn Total wallet volume in NGN");
  lines.push("# TYPE tourismpay_wallet_volume_ngn counter");
  lines.push(`tourismpay_wallet_volume_ngn ${metrics.walletVolumeNgn.toFixed(2)}`);

  // BIS investigations
  lines.push("# HELP tourismpay_bis_investigations_total Total BIS investigations");
  lines.push("# TYPE tourismpay_bis_investigations_total counter");
  lines.push(`tourismpay_bis_investigations_total ${metrics.bisInvestigationsTotal}`);

  // KYB applications
  lines.push("# HELP tourismpay_kyb_applications_total Total KYB applications");
  lines.push("# TYPE tourismpay_kyb_applications_total counter");
  lines.push(`tourismpay_kyb_applications_total ${metrics.kybApplicationsTotal}`);

  // Settlement volume
  lines.push("# HELP tourismpay_settlement_volume_ngn Total settlement volume in NGN");
  lines.push("# TYPE tourismpay_settlement_volume_ngn counter");
  lines.push(`tourismpay_settlement_volume_ngn ${metrics.settlementVolume.toFixed(2)}`);

  // Error rate
  lines.push("# HELP tourismpay_http_errors_total Total HTTP errors");
  lines.push("# TYPE tourismpay_http_errors_total counter");
  for (const [status, count] of Object.entries(metrics.httpErrorsTotal.labels)) {
    lines.push(`tourismpay_http_errors_total{status="${status}"} ${count}`);
  }

  res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
  res.send(lines.join("\n") + "\n");
}

// ─── /health Endpoint ────────────────────────────────────────────────────────

export async function healthHandler(_req: Request, res: Response): Promise<void> {
  const checks: Record<string, { status: string; latency?: number }> = {};
  let overall = true;

  // PostgreSQL
  const dbStart = Date.now();
  try {
    const dbClient = await getDb();
    if (dbClient) {
      await dbClient.execute("SELECT 1" as any);
      checks.postgresql = { status: "connected", latency: Date.now() - dbStart };
    } else {
      checks.postgresql = { status: "disconnected", latency: Date.now() - dbStart };
      overall = false;
    }
  } catch {
    checks.postgresql = { status: "disconnected", latency: Date.now() - dbStart };
    overall = false;
  }

  // Redis
  const redisStart = Date.now();
  const redis = getRedis();
  if (redis) {
    try {
      await redis.ping();
      checks.redis = { status: "connected", latency: Date.now() - redisStart };
    } catch {
      checks.redis = { status: "disconnected", latency: Date.now() - redisStart };
    }
  } else {
    checks.redis = { status: "not_configured" };
  }

  // Kafka (check if configured)
  checks.kafka = { status: process.env.KAFKA_BROKERS ? "configured" : "not_configured" };

  // TigerBeetle (ledger tables)
  try {
    const dbClient = await getDb();
    if (dbClient) {
      await dbClient.execute("SELECT COUNT(*) FROM ledger_accounts" as any);
      checks.tigerbeetle_ledger = { status: "active", latency: Date.now() - dbStart };
    } else {
      checks.tigerbeetle_ledger = { status: "not_initialized" };
    }
  } catch {
    checks.tigerbeetle_ledger = { status: "not_initialized" };
  }

  // Mojaloop
  checks.mojaloop = { status: process.env.MOJALOOP_HUB_URL ? "live" : "simulation" };

  // Keycloak
  checks.keycloak = { status: process.env.KEYCLOAK_URL ? "configured" : "dev_mode" };

  res.status(overall ? 200 : 503).json({
    status: overall ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks,
  });
}

// ─── /health/ready (k8s readiness probe) ─────────────────────────────────────

export async function readinessHandler(_req: Request, res: Response): Promise<void> {
  try {
    const dbClient = await getDb();
    if (!dbClient) throw new Error("no db");
    await dbClient.execute("SELECT 1" as any);
    res.status(200).json({ status: "ready" });
  } catch {
    res.status(503).json({ status: "not_ready", reason: "database_unavailable" });
  }
}

// ─── /health/live (k8s liveness probe) ───────────────────────────────────────

export function livenessHandler(_req: Request, res: Response): void {
  res.status(200).json({ status: "alive", pid: process.pid });
}
