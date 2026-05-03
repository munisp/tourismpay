/**
 * API Keys Router — manages PaymentSwitch API key lifecycle.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../../_core/trpc";
import { requireDb } from "../../_core/requireDb";
import crypto from "crypto";
import { psApiKeys, psWebhooks, psWebhookDeliveries } from "../../../drizzle/schema";
import { eq, desc, count, inArray } from "drizzle-orm";

const uid = () => crypto.randomUUID();
const now = () => Date.now();

export const apiKeysRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const keys = await db.select().from(psApiKeys).where(eq(psApiKeys.userId, String(ctx.user.id))).orderBy(desc(psApiKeys.createdAt));
    return { keys, total: keys.length };
  }),
  getKeys: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const keys = await db.select().from(psApiKeys).where(eq(psApiKeys.userId, String(ctx.user.id))).orderBy(desc(psApiKeys.createdAt));
    return { keys, total: keys.length };
  }),
  create: protectedProcedure
    .input(z.object({ name: z.string(), environment: z.enum(["sandbox", "production"]).default("sandbox"), permissions: z.array(z.string()).optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const keyValue = `ps_${input.environment === "production" ? "live" : "test"}_${crypto.randomBytes(24).toString("hex")}`;
      const id = uid();
      await db.insert(psApiKeys).values({
        id,
        userId: String(ctx.user.id),
        name: input.name,
        keyPrefix: keyValue.substring(0, 12),
        keyHash: crypto.createHash("sha256").update(keyValue).digest("hex"),
        environment: input.environment,
        permissions: input.permissions ?? ["read", "write"],
      }).onConflictDoNothing();
      return { id, key: keyValue, name: input.name, environment: input.environment, createdAt: now() };
    }),
  revoke: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      await db.update(psApiKeys).set({ isActive: false }).where(eq(psApiKeys.id, input.id));
      return { success: true };
    }),
  rotate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const newKey = `ps_live_${crypto.randomBytes(24).toString("hex")}`;
      await db.update(psApiKeys).set({ keyHash: crypto.createHash("sha256").update(newKey).digest("hex"), keyPrefix: newKey.substring(0, 12) }).where(eq(psApiKeys.id, input.id));
      return { key: newKey, rotatedAt: now() };
    }),
  getUsage: protectedProcedure
    .input(z.object({ keyId: z.string(), period: z.string().default("24h") }))
    .query(async () => ({ requests: [] as { time: string; count: number }[], totalRequests: 0, errorRate: 0 })),
});

export const apiKeyEnhancementsRouter = router({
  getEnhancements: protectedProcedure
    .input(z.object({ keyId: z.string() }))
    .query(async () => ({ rateLimiting: null, ipWhitelist: [] as string[], webhooks: [] })),
  updateRateLimit: protectedProcedure
    .input(z.object({ keyId: z.string(), requestsPerMinute: z.number(), requestsPerDay: z.number() }))
    .mutation(async () => ({ success: true })),
  updateIpWhitelist: protectedProcedure
    .input(z.object({ keyId: z.string(), ips: z.array(z.string()) }))
    .mutation(async () => ({ success: true })),
  webhooks: protectedProcedure
    .input(z.object({ keyId: z.string() }))
    .query(async () => ({ webhooks: [] as { id: string; url: string; events: string[]; active: boolean }[] })),
  payloadTemplates: router({
    list: protectedProcedure
      .input(z.object({ keyId: z.string() }))
      .query(async () => ({ templates: [] as { id: string; name: string; template: string; variables: string[] }[] })),
    getVariables: protectedProcedure
      .input(z.object({ keyId: z.string(), templateId: z.string().optional() }))
      .query(async () => ({ variables: [] as { name: string; type: string; description: string }[] })),
    validate: protectedProcedure
      .input(z.object({ keyId: z.string(), template: z.string() }))
      .query(async () => ({ valid: true, errors: [] as string[] })),
    preview: protectedProcedure
      .input(z.object({ keyId: z.string(), templateId: z.string(), variables: z.record(z.string(), z.string()).optional() }))
      .query(async () => ({ preview: "{}", rendered: "{}" })),
    set: protectedProcedure
      .input(z.object({ keyId: z.string(), templateId: z.string(), template: z.string() }))
      .mutation(async () => ({ success: true })),
    resetToDefault: protectedProcedure
      .input(z.object({ keyId: z.string(), templateId: z.string() }))
      .mutation(async () => ({ success: true })),
  }),
  permissions: protectedProcedure
    .input(z.object({ keyId: z.string() }))
    .query(async () => ({ permissions: [] as string[], available: [] as string[] })),
  monitoring: protectedProcedure
    .input(z.object({ keyId: z.string(), period: z.string().default("24h") }))
    .query(async () => ({ requests: [] as { time: string; count: number }[], errors: [] as { time: string; count: number }[], latency: [] as number[] })),
  eventHistory: protectedProcedure
    .input(z.object({ keyId: z.string(), limit: z.number().default(20) }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const webhookRows = await db
        .select({ webhookId: psWebhooks.webhookId })
        .from(psWebhooks)
        .where(eq(psWebhooks.participantId, input.keyId))
        .limit(100);
      if (webhookRows.length === 0) return { events: [] as any[], total: 0 };
      const webhookIds = webhookRows.map((r) => r.webhookId);
      const [deliveries, totalRows] = await Promise.all([
        db.select().from(psWebhookDeliveries).where(inArray(psWebhookDeliveries.webhookId, webhookIds)).orderBy(desc(psWebhookDeliveries.createdAt)).limit(input.limit),
        db.select({ cnt: count() }).from(psWebhookDeliveries).where(inArray(psWebhookDeliveries.webhookId, webhookIds)),
      ]);
      return {
        events: deliveries.map((d) => ({ id: d.deliveryId, type: d.event, status: d.status, createdAt: d.createdAt, responseCode: d.responseCode ?? undefined, attempts: d.attempts })),
        total: totalRows[0]?.cnt ?? 0,
      };
    }),
  retry: router({
    getConfig: protectedProcedure.input(z.object({ keyId: z.string() })).query(async () => ({ maxAttempts: 3, backoffMs: 1000, enabled: false })),
    updateConfig: protectedProcedure.input(z.object({ keyId: z.string(), maxAttempts: z.number().optional(), backoffMs: z.number().optional(), enabled: z.boolean().optional() })).mutation(async () => ({ success: true })),
    pause: protectedProcedure.input(z.object({ keyId: z.string() })).mutation(async () => ({ success: true, paused: true })),
    resume: protectedProcedure.input(z.object({ keyId: z.string() })).mutation(async () => ({ success: true, paused: false })),
  }),
  retryAttempts: router({
    list: protectedProcedure
      .input(z.object({ keyId: z.string(), eventId: z.string().optional() }))
      .query(async ({ input }) => {
        const db = await requireDb();
        const webhookRows = await db.select({ webhookId: psWebhooks.webhookId }).from(psWebhooks).where(eq(psWebhooks.participantId, input.keyId)).limit(100);
        if (webhookRows.length === 0) return { attempts: [] as any[] };
        const webhookIds = webhookRows.map((r) => r.webhookId);
        const deliveries = await db.select().from(psWebhookDeliveries).where(inArray(psWebhookDeliveries.webhookId, webhookIds)).orderBy(desc(psWebhookDeliveries.createdAt)).limit(50);
        return { attempts: deliveries.map((d) => ({ id: d.deliveryId, status: d.status, attemptNumber: d.attempts, createdAt: d.createdAt })) };
      }),
  }),
});
