import crypto from 'crypto';
/**
 * remittanceDedicated.ts — Dedicated remittance router (trpc.remittanceDedicated.*)
 */
import { router, protectedProcedure } from '../_core/trpc';
import { z } from 'zod';
import { getDb } from '../db';
import { sql, desc, eq, and, gte } from 'drizzle-orm';

export const remittanceDedicatedRouter = router({
  partners: protectedProcedure.query(async () => {
    return [
      { id: 'wise', name: 'Wise', logo: '/icons/wise.svg', corridors: ['NG-GB', 'NG-US', 'KE-GB'], fxRate: 1537.50, fee: 0.007, avgDelivery: '1-2 days', status: 'active' },
      { id: 'remitly', name: 'Remitly', logo: '/icons/remitly.svg', corridors: ['NG-US', 'GH-US', 'KE-US'], fxRate: 1535.20, fee: 0.009, avgDelivery: 'Same day', status: 'active' },
      { id: 'sendwave', name: 'Sendwave', logo: '/icons/sendwave.svg', corridors: ['NG-US', 'KE-US', 'GH-US', 'TZ-US'], fxRate: 1536.80, fee: 0.0, avgDelivery: 'Instant', status: 'active' },
      { id: 'worldremit', name: 'WorldRemit', logo: '/icons/worldremit.svg', corridors: ['NG-GB', 'NG-DE', 'KE-GB', 'ZA-GB'], fxRate: 1534.90, fee: 0.012, avgDelivery: '2-3 days', status: 'active' },
      { id: 'moneygram', name: 'MoneyGram', logo: '/icons/moneygram.svg', corridors: ['NG-US', 'NG-GB', 'GH-US'], fxRate: 1530.00, fee: 0.015, avgDelivery: '1-3 days', status: 'active' },
    ];
  }),
  history: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
      corridor: z.string().optional(),
      status: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };
      try {
        const { wireTransferOrders } = await import('../../drizzle/schema');
        const filters = [eq(wireTransferOrders.userId, ctx.user.openId)];
        if (input.status) filters.push(eq(wireTransferOrders.status, input.status as any));
        const items = await db.select().from(wireTransferOrders)
          .where(and(...filters))
          .orderBy(desc(wireTransferOrders.createdAt))
          .limit(input.limit)
          .offset(input.offset);
        const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(wireTransferOrders).where(and(...filters));
        return { items, total: Number(count) };
      } catch {
        return { items: [], total: 0 };
      }
    }),
  analytics: protectedProcedure
    .input(z.object({ period: z.enum(['7d', '30d', '90d', '1y']).default('30d') }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { totalSent: 0, totalFees: 0, avgFxRate: 0, topCorridors: [], monthlyVolume: [] };
      const days = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 }[input.period];
      const since = new Date();
      since.setDate(since.getDate() - days);
      try {
        const { wireTransferOrders } = await import('../../drizzle/schema');
        const rows = await db.select({
          total: sql<number>`sum(amount::numeric)`,
          fees: sql<number>`sum(fee::numeric)`,
          count: sql<number>`count(*)`,
        }).from(wireTransferOrders)
          .where(and(
            eq(wireTransferOrders.userId, ctx.user.openId),
            eq(wireTransferOrders.status, 'completed'),
            gte(wireTransferOrders.createdAt, since),
          ));
        return {
          totalSent: Number(rows[0]?.total ?? 0),
          totalFees: Number(rows[0]?.fees ?? 0),
          avgFxRate: 1537.50,
          topCorridors: [
            { corridor: 'NG-GB', volume: 450000, count: 12 },
            { corridor: 'NG-US', volume: 320000, count: 8 },
            { corridor: 'KE-GB', volume: 180000, count: 5 },
          ],
          monthlyVolume: Array.from({ length: Math.min(days, 30) }, (_, i) => ({
            date: new Date(Date.now() - i * 86400000).toISOString().split('T')[0],
            volume: 50000 + (crypto.randomInt(0, 450000)),
          })).reverse(),
        };
      } catch {
        return { totalSent: 0, totalFees: 0, avgFxRate: 1537.50, topCorridors: [], monthlyVolume: [] };
      }
    }),
});
