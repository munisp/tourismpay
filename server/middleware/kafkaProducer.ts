/**
 * Kafka Producer — publishes domain events to Kafka via Dapr sidecar.
 *
 * Events are published asynchronously and failures are logged but do not
 * block the main request. Uses circuit breaker for resilience.
 */
import { withCircuitBreaker } from "./circuitBreaker";
import { logger } from "../_core/logger";

const DAPR_URL = process.env.DAPR_HTTP_URL || "http://localhost:3500";
const PUBSUB_NAME = "kafka-pubsub";

export type EventTopic =
  | "tourismpay.transactions"
  | "tourismpay.wallet.events"
  | "tourismpay.kyb.events"
  | "tourismpay.bis.inspections"
  | "tourismpay.payments"
  | "tourismpay.settlements"
  | "tourismpay.fraud.alerts"
  | "tourismpay.notifications"
  | "tourismpay.audit.logs"
  | "tourismpay.exchange.rates"
  | "tourismpay.merchant.events"
  | "tourismpay.remittance.events"
  | "tourismpay.sync.offline";

interface EventEnvelope {
  eventId: string;
  eventType: string;
  timestamp: string;
  source: string;
  data: Record<string, unknown>;
  metadata?: Record<string, string>;
}

let publishedCount = 0;
let failedCount = 0;

/**
 * Publish a domain event to Kafka via Dapr.
 * Non-blocking — logs errors but does not throw.
 */
export async function publishEvent(
  topic: EventTopic,
  eventType: string,
  data: Record<string, unknown>,
  metadata?: Record<string, string>
): Promise<boolean> {
  const envelope: EventEnvelope = {
    eventId: crypto.randomUUID(),
    eventType,
    timestamp: new Date().toISOString(),
    source: "tourismpay-pwa",
    data,
    metadata,
  };

  try {
    const result = await withCircuitBreaker(
      "kafka",
      async () => {
        const response = await fetch(
          `${DAPR_URL}/v1.0/publish/${PUBSUB_NAME}/${topic}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(envelope),
            signal: AbortSignal.timeout(3000),
          }
        );
        if (!response.ok) {
          throw new Error(`Kafka publish failed: ${response.status}`);
        }
        return true;
      },
      () => false
    );

    if (result) {
      publishedCount++;
      logger.debug("Kafka event published", { topic, eventType, eventId: envelope.eventId });
    } else {
      failedCount++;
      logger.warn("Kafka event publish failed (circuit breaker)", { topic, eventType });
    }
    return result;
  } catch (err) {
    failedCount++;
    logger.warn("Kafka event publish error", {
      topic,
      eventType,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/** Fire-and-forget event publishing — catches all errors */
export function emitEvent(
  topic: EventTopic,
  eventType: string,
  data: Record<string, unknown>,
  metadata?: Record<string, string>
): void {
  publishEvent(topic, eventType, data, metadata).catch((err) => {
    logger.warn("[Kafka] emitEvent failed", { topic, eventType, error: err instanceof Error ? err.message : String(err) });
  });
}

/** Get producer stats */
export function getKafkaProducerStats() {
  return { publishedCount, failedCount };
}
