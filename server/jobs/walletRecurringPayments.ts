/**
 * Wallet Recurring Payments Job
 * Runs every 5 minutes. Finds active recurring payments whose nextRunAt has
 * passed, executes the payment (deduct balance, create transaction), updates
 * nextRunAt, and notifies the user of success or failure.
 */
import { getDb } from "../db";
import { walletBalances, walletTransactions, walletRecurringPayments } from "../../drizzle/schema";
import { eq, and, lte } from "drizzle-orm";
import { createAuditLog, createUserNotification } from "../db";
import { notifyOwner } from "../_core/notification";
import { logger } from "../_core/logger";

function computeNextRun(frequency: string, fromMs: number): number {
  const d = new Date(fromMs);
  if (frequency === "daily") d.setDate(d.getDate() + 1);
  else if (frequency === "weekly") d.setDate(d.getDate() + 7);
  else if (frequency === "monthly") d.setMonth(d.getMonth() + 1);
  return d.getTime();
}

export async function runWalletRecurringPaymentsJob(): Promise<{ executed: number; failed: number }> {
  const db = await getDb();
  if (!db) {
    logger.warn("[RecurringPayments] DB unavailable, skipping job");
    return { executed: 0, failed: 0 };
  }

  const now = Date.now();

  // Find all active recurring payments that are due
  const duePayments = await db
    .select()
    .from(walletRecurringPayments)
    .where(and(
      eq(walletRecurringPayments.status, "active"),
      lte(walletRecurringPayments.nextRunAt, now),
    ));

  if (duePayments.length === 0) return { executed: 0, failed: 0 };

  let executed = 0;
  let failed = 0;

  for (const payment of duePayments) {
    try {
      const amount = parseFloat(payment.amount as unknown as string);
      const fee = amount * 0.001; // 0.1% fee
      const total = amount + fee;

      // Check balance
      const [bal] = await db.select().from(walletBalances)
        .where(and(
          eq(walletBalances.userId, payment.userId),
          eq(walletBalances.currency, payment.currency),
        ));

      if (!bal || parseFloat(bal.balance as unknown as string) < total) {
        // Insufficient balance — mark as failed, notify user
        await db.update(walletRecurringPayments).set({
          status: "failed",
          failureReason: `Insufficient ${payment.currency} balance (required: ${total.toFixed(4)})`,
          updatedAt: Date.now(),
        }).where(eq(walletRecurringPayments.id, payment.id));

        await createUserNotification({
          userId: Number(payment.userId),
          category: "wallet",
          title: `Recurring payment failed — insufficient balance`,
          content: `Your recurring payment of ${amount.toFixed(4)} ${payment.currency} to "${payment.recipientName || payment.recipientAddress}" could not be processed due to insufficient balance. Please top up your wallet.`,
          actionUrl: "/wallet",
          actionLabel: "Top Up Wallet",
        }).catch(() => null);

        failed++;
        continue;
      }

      // Deduct balance
      await db.update(walletBalances).set({
        balance: String(parseFloat(bal.balance as unknown as string) - total),
        updatedAt: Date.now(),
      }).where(eq(walletBalances.id, bal.id));

      // Create transaction record
      const txId = crypto.randomUUID();
      await db.insert(walletTransactions).values({
        id: txId,
        userId: payment.userId,
        type: "send",
        status: "completed",
        fromCurrency: payment.currency,
        amount: String(amount),
        fee: String(fee),
        counterparty: payment.recipientName || payment.recipientAddress,
        counterpartyAddress: payment.recipientAddress,
        note: payment.note || `Recurring ${payment.frequency} payment`,
        txHash: `0x${crypto.randomUUID().replace(/-/g, "")}`,
        completedAt: Date.now(),
        createdAt: Date.now(),
      });

      // Compute next run time
      const nextRunAt = computeNextRun(payment.frequency, now);

      // Update recurring payment record
      await db.update(walletRecurringPayments).set({
        lastRunAt: now,
        nextRunAt,
        runCount: (payment.runCount ?? 0) + 1,
        failureReason: null,
        updatedAt: Date.now(),
      }).where(eq(walletRecurringPayments.id, payment.id));

      await createAuditLog({
        actorId: Number(payment.userId),
        actorName: payment.userId,
        action: "wallet.recurringPayment.executed",
        entityType: "wallet_recurring_payment",
        entityId: payment.id,
        after: { currency: payment.currency, amount, recipient: payment.recipientAddress, txId },
      }).catch(() => null);

      // Notify user of successful execution
      await createUserNotification({
        userId: Number(payment.userId),
        category: "wallet",
        title: `Recurring payment executed`,
        content: `${amount.toFixed(4)} ${payment.currency} sent to "${payment.recipientName || payment.recipientAddress}". Next payment scheduled for ${new Date(nextRunAt).toLocaleDateString()}.`,
        actionUrl: "/wallet",
        actionLabel: "View Wallet",
      }).catch(() => null);

      executed++;
    } catch (err) {
      logger.error(`[RecurringPayments] Failed to execute payment ${payment.id}:`, err);
      await db.update(walletRecurringPayments).set({
        status: "failed",
        failureReason: err instanceof Error ? err.message : "Unknown error",
        updatedAt: Date.now(),
      }).where(eq(walletRecurringPayments.id, payment.id)).catch(() => null);
      failed++;
    }
  }

  if (executed > 0 || failed > 0) {
    logger.info(`[RecurringPayments] Cycle — executed: ${executed}, failed: ${failed}`);
    if (failed > 0) {
      await notifyOwner({
        title: `Recurring Payments: ${failed} payment(s) failed`,
        content: `${failed} recurring wallet payment(s) failed during the latest job cycle. ${executed} succeeded.`,
      }).catch(() => null);
    }
  }

  return { executed, failed };
}

// ── Job scheduler ─────────────────────────────────────────────────────────────
let jobInterval: ReturnType<typeof setInterval> | null = null;

export function startWalletRecurringPaymentsJob(intervalMs = 5 * 60 * 1000): void {
  if (jobInterval) {
    logger.info("[RecurringPayments] Already running");
    return;
  }
  logger.info(`[RecurringPayments] Starting recurring payments job (interval: ${intervalMs / 60000}min)`);
  // Run once on startup, then on interval
  runWalletRecurringPaymentsJob().catch((err) =>
    logger.error("[RecurringPayments] Initial run failed:", err)
  );
  jobInterval = setInterval(async () => {
    try {
      await runWalletRecurringPaymentsJob();
    } catch (err) {
      logger.error("[RecurringPayments] Job run failed:", err);
    }
  }, intervalMs);
}

export function stopWalletRecurringPaymentsJob(): void {
  if (jobInterval) {
    clearInterval(jobInterval);
    jobInterval = null;
    logger.info("[RecurringPayments] Stopped");
  }
}
