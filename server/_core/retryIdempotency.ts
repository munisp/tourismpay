/**
 * Retry & Idempotency (1.4)
 * 
 * Exponential backoff on payment mutations and idempotency key tracking
 * to prevent duplicate charges.
 *
 * Middleware integration: Redis (idempotency store), Kafka (retry events).
 */
import { Request, Response, NextFunction } from "express";
import { cacheGet, cacheSet } from "./redis";
import { publishAuditEvent } from "./kafka";
import { logger } from "./logger";

// ─── Types ────────────────────────────────────────────────────────────────────

interface IdempotencyRecord {
  key: string;
  statusCode: number;
  body: string;
  completedAt: string;
}

interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableStatuses: number[];
}

// ─── Default Config ───────────────────────────────────────────────────────────

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
};

// ─── Idempotency Middleware ───────────────────────────────────────────────────

export function idempotencyMiddleware(ttlSeconds: number = 86400) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const idempotencyKey = req.headers["idempotency-key"] as string;
    if (!idempotencyKey) {
      next();
      return;
    }

    // Check if we've already processed this request
    const existing = await cacheGet<string>(`idem:${idempotencyKey}`);
    if (existing) {
      const record: IdempotencyRecord = JSON.parse(existing);
      logger.info(`[Idempotency] Replaying cached response for key: ${idempotencyKey}`);
      res.status(record.statusCode).json(JSON.parse(record.body));
      return;
    }

    // Wrap res.json to capture the response
    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      const record: IdempotencyRecord = {
        key: idempotencyKey,
        statusCode: res.statusCode,
        body: JSON.stringify(body),
        completedAt: new Date().toISOString(),
      };
      cacheSet(`idem:${idempotencyKey}`, JSON.stringify(record), ttlSeconds).catch(() => {});
      return originalJson(body);
    }) as any;

    next();
  };
}

// ─── Retry with Exponential Backoff ───────────────────────────────────────────

export async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  config: Partial<RetryConfig> = {},
): Promise<T> {
  const cfg = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      if (attempt === cfg.maxRetries) break;

      const statusCode = error?.statusCode || error?.status || 500;
      if (!cfg.retryableStatuses.includes(statusCode)) {
        throw error; // Non-retryable error
      }

      // Exponential backoff with jitter
      const baseDelay = cfg.baseDelayMs * Math.pow(2, attempt);
      const jitter = baseDelay * 0.1 * Math.random();
      const delay = Math.min(baseDelay + jitter, cfg.maxDelayMs);

      logger.warn(`[Retry] ${operationName} attempt ${attempt + 1}/${cfg.maxRetries} failed (${statusCode}). Retrying in ${Math.round(delay)}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  await publishAuditEvent("retry.exhausted", {
    operation: operationName,
    maxRetries: cfg.maxRetries,
    error: lastError?.message,
  });

  throw lastError;
}

// ─── Payment-Specific Wrapper ─────────────────────────────────────────────────

export async function withPaymentRetry<T>(
  operation: () => Promise<T>,
  paymentId: string,
): Promise<T> {
  return withRetry(operation, `payment:${paymentId}`, {
    maxRetries: 3,
    baseDelayMs: 2000,
    maxDelayMs: 15000,
    retryableStatuses: [408, 429, 502, 503, 504], // Never retry 500 for payments (avoid double charge)
  });
}

export async function withSettlementRetry<T>(
  operation: () => Promise<T>,
  settlementId: string,
): Promise<T> {
  return withRetry(operation, `settlement:${settlementId}`, {
    maxRetries: 5,
    baseDelayMs: 5000,
    maxDelayMs: 60000,
  });
}

logger.info("[Retry] Idempotency & retry module loaded");
