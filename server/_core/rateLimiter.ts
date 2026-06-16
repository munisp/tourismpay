/**
 * Per-Entity Rate Limiting (3.4)
 * 
 * Granular rate limits per user, merchant, and endpoint.
 * Includes velocity checks for fraud detection.
 *
 * Middleware integration: Redis (sliding window counters),
 * Kafka (rate limit breach events), OpenSearch (analytics).
 */
import { Request, Response, NextFunction } from "express";
import { incrementRateLimit, cacheGet } from "./redis";
import { publishAuditEvent } from "./kafka";
import { logger } from "./logger";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RateLimitRule {
  key: string;
  maxRequests: number;
  windowSeconds: number;
  blockDurationSeconds?: number;
}

interface VelocityCheck {
  metric: string;
  threshold: number;
  windowSeconds: number;
  action: "warn" | "block" | "flag_fraud";
}

// ─── Rules ────────────────────────────────────────────────────────────────────

const RATE_LIMIT_RULES: Record<string, RateLimitRule> = {
  // Payment operations
  "payment:attempt": { key: "payment:attempt", maxRequests: 10, windowSeconds: 60 },
  "payment:create": { key: "payment:create", maxRequests: 30, windowSeconds: 3600 },
  
  // KYB operations
  "kyb:submit": { key: "kyb:submit", maxRequests: 5, windowSeconds: 86400 },
  "kyb:document_upload": { key: "kyb:document_upload", maxRequests: 20, windowSeconds: 3600 },
  
  // Auth operations
  "auth:login": { key: "auth:login", maxRequests: 5, windowSeconds: 300, blockDurationSeconds: 900 },
  "auth:password_reset": { key: "auth:password_reset", maxRequests: 3, windowSeconds: 3600 },
  
  // Merchant operations
  "merchant:qr_generate": { key: "merchant:qr_generate", maxRequests: 100, windowSeconds: 3600 },
  "merchant:payout": { key: "merchant:payout", maxRequests: 10, windowSeconds: 86400 },
  
  // Wallet operations
  "wallet:transfer": { key: "wallet:transfer", maxRequests: 20, windowSeconds: 3600 },
  "wallet:topup": { key: "wallet:topup", maxRequests: 5, windowSeconds: 3600 },
  
  // API general
  "api:search": { key: "api:search", maxRequests: 60, windowSeconds: 60 },
  "api:export": { key: "api:export", maxRequests: 5, windowSeconds: 3600 },
};

const VELOCITY_CHECKS: VelocityCheck[] = [
  { metric: "payment:total_amount", threshold: 500000, windowSeconds: 3600, action: "flag_fraud" }, // $5000/hr
  { metric: "payment:unique_merchants", threshold: 20, windowSeconds: 3600, action: "warn" }, // 20 merchants/hr
  { metric: "transfer:unique_recipients", threshold: 10, windowSeconds: 3600, action: "flag_fraud" }, // 10 recipients/hr
  { metric: "login:failed_attempts", threshold: 10, windowSeconds: 600, action: "block" }, // 10 failed/10min
];

// ─── Rate Limit Check ─────────────────────────────────────────────────────────

export async function checkRateLimit(
  operation: string,
  entityId: string,
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const rule = RATE_LIMIT_RULES[operation];
  if (!rule) return { allowed: true, remaining: Infinity, resetAt: 0 };

  const key = `rl:${rule.key}:${entityId}`;
  
  // Check if entity is blocked
  const blocked = await cacheGet<string>(`rl:blocked:${key}`);
  if (blocked) {
    return { allowed: false, remaining: 0, resetAt: parseInt(blocked) };
  }

  const count = await incrementRateLimit(key, rule.windowSeconds);
  const allowed = count <= rule.maxRequests;
  const remaining = Math.max(0, rule.maxRequests - count);

  if (!allowed) {
    logger.warn(`[RateLimit] Limit exceeded: ${operation} for entity ${entityId} (${count}/${rule.maxRequests})`);
    await publishAuditEvent("rate_limit.exceeded", { operation, entityId, count, limit: rule.maxRequests });
  }

  return { allowed, remaining, resetAt: Date.now() + rule.windowSeconds * 1000 };
}

// ─── Velocity Check ───────────────────────────────────────────────────────────

export async function checkVelocity(
  metric: string,
  entityId: string,
  value: number = 1,
): Promise<{ ok: boolean; action?: string; current: number; threshold: number }> {
  const check = VELOCITY_CHECKS.find(v => v.metric === metric);
  if (!check) return { ok: true, current: 0, threshold: Infinity };

  const key = `velocity:${metric}:${entityId}`;
  const count = await incrementRateLimit(key, check.windowSeconds);
  const current = count * value;

  if (current > check.threshold) {
    logger.warn(`[Velocity] Threshold breached: ${metric} for ${entityId} — ${current}/${check.threshold}`);
    await publishAuditEvent("velocity.breach", {
      metric,
      entityId,
      current,
      threshold: check.threshold,
      action: check.action,
    });
    return { ok: false, action: check.action, current, threshold: check.threshold };
  }

  return { ok: true, current, threshold: check.threshold };
}

// ─── Express Middleware ───────────────────────────────────────────────────────

export function entityRateLimitMiddleware(operation: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as any).user?.id || req.ip || "anonymous";
    const result = await checkRateLimit(operation, userId);

    res.setHeader("X-RateLimit-Limit", RATE_LIMIT_RULES[operation]?.maxRequests || 0);
    res.setHeader("X-RateLimit-Remaining", result.remaining);
    res.setHeader("X-RateLimit-Reset", result.resetAt);

    if (!result.allowed) {
      res.status(429).json({
        error: "Rate limit exceeded",
        retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000),
      });
      return;
    }
    next();
  };
}

logger.info("[RateLimit] Per-entity rate limiter loaded");
