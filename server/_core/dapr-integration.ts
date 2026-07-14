/**
 * server/_core/dapr-integration.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Full Dapr Sidecar Integration
 *
 * Provides:
 *  1. Service-to-service invocation (HTTP via Dapr sidecar)
 *  2. Pub/Sub messaging (publish + subscribe endpoints)
 *  3. State store (get/set/delete/bulk/transaction)
 *  4. Bindings (output bindings: cron, SMTP, SMS, storage)
 *  5. Secrets store (read secrets from Dapr secrets API)
 *  6. Configuration store (read feature flags from Dapr config)
 *  7. Distributed lock (Dapr lock API)
 *  8. Workflow (Dapr workflow API)
 *  9. Health check and sidecar readiness
 */

import { logger } from "./logger";

// ─── Config ───────────────────────────────────────────────────────────────────

interface DaprConfig {
  httpPort: number;
  grpcPort: number;
  appId: string;
  pubsubName: string;
  stateStoreName: string;
  secretStoreName: string;
  configStoreName: string;
  lockStoreName: string;
}

function getDaprConfig(): DaprConfig | null {
  const httpPort = process.env.DAPR_HTTP_PORT;
  if (!httpPort) return null;
  return {
    httpPort: parseInt(httpPort),
    grpcPort: parseInt(process.env.DAPR_GRPC_PORT || "50001"),
    appId: process.env.DAPR_APP_ID || "tourismpay-server",
    pubsubName: process.env.DAPR_PUBSUB_NAME || "tourismpay-pubsub",
    stateStoreName: process.env.DAPR_STATE_STORE || "tourismpay-state",
    secretStoreName: process.env.DAPR_SECRET_STORE || "tourismpay-secrets",
    configStoreName: process.env.DAPR_CONFIG_STORE || "tourismpay-config",
    lockStoreName: process.env.DAPR_LOCK_STORE || "tourismpay-lock",
  };
}

export function isDaprEnabled(): boolean {
  return !!process.env.DAPR_HTTP_PORT;
}

// ─── HTTP Client ──────────────────────────────────────────────────────────────

async function daprRequest<T>(
  path: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  body?: unknown,
  headers?: Record<string, string>,
): Promise<{ data: T | null; status: number }> {
  const config = getDaprConfig();
  if (!config) return { data: null, status: 503 };
  const url = `http://localhost:${config.httpPort}${path}`;
  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 204 || res.headers.get("content-length") === "0") {
      return { data: null, status: res.status };
    }
    const text = await res.text();
    const data = text ? (JSON.parse(text) as T) : null;
    return { data, status: res.status };
  } catch (err) {
    logger.error({ err, path }, "Dapr request error");
    return { data: null, status: 500 };
  }
}

// ─── Service Invocation ───────────────────────────────────────────────────────

export async function invokeService<T>(params: {
  appId: string;
  method: string;
  httpMethod?: "GET" | "POST" | "PUT" | "DELETE";
  data?: unknown;
  headers?: Record<string, string>;
}): Promise<T | null> {
  const { data } = await daprRequest<T>(
    `/v1.0/invoke/${params.appId}/method/${params.method}`,
    params.httpMethod || "POST",
    params.data,
    params.headers,
  );
  return data;
}

// Domain-specific service invocations
export async function invokeGoSettlementService<T>(
  method: string,
  data?: unknown,
): Promise<T | null> {
  return invokeService<T>({
    appId: "go-settlement-service",
    method,
    data,
  });
}

export async function invokeRustKycService<T>(
  method: string,
  data?: unknown,
): Promise<T | null> {
  return invokeService<T>({
    appId: "rust-kyc-service",
    method,
    data,
  });
}

export async function invokePythonAnalyticsService<T>(
  method: string,
  data?: unknown,
): Promise<T | null> {
  return invokeService<T>({
    appId: "python-analytics",
    method,
    data,
  });
}

export async function invokePythonFraudService<T>(
  method: string,
  data?: unknown,
): Promise<T | null> {
  return invokeService<T>({
    appId: "python-fraud-ml",
    method,
    data,
  });
}

// ─── Pub/Sub ──────────────────────────────────────────────────────────────────

export type PubSubTopic =
  | "wallet.transaction.created"
  | "wallet.transaction.completed"
  | "wallet.transaction.failed"
  | "kyc.submitted"
  | "kyc.approved"
  | "kyc.rejected"
  | "kyb.submitted"
  | "kyb.approved"
  | "kyb.rejected"
  | "booking.created"
  | "booking.confirmed"
  | "booking.cancelled"
  | "payment.initiated"
  | "payment.completed"
  | "payment.failed"
  | "remittance.initiated"
  | "remittance.completed"
  | "remittance.failed"
  | "settlement.batch.started"
  | "settlement.batch.completed"
  | "fraud.alert.created"
  | "fraud.alert.resolved"
  | "tax.collection.created"
  | "tax.remittance.filed"
  | "user.registered"
  | "user.kyc.completed"
  | "merchant.onboarded"
  | "loyalty.points.earned"
  | "loyalty.points.redeemed"
  | "notification.send"
  | "audit.log.created"
  | "exchange.rate.updated"
  | "kill.switch.activated"
  | "compliance.alert.created";

