import { logger } from "./logger";
/**
 * FX Rate Service — Live API with 3-tier fallback chain
 *
 * Tier 1: exchangerate-api.com (free, no key required)
 * Tier 2: frankfurter.app (ECB rates, free, no key required)
 * Tier 3: Hardcoded approximate rates (last resort)
 *
 * Results are cached in-memory for 5 minutes to avoid hammering the APIs.
 */

interface RateCache {
  rates: Record<string, number>;
  fetchedAt: number;
  source: string;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes — log warning if cache older than this
let rateCache: RateCache | null = null;

// Circuit breaker: stop hammering APIs after repeated failures
let consecutiveFailures = 0;
const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_COOLDOWN_MS = 60 * 1000; // 1 minute
let circuitOpenUntil = 0;

/** Hardcoded fallback rates (USD base) — updated periodically */
const HARDCODED_RATES: Record<string, number> = {
  USD: 1,
  NGN: 1580,
  KES: 130,
  GHS: 15.5,
  TZS: 2650,
  UGX: 3750,
  ZAR: 18.5,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 149.5,
  CAD: 1.36,
  AUD: 1.53,
  CHF: 0.89,
  CNY: 7.24,
  INR: 83.1,
  BRL: 4.97,
  MXN: 17.2,
  AED: 3.67,
  SAR: 3.75,
  QAR: 3.64,
  EGP: 30.9,
  MAD: 10.1,
  XOF: 603, // West African CFA franc
  XAF: 603, // Central African CFA franc
  // Crypto (approximate)
  BTC: 0.0000154, // 1 USD = 0.0000154 BTC (i.e. BTC ≈ 65000 USD)
  ETH: 0.000313,  // 1 USD = 0.000313 ETH (i.e. ETH ≈ 3200 USD)
  USDC: 1,
  USDT: 1,
};

async function fetchFromExchangeRateApi(): Promise<Record<string, number> | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.result !== "success" || !data.rates) return null;
    return data.rates as Record<string, number>;
  } catch {
    return null;
  }
}

async function fetchFromFrankfurter(): Promise<Record<string, number> | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch("https://api.frankfurter.app/latest?from=USD", {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.rates) return null;
    // Frankfurter doesn't include USD itself
    return { USD: 1, ...data.rates } as Record<string, number>;
  } catch {
    return null;
  }
}

/** Get all rates with USD as base, using cache and fallback chain */
export async function getLiveRates(): Promise<{ rates: Record<string, number>; source: string }> {
  const now = Date.now();

  // Return cached rates if still fresh
  if (rateCache && now - rateCache.fetchedAt < CACHE_TTL_MS) {
    return { rates: rateCache.rates, source: rateCache.source };
  }

  // Staleness warning — rates older than 30 minutes
  if (rateCache && now - rateCache.fetchedAt > STALE_THRESHOLD_MS) {
    logger.warn(`[FX] Rate cache stale — age: ${Math.round((now - rateCache.fetchedAt) / 60000)}min, source: ${rateCache.source}`);
  }

  // Circuit breaker — skip live API calls if too many recent failures
  if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD && now < circuitOpenUntil) {
    logger.warn(`[FX] Circuit breaker open — ${consecutiveFailures} consecutive failures, cooling down`);
    if (rateCache) return { rates: rateCache.rates, source: `${rateCache.source} (circuit-breaker)` };
    return { rates: HARDCODED_RATES, source: "hardcoded-fallback (circuit-breaker)" };
  }

  // Tier 1: exchangerate-api.com
  const tier1 = await fetchFromExchangeRateApi();
  if (tier1) {
    consecutiveFailures = 0;
    rateCache = { rates: tier1, fetchedAt: now, source: "exchangerate-api.com" };
    return { rates: tier1, source: "exchangerate-api.com" };
  }

  // Tier 2: frankfurter.app
  const tier2 = await fetchFromFrankfurter();
  if (tier2) {
    consecutiveFailures = 0;
    // Frankfurter doesn't have crypto or African currencies — merge with hardcoded for those
    const merged = { ...HARDCODED_RATES, ...tier2 };
    rateCache = { rates: merged, fetchedAt: now, source: "frankfurter.app" };
    return { rates: merged, source: "frankfurter.app" };
  }

  // Both APIs failed — increment circuit breaker
  consecutiveFailures++;
  if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
    circuitOpenUntil = now + CIRCUIT_BREAKER_COOLDOWN_MS;
    logger.error(`[FX] Circuit breaker opened after ${consecutiveFailures} failures — cooldown ${CIRCUIT_BREAKER_COOLDOWN_MS / 1000}s`);
  }

  // Tier 3: Hardcoded fallback
  rateCache = { rates: HARDCODED_RATES, fetchedAt: now, source: "hardcoded-fallback" };
  return { rates: HARDCODED_RATES, source: "hardcoded-fallback" };
}

