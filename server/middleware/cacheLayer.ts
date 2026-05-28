/**
 * Server-Side Cache Layer — Redis-backed response caching with TTL, invalidation, and warming.
 *
 * Strategies:
 * - cache-aside: Check cache first, fetch on miss, store result (default for reads)
 * - write-through: Update cache on writes (invalidation)
 * - stale-while-revalidate: Return stale, refresh in background
 *
 * Features:
 * - Per-route TTL configuration
 * - User-scoped vs. shared caching
 * - Tag-based invalidation (invalidate all caches matching a tag)
 * - Cache warming on startup
 * - Cache statistics and monitoring
 * - Automatic serialization/deserialization
 */
import { cacheGet, cacheSet, cacheDel, publish, getCacheStats } from "./redisClient";
import { logger } from "../_core/logger";

// ─── Cache Configuration ─────────────────────────────────────────────────────

export interface CacheConfig {
  /** TTL in seconds */
  ttl: number;
  /** Whether cache is per-user (includes userId in key) or shared */
  scope: "user" | "shared";
  /** Tags for group invalidation */
  tags?: string[];
  /** Strategy */
  strategy?: "cache-aside" | "stale-while-revalidate";
  /** Custom key prefix override */
  prefix?: string;
}

/**
 * Route-level cache configuration.
 * Key format: "routerName.procedureName"
 * Only query (GET) procedures should be cached.
 */
export const CACHE_ROUTES: Record<string, CacheConfig> = {
  // ─── High-frequency dashboard queries (shared, short TTL) ─────────────────
  "analytics.overview": { ttl: 30, scope: "shared", tags: ["analytics"] },
  "analytics.revenueByCountry": { ttl: 60, scope: "shared", tags: ["analytics"] },
  "analytics.userGrowth": { ttl: 120, scope: "shared", tags: ["analytics"] },
  "nocDashboard.overview": { ttl: 15, scope: "shared", tags: ["noc"] },
  "nocDashboard.eventTimeline": { ttl: 15, scope: "shared", tags: ["noc"] },
  "middlewareHub.healthCheck": { ttl: 10, scope: "shared", tags: ["health"] },
  "middlewareHub.serviceMesh": { ttl: 30, scope: "shared", tags: ["health"] },

  // ─── Exchange rates (shared, medium TTL) ──────────────────────────────────
  "exchangeRates.list": { ttl: 60, scope: "shared", tags: ["fx"] },
  "exchangeRates.convert": { ttl: 30, scope: "shared", tags: ["fx"] },
  "exchangeRates.history": { ttl: 300, scope: "shared", tags: ["fx"] },

  // ─── Tourist services (per-user, medium TTL) ──────────────────────────────
  "touristPortal.myBookings": { ttl: 60, scope: "user", tags: ["bookings"] },
  "touristPortal.myItinerary": { ttl: 120, scope: "user", tags: ["itinerary"] },
  "touristPortal.nearbyAttractions": { ttl: 300, scope: "shared", tags: ["attractions"] },
  "touristPortal.establishmentSearch": { ttl: 120, scope: "shared", tags: ["establishments"] },
  "loyalty.getPoints": { ttl: 30, scope: "user", tags: ["loyalty"] },
  "loyalty.getRewards": { ttl: 300, scope: "shared", tags: ["loyalty"] },
  "loyalty.getHistory": { ttl: 60, scope: "user", tags: ["loyalty"] },

  // ─── AR Tourism (shared, long TTL — static seeded data) ───────────────────
  "arTourism.list": { ttl: 600, scope: "shared", tags: ["ar"] },
  "arTourism.nearby": { ttl: 300, scope: "shared", tags: ["ar"] },

  // ─── Identity (per-user, medium TTL) ──────────────────────────────────────
  "identity.stats": { ttl: 60, scope: "user", tags: ["identity"] },
  "identity.getDid": { ttl: 300, scope: "user", tags: ["identity"] },
  "identity.listCredentials": { ttl: 60, scope: "user", tags: ["identity"] },

  // ─── Payment (per-user + shared) ──────────────────────────────────────────
  "paymentRails.providers": { ttl: 600, scope: "shared", tags: ["payments"] },
  "wallet.balance": { ttl: 15, scope: "user", tags: ["wallet"] },
  "wallet.transactions": { ttl: 30, scope: "user", tags: ["wallet"] },

  // ─── Map services (shared, long TTL — third-party data) ───────────────────
  "mapLocation.config": { ttl: 3600, scope: "shared", tags: ["map"] },
  "mapLocation.geocode": { ttl: 86400, scope: "shared", tags: ["map"] },
  "mapLocation.reverseGeocode": { ttl: 86400, scope: "shared", tags: ["map"] },

  // ─── Admin / BIS (shared, short TTL) ──────────────────────────────────────
  "admin.usersList": { ttl: 30, scope: "shared", tags: ["users"] },
  "bis.investigations": { ttl: 30, scope: "shared", tags: ["bis"] },
  "bis.dashboard": { ttl: 15, scope: "shared", tags: ["bis"] },

  // ─── Settlement / PaymentSwitch (shared, short TTL) ────────────────────────
  "settlement.list": { ttl: 15, scope: "shared", tags: ["settlement"] },
  "settlement.stats": { ttl: 30, scope: "shared", tags: ["settlement"] },
  "paymentSwitch.participants": { ttl: 60, scope: "shared", tags: ["ps"] },
  "paymentSwitch.transactionVolume": { ttl: 15, scope: "shared", tags: ["ps"] },

  // ─── Copilot (per-user, short TTL — avoids duplicate LLM calls) ───────────
  "copilot.suggestions": { ttl: 300, scope: "user", tags: ["copilot"] },
};

