import { z } from "zod";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { Parser } from "json2csv";
import { TRPCError } from "@trpc/server";
import { getDb, withTransaction } from "../db";
import { walletBalances, walletTransactions, walletBalanceAlerts, walletSpendingLimits, scheduledPayments, walletRecurringPayments, qrPaymentTokens, establishments } from "../../drizzle/schema";
import { eq, and, desc, sql, gte, lte, ilike, or, count } from "drizzle-orm";
import { createAuditLog, createUserNotification } from "../db";
import { notifyOwner } from "../_core/notification";
import { _highValueTokens } from "./biometric";
import { HIGH_VALUE_TX_THRESHOLD_USD } from "../../shared/const";
import { checkAndAutoFlag } from "./bisIntegration";
import { stripe } from "../_core/stripe";
import { cacheGet, cacheSet } from "../_core/redis";
import { publishEvent, TOPICS } from "../_core/kafka";
import { requirePermission, RESOURCES, ACTIONS } from "../_core/permify";
import { recordWalletTransaction } from "../_core/metrics";
import { getOrCreateAccount, createTransfer, LEDGER_CODES, CURRENCY_CODES, TRANSFER_CODES } from "../_core/tigerbeetle";
import { getFxRate, getLiveRates } from "../_core/fxRates";

// Fallback USD rates (used only when live FX service is unreachable)
const APPROX_USD_RATES: Record<string, number> = {
  USDC: 1, USD: 1, "CBDC-NG": 0.00065, "CBDC-KE": 0.0077, "CBDC-GH": 0.067,
  "CBDC-ZA": 0.054, XLM: 0.11, NGN: 0.00065, KES: 0.0077, GHS: 0.067, ZAR: 0.054,
};

/** Get USD equivalent of an amount using live rates, falling back to APPROX_USD_RATES */
async function getUsdEquivalent(amount: number, currency: string): Promise<number> {
  try {
    const { rate } = await getFxRate(currency, "USD");
    return amount * rate;
  } catch {
    return amount * (APPROX_USD_RATES[currency] ?? 1);
  }
}

// Module-level set for daily critical breach dedup (resets on server restart)
const _criticalBreachNotifiedToday = new Set<string>();

// ── Helpers ────────────────────────────────────────────────────────────────────
const WALLET_CURRENCIES = ["USDC", "CBDC-NG", "CBDC-KE", "CBDC-GH", "CBDC-ZA", "XLM", "NGN", "KES", "GHS", "ZAR", "USD"] as const;
type WalletCurrency = typeof WALLET_CURRENCIES[number];

const CURRENCY_LABELS: Record<WalletCurrency, string> = {
  "USDC": "USDC (Circle)",
  "CBDC-NG": "CBDC-NG (eNaira)",
  "CBDC-KE": "CBDC-KE (eCedi)",
  "CBDC-GH": "CBDC-GH",
  "CBDC-ZA": "CBDC-ZA (Rand Digital)",
  "XLM": "Stellar XLM",
  "NGN": "Nigerian Naira",
  "KES": "Kenyan Shilling",
  "GHS": "Ghanaian Cedi",
  "ZAR": "South African Rand",
  "USD": "US Dollar",
};

const CURRENCY_NETWORKS: Record<WalletCurrency, string> = {
  "USDC": "Stellar / Ethereum",
  "CBDC-NG": "CBN Digital",
  "CBDC-KE": "CBK Digital",
  "CBDC-GH": "BOG Digital",
  "CBDC-ZA": "SARB Digital",
  "XLM": "Stellar",
  "NGN": "CBN",
  "KES": "CBK",
  "GHS": "BOG",
  "ZAR": "SARB",
  "USD": "SWIFT",
};

async function ensureDefaultBalances(userId: string) {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(walletBalances).where(eq(walletBalances.userId, String(userId)));
  if (existing.length > 0) return;
  // Create default zero balances for key currencies
  const defaults: WalletCurrency[] = ["USDC", "CBDC-NG", "XLM"];
  for (const currency of defaults) {
    await db.insert(walletBalances).values({
      id: crypto.randomUUID(),
      userId,
      currency,
      balance: "0",
      lockedBalance: "0",
      walletAddress: `tp_${currency.toLowerCase().replace("-", "_")}_${String(userId).slice(0, 8)}`,
      network: CURRENCY_NETWORKS[currency],
      createdAt: Math.floor(Date.now() / 1000),
      updatedAt: Math.floor(Date.now() / 1000),
    });
  }
}

