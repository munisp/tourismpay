/**
 * Loyalty Tier Downgrade Grace Period Job
 *
 * Runs every 6 hours:
 * 1. Finds loyalty accounts whose 90-day tier protection grace period has expired.
 * 2. For each expired account, recalculates the natural tier from lifetime points.
 * 3. If the natural tier is lower than the current tier, downgrades the tier.
 * 4. Clears the tierProtectedUntil flag for all processed accounts.
 * 5. Sends a downgrade notification to affected users.
 * 6. Notifies the platform owner with a summary.
 */
import { getDb, createUserNotification } from "../db";
import { sql } from "drizzle-orm";
import { notifyOwner } from "../_core/notification";
import { logger } from "../_core/logger";

const JOB_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

const TIER_ORDER = ["BRONZE", "SILVER", "GOLD", "PLATINUM"];

function getTierFromPoints(lifetime: number): string {
  if (lifetime >= 50000) return "PLATINUM";
  if (lifetime >= 20000) return "GOLD";
  if (lifetime >= 5000) return "SILVER";
  return "BRONZE";
}

async function runCycle() {
  const db = await getDb();
  if (!db) return;

  const nowMs = Date.now();

  // Find all accounts where grace period has expired
  const expired = await db.execute(
    sql`SELECT user_id, tier, lifetime_points, tier_protected_until
        FROM loyalty_accounts
        WHERE tier_protected_until IS NOT NULL AND tier_protected_until <= ${nowMs}`
  ) as any[];

  if (!Array.isArray(expired) || expired.length === 0) return;

  let downgradedCount = 0;
  const downgrades: Array<{ userId: string; from: string; to: string }> = [];

  for (const row of expired) {
    const userId = String(row.user_id);
    const currentTier = row.tier as string;
    const lifetimePoints = Number(row.lifetime_points);
    const naturalTier = getTierFromPoints(lifetimePoints);
    const currentTierIdx = TIER_ORDER.indexOf(currentTier);
    const naturalTierIdx = TIER_ORDER.indexOf(naturalTier);

    if (naturalTierIdx < currentTierIdx) {
      // Downgrade the tier and clear the grace period
      await db.execute(
        sql`UPDATE loyalty_accounts
            SET tier = ${naturalTier}, tier_protected_until = NULL, updated_at = ${nowMs}
            WHERE user_id = ${userId}`
      );
      // Notify the user about the downgrade
      await createUserNotification({
        userId: Number(userId),
        category: "system",
        title: `Your tier has been updated to ${naturalTier}`,
        content: `Your 90-day tier protection period has ended. Your tier has been updated from ${currentTier} to ${naturalTier} based on your current points balance. Earn more points to advance your tier again!`,
        actionUrl: "/loyalty",
        actionLabel: "Earn Points",
      }).catch(() => null);
      downgrades.push({ userId, from: currentTier, to: naturalTier });
      downgradedCount++;
    } else {
      // Grace period expired but no downgrade needed — just clear the protection flag
      await db.execute(
        sql`UPDATE loyalty_accounts
            SET tier_protected_until = NULL, updated_at = ${nowMs}
            WHERE user_id = ${userId}`
      );
    }
  }

  if (downgradedCount > 0) {
    logger.info(`[Tier Downgrade Job] Processed ${expired.length} expired grace period(s), downgraded ${downgradedCount} user(s).`);
    await notifyOwner({
      title: `Loyalty Tier Downgrades Processed: ${downgradedCount} user(s)`,
      content: `${downgradedCount} user(s) had their loyalty tier downgraded after their 90-day grace period expired:\n\n${downgrades.map(d => `• User #${d.userId}: ${d.from} → ${d.to}`).join("\n")}`,
    }).catch(() => null);
  } else if (expired.length > 0) {
    logger.info(`[Tier Downgrade Job] Cleared ${expired.length} expired grace period flag(s) (no downgrades needed).`);
  }
}

export function startLoyaltyTierDowngradeJob() {
  // Run once at startup, then on interval
  runCycle().catch(err => logger.error("[Tier Downgrade Job] Startup error:", err));
  setInterval(() => {
    runCycle().catch(err => logger.error("[Tier Downgrade Job] Cycle error:", err));
  }, JOB_INTERVAL_MS);
  logger.info("[Tier Downgrade Job] Started (interval: 6h)");
}
