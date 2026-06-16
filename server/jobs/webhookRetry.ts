/**
 * Webhook Retry Background Job
 *
 * Periodically calls processPendingDeliveries() from the webhook engine to
 * automatically retry failed/pending webhook deliveries without requiring a
 * manual trigger from the admin UI.
 *
 * Default interval: 60 seconds (configurable via startWebhookRetryJob param).
 */

import { processPendingDeliveries } from "../webhookEngine";
import { notifyOwner } from "../_core/notification";
import { logger } from "../_core/logger";

// ── Core runner ────────────────────────────────────────────────────────────────

export async function runWebhookRetryJob(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  try {
    const result = await processPendingDeliveries();
    const processed = result.processed ?? 0;
    const succeeded = result.succeeded ?? 0;
    const failed = result.failed ?? 0;

    if (processed > 0) {
      logger.info(
        `[WebhookRetry] Cycle — processed: ${processed}, succeeded: ${succeeded}, failed: ${failed}`
      );
    }

    // Notify owner if a significant number of deliveries are exhausting retries
    if (failed > 5) {
      await notifyOwner({
        title: `Webhook Retry: ${failed} delivery/deliveries exhausted`,
        content: `${failed} webhook delivery/deliveries could not be delivered after all retry attempts. Please check the Webhook Logs in the Remittance Admin Dashboard.`,
      }).catch(() => null);
    }

    return { processed, succeeded, failed };
  } catch (err) {
    logger.error("[WebhookRetry] Job run failed:", err);
    return { processed: 0, succeeded: 0, failed: 0 };
  }
}

// ── Job scheduler ─────────────────────────────────────────────────────────────

let jobInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start the webhook retry background job.
 * @param intervalMs How often to run the retry cycle (default: 60 seconds).
 */
export function startWebhookRetryJob(intervalMs = 60_000): void {
  if (jobInterval) {
    logger.info("[WebhookRetry] Already running");
    return;
  }

  logger.info(
    `[WebhookRetry] Starting webhook retry job (interval: ${intervalMs / 1000}s)`
  );

  // Run once on startup to catch any deliveries that accumulated during downtime
  runWebhookRetryJob().catch((err) =>
    logger.error("[WebhookRetry] Initial run failed:", err)
  );

  jobInterval = setInterval(async () => {
    await runWebhookRetryJob();
  }, intervalMs);
}

export function stopWebhookRetryJob(): void {
  if (jobInterval) {
    clearInterval(jobInterval);
    jobInterval = null;
    logger.info("[WebhookRetry] Stopped");
  }
}
