/**
 * Push Notifications Router
 * Manages Web Push API subscriptions and sends real VAPID-signed push messages.
 *
 * Procedures:
 *   push.subscribe        — save a browser push subscription
 *   push.unsubscribe      — remove a subscription
 *   push.status           — check if current user has active subscriptions
 *   push.vapidPublicKey   — return the VAPID public key for frontend use
 *   push.sendTest         — send a test push to the current user (dev/debug)
 */
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { pushSubscriptions } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { sendPushToUser, getVapidPublicKey } from "../_core/webPush";

export const pushRouter = router({
  /** Return the VAPID public key so the frontend can create a PushSubscription */
  vapidPublicKey: publicProcedure.query(() => {
    return { publicKey: getVapidPublicKey() };
  }),

  /** Save a Web Push subscription for the current user */
  subscribe: protectedProcedure
    .input(
      z.object({
        endpoint: z.string().url(),
        p256dh: z.string(),
        auth: z.string(),
        userAgent: z.string().max(512).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      // Upsert by endpoint (one subscription per browser/device)
      const existing = await db
        .select({ id: pushSubscriptions.id })
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, input.endpoint))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(pushSubscriptions)
          .set({
            userId: ctx.user.id,
            p256dh: input.p256dh,
            auth: input.auth,
            userAgent: input.userAgent ?? null,
            updatedAt: new Date(),
          })
          .where(eq(pushSubscriptions.endpoint, input.endpoint));
      } else {
        await db.insert(pushSubscriptions).values({
          userId: ctx.user.id,
          endpoint: input.endpoint,
          p256dh: input.p256dh,
          auth: input.auth,
          userAgent: input.userAgent ?? null,
        });
      }

      // Send a welcome push to confirm the subscription works
      sendPushToUser(ctx.user.id, {
        title: "TourismPay Notifications Enabled",
        body: "You will now receive payment and activity alerts.",
        url: "/",
        tag: "welcome",
      }).catch(() => {/* non-critical */});

      return { subscribed: true };
    }),

  /** Remove a Web Push subscription */
  unsubscribe: protectedProcedure
    .input(z.object({ endpoint: z.string().url() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      await db
        .delete(pushSubscriptions)
        .where(
          and(
            eq(pushSubscriptions.endpoint, input.endpoint),
            eq(pushSubscriptions.userId, ctx.user.id)
          )
        );

      return { unsubscribed: true };
    }),

  /** Check if current user has an active push subscription */
  status: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { subscribed: false, count: 0 };

    const subs = await db
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, ctx.user.id));

    return { subscribed: subs.length > 0, count: subs.length };
  }),

  /** Send a test push notification to the current user (useful for debugging) */
  sendTest: protectedProcedure.mutation(async ({ ctx }) => {
    const sent = await sendPushToUser(ctx.user.id, {
      title: "Test Notification",
      body: "Your TourismPay push notifications are working correctly.",
      url: "/",
      tag: "test",
    });
    return {
      sent,
      message: sent > 0 ? `Delivered to ${sent} device(s)` : "No active subscriptions found",
    };
  }),
});
