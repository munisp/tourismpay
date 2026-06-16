/**
 * Dapr Sidecar Runtime Client
 *
 * Service-to-service invocation, state management, pub/sub, and bindings
 * via the Dapr HTTP sidecar API. Enables service mesh communication patterns.
 *
 * Falls back to direct HTTP when Dapr sidecar is not available.
 */
import { logger } from "./logger";

// ─── Configuration ───────────────────────────────────────────────────────────

const DAPR_HTTP_PORT = parseInt(process.env.DAPR_HTTP_PORT || "3500", 10);
const DAPR_BASE_URL = `http://localhost:${DAPR_HTTP_PORT}`;
const APP_ID = process.env.DAPR_APP_ID || "tourismpay-pwa";

let daprAvailable: boolean | null = null;

async function isDaprAvailable(): Promise<boolean> {
  if (daprAvailable !== null) return daprAvailable;
  try {
    const res = await fetch(`${DAPR_BASE_URL}/v1.0/healthz`, {
      signal: AbortSignal.timeout(2000),
    });
    daprAvailable = res.ok;
    if (daprAvailable) logger.info("[Dapr] Sidecar available");
    return daprAvailable;
  } catch {
    daprAvailable = false;
    logger.info("[Dapr] Sidecar not available — using direct HTTP");
    return false;
  }
}

// ─── Service Invocation ──────────────────────────────────────────────────────

export async function invokeService<T = unknown>(
  appId: string,
  method: string,
  data?: unknown,
  httpMethod: "GET" | "POST" | "PUT" | "DELETE" = "POST",
): Promise<T | null> {
  if (!(await isDaprAvailable())) return null;
  try {
    const url = `${DAPR_BASE_URL}/v1.0/invoke/${appId}/method/${method}`;
    const options: RequestInit = {
      method: httpMethod,
      headers: { "Content-Type": "application/json", "dapr-app-id": appId },
      signal: AbortSignal.timeout(10000),
    };
    if (data && httpMethod !== "GET") {
      options.body = JSON.stringify(data);
    }
    const res = await fetch(url, options);
    if (!res.ok) {
      logger.warn(`[Dapr] Invoke ${appId}/${method} failed: ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    logger.warn(`[Dapr] Invoke ${appId}/${method} error: ${(err as Error).message}`);
    return null;
  }
}

// ─── Pub/Sub ─────────────────────────────────────────────────────────────────

const PUBSUB_NAME = process.env.DAPR_PUBSUB_NAME || "tourismpay-pubsub";

export async function publishMessage(
  topic: string,
  data: unknown,
  metadata?: Record<string, string>,
): Promise<boolean> {
  if (!(await isDaprAvailable())) return false;
  try {
    const url = `${DAPR_BASE_URL}/v1.0/publish/${PUBSUB_NAME}/${topic}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(metadata || {}),
      },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch (err) {
    logger.warn(`[Dapr] Publish to ${topic} failed: ${(err as Error).message}`);
    return false;
  }
}

// ─── State Store ─────────────────────────────────────────────────────────────

const STATE_STORE = process.env.DAPR_STATE_STORE || "tourismpay-state";

export async function getState<T = unknown>(key: string): Promise<T | null> {
  if (!(await isDaprAvailable())) return null;
  try {
    const url = `${DAPR_BASE_URL}/v1.0/state/${STATE_STORE}/${key}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok || res.status === 204) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function saveState(key: string, value: unknown, ttlSeconds?: number): Promise<boolean> {
  if (!(await isDaprAvailable())) return false;
  try {
    const url = `${DAPR_BASE_URL}/v1.0/state/${STATE_STORE}`;
    const metadata = ttlSeconds ? { ttlInSeconds: String(ttlSeconds) } : undefined;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ key, value, metadata }]),
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function deleteState(key: string): Promise<boolean> {
  if (!(await isDaprAvailable())) return false;
  try {
    const url = `${DAPR_BASE_URL}/v1.0/state/${STATE_STORE}/${key}`;
    const res = await fetch(url, { method: "DELETE", signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Bindings (Output) ───────────────────────────────────────────────────────

export async function invokeBinding(
  bindingName: string,
  operation: string,
  data?: unknown,
  metadata?: Record<string, string>,
): Promise<boolean> {
  if (!(await isDaprAvailable())) return false;
  try {
    const url = `${DAPR_BASE_URL}/v1.0/bindings/${bindingName}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation, data, metadata }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch (err) {
    logger.warn(`[Dapr] Binding ${bindingName}/${operation} failed: ${(err as Error).message}`);
    return false;
  }
}

// ─── Service Discovery ───────────────────────────────────────────────────────

export const SERVICES = {
  SETTLEMENT: "tourismpay-settlement",
  KYC: "tourismpay-kyc",
  FRAUD_ML: "tourismpay-fraud-ml",
  BIS_AI: "tourismpay-bis-ai",
  EXCHANGE_RATE: "tourismpay-exchange-rate",
  PDF_GENERATOR: "tourismpay-pdf-generator",
} as const;

// Convenience: invoke settlement service via Dapr, fallback to direct HTTP
export async function invokeSettlement<T = unknown>(method: string, data?: unknown): Promise<T | null> {
  const result = await invokeService<T>(SERVICES.SETTLEMENT, method, data);
  if (result !== null) return result;
  // Fallback to direct HTTP if configured
  const directUrl = process.env.SETTLEMENT_SERVICE_URL;
  if (!directUrl) return null;
  try {
    const res = await fetch(`${directUrl}/api/v1/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: data ? JSON.stringify(data) : undefined,
      signal: AbortSignal.timeout(10000),
    });
    return res.ok ? (await res.json()) as T : null;
  } catch {
    return null;
  }
}

export function isDaprEnabled(): boolean {
  return daprAvailable === true;
}
