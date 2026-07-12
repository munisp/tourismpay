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
import { getDb, withTransaction } from "../db";
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
  method: "GET" | "POST" | "PUT",
  body?: unknown,
): Promise<T> {
  try {
    // Prefer Dapr service invocation for resilience (retries + circuit breaker)
    if (process.env.DAPR_HTTP_PORT) {
      const result = await invokeService<T>("tourismpay-enaira", path.replace(/^\//, ""), method, body);
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
      const db = getDb();
      const userId = ctx.user.id;

      // Check if user already has an eNaira wallet
      const existing = await db.query.enairaWallets.findFirst({
        where: eq(enairaWallets.userId, userId),
      });
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

      const wallet = await withTransaction(db, async (tx) => {
        const [newWallet] = await tx.insert(enairaWallets).values({
          userId,
          walletAddress: cbnResult.walletAddress,
          cbnWalletId: cbnResult.cbnWalletId,
          kycTier: input.kycTier,
          status: "active",
        }).returning();

        // Create TigerBeetle ledger account for eNaira
        await getOrCreateAccount(
          BigInt(`0x${newWallet.id.replace(/-/g, "").slice(0, 16)}`),
          LEDGER_CODES.ENAIRA_NGN,
          CURRENCY_CODES.NGN,
          { userId, walletType: "enaira" },
        );

        // Grant Permify ownership
        await grantOwnership(userId, userId, RESOURCES_V2.ENAIRA_WALLET, newWallet.id);

        await createAuditLog(tx, {
          userId,
          action: "enaira_wallet_created",
          resourceType: "enaira_wallet",
          resourceId: newWallet.id,
          metadata: { kycTier: input.kycTier, walletAddress: cbnResult.walletAddress },
        });

        return newWallet;
      });

      // Publish Kafka event
      await publishEvent(TOPICS.WALLET_EVENTS, {
        type: "enaira_wallet_created",
        userId,
        walletId: wallet.id,
        walletAddress: wallet.walletAddress,
        timestamp: new Date().toISOString(),
      });

      return { success: true, wallet };
    }),

  // ── Get eNaira Wallet ───────────────────────────────────────────────────────
  getWallet: protectedProcedure
    .query(async ({ ctx }) => {
      const db = getDb();
      const userId = ctx.user.id;
      const cacheKey = `enaira:wallet:${userId}`;

      const cached = await cacheGet(cacheKey);
      if (cached) return JSON.parse(cached);

      const wallet = await db.query.enairaWallets.findFirst({
        where: eq(enairaWallets.userId, userId),
      });

      if (!wallet) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No eNaira wallet found" });
      }

      await requirePermission(userId, ctx.user.role, RESOURCES_V2.ENAIRA_WALLET, ACTIONS_V2.VIEW_BALANCE, wallet.id);

      // Sync balance from CBN if stale (> 30s)
      const isStale = !wallet.lastSyncAt ||
        (Date.now() - wallet.lastSyncAt.getTime()) > 30000;

      if (isStale) {
        try {
          const liveBalance = await callEnairaGateway<{ balanceKobo: number }>(
            `/api/v1/wallets/${wallet.cbnWalletId}/balance`, "GET",
          );
          await db.update(enairaWallets)
            .set({ balanceKobo: liveBalance.balanceKobo, lastSyncAt: new Date() })
            .where(eq(enairaWallets.id, wallet.id));
          wallet.balanceKobo = liveBalance.balanceKobo;
          wallet.lastSyncAt = new Date();
        } catch (err) {
          logger.warn(`[eNaira] Balance sync failed for ${wallet.id}: ${(err as Error).message}`);
        }
      }

      await cacheSet(cacheKey, JSON.stringify(wallet), 30);
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
      const db = getDb();
      const userId = ctx.user.id;

      const wallet = await db.query.enairaWallets.findFirst({
        where: and(eq(enairaWallets.userId, userId), eq(enairaWallets.status, "active")),
      });
      if (!wallet) throw new TRPCError({ code: "NOT_FOUND", message: "Active eNaira wallet not found" });

      // Enforce daily limit
      const todayLoaded = await db.select({ total: sql<number>`COALESCE(SUM(amount_kobo), 0)` })
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

      const txn = await withTransaction(db, async (tx) => {
        const [newTxn] = await tx.insert(enairaTransactions).values({
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
          const tbAccountId = BigInt(`0x${wallet.id.replace(/-/g, "").slice(0, 16)}`);
          await createTransfer({
            debitAccountId: BigInt(LEDGER_CODES.ENAIRA_FLOAT),
            creditAccountId: tbAccountId,
            amount: BigInt(input.amountKobo),
            ledger: LEDGER_CODES.ENAIRA_NGN,
            code: TRANSFER_CODES.ENAIRA_LOAD,
            userData: { txnId: newTxn.id, userId },
          });

          await tx.update(enairaWallets)
            .set({ balanceKobo: sql`balance_kobo + ${input.amountKobo}`, lastSyncAt: new Date() })
            .where(eq(enairaWallets.id, wallet.id));
        }

        await createAuditLog(tx, {
          userId,
          action: "enaira_wallet_load",
          resourceType: "enaira_transaction",
          resourceId: newTxn.id,
          metadata: { amountKobo: input.amountKobo, cbnRef: loadResult.cbnTransactionRef },
        });

        return newTxn;
      });

      // Stream to Fluvio for real-time CBDC analytics
      await streamPaymentEvent(FLUVIO_TOPICS.TRANSACTIONS, {
        type: "enaira_load",
        userId,
        walletId: wallet.id,
        transactionId: txn.id,
        amountKobo: input.amountKobo,
        timestamp: new Date().toISOString(),
      });

      // Publish Kafka event
      await publishEvent(TOPICS.PAYMENT_EVENTS, {
        type: "enaira_load",
        userId,
        walletId: wallet.id,
        transactionId: txn.id,
        amountKobo: input.amountKobo,
        cbnRef: loadResult.cbnTransactionRef,
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
      const db = getDb();
      const userId = ctx.user.id;

      const wallet = await db.query.enairaWallets.findFirst({
        where: and(eq(enairaWallets.userId, userId), eq(enairaWallets.status, "active")),
      });
      if (!wallet) throw new TRPCError({ code: "NOT_FOUND", message: "Active eNaira wallet not found" });

      await requirePermission(userId, ctx.user.role, RESOURCES_V2.ENAIRA_WALLET, ACTIONS_V2.PAY, wallet.id);

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

      const txn = await withTransaction(db, async (tx) => {
        const [newTxn] = await tx.insert(enairaTransactions).values({
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
          const tbAccountId = BigInt(`0x${wallet.id.replace(/-/g, "").slice(0, 16)}`);
          await createTransfer({
            debitAccountId: tbAccountId,
            creditAccountId: BigInt(LEDGER_CODES.ENAIRA_MERCHANT_FLOAT),
            amount: BigInt(input.amountKobo),
            ledger: LEDGER_CODES.ENAIRA_NGN,
            code: TRANSFER_CODES.ENAIRA_PAY,
            userData: { txnId: newTxn.id, userId },
          });

          await tx.update(enairaWallets)
            .set({ balanceKobo: sql`balance_kobo - ${input.amountKobo}`, lastSyncAt: new Date() })
            .where(eq(enairaWallets.id, wallet.id));
        }

        await createAuditLog(tx, {
          userId,
          action: "enaira_payment",
          resourceType: "enaira_transaction",
          resourceId: newTxn.id,
          metadata: { amountKobo: input.amountKobo, merchantCbnId: input.merchantCbnId },
        });

        return newTxn;
      });

      // Stream to Fluvio
      await streamPaymentEvent(FLUVIO_TOPICS.TRANSACTIONS, {
        type: "enaira_payment",
        userId,
        walletId: wallet.id,
        transactionId: txn.id,
        amountKobo: input.amountKobo,
        merchantCbnId: input.merchantCbnId,
        timestamp: new Date().toISOString(),
      });

      await publishEvent(TOPICS.PAYMENT_EVENTS, {
        type: "enaira_payment",
        userId,
        walletId: wallet.id,
        transactionId: txn.id,
        amountKobo: input.amountKobo,
        merchantCbnId: input.merchantCbnId,
      });

      await cacheDel(`enaira:wallet:${userId}`);

      await createUserNotification(getDb(), {
        userId,
        title: "eNaira Payment Sent",
        message: `₦${(input.amountKobo / 100).toFixed(2)} paid via eNaira`,
        type: "payment",
        metadata: { transactionId: txn.id },
      });

      return { success: true, transaction: txn };
    }),

  // ── Transaction History ─────────────────────────────────────────────────────
  getTransactions: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(100).default(20),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user.id;

      const wallet = await db.query.enairaWallets.findFirst({
        where: eq(enairaWallets.userId, userId),
      });
      if (!wallet) throw new TRPCError({ code: "NOT_FOUND", message: "No eNaira wallet found" });

      await requirePermission(userId, ctx.user.role, RESOURCES_V2.ENAIRA_WALLET, ACTIONS_V2.VIEW_TRANSACTIONS, wallet.id);

      const transactions = await db.query.enairaTransactions.findMany({
        where: eq(enairaTransactions.enairaWalletId, wallet.id),
        orderBy: [desc(enairaTransactions.createdAt)],
        limit: input.limit,
        offset: input.offset,
      });

      return { transactions, walletId: wallet.id };
    }),

  // ── Register Merchant with CBN ──────────────────────────────────────────────
  registerMerchant: protectedProcedure
    .input(z.object({
      establishmentId: z.string().uuid(),
      merchantCategoryCode: z.string().length(4).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user.id;

      await requirePermission(userId, ctx.user.role, "establishment", "manage", input.establishmentId);

      const establishment = await db.query.establishments.findFirst({
        where: eq(establishments.id, input.establishmentId),
      });
      if (!establishment) throw new TRPCError({ code: "NOT_FOUND", message: "Establishment not found" });

      const existing = await db.query.cbnMerchantRegistrations.findFirst({
        where: eq(cbnMerchantRegistrations.establishmentId, input.establishmentId),
      });
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

      const [registration] = await db.insert(cbnMerchantRegistrations).values({
        establishmentId: input.establishmentId,
        cbnMerchantId: regResult.cbnMerchantId,
        cbnTerminalId: regResult.cbnTerminalId,
        merchantCategoryCode: input.merchantCategoryCode,
        registrationStatus: regResult.status === "active" ? "active" : "pending",
        registeredAt: regResult.status === "active" ? new Date() : undefined,
      }).returning();

      await publishEvent(TOPICS.ESTABLISHMENT_EVENTS, {
        type: "cbn_merchant_registered",
        establishmentId: input.establishmentId,
        cbnMerchantId: regResult.cbnMerchantId,
        userId,
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
      const db = getDb();

      await requirePermission(ctx.user.id, ctx.user.role, RESOURCES_V2.ENAIRA_WALLET, ACTIONS_V2.FREEZE, input.walletId);

      const wallet = await db.query.enairaWallets.findFirst({
        where: eq(enairaWallets.id, input.walletId),
      });
      if (!wallet) throw new TRPCError({ code: "NOT_FOUND", message: "eNaira wallet not found" });

      await callEnairaGateway("/api/v1/wallets/status", "PUT", {
        cbnWalletId: wallet.cbnWalletId,
        status: input.status,
        reason: input.reason,
      });

      await db.update(enairaWallets)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(enairaWallets.id, input.walletId));

      await createAuditLog(db, {
        userId: ctx.user.id,
        action: `enaira_wallet_${input.status}`,
        resourceType: "enaira_wallet",
        resourceId: input.walletId,
        metadata: { reason: input.reason, adminId: ctx.user.id },
      });

      await cacheDel(`enaira:wallet:${wallet.userId}`);

      return { success: true, status: input.status };
    }),
});
