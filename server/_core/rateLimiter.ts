/**
 * Redis-Backed Rate Limiting Middleware
 *
 * Enforces per-route rate limits using Redis sliding window counters.
 * When Redis is unavailable, falls back to in-memory counters (per-instance only).
 *
 * Rate limits:
 *  - General API: 100 req/min per IP
 *  - Auth endpoints: 10 req/min per IP
 *  - Wallet transactions: 30 req/min per user
 *  - BIS operations: 20 req/min per user
 *  - Settlement: 5 req/min per user
 *  - Public endpoints: 200 req/min per IP
 */
import type { Request, Response, NextFunction } from "express";
import { incrementRateLimit } from "./redis";
import { logger } from "./logger";

// ─── In-Memory Fallback ──────────────────────────────────────────────────────

const memoryStore = new Map<string, { count: number; resetAt: number }>();

function memoryIncrement(key: string, windowMs: number): number {
  const now = Date.now();
  const entry = memoryStore.get(key);
  if (!entry || now > entry.resetAt) {
    memoryStore.set(key, { count: 1, resetAt: now + windowMs });
    return 1;
  }
  entry.count++;
  return entry.count;
}

// Clean up expired entries every 60s
setInterval(() => {
  const now = Date.now();
  memoryStore.forEach((entry, key) => {
    if (now > entry.resetAt) memoryStore.delete(key);
  });
}, 60_000);

// ─── Rate Limit Configs ──────────────────────────────────────────────────────

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: 100,
};

export const RATE_LIMITS = {
  general: { windowMs: 60_000, maxRequests: 100 },
  auth: { windowMs: 60_000, maxRequests: 10 },
  wallet: { windowMs: 60_000, maxRequests: 30 },
  bis: { windowMs: 60_000, maxRequests: 20 },
  settlement: { windowMs: 60_000, maxRequests: 5 },
  public: { windowMs: 60_000, maxRequests: 200 },
} as const;

// ─── Middleware Factory ──────────────────────────────────────────────────────

function getClientIp(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
    || req.socket.remoteAddress
    || "unknown";
}

function getUserId(req: Request): string {
  // Try to get user from session or keycloak
  const session = (req as any).session;
  if (session?.userId) return `user:${session.userId}`;
  const keycloakUser = (req as any).keycloakUser;
  if (keycloakUser?.sub) return `user:${keycloakUser.sub}`;
  return `ip:${getClientIp(req)}`;
}

export function createRateLimit(config: Partial<RateLimitConfig> = {}) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  return async (req: Request, res: Response, next: NextFunction) => {
    const key = finalConfig.keyGenerator
      ? finalConfig.keyGenerator(req)
      : `rl:${getClientIp(req)}:${req.path}`;

    try {
      // Try Redis first, fall back to memory
      let count = await incrementRateLimit(key, finalConfig.windowMs);
      if (count === 0) {
        count = memoryIncrement(key, finalConfig.windowMs);
      }

      // Set rate limit headers
      res.setHeader("X-RateLimit-Limit", finalConfig.maxRequests);
      res.setHeader("X-RateLimit-Remaining", Math.max(0, finalConfig.maxRequests - count));
      res.setHeader("X-RateLimit-Reset", Math.ceil((Date.now() + finalConfig.windowMs) / 1000));

      if (count > finalConfig.maxRequests) {
        logger.warn(`[RateLimit] Exceeded for ${key}: ${count}/${finalConfig.maxRequests}`);
        res.status(429).json({
          error: "Rate limit exceeded",
          limit: finalConfig.maxRequests,
          windowMs: finalConfig.windowMs,
          retryAfter: Math.ceil(finalConfig.windowMs / 1000),
        });
        return;
      }
    } catch (err) {
      // On error, allow the request through (fail open)
      logger.warn(`[RateLimit] Error checking limit: ${(err as Error).message}`);
    }
    next();
  };
}

// ─── Pre-built Middleware ────────────────────────────────────────────────────

export const generalRateLimit = createRateLimit(RATE_LIMITS.general);

export const authRateLimit = createRateLimit({
  ...RATE_LIMITS.auth,
  keyGenerator: (req) => `rl:auth:${getClientIp(req)}`,
});

export const walletRateLimit = createRateLimit({
  ...RATE_LIMITS.wallet,
  keyGenerator: (req) => `rl:wallet:${getUserId(req)}`,
});

export const bisRateLimit = createRateLimit({
  ...RATE_LIMITS.bis,
  keyGenerator: (req) => `rl:bis:${getUserId(req)}`,
});

export const settlementRateLimit = createRateLimit({
  ...RATE_LIMITS.settlement,
  keyGenerator: (req) => `rl:settlement:${getUserId(req)}`,
});
