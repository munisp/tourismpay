/**
 * Exchange Rates Router
 * Provides live USD → target currency rates with 5-minute in-memory cache.
 * Uses the free open.er-api.com endpoint (no API key required).
 * Also provides a checkDeviation mutation for admin-triggered rate deviation alerts.
 */
import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { notifyOwner } from "../_core/notification";

// ─── In-memory cache ──────────────────────────────────────────────────────────
interface CacheEntry {
  rates: Record<string, number>;
  fetchedAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const rateCache = new Map<string, CacheEntry>();

async function fetchUsdRates(): Promise<Record<string, number>> {
  const cached = rateCache.get("USD");
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.rates;
  }

  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const rates: Record<string, number> = json.rates ?? {};
    rateCache.set("USD", { rates, fetchedAt: Date.now() });
    return rates;
  } catch {
    // Fallback to approximate static rates if network unavailable
    const fallback: Record<string, number> = {
      USD: 1,
      EUR: 0.92,
      GBP: 0.79,
      NGN: 1600,
      KES: 129,
      GHS: 15.5,
      ZAR: 18.6,
      EGP: 48.5,
      TZS: 2700,
      UGX: 3750,
      RWF: 1350,
      ETB: 113,
      MAD: 10.0,
      XOF: 600,
      XAF: 600,
    };
    rateCache.set("USD", { rates: fallback, fetchedAt: Date.now() - CACHE_TTL_MS + 60_000 });
    return fallback;
  }
}

// ─── Baseline rate store (for deviation detection) ────────────────────────────
interface BaselineEntry {
  rate: number;
  recordedAt: number;
}
const rateBaselines = new Map<string, BaselineEntry>();

/** Check if any live rate deviates >thresholdPct% from the stored baseline.
 *  Updates the baseline after alerting so subsequent checks use the new rate. */
export async function checkRateDeviations(
  thresholdPct = 5
): Promise<{ currency: string; oldRate: number; newRate: number; deviationPct: number }[]> {
  const rates = await fetchUsdRates();
  const deviations: { currency: string; oldRate: number; newRate: number; deviationPct: number }[] = [];
  for (const [currency, newRate] of Object.entries(rates)) {
    const baseline = rateBaselines.get(currency);
    if (!baseline) {
      rateBaselines.set(currency, { rate: newRate, recordedAt: Date.now() });
      continue;
    }
    const deviationPct = Math.abs((newRate - baseline.rate) / baseline.rate) * 100;
    if (deviationPct >= thresholdPct) {
      deviations.push({ currency, oldRate: baseline.rate, newRate, deviationPct });
      // Update baseline so we don't re-alert on the same shift
      rateBaselines.set(currency, { rate: newRate, recordedAt: Date.now() });
    }
  }
  return deviations;
}

// ─── Router ───────────────────────────────────────────────────────────────────
export const exchangeRatesRouter = router({
  /** Get the USD → target currency exchange rate */
  getRate: publicProcedure
    .input(
      z.object({
        targetCurrency: z.string().min(2).max(5).toUpperCase(),
      })
    )
    .query(async ({ input }) => {
      const rates = await fetchUsdRates();
      const rate = rates[input.targetCurrency] ?? null;
      const fetchedAt = rateCache.get("USD")?.fetchedAt ?? Date.now();
      return {
        baseCurrency: "USD",
        targetCurrency: input.targetCurrency,
        rate,
        fetchedAt,
        isFallback: !rate,
      };
    }),

  /** Check for rate deviations above a threshold and notify owner */
  checkDeviation: protectedProcedure
    .input(
      z.object({
        thresholdPct: z.number().min(1).max(50).default(5),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new Error("Admin only");
      }
      const deviations = await checkRateDeviations(input.thresholdPct);
      if (deviations.length === 0) {
        return { deviations: [], notified: false };
      }
      const lines = deviations.map(
        (d) =>
          `• ${d.currency}: ${d.oldRate.toFixed(4)} → ${d.newRate.toFixed(4)} (${d.deviationPct.toFixed(1)}% shift)`
      );
      await notifyOwner({
        title: `⚠️ Exchange Rate Alert: ${deviations.length} currency pair(s) deviated >${input.thresholdPct}%`,
        content: [
          `The following USD exchange rates have shifted by more than ${input.thresholdPct}% since the last check:`,
          "",
          ...lines,
          "",
          `Consider reviewing and setting manual overrides at /admin/exchange-rates if needed.`,
        ].join("\n"),
      });
      return { deviations, notified: true };
    }),

  /** Get multiple rates at once (e.g. for a currency picker) */
  getRates: publicProcedure
    .input(
      z.object({
        currencies: z.array(z.string().min(2).max(5)).max(30),
      })
    )
    .query(async ({ input }) => {
      const rates = await fetchUsdRates();
      const fetchedAt = rateCache.get("USD")?.fetchedAt ?? Date.now();
      return {
        baseCurrency: "USD",
        fetchedAt,
        rates: Object.fromEntries(
          input.currencies.map((c) => [c.toUpperCase(), rates[c.toUpperCase()] ?? null])
        ),
      };
    }),
});
