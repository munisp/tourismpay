/**
 * bisIntegration.ts
 *
 * tRPC router for the BIS ↔ TourismPay integration layer.
 *
 * Procedures:
 *   getAutoFlagConfig   — list all per-currency auto-flag thresholds
 *   updateAutoFlagConfig — upsert a threshold for a currency (admin)
 *   resetAutoFlagConfig  — reset a currency config to defaults (admin)
 *   getAutoFlagHistory   — paginated list of auto-triggered BIS investigations
 *   getKillSwitchActivations — list BIS-triggered kill switch activations
 *
 * The checkAndAutoFlag() helper is exported for use in wallet.ts.
 */

import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  bisAutoFlagConfig,
  bisAutoFlags,
  bisKillSwitchActivations,
} from "../../drizzle/schema";
import { eq, desc, and, gte } from "drizzle-orm";
import { createBisInvestigation } from "../db";
import { TRPCError } from "@trpc/server";

// ─── USD exchange rates (approximate) ────────────────────────────────────────
const APPROX_USD_RATES: Record<string, number> = {
  USDC: 1,
  USD: 1,
  "CBDC-NG": 0.00065,
  "CBDC-KE": 0.0077,
  "CBDC-GH": 0.067,
  "CBDC-ZA": 0.054,
  XLM: 0.11,
  NGN: 0.00065,
  KES: 0.0077,
  GHS: 0.067,
  ZAR: 0.054,
};

// ─── Default thresholds seeded on first access ───────────────────────────────
const DEFAULT_CONFIGS: Array<{
  currency: string;
  thresholdUsd: string;
  velocityCount: number;
  bisTier: string;
}> = [
  { currency: "GLOBAL", thresholdUsd: "5000", velocityCount: 10, bisTier: "standard" },
  { currency: "USDC",   thresholdUsd: "5000", velocityCount: 10, bisTier: "standard" },
  { currency: "USD",    thresholdUsd: "5000", velocityCount: 10, bisTier: "standard" },
  { currency: "NGN",    thresholdUsd: "3000", velocityCount: 15, bisTier: "basic"    },
  { currency: "KES",    thresholdUsd: "3000", velocityCount: 15, bisTier: "basic"    },
  { currency: "GHS",    thresholdUsd: "3000", velocityCount: 15, bisTier: "basic"    },
  { currency: "ZAR",    thresholdUsd: "3000", velocityCount: 15, bisTier: "basic"    },
  { currency: "XLM",    thresholdUsd: "4000", velocityCount: 12, bisTier: "standard" },
];

async function seedDefaultConfigs() {
  const db = await getDb();
  if (!db) return;
  const now = Date.now();
  for (const cfg of DEFAULT_CONFIGS) {
    await db
      .insert(bisAutoFlagConfig)
      .values({ ...cfg, isActive: true, createdAt: now, updatedAt: now })
      .onConflictDoNothing();
  }
}

// ─── Core helper: check a wallet transaction and auto-create BIS investigation ─
export interface AutoFlagInput {
  walletTxId: string;
  userId: string;
  currency: string;
  amount: number;          // in the wallet currency
  counterparty: string;
  subjectCountry?: string; // ISO-3166-1 alpha-2, if known
}

export interface AutoFlagResult {
  flagged: boolean;
  reason?: "amount_threshold" | "velocity";
  bisInvestigationId?: number;
  bisReferenceId?: string;
}

/**
 * Called from wallet.send (fire-and-forget) after a successful transaction.
 * Checks whether the transaction exceeds any configured threshold and, if so,
 * creates a BIS investigation automatically.
 *
 * Never throws — all errors are caught so the wallet send is never blocked.
 */
export async function checkAndAutoFlag(
  input: AutoFlagInput
): Promise<AutoFlagResult> {
  const db = await getDb();
  if (!db) return { flagged: false };

  // Ensure defaults exist
  await seedDefaultConfigs().catch(() => {});

  // Fetch the most specific active config: currency-specific first, then GLOBAL
  const configs = await db
    .select()
    .from(bisAutoFlagConfig)
    .where(eq(bisAutoFlagConfig.isActive, true));

  const specificConfig = configs.find((c) => c.currency === input.currency);
  const globalConfig = configs.find((c) => c.currency === "GLOBAL");
  const config = specificConfig ?? globalConfig;

  if (!config) return { flagged: false };

  const usdRate = APPROX_USD_RATES[input.currency] ?? 1;
  const amountUsd = input.amount * usdRate;
  const thresholdUsd = parseFloat(config.thresholdUsd as unknown as string);
  const now = Date.now();

  let triggerReason: "amount_threshold" | "velocity" | null = null;

  // ── Check 1: amount threshold ─────────────────────────────────────────────
  if (amountUsd >= thresholdUsd) {
    triggerReason = "amount_threshold";
  }

  // ── Check 2: velocity (sends in last 1 hour) ──────────────────────────────
  if (!triggerReason) {
    const oneHourAgo = now - 60 * 60 * 1000;
    // Count recent sends by this user in this currency
    const { walletTransactions } = await import("../../drizzle/schema");
    const { count, sql } = await import("drizzle-orm");
    const recentRows = await db
      .select({ cnt: sql<string>`count(*)` })
      .from(walletTransactions)
      .where(
        and(
          eq(walletTransactions.userId, input.userId),
          eq(walletTransactions.fromCurrency, input.currency),
          eq(walletTransactions.type, "send"),
          gte(walletTransactions.createdAt, oneHourAgo)
        )
      );
    const recentCount = parseInt(recentRows[0]?.cnt ?? "0", 10);
    if (recentCount >= config.velocityCount) {
      triggerReason = "velocity";
    }
  }

  if (!triggerReason) return { flagged: false };

  // ── Create BIS investigation ──────────────────────────────────────────────
  try {
    const inv = await createBisInvestigation({
      subjectFullName: input.counterparty,
      subjectCountry: input.subjectCountry ?? undefined,
      tier: (config.bisTier as "basic" | "standard" | "comprehensive") ?? "standard",
      consentObtained: false,
      linkedTransactionId: input.walletTxId,
      pricePaid: "0",
      currency: "USD",
      status: "pending",
    });

    // Record the auto-flag audit entry
    await db.insert(bisAutoFlags).values({
      walletTxId: input.walletTxId,
      userId: input.userId,
      currency: input.currency,
      amountUsd: String(amountUsd.toFixed(4)),
      triggerReason,
      thresholdUsd: String(thresholdUsd),
      bisInvestigationId: inv?.id ?? undefined,
      bisReferenceId: inv?.referenceId ?? undefined,
      status: "created",
      createdAt: now,
    });

    return {
      flagged: true,
      reason: triggerReason,
      bisInvestigationId: inv?.id,
      bisReferenceId: inv?.referenceId,
    };
  } catch (err) {
    console.error("[BIS AutoFlag] Failed to create investigation:", err);

    // Record the failure
    await db.insert(bisAutoFlags).values({
      walletTxId: input.walletTxId,
      userId: input.userId,
      currency: input.currency,
      amountUsd: String(amountUsd.toFixed(4)),
      triggerReason,
      thresholdUsd: String(thresholdUsd),
      status: "failed",
      errorMessage: err instanceof Error ? err.message : String(err),
      createdAt: now,
    }).catch(() => {});

    return { flagged: false };
  }
}

