/**
 * Tipping Router — Multi-jurisdiction tipping with cultural context,
 * percentage/flat/round-up options, pool distribution, and merchant config.
 */
import { z } from "zod";
import { protectedProcedure, adminProcedure, merchantProcedure, router } from "../_core/trpc";
import { getDb, createUserNotification } from "../db";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";

// ─── Jurisdiction Tipping Defaults ──────────────────────────────────────────

interface TipJurisdictionConfig {
  code: string;
  name: string;
  currency: string;
  defaultPercentages: number[];
  maxPercentage: number;
  suggestedFlat: number[];
  culturalNote: string;
  taxOnTip: boolean;
  tipTaxRate: number;
  poolSplitRules: { role: string; percentage: number }[];
  distribution: "direct" | "pool";
  roundUpUnit: number;
  serviceChargeIncluded: boolean;
}

const JURISDICTION_TIP_CONFIG: Record<string, TipJurisdictionConfig> = {
  NG: {
    code: "NG", name: "Nigeria", currency: "NGN",
    defaultPercentages: [10, 15, 20], maxPercentage: 30,
    suggestedFlat: [500, 1000, 2000, 5000],
    culturalNote: "Tipping 10-15% is standard at Nigerian restaurants. Service charge may already be included at upscale venues.",
    taxOnTip: false, tipTaxRate: 0,
    poolSplitRules: [{ role: "server", percentage: 60 }, { role: "kitchen", percentage: 25 }, { role: "support", percentage: 15 }],
    distribution: "pool", roundUpUnit: 100, serviceChargeIncluded: false,
  },
  KE: {
    code: "KE", name: "Kenya", currency: "KES",
    defaultPercentages: [10, 15, 20], maxPercentage: 30,
    suggestedFlat: [100, 200, 500, 1000],
    culturalNote: "10% is standard in Kenya. Safari guides typically receive $10-20 USD per day.",
    taxOnTip: false, tipTaxRate: 0,
    poolSplitRules: [{ role: "server", percentage: 55 }, { role: "kitchen", percentage: 30 }, { role: "support", percentage: 15 }],
    distribution: "pool", roundUpUnit: 50, serviceChargeIncluded: false,
  },
  ZA: {
    code: "ZA", name: "South Africa", currency: "ZAR",
    defaultPercentages: [10, 15, 20], maxPercentage: 30,
    suggestedFlat: [20, 50, 100, 200],
    culturalNote: "10-15% at restaurants is standard. R20-50 for car guards. Tipping is part of the culture.",
    taxOnTip: false, tipTaxRate: 0,
    poolSplitRules: [{ role: "recipient", percentage: 100 }],
    distribution: "direct", roundUpUnit: 10, serviceChargeIncluded: false,
  },
  GH: {
    code: "GH", name: "Ghana", currency: "GHS",
    defaultPercentages: [5, 10, 15], maxPercentage: 25,
    suggestedFlat: [5, 10, 20, 50],
    culturalNote: "Tipping is appreciated but not mandatory in Ghana. 5-10% at restaurants is generous.",
    taxOnTip: false, tipTaxRate: 0,
    poolSplitRules: [{ role: "server", percentage: 65 }, { role: "kitchen", percentage: 20 }, { role: "support", percentage: 15 }],
    distribution: "pool", roundUpUnit: 5, serviceChargeIncluded: false,
  },
  TZ: {
    code: "TZ", name: "Tanzania", currency: "TZS",
    defaultPercentages: [10, 15, 20], maxPercentage: 30,
    suggestedFlat: [5000, 10000, 20000, 50000],
    culturalNote: "Tipping is customary for tourism services. Safari guides: $15-20/day, Kilimanjaro porters: $8-10/day.",
    taxOnTip: false, tipTaxRate: 0,
    poolSplitRules: [{ role: "recipient", percentage: 100 }],
    distribution: "direct", roundUpUnit: 1000, serviceChargeIncluded: false,
  },
  EG: {
    code: "EG", name: "Egypt", currency: "EGP",
    defaultPercentages: [10, 15, 20], maxPercentage: 30,
    suggestedFlat: [20, 50, 100, 200],
    culturalNote: "Baksheesh is deeply embedded in Egyptian culture. 10-15% at restaurants, EGP 20-50 for small services.",
    taxOnTip: false, tipTaxRate: 0,
    poolSplitRules: [{ role: "recipient", percentage: 100 }],
    distribution: "direct", roundUpUnit: 10, serviceChargeIncluded: false,
  },
  MA: {
    code: "MA", name: "Morocco", currency: "MAD",
    defaultPercentages: [10, 15, 20], maxPercentage: 25,
    suggestedFlat: [10, 20, 50, 100],
    culturalNote: "Pourboire is expected in Morocco. 10% at restaurants, round up taxi fares, MAD 10-20 for small services.",
    taxOnTip: false, tipTaxRate: 0,
    poolSplitRules: [{ role: "recipient", percentage: 100 }],
    distribution: "direct", roundUpUnit: 10, serviceChargeIncluded: false,
  },
  RW: {
    code: "RW", name: "Rwanda", currency: "RWF",
    defaultPercentages: [10, 15, 20], maxPercentage: 25,
    suggestedFlat: [1000, 2000, 5000, 10000],
    culturalNote: "10% is appropriate at restaurants. Gorilla trek guides: $10-20 per person.",
    taxOnTip: false, tipTaxRate: 0,
    poolSplitRules: [{ role: "server", percentage: 60 }, { role: "kitchen", percentage: 25 }, { role: "support", percentage: 15 }],
    distribution: "pool", roundUpUnit: 500, serviceChargeIncluded: false,
  },
  UG: {
    code: "UG", name: "Uganda", currency: "UGX",
    defaultPercentages: [10, 15, 20], maxPercentage: 25,
    suggestedFlat: [5000, 10000, 20000, 50000],
    culturalNote: "Tipping is appreciated but not mandatory. 10% at restaurants. Safari guides: $10-15/day.",
    taxOnTip: false, tipTaxRate: 0,
    poolSplitRules: [{ role: "recipient", percentage: 100 }],
    distribution: "direct", roundUpUnit: 1000, serviceChargeIncluded: false,
  },
  ET: {
    code: "ET", name: "Ethiopia", currency: "ETB",
    defaultPercentages: [10, 15, 20], maxPercentage: 25,
    suggestedFlat: [50, 100, 200, 500],
    culturalNote: "Tipping is customary in Ethiopia. 10% at restaurants. Historical site guides: ETB 200-500/day.",
    taxOnTip: false, tipTaxRate: 0,
    poolSplitRules: [{ role: "recipient", percentage: 100 }],
    distribution: "direct", roundUpUnit: 10, serviceChargeIncluded: false,
  },
};

