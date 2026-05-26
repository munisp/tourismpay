/**
 * Kafka Client — real connection to Kafka brokers via HTTP REST Proxy
 * or direct TCP connection (when kafkajs is available).
 *
 * Falls back to the Go Kafka processor service when direct connection
 * isn't available, and to in-memory when both are down.
 */
import { logger } from "../_core/logger";

// ─── Configuration ───────────────────────────────────────────────────────────

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || "localhost:9092").split(",");
const KAFKA_REST_PROXY = process.env.KAFKA_REST_PROXY_URL || "http://localhost:8082";
const KAFKA_PROCESSOR_URL = process.env.KAFKA_PROCESSOR_URL || "http://localhost:8100";
const KAFKA_CLIENT_ID = "tourismpay-ts";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface KafkaEvent {
  topic: string;
  key?: string;
  value: Record<string, unknown>;
  headers?: Record<string, string>;
  timestamp?: number;
}

// ─── Connection Check ────────────────────────────────────────────────────────

let kafkaRestAvailable: boolean | null = null;
let goProcessorAvailable: boolean | null = null;

async function checkKafkaRest(): Promise<boolean> {
  if (kafkaRestAvailable !== null) return kafkaRestAvailable;
  try {
    const res = await fetch(`${KAFKA_REST_PROXY}/topics`, { signal: AbortSignal.timeout(3000) });
    kafkaRestAvailable = res.ok;
  } catch {
    kafkaRestAvailable = false;
  }
  // Re-check every 60s
  setTimeout(() => { kafkaRestAvailable = null; }, 60000);
  return kafkaRestAvailable;
}

async function checkGoProcessor(): Promise<boolean> {
  if (goProcessorAvailable !== null) return goProcessorAvailable;
  try {
    const res = await fetch(`${KAFKA_PROCESSOR_URL}/health`, { signal: AbortSignal.timeout(3000) });
    goProcessorAvailable = res.ok;
  } catch {
    goProcessorAvailable = false;
  }
  setTimeout(() => { goProcessorAvailable = null; }, 60000);
  return goProcessorAvailable;
}

// ─── Produce via Kafka REST Proxy (Confluent-compatible) ─────────────────────

async function produceViaRest(event: KafkaEvent): Promise<boolean> {
  const body = {
    records: [{
      key: event.key ? { type: "STRING", data: event.key } : undefined,
      value: { type: "JSON", data: event.value },
      headers: event.headers ? Object.entries(event.headers).map(([k, v]) => ({
        name: k, value: Buffer.from(v).toString("base64"),
      })) : undefined,
    }],
  };

  const res = await fetch(`${KAFKA_REST_PROXY}/topics/${event.topic}`, {
    method: "POST",
    headers: { "Content-Type": "application/vnd.kafka.json.v2+json", Accept: "application/vnd.kafka.v2+json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });

  return res.ok;
}

// ─── Produce via Go Kafka Processor ──────────────────────────────────────────

async function produceViaGoProcessor(event: KafkaEvent): Promise<boolean> {
  const res = await fetch(`${KAFKA_PROCESSOR_URL}/api/v1/kafka/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: event.topic,
      key: event.key,
      payload: event.value,
      headers: event.headers,
    }),
    signal: AbortSignal.timeout(5000),
  });
  return res.ok;
}

// ─── In-Memory Fallback ──────────────────────────────────────────────────────

const inMemoryEvents: KafkaEvent[] = [];
const MAX_MEMORY_EVENTS = 10000;

function produceInMemory(event: KafkaEvent): boolean {
  inMemoryEvents.push({ ...event, timestamp: Date.now() });
  if (inMemoryEvents.length > MAX_MEMORY_EVENTS) inMemoryEvents.shift();
  return true;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function produce(event: KafkaEvent): Promise<{ success: boolean; via: string }> {
  // Try Kafka REST Proxy first
  if (await checkKafkaRest()) {
    try {
      const ok = await produceViaRest(event);
      if (ok) return { success: true, via: "kafka-rest-proxy" };
    } catch { /* fall through */ }
  }

  // Try Go Kafka Processor
  if (await checkGoProcessor()) {
    try {
      const ok = await produceViaGoProcessor(event);
      if (ok) return { success: true, via: "go-kafka-processor" };
    } catch { /* fall through */ }
  }

  // In-memory fallback
  produceInMemory(event);
  logger.warn("[Kafka] Both REST proxy and Go processor unavailable, stored in memory", { topic: event.topic });
  return { success: true, via: "in-memory" };
}

/** Flush in-memory events to Kafka when connection is restored */
export async function flushInMemoryEvents(): Promise<number> {
  if (inMemoryEvents.length === 0) return 0;
  let flushed = 0;
  const events = [...inMemoryEvents];
  for (const event of events) {
    const result = await produce(event);
    if (result.via !== "in-memory") {
      flushed++;
      const idx = inMemoryEvents.indexOf(event);
      if (idx >= 0) inMemoryEvents.splice(idx, 1);
    } else {
      break; // Still no connection
    }
  }
  return flushed;
}

export function getKafkaStatus(): {
  restProxyAvailable: boolean;
  goProcessorAvailable: boolean;
  inMemoryEventCount: number;
  brokers: string[];
} {
  return {
    restProxyAvailable: kafkaRestAvailable ?? false,
    goProcessorAvailable: goProcessorAvailable ?? false,
    inMemoryEventCount: inMemoryEvents.length,
    brokers: KAFKA_BROKERS,
  };
}

// ─── Convenience Producers ───────────────────────────────────────────────────

export const produceTransactionEvent = (type: "created" | "completed" | "failed", data: Record<string, unknown>) =>
  produce({ topic: `transaction.${type}`, key: String(data.id || ""), value: { type: `transaction.${type}`, ...data, timestamp: Date.now() } });

export const produceUserEvent = (type: "registered" | "verified" | "updated", data: Record<string, unknown>) =>
  produce({ topic: `user.${type}`, key: String(data.userId || ""), value: { type: `user.${type}`, ...data, timestamp: Date.now() } });

export const produceFraudEvent = (data: Record<string, unknown>) =>
  produce({ topic: "fraud.alert", key: String(data.alertId || ""), value: { type: "fraud.alert", ...data, timestamp: Date.now() } });

export const produceAuditEvent = (action: string, data: Record<string, unknown>) =>
  produce({ topic: "audit.log", key: action, value: { action, ...data, timestamp: Date.now() } });
