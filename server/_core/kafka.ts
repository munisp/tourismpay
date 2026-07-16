/**
 * Kafka Runtime Client
 *
 * Event-driven architecture for TourismPay.
 * Publishes domain events for: remittances, settlements, fraud alerts,
 * KYB status changes, kill switch toggles, NOC events.
 *
 * Falls back gracefully when Kafka brokers are unavailable.
 */
import { Kafka, Producer, Consumer, logLevel, CompressionTypes } from "kafkajs";
import { logger } from "./logger";

// ─── Topics ──────────────────────────────────────────────────────────────────

export const TOPICS = {
  REMITTANCES: "tourismpay.remittances",
  SETTLEMENTS: "tourismpay.settlements",
  FRAUD_ALERTS: "tourismpay.fraud.alerts",
  KYB_STATUS: "tourismpay.kyb.status",
  KILL_SWITCH: "tourismpay.kill-switch",
  NOC_EVENTS: "tourismpay.noc.events",
  WALLET_TRANSACTIONS: "tourismpay.wallet.transactions",
  AUDIT_LOG: "tourismpay.audit.log",
  DEAD_LETTER: "tourismpay.dlq",
  PAYMENTS: "tourismpay.payments",
  LOYALTY: "tourismpay.loyalty",
  IDENTITY: "tourismpay.identity",
  SECURITY: "tourismpay.security",
  BIOMETRIC: "tourismpay.biometric",
  STRIPE: "tourismpay.stripe",
  CORRIDOR: "tourismpay.corridor",
} as const;

export type TopicName = (typeof TOPICS)[keyof typeof TOPICS];

// ─── Connection ──────────────────────────────────────────────────────────────

let kafka: Kafka | null = null;
let producer: Producer | null = null;
let consumers: Consumer[] = [];

function getBrokers(): string[] {
  const brokersEnv = process.env.KAFKA_BROKERS;
  if (brokersEnv) return brokersEnv.split(",").map(b => b.trim());
  return ["localhost:9092"];
}

function getKafkaInstance(): Kafka | null {
  if (kafka) return kafka;
  try {
    kafka = new Kafka({
      clientId: "tourismpay-pwa",
      brokers: getBrokers(),
      connectionTimeout: 5000,
      requestTimeout: 30000,
      retry: { retries: 3, initialRetryTime: 300 },
      logLevel: logLevel.WARN,
      ssl: process.env.KAFKA_SSL === "true" ? true : undefined,
      sasl: process.env.KAFKA_SASL_USERNAME ? {
        mechanism: "plain",
        username: process.env.KAFKA_SASL_USERNAME,
        password: process.env.KAFKA_SASL_PASSWORD || "",
      } : undefined,
    });
    return kafka;
  } catch {
    return null;
  }
}

// ─── Producer ────────────────────────────────────────────────────────────────

let producerReady = false;
let producerConnecting = false;

async function ensureProducer(): Promise<Producer | null> {
  if (producer && producerReady) return producer;
  if (producerConnecting) return null;
  producerConnecting = true;
  try {
    const k = getKafkaInstance();
    if (!k) { producerConnecting = false; return null; }
    producer = k.producer({
      allowAutoTopicCreation: true,
      idempotent: true,
      maxInFlightRequests: 5,
    });
    await producer.connect();
    producerReady = true;
    // @ts-ignore
    producer.on("producer.disconnect", () => { producerReady = false; });
    logger.info("[Kafka] Producer connected");
    return producer;
  } catch (err) {
    logger.warn(`[Kafka] Producer connection failed: ${(err as Error).message}`);
    producer = null;
    return null;
  } finally {
    producerConnecting = false;
  }
}

// ─── Publish ─────────────────────────────────────────────────────────────────

export interface DomainEvent {
  type: string;
  payload: Record<string, unknown>;
  timestamp?: string;
  correlationId?: string;
}

/** Validate event schema before publishing. */
function validateEvent(event: DomainEvent): string | null {
  if (!event.type || typeof event.type !== "string" || event.type.length === 0) {
    return "Event type is required and must be a non-empty string";
  }
  if (!event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) {
    return "Event payload is required and must be an object";
  }
  if (event.type.length > 256) return "Event type exceeds 256 characters";
  return null;
}

