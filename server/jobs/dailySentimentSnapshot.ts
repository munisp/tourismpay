/**
 * Daily Sentiment Snapshot Job
 *
 * Runs at midnight (00:05 local time). For every establishment that has at least
 * one review, it reads the current reviewSentimentCache and inserts a daily
 * snapshot into reviewSentimentHistory (upsert — safe to re-run).
 *
 * This powers the 14-day sparkline chart in the Customer Reviews card.
 */
import { getDb } from "../db";
import { reviewSentimentCache, reviewSentimentHistory } from "../../drizzle/schema";

// Schedule: run once at startup (to backfill today) then every 24 hours
const JOB_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function runDailySentimentSnapshotJob(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    // Fetch all current sentiment cache rows
    const cacheRows = await db.select().from(reviewSentimentCache);
    if (cacheRows.length === 0) return;

    // Upsert a snapshot for each establishment
    for (const row of cacheRows) {
      await db
        .insert(reviewSentimentHistory)
        .values({
          establishmentId: row.establishmentId,
          positivePercent: row.positivePercent,
          reviewCount: row.reviewCount,
          snapshotDate: today,
        })
        .onConflictDoUpdate({
          target: [
            reviewSentimentHistory.establishmentId,
            reviewSentimentHistory.snapshotDate,
          ],
          set: {
            positivePercent: row.positivePercent,
            reviewCount: row.reviewCount,
          },
        });
    }

    console.log(
      `[DailySentimentSnapshot] Saved ${cacheRows.length} snapshot(s) for ${today}`
    );
  } catch (err) {
    console.error("[DailySentimentSnapshot] Error:", err);
  }
}

export function startDailySentimentSnapshotJob(): void {
  // Run once immediately on startup (backfills today's snapshot)
  runDailySentimentSnapshotJob();
  // Then repeat every 24 hours
  setInterval(runDailySentimentSnapshotJob, JOB_INTERVAL_MS);
  console.log("[DailySentimentSnapshot] Job scheduled (24h interval)");
}
