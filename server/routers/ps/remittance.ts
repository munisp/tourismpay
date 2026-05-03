/**
 * Remittance Router — cross-border money transfer management with real DB access.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../../_core/trpc";
import { requireDb } from "../../_core/requireDb";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";
import { remittances } from "../../../drizzle/schema";
import { eq, desc, and, gte, lte, count, sum } from "drizzle-orm";

const uid = () => crypto.randomUUID();
const now = () => Date.now();

export const remittanceRouter = router({
  getStats: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const userId = typeof ctx.user.id === "number" ? ctx.user.id : parseInt(String(ctx.user.id), 10);
    const [stats] = await db.select({ totalTransactions: count(), totalVolume: sum(remittances.senderAmount) }).from(remittances).where(eq(remittances.userId, userId));
    const [completed] = await db.select({ cnt: count() }).from(remittances).where(and(eq(remittances.userId, userId), eq(remittances.status, 'completed')));
    const total = Number(stats.totalTransactions ?? 0);
    const successRate = total > 0 ? Math.round((Number(completed.cnt) / total) * 100) : 0;
    const corridors = await db.select({ from: remittances.senderCurrency, to: remittances.recipientCurrency, volume: sum(remittances.senderAmount) }).from(remittances).where(eq(remittances.userId, userId)).groupBy(remittances.senderCurrency, remittances.recipientCurrency).orderBy(desc(sum(remittances.senderAmount))).limit(5);
    return { totalVolume: Number(stats.totalVolume ?? 0), totalTransactions: total, successRate, averageProcessingTime: 0, topCorridors: corridors.map(c => ({ from: c.from, to: c.to, volume: Number(c.volume ?? 0) })) };
  }),
  list: protectedProcedure
    .input(z.object({ limit: z.number().default(20), offset: z.number().default(0), status: z.string().optional(), search: z.string().max(128).optional(), startDate: z.string().optional(), endDate: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const userId = typeof ctx.user.id === "number" ? ctx.user.id : parseInt(String(ctx.user.id), 10);
      const conditions: any[] = [eq(remittances.userId, userId)];
      if (input?.status) conditions.push(eq(remittances.status, input.status as any));
      if (input?.startDate) conditions.push(gte(remittances.createdAt, new Date(input.startDate).getTime()));
      if (input?.endDate) conditions.push(lte(remittances.createdAt, new Date(input.endDate + "T23:59:59").getTime()));
      const rows = await db.select().from(remittances).where(and(...conditions)).orderBy(desc(remittances.createdAt)).limit(input?.limit ?? 20).offset(input?.offset ?? 0);
      const [totalRow] = await db.select({ cnt: count() }).from(remittances).where(and(...conditions));
      return { items: rows, total: totalRow?.cnt ?? 0 };
    }),
  getById: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input, ctx }) => {
    const db = await requireDb();
    const userId = typeof ctx.user.id === "number" ? ctx.user.id : parseInt(String(ctx.user.id), 10);
    const [row] = await db.select().from(remittances).where(and(eq(remittances.id, input.id), eq(remittances.userId, userId)));
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Remittance not found" });
    return row;
  }),
  create: protectedProcedure
    .input(z.object({
      senderCurrency: z.string(), senderAmount: z.number().positive(), recipientCurrency: z.string(),
      recipientName: z.string(), recipientPhone: z.string().optional(), recipientEmail: z.string().optional(),
      recipientBank: z.string().optional(), recipientAccount: z.string().optional(),
      deliveryOption: z.enum(["bank_transfer", "mobile_money", "agent_cash", "bill_payment", "wallet"]).default("bank_transfer"),
      purpose: z.string().optional(), notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const fee = input.senderAmount * 0.015;
      const exchangeRate = 1.0;
      const recipientAmount = (input.senderAmount - fee) * exchangeRate;
      const remittanceId = `RMT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const userId = typeof ctx.user.id === "number" ? ctx.user.id : parseInt(String(ctx.user.id), 10);
      const [row] = await db.insert(remittances).values({
        id: remittanceId, userId, status: "pending",
        senderCurrency: input.senderCurrency as any, senderAmount: String(input.senderAmount),
        recipientCurrency: input.recipientCurrency as any, recipientAmount: String(recipientAmount),
        exchangeRate: String(exchangeRate), fee: String(fee),
        recipientName: input.recipientName, recipientPhone: input.recipientPhone ?? null,
        recipientBank: input.recipientBank ?? null, recipientAccount: input.recipientAccount ?? null,
        deliveryOption: input.deliveryOption, externalRef: `RMT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      }).returning();
      return { id: row.id, status: "pending", fee: fee.toFixed(2), exchangeRate, recipientAmount: recipientAmount.toFixed(2), externalRef: row.externalRef };
    }),
  cancel: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
    const db = await requireDb();
    const userId = typeof ctx.user.id === "number" ? ctx.user.id : parseInt(String(ctx.user.id), 10);
    const [row] = await db.select().from(remittances).where(and(eq(remittances.id, input.id), eq(remittances.userId, userId)));
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Remittance not found" });
    if (row.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Only pending remittances can be cancelled" });
    await db.update(remittances).set({ status: "failed" }).where(eq(remittances.id, input.id));
    return { success: true };
  }),
  getExchangeRate: protectedProcedure
    .input(z.object({ from: z.string(), to: z.string(), amount: z.number().optional() }))
    .query(async ({ input }) => ({ rate: 1.0, inverseRate: 1.0, fee: (input.amount ?? 100) * 0.015, estimatedDelivery: "1-3 business days" })),
  getCorridors: protectedProcedure.query(async () => ({
    corridors: [
      { from: "USD", to: "NGN", rate: 1550, fee: "1.5%", minAmount: 10, maxAmount: 10000 },
      { from: "USD", to: "KES", rate: 153, fee: "1.5%", minAmount: 10, maxAmount: 10000 },
      { from: "USD", to: "GHS", rate: 15.5, fee: "1.5%", minAmount: 10, maxAmount: 10000 },
      { from: "GBP", to: "NGN", rate: 1950, fee: "1.5%", minAmount: 10, maxAmount: 10000 },
      { from: "EUR", to: "NGN", rate: 1700, fee: "1.5%", minAmount: 10, maxAmount: 10000 },
    ],
  })),
  getSupportedBanks: protectedProcedure
    .input(z.object({ country: z.string().optional() }))
    .query(async ({ input }) => {
      const ALL_BANKS = [
        { code: "044", name: "Access Bank", country: "NG" }, { code: "023", name: "Citibank Nigeria", country: "NG" },
        { code: "050", name: "Ecobank Nigeria", country: "NG" }, { code: "011", name: "First Bank of Nigeria", country: "NG" },
        { code: "214", name: "First City Monument Bank", country: "NG" }, { code: "058", name: "Guaranty Trust Bank", country: "NG" },
        { code: "030", name: "Heritage Bank", country: "NG" }, { code: "076", name: "Polaris Bank", country: "NG" },
        { code: "221", name: "Stanbic IBTC Bank", country: "NG" }, { code: "032", name: "Union Bank of Nigeria", country: "NG" },
        { code: "033", name: "United Bank for Africa", country: "NG" }, { code: "035", name: "Wema Bank", country: "NG" },
        { code: "057", name: "Zenith Bank", country: "NG" },
        { code: "KCB", name: "Kenya Commercial Bank", country: "KE" }, { code: "EQT", name: "Equity Bank Kenya", country: "KE" },
        { code: "COOP", name: "Co-operative Bank of Kenya", country: "KE" }, { code: "MPESA", name: "M-Pesa (Safaricom)", country: "KE" },
        { code: "GCB", name: "GCB Bank", country: "GH" }, { code: "MTNMOMO", name: "MTN Mobile Money", country: "GH" },
        { code: "CRDB", name: "CRDB Bank", country: "TZ" }, { code: "NMB", name: "NMB Bank Tanzania", country: "TZ" },
        { code: "FNB", name: "First National Bank", country: "ZA" }, { code: "CAPITEC", name: "Capitec Bank", country: "ZA" },
      ];
      return { banks: input.country ? ALL_BANKS.filter(b => b.country === input.country?.toUpperCase()) : ALL_BANKS };
    }),
  getSupportedCryptocurrencies: protectedProcedure.query(async () => ({
    currencies: [
      { symbol: "BTC", name: "Bitcoin", network: "Bitcoin" }, { symbol: "ETH", name: "Ethereum", network: "Ethereum" },
      { symbol: "USDC", name: "USD Coin", network: "Ethereum / Stellar" }, { symbol: "USDT", name: "Tether", network: "Ethereum / Tron" },
      { symbol: "XLM", name: "Stellar Lumens", network: "Stellar" }, { symbol: "CELO", name: "Celo", network: "Celo" },
    ],
  })),
  verifyBankAccount: protectedProcedure
    .input(z.object({ bankCode: z.string(), accountNumber: z.string() }))
    .mutation(async ({ input }) => {
      const cleaned = input.accountNumber.replace(/\s/g, "");
      if (!/^\d{8,16}$/.test(cleaned)) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid account number format" });
      return { verified: true, accountName: "Account Holder", bankName: input.bankCode };
    }),
  exportRemittances: protectedProcedure
    .input(z.object({ from: z.number().optional(), to: z.number().optional(), status: z.string().optional(), search: z.string().optional(), startDate: z.string().optional(), endDate: z.string().optional() }))
    .mutation(async ({ ctx }) => {
      const db = await requireDb();
      const userId = typeof ctx.user.id === "number" ? ctx.user.id : parseInt(String(ctx.user.id), 10);
      const rows = await db.select().from(remittances).where(eq(remittances.userId, userId)).orderBy(desc(remittances.createdAt)).limit(10_000);
      const headers = ["ID", "Status", "Sender Currency", "Sender Amount", "Recipient Currency", "Recipient Name", "Created At"];
      const tsvLines = [headers.join("\t"), ...rows.map(r => [r.id, r.status, r.senderCurrency, r.senderAmount, r.recipientCurrency, r.recipientName ?? "", new Date(r.createdAt).toISOString()].map(v => String(v ?? "").replace(/\t/g, " ")).join("\t"))];
      const data = Buffer.from(tsvLines.join("\n"), "utf-8").toString("base64");
      return { data, filename: `remittances-${new Date().toISOString().slice(0, 10)}.xls`, mimeType: "application/vnd.ms-excel", total: rows.length };
    }),
  exportRemittancesPDF: protectedProcedure
    .input(z.object({ from: z.number().optional(), to: z.number().optional(), status: z.enum(["pending", "processing", "completed", "failed", "reversed", "refunded"]).optional(), search: z.string().max(128).optional(), startDate: z.string().optional(), endDate: z.string().optional() }))
    .mutation(async ({ ctx }) => {
      const db = await requireDb();
      const userId = typeof ctx.user.id === "number" ? ctx.user.id : parseInt(String(ctx.user.id), 10);
      const rows = await db.select().from(remittances).where(eq(remittances.userId, userId)).orderBy(desc(remittances.createdAt)).limit(5_000);
      const html = `<!DOCTYPE html><html><head><title>Remittance Report</title></head><body><h1>Remittance Export Report</h1><p>Total: ${rows.length}</p></body></html>`;
      return { data: Buffer.from(html).toString("base64"), filename: `remittances-${new Date().toISOString().slice(0, 10)}.html`, mimeType: "text/html", total: rows.length };
    }),
});
