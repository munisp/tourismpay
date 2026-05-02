/**
 * Web Push helper — sends real browser push notifications via VAPID.
 * Uses the `web-push` npm package with keys from ENV.
 *
 * Usage:
 *   import { sendPushNotification, sendPushToUser } from "./_core/webPush";
 *   await sendPushToUser(userId, { title: "Payment received", body: "₦5,000 from Tourist" });
 */
import webpush from "web-push";
import { ENV } from "./env";
import { getDb } from "../db";
import { pushSubscriptions } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

// ─── VAPID setup ──────────────────────────────────────────────────────────────

let vapidConfigured = false;

function ensureVapid() {
  if (vapidConfigured) return;
  if (!ENV.vapidPublicKey || !ENV.vapidPrivateKey) {
    console.warn("[WebPush] VAPID keys not configured — push notifications disabled");
    return;
  }
  webpush.setVapidDetails(ENV.vapidEmail, ENV.vapidPublicKey, ENV.vapidPrivateKey);
  vapidConfigured = true;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

// ─── Core send function ───────────────────────────────────────────────────────

/**
 * Send a push notification to a single subscription endpoint.
 * Returns true on success, false on failure (expired subscriptions are cleaned up).
 */
export async function sendPushNotification(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload
): Promise<boolean> {
  ensureVapid();
  if (!vapidConfigured) return false;

  const pushSubscription = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.p256dh,
      auth: subscription.auth,
    },
  };

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon ?? "/icons/pwa-192.png",
    badge: payload.badge ?? "/icons/pwa-192.png",
    url: payload.url ?? "/",
    tag: payload.tag ?? "tourismpay-notification",
    data: payload.data ?? {},
  });

  try {
    await webpush.sendNotification(pushSubscription, body);
    return true;
  } catch (err: any) {
    // 410 Gone = subscription expired/unsubscribed — clean up DB
    if (err?.statusCode === 410 || err?.statusCode === 404) {
      console.log(`[WebPush] Subscription expired, removing: ${subscription.endpoint.slice(0, 60)}…`);
      const db = await getDb();
      if (db) {
        await db
          .delete(pushSubscriptions)
          .where(eq(pushSubscriptions.endpoint, subscription.endpoint));
      }
    } else {
      console.error("[WebPush] Send error:", err?.message ?? err);
    }
    return false;
  }
}

// ─── Send to all subscriptions for a user ────────────────────────────────────

/**
 * Send a push notification to ALL active subscriptions for a given userId.
 * Returns the number of successful deliveries.
 */
export async function sendPushToUser(userId: number, payload: PushPayload): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const subs = await db
    .select({
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

  if (subs.length === 0) return 0;

  const results = await Promise.allSettled(
    subs.map((sub) => sendPushNotification(sub, payload))
  );

  return results.filter((r) => r.status === "fulfilled" && r.value === true).length;
}

// ─── Expose VAPID public key for frontend ────────────────────────────────────

export function getVapidPublicKey(): string {
  return ENV.vapidPublicKey;
}
