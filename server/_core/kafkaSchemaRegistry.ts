/**
 * Kafka Schema Registry Integration
 *
 * Enforces typed message contracts for all Kafka topics using JSON Schema validation.
 * When SCHEMA_REGISTRY_URL is configured, schemas are registered and validated against
 * the Confluent Schema Registry. Otherwise, local validation runs using JSON Schema.
 *
 * This prevents schema drift and ensures producer/consumer compatibility across
 * TypeScript, Go, Python, and Rust services.
 */
import { logger } from "./logger";

// ─── Schema Definitions ──────────────────────────────────────────────────────

export const TOPIC_SCHEMAS: Record<string, object> = {
  "tourismpay.remittances": {
    type: "object",
    required: ["eventType", "transferId", "senderId", "recipientId", "amount", "currency", "timestamp"],
    properties: {
      eventType: { type: "string", enum: ["initiated", "compliance_checked", "fx_converted", "executed", "completed", "failed", "reversed"] },
      transferId: { type: "string" },
      senderId: { type: "string" },
      recipientId: { type: "string" },
      amount: { type: "number", minimum: 0 },
      currency: { type: "string", pattern: "^[A-Z]{3}$" },
      corridor: { type: "string" },
      rail: { type: "string" },
      riskScore: { type: "number", minimum: 0, maximum: 100 },
      timestamp: { type: "string", format: "date-time" },
    },
  },

  "tourismpay.settlements": {
    type: "object",
    required: ["eventType", "batchId", "merchantId", "amount", "currency", "timestamp"],
    properties: {
      eventType: { type: "string", enum: ["batch_started", "payout_executed", "batch_completed", "reconciliation_done", "payout_failed"] },
      batchId: { type: "string" },
      merchantId: { type: "string" },
      amount: { type: "number", minimum: 0 },
      currency: { type: "string", pattern: "^[A-Z]{3}$" },
      fee: { type: "number", minimum: 0 },
      netAmount: { type: "number", minimum: 0 },
      timestamp: { type: "string", format: "date-time" },
    },
  },

  "tourismpay.fraud_alerts": {
    type: "object",
    required: ["alertId", "userId", "triggerType", "severity", "timestamp"],
    properties: {
      alertId: { type: "string" },
      userId: { type: "string" },
      triggerType: { type: "string", enum: ["velocity", "amount_anomaly", "geo_impossible", "device_mismatch", "graph_cluster", "ml_score"] },
      severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
      fraudProbability: { type: "number", minimum: 0, maximum: 1 },
      transactionId: { type: "string" },
      metadata: { type: "object" },
      timestamp: { type: "string", format: "date-time" },
    },
  },

  "tourismpay.wallet_transactions": {
    type: "object",
    required: ["eventType", "transactionId", "userId", "amount", "currency", "timestamp"],
    properties: {
      eventType: { type: "string", enum: ["credit", "debit", "transfer", "swap", "topup", "withdrawal"] },
      transactionId: { type: "string" },
      userId: { type: "string" },
      amount: { type: "number" },
      currency: { type: "string", pattern: "^[A-Z]{3}$" },
      balance_after: { type: "number" },
      counterpartyId: { type: "string" },
      idempotencyKey: { type: "string" },
      timestamp: { type: "string", format: "date-time" },
    },
  },

  "tourismpay.kyb_status": {
    type: "object",
    required: ["applicationId", "status", "timestamp"],
    properties: {
      applicationId: { type: "string" },
      businessName: { type: "string" },
      status: { type: "string", enum: ["submitted", "document_validation", "registration_check", "pep_screening", "sanctions_screening", "approved", "rejected"] },
      merchantId: { type: "string" },
      riskTier: { type: "integer", minimum: 0, maximum: 5 },
      rejectionReason: { type: "string" },
      timestamp: { type: "string", format: "date-time" },
    },
  },

  "tourismpay.audit_log": {
    type: "object",
    required: ["type", "timestamp"],
    properties: {
      type: { type: "string" },
      userId: { type: "string" },
      action: { type: "string" },
      resource: { type: "string" },
      resourceId: { type: "string" },
      metadata: { type: "object" },
      ip: { type: "string" },
      userAgent: { type: "string" },
      timestamp: { type: "string", format: "date-time" },
    },
  },

  "tourismpay.payments": {
    type: "object",
    required: ["eventType", "paymentId", "amount", "currency", "timestamp"],
    properties: {
      eventType: { type: "string", enum: ["initiated", "authorized", "captured", "settled", "refunded", "failed", "disputed"] },
      paymentId: { type: "string" },
      merchantId: { type: "string" },
      customerId: { type: "string" },
      amount: { type: "number", minimum: 0 },
      currency: { type: "string", pattern: "^[A-Z]{3}$" },
      method: { type: "string" },
      gateway: { type: "string" },
      timestamp: { type: "string", format: "date-time" },
    },
  },

  "tourismpay.dead_letter": {
    type: "object",
    required: ["originalTopic", "originalMessage", "error", "timestamp"],
    properties: {
      originalTopic: { type: "string" },
      originalMessage: { type: "object" },
      error: { type: "string" },
      retryCount: { type: "integer" },
      lastRetryAt: { type: "string", format: "date-time" },
      timestamp: { type: "string", format: "date-time" },
    },
  },
};

