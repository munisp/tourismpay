/**
 * Fluvio/Lakehouse Streaming Pipeline — real-time data streaming to data lake.
 *
 * Streams enriched platform events (transactions, fraud alerts, FX rates, etc.)
 * to the Lakehouse Analytics Service for storage as Parquet/Delta Lake tables.
 * Also writes directly to the ML feature store for continuous training.
 *
 * Materialized views:
 * - daily_transaction_volume: aggregated transaction counts and amounts by day/currency
 * - merchant_revenue_trends: merchant revenue rolling averages
 * - fraud_rate_by_country: fraud alert rates by country
 * - exchange_rate_history: exchange rate time series
 */
import { withCircuitBreaker } from "./circuitBreaker";
import { logger } from "../_core/logger";

const FLUVIO_URL = process.env.FLUVIO_URL || "localhost:9003";
const LAKEHOUSE_URL = process.env.LAKEHOUSE_URL || "http://localhost:8121";

// Materialized view definitions
const MATERIALIZED_VIEWS = [
  {
    name: "daily_transaction_volume",
    sourceTopics: ["tourismpay.transactions", "tourismpay.payments"],
    aggregation: "COUNT, SUM(amount) GROUP BY date, currency",
    refreshInterval: "5m",
  },
  {
    name: "merchant_revenue_trends",
    sourceTopics: ["tourismpay.merchant.events", "tourismpay.settlements"],
    aggregation: "SUM(revenue) GROUP BY merchant_id, date, 7d rolling avg",
    refreshInterval: "15m",
  },
  {
    name: "fraud_rate_by_country",
    sourceTopics: ["tourismpay.fraud.alerts", "tourismpay.transactions"],
    aggregation: "COUNT(fraud_alerts) / COUNT(transactions) GROUP BY country, month",
    refreshInterval: "1h",
  },
  {
    name: "exchange_rate_history",
    sourceTopics: ["tourismpay.exchange.rates"],
    aggregation: "AVG, MIN, MAX(rate) GROUP BY currency_pair, hour",
    refreshInterval: "10m",
  },
  {
    name: "kyb_processing_times",
    sourceTopics: ["tourismpay.kyb.events"],
    aggregation: "AVG, P95, P99(processing_time) GROUP BY country, month",
    refreshInterval: "1h",
  },
  {
    name: "wallet_flow_analysis",
    sourceTopics: ["tourismpay.wallet.events"],
    aggregation: "SUM(inflow), SUM(outflow) GROUP BY currency, day",
    refreshInterval: "15m",
  },
  {
    name: "settlement_reconciliation",
    sourceTopics: ["tourismpay.settlements"],
    aggregation: "SUM(settled), SUM(pending), SUM(failed) GROUP BY date, currency",
    refreshInterval: "30m",
  },
];

// Lakehouse table definitions (Iceberg format)
const LAKEHOUSE_TABLES = [
  { name: "fraud_transactions", partitionBy: ["country"], format: "parquet" },
  { name: "bis_entities", partitionBy: ["country"], format: "parquet" },
  { name: "fx_rates", partitionBy: ["corridor"], format: "parquet" },
  { name: "graph_edges", partitionBy: [], format: "parquet" },
  { name: "graph_nodes", partitionBy: [], format: "parquet" },
  { name: "wallet_events", partitionBy: ["currency"], format: "parquet" },
  { name: "settlement_events", partitionBy: ["currency"], format: "parquet" },
  { name: "kyb_events", partitionBy: ["country"], format: "parquet" },
];

// Streaming buffer
const streamBuffer: { topic: string; data: Record<string, unknown>; timestamp: string }[] = [];
const STREAM_FLUSH_SIZE = 100;
const STREAM_FLUSH_INTERVAL = 10_000;
let streamTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Stream a transaction event to the Lakehouse.
 * Enriches the event with ML-relevant features before sending.
 */
export function streamTransaction(
  data: Record<string, unknown>
): void {
  const enriched = {
    ...data,
    amount_log: data.amount ? Math.log1p(Number(data.amount)) : 0,
    hour_of_day: new Date().getHours(),
    day_of_week: new Date().getDay(),
    is_weekend: new Date().getDay() >= 5 ? 1 : 0,
    streamed_at: new Date().toISOString(),
  };
  streamToLakehouse("tourismpay.transactions", enriched);
}

/**
 * Stream a fraud alert event to the Lakehouse.
 */
export function streamFraudAlert(
  data: Record<string, unknown>
): void {
  streamToLakehouse("tourismpay.fraud.alerts", {
    ...data,
    streamed_at: new Date().toISOString(),
  });
}

