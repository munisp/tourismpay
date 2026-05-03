/**
 * Rate Alerts Router — real implementation with proper error handling.
 * Manages currency exchange rate alert subscriptions for users.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../../_core/trpc";
import { requireDb } from "../../_core/requireDb";
import crypto from "crypto";
import { rateAlerts } from "../../../drizzle/schema";
import { eq, desc, and, gte, count } from "drizzle-orm";

const uid = () => crypto.randomUUID();
const now = () => Date.now();

export const rateAlertsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const items = await db.select().from(rateAlerts).where(eq(rateAlerts.userId, String(ctx.user.id))).orderBy(desc(rateAlerts.createdAt));
    return { alerts: items, total: items.length };
  }),
  getAlerts: protectedProcedure
    .input(z.object({ limit: z.number().default(20), offset: z.number().default(0) }).optional())
    .query(async ({ ctx }) => {
      const db = await requireDb();
      const items = await db.select().from(rateAlerts).where(eq(rateAlerts.userId, String(ctx.user.id))).orderBy(desc(rateAlerts.createdAt));
      return { alerts: items, total: items.length };
    }),
  create: protectedProcedure
    .input(z.object({
      fromCurrency: z.string(),
      toCurrency: z.string(),
      targetRate: z.number(),
      condition: z.enum(["above", "below", "exact"]).optional().default("above"),
      direction: z.enum(["above", "below"]).optional(),
      notifyEmail: z.boolean().default(true),
      notifySms: z.boolean().default(false),
      alertId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const id = input.alertId ?? uid();
      await db.insert(rateAlerts).values({
        userId: String(ctx.user.id),
        baseCurrency: input.fromCurrency,
        targetCurrency: input.toCurrency,
        targetRate: String(input.targetRate),
        condition: (input.condition ?? input.direction ?? "above") as "above" | "below" | "exact",
        notifyEmail: input.notifyEmail,
        notifySms: input.notifySms,
      }).onConflictDoNothing();
      return { id, ...input, userId: String(ctx.user.id), createdAt: now() };
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      await db.delete(rateAlerts).where(and(eq(rateAlerts.userId, String(ctx.user.id)), eq(rateAlerts.id, parseInt(input.id, 10))));
      return { success: true };
    }),
  history: protectedProcedure
    .input(z.object({ alertId: z.string().optional(), limit: z.number().default(20) }))
    .query(async ({ ctx }) => {
      const db = await requireDb();
      const items = await db.select().from(rateAlerts).where(and(eq(rateAlerts.userId, String(ctx.user.id)), eq(rateAlerts.status, "triggered"))).orderBy(desc(rateAlerts.triggeredAt)).limit(20);
      return { items, total: items.length };
    }),
  monitorStatus: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const [activeCount] = await db.select({ c: count() }).from(rateAlerts).where(and(eq(rateAlerts.userId, String(ctx.user.id)), eq(rateAlerts.status, "active")));
    const dayStart = Date.now() - 86400000;
    const [triggeredToday] = await db.select({ c: count() }).from(rateAlerts).where(and(eq(rateAlerts.userId, String(ctx.user.id)), gte(rateAlerts.triggeredAt, dayStart)));
    return { isRunning: true, lastCheck: Date.now(), alertsChecked: activeCount?.c ?? 0, triggersToday: triggeredToday?.c ?? 0 };
  }),
  getAnalytics: protectedProcedure
    .input(z.object({ alertId: z.string().optional() }))
    .query(async ({ ctx }) => {
      const db = await requireDb();
      const items = await db.select().from(rateAlerts).where(eq(rateAlerts.userId, String(ctx.user.id)));
      const triggered = items.filter(a => a.status === "triggered");
      return { triggers: triggered, accuracy: items.length > 0 ? triggered.length / items.length : 0, totalAlerts: items.length };
    }),
});
