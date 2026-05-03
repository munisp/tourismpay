/**
 * Express Rate Limiter — unified rate limiting layer.
 *
 * Provides per-IP rate limiting for different endpoint categories:
 * - Auth endpoints: 15 req/min (brute force protection)
 * - Demo login: 10 req/min
 * - Payment mutations: 30 req/min
 * - General API: 120 req/min
 * - Static assets: unlimited
 *
 * Uses Redis-backed counters when available (via cacheIncr), with
 * in-memory Map fallback for single-instance deployments.
 */
import type { Request, Response, NextFunction } from "express";
import { cacheIncr } from "../middleware/redisClient";

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

const ROUTE_LIMITS: { pattern: RegExp; config: RateLimitConfig }[] = [
  { pattern: /^\/api\/demo-login/, config: { windowMs: 60_000, maxRequests: 10 } },
  { pattern: /^\/api\/dev\//, config: { windowMs: 60_000, maxRequests: 20 } },
  { pattern: /^\/api\/trpc\/auth\./, config: { windowMs: 60_000, maxRequests: 15 } },
  { pattern: /^\/api\/trpc\/qrPayment\./, config: { windowMs: 60_000, maxRequests: 30 } },
  { pattern: /^\/api\/trpc\/wallet\./, config: { windowMs: 60_000, maxRequests: 50 } },
  { pattern: /^\/api\/trpc\/remittance\.create/, config: { windowMs: 60_000, maxRequests: 20 } },
  { pattern: /^\/api\//, config: { windowMs: 60_000, maxRequests: 120 } },
];

function getLimit(path: string): RateLimitConfig {
  for (const rule of ROUTE_LIMITS) {
    if (rule.pattern.test(path)) return rule.config;
  }
  return { windowMs: 60_000, maxRequests: 200 };
}

function getClientIp(req: Request): string {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.ip ||
    req.socket.remoteAddress ||
    "unknown"
  );
}

export function rateLimiterMiddleware(req: Request, res: Response, next: NextFunction) {
  // Skip static assets
  if (req.path.match(/\.(js|css|png|jpg|svg|woff2|ico|map)$/)) return next();

  const ip = getClientIp(req);
  const { windowMs, maxRequests } = getLimit(req.path);
  const windowSeconds = Math.ceil(windowMs / 1000);
  const routeKey = req.path.split("/").slice(0, 4).join("/");
  const key = `ratelimit:${ip}:${routeKey}`;

  // Use Redis-backed atomic increment (falls back to in-memory)
  cacheIncr(key, windowSeconds)
    .then((count) => {
      res.setHeader("X-RateLimit-Limit", maxRequests);
      res.setHeader("X-RateLimit-Remaining", Math.max(0, maxRequests - count));
      res.setHeader("X-RateLimit-Reset", Math.ceil((Date.now() + windowMs) / 1000));

      if (count > maxRequests) {
        res.setHeader("Retry-After", windowSeconds);
        res.status(429).json({ error: "Too many requests. Please try again later." });
        return;
      }

      next();
    })
    .catch(() => {
      // On cache error, allow the request through
      next();
    });
}
