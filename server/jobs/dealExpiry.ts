/**
 * Deal Expiry Auto-Deactivation Job
 *
 * Runs every 60 minutes. Finds active deals where validTo < now()
 * and automatically sets isActive = false.
 *
 * Also sends a web push notification to the merchant so they can renew.
 */

import { getDb } from "../db";
import { touristDeals, establishments } from "../../drizzle/schema";
import { eq, and, lt } from "drizzle-orm";
import { sendPushToUser } from "../_core/webPush";
import { logger } from "../_core/logger";

const JOB_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export async function runDealExpiryJob(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    const now = new Date();

    // Find all active deals that have passed their validTo date (join establishments for merchant id)
    const expiredDeals = await db
      .select({
        id: touristDeals.id,
        title: touristDeals.title,
        validTo: touristDeals.validTo,
        establishmentId: touristDeals.establishmentId,
        merchantId: establishments.ownerId,
      })
      .from(touristDeals)
      .leftJoin(establishments, eq(touristDeals.establishmentId, establishments.id))
      .where(
        and(
          eq(touristDeals.isActive, true),
          lt(touristDeals.validTo, now)
        )
      )
      .limit(500);

    if (expiredDeals.length === 0) return;

    // Deactivate all expired deals and notify merchants
    for (const deal of expiredDeals) {
      await db
        .update(touristDeals)
        .set({ isActive: false })
        .where(eq(touristDeals.id, deal.id));

      // Send push notification to the merchant
      if (deal.merchantId) {
        sendPushToUser(deal.merchantId, {
          title: `Deal Expired: ${deal.title}`,
          body: `Your deal "${deal.title}" has expired. Renew it to keep attracting tourists.`,
          url: `/merchant/deals/leaderboard`,
          tag: `deal-expired-${deal.id}`,
          data: { dealId: deal.id },
        }).catch(() => {/* non-critical */});
      }

      logger.info(
        `[DealExpiry] Auto-deactivated deal #${deal.id}: "${deal.title}" (expired ${deal.validTo?.toISOString()})`
      );
    }

    logger.info(`[DealExpiry] Auto-deactivated ${expiredDeals.length} expired deal(s)`);
  } catch (err) {
    logger.error("[DealExpiry] Job error:", err);
  }
}

export function startDealExpiryJob(): void {
  // Run immediately on startup, then every hour
  runDealExpiryJob();
  setInterval(runDealExpiryJob, JOB_INTERVAL_MS);
  logger.info("[DealExpiry] Deal expiry job started (60-min interval)");
}