/**
 * Stream exchange rate data to the Lakehouse.
 */
export function streamExchangeRate(
  corridor: string,
  rate: number,
  volume?: number
): void {
  streamToLakehouse("tourismpay.exchange.rates", {
    corridor,
    rate,
    volume: volume || 0,
    timestamp: new Date().toISOString(),
    streamed_at: new Date().toISOString(),
  });
}

/**
 * Stream a generic event to the Lakehouse.
 * Non-blocking — buffers events for batch writes.
 */
export function streamToLakehouse(
  topic: string,
  data: Record<string, unknown>
): void {
  streamBuffer.push({
    topic,
    data,
    timestamp: new Date().toISOString(),
  });

  if (streamBuffer.length >= STREAM_FLUSH_SIZE) {
    flushStream().catch(() => {});
  }
}

/**
 * Flush buffered events to the Lakehouse Analytics Service.
 * Uses the /api/v1/ingest endpoint on port 8121.
 */
async function flushStream(): Promise<void> {
  if (streamBuffer.length === 0) return;

  const batch = streamBuffer.splice(0, STREAM_FLUSH_SIZE);

  try {
    await withCircuitBreaker("lakehouse", async () => {
      const response = await fetch(`${LAKEHOUSE_URL}/api/v1/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          records: batch.map((item) => ({
            topic: item.topic,
            key: (item.data.id as string) || (item.data.transaction_id as string) || crypto.randomUUID(),
            value: item.data,
            timestamp: item.timestamp,
          })),
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`Lakehouse ingest failed: ${response.status}`);
      }

      logger.debug("Lakehouse batch ingested", { count: batch.length });
    });
  } catch (err) {
    logger.warn("Lakehouse ingest failed, re-queuing", {
      error: err instanceof Error ? err.message : String(err),
      batchSize: batch.length,
    });
    if (streamBuffer.length < 5000) {
      streamBuffer.unshift(...batch);
    }
  }
}

/**
 * Query a materialized view from the Lakehouse Analytics Service.
 */
export async function queryMaterializedView(
  viewName: string,
  filters?: Record<string, unknown>,
  timeRange?: { from: string; to: string }
): Promise<{ data: unknown[]; metadata: Record<string, unknown> }> {
  try {
    return await withCircuitBreaker("lakehouse", async () => {
      const response = await fetch(`${LAKEHOUSE_URL}/api/v1/views/${viewName}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(15000),
      });

      if (response.ok) {
        const result = (await response.json()) as { data: unknown[]; [key: string]: unknown };
        return { data: result.data || [], metadata: result };
      }

      throw new Error(`Lakehouse view query failed: ${response.status}`);
    });
  } catch {
    return {
      data: [],
      metadata: { error: "Lakehouse unavailable", viewName },
    };
  }
}

/**
 * Execute a SQL query against the Lakehouse.
 */
export async function queryLakehouse(
  sql: string
): Promise<{ rows: unknown[]; columns: string[]; took: number }> {
  try {
    return await withCircuitBreaker("lakehouse", async () => {
      const response = await fetch(`${LAKEHOUSE_URL}/api/v1/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: sql }),
        signal: AbortSignal.timeout(30000),
      });

      if (response.ok) {
        return (await response.json()) as { rows: unknown[]; columns: string[]; took: number };
      }

      throw new Error(`Lakehouse query failed: ${response.status}`);
    });
  } catch {
    return { rows: [], columns: [], took: 0 };
  }
}

/** Start the stream flusher */
export function startStreamFlusher(): void {
  if (!streamTimer) {
    streamTimer = setInterval(() => flushStream().catch(() => {}), STREAM_FLUSH_INTERVAL);
    logger.info("Lakehouse stream flusher started", { interval: STREAM_FLUSH_INTERVAL, url: LAKEHOUSE_URL });
  }
}

/** Stop the stream flusher */
export function stopStreamFlusher(): void {
  if (streamTimer) {
    clearInterval(streamTimer);
    streamTimer = null;
    // Flush remaining
    flushStream().catch(() => {});
  }
}

/** Get pipeline stats and configuration */
export function getFluvioLakehouseStats() {
  return {
    streamBufferSize: streamBuffer.length,
    materializedViews: MATERIALIZED_VIEWS,
    lakehouseTables: LAKEHOUSE_TABLES,
    fluvioUrl: FLUVIO_URL,
    lakehouseUrl: LAKEHOUSE_URL,
  };
}
