/**
 * OpenSearch Runtime Client
 *
 * Full-text search and analytics for:
 *  - Establishments (name, type, country, description)
 *  - Remittances (reference, corridor, status)
 *  - Users (name, email)
 *  - Audit logs (structured search)
 *
 * Falls back to PostgreSQL ilike queries when OpenSearch is unavailable.
 */
import { Client } from "@opensearch-project/opensearch";
import { logger } from "./logger";

// ─── Connection ──────────────────────────────────────────────────────────────

let client: Client | null = null;
let connectionFailed = false;

function getClient(): Client | null {
  if (client) return client;
  if (connectionFailed) return null;

  const node = process.env.OPENSEARCH_URL || "https://localhost:9200";
  const username = process.env.OPENSEARCH_USERNAME || "admin";
  const password = process.env.OPENSEARCH_PASSWORD || "admin";

  try {
    client = new Client({
      node,
      auth: { username, password },
      ssl: { rejectUnauthorized: process.env.OPENSEARCH_VERIFY_SSL !== "false" },
      requestTimeout: 5000,
      maxRetries: 2,
    });
    // Test connection
    client.cluster.health().then(() => {
      logger.info("[OpenSearch] Connected");
    }).catch((err) => {
      logger.warn(`[OpenSearch] Health check failed: ${err.message} — falling back to PostgreSQL`);
      connectionFailed = true;
      client = null;
    });
    return client;
  } catch {
    connectionFailed = true;
    return null;
  }
}

// ─── Index Management ────────────────────────────────────────────────────────

const INDICES = {
  ESTABLISHMENTS: "tourismpay-establishments",
  REMITTANCES: "tourismpay-remittances",
  USERS: "tourismpay-users",
  AUDIT_LOGS: "tourismpay-audit-logs",
} as const;

const INDEX_MAPPINGS: Record<string, Record<string, unknown>> = {
  [INDICES.ESTABLISHMENTS]: {
    properties: {
      id: { type: "integer" },
      name: { type: "text", analyzer: "standard" },
      type: { type: "keyword" },
      country: { type: "keyword" },
      description: { type: "text" },
      kybStatus: { type: "keyword" },
      createdAt: { type: "date" },
      ownerId: { type: "integer" },
    },
  },
  [INDICES.REMITTANCES]: {
    properties: {
      id: { type: "integer" },
      reference: { type: "keyword" },
      corridor: { type: "keyword" },
      status: { type: "keyword" },
      amount: { type: "float" },
      currency: { type: "keyword" },
      senderName: { type: "text" },
      recipientName: { type: "text" },
      createdAt: { type: "date" },
    },
  },
  [INDICES.USERS]: {
    properties: {
      id: { type: "integer" },
      name: { type: "text", analyzer: "standard" },
      email: { type: "keyword" },
      role: { type: "keyword" },
      country: { type: "keyword" },
      createdAt: { type: "date" },
    },
  },
  [INDICES.AUDIT_LOGS]: {
    properties: {
      timestamp: { type: "date" },
      action: { type: "keyword" },
      userId: { type: "integer" },
      resource: { type: "keyword" },
      resourceId: { type: "keyword" },
      details: { type: "text" },
      ip: { type: "ip" },
    },
  },
};

export async function ensureIndices(): Promise<void> {
  const os = getClient();
  if (!os) return;

  for (const [index, mappings] of Object.entries(INDEX_MAPPINGS)) {
    try {
      const exists = await os.indices.exists({ index });
      if (!exists.body) {
        await os.indices.create({
          index,
          body: { mappings, settings: { number_of_shards: 2, number_of_replicas: 1 } },
        });
        logger.info(`[OpenSearch] Created index: ${index}`);
      }
    } catch (err) {
      logger.warn(`[OpenSearch] Failed to create index ${index}: ${(err as Error).message}`);
    }
  }
}

// ─── Indexing ────────────────────────────────────────────────────────────────

export async function indexDocument(index: string, id: string, body: Record<string, unknown>): Promise<boolean> {
  const os = getClient();
  if (!os) return false;
  try {
    await os.index({ index, id, body, refresh: "wait_for" });
    return true;
  } catch (err) {
    logger.warn(`[OpenSearch] Index ${index}/${id} failed: ${(err as Error).message}`);
    return false;
  }
}

