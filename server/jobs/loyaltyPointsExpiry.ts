/**
 * Loyalty Points Expiry Job
 *
 * Runs on a daily schedule:
 * 1. Marks earn transactions whose `expires_at` has passed as `is_expired = true`
 * 2. Deducts the expired points from each user's `points_balance`
 * 3. Records an `expiry` transaction for audit trail
 * 4. Notifies affected users via in-app notification
 * 5. Sends 30-day advance warnings to users with points expiring soon
 */

import { getDb, createUserNotification } from "../db";
import { sql } from "drizzle-orm";
import { notifyOwner } from "../_core/notification";
import { logger } from "../_core/logger";

export async function runLoyaltyPointsExpiryJob(): Promise<{
  expired: number;
  usersAffected: number;
  warned: number;
}> {
  const db = await getDb();
  if (!db) {
    logger.warn("[LoyaltyExpiry] Database unavailable, skipping job");
    return { expired: 0, usersAffected: 0, warned: 0 };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const thirtyDaysSec = 30 * 24 * 60 * 60;
  const cutoff30 = nowSec + thirtyDaysSec;

  // ── Step 1: Expire overdue points ─────────────────────────────────────────
  const overdueRows = await db.execute(
    sql`SELECT id, user_id, points FROM loyalty_transactions
        WHERE type = 'earn' AND is_expired = false AND expires_at IS NOT NULL AND expires_at <= ${nowSec}`
  ) as any[];

  let expired = 0;
  let usersAffected = 0;

  if (overdueRows.length > 0) {
    const byUser: Record<string, number> = {};
    const txIds: string[] = [];

    for (const row of overdueRows) {
      const uid = String(row.user_id);
      byUser[uid] = (byUser[uid] ?? 0) + Number(row.points);
      txIds.push(row.id);
    }

    // Mark transactions expired
    await db.execute(
      sql`UPDATE loyalty_transactions SET is_expired = true WHERE id = ANY(${txIds}::text[])`
    );

    // Deduct from balances and notify users
    for (const [userId, pointsToExpire] of Object.entries(byUser)) {
      try {
        await db.execute(
          sql`UPDATE loyalty_accounts SET points_balance = GREATEST(0, points_balance - ${pointsToExpire}), updated_at = ${nowSec * 1000} WHERE user_id = ${userId}`
        );
        await db.execute(
          sql`INSERT INTO loyalty_transactions (id, user_id, type, points, description, is_expired, created_at)
              VALUES (gen_random_uuid()::text, ${userId}, 'expiry', ${-pointsToExpire}, 'Points expired (12-month TTL)', true, ${nowSec})`
        );
        await createUserNotification({
          userId: Number(userId),
          category: "system",
          title: `${pointsToExpire.toLocaleString()} loyalty points have expired`,
          content: `${pointsToExpire.toLocaleString()} of your loyalty points have expired after 12 months. Keep earning points on your next trip to maintain your balance!`,
          actionUrl: "/loyalty",
          actionLabel: "Earn Points",
        }).catch(() => null);
        usersAffected++;
      } catch (err) {
        logger.error(`[LoyaltyExpiry] Failed to process expiry for user ${userId}:`, err);
      }
    }

    expired = overdueRows.length;

    // Notify owner
    await notifyOwner({
      title: `Loyalty Points Expiry: ${expired} transaction(s) expired`,
      content: `${expired} earn transaction(s) expired, affecting ${usersAffected} user(s). Total points deducted: ${Object.values(byUser).reduce((a, b) => a + b, 0).toLocaleString()}.`,
    }).catch(() => null);

    logger.info(`[LoyaltyExpiry] Expired ${expired} transactions across ${usersAffected} users`);
  }

  // ── Step 2: Send 30-day advance warnings ──────────────────────────────────
  const warnRows = await db.execute(
    sql`SELECT user_id, SUM(points) as total_expiring
        FROM loyalty_transactions
        WHERE type = 'earn' AND is_expired = false AND expires_at IS NOT NULL
          AND expires_at > ${nowSec} AND expires_at <= ${cutoff30}
        GROUP BY user_id`
  ) as any[];

  let warned = 0;
  for (const row of warnRows) {
    const total = Number(row.total_expiring);
    try {
      await createUserNotification({
        userId: Number(row.user_id),
        category: "system",
        title: `⚠️ ${total.toLocaleString()} loyalty points expiring within 30 days`,
        content: `You have ${total.toLocaleString()} loyalty points expiring within the next 30 days. Redeem them for rewards before they expire!`,
        actionUrl: "/loyalty",
        actionLabel: "Redeem Now",
      }).catch(() => null);
      warned++;
    } catch (err) {
      logger.error(`[LoyaltyExpiry] Failed to send warning to user ${row.user_id}:`, err);
    }
  }

  if (warned > 0) {
    logger.info(`[LoyaltyExpiry] Sent 30-day expiry warnings to ${warned} users`);
  }

  return { expired, usersAffected, warned };
}

// ── Job scheduler ─────────────────────────────────────────────────────────────
let jobInterval: ReturnType<typeof setInterval> | null = null;

export function startLoyaltyPointsExpiryJob(intervalMs = 24 * 60 * 60 * 1000): void {
  if (jobInterval) {
    logger.info("[LoyaltyExpiry] Already running");
    return;
  }
  logger.info(`[LoyaltyExpiry] Starting points expiry job (interval: ${intervalMs / 3600000}h)`);
  // Run once immediately on startup, then on interval
  runLoyaltyPointsExpiryJob().catch((err) =>
    logger.error("[LoyaltyExpiry] Initial run failed:", err)
  );
  jobInterval = setInterval(async () => {
    const result = await runLoyaltyPointsExpiryJob();
    if (result.expired > 0 || result.warned > 0) {
      logger.info(`[LoyaltyExpiry] Cycle — expired: ${result.expired}, users: ${result.usersAffected}, warned: ${result.warned}`);
    }
  }, intervalMs);
}

export function stopLoyaltyPointsExpiryJob(): void {
  if (jobInterval) {
    clearInterval(jobInterval);
    jobInterval = null;
    logger.info("[LoyaltyExpiry] Stopped");
  }
}
