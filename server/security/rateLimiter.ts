/**
 * Express Rate Limiter — first-line defense at the application layer.
 *
 * Provides per-IP rate limiting for different endpoint categories:
 * - Auth endpoints: 10 req/min (brute force protection)
 * - Payment mutations: 30 req/min
 * - General API: 100 req/min
 * - Static assets: unlimited
 */
import type { Request, Response, NextFunction } from "express";

interface RateBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateBucket>();

// Cleanup stale buckets every 5 minutes
setInterval(() => {
  const now = Date.now();
  const keysToDelete: string[] = [];
  buckets.forEach((bucket, key) => {
    if (bucket.resetAt < now) keysToDelete.push(key);
  });
  keysToDelete.forEach(key => buckets.delete(key));
}, 300_000);

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
  const key = `${ip}:${req.path.split("/").slice(0, 4).join("/")}`;
  const now = Date.now();

  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }

  bucket.count++;

  // Set rate limit headers
  res.setHeader("X-RateLimit-Limit", maxRequests);
  res.setHeader("X-RateLimit-Remaining", Math.max(0, maxRequests - bucket.count));
  res.setHeader("X-RateLimit-Reset", Math.ceil(bucket.resetAt / 1000));

  if (bucket.count > maxRequests) {
    res.setHeader("Retry-After", Math.ceil((bucket.resetAt - now) / 1000));
    res.status(429).json({ error: "Too many requests. Please try again later." });
    return;
  }

  next();
}