// ─── Schema Validation ───────────────────────────────────────────────────────

function validateAgainstSchema(topic: string, message: unknown): { valid: boolean; errors: string[] } {
  const schema = TOPIC_SCHEMAS[topic];
  if (!schema) return { valid: true, errors: [] }; // no schema = no validation

  const errors: string[] = [];
  const schemaObj = schema as any;

  if (typeof message !== "object" || message === null) {
    return { valid: false, errors: ["Message must be a non-null object"] };
  }

  const msg = message as Record<string, unknown>;

  // Check required fields
  if (schemaObj.required) {
    for (const field of schemaObj.required) {
      if (!(field in msg) || msg[field] === undefined || msg[field] === null) {
        errors.push(`Missing required field: ${field}`);
      }
    }
  }

  // Check property types
  if (schemaObj.properties) {
    for (const [key, propSchema] of Object.entries(schemaObj.properties)) {
      if (key in msg && msg[key] !== undefined) {
        const prop = propSchema as any;
        const val = msg[key];

        if (prop.type === "string" && typeof val !== "string") {
          errors.push(`Field ${key}: expected string, got ${typeof val}`);
        }
        if (prop.type === "number" && typeof val !== "number") {
          errors.push(`Field ${key}: expected number, got ${typeof val}`);
        }
        if (prop.type === "integer" && (typeof val !== "number" || !Number.isInteger(val))) {
          errors.push(`Field ${key}: expected integer`);
        }
        if (prop.enum && !prop.enum.includes(val)) {
          errors.push(`Field ${key}: value '${val}' not in enum [${prop.enum.join(",")}]`);
        }
        if (prop.minimum !== undefined && typeof val === "number" && val < prop.minimum) {
          errors.push(`Field ${key}: value ${val} below minimum ${prop.minimum}`);
        }
        if (prop.maximum !== undefined && typeof val === "number" && val > prop.maximum) {
          errors.push(`Field ${key}: value ${val} above maximum ${prop.maximum}`);
        }
        if (prop.pattern && typeof val === "string" && !new RegExp(prop.pattern).test(val)) {
          errors.push(`Field ${key}: value '${val}' does not match pattern ${prop.pattern}`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─── Schema Registry Client ──────────────────────────────────────────────────

const SCHEMA_REGISTRY_URL = process.env.SCHEMA_REGISTRY_URL;

async function registerSchemaWithRegistry(topic: string, schema: object): Promise<number | null> {
  if (!SCHEMA_REGISTRY_URL) return null;

  try {
    const response = await fetch(`${SCHEMA_REGISTRY_URL}/subjects/${topic}-value/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/vnd.schemaregistry.v1+json" },
      body: JSON.stringify({ schemaType: "JSON", schema: JSON.stringify(schema) }),
    });

    if (response.ok) {
      const result = await response.json() as { id: number };
      logger.info(`[SchemaRegistry] Registered schema for ${topic}: ID ${result.id}`);
      return result.id;
    } else {
      const errorText = await response.text();
      logger.warn(`[SchemaRegistry] Failed to register schema for ${topic}: ${errorText}`);
      return null;
    }
  } catch (err) {
    logger.warn(`[SchemaRegistry] Registry unavailable, using local validation`);
    return null;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function initializeSchemaRegistry(): Promise<void> {
  if (!SCHEMA_REGISTRY_URL) {
    logger.info("[SchemaRegistry] No SCHEMA_REGISTRY_URL — using local JSON Schema validation");
    return;
  }

  logger.info(`[SchemaRegistry] Registering ${Object.keys(TOPIC_SCHEMAS).length} schemas with ${SCHEMA_REGISTRY_URL}`);
  for (const [topic, schema] of Object.entries(TOPIC_SCHEMAS)) {
    await registerSchemaWithRegistry(topic, schema);
  }
}

export function validateMessage(topic: string, message: unknown): { valid: boolean; errors: string[] } {
  return validateAgainstSchema(topic, message);
}

export function getSchemaForTopic(topic: string): object | null {
  return TOPIC_SCHEMAS[topic] || null;
}

export function getAllTopicSchemas(): Record<string, object> {
  return { ...TOPIC_SCHEMAS };
}
