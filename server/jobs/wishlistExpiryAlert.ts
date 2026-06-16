/**
 * Wishlist Deal Expiry Alert Job
 *
 * Runs every 60 minutes. Finds active deals expiring within the next 48 hours
 * that have been wishlisted by tourists who haven't yet redeemed them.
 * Sends a web push notification to each tourist to prompt last-minute redemption.
 *
 * Opt-out: respects the `wishlistExpiryAlerts` flag in notification_preferences.
 * Deduplication: `alertedAt` column on touristDealWishlists prevents duplicate alerts.
 */

import { getDb } from "../db";
import {
  touristDeals,
  touristDealWishlists,
  touristDealRedemptions,
  notificationPreferences,
} from "../../drizzle/schema";
import { eq, and, gte, lte, isNull, ne } from "drizzle-orm";
import { sendPushToUser } from "../_core/webPush";
import { logger } from "../_core/logger";

const JOB_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const ALERT_WINDOW_MS = 48 * 60 * 60 * 1000; // 48 hours

export async function runWishlistExpiryAlertJob(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + ALERT_WINDOW_MS);

    // Find active deals expiring within the next 48 hours
    const expiringDeals = await db
      .select({
        id: touristDeals.id,
        title: touristDeals.title,
        discountPercent: touristDeals.discountPercent,
        validTo: touristDeals.validTo,
        category: touristDeals.category,
      })
      .from(touristDeals)
      .where(
        and(
          eq(touristDeals.isActive, true),
          gte(touristDeals.validTo, now),
          lte(touristDeals.validTo, windowEnd)
        )
      );

    if (expiringDeals.length === 0) return;

    const dealIds = expiringDeals.map((d) => d.id);

    // Find tourists who have wishlisted these deals and haven't been alerted yet
    const wishlistRows = await db
      .select({
        userId: touristDealWishlists.userId,
        dealId: touristDealWishlists.dealId,
      })
      .from(touristDealWishlists)
      .where(isNull(touristDealWishlists.alertedAt));

    // Filter to only deals that are expiring
    const dealIdSet = new Set(dealIds);
    const relevantRows = wishlistRows.filter((r) => dealIdSet.has(r.dealId));

    if (relevantRows.length === 0) return;

    // Fetch notification preferences for all relevant users (opt-out check)
    const prefRows = await db
      .select({
        userId: notificationPreferences.userId,
        wishlistExpiryAlerts: notificationPreferences.wishlistExpiryAlerts,
      })
      .from(notificationPreferences)
      .where(eq(notificationPreferences.wishlistExpiryAlerts, false));

    // Build a set of opted-out user IDs (those with wishlistExpiryAlerts = false)
    const optedOutUsers = new Set(prefRows.map((p) => p.userId));

    // Check which tourists have already redeemed each deal
    const redemptions = await db
      .select({
        userId: touristDealRedemptions.userId,
        dealId: touristDealRedemptions.dealId,
      })
      .from(touristDealRedemptions)
      .where(ne(touristDealRedemptions.status, "cancelled"));

    const redeemedSet = new Set(
      redemptions.map((r) => `${r.userId}-${r.dealId}`)
    );

    // Group by userId → list of expiring deals they haven't redeemed
    const byUser = new Map<number, typeof expiringDeals>();
    for (const row of relevantRows) {
      // Skip opted-out users
      if (optedOutUsers.has(row.userId)) continue;
      const key = `${row.userId}-${row.dealId}`;
      if (redeemedSet.has(key)) continue; // already redeemed
      if (!byUser.has(row.userId)) byUser.set(row.userId, []);
      const deal = expiringDeals.find((d) => d.id === row.dealId);
      if (deal) byUser.get(row.userId)!.push(deal);
    }

    // Send push notifications
    const alertedWishlistKeys: Array<{ userId: number; dealId: number }> = [];
    for (const [userId, deals] of Array.from(byUser.entries())) {
      const dealTitles = deals.map((d) => `"${d.title}"`).join(", ");
      const body =
        deals.length === 1
          ? `Your saved deal ${dealTitles} (${deals[0].discountPercent}% off) expires in less than 48 hours. Redeem it before it's gone!`
          : `${deals.length} of your saved deals expire within 48 hours: ${dealTitles}. Don't miss out!`;

      try {
        await sendPushToUser(userId, {
          title: "Saved Deal Expiring Soon ⏰",
          body,
          icon: "/icons/icon-192x192.png",
          badge: "/icons/badge-72x72.png",
          tag: `wishlist-expiry-${userId}`,
          data: { url: "/tourist?tab=deals&filter=saved" },
        });
        for (const deal of deals) {
          alertedWishlistKeys.push({ userId, dealId: deal.id });
        }
      } catch {
        // Non-fatal
      }
    }

    // Mark alerted wishlist rows so we don't re-alert
    if (alertedWishlistKeys.length > 0) {
      const alertedAt = new Date();
      await Promise.all(
        alertedWishlistKeys.map(({ userId, dealId }) =>
          db
            .update(touristDealWishlists)
            .set({ alertedAt })
            .where(
              and(
                eq(touristDealWishlists.userId, userId),
                eq(touristDealWishlists.dealId, dealId)
              )
            )
        )
      );
    }

    logger.info(
      `[WishlistExpiryAlert] Notified ${byUser.size} tourists about ${alertedWishlistKeys.length} expiring wishlisted deals`
    );
  } catch (err) {
    logger.error("[WishlistExpiryAlert] Job error:", err);
  }
}

let _timer: ReturnType<typeof setInterval> | null = null;

export function startWishlistExpiryAlertJob(): void {
  if (_timer) return;
  runWishlistExpiryAlertJob();
  _timer = setInterval(runWishlistExpiryAlertJob, JOB_INTERVAL_MS);
  logger.info("[WishlistExpiryAlert] Job started (60-min interval)");
}