// ── Router ────────────────────────────────────────────────────────────────────
export const walletRouter = router({
  // Get all balances for the current user
  balances: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    await ensureDefaultBalances(String(ctx.user.id));
    const rows = await db
      .select()
      .from(walletBalances)
      .where(eq(walletBalances.userId, String(ctx.user.id)))
      .orderBy(walletBalances.currency);
    return rows.map((r) => ({
      ...r,
      label: CURRENCY_LABELS[r.currency as WalletCurrency] || r.currency,
      network: CURRENCY_NETWORKS[r.currency as WalletCurrency] || r.network,
      balance: parseFloat(r.balance as unknown as string),
      lockedBalance: parseFloat(r.lockedBalance as unknown as string),
    }));
  }),

  // Get transaction history (cursor-based pagination)
  transactions: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(20),
      cursor: z.number().optional(), // createdAt (ms) of last item — fetch items older than this
      type: z.enum(["send", "receive", "swap", "deposit", "withdraw", "fee"]).optional(),
      currency: z.enum(WALLET_CURRENCIES).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { items: [], nextCursor: null as number | null, hasMore: false };
      const limit = input?.limit ?? 20;
      const conditions = [eq(walletTransactions.userId, String(ctx.user.id))];
      if (input?.type) conditions.push(eq(walletTransactions.type, input.type));
      if (input?.currency) conditions.push(eq(walletTransactions.fromCurrency, input.currency));
      if (input?.cursor) {
        conditions.push(sql`${walletTransactions.createdAt} < ${input.cursor}`);
      }
      const rows = await db
        .select()
        .from(walletTransactions)
        .where(and(...conditions))
        .orderBy(desc(walletTransactions.createdAt))
        .limit(limit + 1);
      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? page[page.length - 1].createdAt : null;
      return {
        items: page.map((tx) => ({
          ...tx,
          amount: parseFloat(tx.amount as unknown as string),
          toAmount: tx.toAmount ? parseFloat(tx.toAmount as unknown as string) : null,
          fee: parseFloat(tx.fee as unknown as string),
        })),
        nextCursor,
        hasMore,
      };
    }),
  // Get total transaction count for badge display
  getTransactionCount: protectedProcedure
    .input(z.object({
      type: z.enum(["send", "receive", "swap", "deposit", "withdraw", "fee"]).optional(),
      currency: z.enum(WALLET_CURRENCIES).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { count: 0 };
      const conditions = [eq(walletTransactions.userId, String(ctx.user.id))];
      if (input?.type) conditions.push(eq(walletTransactions.type, input.type));
      if (input?.currency) conditions.push(eq(walletTransactions.fromCurrency, input.currency));
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(walletTransactions)
        .where(and(...conditions));
      return { count: Number(count) };
    }),

  // Send funds
  send: protectedProcedure
    .input(z.object({
      currency: z.enum(WALLET_CURRENCIES),
      amount: z.number().positive(),
      counterparty: z.string().min(1).max(200),
      counterpartyAddress: z.string().optional(),
      note: z.string().max(500).optional(),
      biometricToken: z.string().optional(),
      idempotencyKey: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requirePermission(String(ctx.user.id), ctx.user.role, RESOURCES.WALLET, ACTIONS.EDIT);
      // Idempotency check
      if (input.idempotencyKey) {
        const existing = await cacheGet<string>(`idem:send:${input.idempotencyKey}`);
        if (existing) return JSON.parse(existing);
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Biometric re-auth gate for high-value transactions
      const usdEquivalent = await getUsdEquivalent(input.amount, input.currency);
      if (usdEquivalent >= HIGH_VALUE_TX_THRESHOLD_USD) {
        if (!input.biometricToken) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `Transactions above $${HIGH_VALUE_TX_THRESHOLD_USD} USD require biometric re-authentication. Please verify your identity.`,
          });
        }
        // Validate the biometric token
        const entry = _highValueTokens.get(input.biometricToken);
        if (!entry) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Biometric token not found or already used." });
        }
        if (entry.userId !== String(ctx.user.id)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Biometric token does not belong to this user." });
        }
        if (entry.expiresAt < Date.now()) {
          _highValueTokens.delete(input.biometricToken);
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Biometric token expired. Please re-authenticate." });
        }
        if (Math.abs(entry.amount - input.amount) > 0.0001 || entry.currency !== input.currency) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Biometric token was issued for a different transaction." });
        }
        // Consume the token (one-time use)
        _highValueTokens.delete(input.biometricToken);
      }

      // Check spending limits before executing
      const activeLimits = await db
        .select()
        .from(walletSpendingLimits)
        .where(and(
          eq(walletSpendingLimits.userId, String(ctx.user.id)),
          eq(walletSpendingLimits.currency, input.currency),
          eq(walletSpendingLimits.isActive, true),
        ));
      if (activeLimits.length > 0) {
        const nowSec = Math.floor(Date.now() / 1000);
        const dayStart = nowSec - (nowSec % 86400); // start of today UTC
        const monthStart = Math.floor(new Date(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1).getTime() / 1000);
        // Sum outbound transactions in the current period
        const sentRows = await db
          .select({ total: sql<string>`coalesce(sum(cast(amount as decimal)), 0)` })
          .from(walletTransactions)
          .where(and(
            eq(walletTransactions.userId, String(ctx.user.id)),
            eq(walletTransactions.fromCurrency, input.currency),
            eq(walletTransactions.type, "send"),
            gte(walletTransactions.createdAt, dayStart * 1000), // createdAt is ms
          ));
        const dailySpent = parseFloat(sentRows[0]?.total ?? "0");
        const monthSentRows = await db
          .select({ total: sql<string>`coalesce(sum(cast(amount as decimal)), 0)` })
          .from(walletTransactions)
          .where(and(
            eq(walletTransactions.userId, String(ctx.user.id)),
            eq(walletTransactions.fromCurrency, input.currency),
            eq(walletTransactions.type, "send"),
            gte(walletTransactions.createdAt, monthStart * 1000),
          ));
        const monthlySpent = parseFloat(monthSentRows[0]?.total ?? "0");
        for (const limit of activeLimits) {
          const limitAmt = parseFloat(limit.limitAmount as unknown as string);
          const spent = limit.period === "daily" ? dailySpent : monthlySpent;
          if (spent + input.amount > limitAmt) {
            const periodLabel = limit.period === "daily" ? "Daily" : "Monthly";
            const resetLabel = limit.period === "daily" ? "midnight tonight (UTC)" : "the 1st of next month";
            // Notify the user about the blocked transaction (fire-and-forget)
            createUserNotification({
              userId: ctx.user.id,
              category: "system",
              title: `⚠️ ${periodLabel} Spending Limit Reached`,
              content: `Your transaction of ${input.amount.toFixed(2)} ${input.currency} to "${input.counterparty}" was blocked. ` +
                `${periodLabel} limit: ${limitAmt.toFixed(2)} ${input.currency}. ` +
                `Already spent: ${spent.toFixed(2)} ${input.currency}. ` +
                `Your limit resets at ${resetLabel}.`,
              actionUrl: "/wallet",
              actionLabel: "View Spending Limits",
            }).catch(() => {});
            throw new TRPCError({
              code: "FORBIDDEN",
              message: `${periodLabel} spending limit of ${limitAmt.toFixed(2)} ${input.currency} exceeded. ` +
                `Spent so far: ${spent.toFixed(2)}, attempted: ${input.amount.toFixed(2)}. ` +
                `Limit resets at ${resetLabel}.`,
            });
          }
        }
      }
      // Per-user rate limit: max 10 sends per minute
      const sendRateKey = `rl:wallet:send:${ctx.user.id}`;
      const sendCount = await cacheGet<number>(sendRateKey);
      if (sendCount !== null && sendCount >= 10) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit: max 10 sends per minute. Please wait." });
      }
      await cacheSet(sendRateKey, (sendCount ?? 0) + 1, 60);

      // Atomic balance deduction using SQL transaction with row-level locking
      const amountCents = Math.round(input.amount * 1_000_000); // 6 decimal places for precision
      const feeCents = Math.round(amountCents * 1 / 1000); // 0.1% fee in micros
      const totalCents = amountCents + feeCents;
      const fee = totalCents / 1_000_000;
      const total = totalCents / 1_000_000;
      const txId = crypto.randomUUID();

      const result = await withTransaction(async (tx) => {
        // Row-level lock: SELECT ... FOR UPDATE prevents concurrent modification
        const [bal] = await tx`
          SELECT id, balance, locked_balance FROM wallet_balances
          WHERE user_id = ${String(ctx.user.id)} AND currency = ${input.currency}
          FOR UPDATE
        `;
        if (!bal || parseFloat(bal.balance) < total) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Insufficient balance" });
        }
        const newBalance = parseFloat(bal.balance) - total;
        await tx`
          UPDATE wallet_balances SET balance = ${String(newBalance)}, updated_at = ${Math.floor(Date.now() / 1000)}
          WHERE id = ${bal.id}
        `;
        await tx`
          INSERT INTO wallet_transactions (id, user_id, type, status, from_currency, amount, fee, counterparty, counterparty_address, note, tx_hash, completed_at, created_at)
          VALUES (${txId}, ${String(ctx.user.id)}, 'send', 'completed', ${input.currency}, ${String(input.amount)}, ${String(fee)}, ${input.counterparty}, ${input.counterpartyAddress ?? null}, ${input.note ?? null}, ${'0x' + crypto.randomUUID().replace(/-/g, '')}, ${Math.floor(Date.now() / 1000)}, ${Math.floor(Date.now() / 1000)})
        `;
        return { newBalance };
      });

      await createAuditLog({
        actorId: ctx.user.id,
        actorName: ctx.user.name || String(ctx.user.id),
        action: "wallet.send",
        entityType: "wallet_transaction",
        entityId: txId,
        after: { currency: input.currency, amount: input.amount, counterparty: input.counterparty },
      });
      // Check balance alerts after send
      const newBalance = result.newBalance;
      const alerts = await db.select().from(walletBalanceAlerts)
        .where(and(eq(walletBalanceAlerts.userId, String(ctx.user.id)), eq(walletBalanceAlerts.currency, input.currency), eq(walletBalanceAlerts.isActive, true)));
      for (const alert of alerts) {
        if (newBalance <= Number(alert.threshold)) {
          await createUserNotification({
            userId: ctx.user.id,
            category: "system",
            title: `Low ${input.currency} Balance Alert`,
            content: `Your ${input.currency} balance has dropped to ${newBalance.toFixed(4)}, which is at or below your alert threshold of ${Number(alert.threshold).toFixed(4)}. Consider topping up your wallet.`,
            actionUrl: "/wallet",
            actionLabel: "View Wallet",
          });
        }
      }
      // ── Kafka event publishing (fire-and-forget) ──────────────────────────────
      publishEvent(TOPICS.WALLET_TRANSACTIONS, {
        type: "wallet.send.completed",
        payload: {
          txId, userId: String(ctx.user.id), currency: input.currency,
          amount: input.amount, fee, counterparty: input.counterparty,
          newBalance: result.newBalance,
        },
        correlationId: txId,
      }).catch(() => {});

      // ── Prometheus metrics ─────────────────────────────────────────────────────
      recordWalletTransaction("send", Math.round(input.amount * 100));

      // ── TigerBeetle double-entry ledger (fire-and-forget) ──────────────────────
      (async () => {
        try {
          const currCode = CURRENCY_CODES[input.currency as keyof typeof CURRENCY_CODES] || 566;
          const senderAcct = await getOrCreateAccount(ctx.user.id, null, LEDGER_CODES.TOURIST_WALLET, currCode);
          const platformAcct = await getOrCreateAccount(null, null, LEDGER_CODES.PLATFORM_FEE, currCode);
          // Record the send in the ledger (debit sender, credit platform fee)
          if (feeCents > 0) {
            await createTransfer({
              debitAccountId: senderAcct,
              creditAccountId: platformAcct,
              amount: BigInt(feeCents),
              ledgerCode: LEDGER_CODES.PLATFORM_FEE,
              transferCode: TRANSFER_CODES.PLATFORM_FEE,
              idempotencyKey: `fee:${txId}`,
            });
          }
        } catch { /* ledger is non-blocking */ }
      })();

      // ── Gap 1: Auto-flag high-value / high-velocity transactions to BIS ──────
      // Fire-and-forget: never block the send on BIS errors
      checkAndAutoFlag({
        walletTxId: txId,
        userId: String(ctx.user.id),
        currency: input.currency,
        amount: input.amount,
        counterparty: input.counterparty,
      }).catch(() => {});
      const sendResult = { success: true, txId, fee };
      if (input.idempotencyKey) {
        await cacheSet(`idem:send:${input.idempotencyKey}`, JSON.stringify(sendResult), 3600);
      }
      return sendResult;
    }),

  // Get live FX rate between two currencies (live API with fallback chain)
  getFxRate: protectedProcedure
    .input(z.object({
      fromCurrency: z.enum(WALLET_CURRENCIES),
      toCurrency: z.enum(WALLET_CURRENCIES),
      amount: z.number().positive().optional(),
    }))
    .query(async ({ input }) => {
      const { rate: midRate, source } = await getFxRate(input.fromCurrency, input.toCurrency);
      // Spread: 0.3% for same-family (USD/USDC), 0.5% for cross-family
      const sameFamilyPairs = new Set(["USDC", "USD"]);
      const spread = sameFamilyPairs.has(input.fromCurrency) && sameFamilyPairs.has(input.toCurrency) ? 0.003 : 0.005;
      const effectiveRate = midRate * (1 - spread);
      const convertedAmount = input.amount !== undefined ? input.amount * midRate : undefined;
      const effectiveAmount = input.amount !== undefined ? input.amount * effectiveRate : undefined;
      return {
        fromCurrency: input.fromCurrency,
        toCurrency: input.toCurrency,
        rate: midRate,
        effectiveRate,
        spread,
        spreadPct: spread * 100,
        convertedAmount,
        effectiveAmount,
        rateSource: source,
        timestamp: Date.now(),
      };
    }),

  // Cross-currency send: deduct fromCurrency, record toCurrency conversion for recipient
  sendCrossCurrency: protectedProcedure
    .input(z.object({
      fromCurrency: z.enum(WALLET_CURRENCIES),
      toCurrency: z.enum(WALLET_CURRENCIES),
      amount: z.number().positive(),
      counterparty: z.string().min(1).max(200),
      counterpartyAddress: z.string().optional(),
      note: z.string().max(500).optional(),
      biometricToken: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.fromCurrency === input.toCurrency) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Use wallet.send for same-currency transfers." });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      // Compute FX using live rates
      const { rate: fxMidRate, source: fxSource } = await getFxRate(input.fromCurrency, input.toCurrency);
      const spread = 0.005;
      const effectiveRate = fxMidRate * (1 - spread);
      const convertedAmount = input.amount * effectiveRate;
      // Biometric gate for high-value
      const usdEquivalent = await getUsdEquivalent(input.amount, input.fromCurrency);
      if (usdEquivalent >= HIGH_VALUE_TX_THRESHOLD_USD) {
        if (!input.biometricToken) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `Transactions above $${HIGH_VALUE_TX_THRESHOLD_USD} USD require biometric re-authentication.`,
          });
        }
        const entry = _highValueTokens.get(input.biometricToken);
        if (!entry || entry.userId !== String(ctx.user.id) || entry.expiresAt < Date.now()) {
          if (entry) _highValueTokens.delete(input.biometricToken);
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Biometric token invalid or expired." });
        }
        _highValueTokens.delete(input.biometricToken);
      }
      // Check sender balance
      const [bal] = await db.select().from(walletBalances)
        .where(and(eq(walletBalances.userId, String(ctx.user.id)), eq(walletBalances.currency, input.fromCurrency)));
      const currentBal = parseFloat((bal?.balance as unknown as string) ?? "0");
      const fee = input.amount * 0.001;
      const totalDeduct = input.amount + fee;
      if (!bal || currentBal < totalDeduct) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Insufficient ${input.fromCurrency} balance. Need ${totalDeduct.toFixed(4)}, have ${currentBal.toFixed(4)}.`,
        });
      }
      // Deduct from sender
      await db.update(walletBalances)
        .set({ balance: String(currentBal - totalDeduct), updatedAt: Math.floor(Date.now() / 1000) })
        .where(eq(walletBalances.id, bal.id));
      // Record the outbound transaction
      const txId = crypto.randomUUID();
      await db.insert(walletTransactions).values({
        id: txId,
        userId: String(ctx.user.id),
        type: "send",
        status: "completed",
        fromCurrency: input.fromCurrency,
        toCurrency: input.toCurrency,
        amount: String(input.amount),
        toAmount: String(convertedAmount),
        fee: String(fee),
        counterparty: input.counterparty,
        counterpartyAddress: input.counterpartyAddress,
        reference: `FX:${effectiveRate.toFixed(6)}`,
        note: input.note ?? `Cross-currency: 1 ${input.fromCurrency} = ${effectiveRate.toFixed(6)} ${input.toCurrency} (incl. 0.5% spread)`,
        txHash: `0x${crypto.randomUUID().replace(/-/g, "")}`,
        completedAt: Math.floor(Date.now() / 1000),
        createdAt: Math.floor(Date.now() / 1000),
      });
      await createAuditLog({
        actorId: ctx.user.id,
        actorName: ctx.user.name || String(ctx.user.id),
        action: "wallet.sendCrossCurrency",
        entityType: "wallet_transaction",
        entityId: txId,
        after: { fromCurrency: input.fromCurrency, toCurrency: input.toCurrency, amount: input.amount, convertedAmount, effectiveRate, counterparty: input.counterparty },
      });
      // Check balance alerts after deduction
      const newBalance = currentBal - totalDeduct;
      const balAlerts = await db.select().from(walletBalanceAlerts)
        .where(and(eq(walletBalanceAlerts.userId, String(ctx.user.id)), eq(walletBalanceAlerts.currency, input.fromCurrency), eq(walletBalanceAlerts.isActive, true)));
      for (const alert of balAlerts) {
        if (newBalance <= Number(alert.threshold)) {
          await createUserNotification({
            userId: ctx.user.id,
            category: "system",
            title: `Low ${input.fromCurrency} Balance Alert`,
            content: `Your ${input.fromCurrency} balance has dropped to ${newBalance.toFixed(4)}, at or below your alert threshold of ${Number(alert.threshold).toFixed(4)}.`,
            actionUrl: "/wallet",
            actionLabel: "View Wallet",
          });
        }
      }
      // ── Gap 1: Auto-flag cross-currency sends to BIS ────────────────────────
      checkAndAutoFlag({
        walletTxId: txId,
        userId: String(ctx.user.id),
        currency: input.fromCurrency,
        amount: input.amount,
        counterparty: input.counterparty,
      }).catch(() => {});
      return {
        success: true,
        txId,
        fromCurrency: input.fromCurrency,
        toCurrency: input.toCurrency,
        sentAmount: input.amount,
        convertedAmount,
        effectiveRate,
        spread,
        fee,
      };
    }),
  // Deposit fundss (simulate)
  deposit: protectedProcedure
    .input(z.object({
      currency: z.enum(WALLET_CURRENCIES),
      amount: z.number().positive(),
      source: z.string().default("Bank Transfer"),
    }))
    .mutation(async ({ ctx, input }) => {
      const txId = crypto.randomUUID();

      await withTransaction(async (tx) => {
        // Lock balance row (or insert if new)
        const [bal] = await tx`
          SELECT id, balance FROM wallet_balances
          WHERE user_id = ${String(ctx.user.id)} AND currency = ${input.currency}
          FOR UPDATE
        `;
        if (!bal) {
          await tx`
            INSERT INTO wallet_balances (id, user_id, currency, balance, locked_balance, wallet_address, network, created_at, updated_at)
            VALUES (${crypto.randomUUID()}, ${String(ctx.user.id)}, ${input.currency}, ${String(input.amount)}, '0',
              ${'tp_' + input.currency.toLowerCase().replace('-', '_') + '_' + String(ctx.user.id).slice(0, 8)},
              ${CURRENCY_NETWORKS[input.currency]}, ${Math.floor(Date.now() / 1000)}, ${Math.floor(Date.now() / 1000)})
          `;
        } else {
          await tx`
            UPDATE wallet_balances SET balance = ${String(parseFloat(bal.balance) + input.amount)}, updated_at = ${Math.floor(Date.now() / 1000)}
            WHERE id = ${bal.id}
          `;
        }
        await tx`
          INSERT INTO wallet_transactions (id, user_id, type, status, from_currency, amount, fee, counterparty, completed_at, created_at)
          VALUES (${txId}, ${String(ctx.user.id)}, 'deposit', 'completed', ${input.currency}, ${String(input.amount)}, '0', ${input.source}, ${Math.floor(Date.now() / 1000)}, ${Math.floor(Date.now() / 1000)})
        `;
      });
      return { success: true, txId };
    }),

  // Swap currencies using live FX cross-rate with spread
  swap: protectedProcedure
    .input(z.object({
      fromCurrency: z.enum(WALLET_CURRENCIES),
      toCurrency: z.enum(WALLET_CURRENCIES),
      amount: z.number().positive(),
      idempotencyKey: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requirePermission(String(ctx.user.id), ctx.user.role, RESOURCES.WALLET, ACTIONS.EDIT);
      if (input.fromCurrency === input.toCurrency) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot swap same currency" });
      }
      // Idempotency check
      if (input.idempotencyKey) {
        const existing = await cacheGet<string>(`idem:swap:${input.idempotencyKey}`);
        if (existing) return JSON.parse(existing);
      }
      // Per-user rate limit: max 5 swaps per minute
      const swapRateKey = `rl:wallet:swap:${ctx.user.id}`;
      const swapCount = await cacheGet<number>(swapRateKey);
      if (swapCount !== null && swapCount >= 5) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit: max 5 swaps per minute." });
      }
      await cacheSet(swapRateKey, (swapCount ?? 0) + 1, 60);

      // Cross-rate via live FX service with spread
      const { rate: fxMid, source: fxSrc } = await getFxRate(input.fromCurrency, input.toCurrency);
      const sameFamilyPairs = new Set(["USDC", "USD"]);
      const spread = sameFamilyPairs.has(input.fromCurrency) && sameFamilyPairs.has(input.toCurrency) ? 0.003 : 0.005;
      const rate = fxMid * (1 - spread);
      const toAmount = input.amount * rate;
      const feeCents = Math.round(input.amount * 1_000_000 * 2 / 1000); // 0.2% fee in micros
      const fee = feeCents / 1_000_000;
      const txId = crypto.randomUUID();

      await withTransaction(async (tx) => {
        // Lock source balance row
        const [fromBal] = await tx`
          SELECT id, balance FROM wallet_balances
          WHERE user_id = ${String(ctx.user.id)} AND currency = ${input.fromCurrency}
          FOR UPDATE
        `;
        if (!fromBal || parseFloat(fromBal.balance) < input.amount + fee) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Insufficient balance" });
        }
        // Deduct source
        await tx`
          UPDATE wallet_balances SET balance = ${String(parseFloat(fromBal.balance) - input.amount - fee)}, updated_at = ${Math.floor(Date.now() / 1000)}
          WHERE id = ${fromBal.id}
        `;
        // Lock or create destination balance
        const [toBal] = await tx`
          SELECT id, balance FROM wallet_balances
          WHERE user_id = ${String(ctx.user.id)} AND currency = ${input.toCurrency}
          FOR UPDATE
        `;
        if (!toBal) {
          await tx`
            INSERT INTO wallet_balances (id, user_id, currency, balance, locked_balance, wallet_address, network, created_at, updated_at)
            VALUES (${crypto.randomUUID()}, ${String(ctx.user.id)}, ${input.toCurrency}, ${String(toAmount)}, '0',
              ${'tp_' + input.toCurrency.toLowerCase().replace('-', '_') + '_' + String(ctx.user.id).slice(0, 8)},
              ${CURRENCY_NETWORKS[input.toCurrency]}, ${Math.floor(Date.now() / 1000)}, ${Math.floor(Date.now() / 1000)})
          `;
        } else {
          await tx`
            UPDATE wallet_balances SET balance = ${String(parseFloat(toBal.balance) + toAmount)}, updated_at = ${Math.floor(Date.now() / 1000)}
            WHERE id = ${toBal.id}
          `;
        }
        // Record transaction
        await tx`
          INSERT INTO wallet_transactions (id, user_id, type, status, from_currency, to_currency, amount, to_amount, fee, completed_at, created_at)
          VALUES (${txId}, ${String(ctx.user.id)}, 'swap', 'completed', ${input.fromCurrency}, ${input.toCurrency},
            ${String(input.amount)}, ${String(toAmount)}, ${String(fee)}, ${Math.floor(Date.now() / 1000)}, ${Math.floor(Date.now() / 1000)})
        `;
      });
      const result = { success: true, txId, toAmount, rate, fee, spread };
      if (input.idempotencyKey) {
        await cacheSet(`idem:swap:${input.idempotencyKey}`, JSON.stringify(result), 3600);
      }
      return result;
    }),

  // Top Up wallet via a payout finance request (links wallet to embedded finance)
  topUp: protectedProcedure
    .input(z.object({
      currency: z.enum(WALLET_CURRENCIES),
      amount: z.number().positive(),
      bankName: z.string().min(1),
      accountNumber: z.string().min(1),
      accountName: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      // Derive wallet address for this currency
      const walletAddress = `tp_${input.currency.toLowerCase().replace("-", "_")}_${String(ctx.user.id).slice(0, 8)}`;
      const metadata = JSON.stringify({
        bankName: input.bankName,
        accountNumber: input.accountNumber,
        accountName: input.accountName,
        walletAddress,
        walletCurrency: input.currency,
        source: "wallet_topup",
      });
      // Create a payout finance request representing the top-up
      const result = await db.execute(
        sql`INSERT INTO finance_requests (id, user_id, type, amount, currency, status, description, metadata, created_at, updated_at)
            VALUES (gen_random_uuid()::text, ${ctx.user.id}, 'payout', ${input.amount}, ${input.currency}, 'pending',
              ${`Wallet top-up: ${input.currency} ${input.amount} to ${walletAddress}`},
              ${metadata}::jsonb, ${Math.floor(Date.now() / 1000)}, ${Math.floor(Date.now() / 1000)})
            RETURNING *`
      );
      const row = (result as any[])[0];
      await createAuditLog({
        actorId: ctx.user.id,
        actorName: ctx.user.name || String(ctx.user.id),
        action: "wallet.topup.request",
        entityType: "finance_request",
        entityId: row.id,
        after: { currency: input.currency, amount: input.amount, walletAddress },
      });
      return {
        requestId: row.id,
        status: row.status,
        amount: Number(row.amount),
        currency: row.currency,
        walletAddress,
        message: "Top-up request submitted. Funds will be credited after admin approval.",
      };
    }),

  // Export user's own transactions as CSV
  exportTransactions: protectedProcedure
    .input(z.object({
      currency: z.string().optional(),
      limit: z.number().min(1).max(5000).default(1000),
    }).optional())
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { csv: "", filename: "wallet-transactions.csv", rowCount: 0 };
      const conditions = [eq(walletTransactions.userId, String(ctx.user.id))];
      if (input?.currency) conditions.push(eq(walletTransactions.fromCurrency, input.currency));
      const rows = await db
        .select()
        .from(walletTransactions)
        .where(and(...conditions))
        .orderBy(desc(walletTransactions.createdAt))
        .limit(input?.limit ?? 1000);
      const fields = [
        { label: "ID", value: "id" },
        { label: "Type", value: "type" },
        { label: "Status", value: "status" },
        { label: "Amount", value: (row: any) => Number(row.amount) },
        { label: "Currency", value: "fromCurrency" },
        { label: "To Amount", value: (row: any) => row.toAmount ? Number(row.toAmount) : "" },
        { label: "To Currency", value: (row: any) => row.toCurrency ?? "" },
        { label: "Fee", value: (row: any) => Number(row.fee) },
        { label: "Counterparty", value: (row: any) => row.counterparty ?? "" },
        { label: "Note", value: (row: any) => row.note ?? "" },
        { label: "Tx Hash", value: (row: any) => row.txHash ?? "" },
        { label: "Created At", value: (row: any) => new Date(Number(row.createdAt)).toISOString() },
        { label: "Completed At", value: (row: any) => row.completedAt ? new Date(Number(row.completedAt)).toISOString() : "" },
      ];
      const parser = new Parser({ fields: fields as any });
      const csv = rows.length > 0 ? parser.parse(rows) : "";
      const filename = `wallet-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
      return { csv, filename, rowCount: rows.length };
    }),

  // ─── Balance Alerts ────────────────────────────────────────────────────────

  // Get all balance alerts for the current user
  getBalanceAlerts: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select()
      .from(walletBalanceAlerts)
      .where(eq(walletBalanceAlerts.userId, String(ctx.user.id)))
      .orderBy(walletBalanceAlerts.currency);
    return rows.map(r => ({
      id: r.id,
      currency: r.currency,
      threshold: Number(r.threshold),
      isActive: r.isActive,
      createdAt: Number(r.createdAt),
    }));
  }),

  // Create or update a balance alert for a given currency
  setBalanceAlert: protectedProcedure
    .input(z.object({
      currency: z.string().min(1).max(20),
      threshold: z.number().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const userId = String(ctx.user.id);
      const existing = await db
        .select()
        .from(walletBalanceAlerts)
        .where(and(eq(walletBalanceAlerts.userId, userId), eq(walletBalanceAlerts.currency, input.currency)))
        .limit(1);
      const now = Math.floor(Date.now() / 1000);
      if (existing.length > 0) {
        await db
          .update(walletBalanceAlerts)
          .set({ threshold: String(input.threshold), isActive: true, updatedAt: now })
          .where(eq(walletBalanceAlerts.id, existing[0].id));
        return { id: existing[0].id, updated: true };
      } else {
        const id = crypto.randomUUID();
        await db.insert(walletBalanceAlerts).values({
          id,
          userId,
          currency: input.currency,
          threshold: String(input.threshold),
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });
        return { id, updated: false };
      }
    }),

  // Toggle a balance alert on/off
  toggleBalanceAlert: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [alert] = await db
        .select()
        .from(walletBalanceAlerts)
        .where(and(eq(walletBalanceAlerts.id, input.id), eq(walletBalanceAlerts.userId, String(ctx.user.id))))
        .limit(1);
      if (!alert) throw new TRPCError({ code: "NOT_FOUND", message: "Alert not found" });
      await db
        .update(walletBalanceAlerts)
        .set({ isActive: !alert.isActive, updatedAt: Math.floor(Date.now() / 1000) })
        .where(eq(walletBalanceAlerts.id, input.id));
      return { isActive: !alert.isActive };
    }),

  // Delete a balance alert
  deleteBalanceAlert: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db
        .delete(walletBalanceAlerts)
        .where(and(eq(walletBalanceAlerts.id, input.id), eq(walletBalanceAlerts.userId, String(ctx.user.id))));
      return { deleted: true };
    }),
  // Update threshold for an existing balance alert (inline edit)
  updateBalanceAlert: protectedProcedure
    .input(z.object({
      id: z.string().min(1),
      threshold: z.number().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const now = Math.floor(Date.now() / 1000);
      await db
        .update(walletBalanceAlerts)
        .set({ threshold: String(input.threshold), updatedAt: now })
        .where(and(eq(walletBalanceAlerts.id, input.id), eq(walletBalanceAlerts.userId, String(ctx.user.id))));
      return { updated: true };
    }),
  // Get total portfolio value (sum of all balances in USD equivalent)
  portfolioSummary: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { totalUsd: 0, balanceCount: 0, txCount: 0 };
    await ensureDefaultBalances(String(ctx.user.id));
    const balances = await db.select().from(walletBalances).where(eq(walletBalances.userId, String(ctx.user.id)));
    const [{ txCount }] = await db
      .select({ txCount: sql<number>`count(*)` })
      .from(walletTransactions)
      .where(eq(walletTransactions.userId, String(ctx.user.id)));
    // Simplified USD conversion rates for demo
    const USD_RATES: Record<string, number> = {
      "USDC": 1, "USD": 1, "XLM": 0.11,
      "CBDC-NG": 1, "CBDC-KE": 1, "CBDC-GH": 1, "CBDC-ZA": 1,
      "NGN": 0.00063, "KES": 0.0077, "GHS": 0.065, "ZAR": 0.054,
    };
    const totalUsd = balances.reduce((sum, b) => {
      const rate = USD_RATES[b.currency] ?? 1;
      return sum + parseFloat(b.balance as unknown as string) * rate;
    }, 0);
    return { totalUsd, balanceCount: balances.length, txCount: Number(txCount) };
  }),

  // Real-time: check which active alerts are currently breached (balance <= threshold)
  // Polled every 10s by PWA DigitalWallet page and mobile wallet screen
  // ── Spending Limits ────────────────────────────────────────────────────────
  getSpendingLimits: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const limits = await db
      .select()
      .from(walletSpendingLimits)
      .where(eq(walletSpendingLimits.userId, String(ctx.user.id)))
      .orderBy(desc(walletSpendingLimits.createdAt));
    // Compute spentToday and spentThisMonth for each limit
    const nowMs = Date.now();
    const todayStartMs = new Date().setHours(0, 0, 0, 0);
    const monthStartMs = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    const limitsWithUsage = await Promise.all(limits.map(async (limit) => {
      try {
        const [todayRow] = await db
          .select({ total: sql<string>`COALESCE(SUM(CAST(${walletTransactions.amount} AS DECIMAL(20,6))), 0)` })
          .from(walletTransactions)
          .where(and(
            eq(walletTransactions.userId, String(ctx.user.id)),
            eq(walletTransactions.fromCurrency, limit.currency),
            eq(walletTransactions.type, "send"),
            gte(walletTransactions.createdAt, todayStartMs),
          ));
        const [monthRow] = await db
          .select({ total: sql<string>`COALESCE(SUM(CAST(${walletTransactions.amount} AS DECIMAL(20,6))), 0)` })
          .from(walletTransactions)
          .where(and(
            eq(walletTransactions.userId, String(ctx.user.id)),
            eq(walletTransactions.fromCurrency, limit.currency),
            eq(walletTransactions.type, "send"),
            gte(walletTransactions.createdAt, monthStartMs),
          ));
        // Compute next reset timestamp (UTC)
        const now = new Date();
        let nextResetAt: number;
        if (limit.period === "daily") {
          const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
          nextResetAt = tomorrow.getTime();
        } else {
          nextResetAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).getTime();
        }
        return {
          ...limit,
          spentToday: parseFloat(todayRow?.total ?? "0"),
          spentThisMonth: parseFloat(monthRow?.total ?? "0"),
          nextResetAt,
        };
      } catch {
        const now = new Date();
        const nextResetAt = limit.period === "daily"
          ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).getTime()
          : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).getTime();
        return { ...limit, spentToday: 0, spentThisMonth: 0, nextResetAt };
      }
    }));
    return limitsWithUsage;
  }),

  setSpendingLimit: protectedProcedure
    .input(z.object({
      currency: z.enum(WALLET_CURRENCIES),
      period: z.enum(["daily", "monthly"]),
      limitAmount: z.number().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const existing = await db
        .select()
        .from(walletSpendingLimits)
        .where(and(
          eq(walletSpendingLimits.userId, String(ctx.user.id)),
          eq(walletSpendingLimits.currency, input.currency),
          eq(walletSpendingLimits.period, input.period),
        ))
        .limit(1);
      if (existing.length > 0) {
        await db
          .update(walletSpendingLimits)
          .set({ limitAmount: String(input.limitAmount), isActive: true, updatedAt: Math.floor(Date.now() / 1000) })
          .where(eq(walletSpendingLimits.id, existing[0].id));
        await createAuditLog({
          actorId: ctx.user.id,
          actorName: ctx.user.name || String(ctx.user.id),
          action: "wallet.updateSpendingLimit",
          entityType: "wallet_spending_limit",
          entityId: existing[0].id,
          after: { currency: input.currency, period: input.period, limitAmount: input.limitAmount },
        });
        return { id: existing[0].id, updated: true };
      }
      const [row] = await db
        .insert(walletSpendingLimits)
        .values({
          userId: String(ctx.user.id),
          currency: input.currency,
          period: input.period,
          limitAmount: String(input.limitAmount),
        })
        .returning();
      await createAuditLog({
        actorId: ctx.user.id,
        actorName: ctx.user.name || String(ctx.user.id),
        action: "wallet.setSpendingLimit",
        entityType: "wallet_spending_limit",
        entityId: row.id,
        after: { currency: input.currency, period: input.period, limitAmount: input.limitAmount },
      });
      return { id: row.id, updated: false };
    }),

  toggleSpendingLimit: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [existing] = await db
        .select()
        .from(walletSpendingLimits)
        .where(and(
          eq(walletSpendingLimits.id, input.id),
          eq(walletSpendingLimits.userId, String(ctx.user.id)),
        ))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Spending limit not found" });
      const newActive = !existing.isActive;
      await db
        .update(walletSpendingLimits)
        .set({ isActive: newActive, updatedAt: Math.floor(Date.now() / 1000) })
        .where(eq(walletSpendingLimits.id, input.id));
      return { id: input.id, isActive: newActive };
    }),

  deleteSpendingLimit: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db
        .delete(walletSpendingLimits)
        .where(and(
          eq(walletSpendingLimits.id, input.id),
          eq(walletSpendingLimits.userId, String(ctx.user.id)),
        ));
      await createAuditLog({
        actorId: ctx.user.id,
        actorName: ctx.user.name || String(ctx.user.id),
        action: "wallet.deleteSpendingLimit",
        entityType: "wallet_spending_limit",
        entityId: input.id,
        after: { deleted: true },
      });
      return { success: true };
    }),

  activeAlertBreaches: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const userId = String(ctx.user.id);
    const alerts = await db
      .select()
      .from(walletBalanceAlerts)
      .where(and(eq(walletBalanceAlerts.userId, userId), eq(walletBalanceAlerts.isActive, true)));
    if (alerts.length === 0) return [];
    const balances = await db
      .select()
      .from(walletBalances)
      .where(eq(walletBalances.userId, userId));
    const balanceMap = new Map(balances.map(b => [b.currency, parseFloat(b.balance as unknown as string)]));

    const breaches = alerts
      .filter(alert => {
        const balance = balanceMap.get(alert.currency) ?? 0;
        return balance <= Number(alert.threshold);
      })
      .map(alert => {
        const balance = balanceMap.get(alert.currency) ?? 0;
        const threshold = Number(alert.threshold);
        // critical: balance is exactly at or below threshold (at or below the line)
        // warning: balance is between threshold and 110% of threshold (approaching)
        const severity: "critical" | "warning" = balance <= threshold ? "critical" : "warning";
        return {
          id: alert.id,
          currency: alert.currency,
          threshold,
          currentBalance: balance,
          severity,
        };
      });

    // Daily owner notification for first critical breach detection per user per day
    const criticalBreaches = breaches.filter(b => b.severity === "critical");
    if (criticalBreaches.length > 0) {
      const todayKey = `${userId}:${new Date().toISOString().slice(0, 10)}`;
      if (!_criticalBreachNotifiedToday.has(todayKey)) {
        _criticalBreachNotifiedToday.add(todayKey);
        const currencyList = criticalBreaches
          .map(b => `${b.currency} (balance: ${b.currentBalance.toFixed(4)}, threshold: ${b.threshold.toFixed(4)})`)
          .join(", ");
        notifyOwner({
          title: `\u{1F6A8} Critical Wallet Balance Alert \u2014 ${ctx.user.name || ctx.user.email}`,
          content: `User ${ctx.user.name || ctx.user.email} (ID: ${ctx.user.id}) has ${criticalBreaches.length} critical wallet balance breach(es): ${currencyList}. Balances are at or below configured alert thresholds.`,
        }).catch(() => { /* non-blocking */ });
      }
    }

    return breaches;
  }),

  // ─── Get single transaction by ID (with biometric approval status) ────────────────────
  getTransaction: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tx = await db
        .select()
        .from(walletTransactions)
        .where(
          and(
            eq(walletTransactions.id, input.id),
            eq(walletTransactions.userId, String(ctx.user.id))
          )
        )
        .limit(1);
      if (!tx[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found" });
      // Check if this transaction had a biometric approval (look in audit_logs)
      const { auditLogs } = await import("../../drizzle/schema");
      const biometricApproval = await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.actorId, ctx.user.id),
            eq(auditLogs.action, "biometric.highValueToken.verified"),
            eq(auditLogs.entityId, input.id)
          )
        )
        .limit(1);
      return {
        ...tx[0],
        amount: parseFloat(tx[0].amount as unknown as string),
        toAmount: tx[0].toAmount ? parseFloat(tx[0].toAmount as unknown as string) : null,
        fee: parseFloat(tx[0].fee as unknown as string),
        biometricApproved: biometricApproval.length > 0,
        biometricApprovedAt: biometricApproval[0]?.createdAt ?? null,
      };
    }),

  // ─── Wallet Statement Export ───────────────────────────────────────────────
  /** Export a date-ranged CSV wallet statement */
  exportStatement: protectedProcedure
    .input(z.object({
      dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateFrom must be YYYY-MM-DD"),
      dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateTo must be YYYY-MM-DD"),
      currency: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { csv: "", filename: `wallet-statement-${input.dateFrom}-to-${input.dateTo}.csv`, rowCount: 0, dateFrom: input.dateFrom, dateTo: input.dateTo };
      const fromTs = Math.floor(new Date(input.dateFrom + "T00:00:00Z").getTime() / 1000);
      const toTs = Math.floor(new Date(input.dateTo + "T23:59:59Z").getTime() / 1000);
      const conditions = [
        eq(walletTransactions.userId, String(ctx.user.id)),
        gte(walletTransactions.createdAt, fromTs),
        sql`${walletTransactions.createdAt} <= ${toTs}`,
      ];
      if (input.currency) conditions.push(eq(walletTransactions.fromCurrency, input.currency));
      const rows = await db
        .select()
        .from(walletTransactions)
        .where(and(...conditions))
        .orderBy(desc(walletTransactions.createdAt))
        .limit(5000);
      const fields = [
        { label: "Date", value: (r: any) => new Date(Number(r.createdAt) * 1000).toISOString().slice(0, 10) },
        { label: "Time (UTC)", value: (r: any) => new Date(Number(r.createdAt) * 1000).toISOString().slice(11, 19) },
        { label: "Type", value: "type" },
        { label: "Status", value: "status" },
        { label: "Amount", value: (r: any) => Number(r.amount) },
        { label: "Currency", value: "fromCurrency" },
        { label: "To Amount", value: (r: any) => r.toAmount ? Number(r.toAmount) : "" },
        { label: "To Currency", value: (r: any) => r.toCurrency ?? "" },
        { label: "Fee", value: (r: any) => Number(r.fee) },
        { label: "Counterparty", value: (r: any) => r.counterparty ?? "" },
        { label: "Note", value: (r: any) => r.note ?? "" },
        { label: "Tx Hash", value: (r: any) => r.txHash ?? "" },
        { label: "Completed At", value: (r: any) => r.completedAt ? new Date(Number(r.completedAt) * 1000).toISOString() : "" },
      ];
      const parser = new Parser({ fields: fields as any });
      const csv = rows.length > 0 ? parser.parse(rows) : "";
      const filename = `wallet-statement-${input.dateFrom}-to-${input.dateTo}.csv`;
      return { csv, filename, rowCount: rows.length, dateFrom: input.dateFrom, dateTo: input.dateTo };
    }),

  /** Export a date-ranged Markdown wallet statement (LLM-formatted) */
  exportStatementPdf: protectedProcedure
    .input(z.object({
      dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateFrom must be YYYY-MM-DD"),
      dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateTo must be YYYY-MM-DD"),
      currency: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { markdown: "", filename: `wallet-statement-${input.dateFrom}-to-${input.dateTo}.md`, rowCount: 0, dateFrom: input.dateFrom, dateTo: input.dateTo };
      const fromTs = Math.floor(new Date(input.dateFrom + "T00:00:00Z").getTime() / 1000);
      const toTs = Math.floor(new Date(input.dateTo + "T23:59:59Z").getTime() / 1000);
      const conditions = [
        eq(walletTransactions.userId, String(ctx.user.id)),
        gte(walletTransactions.createdAt, fromTs),
        sql`${walletTransactions.createdAt} <= ${toTs}`,
      ];
      if (input.currency) conditions.push(eq(walletTransactions.fromCurrency, input.currency));
      const rows = await db
        .select()
        .from(walletTransactions)
        .where(and(...conditions))
        .orderBy(desc(walletTransactions.createdAt))
        .limit(200);
      // Compute summary stats
      const totalIn = rows
        .filter((r) => r.type === "receive" || r.type === "deposit")
        .reduce((s, r) => s + Number(r.amount), 0);
      const totalOut = rows
        .filter((r) => r.type === "send" || r.type === "withdrawal")
        .reduce((s, r) => s + Number(r.amount), 0);
      const totalFees = rows.reduce((s, r) => s + Number(r.fee), 0);
      const currencies = Array.from(new Set(rows.map((r) => r.fromCurrency)));
      // Build a concise transaction table for the LLM
      const txTable = rows.slice(0, 50).map((r) => ({
        date: new Date(Number(r.createdAt) * 1000).toISOString().slice(0, 10),
        type: r.type,
        amount: `${Number(r.amount).toFixed(2)} ${r.fromCurrency}`,
        fee: `${Number(r.fee).toFixed(4)} ${r.fromCurrency}`,
        counterparty: r.counterparty ?? "-",
        status: r.status,
      }));
      const { invokeLLM } = await import("../_core/llm");
      const llmResponse = await invokeLLM({
        messages: [
          {
            role: "system",
            content: "You are a financial document formatter. Generate a professional wallet statement in Markdown format. Include a header, summary section, and a formatted transaction table. Keep it concise and professional.",
          },
          {
            role: "user",
            content: JSON.stringify({
              accountHolder: ctx.user.name ?? "Account Holder",
              statementPeriod: `${input.dateFrom} to ${input.dateTo}`,
              currencies,
              summary: { totalIn: totalIn.toFixed(2), totalOut: totalOut.toFixed(2), totalFees: totalFees.toFixed(4), transactionCount: rows.length },
              transactions: txTable,
              note: rows.length > 50 ? `Showing first 50 of ${rows.length} transactions. Download CSV for full history.` : undefined,
            }),
          },
        ],
      });
      const markdown = llmResponse.choices?.[0]?.message?.content ?? "";
      const filename = `wallet-statement-${input.dateFrom}-to-${input.dateTo}.md`;
      return { markdown, filename, rowCount: rows.length, dateFrom: input.dateFrom, dateTo: input.dateTo };
    }),

  // Multi-currency balance summary with 7-day sparklines
  balanceSummary: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { balances: [] };
    await ensureDefaultBalances(String(ctx.user.id));
    const nowMs = Date.now();
    const sevenDaysAgo = nowMs - 7 * 24 * 60 * 60 * 1000;
    const balRows = await db
      .select()
      .from(walletBalances)
      .where(eq(walletBalances.userId, String(ctx.user.id)));
    const result = await Promise.all(
      balRows.map(async (b) => {
        const bal = parseFloat(b.balance as unknown as string);
        const txRows = await db
          .select()
          .from(walletTransactions)
          .where(
            and(
              eq(walletTransactions.userId, String(ctx.user.id)),
              eq(walletTransactions.fromCurrency, b.currency),
              gte(walletTransactions.createdAt, sevenDaysAgo)
            )
          )
          .orderBy(walletTransactions.createdAt);
        // Build day-by-day net delta map (index 0 = 7 days ago, index 6 = today)
        const dayMap: Record<number, number> = {};
        for (const tx of txRows) {
          const dayIndex = Math.floor((tx.createdAt - sevenDaysAgo) / (24 * 60 * 60 * 1000));
          const clamped = Math.min(6, Math.max(0, dayIndex));
          const amt = parseFloat(tx.amount as unknown as string);
          dayMap[clamped] = (dayMap[clamped] ?? 0) + (tx.type === "receive" || tx.type === "deposit" ? amt : -amt);
        }
        // Build cumulative sparkline (7 points) working backwards from current balance
        const sparkline: number[] = new Array(7).fill(0);
        sparkline[6] = parseFloat(bal.toFixed(2));
        for (let i = 5; i >= 0; i--) {
          sparkline[i] = parseFloat((sparkline[i + 1] - (dayMap[i + 1] ?? 0)).toFixed(2));
        }
        return {
          currency: b.currency,
          label: CURRENCY_LABELS[b.currency as WalletCurrency] || b.currency,
          network: CURRENCY_NETWORKS[b.currency as WalletCurrency] || b.network || "",
          balance: bal,
          lockedBalance: parseFloat(b.lockedBalance as unknown as string),
          sparkline,
          change7d: parseFloat((sparkline[6] - sparkline[0]).toFixed(2)),
          change7dPct: sparkline[0] !== 0 ? parseFloat((((sparkline[6] - sparkline[0]) / Math.abs(sparkline[0])) * 100).toFixed(1)) : 0,
        };
      })
    );
    // Cross-check balance alerts: fetch active alerts for this user
    const alertRows = await db
      .select()
      .from(walletBalanceAlerts)
      .where(
        and(
          eq(walletBalanceAlerts.userId, String(ctx.user.id)),
          eq(walletBalanceAlerts.isActive, true)
        )
      );
    // Build a map: currency -> highest threshold (most conservative alert)
    const alertMap: Record<string, number> = {};
    for (const alert of alertRows) {
      const t = parseFloat(alert.threshold as unknown as string);
      if (!(alert.currency in alertMap) || t > alertMap[alert.currency]) {
        alertMap[alert.currency] = t;
      }
    }
    // Annotate each balance with alert breach info
    const annotated = result.map((b) => ({
      ...b,
      alertThreshold: alertMap[b.currency] ?? null,
      alertBreached: alertMap[b.currency] != null ? b.balance < alertMap[b.currency] : false,
    }));
    annotated.sort((a, b) => b.balance - a.balance);
    return { balances: annotated };
  }),
  // ─── Transaction Receipt ──────────────────────────────────────────────────
  /** Returns a formatted receipt object for a given transaction ID */
  getTransactionReceipt: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [tx] = await db
        .select()
        .from(walletTransactions)
        .where(
          and(
            eq(walletTransactions.id, input.id),
            eq(walletTransactions.userId, String(ctx.user.id))
          )
        )
        .limit(1);
      if (!tx) throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found" });
      const amount = parseFloat(tx.amount as unknown as string);
      const fee = parseFloat(tx.fee as unknown as string);
      const toAmount = tx.toAmount ? parseFloat(tx.toAmount as unknown as string) : null;
      const isCrossCurrency = tx.fromCurrency && tx.toCurrency && tx.fromCurrency !== tx.toCurrency;
      const receipt = {
        receiptId: `RCP-${tx.id.slice(0, 8).toUpperCase()}`,
        transactionId: tx.id,
        type: tx.type,
        status: tx.status,
        amount,
        currency: tx.fromCurrency ?? tx.toCurrency ?? "USDC",
        fee,
        netAmount: amount - fee,
        counterparty: tx.counterparty ?? null,
        counterpartyAddress: tx.counterpartyAddress ?? null,
        reference: tx.reference ?? null,
        note: tx.note ?? null,
        txHash: tx.txHash ?? null,
        isCrossCurrency: !!isCrossCurrency,
        fromCurrency: tx.fromCurrency ?? null,
        toCurrency: tx.toCurrency ?? null,
        convertedAmount: toAmount,
        exchangeRate: isCrossCurrency && toAmount ? (toAmount / amount).toFixed(6) : null,
        createdAt: tx.createdAt ? new Date(Number(tx.createdAt) * 1000).toISOString() : null,
        completedAt: tx.completedAt ? new Date(Number(tx.completedAt) * 1000).toISOString() : null,
        platform: "TourismPay",
        generatedAt: new Date().toISOString(),
      };
      return { receipt };
    }),

  // ─── Scheduled Payments ──────────────────────────────────────────────────────

  schedulePayment: protectedProcedure
    .input(z.object({
      toAddress: z.string().min(1).max(255),
      counterpartyName: z.string().max(255).optional(),
      amount: z.number().positive(),
      currency: z.enum(["USDC", "CBDC-NG", "CBDC-KE", "CBDC-GH", "CBDC-ZA", "XLM", "NGN", "KES", "GHS", "ZAR", "USD"]),
      recurrence: z.enum(["once", "daily", "weekly", "monthly"]).default("once"),
      scheduledAt: z.number().int().positive(), // Unix ms
      note: z.string().max(500).optional(),
      reference: z.string().max(100).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const now = Date.now();
      if (input.scheduledAt <= now) throw new TRPCError({ code: "BAD_REQUEST", message: "Scheduled time must be in the future" });
      const [payment] = await db.insert(scheduledPayments).values({
        userId: String(ctx.user.id),
        toAddress: input.toAddress,
        counterpartyName: input.counterpartyName ?? null,
        amount: String(input.amount),
        currency: input.currency,
        recurrence: input.recurrence,
        note: input.note ?? null,
        reference: input.reference ?? null,
        status: "active",
        scheduledAt: input.scheduledAt,
        nextRunAt: input.scheduledAt,
        runCount: 0,
        createdAt: now,
        updatedAt: now,
      }).returning();
      return { payment };
    }),

  getScheduledPayments: protectedProcedure
    .input(z.object({
      status: z.enum(["active", "paused", "cancelled", "completed", "failed"]).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { payments: [] };
      const conditions = [eq(scheduledPayments.userId, String(ctx.user.id))];
      if (input?.status) conditions.push(eq(scheduledPayments.status, input.status));
      const payments = await db
        .select()
        .from(scheduledPayments)
        .where(and(...conditions))
        .orderBy(desc(scheduledPayments.scheduledAt));
      return { payments };
    }),

  cancelScheduledPayment: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [existing] = await db
        .select()
        .from(scheduledPayments)
        .where(and(eq(scheduledPayments.id, input.id), eq(scheduledPayments.userId, String(ctx.user.id))))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Scheduled payment not found" });
      if (existing.status === "cancelled") throw new TRPCError({ code: "BAD_REQUEST", message: "Payment already cancelled" });
      if (existing.status === "completed") throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot cancel a completed payment" });
      await db
        .update(scheduledPayments)
        .set({ status: "cancelled", updatedAt: Math.floor(Date.now() / 1000) })
        .where(eq(scheduledPayments.id, input.id));
      return { success: true };
    }),


  pauseScheduledPayment: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [existing] = await db
        .select()
        .from(scheduledPayments)
        .where(and(eq(scheduledPayments.id, input.id), eq(scheduledPayments.userId, String(ctx.user.id))))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Scheduled payment not found" });
      if (existing.status !== "active") throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot pause a payment with status '${existing.status}'` });
      await db
        .update(scheduledPayments)
        .set({ status: "paused", updatedAt: Math.floor(Date.now() / 1000) })
        .where(eq(scheduledPayments.id, input.id));
      return { success: true, id: input.id };
    }),

  resumeScheduledPayment: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [existing] = await db
        .select()
        .from(scheduledPayments)
        .where(and(eq(scheduledPayments.id, input.id), eq(scheduledPayments.userId, String(ctx.user.id))))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Scheduled payment not found" });
      if (existing.status !== "paused") throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot resume a payment with status '${existing.status}'` });
      await db
        .update(scheduledPayments)
        .set({ status: "active", updatedAt: Math.floor(Date.now() / 1000) })
        .where(eq(scheduledPayments.id, input.id));
      return { success: true, id: input.id };
    }),

  executeScheduledPayments: adminProcedure
    .input(z.object({ dryRun: z.boolean().default(false) }).optional())
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const now = Date.now();
      const due = await db
        .select()
        .from(scheduledPayments)
        .where(and(
          eq(scheduledPayments.status, "active"),
          lte(scheduledPayments.nextRunAt, now)
        ));
      if (input?.dryRun) return { processed: 0, due: due.length, dryRun: true };
      let processed = 0;
      let failed = 0;
      for (const payment of due) {
        try {
          // Check balance
          const [balance] = await db
            .select()
            .from(walletBalances)
            .where(and(eq(walletBalances.userId, payment.userId), eq(walletBalances.currency, payment.currency)))
            .limit(1);
          const currentBalance = balance ? parseFloat(balance.balance as unknown as string) : 0;
          const amount = parseFloat(payment.amount as unknown as string);
          if (currentBalance < amount) {
            await db.update(scheduledPayments).set({
              status: payment.recurrence === "once" ? "failed" : "active",
              failureReason: "Insufficient balance",
              lastRunAt: now,
              nextRunAt: payment.recurrence === "once" ? null : computeNextRun(payment.recurrence, now),
              updatedAt: now,
            }).where(eq(scheduledPayments.id, payment.id));
            failed++;
            continue;
          }
          // Deduct balance
          await db.update(walletBalances)
            .set({ balance: String(currentBalance - amount), updatedAt: Math.floor(now / 1000) })
            .where(and(eq(walletBalances.userId, payment.userId), eq(walletBalances.currency, payment.currency)));
          // Create transaction record
          const txId = crypto.randomUUID();
          await db.insert(walletTransactions).values({
            id: txId,
            userId: payment.userId,
            type: "send",
            status: "completed",
            amount: payment.amount,
            fee: "0",
            fromCurrency: payment.currency,
            counterparty: payment.counterpartyName ?? payment.toAddress,
            counterpartyAddress: payment.toAddress,
            reference: payment.reference ?? null,
            note: `Scheduled payment: ${payment.note ?? ""}`.trim(),
            createdAt: Math.floor(now / 1000),
            completedAt: Math.floor(now / 1000),
          });
          // Update scheduled payment
          const isRecurring = payment.recurrence !== "once";
          await db.update(scheduledPayments).set({
            status: isRecurring ? "active" : "completed",
            lastRunAt: now,
            nextRunAt: isRecurring ? computeNextRun(payment.recurrence, now) : null,
            runCount: (payment.runCount ?? 0) + 1,
            failureReason: null,
            updatedAt: now,
          }).where(eq(scheduledPayments.id, payment.id));
          processed++;
        } catch {
          await db.update(scheduledPayments).set({
            status: "failed",
            failureReason: "Execution error",
            lastRunAt: now,
            updatedAt: now,
          }).where(eq(scheduledPayments.id, payment.id));
          failed++;
        }
      }
      return { processed, failed, due: due.length };
    }),

  // ── Exchange Rates ──────────────────────────────────────────────────────────
  getExchangeRates: protectedProcedure
    .input(z.object({ base: z.enum(WALLET_CURRENCIES).optional() }))
    .query(async ({ input }) => {
      const base = input.base ?? "USDC";
      // Try to fetch live rates from the Data API; fall back to static approximations
      try {
        const { callDataApi } = await import("../_core/dataApi");
        const result = await callDataApi("ExchangeRate/latest", {
          query: { base, symbols: WALLET_CURRENCIES.join(",") },
        }) as { rates?: Record<string, number> } | null;
        if (result?.rates && typeof result.rates === "object") {
          return { base, rates: result.rates as Record<string, number>, source: "live" as const };
        }
      } catch {
        // fall through to static
      }
      // Static fallback: derive cross rates via live FX service
      try {
        const { rates: liveRates, source: liveSource } = await getLiveRates();
        const baseRate = liveRates[base] ?? 1;
        const rates: Record<string, number> = {};
        for (const currency of WALLET_CURRENCIES) {
          const targetRate = liveRates[currency] ?? 1;
          rates[currency] = parseFloat((targetRate / baseRate).toFixed(8));
        }
        return { base, rates, source: liveSource as "live" | "static" };
      } catch {
        const baseUsd = APPROX_USD_RATES[base] ?? 1;
        const rates: Record<string, number> = {};
        for (const currency of WALLET_CURRENCIES) {
          const targetUsd = APPROX_USD_RATES[currency] ?? 1;
          rates[currency] = parseFloat((baseUsd / targetUsd).toFixed(8));
        }
        return { base, rates, source: "static" as const };
      }
    }),

  // ── Convert Currency ────────────────────────────────────────────────────────
  convertCurrency: protectedProcedure
    .input(z.object({
      fromCurrency: z.enum(WALLET_CURRENCIES),
      toCurrency: z.enum(WALLET_CURRENCIES),
      fromAmount: z.number().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.fromCurrency === input.toCurrency) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Source and target currencies must be different." });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const userId = String(ctx.user.id);
      // Derive exchange rate via live FX service
      const { rate: fxRate } = await getFxRate(input.fromCurrency, input.toCurrency);
      const rate = parseFloat(fxRate.toFixed(8));
      const toAmount = parseFloat((input.fromAmount * rate).toFixed(8));
      // Check source balance
      const [srcRow] = await db
        .select({ balance: walletBalances.balance })
        .from(walletBalances)
        .where(and(eq(walletBalances.userId, userId), eq(walletBalances.currency, input.fromCurrency)))
        .limit(1);
      const srcBalance = parseFloat(String(srcRow?.balance ?? "0"));
      if (srcBalance < input.fromAmount) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Insufficient ${input.fromCurrency} balance. Available: ${srcBalance}` });
      }
      const now = Date.now();
      const txRef = `CONV-${now}`;
      // Deduct from source
      await db
        .insert(walletBalances)
        .values({ userId, currency: input.fromCurrency, balance: String(-input.fromAmount), updatedAt: now })
        .onConflictDoUpdate({
          target: [walletBalances.userId, walletBalances.currency],
          set: { balance: sql`${walletBalances.balance} - ${input.fromAmount}`, updatedAt: now },
        });
      // Credit target
      await db
        .insert(walletBalances)
        .values({ userId, currency: input.toCurrency, balance: String(toAmount), updatedAt: now })
        .onConflictDoUpdate({
          target: [walletBalances.userId, walletBalances.currency],
          set: { balance: sql`${walletBalances.balance} + ${toAmount}`, updatedAt: now },
        });
      // Record debit transaction
      await db.insert(walletTransactions).values({
        userId,
        fromCurrency: input.fromCurrency,
        toCurrency: input.toCurrency,
        amount: String(-input.fromAmount),
        toAmount: String(toAmount),
        type: "swap",
        status: "completed",
        note: `Converted ${input.fromAmount} ${input.fromCurrency} to ${toAmount} ${input.toCurrency} @ ${rate}`,
        reference: txRef,
        completedAt: Math.floor(now / 1000),
        createdAt: Math.floor(now / 1000),
      });
      // Audit log
      await createAuditLog({
        actorId: ctx.user.id,
        actorEmail: ctx.user.email,
        action: "wallet.convertCurrency",
        entityType: "wallet",
        entityId: userId,
        after: { from: input.fromCurrency, to: input.toCurrency, fromAmount: input.fromAmount, toAmount, rate },
      }).catch(() => null);
      return {
         fromCurrency: input.fromCurrency,
        toCurrency: input.toCurrency,
        fromAmount: input.fromAmount,
        toAmount,
        rate,
        referenceId: txRef,
      };
    }),

  // ─── searchTransactions ────────────────────────────────────────────────────
  searchTransactions: protectedProcedure
    .input(
      z.object({
        query: z.string().optional(),
        currency: z.enum(WALLET_CURRENCIES).optional(),
        type: z.enum(["send", "receive", "swap", "deposit", "withdraw", "fee"]).optional(),
        dateFrom: z.number().optional(), // Unix ms
        dateTo: z.number().optional(),   // Unix ms
        amountMin: z.number().optional(),
        amountMax: z.number().optional(),
        limit: z.number().min(1).max(200).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { transactions: [], total: 0, limit: input.limit, offset: input.offset };
      const userId = String(ctx.user.id);
      const conditions: any[] = [eq(walletTransactions.userId, userId)];

      if (input.currency) conditions.push(eq(walletTransactions.fromCurrency, input.currency));
      if (input.type) conditions.push(eq(walletTransactions.type, input.type));
      // Date range — createdAt stored as Unix seconds
      if (input.dateFrom) conditions.push(gte(walletTransactions.createdAt, Math.floor(input.dateFrom / 1000)));
      if (input.dateTo) conditions.push(lte(walletTransactions.createdAt, Math.floor(input.dateTo / 1000)));
      // Amount range
      if (input.amountMin != null)
        conditions.push(sql`CAST(${walletTransactions.amount} AS NUMERIC) >= ${input.amountMin}`);
      if (input.amountMax != null)
        conditions.push(sql`CAST(${walletTransactions.amount} AS NUMERIC) <= ${input.amountMax}`);
      // Full-text search across note, reference, counterparty
      if (input.query && input.query.trim().length > 0) {
        const q = `%${input.query.trim()}%`;
        conditions.push(
          or(
            ilike(walletTransactions.note, q),
            ilike(walletTransactions.reference, q),
            ilike(walletTransactions.counterparty, q),
          )
        );
      }

      const rows = await db
        .select()
        .from(walletTransactions)
        .where(and(...conditions))
        .orderBy(desc(walletTransactions.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      const countResult = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(walletTransactions)
        .where(and(...conditions));
      const total = Number(countResult[0]?.count ?? 0);

      return {
        transactions: rows.map((tx) => ({
          ...tx,
          amount: parseFloat(tx.amount as unknown as string),
          toAmount: tx.toAmount ? parseFloat(tx.toAmount as unknown as string) : null,
          fee: parseFloat(tx.fee as unknown as string),
        })),
        total,
        limit: input.limit,
        offset: input.offset,
      };
    }),

  // ── Recurring Payments ──────────────────────────────────────────────────────

  // Create a new recurring payment
  createRecurringPayment: protectedProcedure
    .input(z.object({
      currency: z.enum(WALLET_CURRENCIES),
      recipientAddress: z.string().min(1).max(200),
      recipientName: z.string().max(200).optional(),
      amount: z.number().positive(),
      frequency: z.enum(["daily", "weekly", "monthly"]),
      note: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      // Verify balance exists
      const [bal] = await db.select().from(walletBalances)
        .where(and(eq(walletBalances.userId, String(ctx.user.id)), eq(walletBalances.currency, input.currency)));
      if (!bal) throw new TRPCError({ code: "BAD_REQUEST", message: `No ${input.currency} wallet found. Please add funds first.` });
      // Compute first run time (next occurrence based on frequency)
      const nextRunAt = computeNextRunFromNow(input.frequency);
      const id = crypto.randomUUID();
      await db.insert(walletRecurringPayments).values({
        id,
        userId: String(ctx.user.id),
        currency: input.currency,
        recipientAddress: input.recipientAddress,
        recipientName: input.recipientName,
        amount: String(input.amount),
        note: input.note,
        frequency: input.frequency,
        status: "active",
        nextRunAt,
        runCount: 0,
        createdAt: Math.floor(Date.now() / 1000),
        updatedAt: Math.floor(Date.now() / 1000),
      });
      await createAuditLog({
        actorId: ctx.user.id,
        actorName: ctx.user.name || String(ctx.user.id),
        action: "wallet.createRecurringPayment",
        entityType: "wallet_recurring_payment",
        entityId: id,
        after: { currency: input.currency, amount: input.amount, frequency: input.frequency, recipient: input.recipientAddress },
      });
      return { success: true, id, nextRunAt };
    }),

  // Get recurring payments for current user
  getRecurringPayments: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db.select().from(walletRecurringPayments)
        .where(eq(walletRecurringPayments.userId, String(ctx.user.id)))
        .orderBy(desc(walletRecurringPayments.createdAt));
      return rows.map((r) => ({
        ...r,
        amount: parseFloat(r.amount as unknown as string),
      }));
    }),

  // Update a recurring payment (pause/resume/cancel or change amount)
  updateRecurringPayment: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      status: z.enum(["active", "paused", "cancelled"]).optional(),
      amount: z.number().positive().optional(),
      note: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [existing] = await db.select().from(walletRecurringPayments)
        .where(and(eq(walletRecurringPayments.id, input.id), eq(walletRecurringPayments.userId, String(ctx.user.id))));
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Recurring payment not found" });
      if (existing.status === "cancelled") throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot modify a cancelled recurring payment" });
      const updates: Record<string, unknown> = { updatedAt: Math.floor(Date.now() / 1000) };
      if (input.status) updates.status = input.status;
      if (input.amount !== undefined) updates.amount = String(input.amount);
      if (input.note !== undefined) updates.note = input.note;
      await db.update(walletRecurringPayments).set(updates).where(eq(walletRecurringPayments.id, input.id));
      return { success: true };
    }),

  // Create a Stripe Checkout session to fund the wallet
  stripeCheckout: protectedProcedure
    .input(z.object({
      amountUsd: z.number().min(1).max(10000),
      currency: z.enum(WALLET_CURRENCIES),
    }))
    .mutation(async ({ ctx, input }) => {
      const origin = process.env.VITE_APP_ORIGIN ?? "https://tourismpay.com";
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: ctx.user.email || undefined,
        client_reference_id: String(ctx.user.id),
        metadata: {
          user_id: String(ctx.user.id),
          customer_email: ctx.user.email || "",
          customer_name: ctx.user.name || "",
          wallet_currency: input.currency,
          amount_usd: String(input.amountUsd),
          purpose: "wallet_topup",
        },
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: {
              name: `TourismPay Wallet Top-Up (${input.currency})`,
              description: `Add $${input.amountUsd} USD to your ${input.currency} wallet`,
            },
            unit_amount: Math.round(input.amountUsd * 100),
          },
          quantity: 1,
        }],
        allow_promotion_codes: true,
        success_url: `${origin}/wallet?stripe=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/wallet?stripe=cancelled`,
      });
      return { checkoutUrl: session.url! };
    }),

  // Delete a recurring payment
  deleteRecurringPayment: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [existing] = await db.select().from(walletRecurringPayments)
        .where(and(eq(walletRecurringPayments.id, input.id), eq(walletRecurringPayments.userId, String(ctx.user.id))));
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Recurring payment not found" });
      await db.delete(walletRecurringPayments).where(eq(walletRecurringPayments.id, input.id));
      return { success: true };
    }),

  // ── Spending analytics ─────────────────────────────────────────────────────
  spendingAnalytics: protectedProcedure
    .input(z.object({ months: z.number().min(1).max(12).default(6) }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const monthsBack = input?.months ?? 6;
      const since = new Date();
      since.setMonth(since.getMonth() - monthsBack);
      const sinceTs = Math.floor(since.getTime() / 1000);

      // Monthly wallet outbound spending
      const monthlyRows = await db
        .select({
          month: sql<string>`to_char(to_timestamp(${walletTransactions.createdAt} / 1000.0), 'YYYY-MM')`,
          total: sql<string>`coalesce(sum(cast(${walletTransactions.amount} as numeric)), 0)`,
          txCount: count(),
        })
        .from(walletTransactions)
        .where(
          and(
            eq(walletTransactions.userId, String(ctx.user.id)),
            eq(walletTransactions.type, "send"),
            eq(walletTransactions.status, "completed"),
            gte(walletTransactions.createdAt, sinceTs * 1000)
          )
        )
        .groupBy(sql`to_char(to_timestamp(${walletTransactions.createdAt} / 1000.0), 'YYYY-MM')`)
        .orderBy(sql`to_char(to_timestamp(${walletTransactions.createdAt} / 1000.0), 'YYYY-MM')`);

      // QR payments by establishment category
      const qrByCategory = await db
        .select({
          category: establishments.type,
          total: sql<string>`coalesce(sum(cast(${qrPaymentTokens.amountUsd} as numeric)), 0)`,
          txCount: count(),
        })
        .from(qrPaymentTokens)
        .innerJoin(establishments, eq(qrPaymentTokens.establishmentId, establishments.id))
        .where(
          and(
            eq(qrPaymentTokens.paidByUserId, ctx.user.id),
            eq(qrPaymentTokens.status, "paid")
          )
        )
        .groupBy(establishments.type)
        .orderBy(sql`sum(cast(${qrPaymentTokens.amountUsd} as numeric)) desc`);

      // Monthly QR payments
      const monthlyQr = await db
        .select({
          month: sql<string>`to_char(${qrPaymentTokens.paidAt}, 'YYYY-MM')`,
          total: sql<string>`coalesce(sum(cast(${qrPaymentTokens.amountUsd} as numeric)), 0)`,
          txCount: count(),
        })
        .from(qrPaymentTokens)
        .where(
          and(
            eq(qrPaymentTokens.paidByUserId, ctx.user.id),
            eq(qrPaymentTokens.status, "paid"),
            gte(qrPaymentTokens.paidAt, since)
          )
        )
        .groupBy(sql`to_char(${qrPaymentTokens.paidAt}, 'YYYY-MM')`)
        .orderBy(sql`to_char(${qrPaymentTokens.paidAt}, 'YYYY-MM')`);

      // Total QR spend
      const [totalQr] = await db
        .select({
          total: sql<string>`coalesce(sum(cast(${qrPaymentTokens.amountUsd} as numeric)), 0)`,
          txCount: count(),
        })
        .from(qrPaymentTokens)
        .where(and(eq(qrPaymentTokens.paidByUserId, ctx.user.id), eq(qrPaymentTokens.status, "paid")));

      return {
        monthlySpending: monthlyRows.map((r) => ({ month: r.month, total: parseFloat(r.total), txCount: r.txCount })),
        monthlyQr: monthlyQr.map((r) => ({ month: r.month, total: parseFloat(r.total), txCount: r.txCount })),
        qrByCategory: qrByCategory.map((r) => ({ category: r.category ?? "other", total: parseFloat(r.total), txCount: r.txCount })),
        totalQrSpend: parseFloat(totalQr?.total ?? "0"),
        totalQrCount: totalQr?.txCount ?? 0,
      };
    }),

  // Mobile-compatible aliases
  getBalances: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    await ensureDefaultBalances(String(ctx.user.id));
    const rows = await db
      .select()
      .from(walletBalances)
      .where(eq(walletBalances.userId, String(ctx.user.id)))
      .orderBy(walletBalances.currency);
    return rows.map((r) => ({
      ...r,
      label: CURRENCY_LABELS[r.currency as WalletCurrency] || r.currency,
      network: CURRENCY_NETWORKS[r.currency as WalletCurrency] || r.network,
      balance: parseFloat(r.balance as unknown as string),
      lockedBalance: parseFloat(r.lockedBalance as unknown as string),
    }));
  }),

  getTransactions: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().optional(),
      currency: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { transactions: [], total: 0 };
      const limit = input?.limit ?? 50;
      const conditions = [eq(walletTransactions.userId, String(ctx.user.id))];
      if (input?.currency) conditions.push(eq(walletTransactions.fromCurrency, input.currency));
      const rows = await db
        .select()
        .from(walletTransactions)
        .where(and(...conditions))
        .orderBy(desc(walletTransactions.createdAt))
        .limit(limit);
      return {
        transactions: rows.map((tx) => ({
          ...tx,
          amount: parseFloat(tx.amount as unknown as string),
          toAmount: tx.toAmount ? parseFloat(tx.toAmount as unknown as string) : null,
          fee: parseFloat(tx.fee as unknown as string),
        })),
        total: rows.length,
      };
    }),
});
function computeNextRun(recurrence: string, fromMs: number): number {
  const d = new Date(fromMs);
  if (recurrence === "daily") d.setDate(d.getDate() + 1);
  else if (recurrence === "weekly") d.setDate(d.getDate() + 7);
  else if (recurrence === "monthly") d.setMonth(d.getMonth() + 1);
  return d.getTime();
}

// Compute the next run time from now (used when creating a new recurring payment)
function computeNextRunFromNow(frequency: "daily" | "weekly" | "monthly"): number {
  const d = new Date();
  if (frequency === "daily") d.setDate(d.getDate() + 1);
  else if (frequency === "weekly") d.setDate(d.getDate() + 7);
  else if (frequency === "monthly") d.setMonth(d.getMonth() + 1);
  return d.getTime();
}