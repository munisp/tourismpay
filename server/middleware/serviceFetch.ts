/**
 * Service Fetch — wrapper around fetch() that propagates request IDs
 * and integrates with the circuit breaker for downstream service calls.
 *
 * Usage:
 *   const data = await serviceFetch("pbac-engine", url, { method: "POST", ... }, req);
 */
import type { Request } from "express";
import { withCircuitBreaker } from "./circuitBreaker";

interface ServiceFetchOptions extends RequestInit {
  timeoutMs?: number;
}

/**
 * Fetch a downstream service with:
 * - X-Request-Id propagation from the incoming request
 * - Circuit breaker protection
 * - Configurable timeout (default 5s)
 */
export async function serviceFetch<T = unknown>(
  serviceName: string,
  url: string,
  options: ServiceFetchOptions = {},
  req?: Request
): Promise<{ data: T; status: number; ok: boolean } | { data: null; status: number; ok: boolean }> {
  const { timeoutMs = 5000, ...fetchOptions } = options;

  const headers = new Headers(fetchOptions.headers);

  // Propagate request ID from incoming request
  const requestId = req ? (req as any).requestId : undefined;
  if (requestId) {
    headers.set("X-Request-Id", requestId);
  }

  // Set content type if not already set
  if (!headers.has("Content-Type") && fetchOptions.body) {
    headers.set("Content-Type", "application/json");
  }

  return withCircuitBreaker(
    serviceName,
    async () => {
      const response = await fetch(url, {
        ...fetchOptions,
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });

      const data = response.headers.get("content-type")?.includes("application/json")
        ? await response.json() as T
        : await response.text() as unknown as T;

      if (!response.ok) {
        throw new ServiceError(serviceName, response.status, String(data));
      }

      return { data, status: response.status, ok: response.ok };
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
