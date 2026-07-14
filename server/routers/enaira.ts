/**
 * eNaira / CBDC-NG Router
 *
 * Handles all Central Bank Digital Currency (eNaira) operations via the
 * CBN Speed Wallet API. Integrates with:
 *   - TigerBeetle for double-entry ledger recording
 *   - Kafka for event streaming to downstream consumers
 *   - Fluvio for real-time CBDC transaction streaming
 *   - Permify for fine-grained access control on eNaira wallets
 *   - Redis for balance caching (TTL: 30s)
 *   - Dapr for service invocation to the Go eNaira gateway
 *   - Temporal for async load/settlement workflows
 */
import { z } from "zod";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import {
  enairaWallets,
  enairaTransactions,
  cbnMerchantRegistrations,
  establishments,
  users,
} from "../../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { createAuditLog, createUserNotification } from "../db";
import { cacheGet, cacheSet, cacheDel } from "../_core/redis";
import { publishEvent, TOPICS } from "../_core/kafka";
import { streamPaymentEvent, FLUVIO_TOPICS } from "../_core/fluvio";
import { requirePermission, writeRelationship, grantOwnership, RESOURCES_V2, ACTIONS_V2 } from "../_core/permify";
import { getOrCreateAccount, createTransfer, LEDGER_CODES, CURRENCY_CODES, TRANSFER_CODES } from "../_core/tigerbeetle";
import { invokeService } from "../_core/dapr";
import { logger } from "../_core/logger";

// ─── eNaira Gateway Client ───────────────────────────────────────────────────
const ENAIRA_GATEWAY_URL = process.env.ENAIRA_GATEWAY_URL || "http://enaira-gateway:8095";

