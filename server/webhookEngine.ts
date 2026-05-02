/**
 * Webhook Delivery Engine
 *
 * Handles delivery of webhook events to registered endpoints with:
 * - HMAC-SHA256 request signing
 * - Exponential backoff retry (5 attempts: 30s, 5m, 30m, 2h, 8h)
 * - Delivery log persistence in psWebhookDeliveries
 * - Temporal-style workflow simulation (polling-based retry scheduler)
 */

import crypto from "crypto";
import { eq, and, lte, inArray } from "drizzle-orm";
import { getDb } from "./db";
import {
  psWebhooks,
  psWebhookDeliveries,
  type PsWebhook,
  type PsWebhookDelivery,
} from "../drizzle/schema";

// ─── Retry schedule (milliseconds) ────────────────────────────────────────────
// Attempt 1 → immediate
// Attempt 2 → 30 seconds
// Attempt 3 → 5 minutes
// Attempt 4 → 30 minutes
// Attempt 5 → 2 hours
// After 5 attempts → exhausted

export const RETRY_DELAYS_MS = [0, 30_000, 300_000, 1_800_000, 7_200_000];
export const MAX_ATTEMPTS = 5;

// ─── HMAC signing ─────────────────────────────────────────────────────────────

export function signPayload(secret: string, payload: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export function buildSignatureHeader(secret: string, payload: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const sig = signPayload(secret, `${timestamp}.${payload}`);
  return `t=${timestamp},v1=${sig}`;
}

// ─── Delivery attempt ─────────────────────────────────────────────────────────

export interface DeliveryResult {
  success: boolean;
  responseCode?: number;
  responseBody?: string;
  responseTimeMs?: number;
  errorMessage?: string;
}

export async function attemptDelivery(
  endpoint: string,
  secret: string,
  event: string,
  payload: Record<string, unknown>
): Promise<DeliveryResult> {
  const payloadStr = JSON.stringify(payload);
  const signature = buildSignatureHeader(secret, payloadStr);
  const startMs = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000); // 15s timeout

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-TourismPay-Event": event,
        "X-TourismPay-Signature": signature,
        "X-TourismPay-Delivery": crypto.randomUUID(),
        "User-Agent": "TourismPay-Webhooks/1.0",
      },
      body: payloadStr,
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const responseTimeMs = Date.now() - startMs;
    const responseBody = await response.text().catch(() => "");

    if (response.ok) {
      return {
        success: true,
        responseCode: response.status,
        responseBody: responseBody.slice(0, 1000),
        responseTimeMs,
      };
    }

    return {
      success: false,
      responseCode: response.status,
      responseBody: responseBody.slice(0, 1000),
      responseTimeMs,
      errorMessage: `HTTP ${response.status}: ${response.statusText}`,
    };
  } catch (err: unknown) {
    const responseTimeMs = Date.now() - startMs;
    const errorMessage =
      err instanceof Error ? err.message : "Unknown delivery error";

    return {
      success: false,
      responseTimeMs,
      errorMessage,
    };
  }
}

// ─── Enqueue a new webhook delivery ───────────────────────────────────────────

