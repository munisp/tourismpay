/**
 * Kafka Producer/Consumer — GDS Standalone
 * Publishes domain events to Kafka topics.
 * Degrades gracefully when Kafka is unavailable.
 */
import { config } from "../config";

interface KafkaMessage {
  topic: string;
  key?: string;
  value: Record<string, unknown>;
  headers?: Record<string, string>;
}

let producer: import("kafkajs").Producer | null = null;
let kafkaAvailable = false;

const TOPICS = {
  PNR_CREATED: "gds.pnr.created",
  PNR_MODIFIED: "gds.pnr.modified",
  PNR_CANCELLED: "gds.pnr.cancelled",
  BOOKING_CONFIRMED: "gds.booking.confirmed",
  BOOKING_CANCELLED: "gds.booking.cancelled",
  COMMISSION_SPLIT: "gds.commission.split",
  SETTLEMENT_COMPLETED: "gds.settlement.completed",
  GUEST_CREATED: "gds.guest.created",
  GUEST_UPDATED: "gds.guest.updated",
  RATE_CHANGED: "gds.rate.changed",
  AVAILABILITY_UPDATED: "gds.availability.updated",
  CONTENT_UPDATED: "gds.content.updated",
  DISCOUNT_APPLIED: "gds.discount.applied",
  CANCELLATION_FEE: "gds.cancellation.fee",
  GROUP_BOOKING: "gds.group.booking",
  QUEUE_ITEM_CREATED: "gds.queue.item.created",
  ONBOARDING_TIER_CHANGE: "gds.onboarding.tier.change",
} as const;

async function createProducer(): Promise<void> {
  try {
    const { Kafka } = await import("kafkajs");
    const kafka = new Kafka({
      clientId: "gds-gateway",
      brokers: config.KAFKA_BROKERS.split(","),
      connectionTimeout: 5000,
      retry: { retries: 3 },
    });
    producer = kafka.producer();
    await producer.connect();
    console.log("[Kafka] Producer connected:", config.KAFKA_BROKERS);
    kafkaAvailable = true;
  } catch (err) {
    console.warn("[Kafka] Unavailable, events will be logged only:", (err as Error).message);
    kafkaAvailable = false;
  }
}

export async function initKafka(): Promise<void> {
  await createProducer();
}

export async function publishEvent(msg: KafkaMessage): Promise<void> {
  const event = {
    ...msg.value,
    _topic: msg.topic,
    _timestamp: new Date().toISOString(),
    _source: "gds-gateway",
  };

  if (producer && kafkaAvailable) {
    try {
      await producer.send({
        topic: msg.topic,
        messages: [{
          key: msg.key || undefined,
          value: JSON.stringify(event),
          headers: msg.headers,
        }],
      });
      return;
    } catch (err) {
      console.warn("[Kafka] Publish failed, logging event:", (err as Error).message);
    }
  }

  // Fallback: log event to stdout (for log aggregation to pick up)
  console.log(JSON.stringify({ level: "event", ...event }));
}

export function isKafkaAvailable(): boolean {
  return kafkaAvailable;
}

export async function kafkaHealthCheck(): Promise<{ status: string }> {
  return { status: kafkaAvailable ? "connected" : "disconnected" };
}

export async function closeKafka(): Promise<void> {
  if (producer) {
    await producer.disconnect();
    producer = null;
    kafkaAvailable = false;
    console.log("[Kafka] Producer closed");
  }
}

export { TOPICS };
