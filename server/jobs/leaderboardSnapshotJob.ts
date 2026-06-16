/**
 * Leaderboard Score Snapshot Job
 *
 * Runs every 7 days (weekly).
 * For every active establishment, computes:
 *   - bookingCount (confirmed bookings in last 30 days)
 *   - avgRating (all-time average review rating)
 *   - responseRate (% of reviews with a merchant response)
 *   - compositeScore = bookings*0.4 + rating*0.3 + responseRate*0.3
 *
 * Stores one row per establishment per ISO week (Monday date).
 * The peerLeaderboard procedure reads the most recent two snapshots to
 * compute a weekDelta (rank change from last week to this week).
 */
import { getDb } from "../db";
import {
  establishments,
  touristBookings,
  touristReviews,
  establishmentScoreSnapshots,
} from "../../drizzle/schema";
import { eq, and, gte, count, avg } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { logger } from "../_core/logger";

const JOB_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Returns the ISO Monday date string (YYYY-MM-DD) for the current week. */
function currentWeekMonday(): string {
  const d = new Date();
  const day = d.getUTCDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

async function runSnapshotJob() {
  const db = await getDb();
  if (!db) {
    logger.warn("[LeaderboardSnapshot] Database unavailable, skipping");
    return;
  }

  const snapshotDate = currentWeekMonday();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Fetch all active establishments
  const allEstablishments = await db
    .select({ id: establishments.id, name: establishments.name })
    .from(establishments);

  let upserted = 0;
  let errors = 0;

  for (const est of allEstablishments) {
    try {
      // Booking count (last 30 days, confirmed)
      const [bStats] = await db
        .select({ cnt: count() })
        .from(touristBookings)
        .where(
          and(
            eq(touristBookings.establishmentId, est.id),
            eq(touristBookings.status, "confirmed"),
            gte(touristBookings.createdAt, thirtyDaysAgo)
          )
        );
      const bookingCount = Number(bStats?.cnt ?? 0);

      // Rating stats
      const [rStats] = await db
        .select({
          avgRating: avg(touristReviews.rating),
          total: count(),
          replied: count(touristReviews.merchantResponse),
        })
        .from(touristReviews)
        .where(eq(touristReviews.establishmentId, est.id));

      const avgRatingVal = Number(rStats?.avgRating ?? 0);
      const totalReviews = Number(rStats?.total ?? 0);
      const repliedCount = Number(rStats?.replied ?? 0);
      const responseRate =
        totalReviews > 0 ? Math.round((repliedCount / totalReviews) * 100) : 0;

      // Composite score (same formula as peerLeaderboard)
      const bookingScore = Math.min(bookingCount, 100);
      const ratingScore = Math.round((avgRatingVal / 5) * 100);
      const compositeScore = Math.round(
        bookingScore * 0.4 + ratingScore * 0.3 + responseRate * 0.3
      );

      // Upsert: insert or update if row already exists for this week
      await db
        .insert(establishmentScoreSnapshots)
        .values({
          establishmentId: est.id,
          compositeScore,
          bookingCount,
          avgRating: avgRatingVal.toFixed(1),
          responseRate,
          snapshotDate,
        })
        .onConflictDoUpdate({
          target: [
            establishmentScoreSnapshots.establishmentId,
            establishmentScoreSnapshots.snapshotDate,
          ],
          set: {
            compositeScore,
            bookingCount,
            avgRating: avgRatingVal.toFixed(1),
            responseRate,
          },
        });

      upserted++;
    } catch (err) {
      errors++;
      logger.error(
        `[LeaderboardSnapshot] Failed for establishment ${est.id} (${est.name}):`,
        err
      );
    }
  }

  logger.info(
    `[LeaderboardSnapshot] Snapshot complete for week ${snapshotDate}: ${upserted} upserted, ${errors} errors`
  );
}

export function startLeaderboardSnapshotJob() {
  logger.info("[LeaderboardSnapshot] Starting weekly score snapshot job (interval: 7d)");
  // Run immediately on startup to populate initial data
  runSnapshotJob().catch((err) =>
    logger.error("[LeaderboardSnapshot] Initial run failed:", err)
  );
  setInterval(() => {
    runSnapshotJob().catch((err) =>
      logger.error("[LeaderboardSnapshot] Scheduled run failed:", err)
    );
  }, JOB_INTERVAL_MS);
}