export async function bulkIndex(index: string, documents: Array<{ id: string; body: Record<string, unknown> }>): Promise<number> {
  const os = getClient();
  if (!os || documents.length === 0) return 0;
  try {
    const body = documents.flatMap(doc => [
      { index: { _index: index, _id: doc.id } },
      doc.body,
    ]);
    const result = await os.bulk({ body, refresh: "wait_for" });
    const indexed = documents.length - (result.body.errors ? result.body.items.filter((i: any) => i.index?.error).length : 0);
    return indexed;
  } catch (err) {
    logger.warn(`[OpenSearch] Bulk index to ${index} failed: ${(err as Error).message}`);
    return 0;
  }
}

// ─── Search ──────────────────────────────────────────────────────────────────

export interface SearchResult<T = Record<string, unknown>> {
  hits: Array<{ id: string; score: number; source: T }>;
  total: number;
}

export async function search<T = Record<string, unknown>>(
  index: string,
  query: Record<string, unknown>,
  options?: { from?: number; size?: number; sort?: Record<string, unknown>[] },
): Promise<SearchResult<T> | null> {
  const os = getClient();
  if (!os) return null; // Caller should fall back to PostgreSQL
  try {
    const result = await os.search({
      index,
      body: {
        query,
        from: options?.from || 0,
        size: options?.size || 20,
        sort: options?.sort,
      },
    });
    const hits = result.body.hits.hits.map((h: any) => ({
      id: h._id as string,
      score: h._score as number,
      source: h._source as T,
    }));
    const rawTotal = result.body.hits.total;
    const total = typeof rawTotal === "number"
      ? rawTotal
      : (rawTotal?.value ?? 0);
    return { hits, total };
  } catch (err) {
    logger.warn(`[OpenSearch] Search on ${index} failed: ${(err as Error).message}`);
    return null;
  }
}

// Convenience: full-text search across establishments
export async function searchEstablishments(query: string, options?: { from?: number; size?: number }) {
  return search(INDICES.ESTABLISHMENTS, {
    multi_match: {
      query,
      fields: ["name^3", "description", "type", "country"],
      fuzziness: "AUTO",
    },
  }, options);
}

// Convenience: search remittances
export async function searchRemittances(query: string, options?: { from?: number; size?: number }) {
  return search(INDICES.REMITTANCES, {
    multi_match: {
      query,
      fields: ["reference^3", "senderName", "recipientName", "corridor"],
      fuzziness: "AUTO",
    },
  }, options);
}

// Convenience: search users
export async function searchUsers(query: string, options?: { from?: number; size?: number }) {
  return search(INDICES.USERS, {
    multi_match: {
      query,
      fields: ["name^3", "email"],
      fuzziness: "AUTO",
    },
  }, options);
}

// ─── Delete ──────────────────────────────────────────────────────────────────

export async function deleteDocument(index: string, id: string): Promise<boolean> {
  const os = getClient();
  if (!os) return false;
  try {
    await os.delete({ index, id, refresh: "wait_for" });
    return true;
  } catch {
    return false;
  }
}

// ─── Shutdown ────────────────────────────────────────────────────────────────

export async function closeOpenSearch(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
  }
}

export { INDICES };
export function isOpenSearchEnabled(): boolean {
  return !!process.env.OPENSEARCH_URL && !connectionFailed;
}

// ─── Extended Indices for All Search Components ───────────────────────────────
export const EXTENDED_INDICES = {
  TRANSACTIONS: "tourismpay-transactions",
  SETTLEMENTS: "tourismpay-settlements",
  MERCHANTS: "tourismpay-merchants",
  AGENTS: "tourismpay-agents",
  WEBHOOKS: "tourismpay-webhooks",
  NOTIFICATIONS: "tourismpay-notifications",
  BULK_JOBS: "tourismpay-bulk-jobs",
  USSD_SESSIONS: "tourismpay-ussd-sessions",
  FRAUD_ALERTS: "tourismpay-fraud-alerts",
  BIS_INVESTIGATIONS: "tourismpay-bis-investigations",
  CUSTOMERS: "tourismpay-customers",
  ORDERS: "tourismpay-orders",
} as const;

// ─── Universal Search ─────────────────────────────────────────────────────────
export interface UniversalSearchResult {
  id: string;
  index: string;
  score: number;
  source: Record<string, unknown>;
}

