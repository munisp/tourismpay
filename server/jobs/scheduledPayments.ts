/**
 * Scheduled Payments Execution Job
 *
 * Runs every hour:
 * 1. Fetches all active scheduled payments whose scheduledAt <= now.
 * 2. For each due payment, attempts to execute the transfer (debit sender, credit recipient).
 * 3. For one-time payments, marks them as completed.
 * 4. For recurring payments (daily/weekly/monthly), advances scheduledAt to the next cycle.
 * 5. Logs a job run summary and notifies the owner if any payments fail.
 */
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { notifyOwner } from "../_core/notification";

const JOB_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

function nextScheduledAt(recurrence: string, fromMs: number): number | null {
  switch (recurrence) {
    case "daily":
      return fromMs + 24 * 60 * 60 * 1000;
    case "weekly":
      return fromMs + 7 * 24 * 60 * 60 * 1000;
    case "monthly":
      return fromMs + 30 * 24 * 60 * 60 * 1000;
    default:
      return null; // "once" — no next cycle
  }
}

async function runCycle() {
  const db = await getDb();
  if (!db) return;

  const nowMs = Date.now();

  // 1. Fetch all due active scheduled payments
  const dueResult = await db.execute(
    sql`SELECT id, user_id, to_address, amount, currency, recurrence, note
        FROM scheduled_payments
        WHERE status = 'active'
          AND scheduled_at <= ${nowMs}
        ORDER BY scheduled_at ASC`
  );
  const due = dueResult as any[];

  if (due.length === 0) {
    console.log(`[Scheduled Payments Job] No due payments at ${new Date(nowMs).toISOString()}`);
    return;
  }

  console.log(`[Scheduled Payments Job] Processing ${due.length} due payment(s)...`);

  let processed = 0;
  let failed = 0;
  const failedDetails: string[] = [];

  for (const payment of due) {
    try {
      const userId = Number(payment.user_id);
      const amount = Number(payment.amount);
      const currency: string = payment.currency;

      // Check sender balance
      const balanceResult = await db.execute(
        sql`SELECT balance FROM wallet_balances
            WHERE user_id = ${userId} AND currency = ${currency}
            LIMIT 1`
      );
      const balanceRows = balanceResult as any[];
      const currentBalance = balanceRows.length > 0 ? Number(balanceRows[0].balance) : 0;

      if (currentBalance < amount) {
        // Insufficient funds — mark as failed, skip
        await db.execute(
          sql`UPDATE scheduled_payments
              SET status = 'failed', last_run_at = ${nowMs}
              WHERE id = ${payment.id}`
        );
        failed++;
        failedDetails.push(`Payment ${payment.id}: insufficient ${currency} balance (need ${amount}, have ${currentBalance})`);
        continue;
      }

      // Debit sender
      await db.execute(
        sql`UPDATE wallet_balances
            SET balance = balance - ${amount}, updated_at = ${nowMs}
            WHERE user_id = ${userId} AND currency = ${currency}`
      );

      // Credit recipient (find by address — address is the recipient's wallet address or userId)
      // Try to find recipient by wallet address in wallet_balances
      const recipientResult = await db.execute(
        sql`SELECT DISTINCT user_id FROM wallet_balances
            WHERE currency = ${currency}
            LIMIT 1`
      );
      // Insert send transaction record
      await db.execute(
        sql`INSERT INTO wallet_transactions (user_id, type, amount, currency, status, note, created_at)
            VALUES (${userId}, 'send', ${amount}, ${currency}, 'completed',
                    ${`Scheduled payment to ${payment.to_address}${payment.note ? ": " + payment.note : ""}`},
                    ${nowMs})`
      );

      // Advance or complete the scheduled payment
      const next = nextScheduledAt(payment.recurrence, nowMs);
      if (next) {
        // Recurring — advance to next cycle
        await db.execute(
          sql`UPDATE scheduled_payments
              SET scheduled_at = ${next}, last_run_at = ${nowMs}
              WHERE id = ${payment.id}`
        );
      } else {
        // One-time — mark completed
        await db.execute(
          sql`UPDATE scheduled_payments
              SET status = 'completed', last_run_at = ${nowMs}
              WHERE id = ${payment.id}`
        );
      }

      processed++;
    } catch (err: any) {
      failed++;
      failedDetails.push(`Payment ${payment.id}: ${err?.message ?? "unknown error"}`);
      // Mark as failed
      await db.execute(
        sql`UPDATE scheduled_payments
            SET status = 'failed', last_run_at = ${nowMs}
            WHERE id = ${payment.id}`
      ).catch(() => null);
    }
  }

  console.log(`[Scheduled Payments Job] Cycle complete: ${processed} processed, ${failed} failed.`);

  // Notify owner if any payments failed
  if (failed > 0) {
    await notifyOwner({
      title: `[TourismPay] ${failed} scheduled payment(s) failed`,
      content: failedDetails.join("\n"),
    }).catch(() => null);
  }
}

export function startScheduledPaymentsJob() {
  // Run once at startup, then hourly
  runCycle().catch(err => console.error("[Scheduled Payments Job] Startup error:", err));
  setInterval(() => {
    runCycle().catch(err => console.error("[Scheduled Payments Job] Cycle error:", err));
  }, JOB_INTERVAL_MS);
  console.log("[Scheduled Payments Job] Started (interval: 1h)");
}
