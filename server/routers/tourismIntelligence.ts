import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";

export const tourismIntelligenceRouter = router({
  // Get latest intelligence snapshot
  getLatestSnapshot: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const rows = await db.execute(sql`SELECT * FROM tourism_intelligence_snapshots ORDER BY snapshot_date DESC LIMIT 1`);
    if (!(rows as any[]).length) return null;
    return (rows as any[])[0];
  }),

  // Get historical snapshots for charting
  getHistory: adminProcedure
    .input(z.object({ periodType: z.enum(["daily", "weekly", "monthly"]).default("daily"), limit: z.number().default(30) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db.execute(sql`
        SELECT * FROM tourism_intelligence_snapshots
        WHERE period_type = ${input.periodType}
        ORDER BY snapshot_date DESC LIMIT ${input.limit}
      `);
      return (rows as any[]).reverse();
    }),

  // Generate a new snapshot (called by cron job or manually)
  generateSnapshot: adminProcedure
    .input(z.object({ periodType: z.enum(["daily", "weekly", "monthly"]).default("daily") }))
    .mutation(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const snapshotId = `TI-${Date.now()}`;
      const now = new Date();
      // Aggregate real data from wallet transactions, establishments, users
      const walletStats = await db.execute(sql`
        SELECT COUNT(DISTINCT user_id) as active_wallets,
          SUM(CASE WHEN currency = 'NGN' THEN amount ELSE 0 END) as total_spend_ngn,
          SUM(CASE WHEN currency = 'USD' THEN amount ELSE 0 END) as fx_inflow_usd
        FROM wallet_transactions WHERE created_at > NOW() - INTERVAL '1 day' AND type = 'payment'
      `);
      const newUsers = await db.execute(sql`SELECT COUNT(*) as count FROM users WHERE created_at > NOW() - INTERVAL '1 day' AND role = 'tourist'`);
      const ws = (walletStats as any[])[0] ?? {};
      const totalSpend = Number(ws.total_spend_ngn ?? 0);
      const fxInflow = Number(ws.fx_inflow_usd ?? 0);
      const activeWallets = Number(ws.active_wallets ?? 0);
      const newReg = Number((newUsers as any[])[0]?.count ?? 0);
      await db.execute(sql`
        INSERT INTO tourism_intelligence_snapshots (id, snapshot_date, period_type, total_arrivals,
          total_spend_ngn, fx_inflow_usd, active_wallets, new_registrations, created_at)
        VALUES (${snapshotId}, ${now.toISOString()}, ${input.periodType}, ${newReg},
          ${totalSpend}, ${fxInflow}, ${activeWallets}, ${newReg}, NOW())
        ON CONFLICT (snapshot_date, period_type) DO UPDATE SET
          total_spend_ngn = EXCLUDED.total_spend_ngn, fx_inflow_usd = EXCLUDED.fx_inflow_usd,
          active_wallets = EXCLUDED.active_wallets, new_registrations = EXCLUDED.new_registrations
      `);
      return { snapshotId, totalSpendNgn: totalSpend, fxInflowUsd: fxInflow, activeWallets, newRegistrations: newReg };
    }),

  // CBN FX report (for regulatory submission)
  getCBNReport: adminProcedure
    .input(z.object({ month: z.number().int().min(1).max(12), year: z.number().int().min(2024) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const startDate = new Date(input.year, input.month - 1, 1);
      const endDate = new Date(input.year, input.month, 0);
      const rows = await db.execute(sql`
        SELECT SUM(total_spend_ngn) as total_spend, SUM(fx_inflow_usd) as fx_inflow,
          SUM(active_wallets) as active_wallets, SUM(new_registrations) as new_tourists
        FROM tourism_intelligence_snapshots
        WHERE snapshot_date >= ${startDate.toISOString()} AND snapshot_date <= ${endDate.toISOString()}
          AND period_type = 'daily'
      `);
      const r = (rows as any[])[0] ?? {};
      return {
        reportPeriod: `${input.year}-${String(input.month).padStart(2, "0")}`,
        totalTourismSpendNgn: Number(r.total_spend ?? 0),
        totalFxInflowUsd: Number(r.fx_inflow ?? 0),
        activeWallets: Number(r.active_wallets ?? 0),
        newTouristRegistrations: Number(r.new_tourists ?? 0),
        generatedAt: new Date().toISOString(),
        submittedToCBN: false,
      };
    }),
});