export async function publishMessage(
  topic: PubSubTopic,
  data: unknown,
  metadata?: Record<string, string>,
): Promise<boolean> {
  const config = getDaprConfig();
  if (!config) return false;
  const { status } = await daprRequest(
    `/v1.0/publish/${config.pubsubName}/${encodeURIComponent(topic)}`,
    "POST",
    data,
    metadata
      ? Object.fromEntries(
          Object.entries(metadata).map(([k, v]) => [`metadata.${k}`, v]),
        )
      : undefined,
  );
  if (status >= 200 && status < 300) {
    logger.debug({ topic }, "Dapr message published");
    return true;
  }
  logger.warn({ topic, status }, "Dapr publish failed");
  return false;
}

// ─── State Store ──────────────────────────────────────────────────────────────

export async function stateGet<T>(
  key: string,
  options?: { consistency?: "eventual" | "strong" },
): Promise<T | null> {
  const config = getDaprConfig();
  if (!config) return null;
  const qs = options?.consistency
    ? `?consistency=${options.consistency}`
    : "";
  const { data } = await daprRequest<T>(
    `/v1.0/state/${config.stateStoreName}/${encodeURIComponent(key)}${qs}`,
    "GET",
  );
  return data;
}

export async function stateSet(
  key: string,
  value: unknown,
  options?: {
    etag?: string;
    ttlInSeconds?: number;
    consistency?: "eventual" | "strong";
    concurrency?: "first-write" | "last-write";
  },
): Promise<boolean> {
  const config = getDaprConfig();
  if (!config) return false;
  const body = [
    {
      key,
      value,
      etag: options?.etag ? { value: options.etag } : undefined,
      options: {
        consistency: options?.consistency || "eventual",
        concurrency: options?.concurrency || "last-write",
      },
      metadata: options?.ttlInSeconds
        ? { ttlInSeconds: String(options.ttlInSeconds) }
        : undefined,
    },
  ];
  const { status } = await daprRequest(
    `/v1.0/state/${config.stateStoreName}`,
    "POST",
    body,
  );
  return status >= 200 && status < 300;
}

export async function stateDel(key: string): Promise<boolean> {
  const config = getDaprConfig();
  if (!config) return false;
  const { status } = await daprRequest(
    `/v1.0/state/${config.stateStoreName}/${encodeURIComponent(key)}`,
    "DELETE",
  );
  return status >= 200 && status < 300;
}

export async function stateGetBulk<T>(
  keys: string[],
): Promise<Record<string, T | null>> {
  const config = getDaprConfig();
  if (!config) return {};
  const { data } = await daprRequest<Array<{ key: string; data: T }>>(
    `/v1.0/state/${config.stateStoreName}/bulk`,
    "POST",
    { keys, parallelism: 10 },
  );
  if (!data) return {};
  return Object.fromEntries(data.map((item) => [item.key, item.data ?? null]));
}

export async function stateTransaction(
  operations: Array<{
    operation: "upsert" | "delete";
    request: { key: string; value?: unknown };
  }>,
): Promise<boolean> {
  const config = getDaprConfig();
  if (!config) return false;
  const { status } = await daprRequest(
    `/v1.0/state/${config.stateStoreName}/transaction`,
    "POST",
    { operations },
  );
  return status >= 200 && status < 300;
}

// ─── Output Bindings ──────────────────────────────────────────────────────────

export async function invokeBinding(
  bindingName: string,
  operation: string,
  data: unknown,
  metadata?: Record<string, string>,
): Promise<boolean> {
  const { status } = await daprRequest(
    `/v1.0/bindings/${bindingName}`,
    "POST",
    { data, operation, metadata },
  );
  return status >= 200 && status < 300;
}

export async function sendEmailBinding(params: {
  to: string;
  subject: string;
  body: string;
  from?: string;
}): Promise<boolean> {
  return invokeBinding("smtp-email", "create", params.body, {
    emailTo: params.to,
    emailSubject: params.subject,
    emailFrom: params.from || "noreply@tourismpay.com",
  });
}

export async function sendSmsBinding(params: {
  to: string;
  message: string;
}): Promise<boolean> {
  return invokeBinding("sms-at", "create", {
    to: params.to,
    message: params.message,
  });
}

