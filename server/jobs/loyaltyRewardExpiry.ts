/**
 * Loyalty Reward Expiry Job
 *
 * Runs every 6 hours:
 * 1. Deactivates rewards whose expiresAt has passed.
 * 2. Sends "expiring soon" notifications to users who have the reward in their
 *    wishlist — or, since we don't track wishlists, sends a broadcast owner
 *    alert listing which rewards are expiring within 7 days.
 */

import { getDb, createUserNotification } from "../db";
import { sql } from "drizzle-orm";
import { notifyOwner } from "../_core/notification";
import { logger } from "../_core/logger";

const JOB_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

async function runCycle() {
  const db = await getDb();
  if (!db) return;

  const nowMs = Date.now();

  // 1. Deactivate expired rewards
  const expiredResult = await db.execute(
    sql`UPDATE loyalty_rewards
        SET is_active = FALSE
        WHERE is_active = TRUE
          AND expires_at IS NOT NULL
          AND expires_at <= ${nowMs}
        RETURNING id, name`
  );
  const expired = expiredResult as any[];
  if (expired.length > 0) {
    logger.info(`[Loyalty Expiry Job] Deactivated ${expired.length} expired reward(s):`, expired.map((r: any) => r.name).join(", "));
    await notifyOwner({
      title: `[TourismPay] ${expired.length} loyalty reward(s) expired`,
      content: expired.map((r: any) => `• ${r.name} (ID: ${r.id})`).join("\n"),
    }).catch(() => null);
  }

  // 2. Find rewards expiring within 7 days and notify users who have loyalty accounts
  const soonResult = await db.execute(
    sql`SELECT id, name, expires_at FROM loyalty_rewards
        WHERE is_active = TRUE
          AND expires_at IS NOT NULL
          AND expires_at > ${nowMs}
          AND expires_at <= ${nowMs + SEVEN_DAYS_MS}`
  );
  const soon = soonResult as any[];
  if (soon.length > 0) {
    // Get all users with loyalty accounts to notify them
    const usersResult = await db.execute(
      sql`SELECT user_id FROM loyalty_accounts`
    );
    const userIds = (usersResult as any[]).map((r: any) => Number(r.user_id));

    for (const reward of soon) {
      const daysLeft = Math.ceil((Number(reward.expires_at) - nowMs) / (24 * 60 * 60 * 1000));
      for (const userId of userIds) {
        await createUserNotification({
          userId,
          category: "system",
          title: `Reward expiring soon: ${reward.name}`,
          content: `The reward "${reward.name}" expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}. Redeem it before it's gone!`,
          actionUrl: "/loyalty",
          actionLabel: "View Rewards",
        }).catch(() => null);
      }
    }
    logger.info(`[Loyalty Expiry Job] Sent expiry-soon notifications for ${soon.length} reward(s) to ${userIds.length} user(s).`);
  }
}

export function startLoyaltyRewardExpiryJob() {
  // Run once at startup, then on interval
  runCycle().catch(err => logger.error("[Loyalty Expiry Job] Startup error:", err));
  setInterval(() => {
    runCycle().catch(err => logger.error("[Loyalty Expiry Job] Cycle error:", err));
  }, JOB_INTERVAL_MS);
  logger.info("[Loyalty Expiry Job] Started (interval: 6h)");
}
