/**
 * Merchant Payout Scheduler Job
 *
 * Runs every hour:
 * 1. Fetches all active merchant payout schedules whose nextRunAt <= now.
 * 2. For each due schedule, creates a settlement batch for the merchant's
 *    pending settlements and marks it as "processing".
 * 3. Advances nextRunAt to the next cycle.
 * 4. Notifies the merchant in-app and the owner via notifyOwner.
 */
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { notifyOwner } from "../_core/notification";
import { createUserNotification } from "../db";
import { computeNextRunAt } from "../routers/payoutSchedule";

const JOB_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

async function runCycle() {
  const db = await getDb();
  if (!db) return;

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  // 1. Fetch all due active schedules
  const nowIsoStr = new Date(nowMs).toISOString();
  const due = await db.execute(
    sql`SELECT id, merchant_id, frequency, preferred_day
        FROM merchant_payout_schedules
        WHERE is_active = true
          AND next_run_at IS NOT NULL
          AND next_run_at <= ${nowIsoStr}::timestamptz`
  );

  const rows = (due as any).rows ?? due ?? [];
  if (!rows.length) return;

  let processed = 0;
  let failed = 0;

  for (const row of rows) {
    const merchantId: number = row.merchant_id;
    const frequency: "daily" | "weekly" | "monthly" = row.frequency;
    const preferredDay: number = row.preferred_day;

    try {
      // 2. Create a settlement batch for pending settlements of this merchant
      const batchId = `AUTO-${merchantId}-${Date.now()}`;

      // Find pending settlements for this merchant
      const pendingResult = await db.execute(
        sql`SELECT id, total_amount FROM ps_settlements
            WHERE participant_id = ${String(merchantId)}
              AND status = 'pending'
            LIMIT 50`
      );
      const pending = (pendingResult as any).rows ?? pendingResult ?? [];

      if (pending.length > 0) {
        const totalAmount = pending.reduce(
          (sum: number, s: any) => sum + parseFloat(s.total_amount ?? "0"),
          0
        );

        // Mark settlements as processing
        const ids = pending.map((s: any) => s.id);
        await db.execute(
          sql`UPDATE ps_settlements
              SET status = 'processing', batch_id = ${batchId}, updated_at = NOW()
              WHERE id = ANY(${ids})`
        );

        // Notify merchant
        await createUserNotification({
          userId: merchantId,
          category: "wallet",
          title: "Automatic payout initiated",
          content: `Your scheduled ${frequency} payout of $${totalAmount.toFixed(2)} USD has been initiated (Batch ${batchId}). Funds will be settled within 1–2 business days.`,
          actionUrl: "/merchant/payouts",
          actionLabel: "View Payouts",
        });

        processed++;

        // Notify owner
        await notifyOwner({
          title: `Auto-payout initiated for merchant #${merchantId}`,
          content: `Batch ${batchId}: ${pending.length} settlements totalling $${totalAmount.toFixed(2)} USD.`,
        });
      }

      // 3. Advance nextRunAt
      const nextRunAtMs = computeNextRunAt(frequency, preferredDay, nowMs);
      const nextRunAtStr = new Date(nextRunAtMs).toISOString();
      const nowIsoForUpdate = new Date(nowMs).toISOString();
      await db.execute(
        sql`UPDATE merchant_payout_schedules
            SET next_run_at = ${nextRunAtStr}::timestamptz,
                last_run_at = ${nowIsoForUpdate}::timestamptz,
                last_batch_id = ${batchId},
                updated_at = NOW()
            WHERE id = ${row.id}`
      );
    } catch (err) {
      console.error(`[PayoutScheduler] Failed for merchant #${merchantId}:`, err);
      failed++;
    }
  }

  if (processed > 0 || failed > 0) {
    console.log(
      `[PayoutScheduler] Cycle at ${nowIso}: processed=${processed}, failed=${failed}`
    );
  }
}

export function startMerchantPayoutSchedulerJob(intervalMs = JOB_INTERVAL_MS) {
  console.log("[PayoutScheduler] Starting merchant payout scheduler job");
  runCycle().catch(console.error);
  setInterval(() => runCycle().catch(console.error), intervalMs);
}