/**
 * Get exchange rate between two currencies.
 * Returns the rate (how many `to` you get per 1 `from`).
 */
export async function getFxRate(from: string, to: string): Promise<{ rate: number; source: string }> {
  // Normalise crypto tickers
  const fromNorm = from.toUpperCase();
  const toNorm = to.toUpperCase();

  if (fromNorm === toNorm) return { rate: 1, source: "identity" };

  const { rates, source } = await getLiveRates();

  // Both in the rates table (USD-base cross-rate)
  const fromRate = rates[fromNorm]; // units of fromNorm per 1 USD
  const toRate = rates[toNorm];     // units of toNorm per 1 USD

  if (fromRate && toRate) {
    // rate = toRate / fromRate  (how many toNorm per 1 fromNorm)
    return { rate: toRate / fromRate, source };
  }

  // Crypto special cases — BTC/ETH are stored as USD-per-coin in HARDCODED_RATES
  // but live APIs store them as coins-per-USD. Handle both conventions.
  const cryptoUsdPrices: Record<string, number> = {
    BTC: 65000,
    ETH: 3200,
    USDC: 1,
    USDT: 1,
  };

  const fromUsd = cryptoUsdPrices[fromNorm] ?? (fromRate ? 1 / fromRate : null);
  const toUsd = cryptoUsdPrices[toNorm] ?? (toRate ? 1 / toRate : null);

  if (fromUsd && toUsd) {
    return { rate: fromUsd / toUsd, source: "crypto-hardcoded" };
  }

  // Last resort: return 1 with a warning
  logger.warn(`[FX] No rate found for ${fromNorm}→${toNorm}, returning 1`);
  return { rate: 1, source: "unknown" };
}

/**
 * Get a full quote for a remittance.
 */
export async function getRemittanceQuote(params: {
  fromCurrency: string;
  toCurrency: string;
  amount: number;
  feePercent?: number;
}) {
  const { fromCurrency, toCurrency, amount, feePercent = 1 } = params;
  const { rate, source } = await getFxRate(fromCurrency, toCurrency);
  const fee = amount * (feePercent / 100);
  const netAmount = amount - fee;
  const recipientAmount = netAmount * rate;
  return {
    fromCurrency: fromCurrency.toUpperCase(),
    toCurrency: toCurrency.toUpperCase(),
    rate,
    amount,
    fee,
    netAmount,
    recipientAmount,
    expiresAt: Date.now() + 5 * 60 * 1000,
    provider: source,
    rateSource: source,
  };
}

/** Force-refresh the cache (useful for admin endpoints) */
export async function refreshRateCache(): Promise<{ source: string; currencyCount: number }> {
  rateCache = null;
  const { rates, source } = await getLiveRates();
  return { source, currencyCount: Object.keys(rates).length };
}

/** Get all available rates (for the exchange rate overrides page) */
export async function getAllRates(): Promise<{ rates: Record<string, number>; source: string; cachedAt: number | null }> {
  const { rates, source } = await getLiveRates();
  return { rates, source, cachedAt: rateCache?.fetchedAt ?? null };
}