export async function publishEvent(topic: TopicName, event: DomainEvent): Promise<boolean> {
  // Schema validation gate
  const validationError = validateEvent(event);
  if (validationError) {
    logger.error(`[Kafka] Event validation failed for ${topic}: ${validationError}`);
    return false;
  }

  const p = await ensureProducer();
  if (!p) {
    logger.warn(`[Kafka] Cannot publish to ${topic} — producer unavailable`);
    return false;
  }
  try {
    const message = {
      key: event.correlationId || undefined,
      value: JSON.stringify({
        ...event,
        timestamp: event.timestamp || new Date().toISOString(),
      }),
      headers: {
        "content-type": Buffer.from("application/json"),
        source: Buffer.from("tourismpay-pwa"),
      },
    };
    await p.send({
      topic,
      // @ts-ignore
      messages: [message],
      compression: CompressionTypes.GZIP,
    });
    return true;
  } catch (err) {
    logger.error(`[Kafka] Publish to ${topic} failed: ${(err as Error).message}`);
    return false;
  }
}

/** Publish a failed event to the dead letter queue for manual inspection. */
export async function publishToDLQ(
  originalTopic: string,
  event: DomainEvent,
  error: string,
): Promise<boolean> {
  const p = await ensureProducer();
  if (!p) return false;
  try {
    await p.send({
      topic: TOPICS.DEAD_LETTER,
      messages: [{
        key: event.correlationId || undefined,
        value: JSON.stringify({
          originalTopic,
          event,
          error,
          failedAt: new Date().toISOString(),
        }),
        headers: {
          // @ts-ignore
          "content-type": Buffer.from("application/json"),
          // @ts-ignore
          "x-original-topic": Buffer.from(originalTopic),
          // @ts-ignore
          "x-error": Buffer.from(error.slice(0, 500)),
        },
      }],
    });
    return true;
  } catch (dlqErr) {
    logger.error(`[Kafka] DLQ publish failed: ${(dlqErr as Error).message}`);
    return false;
  }
}

// Convenience helpers

export async function publishRemittanceEvent(
  type: "created" | "processing" | "completed" | "failed" | "reversed",
  payload: Record<string, unknown>,
  correlationId?: string,
): Promise<boolean> {
  return publishEvent(TOPICS.REMITTANCES, { type: `remittance.${type}`, payload, correlationId });
}

export async function publishSettlementEvent(
  type: "initiated" | "completed" | "failed",
  payload: Record<string, unknown>,
  correlationId?: string,
): Promise<boolean> {
  return publishEvent(TOPICS.SETTLEMENTS, { type: `settlement.${type}`, payload, correlationId });
}

export async function publishFraudAlert(
  payload: Record<string, unknown>,
  correlationId?: string,
): Promise<boolean> {
  return publishEvent(TOPICS.FRAUD_ALERTS, { type: "fraud.alert.created", payload, correlationId });
}

export async function publishKybStatusChange(
  payload: Record<string, unknown>,
  correlationId?: string,
): Promise<boolean> {
  return publishEvent(TOPICS.KYB_STATUS, { type: "kyb.status.changed", payload, correlationId });
}

export async function publishAuditEvent(
  type: string,
  payload: Record<string, unknown>,
  correlationId?: string,
): Promise<boolean> {
  return publishEvent(TOPICS.AUDIT_LOG, { type, payload, correlationId });
}

// ─── Consumer ────────────────────────────────────────────────────────────────

export type EventHandler = (event: DomainEvent, topic: string) => Promise<void>;

export async function createConsumer(
  groupId: string,
  topics: TopicName[],
  handler: EventHandler,
): Promise<Consumer | null> {
  const k = getKafkaInstance();
  if (!k) return null;
  try {
    const consumer = k.consumer({
      groupId,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
    });
    await consumer.connect();
    for (const topic of topics) {
      await consumer.subscribe({ topic, fromBeginning: false });
    }
    await consumer.run({
      eachMessage: async ({ topic, message }) => {
        if (!message.value) return;
        try {
          const event = JSON.parse(message.value.toString()) as DomainEvent;
          await handler(event, topic);
        } catch (err) {
          logger.error(`[Kafka] Consumer error on ${topic}: ${(err as Error).message}`);
          // Send failed message to dead letter queue
          try {
            const failedEvent = message.value ? JSON.parse(message.value.toString()) : { type: "unknown", payload: {} };
            await publishToDLQ(topic, failedEvent, (err as Error).message);
          } catch {
            logger.error(`[Kafka] Could not parse failed message for DLQ on ${topic}`);
          }
        }
      },
    });
    consumers.push(consumer);
    logger.info(`[Kafka] Consumer ${groupId} subscribed to: ${topics.join(", ")}`);
    return consumer;
  } catch (err) {
    logger.warn(`[Kafka] Consumer ${groupId} failed: ${(err as Error).message}`);
    return null;
  }
}

// ─── Shutdown ────────────────────────────────────────────────────────────────

export async function closeKafka(): Promise<void> {
  if (producer) {
    await producer.disconnect().catch(() => {});
    producer = null;
    producerReady = false;
  }
  for (const c of consumers) {
    await c.disconnect().catch(() => {});
  }
  consumers = [];
  kafka = null;
}
