/**
 * Review Prompt Job
 * Runs every 15 minutes. Finds deal redemptions that are 2+ hours old,
 * have no associated review, and have not yet been prompted.
 * Sends a push notification to the tourist asking them to leave a review.
 */

import { getDb } from "../db";
import {
  touristDealRedemptions,
  touristReviews,
  touristDeals,
  establishments,
} from "../../drizzle/schema";
import { eq, and, isNull, lte, sql } from "drizzle-orm";
import { sendPushToUser } from "../_core/webPush";

const JOB_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const PROMPT_DELAY_MS = 2 * 60 * 60 * 1000; // 2 hours after redemption

export function startReviewPromptJob() {
  const run = async () => {
    const db = await getDb();
    if (!db) return;

    try {
      const twoHoursAgo = new Date(Date.now() - PROMPT_DELAY_MS);

      // Find redemptions older than 2h, not yet prompted
      const unprompted = await db
        .select({
          id: touristDealRedemptions.id,
          userId: touristDealRedemptions.userId,
          dealId: touristDealRedemptions.dealId,
          establishmentId: touristDealRedemptions.establishmentId,
          redeemedAt: touristDealRedemptions.redeemedAt,
        })
        .from(touristDealRedemptions)
        .where(
          and(
            isNull(touristDealRedemptions.reviewPromptedAt),
            lte(touristDealRedemptions.redeemedAt, twoHoursAgo)
          )
        )
        .limit(100);

      if (unprompted.length === 0) return;

      // For each unprompted redemption, check if the tourist already left a review
      for (const redemption of unprompted) {
        // Check if a review already exists for this user+establishment
        const existingReview = redemption.establishmentId
          ? await db
              .select({ id: touristReviews.id })
              .from(touristReviews)
              .where(
                and(
                  eq(touristReviews.userId, redemption.userId),
                  eq(touristReviews.establishmentId, redemption.establishmentId)
                )
              )
              .limit(1)
          : [];

        // Mark as prompted regardless (to avoid re-checking)
        await db
          .update(touristDealRedemptions)
          .set({ reviewPromptedAt: new Date() })
          .where(eq(touristDealRedemptions.id, redemption.id));

        if (existingReview.length > 0) continue; // Already reviewed

        // Fetch deal and establishment name for the notification
        const [deal] = await db
          .select({ title: touristDeals.title })
          .from(touristDeals)
          .where(eq(touristDeals.id, redemption.dealId))
          .limit(1);

        const establishmentName = redemption.establishmentId
          ? (
              await db
                .select({ name: establishments.name })
                .from(establishments)
                .where(eq(establishments.id, redemption.establishmentId))
                .limit(1)
            )[0]?.name ?? "the establishment"
          : "the establishment";

        const dealTitle = deal?.title ?? "your recent deal";

        try {
          await sendPushToUser(redemption.userId, {
            title: "How was your experience?",
            body: `You redeemed "${dealTitle}" at ${establishmentName}. Share your thoughts — it takes just 30 seconds!`,
            url: `/tourist/review/${redemption.establishmentId ?? ""}?dealId=${redemption.dealId ?? ""}&dealTitle=${encodeURIComponent(dealTitle)}`,
          });
        } catch {
          // Push failure is non-fatal
        }
      }

      console.log(`[ReviewPromptJob] Processed ${unprompted.length} redemptions`);
    } catch (err) {
      console.error("[ReviewPromptJob] Error:", err);
    }
  };

  // Run immediately then on interval
  run();
  const interval = setInterval(run, JOB_INTERVAL_MS);
  console.log("[ReviewPromptJob] Job scheduled (15 min interval)");
  return interval;
}
