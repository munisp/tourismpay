/**
 * OpenSearch Index Lifecycle Management (ILM) Policies
 *
 * Manages index rotation, retention, and storage optimization for:
 *   - Audit logs: 90 days hot → 180 days warm → delete after 365 days
 *   - Transactions: 30 days hot → 365 days warm → archive after 7 years (compliance)
 *   - Search indices: No rotation (persistent)
 *   - Fraud alerts: 60 days hot → 180 days warm → delete after 730 days
 *
 * Middleware integration:
 *   - OpenSearch ISM (Index State Management) policies
 *   - Rollover based on index size (50GB) or age (daily)
 *   - Force merge on warm transition for storage efficiency
 */
import { logger } from "./logger";

const OPENSEARCH_NODE = process.env.OPENSEARCH_NODE;
const OPENSEARCH_USER = process.env.OPENSEARCH_USER || "admin";
const OPENSEARCH_PASSWORD = process.env.OPENSEARCH_PASSWORD || "admin";

// ─── ISM Policy Definitions ──────────────────────────────────────────────────

export const ISM_POLICIES = {
  audit_log_policy: {
    policy: {
      policy_id: "audit_log_policy",
      description: "Audit log lifecycle: hot 90d → warm 180d → delete 365d",
      default_state: "hot",
      states: [
        {
          name: "hot",
          actions: [{ rollover: { min_index_age: "1d", min_size: "50gb" } }],
          transitions: [{ state_name: "warm", conditions: { min_index_age: "90d" } }],
        },
        {
          name: "warm",
          actions: [
            { replica_count: { number_of_replicas: 1 } },
            { force_merge: { max_num_segments: 1 } },
          ],
          transitions: [{ state_name: "delete", conditions: { min_index_age: "365d" } }],
        },
        {
          name: "delete",
          actions: [{ delete: {} }],
          transitions: [],
        },
      ],
      ism_template: [{ index_patterns: ["tourismpay-audit-*"], priority: 100 }],
    },
  },

  transaction_policy: {
    policy: {
      policy_id: "transaction_policy",
      description: "Transaction lifecycle: hot 30d → warm 365d → cold 7y (compliance)",
      default_state: "hot",
      states: [
        {
          name: "hot",
          actions: [{ rollover: { min_index_age: "1d", min_size: "50gb" } }],
          transitions: [{ state_name: "warm", conditions: { min_index_age: "30d" } }],
        },
        {
          name: "warm",
          actions: [
            { replica_count: { number_of_replicas: 1 } },
            { force_merge: { max_num_segments: 1 } },
            { read_only: {} },
          ],
          transitions: [{ state_name: "cold", conditions: { min_index_age: "365d" } }],
        },
        {
          name: "cold",
          actions: [{ replica_count: { number_of_replicas: 0 } }],
          transitions: [{ state_name: "delete", conditions: { min_index_age: "2555d" } }],
        },
        {
          name: "delete",
          actions: [{ delete: {} }],
          transitions: [],
        },
      ],
      ism_template: [{ index_patterns: ["tourismpay-transactions-*"], priority: 100 }],
    },
  },

  fraud_alert_policy: {
    policy: {
      policy_id: "fraud_alert_policy",
      description: "Fraud alerts: hot 60d → warm 180d → delete 730d",
      default_state: "hot",
      states: [
        {
          name: "hot",
          actions: [{ rollover: { min_index_age: "7d", min_size: "10gb" } }],
          transitions: [{ state_name: "warm", conditions: { min_index_age: "60d" } }],
        },
        {
          name: "warm",
          actions: [{ force_merge: { max_num_segments: 1 } }],
          transitions: [{ state_name: "delete", conditions: { min_index_age: "730d" } }],
        },
        {
          name: "delete",
          actions: [{ delete: {} }],
          transitions: [],
        },
      ],
      ism_template: [{ index_patterns: ["tourismpay-fraud-*"], priority: 100 }],
    },
  },
};

