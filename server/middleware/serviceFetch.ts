/**
 * Service Fetch — production-grade HTTP client for inter-service communication.
 *
 * Features:
 * - Circuit breaker protection
 * - Exponential backoff retries (configurable)
 * - Request ID propagation
 * - JWT token forwarding
 * - Timeout enforcement
 * - Structured logging
 */
import type { Request } from "express";
import { withCircuitBreaker } from "./circuitBreaker";
import { logger } from "../_core/logger";

interface ServiceFetchOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  retryBackoffMultiplier?: number;
  retryOn?: number[];
}

const DEFAULT_RETRY_ON = [502, 503, 504, 408, 429];

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch a downstream service with:
 * - Circuit breaker protection
 * - Exponential backoff retries
 * - X-Request-Id propagation
 * - JWT token forwarding
 * - Configurable timeout (default 5s)
 */
export async function serviceFetch<T = unknown>(
  serviceName: string,
  url: string,
  options: ServiceFetchOptions = {},
  req?: Request
): Promise<{ data: T; status: number; ok: boolean } | { data: null; status: number; ok: boolean }> {
  const {
    timeoutMs = 5000,
    retries = 2,
    retryDelayMs = 500,
    retryBackoffMultiplier = 2,
    retryOn = DEFAULT_RETRY_ON,
    ...fetchOptions
  } = options;

  const headers = new Headers(fetchOptions.headers);

  const requestId = req ? (req as unknown as Record<string, unknown>).requestId as string : undefined;
  if (requestId) {
    headers.set("X-Request-Id", requestId);
  }

  // Forward JWT for authenticated inter-service calls
  const authHeader = req?.headers?.authorization;
  if (authHeader && !headers.has("Authorization")) {
    headers.set("Authorization", authHeader);
  }

  // Forward internal service key
  const serviceKey = process.env.INTERNAL_SERVICE_KEY;
  if (serviceKey) {
    headers.set("X-Service-Key", serviceKey);
  }

  if (!headers.has("Content-Type") && fetchOptions.body) {
    headers.set("Content-Type", "application/json");
  }

  return withCircuitBreaker(
    serviceName,
    async () => {
      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= retries; attempt++) {
        if (attempt > 0) {
          const delay = retryDelayMs * Math.pow(retryBackoffMultiplier, attempt - 1);
          const jitter = delay * 0.2 * Math.random();
          logger.debug(`Retrying ${serviceName}`, { attempt, delay: delay + jitter, url });
          await sleep(delay + jitter);
        }

        try {
          const start = Date.now();
          const response = await fetch(url, {
            ...fetchOptions,
            headers,
            signal: AbortSignal.timeout(timeoutMs),
          });
          const latencyMs = Date.now() - start;

          if (!response.ok && retryOn.includes(response.status) && attempt < retries) {
            logger.warn(`${serviceName} returned ${response.status}, retrying`, { attempt, latencyMs });
            continue;
          }

          const data = response.headers.get("content-type")?.includes("application/json")
            ? await response.json() as T
            : await response.text() as unknown as T;

          if (!response.ok) {
            throw new ServiceError(serviceName, response.status, String(data));
          }

          if (attempt > 0) {
            logger.info(`${serviceName} succeeded after ${attempt + 1} attempts`, { latencyMs });
          }

          return { data, status: response.status, ok: response.ok };
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          if (err instanceof ServiceError) throw err;
          if (attempt === retries) break;
        }
      }

      throw lastError ?? new Error(`${serviceName} request failed`);
    },
    () => ({ data: null as unknown as T, status: 503, ok: false as boolean })
  );
}

export class ServiceError extends Error {
  constructor(
    public serviceName: string,
    public statusCode: number,
    public responseBody: string
  ) {
    super(`Service ${serviceName} returned ${statusCode}`);
    this.name = "ServiceError";
  }
}