export async function universalSearch(
  query: string,
  indices: string[],
  options?: { from?: number; size?: number; filters?: Record<string, string> }
): Promise<{ hits: UniversalSearchResult[]; total: number; source: "opensearch" | "unavailable" }> {
  const os = getClient();
  if (!os) {
    return { hits: [], total: 0, source: "unavailable" };
  }

  try {
    const must: Record<string, unknown>[] = [
      {
        multi_match: {
          query,
          fields: ["*"],
          type: "best_fields",
          fuzziness: "AUTO",
          minimum_should_match: "75%",
        },
      },
    ];

    if (options?.filters) {
      for (const [field, value] of Object.entries(options.filters)) {
        must.push({ term: { [field]: value } });
      }
    }

    const response = await os.search({
      index: indices.join(","),
      body: {
        query: { bool: { must } },
        from: options?.from ?? 0,
        size: options?.size ?? 20,
        highlight: {
          fields: { "*": {} },
          pre_tags: ["<mark>"],
          post_tags: ["</mark>"],
        },
      },
    });

    const hits = (response.body.hits?.hits ?? []).map((h: any) => ({
      id: h._id,
      index: h._index,
      score: h._score,
      source: { ...h._source, _highlights: h.highlight },
    }));

    return {
      hits,
      total: response.body.hits?.total?.value ?? hits.length,
      source: "opensearch",
    };
  } catch (err) {
    logger.warn(`[OpenSearch] universalSearch failed: ${(err as Error).message}`);
    return { hits: [], total: 0, source: "unavailable" };
  }
}

// ─── Domain-Specific Search Functions ────────────────────────────────────────
export async function searchTransactions(query: string, filters?: { status?: string; currency?: string }, options?: { from?: number; size?: number }) {
  return search(EXTENDED_INDICES.TRANSACTIONS, {
    multi_match: { query, fields: ["id^3", "reference^2", "merchantName", "description", "fromCurrency", "toCurrency"], fuzziness: "AUTO" },
  }, options);
}

export async function searchSettlements(query: string, options?: { from?: number; size?: number }) {
  return search(EXTENDED_INDICES.SETTLEMENTS, {
    multi_match: { query, fields: ["batchId^3", "status^2", "merchantId", "currency"], fuzziness: "AUTO" },
  }, options);
}

export async function searchMerchants(query: string, options?: { from?: number; size?: number }) {
  return search(EXTENDED_INDICES.MERCHANTS, {
    multi_match: { query, fields: ["businessName^3", "email^2", "phone", "registrationNumber", "country"], fuzziness: "AUTO" },
  }, options);
}

export async function searchAgents(query: string, options?: { from?: number; size?: number }) {
  return search(EXTENDED_INDICES.AGENTS, {
    multi_match: { query, fields: ["name^3", "agentCode^2", "phone", "email", "region"], fuzziness: "AUTO" },
  }, options);
}

export async function searchFraudAlerts(query: string, options?: { from?: number; size?: number }) {
  return search(EXTENDED_INDICES.FRAUD_ALERTS, {
    multi_match: { query, fields: ["alertType^2", "transactionId", "merchantId", "userId", "status"], fuzziness: "AUTO" },
  }, options);
}

export async function searchOrders(query: string, options?: { from?: number; size?: number }) {
  return search(EXTENDED_INDICES.ORDERS, {
    multi_match: { query, fields: ["orderId^3", "customerName^2", "customerEmail", "status", "productName"], fuzziness: "AUTO" },
  }, options);
}

export async function searchWebhooks(query: string, options?: { from?: number; size?: number }) {
  return search(EXTENDED_INDICES.WEBHOOKS, {
    multi_match: { query, fields: ["url^3", "events^2", "status"], fuzziness: "AUTO" },
  }, options);
}

export async function searchUssdSessions(query: string, options?: { from?: number; size?: number }) {
  return search(EXTENDED_INDICES.USSD_SESSIONS, {
    multi_match: { query, fields: ["sessionId^3", "msisdn^2", "menu", "status"], fuzziness: "AUTO" },
  }, options);
}

// ─── Index Document Helpers ───────────────────────────────────────────────────
export async function indexTransaction(tx: Record<string, unknown>) {
  return indexDocument(EXTENDED_INDICES.TRANSACTIONS, String(tx.id), tx);
}
export async function indexSettlement(s: Record<string, unknown>) {
  return indexDocument(EXTENDED_INDICES.SETTLEMENTS, String(s.id), s);
}
export async function indexMerchant(m: Record<string, unknown>) {
  return indexDocument(EXTENDED_INDICES.MERCHANTS, String(m.id), m);
}
export async function indexAgent(a: Record<string, unknown>) {
  return indexDocument(EXTENDED_INDICES.AGENTS, String(a.id), a);
}
export async function indexFraudAlert(f: Record<string, unknown>) {
  return indexDocument(EXTENDED_INDICES.FRAUD_ALERTS, String(f.id), f);
}
export async function indexOrder(o: Record<string, unknown>) {
  return indexDocument(EXTENDED_INDICES.ORDERS, String(o.id), o);
}
