/**
 * Payment Switch Router
 *
 * Integrates TigerBeetle (double-entry ledger), Mojaloop (settlement),
 * and the remittance orchestration layer into the TourismPay PWA.
 *
 * When PAYMENT_SWITCH_URL is set, procedures proxy to the standalone Go/Python
 * payment-switch service. Otherwise they operate on the local PostgreSQL tables
 * so the PWA remains fully functional as a standalone deployment.
 */
import { z } from "zod";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { isCorridorBlocked } from "./killSwitch";
import { checkAndIncrementRateLimit } from "./corridorRateLimit";
import { dispatchWebhookEvent } from "../webhookEngine";
import {
  remittances,
  psParticipants,
  psSettlements,
  nocEvents,
  psKillSwitchState,
  fraudAlerts,
  psFraudRules,
  psLedgerEntries,
} from "../../drizzle/schema";
import { eq, desc, and, gte, lte, sql, count, sum, ilike, or } from "drizzle-orm";
import { ENV } from "../_core/env";
import { getFxRate as getLiveFxRate, getRemittanceQuote, refreshRateCache, getAllRates } from "../_core/fxRates";
import {
  getLedgerBalance as tbGetLedgerBalance,
  getLedgerStatus as tbGetLedgerStatus,
  listMojaloopParticipants,
  getMojaloopStatus,
  getSettlementStatus as tbGetSettlementStatus,
  getInfrastructureStatus,
  getSettlementHealth,
  createMojaloopQuote,
  prepareMojaloopTransfer,
  commitMojaloopTransfer,
  listSettlementWindows,
} from "../_core/settlementClient";
import crypto from "crypto";

// ─── DB Helper ────────────────────────────────────────────────────────────────
async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}


// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Proxy to standalone payment-switch service when URL is configured */
async function callPaymentSwitch(
  path: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown
): Promise<unknown> {
  const baseUrl = ENV.paymentSwitchUrl;
  if (!baseUrl) return null;
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "X-Source": "tourismpay-pwa" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "unknown");
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `PaymentSwitch returned ${res.status}: ${text}`,
    });
  }
  return res.json();
}

/** Simulate TigerBeetle transfer ID (in production this calls the TB client) */
function generateTbTransferId(): string {
  return `tb_${crypto.randomBytes(16).toString("hex")}`;
}

/** Simulate Mojaloop reference (in production this calls the Mojaloop SDK) */
function generateMojaloopRef(): string {
  return `ml_${crypto.randomBytes(12).toString("hex")}`;
}

