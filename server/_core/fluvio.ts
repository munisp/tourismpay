/**
 * Fluvio Streaming Runtime Client
 *
 * Real-time event streaming for high-throughput scenarios:
 *  - Payment transaction streams
 *  - Real-time FX rate feeds
 *  - Live NOC monitoring events
 *
 * Complements Kafka for low-latency event processing.
 * Falls back gracefully when Fluvio is unavailable.
 */
import { logger } from "./logger";

// ─── Configuration ───────────────────────────────────────────────────────────

interface FluvioConfig {
  endpoint: string;
  profilePath?: string;
}

function getFluvioConfig(): FluvioConfig | null {
  const endpoint = process.env.FLUVIO_ENDPOINT;
  if (!endpoint) return null;
  return {
    endpoint,
    profilePath: process.env.FLUVIO_PROFILE_PATH,
  };
}

// ─── HTTP-based Fluvio Producer (via Fluvio Cloud HTTP API) ──────────────────

export const FLUVIO_TOPICS = {
  PAYMENT_STREAM: "tourismpay.payments.stream",
  FX_RATE_FEED: "tourismpay.fx.rates",
  NOC_LIVE: "tourismpay.noc.live",
  TRANSACTION_EVENTS: "tourismpay.transactions.events",
} as const;

export async function produceToFluvio(
  topic: string,
  key: string,
  value: Record<string, unknown>,
): Promise<boolean> {
  const config = getFluvioConfig();
  if (!config) return false;
  try {
    const res = await fetch(`${config.endpoint}/produce`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic,
        key,
        value: JSON.stringify({ ...value, timestamp: new Date().toISOString() }),
      }),
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch (err) {
    logger.warn(`[Fluvio] Produce to ${topic} failed: ${(err as Error).message}`);
    return false;
  }
}

// ─── Consume (polling-based for HTTP) ────────────────────────────────────────

export async function consumeFromFluvio(
  topic: string,
  offset?: number,
  maxRecords?: number,
): Promise<Array<{ key: string; value: string; offset: number }>> {
  const config = getFluvioConfig();
  if (!config) return [];
  try {
    const params = new URLSearchParams({ topic });
    if (offset !== undefined) params.set("offset", String(offset));
    if (maxRecords !== undefined) params.set("max_records", String(maxRecords));
    const res = await fetch(`${config.endpoint}/consume?${params}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    return (await res.json()) as Array<{ key: string; value: string; offset: number }>;
  } catch (err) {
    logger.warn(`[Fluvio] Consume from ${topic} failed: ${(err as Error).message}`);
    return [];
  }
}

// ─── Convenience Helpers ─────────────────────────────────────────────────────

export async function streamPaymentEvent(
  transactionId: string,
  event: Record<string, unknown>,
): Promise<boolean> {
  return produceToFluvio(FLUVIO_TOPICS.PAYMENT_STREAM, transactionId, {
    type: "payment.event",
    ...event,
  });
}

export async function streamFxRate(
  pair: string,
  rate: number,
  source: string,
): Promise<boolean> {
  return produceToFluvio(FLUVIO_TOPICS.FX_RATE_FEED, pair, {
    type: "fx.rate.update",
    pair,
    rate,
    source,
  });
}

export async function streamNocEvent(
  eventType: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  return produceToFluvio(FLUVIO_TOPICS.NOC_LIVE, eventType, {
    type: eventType,
    ...payload,
  });
}

export function isFluvioEnabled(): boolean {
  return !!process.env.FLUVIO_ENDPOINT;
}
