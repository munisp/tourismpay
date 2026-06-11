/**
 * Sentiment Alert Job
 * Runs every 24 hours after the daily snapshot job.
 * For each merchant who has set a sentimentAlertThreshold in their notification
 * preferences, checks if any of their establishments' latest positivePercent
 * is below the threshold. If so, sends a push notification.
 */

import { getDb } from "../db";
import {
  notificationPreferences,
  reviewSentimentCache,
  establishments,
  users,
} from "../../drizzle/schema";
import { eq, and, isNotNull, lt } from "drizzle-orm";
import { sendPushToUser } from "../_core/webPush";
import { logger } from "../_core/logger";

const JOB_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function startSentimentAlertJob() {
  const run = async () => {
    const db = await getDb();
    if (!db) return;

    try {
      // Find all users who have set a sentiment alert threshold
      const prefs = await db
        .select({
          userId: notificationPreferences.userId,
          threshold: notificationPreferences.sentimentAlertThreshold,
        })
        .from(notificationPreferences)
        .where(isNotNull(notificationPreferences.sentimentAlertThreshold));

      if (prefs.length === 0) return;

      let alertsSent = 0;

      for (const pref of prefs) {
        const threshold = pref.threshold!;

        // Get all establishments owned by this user
        const ownedEstablishments = await db
          .select({ id: establishments.id, name: establishments.name })
          .from(establishments)
          .where(eq(establishments.ownerId, pref.userId));

        if (ownedEstablishments.length === 0) continue;

        // Check each establishment's sentiment against the threshold
        for (const est of ownedEstablishments) {
          const [sentiment] = await db
            .select({
              positivePercent: reviewSentimentCache.positivePercent,
              reviewCount: reviewSentimentCache.reviewCount,
            })
            .from(reviewSentimentCache)
            .where(
              and(
                eq(reviewSentimentCache.establishmentId, est.id),
                lt(reviewSentimentCache.positivePercent, threshold)
              )
            )
            .limit(1);

          if (!sentiment) continue; // Above threshold or no data

          try {
            await sendPushToUser(pref.userId, {
              title: "Sentiment Alert",
              body: `"${est.name}" has dropped to ${sentiment.positivePercent}% positive (your threshold: ${threshold}%). Check your reviews and respond.`,
              url: `/merchant/revenue?tab=reviews&estId=${est.id}`,
            });
            alertsSent++;
          } catch {
            // Push failure is non-fatal
          }
        }
      }

      if (alertsSent > 0) {
        logger.info(`[SentimentAlertJob] Sent ${alertsSent} sentiment alerts`);
      }
    } catch (err) {
      logger.error("[SentimentAlertJob] Error:", err);
    }
  };

  // Run immediately then every 24 hours
  run();
  const interval = setInterval(run, JOB_INTERVAL_MS);
  logger.info("[SentimentAlertJob] Job scheduled (24h interval)");
  return interval;
}