// ─── Index Templates ─────────────────────────────────────────────────────────

export const INDEX_TEMPLATES = {
  "tourismpay-audit": {
    index_patterns: ["tourismpay-audit-*"],
    template: {
      settings: {
        number_of_shards: 3,
        number_of_replicas: 2,
        "index.codec": "best_compression",
        "plugins.index_state_management.rollover_alias": "tourismpay-audit",
      },
      mappings: {
        properties: {
          type: { type: "keyword" },
          userId: { type: "keyword" },
          action: { type: "keyword" },
          resource: { type: "keyword" },
          resourceId: { type: "keyword" },
          ip: { type: "ip" },
          timestamp: { type: "date" },
          metadata: { type: "object", enabled: true },
        },
      },
    },
  },

  "tourismpay-transactions": {
    index_patterns: ["tourismpay-transactions-*"],
    template: {
      settings: {
        number_of_shards: 5,
        number_of_replicas: 2,
        "index.codec": "best_compression",
        "plugins.index_state_management.rollover_alias": "tourismpay-transactions",
      },
      mappings: {
        properties: {
          transactionId: { type: "keyword" },
          userId: { type: "keyword" },
          merchantId: { type: "keyword" },
          amount: { type: "double" },
          currency: { type: "keyword" },
          status: { type: "keyword" },
          type: { type: "keyword" },
          corridor: { type: "keyword" },
          timestamp: { type: "date" },
        },
      },
    },
  },

  "tourismpay-fraud": {
    index_patterns: ["tourismpay-fraud-*"],
    template: {
      settings: {
        number_of_shards: 2,
        number_of_replicas: 2,
        "plugins.index_state_management.rollover_alias": "tourismpay-fraud",
      },
      mappings: {
        properties: {
          alertId: { type: "keyword" },
          userId: { type: "keyword" },
          severity: { type: "keyword" },
          triggerType: { type: "keyword" },
          fraudProbability: { type: "float" },
          resolution: { type: "keyword" },
          timestamp: { type: "date" },
        },
      },
    },
  },
};

// ─── Policy Application ──────────────────────────────────────────────────────

async function opensearchRequest(method: string, path: string, body?: object): Promise<any> {
  if (!OPENSEARCH_NODE) return null;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const auth = Buffer.from(`${OPENSEARCH_USER}:${OPENSEARCH_PASSWORD}`).toString("base64");
  headers["Authorization"] = `Basic ${auth}`;

  try {
    const response = await fetch(`${OPENSEARCH_NODE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

export async function applyILMPolicies(): Promise<{ applied: string[]; failed: string[] }> {
  if (!OPENSEARCH_NODE) {
    logger.info("[OpenSearch ILM] No OPENSEARCH_NODE — skipping ILM policy application");
    return { applied: [], failed: [] };
  }

  const applied: string[] = [];
  const failed: string[] = [];

  // Apply ISM policies
  for (const [name, policy] of Object.entries(ISM_POLICIES)) {
    const result = await opensearchRequest("PUT", `/_plugins/_ism/policies/${name}`, policy);
    if (result) {
      applied.push(name);
      logger.info(`[OpenSearch ILM] Applied policy: ${name}`);
    } else {
      failed.push(name);
      logger.warn(`[OpenSearch ILM] Failed to apply policy: ${name}`);
    }
  }

  // Apply index templates
  for (const [name, template] of Object.entries(INDEX_TEMPLATES)) {
    const result = await opensearchRequest("PUT", `/_index_template/${name}`, template);
    if (result) {
      applied.push(`template:${name}`);
    } else {
      failed.push(`template:${name}`);
    }
  }

  logger.info(`[OpenSearch ILM] Applied ${applied.length} policies/templates, ${failed.length} failed`);
  return { applied, failed };
}

export function getILMStatus(): { policies: string[]; templates: string[] } {
  return {
    policies: Object.keys(ISM_POLICIES),
    templates: Object.keys(INDEX_TEMPLATES),
  };
}
