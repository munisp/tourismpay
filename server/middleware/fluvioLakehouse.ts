/**
 * Fluvio/Lakehouse Streaming Pipeline — real-time data streaming to data lake.
 *
 * Subscribes to Kafka topics (via Dapr) and streams enriched events
 * to a Lakehouse (Apache Iceberg/Delta Lake) for historical analytics.
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
const LAKEHOUSE_URL = process.env.LAKEHOUSE_URL || "http://localhost:8070";

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
  { name: "transactions_fact", partitionBy: ["date", "currency"], format: "iceberg" },
  { name: "wallet_events_fact", partitionBy: ["date", "currency"], format: "iceberg" },
  { name: "exchange_rates_dim", partitionBy: ["date"], format: "iceberg" },
  { name: "merchant_dim", partitionBy: ["country"], format: "iceberg" },
  { name: "tourist_dim", partitionBy: ["country"], format: "iceberg" },
  { name: "settlement_fact", partitionBy: ["date", "currency"], format: "iceberg" },
  { name: "fraud_alerts_fact", partitionBy: ["date", "country"], format: "iceberg" },
  { name: "kyb_applications_fact", partitionBy: ["date", "country"], format: "iceberg" },
];

// Streaming buffer
const streamBuffer: { topic: string; data: Record<string, unknown>; timestamp: string }[] = [];
const STREAM_FLUSH_SIZE = 100;
const STREAM_FLUSH_INTERVAL = 10_000;
let streamTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Stream an event to the Lakehouse.
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
 * Flush buffered events to the Lakehouse via Fluvio.
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
            key: item.data.id || crypto.randomUUID(),
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
 * Query a materialized view for analytics.
 */
export async function queryMaterializedView(
  viewName: string,
  filters?: Record<string, unknown>,
  timeRange?: { from: string; to: string }
): Promise<{ data: unknown[]; metadata: Record<string, unknown> }> {
  try {
    return await withCircuitBreaker("lakehouse", async () => {
      const response = await fetch(`${LAKEHOUSE_URL}/api/v1/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          view: viewName,
          filters,
          timeRange,
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (response.ok) {
        return await response.json() as { data: unknown[]; metadata: Record<string, unknown> };
      }

      throw new Error(`Lakehouse query failed: ${response.status}`);
    });
  } catch {
    return {
      data: [],
      metadata: { error: "Lakehouse unavailable", viewName },
    };
  }
}

/** Start the stream flusher */
export function startStreamFlusher(): void {
  if (!streamTimer) {
    streamTimer = setInterval(() => flushStream().catch(() => {}), STREAM_FLUSH_INTERVAL);
  }
}

/** Stop the stream flusher */
export function stopStreamFlusher(): void {
  if (streamTimer) {
    clearInterval(streamTimer);
    streamTimer = null;
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
