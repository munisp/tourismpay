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
