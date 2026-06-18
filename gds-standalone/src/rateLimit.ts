/**
 * Per-tenant, per-agent rate limiting for the GDS API.
 * Uses Redis when available, falls back to in-memory store.
 */
import { Request, Response, NextFunction } from "express";
import { config } from "./config";
import { cacheIncr, isRedisAvailable } from "./lib/redis";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, RateLimitEntry>();

// Clean up expired entries every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memoryStore) {
    if (now > entry.resetAt) memoryStore.delete(key);
  }
}, 60000);

export async function rateLimiter(req: Request, res: Response, next: NextFunction): Promise<void> {
  const key = req.gdsUser?.sub || req.ip || "anonymous";
  const windowSeconds = Math.ceil(config.RATE_LIMIT_WINDOW_MS / 1000);
  const limit = config.RATE_LIMIT_MAX;

  let count: number;

  if (isRedisAvailable()) {
    // Redis-backed rate limiting (distributed, works across instances)
    const redisKey = `gds:ratelimit:${key}`;
    count = await cacheIncr(redisKey, windowSeconds);
  } else {
    // In-memory fallback (single instance only)
    const now = Date.now();
    let entry = memoryStore.get(key);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + config.RATE_LIMIT_WINDOW_MS };
      memoryStore.set(key, entry);
    }
    entry.count++;
    count = entry.count;
  }

  const remaining = Math.max(0, limit - count);

  res.setHeader("X-RateLimit-Limit", limit.toString());
  res.setHeader("X-RateLimit-Remaining", remaining.toString());
  res.setHeader("X-RateLimit-Reset", Math.ceil((Date.now() + config.RATE_LIMIT_WINDOW_MS) / 1000).toString());

  if (count > limit) {
    res.status(429).json({
      error: "Rate limit exceeded",
      limit,
      retryAfter: windowSeconds,
    });
    return;
  }

  next();
}
