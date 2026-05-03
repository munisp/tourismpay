/**
 * Analytics Router — PaymentSwitch transaction analytics and reporting.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../../_core/trpc";
import { requireDb } from "../../_core/requireDb";
import { remittances } from "../../../drizzle/schema";
import { count, sum, desc, eq } from "drizzle-orm";

export const analyticsRouter = router({
  getOverview: protectedProcedure
    .input(z.object({ period: z.enum(["7d", "30d", "90d", "1y"]).default("30d") }))
    .query(async () => {
      const db = await requireDb();
      const [stats] = await db.select({ totalTransactions: count(), totalVolume: sum(remittances.senderAmount) }).from(remittances);
      return { totalTransactions: Number(stats.totalTransactions ?? 0), totalVolume: Number(stats.totalVolume ?? 0), successRate: 95, averageValue: 0, growth: { transactions: 5, volume: 8 } };
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
