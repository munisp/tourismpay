/**
 * Lakehouse Integration — TourismPay
 *
 * Provides a thin TypeScript client that bridges the Node.js API server with
 * the Python-based Lakehouse service (Apache Iceberg + DuckDB + MinIO/S3).
 *
 * Architecture:
 *   Node API → HTTP POST /ingest  → Python Lakehouse Service → Iceberg/Parquet
 *   Node API → HTTP GET  /query   → Python Lakehouse Service → DuckDB query
 *
 * The Python service runs as a sidecar (see python-services/lakehouse/).
 */

import axios, { AxiosInstance } from "axios";

const LAKEHOUSE_BASE_URL =
  process.env.LAKEHOUSE_SERVICE_URL ?? "http://lakehouse-service:8001";

let _client: AxiosInstance | null = null;

function getClient(): AxiosInstance {
  if (!_client) {
    _client = axios.create({
      baseURL: LAKEHOUSE_BASE_URL,
      timeout: 15_000,
      headers: {
        "Content-Type": "application/json",
        "X-Service": "tourismpay-api",
      },
    });
  }
  return _client;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LakehouseIngestPayload {
  [key: string]: unknown;
}

export interface LakehouseQueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
  executionTimeMs: number;
}

export interface LakehouseTableStats {
  tableName: string;
  rowCount: number;
  sizeBytes: number;
  lastUpdated: string;
  partitions: number;
}

// ─── Core Functions ───────────────────────────────────────────────────────────

/**
 * Ingest a single record into a Lakehouse Iceberg table.
 * The table name maps to a dataset in the Iceberg catalog.
 */
export async function ingestToLakehouse(
  tableName: string,
  payload: LakehouseIngestPayload
): Promise<{ success: boolean; recordId?: string }> {
  try {
    const client = getClient();
    const response = await client.post("/ingest", {
      table: tableName,
      record: payload,
    });
    return { success: true, recordId: response.data?.record_id };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[Lakehouse] ingestToLakehouse(${tableName}) failed: ${msg}`);
    return { success: false };
  }
}

/**
 * Batch ingest multiple records into a Lakehouse Iceberg table.
 * More efficient than calling ingestToLakehouse() in a loop.
 */
export async function batchIngestToLakehouse(
  tableName: string,
  records: LakehouseIngestPayload[]
): Promise<{ success: boolean; ingested: number }> {
  try {
    const client = getClient();
    const response = await client.post("/ingest/batch", {
      table: tableName,
      records,
    });
    return { success: true, ingested: response.data?.ingested ?? records.length };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[Lakehouse] batchIngestToLakehouse(${tableName}) failed: ${msg}`);
    return { success: false, ingested: 0 };
  }
}

/**
 * Execute a SQL query against the Lakehouse (DuckDB over Iceberg tables).
 * Returns typed rows.
 */
export async function queryLakehouse<T = Record<string, unknown>>(
  sql: string,
  params?: Record<string, unknown>
): Promise<LakehouseQueryResult<T>> {
  try {
    const client = getClient();
    const response = await client.post("/query", { sql, params: params ?? {} });
    return {
      rows: response.data?.rows ?? [],
      rowCount: response.data?.row_count ?? 0,
      executionTimeMs: response.data?.execution_time_ms ?? 0,
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[Lakehouse] queryLakehouse failed: ${msg}`);
    return { rows: [], rowCount: 0, executionTimeMs: 0 };
  }
}

/**
 * Get table statistics from the Lakehouse.
 */
export async function getLakehouseTableStats(
  tableName: string
): Promise<LakehouseTableStats | null> {
  try {
    const client = getClient();
    const response = await client.get(`/tables/${tableName}/stats`);
    return response.data as LakehouseTableStats;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[Lakehouse] getLakehouseTableStats(${tableName}) failed: ${msg}`);
    return null;
  }
}

/**
 * Trigger an ETL job in the Lakehouse service.
 * Jobs are defined in python-services/lakehouse/etl_jobs.py.
 */
export async function triggerLakehouseEtlJob(
  jobName: string,
  params?: Record<string, unknown>
): Promise<{ jobId: string; status: string }> {
  try {
    const client = getClient();
    const response = await client.post("/etl/trigger", {
      job: jobName,
      params: params ?? {},
    });
    return {
      jobId: response.data?.job_id ?? "unknown",
      status: response.data?.status ?? "queued",
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[Lakehouse] triggerLakehouseEtlJob(${jobName}) failed: ${msg}`);
    return { jobId: "error", status: "failed" };
  }
}

// ─── Domain-Specific Helpers ──────────────────────────────────────────────────

/** Ingest a payment transaction event for analytics. */
export async function ingestPaymentEvent(event: {
  transactionId: string;
  userId: string;
  amount: number;
  currency: string;
  type: string;
  status: string;
  merchantId?: string;
  country?: string;
  timestamp: number;
}): Promise<void> {
  await ingestToLakehouse("payment_events", event);
}

/** Ingest a fraud signal for ML model training. */
export async function ingestFraudSignal(signal: {
  transactionId: string;
  userId: string;
  fraudScore: number;
  ruleTriggered?: string;
  features: Record<string, unknown>;
  label?: "fraud" | "legitimate";
  timestamp: number;
}): Promise<void> {
  await ingestToLakehouse("fraud_signals", signal);
}

/** Ingest a settlement record for financial reconciliation. */
export async function ingestSettlementRecord(record: {
  settlementId: string;
  amount: number;
  currency: string;
  rail: string;
  status: string;
  merchantId?: string;
  timestamp: number;
}): Promise<void> {
  await ingestToLakehouse("settlement_records", record);
}

/** Query tourism spending analytics by country. */
export async function queryTourismSpendingByCountry(
  startDate: string,
  endDate: string
): Promise<Array<{ country: string; totalSpend: number; currency: string; txCount: number }>> {
  const result = await queryLakehouse<{
    country: string;
    total_spend: number;
    currency: string;
    tx_count: number;
  }>(`
    SELECT 
      country,
      SUM(amount) AS total_spend,
      currency,
      COUNT(*) AS tx_count
    FROM payment_events
    WHERE timestamp >= :start_ts
      AND timestamp <= :end_ts
    GROUP BY country, currency
    ORDER BY total_spend DESC
  `, {
    start_ts: new Date(startDate).getTime(),
    end_ts: new Date(endDate).getTime(),
  });

  return result.rows.map((r) => ({
    country: r.country,
    totalSpend: r.total_spend,
    currency: r.currency,
    txCount: r.tx_count,
  }));
}

/** Query fraud trend data for the NOC dashboard. */
export async function queryFraudTrends(
  windowHours: number
): Promise<Array<{ hour: string; fraudCount: number; avgScore: number }>> {
  const result = await queryLakehouse<{
    hour: string;
    fraud_count: number;
    avg_score: number;
  }>(`
    SELECT 
      DATE_TRUNC('hour', TO_TIMESTAMP(timestamp / 1000)) AS hour,
      COUNT(*) AS fraud_count,
      AVG(fraud_score) AS avg_score
    FROM fraud_signals
    WHERE timestamp >= :start_ts
    GROUP BY hour
    ORDER BY hour ASC
  `, {
    start_ts: Date.now() - windowHours * 3_600_000,
  });

  return result.rows.map((r) => ({
    hour: r.hour,
    fraudCount: r.fraud_count,
    avgScore: r.avg_score,
  }));
}