// ─── Invalidation Mapping ────────────────────────────────────────────────────
// When a mutation runs, which cache tags should be invalidated?

export const INVALIDATION_MAP: Record<string, string[]> = {
  // Wallet mutations invalidate wallet + analytics caches
  "wallet.transfer": ["wallet", "analytics"],
  "wallet.topUp": ["wallet", "analytics"],
  "wallet.withdraw": ["wallet", "analytics"],

  // Booking mutations invalidate bookings + analytics
  "touristPortal.createBooking": ["bookings", "analytics", "establishments"],
  "touristPortal.cancelBooking": ["bookings", "analytics"],

  // Identity mutations
  "identity.createDid": ["identity"],
  "identity.issueCredential": ["identity"],
  "identity.revokeCredential": ["identity"],

  // Loyalty mutations
  "loyalty.redeemReward": ["loyalty", "wallet"],
  "loyalty.earnPoints": ["loyalty"],

  // Admin mutations
  "admin.updateUser": ["users"],
  "admin.deleteUser": ["users", "analytics"],

  // Payment mutations
  "paymentRails.initiate": ["wallet", "payments", "analytics"],

  // Settlement mutations
  "settlement.create": ["settlement", "ps", "analytics"],
  "settlement.approve": ["settlement", "ps"],

  // BIS mutations
  "bis.createInvestigation": ["bis"],
  "bis.updateInvestigation": ["bis"],

  // Exchange rate mutations
  "exchangeRates.update": ["fx"],

  // NOC events
  "nocDashboard.createEvent": ["noc"],
  "nocDashboard.resolveEvent": ["noc"],
};

// ─── Tag Registry ────────────────────────────────────────────────────────────
// Track which cache keys belong to which tags for efficient invalidation

const tagIndex = new Map<string, Set<string>>();

function registerTag(tag: string, cacheKey: string): void {
  if (!tagIndex.has(tag)) tagIndex.set(tag, new Set());
  tagIndex.get(tag)!.add(cacheKey);
}

// ─── Core Cache Functions ────────────────────────────────────────────────────

/**
 * Build a cache key from route path, input, and user context.
 */
export function buildCacheKey(
  routePath: string,
  input: unknown,
  userId?: string | number,
  config?: CacheConfig
): string {
  const prefix = config?.prefix || "trpc";
  const inputHash = input ? hashInput(input) : "no-input";
  const scope = config?.scope === "user" && userId ? `:u:${userId}` : "";
  return `${prefix}:${routePath}${scope}:${inputHash}`;
}

