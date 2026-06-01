/**
 * Analytics Router — PaymentSwitch transaction analytics and reporting.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../../_core/trpc";
import { requireDb } from "../../_core/requireDb";
import { remittances } from "../../../drizzle/schema";
import { count, sum, desc, eq, gte, and, sql } from "drizzle-orm";

const PERIOD_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90, "1y": 365 };

export const analyticsRouter = router({
  getOverview: protectedProcedure
    .input(z.object({ period: z.enum(["7d", "30d", "90d", "1y"]).default("30d") }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const days = PERIOD_DAYS[input.period] ?? 30;
      const cutoff = Date.now() - days * 86400000;
      const prevCutoff = Date.now() - days * 2 * 86400000;

      const [stats] = await db.select({
        totalTransactions: count(),
        totalVolume: sum(remittances.senderAmount),
        completedCount: sql<number>`COUNT(*) FILTER (WHERE ${remittances.status} IN ('completed', 'processing'))`,
      }).from(remittances).where(gte(remittances.createdAt, cutoff));

      const [prevStats] = await db.select({
        prevTransactions: count(),
        prevVolume: sum(remittances.senderAmount),
      }).from(remittances).where(and(gte(remittances.createdAt, prevCutoff), sql`${remittances.createdAt} < ${cutoff}`));

      const totalTx = Number(stats.totalTransactions ?? 0);
      const totalVol = Number(stats.totalVolume ?? 0);
      const completed = Number(stats.completedCount ?? 0);
      const prevTx = Number(prevStats.prevTransactions ?? 0);
      const prevVol = Number(prevStats.prevVolume ?? 0);

      const successRate = totalTx > 0 ? Math.round((completed / totalTx) * 100) : 0;
      const avgValue = totalTx > 0 ? Math.round((totalVol / totalTx) * 100) / 100 : 0;
      const txGrowth = prevTx > 0 ? Math.round(((totalTx - prevTx) / prevTx) * 100) : 0;
      const volGrowth = prevVol > 0 ? Math.round(((totalVol - prevVol) / prevVol) * 100) : 0;

      return { totalTransactions: totalTx, totalVolume: totalVol, successRate, averageValue: avgValue, growth: { transactions: txGrowth, volume: volGrowth } };
    }),
  getVolumeChart: protectedProcedure
    .input(z.object({ period: z.string().default("30d"), granularity: z.enum(["hour", "day", "week", "month"]).default("day") }))
    .query(async () => ({ data: [] as { date: string; volume: number; count: number }[] })),
  getRevenueChart: protectedProcedure
    .input(z.object({ period: z.string().default("30d") }))
    .query(async () => ({ data: [] as { date: string; revenue: number }[] })),
  getTopCorridors: protectedProcedure
    .input(z.object({ period: z.string().default("30d"), limit: z.number().default(10) }))
    .query(async () => {
      const db = await requireDb();
      const corridors = await db.select({ from: remittances.senderCurrency, to: remittances.recipientCurrency, volume: sum(remittances.senderAmount), txCount: count() }).from(remittances).groupBy(remittances.senderCurrency, remittances.recipientCurrency).orderBy(desc(sum(remittances.senderAmount))).limit(10);
      return { corridors: corridors.map(c => ({ from: c.from, to: c.to, volume: Number(c.volume ?? 0), count: Number(c.txCount) })) };
    }),
  getPaymentMethods: protectedProcedure
    .input(z.object({ period: z.string().default("30d") }))
    .query(async () => {
      const db = await requireDb();
      const [total] = await db.select({ cnt: count() }).from(remittances);
      const rows = await db.select({ method: remittances.deliveryOption, count: count(), volume: sum(remittances.senderAmount) }).from(remittances).groupBy(remittances.deliveryOption);
      const totalCount = Number(total.cnt);
      return { methods: rows.map(r => ({ method: r.method ?? "unknown", count: Number(r.count), volume: Number(r.volume ?? 0), percentage: totalCount > 0 ? Math.round(Number(r.count) / totalCount * 100) : 0 })) };
    }),
  exportSummaryCSV: protectedProcedure.input(z.object({ period: z.string().default("30d") })).mutation(async () => ({ downloadUrl: null, message: "Export not yet available" })),
  exportVolumeCSV: protectedProcedure.input(z.object({ period: z.string().default("30d") })).mutation(async () => ({ downloadUrl: null, message: "Export not yet available" })),
  exportRevenueCSV: protectedProcedure.input(z.object({ period: z.string().default("30d") })).mutation(async () => ({ downloadUrl: null, message: "Export not yet available" })),
  exportPaymentMethodsCSV: protectedProcedure.input(z.object({ period: z.string().default("30d") })).mutation(async () => ({ downloadUrl: null, message: "Export not yet available" })),
});
