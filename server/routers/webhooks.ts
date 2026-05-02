/**
 * Webhooks Router
 *
 * Manages webhook endpoints for PaymentSwitch event notifications.
 * Supports full CRUD, test delivery, delivery log viewing, and manual retry.
 */

import crypto from "crypto";
import { z } from "zod";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { drizzle } from "drizzle-orm/postgres-js";
import {
  psWebhooks,
  psWebhookDeliveries,
  type PsWebhook,
} from "../../drizzle/schema";
import {
  enqueueWebhookDelivery,
  retryDelivery,
  attemptDelivery,
} from "../webhookEngine";

type DbInstance = NonNullable<ReturnType<typeof drizzle>>;

async function requireDb(): Promise<DbInstance> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db as DbInstance;
}

// ─── Supported webhook events ─────────────────────────────────────────────────

export const WEBHOOK_EVENTS = [
  "remittance.created",
  "remittance.completed",
  "remittance.failed",
  "remittance.reversed",
  "settlement.created",
  "settlement.completed",
  "fraud.alert",
  "kill_switch.activated",
  "kill_switch.deactivated",
  "participant.suspended",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

// ─── Router ───────────────────────────────────────────────────────────────────

export const webhooksRouter = router({
  /**
   * List all webhooks (optionally filtered by participantId).
   */
  list: protectedProcedure
    .input(
      z.object({
        participantId: z.string().optional(),
        includeInactive: z.boolean().default(false),
      })
    )
    .query(async ({ input }) => {
      const db = await requireDb();
      const conditions = [];

      if (input.participantId) {
        conditions.push(eq(psWebhooks.participantId, input.participantId));
      }
      if (!input.includeInactive) {
        conditions.push(eq(psWebhooks.isActive, true));
      }

      const webhooks = await db
        .select()
        .from(psWebhooks)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(psWebhooks.createdAt));

      // Mask secrets in response
      return webhooks.map((wh: PsWebhook) => ({
        ...wh,
        secret: `${wh.secret.slice(0, 8)}${"*".repeat(24)}`,
        events: wh.events.split(",").map((e: string) => e.trim()),
      }));
    }),

  /**
   * Get a single webhook by webhookId.
   */
  get: protectedProcedure
    .input(z.object({ webhookId: z.string() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const [wh] = await db
        .select()
        .from(psWebhooks)
        .where(eq(psWebhooks.webhookId, input.webhookId))
        .limit(1);

      if (!wh) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Webhook not found" });
      }

      return {
        ...wh,
        secret: `${wh.secret.slice(0, 8)}${"*".repeat(24)}`,
        events: wh.events.split(",").map((e: string) => e.trim()),
      };
    }),

  /**
   * Create a new webhook endpoint.
   */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(3).max(255),
        endpoint: z.string().url().max(2048),
        events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
        participantId: z.string().optional(),
        secret: z.string().min(16).max(128).optional(), // auto-generated if not provided
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const now = Date.now();
      const webhookId = `wh_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
      const secret = input.secret ?? crypto.randomBytes(32).toString("hex");

      await db.insert(psWebhooks).values({
        webhookId,
        name: input.name,
        endpoint: input.endpoint,
        events: input.events.join(","),
        secret,
        isActive: true,
        participantId: input.participantId,
        createdBy: ctx.user.id,
        createdByName: ctx.user.name ?? undefined,
        totalDeliveries: 0,
        failureCount: 0,
        createdAt: now,
        updatedAt: now,
      });

      return {
        webhookId,
        name: input.name,
        endpoint: input.endpoint,
        events: input.events,
        secret, // Return full secret only on creation
        createdAt: now,
      };
    }),

  /**
   * Update a webhook (name, endpoint, events, isActive).
   */
  update: protectedProcedure
    .input(
      z.object({
        webhookId: z.string(),
        name: z.string().min(3).max(255).optional(),
        endpoint: z.string().url().max(2048).optional(),
        events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [existing] = await db
        .select()
        .from(psWebhooks)
        .where(eq(psWebhooks.webhookId, input.webhookId))
        .limit(1);

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Webhook not found" });
      }

      const updates: Partial<typeof psWebhooks.$inferInsert> = {
        updatedAt: Date.now(),
      };
      if (input.name !== undefined) updates.name = input.name;
      if (input.endpoint !== undefined) updates.endpoint = input.endpoint;
      if (input.events !== undefined) updates.events = input.events.join(",");
      if (input.isActive !== undefined) updates.isActive = input.isActive;

      await db
        .update(psWebhooks)
        .set(updates)
        .where(eq(psWebhooks.webhookId, input.webhookId));

      return { success: true, webhookId: input.webhookId };
    }),

  /**
   * Delete a webhook and its delivery history.
   */
  delete: protectedProcedure
    .input(z.object({ webhookId: z.string() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [existing] = await db
        .select()
        .from(psWebhooks)
        .where(eq(psWebhooks.webhookId, input.webhookId))
        .limit(1);

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Webhook not found" });
      }

      // Soft-delete: mark as inactive rather than hard delete
      await db
        .update(psWebhooks)
        .set({ isActive: false, updatedAt: Date.now() })
        .where(eq(psWebhooks.webhookId, input.webhookId));

      return { success: true, webhookId: input.webhookId };
    }),

  /**
   * Send a test event to a webhook endpoint immediately.
   */
  test: protectedProcedure
    .input(
      z.object({
        webhookId: z.string(),
        event: z.enum(WEBHOOK_EVENTS).default("remittance.completed"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const [wh] = await db
        .select()
        .from(psWebhooks)
        .where(eq(psWebhooks.webhookId, input.webhookId))
        .limit(1);

      if (!wh) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Webhook not found" });
      }

      const testPayload = {
        event: input.event,
        webhookId: wh.webhookId,
        timestamp: new Date().toISOString(),
        test: true,
        triggeredBy: ctx.user.name ?? "system",
        data: {
          remittanceId: "rem_test_000000",
          amount: 100.0,
          currency: "USD",
          status: "completed",
          corridor: "USD-NGN",
        },
      };

      const result = await attemptDelivery(
        wh.endpoint,
        wh.secret,
        input.event,
        testPayload
      );

      // Log the test delivery
      const deliveryId = `wdlv_test_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
      const now = Date.now();
      await db.insert(psWebhookDeliveries).values({
        deliveryId,
        webhookId: wh.webhookId,
        event: input.event,
        payload: testPayload,
        status: result.success ? "success" : "failed",
        attempts: 1,
        maxAttempts: 1,
        lastAttemptAt: now,
        responseCode: result.responseCode,
        responseBody: result.responseBody,
        responseTimeMs: result.responseTimeMs,
        errorMessage: result.errorMessage,
        createdAt: now,
        updatedAt: now,
      });

      return {
        success: result.success,
        responseCode: result.responseCode,
        responseTimeMs: result.responseTimeMs,
        errorMessage: result.errorMessage,
        deliveryId,
      };
    }),

  /**
   * Get delivery logs for a webhook.
   */
  getDeliveries: protectedProcedure
    .input(
      z.object({
        webhookId: z.string().optional(),
        status: z
          .enum(["pending", "success", "failed", "retrying", "exhausted"])
          .optional(),
        limit: z.number().min(1).max(200).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const db = await requireDb();
      const conditions = [];

      if (input.webhookId) {
        conditions.push(eq(psWebhookDeliveries.webhookId, input.webhookId));
      }
      if (input.status) {
        conditions.push(eq(psWebhookDeliveries.status, input.status));
      }

      const deliveries = await db
        .select()
        .from(psWebhookDeliveries)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(psWebhookDeliveries.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return deliveries;
    }),

  /**
   * Manually retry a failed/exhausted delivery.
   */
  retryDelivery: protectedProcedure
    .input(z.object({ deliveryId: z.string() }))
    .mutation(async ({ input }) => {
      const success = await retryDelivery(input.deliveryId);
      if (!success) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Delivery not found",
        });
      }
      return { success: true, deliveryId: input.deliveryId };
    }),

  /**
   * Get delivery statistics for a webhook.
   */
  getStats: protectedProcedure
    .input(z.object({ webhookId: z.string() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const deliveries = await db
        .select()
        .from(psWebhookDeliveries)
        .where(eq(psWebhookDeliveries.webhookId, input.webhookId));

      const total = deliveries.length;
      const succeeded = deliveries.filter(
        (d) => d.status === "success"
      ).length;
      const failed = deliveries.filter(
        (d) => d.status === "failed" || d.status === "exhausted"
      ).length;
      const pending = deliveries.filter(
        (d) => d.status === "pending" || d.status === "retrying"
      ).length;

      const avgResponseTime =
        total > 0
          ? deliveries.reduce(
              (sum, d) => sum + (d.responseTimeMs ?? 0),
              0
            ) / total
          : 0;

      const successRate = total > 0 ? (succeeded / total) * 100 : 0;

      // Event breakdown
      const eventCounts: Record<string, number> = {};
      for (const d of deliveries) {
        eventCounts[d.event] = (eventCounts[d.event] ?? 0) + 1;
      }

      return {
        total,
        succeeded,
        failed,
        pending,
        successRate: Math.round(successRate * 10) / 10,
        avgResponseTimeMs: Math.round(avgResponseTime),
        eventBreakdown: Object.entries(eventCounts).map(([event, count]) => ({
          event,
          count,
        })),
      };
    }),

  /**
   * Rotate the secret for a webhook.
   */
  rotateSecret: protectedProcedure
    .input(z.object({ webhookId: z.string() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [existing] = await db
        .select()
        .from(psWebhooks)
        .where(eq(psWebhooks.webhookId, input.webhookId))
        .limit(1);

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Webhook not found" });
      }

      const newSecret = crypto.randomBytes(32).toString("hex");
      await db
        .update(psWebhooks)
        .set({ secret: newSecret, updatedAt: Date.now() })
        .where(eq(psWebhooks.webhookId, input.webhookId));

      return {
        success: true,
        webhookId: input.webhookId,
        newSecret, // Return full secret only on rotation
      };
    }),

  /**
   * Get all exhausted deliveries (dead-letter queue) — deliveries that have
   * exceeded max_attempts and will no longer be retried automatically.
   */
  getExhaustedDeliveries: protectedProcedure
    .input(
      z.object({
        webhookId: z.string().optional(),
        event: z.string().optional(),
        limit: z.number().min(1).max(200).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const db = await requireDb();
      const conditions = [eq(psWebhookDeliveries.status, "exhausted")];
      if (input.webhookId) conditions.push(eq(psWebhookDeliveries.webhookId, input.webhookId));
      if (input.event) conditions.push(eq(psWebhookDeliveries.event, input.event));
      const [deliveries, [{ total }]] = await Promise.all([
        db
          .select()
          .from(psWebhookDeliveries)
          .where(and(...conditions))
          .orderBy(desc(psWebhookDeliveries.updatedAt))
          .limit(input.limit)
          .offset(input.offset),
        db
          .select({ total: count() })
          .from(psWebhookDeliveries)
          .where(and(...conditions)),
      ]);
      return { items: deliveries, total: Number(total) };
    }),

  /**
   * Re-queue an exhausted delivery — resets its status to 'pending',
   * clears the attempt counter, and schedules it for immediate retry.
   */
  requeueDelivery: protectedProcedure
    .input(z.object({ deliveryId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [delivery] = await db
        .select()
        .from(psWebhookDeliveries)
        .where(eq(psWebhookDeliveries.deliveryId, input.deliveryId))
        .limit(1);
      if (!delivery) throw new TRPCError({ code: "NOT_FOUND", message: "Delivery not found" });
      if (delivery.status !== "exhausted" && delivery.status !== "failed") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only exhausted or failed deliveries can be re-queued" });
      }
      await db
        .update(psWebhookDeliveries)
        .set({
          status: "pending",
          attempts: 0,
          nextRetryAt: Date.now(),
          errorMessage: null,
          updatedAt: Date.now(),
        })
        .where(eq(psWebhookDeliveries.deliveryId, input.deliveryId));
      // Trigger an immediate retry via the engine (handles endpoint lookup internally)
      retryDelivery(input.deliveryId).catch(() => null);
      return { success: true };
    }),

  /**
   * Bulk re-queue multiple exhausted/failed deliveries at once.
   */
  bulkRequeue: protectedProcedure
    .input(
      z.object({
        deliveryIds: z.array(z.string().min(1)).min(1).max(100),
      })
    )
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const deliveries = await db
        .select({ deliveryId: psWebhookDeliveries.deliveryId, status: psWebhookDeliveries.status })
        .from(psWebhookDeliveries)
        .where(inArray(psWebhookDeliveries.deliveryId, input.deliveryIds));
      const requeued: string[] = [];
      const skipped: string[] = [];
      for (const d of deliveries) {
        if (d.status !== "exhausted" && d.status !== "failed") {
          skipped.push(d.deliveryId);
          continue;
        }
        await db
          .update(psWebhookDeliveries)
          .set({
            status: "pending",
            attempts: 0,
            nextRetryAt: Date.now(),
            errorMessage: null,
            updatedAt: Date.now(),
          })
          .where(eq(psWebhookDeliveries.deliveryId, d.deliveryId));
        retryDelivery(d.deliveryId).catch(() => null);
        requeued.push(d.deliveryId);
      }
      return { requeued: requeued.length, skipped: skipped.length };
    }),

  /**
   * Get available webhook event types.
   */
  getEventTypes: protectedProcedure.query(() => {
    return WEBHOOK_EVENTS.map((event) => ({
      event,
      description: EVENT_DESCRIPTIONS[event] ?? event,
    }));
  }),
});

// ─── Event descriptions ───────────────────────────────────────────────────────

const EVENT_DESCRIPTIONS: Record<string, string> = {
  "remittance.created": "Fired when a new remittance is initiated",
  "remittance.completed": "Fired when a remittance is successfully completed",
  "remittance.failed": "Fired when a remittance fails",
  "remittance.reversed": "Fired when a remittance is reversed",
  "settlement.created": "Fired when a new settlement batch is initiated",
  "settlement.completed": "Fired when a settlement batch is completed",
  "fraud.alert": "Fired when a fraud rule triggers on a transaction",
  "kill_switch.activated": "Fired when a corridor kill switch is activated",
  "kill_switch.deactivated": "Fired when a corridor kill switch is deactivated",
  "participant.suspended": "Fired when a participant is suspended",
};