function hashInput(input: unknown): string {
  const str = JSON.stringify(input, Object.keys(input as object).sort());
  // Simple FNV-1a hash for fast key generation
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

// ─── Cache Stampede Protection ───────────────────────────────────────────────
// Prevents thundering herd: when multiple requests hit an expired key simultaneously,
// only ONE request computes the result, others wait for it.

const inflightRequests = new Map<string, Promise<unknown>>();

/**
 * Execute a function with stampede protection.
 * If a request for the same key is already in-flight, wait for it.
 */
export async function withStampedeProtection<T>(
  key: string,
  fetcher: () => Promise<T>
): Promise<T> {
  const existing = inflightRequests.get(key);
  if (existing) {
    cacheMetrics.stampedePrevented = (cacheMetrics.stampedePrevented || 0) + 1;
    return existing as Promise<T>;
  }

  const promise = fetcher().finally(() => {
    inflightRequests.delete(key);
  });
  inflightRequests.set(key, promise);
  return promise;
}

/**
 * Try to get a cached response for a tRPC query.
 * Returns null on cache miss.
 */
export async function getCachedResponse(
  routePath: string,
  input: unknown,
  userId?: string | number
): Promise<{ data: unknown; hit: true; age: number } | null> {
  const config = CACHE_ROUTES[routePath];
  if (!config) return null;

  const key = buildCacheKey(routePath, input, userId, config);

  try {
    const raw = await cacheGet(key);
    if (!raw) {
      cacheMetrics.misses++;
      return null;
    }

    const entry = JSON.parse(raw) as { data: unknown; storedAt: number };
    const age = Math.floor((Date.now() - entry.storedAt) / 1000);

    // Check if stale (past TTL) — for stale-while-revalidate
    if (age > config.ttl) {
      cacheMetrics.misses++;
      if (config.strategy === "stale-while-revalidate") {
        // Return stale data but mark for background refresh
        cacheMetrics.staleHits++;
        return { data: entry.data, hit: true, age };
      }
      // Expired — treat as miss
      await cacheDel(key);
      return null;
    }

    cacheMetrics.hits++;
    return { data: entry.data, hit: true, age };
  } catch {
    cacheMetrics.errors++;
    return null;
  }
}

/**
 * Store a response in the cache.
 */
export async function setCachedResponse(
  routePath: string,
  input: unknown,
  data: unknown,
  userId?: string | number
): Promise<void> {
  const config = CACHE_ROUTES[routePath];
  if (!config) return;

  const key = buildCacheKey(routePath, input, userId, config);
  const entry = { data, storedAt: Date.now() };

  try {
    // Store with TTL + 10% buffer for stale-while-revalidate
    const ttl = config.strategy === "stale-while-revalidate"
      ? Math.ceil(config.ttl * 1.5)
      : config.ttl;

    await cacheSet(key, JSON.stringify(entry), ttl);

    // Register tags for invalidation
    if (config.tags) {
      for (const tag of config.tags) {
        registerTag(tag, key);
      }
    }

    cacheMetrics.writes++;
  } catch {
    cacheMetrics.errors++;
  }
}

/**
 * Invalidate all cached responses matching the given tags.
 * Called after mutations.
 */
export async function invalidateByTags(tags: string[]): Promise<number> {
  let invalidated = 0;

  for (const tag of tags) {
    const keys = tagIndex.get(tag);
    if (!keys) continue;

    const deletePromises = Array.from(keys).map(async (key) => {
      await cacheDel(key);
      invalidated++;
    });

    await Promise.allSettled(deletePromises);
    tagIndex.delete(tag);
  }

  // Publish invalidation event for multi-instance sync
  if (invalidated > 0) {
    try {
      await publish("cache:invalidate", JSON.stringify({ tags, count: invalidated }));
    } catch { /* best effort */ }
  }

  cacheMetrics.invalidations += invalidated;
  logger.debug("Cache invalidated", { tags, count: invalidated });
  return invalidated;
}

/**
 * Invalidate all caches for a specific user.
 */
export async function invalidateUserCache(userId: string | number): Promise<void> {
  // Since we can't scan Redis without KEYS/SCAN, invalidate known user-scoped routes
  const userRoutes = Object.entries(CACHE_ROUTES)
    .filter(([, config]) => config.scope === "user");

  for (const [route, config] of userRoutes) {
    const key = `trpc:${route}:u:${userId}:*`;
    // For the in-memory fallback, we just clear all user-scoped entries
    await cacheDel(`trpc:${route}:u:${userId}:no-input`);
  }
}

// ─── Cache Warming ───────────────────────────────────────────────────────────

export interface WarmTarget {
  route: string;
  input?: unknown;
  /** Function that fetches the actual data */
  fetcher: () => Promise<unknown>;
}

const warmTargets: WarmTarget[] = [];

export function registerWarmTarget(target: WarmTarget): void {
  warmTargets.push(target);
}

/**
 * Warm all registered cache targets on startup.
 * Should be called after server initialization.
 */
export async function warmCache(): Promise<{ warmed: number; failed: number }> {
  let warmed = 0;
  let failed = 0;

  logger.info("Cache warming started", { targets: warmTargets.length });

  for (const target of warmTargets) {
    try {
      const data = await target.fetcher();
      await setCachedResponse(target.route, target.input, data);
      warmed++;
    } catch (err) {
      failed++;
      logger.warn("Cache warm failed", { route: target.route, error: (err as Error).message });
    }
  }

  logger.info("Cache warming complete", { warmed, failed });
  return { warmed, failed };
}

// ─── Cache Metrics ───────────────────────────────────────────────────────────

export const cacheMetrics: {
  hits: number;
  misses: number;
  staleHits: number;
  writes: number;
  invalidations: number;
  errors: number;
  stampedePrevented: number;
  readonly hitRate: number;
  readonly totalRequests: number;
  reset(): void;
} = {
  hits: 0,
  misses: 0,
  staleHits: 0,
  writes: 0,
  invalidations: 0,
  errors: 0,
  stampedePrevented: 0,
  get hitRate(): number {
    const total = this.hits + this.misses;
    return total === 0 ? 0 : Math.round((this.hits / total) * 10000) / 100;
  },
  get totalRequests(): number {
    return this.hits + this.misses;
  },
  reset(): void {
    this.hits = 0;
    this.misses = 0;
    this.staleHits = 0;
    this.writes = 0;
    this.invalidations = 0;
    this.errors = 0;
    this.stampedePrevented = 0;
  },
};

/**
 * Get comprehensive cache statistics.
 */
export function getFullCacheStats() {
  const redisStats = getCacheStats();
  return {
    ...cacheMetrics,
    hitRate: cacheMetrics.hitRate,
    redis: redisStats,
    configuredRoutes: Object.keys(CACHE_ROUTES).length,
    invalidationRules: Object.keys(INVALIDATION_MAP).length,
    registeredTags: tagIndex.size,
    warmTargets: warmTargets.length,
  };
}

// ─── tRPC Middleware Integration ─────────────────────────────────────────────

/**
 * Creates a tRPC middleware that adds caching to query procedures.
 * Should be applied at the router level for configured routes.
 */
export function createCacheMiddleware(t: any) {
  return t.middleware(async (opts: any) => {
    const { ctx, next, path, type, rawInput } = opts;

    // Only cache queries, not mutations
    if (type !== "query") {
      const result = await next();

      // On successful mutations, invalidate related caches
      if (type === "mutation" && result.ok) {
        const tags = INVALIDATION_MAP[path];
        if (tags) {
          // Fire-and-forget invalidation
          invalidateByTags(tags).catch(() => {});
        }
      }

      return result;
    }

    // Check if this route has caching configured
    const config = CACHE_ROUTES[path];
    if (!config) return next();

    const userId = config.scope === "user" ? ctx.user?.id : undefined;

    // Try cache first
    const cached = await getCachedResponse(path, rawInput, userId);
    if (cached) {
      // Set cache headers on response
      if (ctx.res && !ctx.res.headersSent) {
        ctx.res.setHeader("X-Cache", "HIT");
        ctx.res.setHeader("X-Cache-Age", String(cached.age));
      }
      return { ok: true, data: cached.data, marker: opts.marker ?? Symbol() };
    }

    // Cache miss — execute with stampede protection
    const cacheKey = buildCacheKey(path, rawInput, userId, config);
    const result = await withStampedeProtection(cacheKey, () => next());

    if ((result as any).ok) {
      // Store in cache (fire-and-forget)
      setCachedResponse(path, rawInput, (result as any).data, userId).catch(() => {});

      // Set cache headers
      if (ctx.res && !ctx.res.headersSent) {
        ctx.res.setHeader("X-Cache", "MISS");
        ctx.res.setHeader("X-Cache-TTL", String(config.ttl));
      }
    }

    return result;
  });
}

/**
 * HTTP Cache-Control header middleware for Express.
 * Sets appropriate Cache-Control headers based on route patterns.
 */
export function httpCacheHeaders(req: any, res: any, next: any): void {
  const path = req.path;

  // Static assets — long cache
  if (path.match(/\.(js|css|png|jpg|svg|woff2?|ttf|eot)$/)) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return next();
  }

  // Health endpoints — no cache
  if (path.startsWith("/api/health")) {
    res.setHeader("Cache-Control", "no-store");
    return next();
  }

  // SSE — no cache
  if (path.startsWith("/api/sse")) {
    res.setHeader("Cache-Control", "no-cache, no-transform");
    return next();
  }

  // tRPC queries (GET) — short public cache with stale-while-revalidate
  if (path.startsWith("/api/trpc") && req.method === "GET") {
    res.setHeader("Cache-Control", "private, max-age=0, s-maxage=10, stale-while-revalidate=30");
    return next();
  }

  // tRPC mutations (POST) — no cache
  if (path.startsWith("/api/trpc") && req.method === "POST") {
    res.setHeader("Cache-Control", "no-store");
    return next();
  }

  // Default — private, short lived
  res.setHeader("Cache-Control", "private, no-cache");
  next();
}