export async function enqueueWebhookDelivery(
  webhookId: string,
  event: string,
  payload: Record<string, unknown>
): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;

  const deliveryId = `wdlv_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const now = Date.now();

  await db.insert(psWebhookDeliveries).values({
    deliveryId,
    webhookId,
    event,
    payload,
    status: "pending",
    attempts: 0,
    maxAttempts: MAX_ATTEMPTS,
    nextRetryAt: now, // deliver immediately
    createdAt: now,
    updatedAt: now,
  });

  return deliveryId;
}

// ─── Dispatch a webhook event to all matching active webhooks ─────────────────

export async function dispatchWebhookEvent(
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Find all active webhooks subscribed to this event
  const webhooks = await db
    .select()
    .from(psWebhooks)
    .where(eq(psWebhooks.isActive, true));

  const matching = webhooks.filter((wh: PsWebhook) => {
    const events = wh.events.split(",").map((e: string) => e.trim());
    return events.includes(event) || events.includes("*");
  });

  for (const wh of matching) {
    await enqueueWebhookDelivery(wh.webhookId, event, {
      ...payload,
      event,
      webhookId: wh.webhookId,
      timestamp: new Date().toISOString(),
    });
  }
}

// ─── Process pending/retrying deliveries (called by scheduler) ────────────────

export async function processPendingDeliveries(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const db = await getDb();
  if (!db) return { processed: 0, succeeded: 0, failed: 0 };

  const now = Date.now();

  // Fetch deliveries due for retry
  const pending = await db
    .select()
    .from(psWebhookDeliveries)
    .where(
      and(
        inArray(psWebhookDeliveries.status, ["pending", "retrying"]),
        lte(psWebhookDeliveries.nextRetryAt, now)
      )
    )
    .limit(50);

  let succeeded = 0;
  let failed = 0;

  for (const delivery of pending) {
    // Fetch the webhook config
    const [wh] = await db
      .select()
      .from(psWebhooks)
      .where(eq(psWebhooks.webhookId, delivery.webhookId))
      .limit(1);

    if (!wh || !wh.isActive) {
      // Webhook deleted or disabled — mark exhausted
      await db
        .update(psWebhookDeliveries)
        .set({ status: "exhausted", updatedAt: Date.now() })
        .where(eq(psWebhookDeliveries.deliveryId, delivery.deliveryId));
      failed++;
      continue;
    }

    const result = await attemptDelivery(
      wh.endpoint,
      wh.secret,
      delivery.event,
      delivery.payload as Record<string, unknown>
    );

    const newAttempts = delivery.attempts + 1;
    const deliveryNow = Date.now();

    if (result.success) {
      // Update delivery as succeeded
      await db
        .update(psWebhookDeliveries)
        .set({
          status: "success",
          attempts: newAttempts,
          lastAttemptAt: deliveryNow,
          responseCode: result.responseCode,
          responseBody: result.responseBody,
          responseTimeMs: result.responseTimeMs,
          updatedAt: deliveryNow,
        })
        .where(eq(psWebhookDeliveries.deliveryId, delivery.deliveryId));

      // Update webhook stats
      await db
        .update(psWebhooks)
        .set({
          lastDeliveryAt: deliveryNow,
          lastDeliveryStatus: "success",
          totalDeliveries: (wh.totalDeliveries ?? 0) + 1,
          updatedAt: deliveryNow,
        })
        .where(eq(psWebhooks.webhookId, wh.webhookId));

      succeeded++;
    } else if (newAttempts >= MAX_ATTEMPTS) {
      // Exhausted all retries
      await db
        .update(psWebhookDeliveries)
        .set({
          status: "exhausted",
          attempts: newAttempts,
          lastAttemptAt: deliveryNow,
          responseCode: result.responseCode,
          responseBody: result.responseBody,
          responseTimeMs: result.responseTimeMs,
          errorMessage: result.errorMessage,
          updatedAt: deliveryNow,
        })
        .where(eq(psWebhookDeliveries.deliveryId, delivery.deliveryId));

      // Update webhook failure stats
      await db
        .update(psWebhooks)
        .set({
          lastDeliveryAt: deliveryNow,
          lastDeliveryStatus: "failed",
          totalDeliveries: (wh.totalDeliveries ?? 0) + 1,
          failureCount: (wh.failureCount ?? 0) + 1,
          updatedAt: deliveryNow,
        })
        .where(eq(psWebhooks.webhookId, wh.webhookId));

      failed++;
    } else {
      // Schedule next retry with exponential backoff
      const delayMs = RETRY_DELAYS_MS[newAttempts] ?? 28_800_000; // 8h max
      const nextRetryAt = deliveryNow + delayMs;

      await db
        .update(psWebhookDeliveries)
        .set({
          status: "retrying",
          attempts: newAttempts,
          lastAttemptAt: deliveryNow,
          nextRetryAt,
          responseCode: result.responseCode,
          responseBody: result.responseBody,
          responseTimeMs: result.responseTimeMs,
          errorMessage: result.errorMessage,
          updatedAt: deliveryNow,
        })
        .where(eq(psWebhookDeliveries.deliveryId, delivery.deliveryId));

      failed++;
    }
  }

  return { processed: pending.length, succeeded, failed };
}

// ─── Force-retry a specific delivery ──────────────────────────────────────────

export async function retryDelivery(deliveryId: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const [delivery] = await db
    .select()
    .from(psWebhookDeliveries)
    .where(eq(psWebhookDeliveries.deliveryId, deliveryId))
    .limit(1);

  if (!delivery) return false;

  // Reset to pending with immediate retry
  await db
    .update(psWebhookDeliveries)
    .set({
      status: "pending",
      nextRetryAt: Date.now(),
      updatedAt: Date.now(),
    })
    .where(eq(psWebhookDeliveries.deliveryId, deliveryId));

  return true;
}
