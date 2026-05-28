/**
 * Cache Warm Targets — registers queries to pre-populate on server startup.
 *
 * These are high-traffic, shared-scope queries that benefit from being
 * cached before the first user request arrives.
 */
import { registerWarmTarget } from "./cacheLayer";
import { logger } from "../_core/logger";

/**
 * Register all cache warm targets.
 * Call this during server initialization after DB is ready.
 */
export function registerCacheWarmTargets(): void {
  // FX rates — every user conversion needs this
  registerWarmTarget({
    route: "exchangeRates.list",
    input: undefined,
    fetcher: async () => {
      const { getAllRates } = await import("../_core/fxRates");
      return getAllRates();
    },
  });

  // Loyalty rewards catalog — frequently browsed
  registerWarmTarget({
    route: "loyalty.getRewards",
    input: undefined,
    fetcher: async () => {
      try {
        const { getDb } = await import("../db");
        const db = await getDb();
        if (!db) return [];
        const { loyaltyRewards } = await import("../../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        return db.select().from(loyaltyRewards).where(eq(loyaltyRewards.isActive, true));
      } catch {
        return [];
      }
    },
  });

  // Payment rails provider list — rarely changes
  registerWarmTarget({
    route: "paymentRails.providers",
    input: undefined,
    fetcher: async () => {
      return [
        { id: "stripe", name: "Stripe Connect", enabled: !!process.env.STRIPE_SECRET_KEY, currencies: ["USD", "EUR", "GBP"] },
        { id: "mpesa", name: "M-Pesa", enabled: !!process.env.MPESA_CONSUMER_KEY, currencies: ["KES", "TZS", "UGX"] },
        { id: "flutterwave", name: "Flutterwave", enabled: !!process.env.FLUTTERWAVE_SECRET_KEY, currencies: ["NGN", "GHS", "ZAR", "KES"] },
        { id: "wise", name: "Wise (TransferWise)", enabled: !!process.env.WISE_API_KEY, currencies: ["USD", "EUR", "GBP", "KES", "ZAR"] },
      ];
    },
  });

  // Map config — needed by all tourist-facing pages
  registerWarmTarget({
    route: "mapLocation.config",
    input: undefined,
    fetcher: async () => ({
      provider: process.env.MAPBOX_TOKEN ? "mapbox" : "openstreetmap",
      defaultCenter: { lat: -1.2921, lng: 36.8219 },
      defaultZoom: 12,
      tileUrl: process.env.MAPBOX_TOKEN
        ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/{z}/{x}/{y}?access_token=${process.env.MAPBOX_TOKEN}`
        : "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    }),
  });

  logger.info("Cache warm targets registered", { count: 4 });
}