function calculateTip(billAmount: number, tipType: "percentage" | "flat" | "round_up", tipValue: number, config: TipJurisdictionConfig) {
  let tipAmount = 0;
  switch (tipType) {
    case "percentage": {
      const capped = Math.min(tipValue, config.maxPercentage);
      tipAmount = Math.round(billAmount * capped) / 100;
      break;
    }
    case "flat":
      tipAmount = tipValue;
      break;
    case "round_up": {
      const unit = config.roundUpUnit;
      tipAmount = Math.ceil(billAmount / unit) * unit - billAmount;
      if (tipAmount <= 0) tipAmount = unit;
      break;
    }
  }
  tipAmount = Math.round(tipAmount * 100) / 100;
  const taxOnTip = config.taxOnTip ? Math.round(tipAmount * config.tipTaxRate) / 100 : 0;
  const netTip = tipAmount - taxOnTip;

  const splits = config.poolSplitRules.map(rule => ({
    role: rule.role,
    percentage: rule.percentage,
    amount: Math.round(netTip * rule.percentage) / 100,
  }));

  return { tipAmount, taxOnTip, netTip, grandTotal: Math.round((billAmount + tipAmount) * 100) / 100, splits };
}

export const tippingRouter = router({
  // Get tipping config for a jurisdiction
  getConfig: protectedProcedure
    .input(z.object({ jurisdictionCode: z.string().length(2) }))
    .query(({ input }) => {
      const config = JURISDICTION_TIP_CONFIG[input.jurisdictionCode.toUpperCase()];
      if (!config) {
        return {
          code: input.jurisdictionCode.toUpperCase(),
          name: "Unknown",
          currency: "USD",
          defaultPercentages: [10, 15, 20],
          maxPercentage: 25,
          suggestedFlat: [2, 5, 10, 20],
          culturalNote: "Check local customs for appropriate tipping amounts.",
          distribution: "direct" as const,
          serviceChargeIncluded: false,
        };
      }
      return {
        code: config.code,
        name: config.name,
        currency: config.currency,
        defaultPercentages: config.defaultPercentages,
        maxPercentage: config.maxPercentage,
        suggestedFlat: config.suggestedFlat,
        culturalNote: config.culturalNote,
        distribution: config.distribution,
        serviceChargeIncluded: config.serviceChargeIncluded,
      };
    }),

  // List all supported jurisdictions
  jurisdictions: protectedProcedure.query(() => {
    return Object.values(JURISDICTION_TIP_CONFIG).map(c => ({
      code: c.code,
      name: c.name,
      currency: c.currency,
      defaultPercentages: c.defaultPercentages,
      culturalNote: c.culturalNote,
    }));
  }),

  // Calculate tip amount
  calculate: protectedProcedure
    .input(z.object({
      jurisdictionCode: z.string().length(2),
      billAmount: z.number().positive(),
      tipType: z.enum(["percentage", "flat", "round_up"]),
      tipValue: z.number().min(0),
    }))
    .query(({ input }) => {
      const config = JURISDICTION_TIP_CONFIG[input.jurisdictionCode.toUpperCase()] ?? JURISDICTION_TIP_CONFIG.NG;
      const result = calculateTip(input.billAmount, input.tipType, input.tipValue, config);
      return {
        billAmount: input.billAmount,
        ...result,
        tipType: input.tipType,
        percentage: input.tipType === "percentage" ? input.tipValue : Math.round(result.tipAmount / input.billAmount * 10000) / 100,
        currency: config.currency,
        culturalNote: config.culturalNote,
        distribution: config.distribution,
      };
    }),

  // Send a tip (wallet-to-wallet or to merchant)
  send: protectedProcedure
    .input(z.object({
      establishmentId: z.number().optional(),
      recipientUserId: z.number().optional(),
      transactionId: z.string().optional(),
      billAmount: z.number().positive(),
      tipType: z.enum(["percentage", "flat", "round_up"]),
      tipValue: z.number().min(0),
      jurisdictionCode: z.string().length(2),
      currency: z.string().max(5),
      message: z.string().max(200).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const config = JURISDICTION_TIP_CONFIG[input.jurisdictionCode.toUpperCase()] ?? JURISDICTION_TIP_CONFIG.NG;
      const { tipAmount, taxOnTip, netTip, splits } = calculateTip(input.billAmount, input.tipType, input.tipValue, config);

      if (tipAmount <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Tip amount must be positive" });

      // Check sender wallet balance
      const walletRows = await db.execute(
        sql`SELECT balance FROM wallet_balances WHERE user_id = ${ctx.user.id} AND currency = ${input.currency} LIMIT 1`
      );
      const walletBalance = (walletRows as any[])[0]?.balance;
      if (!walletBalance || parseFloat(walletBalance) < tipAmount) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Insufficient ${input.currency} balance for tip. Available: ${walletBalance ?? 0}, Required: ${tipAmount}` });
      }

      // Record tip transaction
      const tipId = crypto.randomUUID();
      const now = Date.now();
      await db.execute(sql`
        INSERT INTO tip_transactions (id, payer_id, recipient_id, establishment_id, transaction_ref, bill_amount, tip_amount, tip_type, tip_percentage, tax_on_tip, net_tip, currency, jurisdiction_code, distribution_type, message, status, created_at)
        VALUES (${tipId}, ${String(ctx.user.id)}, ${String(input.recipientUserId ?? input.establishmentId ?? 0)}, ${input.establishmentId ?? null}, ${input.transactionId ?? null}, ${input.billAmount}, ${tipAmount}, ${input.tipType}, ${input.tipType === "percentage" ? input.tipValue : 0}, ${taxOnTip}, ${netTip}, ${input.currency}, ${input.jurisdictionCode.toUpperCase()}, ${config.distribution}, ${input.message ?? null}, 'completed', ${now})
      `);

      // Record distribution splits
      for (const split of splits) {
        await db.execute(sql`
          INSERT INTO tip_distribution_log (id, tip_id, role, amount, percentage, created_at)
          VALUES (${crypto.randomUUID()}, ${tipId}, ${split.role}, ${split.amount}, ${split.percentage}, ${now})
        `);
      }

      // Deduct from sender wallet
      await db.execute(sql`
        UPDATE wallet_balances SET balance = balance - ${tipAmount}, updated_at = ${now} WHERE user_id = ${ctx.user.id} AND currency = ${input.currency}
      `);

      // Notify recipient
      if (input.recipientUserId) {
        await createUserNotification({
          userId: input.recipientUserId,
          category: "wallet",
          title: `You received a tip of ${tipAmount} ${input.currency}!`,
          content: input.message
            ? `${ctx.user.name ?? "A customer"} tipped you ${tipAmount} ${input.currency}: "${input.message}"`
            : `${ctx.user.name ?? "A customer"} tipped you ${tipAmount} ${input.currency}. Thank you for great service!`,
          actionUrl: "/wallet",
          actionLabel: "View Wallet",
        }).catch(() => {});
      }

      // Award loyalty points for tipping (5 pts per USD equivalent)
      const loyaltyPoints = Math.max(1, Math.round(tipAmount * 5 / 100));
      try {
        await db.execute(sql`
          UPDATE loyalty_accounts SET points_balance = points_balance + ${loyaltyPoints}, lifetime_points = lifetime_points + ${loyaltyPoints}, updated_at = ${now} WHERE user_id = ${String(ctx.user.id)}
        `);
      } catch { /* non-critical */ }

      return {
        tipId,
        tipAmount,
        taxOnTip,
        netTip,
        currency: input.currency,
        grandTotal: Math.round((input.billAmount + tipAmount) * 100) / 100,
        splits,
        loyaltyPointsEarned: loyaltyPoints,
        message: `Tip of ${tipAmount} ${input.currency} sent successfully!`,
      };
    }),

  // Get tip history for the current user
  history: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(20), offset: z.number().default(0) }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };
      const limit = input?.limit ?? 20;
      const offset = input?.offset ?? 0;
      const rows = await db.execute(sql`
        SELECT * FROM tip_transactions WHERE payer_id = ${String(ctx.user.id)} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}
      `);
      const countResult = await db.execute(sql`SELECT COUNT(*) as cnt FROM tip_transactions WHERE payer_id = ${String(ctx.user.id)}`);
      return {
        items: (rows as any[]).map(r => ({
          id: r.id,
          recipientId: r.recipient_id,
          establishmentId: r.establishment_id,
          billAmount: parseFloat(r.bill_amount),
          tipAmount: parseFloat(r.tip_amount),
          tipType: r.tip_type,
          percentage: parseFloat(r.tip_percentage ?? "0"),
          currency: r.currency,
          jurisdictionCode: r.jurisdiction_code,
          message: r.message,
          status: r.status,
          createdAt: Number(r.created_at),
        })),
        total: Number((countResult as any[])[0]?.cnt ?? 0),
      };
    }),

  // Merchant: get tip summary for their establishment
  merchantSummary: merchantProcedure
    .input(z.object({ establishmentId: z.number(), period: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { totalTips: 0, totalTransactions: 0, averageTip: 0, averagePercent: 0, byRole: [] };
      const rows = await db.execute(sql`
        SELECT tip_amount, tip_percentage, currency FROM tip_transactions
        WHERE establishment_id = ${input.establishmentId} AND status = 'completed'
        ORDER BY created_at DESC LIMIT 1000
      `);
      const items = rows as any[];
      if (items.length === 0) return { totalTips: 0, totalTransactions: 0, averageTip: 0, averagePercent: 0, byRole: [] };
      const totalTips = items.reduce((sum, r) => sum + parseFloat(r.tip_amount), 0);
      const avgPct = items.reduce((sum, r) => sum + parseFloat(r.tip_percentage ?? "0"), 0) / items.length;
      // Get distribution breakdown
      const distRows = await db.execute(sql`
        SELECT dl.role, SUM(dl.amount) as total, COUNT(*) as cnt
        FROM tip_distribution_log dl
        JOIN tip_transactions tt ON tt.id = dl.tip_id
        WHERE tt.establishment_id = ${input.establishmentId}
        GROUP BY dl.role
      `);
      return {
        totalTips: Math.round(totalTips * 100) / 100,
        totalTransactions: items.length,
        averageTip: Math.round(totalTips / items.length * 100) / 100,
        averagePercent: Math.round(avgPct * 10) / 10,
        currency: items[0]?.currency ?? "NGN",
        byRole: (distRows as any[]).map(r => ({ role: r.role, total: parseFloat(r.total), count: Number(r.cnt) })),
      };
    }),

  // Admin: configure tipping for an establishment
  configureEstablishment: adminProcedure
    .input(z.object({
      establishmentId: z.number(),
      jurisdictionCode: z.string().length(2),
      customPercentages: z.array(z.number()).optional(),
      distribution: z.enum(["direct", "pool"]).optional(),
      poolSplitRules: z.array(z.object({ role: z.string(), percentage: z.number() })).optional(),
      isEnabled: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const now = Date.now();
      await db.execute(sql`
        INSERT INTO tip_configs (id, establishment_id, jurisdiction_code, custom_percentages, distribution_type, pool_split_rules, is_enabled, created_at, updated_at)
        VALUES (${crypto.randomUUID()}, ${input.establishmentId}, ${input.jurisdictionCode.toUpperCase()}, ${JSON.stringify(input.customPercentages ?? [])}, ${input.distribution ?? "pool"}, ${JSON.stringify(input.poolSplitRules ?? [])}, ${input.isEnabled ?? true}, ${now}, ${now})
        ON CONFLICT (establishment_id) DO UPDATE SET
          jurisdiction_code = EXCLUDED.jurisdiction_code,
          custom_percentages = EXCLUDED.custom_percentages,
          distribution_type = EXCLUDED.distribution_type,
          pool_split_rules = EXCLUDED.pool_split_rules,
          is_enabled = EXCLUDED.is_enabled,
          updated_at = EXCLUDED.updated_at
      `);
      return { success: true };
    }),
});