// ─── tRPC Router ─────────────────────────────────────────────────────────────
export const bisIntegrationRouter = router({
  /**
   * List all auto-flag threshold configurations.
   */
  getAutoFlagConfig: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    await seedDefaultConfigs().catch(() => {});
    return db
      .select()
      .from(bisAutoFlagConfig)
      .orderBy(bisAutoFlagConfig.currency);
  }),

  /**
   * Upsert a threshold configuration for a specific currency (admin only).
   */
  updateAutoFlagConfig: adminProcedure
    .input(
      z.object({
        currency: z.string().min(1).max(20),
        thresholdUsd: z.number().positive(),
        velocityCount: z.number().int().min(1).max(1000),
        bisTier: z.enum(["basic", "standard", "comprehensive"]),
        isActive: z.boolean(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const now = Date.now();
      await db
        .insert(bisAutoFlagConfig)
        .values({
          currency: input.currency,
          thresholdUsd: String(input.thresholdUsd),
          velocityCount: input.velocityCount,
          bisTier: input.bisTier,
          isActive: input.isActive,
          updatedBy: String(ctx.user.id),
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: bisAutoFlagConfig.currency,
          set: {
            thresholdUsd: String(input.thresholdUsd),
            velocityCount: input.velocityCount,
            bisTier: input.bisTier,
            isActive: input.isActive,
            updatedBy: String(ctx.user.id),
            updatedAt: now,
          },
        });
      return { success: true };
    }),

  /**
   * Reset a currency config to its default values (admin only).
   */
  resetAutoFlagConfig: adminProcedure
    .input(z.object({ currency: z.string().min(1).max(20) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const defaults = DEFAULT_CONFIGS.find((d) => d.currency === input.currency);
      if (!defaults) {
        throw new TRPCError({ code: "NOT_FOUND", message: `No default config for currency "${input.currency}"` });
      }
      const now = Date.now();
      await db
        .update(bisAutoFlagConfig)
        .set({
          thresholdUsd: defaults.thresholdUsd,
          velocityCount: defaults.velocityCount,
          bisTier: defaults.bisTier,
          isActive: true,
          updatedBy: String(ctx.user.id),
          updatedAt: now,
        })
        .where(eq(bisAutoFlagConfig.currency, input.currency));
      return { success: true };
    }),

  /**
   * Paginated list of auto-triggered BIS investigations.
   */
  getAutoFlagHistory: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
        userId: z.string().optional(),
        currency: z.string().optional(),
        triggerReason: z.enum(["amount_threshold", "velocity"]).optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };
      const conditions: ReturnType<typeof eq>[] = [];
      if (input.userId) conditions.push(eq(bisAutoFlags.userId, input.userId));
      if (input.currency) conditions.push(eq(bisAutoFlags.currency, input.currency));
      if (input.triggerReason) conditions.push(eq(bisAutoFlags.triggerReason, input.triggerReason));
      const { count, sql } = await import("drizzle-orm");
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      const [items, totalRows] = await Promise.all([
        db
          .select()
          .from(bisAutoFlags)
          .where(whereClause)
          .orderBy(desc(bisAutoFlags.createdAt))
          .limit(input.limit)
          .offset(input.offset),
        db
          .select({ cnt: sql<string>`count(*)` })
          .from(bisAutoFlags)
          .where(whereClause),
      ]);
      return { items, total: parseInt(totalRows[0]?.cnt ?? "0", 10) };
    }),

  /**
   * List BIS-triggered PaymentSwitch kill switch activations.
   */
  getKillSwitchActivations: protectedProcedure
    .input(
      z.object({
        bisInvestigationId: z.number().optional(),
        corridor: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(50),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions: ReturnType<typeof eq>[] = [];
      if (input.bisInvestigationId !== undefined) {
        conditions.push(eq(bisKillSwitchActivations.bisInvestigationId, input.bisInvestigationId));
      }
      if (input.corridor) {
        conditions.push(eq(bisKillSwitchActivations.corridor, input.corridor));
      }
      return db
        .select()
        .from(bisKillSwitchActivations)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(bisKillSwitchActivations.createdAt))
        .limit(input.limit);
    }),
});