async function callEnairaGateway<T>(
  path: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  body?: unknown,
): Promise<T> {
  try {
    // Prefer Dapr service invocation for resilience (retries + circuit breaker)
    if (process.env.DAPR_HTTP_PORT) {
      const result = await invokeService<T>("tourismpay-enaira", path.replace(/^\//, ""), body, method);
      if (result === null) throw new Error("Dapr invocation returned null");
      return result;
    }
    // Fallback: direct HTTP call
    const res = await fetch(`${ENAIRA_GATEWAY_URL}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`eNaira gateway error ${res.status}: ${errText}`);
    }
    return res.json() as Promise<T>;
  } catch (err) {
    logger.error(`[eNaira] Gateway call failed: ${path} — ${(err as Error).message}`);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `eNaira gateway unavailable: ${(err as Error).message}`,
    });
  }
}

// ─── Router ──────────────────────────────────────────────────────────────────
export const enairaRouter = router({

  // ── Create eNaira Wallet ────────────────────────────────────────────────────
  createWallet: protectedProcedure
    .input(z.object({
      kycTier: z.number().int().min(1).max(3).default(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const userId = ctx.user.id;

      // Check if user already has an eNaira wallet
      const existing = await db!.select().from(enairaWallets).limit(1).then((r) => r[0] ?? null);
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "eNaira wallet already exists" });
      }

      // Register with CBN Speed Wallet via gateway
      const cbnResult = await callEnairaGateway<{
        walletAddress: string;
        cbnWalletId: string;
        status: string;
      }>("/api/v1/wallets/create", "POST", {
        userId,
        kycTier: input.kycTier,
        userEmail: ctx.user.email,
      });

      const wallet = await (async () => {
        const [newWallet] = await db!.insert(enairaWallets).values({
          userId: String(userId),
          walletAddress: cbnResult.walletAddress,
          cbnWalletId: cbnResult.cbnWalletId,
          kycTier: input.kycTier,
          status: "active",
        }).returning();

                // Create TigerBeetle ledger account for eNaira
        await getOrCreateAccount(
          userId,
          null,
          LEDGER_CODES.TOURIST_WALLET,
          CURRENCY_CODES.NGN,
        );
        // Grant Permify ownership
        await grantOwnership(String(userId), String(userId), RESOURCES_V2.ENAIRA_WALLET, newWallet.id);
        await createAuditLog({
          actorId: userId,
          action: "enaira_wallet_created",
          entityType: "enaira_wallet",
          entityId: String(newWallet.id),
          after: { kycTier: input.kycTier, walletAddress: cbnResult.walletAddress },
        });

        return newWallet;
      })();

      // Publish Kafka event
      await publishEvent(TOPICS.WALLET_TRANSACTIONS, {
        type: "enaira_wallet_created",
        payload: { userId,
        walletId: wallet.id,
        walletAddress: wallet.walletAddress,
        timestamp: new Date().toISOString() },
      });

      return { success: true, wallet };
    }),

  // ── Get eNaira Wallet ───────────────────────────────────────────────────────
  getWallet: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const userId = ctx.user.id;
      const cacheKey = `enaira:wallet:${userId}`;

      const cached = await cacheGet<Record<string, unknown>>(cacheKey);
      if (cached) return cached;

      const wallet = await db!.select().from(enairaWallets).limit(1).then((r) => r[0] ?? null);

      if (!wallet) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No eNaira wallet found" });
      }

      await requirePermission(RESOURCES_V2.ENAIRA_WALLET, String(userId), ACTIONS_V2.VIEW_BALANCE, wallet.id);

      // Sync balance from CBN if stale (> 30s)
      const isStale = !wallet.lastSyncAt ||
        (Date.now() - wallet.lastSyncAt.getTime()) > 30000;

      if (isStale) {
        try {
          const liveBalance = await callEnairaGateway<{ balanceKobo: number }>(
            `/api/v1/wallets/${wallet.cbnWalletId}/balance`, "GET",
          );
          await db!.update(enairaWallets)
            .set({ balanceKobo: liveBalance.balanceKobo, lastSyncAt: new Date() })
            .where(eq(enairaWallets.id, wallet.id));
          wallet.balanceKobo = liveBalance.balanceKobo;
          wallet.lastSyncAt = new Date();
        } catch (err) {
          logger.warn(`[eNaira] Balance sync failed for ${wallet.id}: ${(err as Error).message}`);
        }
      }

      await cacheSet(cacheKey, wallet, 30);
      return wallet;
    }),

  // ── Load eNaira Wallet (Bank Transfer) ─────────────────────────────────────
  loadWallet: protectedProcedure
    .input(z.object({
      amountKobo: z.number().int().positive().max(5000000), // max ₦50,000 per txn
      sourceAccountNumber: z.string().length(10),
      sourceBankCode: z.string().length(6),
      narration: z.string().max(100).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const userId = ctx.user.id;

      const wallet = await db!.select().from(enairaWallets).limit(1).then((r) => r[0] ?? null);
      if (!wallet) throw new TRPCError({ code: "NOT_FOUND", message: "Active eNaira wallet not found" });

      // Enforce daily limit
      const todayLoaded = await db!.select({ total: sql<number>`COALESCE(SUM(amount_kobo), 0)` })
        .from(enairaTransactions)
        .where(and(
          eq(enairaTransactions.enairaWalletId, wallet.id),
          eq(enairaTransactions.transactionType, "load"),
          eq(enairaTransactions.status, "completed"),
          sql`created_at >= CURRENT_DATE`,
        ));
      const loadedToday = Number(todayLoaded[0]?.total ?? 0);
      if (loadedToday + input.amountKobo > wallet.dailyLimitKobo) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Daily load limit exceeded" });
      }

      // Call eNaira gateway to initiate load
      const loadResult = await callEnairaGateway<{
        cbnTransactionRef: string;
        status: string;
      }>("/api/v1/wallets/load", "POST", {
        cbnWalletId: wallet.cbnWalletId,
        amountKobo: input.amountKobo,
        sourceAccountNumber: input.sourceAccountNumber,
        sourceBankCode: input.sourceBankCode,
        narration: input.narration || "eNaira wallet load",
      });

      const txn = await (async () => {
        const [newTxn] = await db!.insert(enairaTransactions).values({
          enairaWalletId: wallet.id,
          cbnTransactionRef: loadResult.cbnTransactionRef,
          transactionType: "load",
          amountKobo: input.amountKobo,
          status: loadResult.status === "completed" ? "completed" : "processing",
          narration: input.narration,
          cbnResponse: loadResult as Record<string, unknown>,
        }).returning();

        if (loadResult.status === "completed") {
          // Record in TigerBeetle ledger
          const tbAccountId = wallet.id;
          await createTransfer({
            debitAccountId: String(LEDGER_CODES.PLATFORM_FEE),
            creditAccountId: tbAccountId,
            amount: BigInt(input.amountKobo),
            ledgerCode: LEDGER_CODES.TOURIST_WALLET,
            transferCode: TRANSFER_CODES.WALLET_LOAD,
            metadata: { txnId: newTxn.id, userId },
          });

          await db!.update(enairaWallets)
            .set({ balanceKobo: sql`balance_kobo + ${input.amountKobo}`, lastSyncAt: new Date() })
            .where(eq(enairaWallets.id, wallet.id));
        }

        await createAuditLog({
          actorId: userId,
          action: "enaira_wallet_load",
          entityType: "enaira_transaction",
          entityId: String(newTxn.id),
          after: { amountKobo: input.amountKobo, cbnRef: loadResult.cbnTransactionRef },
        });

        return newTxn;
      })();

      // Stream to Fluvio for real-time CBDC analytics
      await streamPaymentEvent(FLUVIO_TOPICS.TRANSACTION_EVENTS, {
        type: "enaira_load",
        userId,
        walletId: wallet.id,
        transactionId: txn.id,
        amountKobo: input.amountKobo,
        timestamp: new Date().toISOString(),
      });

      // Publish Kafka event
      await publishEvent(TOPICS.PAYMENTS, {
        type: "enaira_load",
        payload: { userId,
        walletId: wallet.id,
        transactionId: txn.id,
        amountKobo: input.amountKobo,
        cbnRef: loadResult.cbnTransactionRef },
      });

      // Invalidate cache
      await cacheDel(`enaira:wallet:${userId}`);

      return { success: true, transaction: txn };
    }),

  // ── Pay with eNaira ─────────────────────────────────────────────────────────
  pay: protectedProcedure
    .input(z.object({
      merchantCbnId: z.string(),
      amountKobo: z.number().int().positive(),
      narration: z.string().max(100).optional(),
      reference: z.string().max(64).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const userId = ctx.user.id;

      const wallet = await db!.select().from(enairaWallets).limit(1).then((r) => r[0] ?? null);
      if (!wallet) throw new TRPCError({ code: "NOT_FOUND", message: "Active eNaira wallet not found" });

      await requirePermission(RESOURCES_V2.ENAIRA_WALLET, String(userId), ACTIONS_V2.PAY, wallet.id);

      if (wallet.balanceKobo < input.amountKobo) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Insufficient eNaira balance" });
      }
      if (input.amountKobo > wallet.transactionLimitKobo) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Amount exceeds per-transaction limit" });
      }

      const payResult = await callEnairaGateway<{
        cbnTransactionRef: string;
        status: string;
        merchantName?: string;
      }>("/api/v1/payments/pay", "POST", {
        cbnWalletId: wallet.cbnWalletId,
        merchantCbnId: input.merchantCbnId,
        amountKobo: input.amountKobo,
        narration: input.narration || "eNaira payment",
        reference: input.reference,
      });

      const txn = await (async () => {
        const [newTxn] = await db!.insert(enairaTransactions).values({
          enairaWalletId: wallet.id,
          cbnTransactionRef: payResult.cbnTransactionRef,
          transactionType: "pay",
          amountKobo: input.amountKobo,
          counterpartyAddress: input.merchantCbnId,
          counterpartyName: payResult.merchantName,
          narration: input.narration,
          status: payResult.status === "completed" ? "completed" : "processing",
          cbnResponse: payResult as Record<string, unknown>,
        }).returning();

        if (payResult.status === "completed") {
          const tbAccountId = wallet.id;
          await createTransfer({
            debitAccountId: tbAccountId,
            creditAccountId: String(LEDGER_CODES.MERCHANT_WALLET),
            amount: BigInt(input.amountKobo),
            ledgerCode: LEDGER_CODES.TOURIST_WALLET,
            transferCode: TRANSFER_CODES.WALLET_PAYMENT,
            metadata: { txnId: newTxn.id, userId },
          });

          await db!.update(enairaWallets)
            .set({ balanceKobo: sql`balance_kobo - ${input.amountKobo}`, lastSyncAt: new Date() })
            .where(eq(enairaWallets.id, wallet.id));
        }

        await createAuditLog({
          actorId: userId,
          action: "enaira_payment",
          entityType: "enaira_transaction",
          entityId: String(newTxn.id),
          after: { amountKobo: input.amountKobo, merchantCbnId: input.merchantCbnId },
        });

        return newTxn;
      })();

      // Stream to Fluvio
      await streamPaymentEvent(FLUVIO_TOPICS.TRANSACTION_EVENTS, {
        type: "enaira_payment",
        userId,
        walletId: wallet.id,
        transactionId: txn.id,
        amountKobo: input.amountKobo,
        merchantCbnId: input.merchantCbnId,
        timestamp: new Date().toISOString(),
      });

      await publishEvent(TOPICS.PAYMENTS, {
        type: "enaira_payment",
        payload: { userId,
        walletId: wallet.id,
        transactionId: txn.id,
        amountKobo: input.amountKobo,
        merchantCbnId: input.merchantCbnId },
      });

      await cacheDel(`enaira:wallet:${userId}`);

      await createUserNotification({
        userId,
        title: "eNaira Payment Sent",
        content: `₦${(input.amountKobo / 100).toFixed(2)} paid via eNaira`,
        category: "wallet",
        metadata: { transactionId: txn.id },
      });

      return { success: true, transaction: txn };
    }),

  // ── Transaction History ─────────────────────────────────────────────────────
  getTransactions: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(100).default(20),
      offset: z.number().int().min(0).default(0),
      type: z.enum(["load", "payment", "reversal", "refund"]).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const userId = ctx.user.id;

            const [wallet] = await db!.select({ id: enairaWallets.id }).from(enairaWallets)
        .where(eq(enairaWallets.userId, String(userId))).limit(1);
      if (!wallet) throw new TRPCError({ code: "NOT_FOUND", message: "No eNaira wallet found" });
      await requirePermission(String(userId), ctx.user.role, RESOURCES_V2.ENAIRA_WALLET, ACTIONS_V2.VIEW_TRANSACTIONS, wallet.id);
      const conditions = [eq(enairaTransactions.enairaWalletId, wallet.id)];
      if (input.type) conditions.push(eq(enairaTransactions.transactionType, input.type));
      const transactions = await db!.select().from(enairaTransactions).where(and(...conditions)).orderBy(desc(enairaTransactions.createdAt)).limit(input.limit).offset(input.offset);

      return { transactions, walletId: wallet.id };
    }),

  // ── Register Merchant with CBN ──────────────────────────────────────────────
  registerMerchant: protectedProcedure
    .input(z.object({
      establishmentId: z.string().uuid(),
      merchantCategoryCode: z.string().length(4).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const userId = ctx.user.id;

      await requirePermission(String(userId), ctx.user.role, "establishment", "manage", input.establishmentId);

      const establishment = await db!.select().from(establishments).limit(1).then((r) => r[0] ?? null);
      if (!establishment) throw new TRPCError({ code: "NOT_FOUND", message: "Establishment not found" });

      const existing = await db!.select().from(cbnMerchantRegistrations).limit(1).then((r) => r[0] ?? null);
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Merchant already registered with CBN" });
      }

      const regResult = await callEnairaGateway<{
        cbnMerchantId: string;
        cbnTerminalId: string;
        status: string;
      }>("/api/v1/merchants/register", "POST", {
        establishmentId: input.establishmentId,
        businessName: establishment.name,
        merchantCategoryCode: input.merchantCategoryCode || "7011",
        address: establishment.address,
      });

      const [registration] = await db!.insert(cbnMerchantRegistrations).values({
        establishmentId: input.establishmentId,
        cbnMerchantId: regResult.cbnMerchantId,
        cbnTerminalId: regResult.cbnTerminalId,
        merchantCategoryCode: input.merchantCategoryCode,
        registrationStatus: regResult.status === "active" ? "active" : "pending",
        registeredAt: regResult.status === "active" ? new Date() : undefined,
      }).returning();

      await publishEvent(TOPICS.PAYMENTS, {
        type: "cbn_merchant_registered",
        payload: { establishmentId: input.establishmentId,
        cbnMerchantId: regResult.cbnMerchantId,
        userId },
      });

      return { success: true, registration };
    }),

  // ── Admin: Freeze/Unfreeze eNaira Wallet ────────────────────────────────────
  setWalletStatus: adminProcedure
    .input(z.object({
      walletId: z.string().uuid(),
      status: z.enum(["active", "frozen", "suspended"]),
      reason: z.string().max(256),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();

      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

            await requirePermission(String(ctx.user.id), ctx.user.role, RESOURCES_V2.ENAIRA_WALLET, ACTIONS_V2.FREEZE, input.walletId);
      const [wallet] = await db!.select().from(enairaWallets).where(eq(enairaWallets.id, input.walletId)).limit(1);
      if (!wallet) throw new TRPCError({ code: "NOT_FOUND", message: "eNaira wallet not found" });

      await callEnairaGateway("/api/v1/wallets/status", "PUT", {
        cbnWalletId: wallet.cbnWalletId,
        status: input.status,
        reason: input.reason,
      });

      await db!.update(enairaWallets)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(enairaWallets.id, input.walletId));

      await createAuditLog({
        actorId: ctx.user.id,
        action: `enaira_wallet_${input.status}`,
        entityType: "enaira_wallet",
        entityId: input.walletId,
        after: { reason: input.reason, adminId: ctx.user.id },
      });

      await cacheDel(`enaira:wallet:${wallet.userId}`);

      return { success: true, status: input.status };
    }),
});
