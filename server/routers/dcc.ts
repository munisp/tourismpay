import { z } from "zod";
import { protectedProcedure, merchantProcedure, adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { cacheGet, cacheSet } from "../_core/redis";

const SPREAD_PCT = 3.0; // 3% DCC spread revenue

export const dccRouter = router({
  // Get DCC quote: show tourist the amount in their home currency
  getQuote: protectedProcedure
    .input(z.object({
      amountNgn: z.number().positive(),
      homeCurrency: z.string().length(3),
    }))
    .query(async ({ input }) => {
      const cacheKey = `dcc:rate:NGN:${input.homeCurrency}`;
      let rate: number | null = null;
      const cached = await cacheGet(cacheKey);
      if (cached) {
        rate = parseFloat(cached);
      } else {
        // Fetch live rate from exchange rate table
        const db = await getDb();
        if (db) {
          const rows = await db.execute(sql`
            SELECT rate FROM exchange_rate_overrides
            WHERE from_currency = 'NGN' AND to_currency = ${input.homeCurrency} AND is_active = true
            ORDER BY updated_at DESC LIMIT 1
          `);
          if ((rows as any[]).length) {
            rate = parseFloat((rows as any[])[0].rate);
            await cacheSet(cacheKey, String(rate), 300); // cache 5 min
          }
        }
      }
      if (!rate || rate <= 0) {
        // Fallback approximate rates
        const fallbackRates: Record<string, number> = { USD: 0.00065, GBP: 0.00051, EUR: 0.00059, CAD: 0.00088, AUD: 0.00098 };
        rate = fallbackRates[input.homeCurrency] ?? 0.00065;
      }
      const spreadRate = rate * (1 - SPREAD_PCT / 100);
      const convertedAmount = input.amountNgn * spreadRate;
      const spreadRevenueNgn = input.amountNgn * (SPREAD_PCT / 100);
      return {
        amountNgn: input.amountNgn, homeCurrency: input.homeCurrency,
        convertedAmount: Math.round(convertedAmount * 100) / 100,
        exchangeRate: spreadRate, marketRate: rate, spreadPct: SPREAD_PCT,
        spreadRevenueNgn: Math.round(spreadRevenueNgn * 100) / 100,
        quoteExpiresIn: 60, // seconds
      };
    }),

  // Record DCC decision (accepted or declined)
  recordDecision: merchantProcedure
    .input(z.object({
      merchantId: z.string(),
      amountNgn: z.number().positive(),
      convertedAmount: z.number().positive(),
      homeCurrency: z.string().length(3),
      exchangeRate: z.number().positive(),
      spreadRevenueNgn: z.number().positive(),
      decision: z.enum(["accepted", "declined"]),
      walletTransactionId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const txId = `DCC-${Date.now()}`;
      await db.execute(sql`
        INSERT INTO dcc_transactions (id, merchant_id, original_amount_ngn, converted_amount, home_currency,
          exchange_rate, spread_pct, spread_revenue_ngn, decision, wallet_transaction_id, created_at, decided_at)
        VALUES (${txId}, ${input.merchantId}, ${input.amountNgn}, ${input.convertedAmount},
          ${input.homeCurrency}, ${input.exchangeRate}, ${SPREAD_PCT}, ${input.spreadRevenueNgn},
          ${input.decision}, ${input.walletTransactionId ?? null}, NOW(), NOW())
      `);
      return { transactionId: txId, decision: input.decision, message: input.decision === "accepted" ? `Tourist charged ${input.homeCurrency} ${input.convertedAmount.toFixed(2)}` : "Tourist chose to pay in NGN" };
    }),

  // Merchant: DCC analytics
  merchantAnalytics: merchantProcedure
    .input(z.object({ merchantId: z.string(), days: z.number().default(30) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { totalTransactions: 0, acceptanceRate: 0, totalSpreadRevenueNgn: 0, topCurrencies: [] };
      const rows = await db.execute(sql`
        SELECT COUNT(*) as total, SUM(CASE WHEN decision = 'accepted' THEN 1 ELSE 0 END) as accepted,
          SUM(CASE WHEN decision = 'accepted' THEN spread_revenue_ngn ELSE 0 END) as spread_revenue,
          home_currency, COUNT(*) as currency_count
        FROM dcc_transactions WHERE merchant_id = ${input.merchantId}
          AND created_at > NOW() - INTERVAL '${sql.raw(String(input.days))} days'
        GROUP BY home_currency ORDER BY currency_count DESC
      `);
      const total = (rows as any[]).reduce((s, r) => s + Number(r.total), 0);
      const accepted = (rows as any[]).reduce((s, r) => s + Number(r.accepted), 0);
      const spreadRevenue = (rows as any[]).reduce((s, r) => s + Number(r.spread_revenue), 0);
      return {
        totalTransactions: total, acceptanceRate: total > 0 ? Math.round((accepted / total) * 100) : 0,
        totalSpreadRevenueNgn: Math.round(spreadRevenue * 100) / 100,
        topCurrencies: (rows as any[]).map(r => ({ currency: r.home_currency, count: Number(r.currency_count) })),
      };
    }),

  // Admin: platform-wide DCC stats
  platformStats: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { totalTransactions: 0, totalSpreadRevenueNgn: 0, acceptanceRate: 0 };
    const rows = await db.execute(sql`
      SELECT COUNT(*) as total, SUM(CASE WHEN decision = 'accepted' THEN 1 ELSE 0 END) as accepted,
        SUM(CASE WHEN decision = 'accepted' THEN spread_revenue_ngn ELSE 0 END) as spread_revenue
      FROM dcc_transactions WHERE created_at > NOW() - INTERVAL '30 days'
    `);
    const r = (rows as any[])[0] ?? {};
    const total = Number(r.total ?? 0);
    const accepted = Number(r.accepted ?? 0);
    return { totalTransactions: total, acceptanceRate: total > 0 ? Math.round((accepted / total) * 100) : 0, totalSpreadRevenueNgn: Math.round(Number(r.spread_revenue ?? 0) * 100) / 100 };
  }),
});
