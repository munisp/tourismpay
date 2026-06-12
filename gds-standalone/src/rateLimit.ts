/**
 * Per-tenant, per-agent rate limiting for the GDS API.
 * Uses in-memory store (Redis in production).
 */
import { Request, Response, NextFunction } from "express";
import { config } from "./config";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

export function rateLimiter(req: Request, res: Response, next: NextFunction): void {
  const key = req.gdsUser?.sub || req.ip || "anonymous";
  const now = Date.now();

  let entry = store.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + config.RATE_LIMIT_WINDOW_MS };
    store.set(key, entry);
  }

  entry.count++;

  const limit = config.RATE_LIMIT_MAX;
  const remaining = Math.max(0, limit - entry.count);

  res.setHeader("X-RateLimit-Limit", limit.toString());
  res.setHeader("X-RateLimit-Remaining", remaining.toString());
  res.setHeader("X-RateLimit-Reset", Math.ceil(entry.resetAt / 1000).toString());

  if (entry.count > limit) {
    res.status(429).json({
      error: "Rate limit exceeded",
      limit,
      retryAfter: Math.ceil((entry.resetAt - now) / 1000),
    });
    return;
  }

  next();
}