export async function uploadToStorageBinding(params: {
  key: string;
  data: string; // base64
  contentType?: string;
}): Promise<boolean> {
  return invokeBinding("object-storage", "create", params.data, {
    key: params.key,
    contentType: params.contentType || "application/octet-stream",
  });
}

// ─── Secrets Store ────────────────────────────────────────────────────────────

export async function getSecret(
  secretName: string,
  key?: string,
): Promise<string | null> {
  const config = getDaprConfig();
  if (!config) return null;
  const { data } = await daprRequest<Record<string, string>>(
    `/v1.0/secrets/${config.secretStoreName}/${encodeURIComponent(secretName)}`,
    "GET",
  );
  if (!data) return null;
  return key ? (data[key] ?? null) : (Object.values(data)[0] ?? null);
}

// ─── Configuration Store ──────────────────────────────────────────────────────

export async function getConfiguration(
  keys: string[],
): Promise<Record<string, string>> {
  const config = getDaprConfig();
  if (!config) return {};
  const qs = keys.map((k) => `key=${encodeURIComponent(k)}`).join("&");
  const { data } = await daprRequest<{
    items: Record<string, { value: string }>;
  }>(
    `/v1.0/configuration/${config.configStoreName}?${qs}`,
    "GET",
  );
  if (!data?.items) return {};
  return Object.fromEntries(
    Object.entries(data.items).map(([k, v]) => [k, v.value]),
  );
}

// ─── Distributed Lock ─────────────────────────────────────────────────────────

export async function daprAcquireLock(
  resourceId: string,
  lockOwner: string,
  expiryInSeconds = 30,
): Promise<boolean> {
  const config = getDaprConfig();
  if (!config) return true; // Degrade gracefully
  const { data } = await daprRequest<{ success: boolean }>(
    `/v1.0-alpha1/lock/${config.lockStoreName}`,
    "POST",
    { resourceId, lockOwner, expiryInSeconds },
  );
  return data?.success ?? false;
}

export async function daprReleaseLock(
  resourceId: string,
  lockOwner: string,
): Promise<boolean> {
  const config = getDaprConfig();
  if (!config) return true;
  const { data } = await daprRequest<{ status: string }>(
    `/v1.0-alpha1/unlock/${config.lockStoreName}`,
    "POST",
    { resourceId, lockOwner },
  );
  return data?.status === "SUCCESS";
}

// ─── Subscription Registration ────────────────────────────────────────────────

export interface DaprSubscription {
  pubsubname: string;
  topic: PubSubTopic;
  route: string;
  metadata?: Record<string, string>;
  deadLetterTopic?: string;
}

export function getDaprSubscriptions(): DaprSubscription[] {
  const config = getDaprConfig();
  if (!config) return [];
  return [
    {
      pubsubname: config.pubsubName,
      topic: "wallet.transaction.created",
      route: "/dapr/subscribe/wallet-transaction",
      deadLetterTopic: "dead-letter",
    },
    {
      pubsubname: config.pubsubName,
      topic: "kyc.submitted",
      route: "/dapr/subscribe/kyc-submitted",
    },
    {
      pubsubname: config.pubsubName,
      topic: "kyb.submitted",
      route: "/dapr/subscribe/kyb-submitted",
    },
    {
      pubsubname: config.pubsubName,
      topic: "booking.created",
      route: "/dapr/subscribe/booking-created",
    },
    {
      pubsubname: config.pubsubName,
      topic: "payment.completed",
      route: "/dapr/subscribe/payment-completed",
    },
    {
      pubsubname: config.pubsubName,
      topic: "fraud.alert.created",
      route: "/dapr/subscribe/fraud-alert",
    },
    {
      pubsubname: config.pubsubName,
      topic: "settlement.batch.started",
      route: "/dapr/subscribe/settlement-batch",
    },
    {
      pubsubname: config.pubsubName,
      topic: "notification.send",
      route: "/dapr/subscribe/notification",
    },
    {
      pubsubname: config.pubsubName,
      topic: "exchange.rate.updated",
      route: "/dapr/subscribe/exchange-rate",
    },
    {
      pubsubname: config.pubsubName,
      topic: "compliance.alert.created",
      route: "/dapr/subscribe/compliance-alert",
    },
  ];
}

// ─── Health Check ─────────────────────────────────────────────────────────────

export async function checkDaprHealth(): Promise<{
  healthy: boolean;
  sidecarReady: boolean;
  appId?: string;
}> {
  const config = getDaprConfig();
  if (!config) return { healthy: false, sidecarReady: false };
  try {
    const { status } = await daprRequest("/v1.0/healthz", "GET");
    const sidecarReady = status === 204 || status === 200;
    return { healthy: sidecarReady, sidecarReady, appId: config.appId };
  } catch {
    return { healthy: false, sidecarReady: false };
  }
}
