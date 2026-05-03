/**
 * OpenSearch Indexer — indexes audit logs, transactions, and KYB applications
 * for full-text search and compliance analytics.
 *
 * Uses circuit breaker and batches writes for efficiency.
 */
import { withCircuitBreaker } from "./circuitBreaker";
import { logger } from "../_core/logger";

const OPENSEARCH_URL = process.env.OPENSEARCH_URL || "http://localhost:9200";

// Index definitions
const INDEXES = {
  auditLogs: "tourismpay-audit-logs",
  transactions: "tourismpay-transactions",
  kybApplications: "tourismpay-kyb-applications",
  fraudAlerts: "tourismpay-fraud-alerts",
  settlements: "tourismpay-settlements",
} as const;

type IndexName = keyof typeof INDEXES;

interface IndexDocument {
  id: string;
  [key: string]: unknown;
}

// Batch queue for bulk indexing
const batchQueue: { index: string; doc: IndexDocument }[] = [];
const BATCH_SIZE = 50;
const BATCH_INTERVAL_MS = 5000;
let batchTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Index a single document to OpenSearch.
 * Non-blocking — queues for batch processing.
 */
export function indexDocument(indexName: IndexName, doc: IndexDocument): void {
  batchQueue.push({ index: INDEXES[indexName], doc });

  if (batchQueue.length >= BATCH_SIZE) {
    flushBatch().catch(() => {});
  }
}

/**
 * Index an audit log entry.
 */
export function indexAuditLog(log: {
  id: string | number;
  userId?: string | number;
  action: string;
  resource: string;
  details?: string;
  ipAddress?: string;
  timestamp?: string;
}): void {
  indexDocument("auditLogs", {
    id: String(log.id),
    userId: log.userId,
    action: log.action,
    resource: log.resource,
    details: log.details,
    ipAddress: log.ipAddress,
    timestamp: log.timestamp || new Date().toISOString(),
    indexedAt: new Date().toISOString(),
  });
}

/**
 * Index a transaction for searchability.
 */
export function indexTransaction(tx: {
  id: string | number;
  type: string;
  amount: number;
  currency: string;
  senderId?: string | number;
  receiverId?: string | number;
  status: string;
  timestamp?: string;
}): void {
  indexDocument("transactions", {
    id: String(tx.id),
    type: tx.type,
    amount: tx.amount,
    currency: tx.currency,
    senderId: tx.senderId,
    receiverId: tx.receiverId,
    status: tx.status,
    timestamp: tx.timestamp || new Date().toISOString(),
    indexedAt: new Date().toISOString(),
  });
}

/**
 * Index a KYB application.
 */
export function indexKybApplication(kyb: {
  id: string | number;
  merchantId: string | number;
  businessName: string;
  country: string;
  status: string;
  timestamp?: string;
}): void {
  indexDocument("kybApplications", {
    id: String(kyb.id),
    merchantId: kyb.merchantId,
    businessName: kyb.businessName,
    country: kyb.country,
    status: kyb.status,
    timestamp: kyb.timestamp || new Date().toISOString(),
    indexedAt: new Date().toISOString(),
  });
}

/**
 * Flush the batch queue to OpenSearch using the bulk API.
 */
async function flushBatch(): Promise<void> {
  if (batchQueue.length === 0) return;

  const batch = batchQueue.splice(0, BATCH_SIZE);

  try {
    await withCircuitBreaker(
      "opensearch",
      async () => {
        // Build NDJSON bulk body
        const lines: string[] = [];
        for (const { index, doc } of batch) {
          lines.push(JSON.stringify({ index: { _index: index, _id: doc.id } }));
          lines.push(JSON.stringify(doc));
        }
        const body = lines.join("\n") + "\n";

        const response = await fetch(`${OPENSEARCH_URL}/_bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/x-ndjson" },
          body,
          signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
          throw new Error(`OpenSearch bulk index failed: ${response.status}`);
        }

        const result = await response.json() as { errors: boolean; items: unknown[] };
        if (result.errors) {
          logger.warn("OpenSearch bulk index had errors", { count: batch.length });
        } else {
          logger.debug("OpenSearch bulk index success", { count: batch.length });
        }
      },
      () => {
        // On failure, put items back in the queue (up to limit)
        if (batchQueue.length < 1000) {
          batchQueue.unshift(...batch);
        } else {
          logger.warn("OpenSearch batch queue overflow, dropping documents", {
            dropped: batch.length,
          });
        }
      }
    );
  } catch (err) {
    logger.warn("OpenSearch batch flush failed", {
      error: err instanceof Error ? err.message : String(err),
      batchSize: batch.length,
    });
  }
}

/**
 * Search an index using OpenSearch full-text query.
 */
export async function searchIndex(
  indexName: IndexName,
  query: string,
  filters?: Record<string, unknown>,
  from = 0,
  size = 20
): Promise<{ hits: unknown[]; total: number }> {
  try {
    return await withCircuitBreaker("opensearch", async () => {
      const body: Record<string, unknown> = {
        query: {
          bool: {
            must: [
              { multi_match: { query, fields: ["*"], type: "best_fields" } },
            ],
            filter: filters
              ? Object.entries(filters).map(([field, value]) => ({ term: { [field]: value } }))
              : [],
          },
        },
        from,
        size,
        sort: [{ timestamp: { order: "desc" } }],
      };

      const response = await fetch(
        `${OPENSEARCH_URL}/${INDEXES[indexName]}/_search`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(5000),
        }
      );

      if (response.ok) {
        const data = await response.json() as Record<string, any>;
        return {
          hits: data.hits?.hits?.map((h: any) => h._source) || [],
          total: data.hits?.total?.value || 0,
        };
      }

      throw new Error(`OpenSearch query failed: ${response.status}`);
    });
  } catch {
    return { hits: [], total: 0 };
  }
}

/** Start the batch flusher timer */
export function startBatchFlusher(): void {
  if (!batchTimer) {
    batchTimer = setInterval(() => flushBatch().catch(() => {}), BATCH_INTERVAL_MS);
  }
}

/** Stop the batch flusher timer */
export function stopBatchFlusher(): void {
  if (batchTimer) {
    clearInterval(batchTimer);
    batchTimer = null;
  }
}

/** Get indexer stats */
export function getIndexerStats() {
  return {
    queueSize: batchQueue.length,
    indexes: INDEXES,
    batchSize: BATCH_SIZE,
    flushIntervalMs: BATCH_INTERVAL_MS,
  };
}
