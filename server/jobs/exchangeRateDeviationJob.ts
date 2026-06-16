/**
 * Exchange Rate Deviation Job
 *
 * Runs every hour:
 * 1. Fetches live exchange rates for all tracked currencies.
 * 2. Compares against stored baselines (5% threshold).
 * 3. If any currency deviates, sends an in-app notification to the owner.
 * 4. Updates baselines after alerting.
 */
import { notifyOwner } from "../_core/notification";
import { logger } from "../_core/logger";

const JOB_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

const TRACKED_CURRENCIES = ["NGN", "KES", "GHS", "ZAR", "EGP", "TZS", "UGX", "MAD"];
const THRESHOLD_PCT = 5;

// In-memory baseline store (mirrors the one in exchangeRates router)
const rateBaselines = new Map<string, { rate: number; updatedAt: number }>();

async function fetchLiveRate(currency: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://open.er-api.com/v6/latest/USD?symbols=${currency}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.rates?.[currency] ?? null;
  } catch {
    return null;
  }
}

async function runCycle() {
  const deviations: { currency: string; oldRate: number; newRate: number; deviationPct: number }[] = [];

  for (const currency of TRACKED_CURRENCIES) {
    const newRate = await fetchLiveRate(currency);
    if (!newRate) continue;

    const baseline = rateBaselines.get(currency);
    if (!baseline) {
      // First run — just set the baseline, no alert
      rateBaselines.set(currency, { rate: newRate, updatedAt: Date.now() });
      continue;
    }

    const deviationPct = Math.abs((newRate - baseline.rate) / baseline.rate) * 100;
    if (deviationPct >= THRESHOLD_PCT) {
      deviations.push({ currency, oldRate: baseline.rate, newRate, deviationPct });
      // Update baseline so we don't re-alert on the same shift
      rateBaselines.set(currency, { rate: newRate, updatedAt: Date.now() });
    }
  }

  if (deviations.length === 0) {
    logger.info(`[Rate Deviation Job] No significant deviations at ${new Date().toISOString()}`);
    return;
  }

  const lines = deviations.map(
    (d) =>
      `• USD/${d.currency}: ${d.oldRate.toFixed(4)} → ${d.newRate.toFixed(4)} (${d.deviationPct.toFixed(1)}% change)`
  );

  const notified = await notifyOwner({
    title: `⚠️ Exchange Rate Alert: ${deviations.length} currency pair(s) deviated >5%`,
    content: [
      `Detected at ${new Date().toISOString()}:`,
      ...lines,
      "",
      "Consider reviewing exchange rate overrides in the admin panel.",
    ].join("\n"),
  });

  logger.info(
    `[Rate Deviation Job] Alerted on ${deviations.length} deviation(s). Notified owner: ${notified}`
  );
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function startExchangeRateDeviationJob() {
  if (intervalHandle) return; // already running
  logger.info("[Rate Deviation Job] Starting hourly exchange rate deviation check");
  // Run immediately on startup (populates baselines), then every hour
  runCycle().catch((err) =>
    logger.error("[Rate Deviation Job] Initial cycle error:", err)
  );
  intervalHandle = setInterval(() => {
    runCycle().catch((err) =>
      logger.error("[Rate Deviation Job] Cycle error:", err)
    );
  }, JOB_INTERVAL_MS);
}

export function stopExchangeRateDeviationJob() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