/** FX rate lookup — delegates to live fxRates service with 3-tier fallback */
async function getFxRate(from: string, to: string): Promise<number> {
  const { rate } = await getLiveFxRate(from, to);
  return rate;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const paymentSwitchRouter = router({
  // ── Remittance ──────────────────────────────────────────────────────────────

  /** Get FX rate quote for a remittance */
  getExchangeRate: protectedProcedure
    .input(
      z.object({
        fromCurrency: z.enum(["BTC", "ETH", "USDC", "USDT", "USD", "NGN", "KES", "GHS"]),
        toCurrency: z.enum(["NGN", "KES", "GHS", "TZS", "UGX", "ZAR", "USD"]),
        amount: z.number().positive(),
      })
    )
    .query(async ({ input }) => {
      // Try proxying to standalone service first
      const proxied = await callPaymentSwitch(
        `/api/remittance/rate?from=${input.fromCurrency}&to=${input.toCurrency}&amount=${input.amount}`,
        "GET"
      );
      if (proxied) return proxied;

      const quote = await getRemittanceQuote({
        fromCurrency: input.fromCurrency,
        toCurrency: input.toCurrency,
        amount: input.amount,
        feePercent: 1,
      });
      return quote;
    }),

  /** Create a new remittance */
  createRemittance: protectedProcedure
    .input(
      z.object({
        senderCurrency: z.enum(["BTC", "ETH", "USDC", "USDT", "USD"]),
        senderAmount: z.number().positive(),
        recipientCurrency: z.enum(["NGN", "KES", "GHS", "TZS", "UGX", "ZAR"]).default("NGN"),
        deliveryOption: z.enum(["bank_transfer", "mobile_money", "agent_cash", "bill_payment", "wallet"]).default("bank_transfer"),
        recipientPhone: z.string().optional(),
        recipientName: z.string().min(1),
        recipientBank: z.string().optional(),
        recipientAccount: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Check kill switch
      const ks = await (await requireDb()).select().from(psKillSwitchState).orderBy(desc(psKillSwitchState.id)).limit(1);
      if (ks[0]?.isActive) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Payment switch is currently offline (kill switch active). Please try again later.",
        });
      }

      const id = `rem_${crypto.randomBytes(16).toString("hex")}`;
      const rate = await getFxRate(input.senderCurrency, input.recipientCurrency);
      const fee = input.senderAmount * 0.01;
      const netAmount = input.senderAmount - fee;
      const recipientAmount = netAmount * rate;

      const tbTransferId = generateTbTransferId();
      const mojaloopRef = generateMojaloopRef();

      const [remittance] = await (await requireDb())
        .insert(remittances)
        .values({
          id,
          userId: ctx.user.id,
          senderCurrency: input.senderCurrency,
          senderAmount: String(input.senderAmount),
          recipientCurrency: input.recipientCurrency,
          recipientAmount: String(recipientAmount),
          exchangeRate: String(rate),
          fee: String(fee),
          status: "processing",
          deliveryOption: input.deliveryOption,
          recipientPhone: input.recipientPhone,
          recipientName: input.recipientName,
          recipientBank: input.recipientBank,
          recipientAccount: input.recipientAccount,
          tbTransferId,
          mojaloopRef,
        })
        .returning();

      // Simulate async completion (in production this is a webhook callback)
      setTimeout(async () => {
        await (await requireDb())
          .update(remittances)
          .set({ status: "completed", completedAt: Date.now(), updatedAt: Date.now() })
          .where(eq(remittances.id, id));
      }, 3000);

      return {
        id: remittance.id,
        status: remittance.status,
        tbTransferId,
        mojaloopRef,
        exchangeRate: rate,
        fee,
        recipientAmount,
        estimatedDelivery: "1–3 business days",
      };
    }),

  /** List user's remittances */
  listRemittances: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
        status: z.enum(["pending", "processing", "completed", "failed", "reversed", "refunded"]).optional(),
        /** Free-text search: matches recipientName, recipientPhone, id, or externalRef */
        search: z.string().max(128).optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await requireDb();
      const conditions = [eq(remittances.userId, ctx.user.id)];
      if (input.status) conditions.push(eq(remittances.status, input.status as any));
      if (input.search && input.search.trim().length > 0) {
        const term = `%${input.search.trim()}%`;
        conditions.push(
          or(
            ilike(remittances.recipientName, term),
            ilike(remittances.recipientPhone, term),
            ilike(remittances.id, term),
            ilike(remittances.externalRef, term),
          )!
        );
      }
      const [rows, [{ total }]] = await Promise.all([
        db
          .select()
          .from(remittances)
          .where(and(...conditions))
          .orderBy(desc(remittances.createdAt))
          .limit(input.limit)
          .offset(input.offset),
        db
          .select({ total: count() })
          .from(remittances)
          .where(and(...conditions)),
      ]);
      return { items: rows, total: Number(total) };
    }),

  /** Get a single remittance by ID */
  getRemittance: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const [row] = await (await requireDb())
        .select()
        .from(remittances)
        .where(and(eq(remittances.id, input.id), eq(remittances.userId, ctx.user.id)));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Remittance not found" });
      return row;
    }),

  // ── Settlement ──────────────────────────────────────────────────────────────

  /** Admin: list settlements with optional filters */
  listSettlements: adminProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
        status: z.enum(["pending", "processing", "completed", "failed", "disputed"]).optional(),
        participantId: z.string().optional(),
        dateFrom: z.number().optional(),
        dateTo: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      const conditions: ReturnType<typeof eq>[] = [];
      if (input.status) conditions.push(eq(psSettlements.status, input.status));
      if (input.participantId) conditions.push(eq(psSettlements.participantId, input.participantId));
      if (input.dateFrom) conditions.push(gte(psSettlements.createdAt, input.dateFrom));
      if (input.dateTo) conditions.push(lte(psSettlements.createdAt, input.dateTo));

      const rows = (await requireDb())
        .select()
        .from(psSettlements)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(psSettlements.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      const [{ total }] = await (await requireDb())
        .select({ total: count() })
        .from(psSettlements)
        .where(conditions.length ? and(...conditions) : undefined);

      const [stats] = await (await requireDb())
        .select({
          totalAmount: sum(psSettlements.totalAmount),
          totalTx: sum(psSettlements.transactionCount),
        })
        .from(psSettlements)
        .where(conditions.length ? and(...conditions) : undefined);

      return { items: rows, total, totalAmount: stats.totalAmount ?? "0", totalTx: Number(stats.totalTx ?? 0) };
    }),

  /** Admin: get settlement summary for BIS export integration */
  settlementSummary: adminProcedure
    .input(
      z.object({
        dateFrom: z.number().optional(),
        dateTo: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      const conditions: ReturnType<typeof eq>[] = [];
      if (input.dateFrom) conditions.push(gte(psSettlements.createdAt, input.dateFrom));
      if (input.dateTo) conditions.push(lte(psSettlements.createdAt, input.dateTo));

      const byStatus = (await requireDb())
        .select({
          status: psSettlements.status,
          count: count(),
          totalAmount: sum(psSettlements.totalAmount),
        })
        .from(psSettlements)
        .where(conditions.length ? and(...conditions) : undefined)
        .groupBy(psSettlements.status);

      const byCurrency = (await requireDb())
        .select({
          currency: psSettlements.currency,
          count: count(),
          totalAmount: sum(psSettlements.totalAmount),
        })
        .from(psSettlements)
        .where(conditions.length ? and(...conditions) : undefined)
        .groupBy(psSettlements.currency);

      return { byStatus, byCurrency };
    }),

  /** Admin: trigger a manual settlement batch */
  triggerSettlement: adminProcedure
    .input(
      z.object({
        participantId: z.string().min(1),
        currency: z.string().min(1),
        amount: z.number().positive(),
        transactionCount: z.number().int().positive(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const id = `set_${crypto.randomBytes(12).toString("hex")}`;
      const batchId = `batch_${Date.now()}`;
      const tbBatchId = generateTbTransferId();
      const mojaloopWindowId = `mw_${crypto.randomBytes(8).toString("hex")}`;

      const [settlement] = await (await requireDb())
        .insert(psSettlements)
        .values({
          id,
          batchId,
          participantId: input.participantId,
          currency: input.currency,
          totalAmount: String(input.amount),
          transactionCount: input.transactionCount,
          status: "processing",
          tbBatchId,
          mojaloopWindowId,
        })
        .returning();

      // Log NOC event
      await (await requireDb()).insert(nocEvents).values({
        type: "settlement_completed",
        severity: "info",
        title: `Settlement batch initiated for participant ${input.participantId}`,
        description: `Batch ${batchId}: ${input.transactionCount} transactions, ${input.currency} ${input.amount}`,
        actorId: ctx.user.id,
        actorName: ctx.user.name ?? "Admin",
        targetId: id,
        targetType: "settlement",
      });

      // Simulate completion
      setTimeout(async () => {
        await (await requireDb())
          .update(psSettlements)
          .set({ status: "completed", settledAt: Date.now(), updatedAt: Date.now() })
          .where(eq(psSettlements.id, id));
      }, 5000);

      return settlement;
    }),

  // ── Participants ─────────────────────────────────────────────────────────────

  /** Admin: list all participants */
  listParticipants: adminProcedure
    .input(
      z.object({
        status: z.enum(["active", "suspended", "pending", "inactive"]).optional(),
        type: z.enum(["bank", "fintech", "mobile_money", "agent_network", "psp"]).optional(),
        country: z.string().length(2).optional(),
      })
    )
    .query(async ({ input }) => {
      const conditions: ReturnType<typeof eq>[] = [];
      if (input.status) conditions.push(eq(psParticipants.status, input.status));
      if (input.type) conditions.push(eq(psParticipants.type, input.type));
      if (input.country) conditions.push(eq(psParticipants.country, input.country));

      return await (await requireDb())
        .select()
        .from(psParticipants)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(psParticipants.healthScore));
    }),

  /** Admin: register a new participant */
  registerParticipant: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        type: z.enum(["bank", "fintech", "mobile_money", "agent_network", "psp"]),
        country: z.string().length(2),
        currency: z.string().min(1),
        apiEndpoint: z.string().url().optional(),
        mojaloopFspId: z.string().optional(),
        dailyLimit: z.number().positive().optional(),
        monthlyLimit: z.number().positive().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const id = `part_${crypto.randomBytes(10).toString("hex")}`;
      const tbAccountId = `tb_acc_${crypto.randomBytes(12).toString("hex")}`;

      const [participant] = await (await requireDb())
        .insert(psParticipants)
        .values({
          id,
          name: input.name,
          type: input.type,
          country: input.country,
          currency: input.currency,
          apiEndpoint: input.apiEndpoint,
          mojaloopFspId: input.mojaloopFspId,
          tbAccountId,
          dailyLimit: input.dailyLimit ? String(input.dailyLimit) : undefined,
          monthlyLimit: input.monthlyLimit ? String(input.monthlyLimit) : undefined,
          healthScore: 100,
          lastHealthCheck: Date.now(),
        })
        .returning();

      await (await requireDb()).insert(nocEvents).values({
        type: "participant_restored",
        severity: "info",
        title: `New participant registered: ${input.name}`,
        description: `Type: ${input.type}, Country: ${input.country}, Currency: ${input.currency}`,
        actorId: ctx.user.id,
        actorName: ctx.user.name ?? "Admin",
        targetId: id,
        targetType: "participant",
      });

      return participant;
    }),

  /** Admin: suspend or restore a participant */
  updateParticipantStatus: adminProcedure
    .input(
      z.object({
        id: z.string().min(1),
        status: z.enum(["active", "suspended", "inactive"]),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const [participant] = await (await requireDb())
        .update(psParticipants)
        .set({ status: input.status, updatedAt: Date.now() })
        .where(eq(psParticipants.id, input.id))
        .returning();

      if (!participant) throw new TRPCError({ code: "NOT_FOUND", message: "Participant not found" });

      await (await requireDb()).insert(nocEvents).values({
        type: input.status === "suspended" ? "participant_suspended" : "participant_restored",
        severity: input.status === "suspended" ? "warning" : "info",
        title: `Participant ${participant.name} ${input.status}`,
        description: input.reason ?? `Status changed to ${input.status}`,
        actorId: ctx.user.id,
        actorName: ctx.user.name ?? "Admin",
        targetId: input.id,
        targetType: "participant",
      });

      return participant;
    }),

  /** Admin: run health check on all participants */
  runHealthCheck: adminProcedure.mutation(async ({ ctx }) => {
    const participants = await (await requireDb()).select().from(psParticipants).where(eq(psParticipants.status, "active"));

    const results = await Promise.all(
      participants.map(async (p: typeof psParticipants.$inferSelect) => {
        let healthScore = 100;
        let reachable = true;

        if (p.apiEndpoint) {
          try {
            const res = await fetch(`${p.apiEndpoint}/health`, {
              signal: AbortSignal.timeout(5000),
            });
            reachable = res.ok;
            healthScore = res.ok ? 100 : 30;
          } catch {
            reachable = false;
            healthScore = 0;
          }
        } else {
          // No endpoint configured — use a stable score based on participant's success rate
          const recentSettlements = await (await requireDb())
            .select({ status: psSettlements.status })
            .from(psSettlements)
            .where(eq(psSettlements.participantId, p.id))
            .orderBy(desc(psSettlements.createdAt))
            .limit(20);
          if (recentSettlements.length === 0) {
            healthScore = 90; // New participant — assume healthy
          } else {
            const successful = recentSettlements.filter((s) => s.status === "completed").length;
            healthScore = Math.round((successful / recentSettlements.length) * 100);
            if (healthScore < 50) healthScore = 50; // Floor at 50 for degraded
          }
        }

        (await requireDb())
          .update(psParticipants)
          .set({ healthScore, lastHealthCheck: Date.now(), updatedAt: Date.now() })
          .where(eq(psParticipants.id, p.id));

        return { id: p.id, name: p.name, healthScore, reachable };
      })
    );

    return { checked: results.length, results };
  }),

  // ── Fraud Check (BIS Integration) ───────────────────────────────────────────

  /**
   * Check a transaction against the fraud engine.
   * Called by BIS investigations when a financial transaction is under review.
   */
  fraudCheckTransaction: protectedProcedure
    .input(
      z.object({
        transactionId: z.string().optional(),
        amount: z.number().positive(),
        currency: z.string().min(1),
        senderCountry: z.string().length(2).optional(),
        recipientCountry: z.string().length(2).optional(),
        bisInvestigationId: z.number().int().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Proxy to standalone service if available
      const proxied = await callPaymentSwitch("/api/fraud/check", "POST", input);
      if (proxied) return proxied;

      // Internal fraud scoring
      let riskScore = 0;
      const flags: string[] = [];

      // High-value threshold
      if (input.currency === "USD" && input.amount > 10000) {
        riskScore += 30;
        flags.push("HIGH_VALUE_TRANSACTION");
      } else if (input.amount > 5000) {
        riskScore += 15;
        flags.push("ELEVATED_VALUE");
      }

      // Cross-border risk
      if (input.senderCountry && input.recipientCountry && input.senderCountry !== input.recipientCountry) {
        riskScore += 10;
        flags.push("CROSS_BORDER");
      }

      // Check against existing fraud alerts for this transaction
      if (input.transactionId) {
        const existing = await (await requireDb())
          .select()
          .from(fraudAlerts)
          .where(eq(fraudAlerts.transactionId, input.transactionId))
          .limit(1);
        if (existing.length > 0) {
          riskScore += 40;
          flags.push("EXISTING_FRAUD_ALERT");
        }
      }

      const riskLevel =
        riskScore >= 60 ? "high" : riskScore >= 30 ? "medium" : riskScore >= 10 ? "low" : "clear";

      // Create a fraud alert if risk is elevated
      if (riskScore >= 30 && input.transactionId) {
        const alertId = `FA-PS-${Date.now()}`;
        await (await requireDb()).insert(fraudAlerts).values({
          alertId,
          transactionId: input.transactionId,
          severity: riskLevel as "low" | "medium" | "high",
          status: "open",
          ruleTriggered: flags.join(", "),
          description: `PaymentSwitch fraud check flagged transaction ${input.transactionId}. Score: ${riskScore}`,
          amount: String(input.amount),
          currency: input.currency,
          gnnScore: String(riskScore / 100),
          metadata: { bisInvestigationId: input.bisInvestigationId, flags },
        });
      }

      return {
        transactionId: input.transactionId,
        riskScore,
        riskLevel,
        flags,
        recommendation: riskScore >= 60 ? "block" : riskScore >= 30 ? "review" : "allow",
        checkedAt: Date.now(),
      };
    }),

  // ── Admin Stats ──────────────────────────────────────────────────────────────

  /** Admin: dashboard statistics */
  stats: adminProcedure.query(async () => {
    const [remittanceStats] = await (await requireDb())
      .select({
        total: count(),
        completed: sql<number>`count(*) filter (where status = 'completed')`,
        processing: sql<number>`count(*) filter (where status = 'processing')`,
        failed: sql<number>`count(*) filter (where status = 'failed')`,
        totalVolume: sum(remittances.senderAmount),
      })
      .from(remittances);

    const [participantStats] = await (await requireDb())
      .select({
        total: count(),
        active: sql<number>`count(*) filter (where status = 'active')`,
        suspended: sql<number>`count(*) filter (where status = 'suspended')`,
        avgHealth: sql<number>`avg(health_score)`,
      })
      .from(psParticipants);

    const [settlementStats] = await (await requireDb())
      .select({
        total: count(),
        completed: sql<number>`count(*) filter (where status = 'completed')`,
        pending: sql<number>`count(*) filter (where status = 'pending')`,
        totalSettled: sum(psSettlements.totalAmount),
      })
      .from(psSettlements);

    const ks = await (await requireDb()).select().from(psKillSwitchState).orderBy(desc(psKillSwitchState.id)).limit(1);
    // Enrich with live infrastructure status from the Go settlement service
    const [infraStatus, settlementHealth] = await Promise.all([
      getInfrastructureStatus(),
      getSettlementHealth(),
    ]);
    return {
      remittances: remittanceStats,
      participants: participantStats,
      settlements: settlementStats,
      killSwitch: ks[0] ?? { isActive: false },
      infrastructure: infraStatus ?? {
        tigerbeetle: { connected: false, cluster_id: 0 },
        mojaloop: { connected: false, dfsp_id: "tourismpay" },
        database: { connected: true },
      },
      settlementService: settlementHealth
        ? { status: "online", version: settlementHealth.version }
        : { status: "offline", version: null },
    };
  }),

  // ── Cancel a remittance ────────────────────────────────────────────────────
  cancelRemittance: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const [rem] = await db.select().from(remittances).where(and(eq(remittances.id, input.id), eq(remittances.userId, ctx.user.id))).limit(1);
      if (!rem) throw new TRPCError({ code: "NOT_FOUND", message: "Remittance not found" });
      if (rem.status === "completed" || rem.status === "failed") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot cancel a ${rem.status} remittance` });
      }
      await db.update(remittances).set({ status: "failed", updatedAt: Date.now() }).where(eq(remittances.id, input.id));
      return { success: true, id: input.id };
    }),

  // ── Initiate a remittance (simplified alias for createRemittance) ───────────
  initiateRemittance: protectedProcedure
    .input(z.object({
      senderId: z.string().optional(),
      receiverId: z.string().optional(),
      sendAmount: z.number().positive(),
      sendCurrency: z.string().min(2).max(8),
      receiveCurrency: z.string().min(2).max(8),
      recipientName: z.string().min(1).default("Recipient"),
      purpose: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();

      // ── Kill switch check ──────────────────────────────────────────────────
      const killCheck = await isCorridorBlocked(input.sendCurrency, input.receiveCurrency);
      if (killCheck.blocked) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: killCheck.reason ?? "This payment corridor is currently unavailable",
        });
      }

      const id = `rem_init_${crypto.randomBytes(10).toString("hex")}`;
      const rate = await getFxRate(input.sendCurrency, input.receiveCurrency);
      const fee = input.sendAmount * 0.01;
      const netAmount = input.sendAmount - fee;
      const recipientAmount = netAmount * rate;
      const [inserted] = await db.insert(remittances).values({
        id,
        userId: ctx.user.id,
        senderCurrency: input.sendCurrency as any,
        senderAmount: String(input.sendAmount),
        recipientCurrency: input.receiveCurrency as any,
        recipientAmount: String(recipientAmount.toFixed(2)),
        exchangeRate: String(rate.toFixed(6)),
        fee: String(fee.toFixed(2)),
        status: "processing",
        deliveryOption: "bank_transfer",
        recipientName: input.recipientName,
        tbTransferId: generateTbTransferId(),
        mojaloopRef: generateMojaloopRef(),
      }).returning();

      // Dispatch webhook event asynchronously
      dispatchWebhookEvent("remittance.created", {
        remittanceId: id,
        sendAmount: input.sendAmount,
        sendCurrency: input.sendCurrency,
        receiveCurrency: input.receiveCurrency,
        recipientAmount: recipientAmount.toFixed(2),
        status: "processing",
        userId: ctx.user.id,
      }).catch(() => {}); // fire-and-forget

      return inserted;
    }),

  // ── Participant health ─────────────────────────────────────────────────────
  participantHealth: adminProcedure
    .input(z.object({ participantId: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const db = await requireDb();
      const rows = await db
        .select()
        .from(psParticipants)
        .where(input?.participantId ? eq(psParticipants.id, input.participantId) : undefined)
        .orderBy(desc(psParticipants.healthScore))
        .limit(50);
      return rows.map((p) => ({
        participantId: p.id,
        name: p.name,
        status: p.status,
        healthScore: p.healthScore ?? 100,
        lastHeartbeat: p.lastHealthCheck,
        country: p.country,
        currency: p.currency,
        tier: p.type,
      }));
    }),

  // ── List fraud rules ───────────────────────────────────────────────────────
  listFraudRules: adminProcedure
    .input(z.object({
      isActive: z.boolean().optional(),
      ruleType: z.string().optional(),
      limit: z.number().min(1).max(100).default(50),
    }).optional())
    .query(async ({ input }) => {
      const db = await requireDb();
      const rows = await db
        .select()
        .from(psFraudRules)
        .where(input?.isActive !== undefined ? eq(psFraudRules.isActive, input.isActive!) : undefined)
        .orderBy(desc(psFraudRules.createdAt))
        .limit(input?.limit ?? 50);
      return rows;
    }),

  createFraudRule: adminProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      ruleType: z.enum(["threshold", "velocity", "pattern", "ml"]).default("threshold"),
      conditions: z.record(z.string(), z.unknown()).optional(),
      action: z.enum(["flag", "block", "review"]).default("flag"),
      severity: z.enum(["info", "low", "medium", "high", "critical"]).default("medium"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const ruleId = `FR-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
      const [rule] = await db.insert(psFraudRules).values({
        ruleId,
        name: input.name,
        description: input.description ?? null,
        ruleType: input.ruleType,
        conditions: input.conditions ?? {},
        action: input.action,
        severity: input.severity as any,
        isActive: true,
        createdBy: ctx.user.id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }).returning();
      return rule;
    }),

  updateFraudRule: adminProcedure
    .input(z.object({
      ruleId: z.string().min(1),
      name: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
      ruleType: z.enum(["threshold", "velocity", "pattern", "ml"]).optional(),
      conditions: z.record(z.string(), z.unknown()).optional(),
      action: z.enum(["flag", "block", "review"]).optional(),
      severity: z.enum(["info", "low", "medium", "high", "critical"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const updates: Record<string, unknown> = { updatedAt: Date.now() };
      if (input.name !== undefined) updates.name = input.name;
      if (input.description !== undefined) updates.description = input.description;
      if (input.ruleType !== undefined) updates.ruleType = input.ruleType;
      if (input.conditions !== undefined) updates.conditions = input.conditions;
      if (input.action !== undefined) updates.action = input.action;
      if (input.severity !== undefined) updates.severity = input.severity;
      const [updated] = await db
        .update(psFraudRules)
        .set(updates as any)
        .where(eq(psFraudRules.ruleId, input.ruleId))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Fraud rule not found" });
      return updated;
    }),
  deleteFraudRule: adminProcedure
    .input(z.object({ ruleId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [deleted] = await db
        .delete(psFraudRules)
        .where(eq(psFraudRules.ruleId, input.ruleId))
        .returning();
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "Fraud rule not found" });
      return { success: true, ruleId: input.ruleId };
    }),
  toggleFraudRule: adminProcedure
    .input(z.object({ ruleId: z.string().min(1), isActive: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [updated] = await db
        .update(psFraudRules)
        .set({ isActive: input.isActive, updatedAt: Date.now() })
        .where(eq(psFraudRules.ruleId, input.ruleId))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Fraud rule not found" });
      return updated;
    }),
  // ── Ledger balance (TigerBeetle mirror) ───────────────────────────────────
  ledgerBalance: adminProcedure
    .input(z.object({ participantId: z.string().optional(), currency: z.string().optional() }).optional())
    .query(async ({ input }) => {
      // Try live TigerBeetle balance first
      if (input?.participantId && input?.currency) {
        const liveBalance = await tbGetLedgerBalance(
          "participant",
          input.participantId,
          input.currency
        );
        if (liveBalance) {
          return [{
            participantId: input.participantId,
            currency: liveBalance.currency,
            debit: liveBalance.debits_posted,
            credit: liveBalance.credits_posted,
            balance: liveBalance.balance,
            source: "tigerbeetle",
          }];
        }
      }
      // Fall back to local ledger mirror
      const db = await requireDb();
      const rows = await db
        .select({
          participantId: psLedgerEntries.participantId,
          currency: psLedgerEntries.currency,
          totalDebit: sql<string>`sum(${psLedgerEntries.debitAmount})`,
          totalCredit: sql<string>`sum(${psLedgerEntries.creditAmount})`,
        })
        .from(psLedgerEntries)
        .where(input?.participantId ? eq(psLedgerEntries.participantId, input.participantId) : undefined)
        .groupBy(psLedgerEntries.participantId, psLedgerEntries.currency)
        .limit(100);
      return rows.map((r) => ({
        participantId: r.participantId,
        currency: r.currency,
        debit: Number(r.totalDebit ?? 0),
        credit: Number(r.totalCredit ?? 0),
        balance: Number(r.totalCredit ?? 0) - Number(r.totalDebit ?? 0),
        source: "local",
      }));
    }),

  // ── Ledger entries ─────────────────────────────────────────────────────────
  ledgerEntries: adminProcedure
    .input(z.object({
      participantId: z.string().optional(),
      currency: z.string().optional(),
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
    }).optional())
    .query(async ({ input }) => {
      const db = await requireDb();
      return db
        .select()
        .from(psLedgerEntries)
        .orderBy(desc(psLedgerEntries.createdAt))
        .limit(input?.limit ?? 50)
        .offset(input?.offset ?? 0);
    }),
  remittanceHistory: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).optional(),
        offset: z.number().min(0).optional(),
        status: z.string().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const conditions = [eq(remittances.userId, ctx.user.id)];
      if (input?.status) {
        conditions.push(eq(remittances.status, input.status as any));
      }
      const items = await db
        .select()
        .from(remittances)
        .where(and(...conditions))
        .orderBy(desc(remittances.createdAt))
        .limit(input?.limit ?? 20)
        .offset(input?.offset ?? 0);
       return { items, total: items.length };
    }),

  // ── Service status (live TigerBeetle + Mojaloop health) ──────────────────────
  serviceStatus: adminProcedure.query(async () => {
    const [ledgerStatus, mojaloopStatus, settlementStatus, infraStatus, serviceHealth] =
      await Promise.all([
        tbGetLedgerStatus(),
        getMojaloopStatus(),
        tbGetSettlementStatus(),
        getInfrastructureStatus(),
        getSettlementHealth(),
      ]);
    return {
      settlementService: serviceHealth
        ? { online: true, version: serviceHealth.version, timestamp: serviceHealth.timestamp }
        : { online: false, version: null, timestamp: null },
      tigerbeetle: ledgerStatus
        ? { connected: ledgerStatus.connected, clusterId: ledgerStatus.cluster_id, accountsCount: ledgerStatus.accounts_count, transfersCount: ledgerStatus.transfers_count }
        : { connected: false, clusterId: 0, accountsCount: 0, transfersCount: 0 },
      mojaloop: mojaloopStatus
        ? { connected: mojaloopStatus.connected, dfspId: mojaloopStatus.dfsp_id, participantsCount: mojaloopStatus.participants_count, activeTransfers: mojaloopStatus.active_transfers }
        : { connected: false, dfspId: "tourismpay", participantsCount: 0, activeTransfers: 0 },
      settlement: settlementStatus
        ? { pendingBatches: settlementStatus.pending_batches, pendingAmount: settlementStatus.pending_amount, lastSettlementAt: settlementStatus.last_settlement_at, windowOpen: settlementStatus.settlement_window_open }
        : { pendingBatches: 0, pendingAmount: 0, lastSettlementAt: null, windowOpen: false },
      infrastructure: infraStatus ?? {
        tigerbeetle: { connected: false, cluster_id: 0 },
        mojaloop: { connected: false, dfsp_id: "tourismpay" },
        database: { connected: true },
      },
    };
  }),

  // ── Mojaloop participants (live from service) ──────────────────────────────────
  mojaloopParticipants: adminProcedure.query(async () => {
    // Try live Mojaloop participants first
    const live = await listMojaloopParticipants();
    if (live) return { source: "mojaloop", participants: live };
    // Fall back to local DB participants
    const db = await requireDb();
    const rows = await db.select().from(psParticipants).where(eq(psParticipants.status, "active")).limit(50);
    return {
      source: "local",
      participants: rows.map((p) => ({
        fsp_id: p.mojaloopFspId ?? p.id,
        name: p.name,
        currency: p.currency,
        account_id: p.tbAccountId ?? "",
        is_active: p.status === "active",
      })),
    };
  }),

  // ── Settlement windows (live from Mojaloop) ───────────────────────────────────
  settlementWindows: adminProcedure.query(async () => {
    const live = await listSettlementWindows();
    if (live) return { source: "mojaloop", windows: live };
    // Fall back to local settlements as proxy
    const db = await requireDb();
    const rows = await db.select().from(psSettlements).orderBy(desc(psSettlements.createdAt)).limit(20);
    return {
      source: "local",
      windows: rows.map((s) => ({
        window_id: s.mojaloopWindowId ?? s.batchId,
        state: s.status,
        currency: s.currency,
        created_at: new Date(s.createdAt ?? 0).toISOString(),
        closed_at: s.settledAt ? new Date(s.settledAt).toISOString() : undefined,
        net_settlement_amount: Number(s.totalAmount ?? 0),
      })),
    };
  }),
});
