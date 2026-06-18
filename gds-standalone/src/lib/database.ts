/**
 * PostgreSQL Connection Pool — GDS Standalone
 * Provides connection pooling, health checks, and query helpers.
 * Falls back to in-memory when DATABASE_URL is not configured.
 */
import { config } from "../config";

interface PoolClient {
  query(text: string, params?: unknown[]): Promise<QueryResult>;
  release(): void;
}

interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
}

interface Pool {
  query(text: string, params?: unknown[]): Promise<QueryResult>;
  connect(): Promise<PoolClient>;
  end(): Promise<void>;
  totalCount: number;
  idleCount: number;
  waitingCount: number;
}

let pool: Pool | null = null;
let pgAvailable = false;

async function createPool(): Promise<Pool | null> {
  try {
    const { Pool: PgPool } = await import("pg");
    const p = new PgPool({
      connectionString: config.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    await p.query("SELECT 1");
    console.log("[DB] PostgreSQL connected:", config.DATABASE_URL.replace(/:[^:@]+@/, ":***@"));
    pgAvailable = true;
    return p;
  } catch (err) {
    console.warn("[DB] PostgreSQL unavailable, using in-memory fallback:", (err as Error).message);
    pgAvailable = false;
    return null;
  }
}

export async function getPool(): Promise<Pool | null> {
  if (!pool && !pgAvailable) {
    pool = await createPool();
  }
  return pool;
}

export async function query(text: string, params?: unknown[]): Promise<QueryResult> {
  const p = await getPool();
  if (!p) {
    return { rows: [], rowCount: 0 };
  }
  return p.query(text, params);
}

export async function queryOne(text: string, params?: unknown[]): Promise<Record<string, unknown> | null> {
  const result = await query(text, params);
  return result.rows[0] || null;
}

export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T | null> {
  const p = await getPool();
  if (!p) return null;
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export function isDbAvailable(): boolean {
  return pgAvailable;
}

export async function dbHealthCheck(): Promise<{
  status: string;
  pool_total: number;
  pool_idle: number;
  pool_waiting: number;
  latency_ms: number;
}> {
  const p = await getPool();
  if (!p) {
    return { status: "disconnected", pool_total: 0, pool_idle: 0, pool_waiting: 0, latency_ms: -1 };
  }
  const start = Date.now();
  try {
    await p.query("SELECT 1");
    return {
      status: "connected",
      pool_total: p.totalCount,
      pool_idle: p.idleCount,
      pool_waiting: p.waitingCount,
      latency_ms: Date.now() - start,
    };
  } catch {
    return { status: "error", pool_total: 0, pool_idle: 0, pool_waiting: 0, latency_ms: -1 };
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    pgAvailable = false;
    console.log("[DB] Pool closed");
  }
}
