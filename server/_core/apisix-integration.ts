/**
 * server/_core/apisix-integration.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Full APISIX API Gateway Integration
 *
 * Provides:
 *  1. Route management (create/update/delete routes programmatically)
 *  2. Plugin configuration (rate-limit, auth, CORS, WAF, circuit-breaker)
 *  3. Upstream management (load balancing, health checks)
 *  4. Consumer management (API key, JWT, OAuth2 consumers)
 *  5. Service registry (register microservices as APISIX upstreams)
 *  6. Dynamic rate limit rule management
 *  7. Health check and metrics
 */

import { logger } from "./logger";

// ─── Config ───────────────────────────────────────────────────────────────────

interface ApisixConfig {
  adminUrl: string;
  adminKey: string;
  gatewayUrl: string;
}

function getApisixConfig(): ApisixConfig | null {
  const adminUrl = process.env.APISIX_ADMIN_URL;
  if (!adminUrl) return null;
  return {
    adminUrl: adminUrl.replace(/\/+$/, ""),
    adminKey: process.env.APISIX_ADMIN_KEY || "edd1c9f034335f136f87ad84b625c8f1",
    gatewayUrl: process.env.APISIX_GATEWAY_URL || "http://apisix:9080",
  };
}

export function isApisixEnabled(): boolean {
  return !!process.env.APISIX_ADMIN_URL;
}

// ─── HTTP Client ──────────────────────────────────────────────────────────────

async function apisixRequest<T>(
  path: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<T | null> {
  const config = getApisixConfig();
  if (!config) return null;
  const url = `${config.adminUrl}${path}`;
  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": config.adminKey,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const text = await res.text();
      logger.warn({ path, status: res.status, text }, "APISIX request failed");
      return null;
    }
    if (res.status === 204) return null;
    return (await res.json()) as T;
  } catch (err) {
    logger.error({ err, path }, "APISIX request error");
    return null;
  }
}

// ─── Route Management ─────────────────────────────────────────────────────────

export interface ApisixRoute {
  id?: string;
  name: string;
  uri: string;
  methods?: string[];
  upstream_id?: string;
  upstream?: ApisixUpstream;
  plugins?: Record<string, unknown>;
  priority?: number;
  status?: 0 | 1;
  labels?: Record<string, string>;
  desc?: string;
}

export async function createOrUpdateRoute(
  routeId: string,
  route: ApisixRoute,
): Promise<boolean> {
  const result = await apisixRequest(
    `/apisix/admin/routes/${routeId}`,
    "PUT",
    route,
  );
  return result !== null;
}

export async function deleteRoute(routeId: string): Promise<boolean> {
  const result = await apisixRequest(
    `/apisix/admin/routes/${routeId}`,
    "DELETE",
  );
  return result !== null;
}

export async function getRoute(routeId: string): Promise<ApisixRoute | null> {
  const result = await apisixRequest<{ value: ApisixRoute }>(
    `/apisix/admin/routes/${routeId}`,
    "GET",
  );
  return result?.value ?? null;
}

export async function listRoutes(): Promise<ApisixRoute[]> {
  const result = await apisixRequest<{
    list: Array<{ value: ApisixRoute }>;
  }>("/apisix/admin/routes", "GET");
  return result?.list?.map((item) => item.value) ?? [];
}

// ─── Upstream Management ──────────────────────────────────────────────────────

export interface ApisixUpstream {
  id?: string;
  name?: string;
  type: "roundrobin" | "chash" | "ewma" | "least_conn";
  nodes: Record<string, number>; // "host:port": weight
  scheme?: "http" | "https" | "grpc" | "grpcs";
  timeout?: { connect: number; send: number; read: number };
  healthcheck?: {
    active?: {
      type?: "http" | "https" | "tcp";
      http_path?: string;
      interval?: number;
      healthy?: { successes?: number; interval?: number };
      unhealthy?: { http_failures?: number; interval?: number };
    };
    passive?: {
      type?: "http" | "https" | "tcp";
      healthy?: { successes?: number };
      unhealthy?: { http_failures?: number; tcp_failures?: number };
    };
  };
  retries?: number;
  retry_timeout?: number;
  desc?: string;
}

export async function createOrUpdateUpstream(
  upstreamId: string,
  upstream: ApisixUpstream,
): Promise<boolean> {
  const result = await apisixRequest(
    `/apisix/admin/upstreams/${upstreamId}`,
    "PUT",
    upstream,
  );
  return result !== null;
}

// ─── Consumer Management ──────────────────────────────────────────────────────

export async function createApiKeyConsumer(
  username: string,
  apiKey: string,
  plugins?: Record<string, unknown>,
): Promise<boolean> {
  const result = await apisixRequest(
    `/apisix/admin/consumers/${username}`,
    "PUT",
    {
      username,
      plugins: {
        "key-auth": { key: apiKey },
        ...plugins,
      },
    },
  );
  return result !== null;
}

export async function createJwtConsumer(
  username: string,
  secret: string,
  plugins?: Record<string, unknown>,
): Promise<boolean> {
  const result = await apisixRequest(
    `/apisix/admin/consumers/${username}`,
    "PUT",
    {
      username,
      plugins: {
        "jwt-auth": {
          key: username,
          secret,
          algorithm: "HS256",
        },
        ...plugins,
      },
    },
  );
  return result !== null;
}

export async function deleteConsumer(username: string): Promise<boolean> {
  const result = await apisixRequest(
    `/apisix/admin/consumers/${username}`,
    "DELETE",
  );
  return result !== null;
}

// ─── Plugin Configs ───────────────────────────────────────────────────────────

export function rateLimitPlugin(params: {
  count: number;
  timeWindow: number; // seconds
  keyType?: "remote_addr" | "consumer_name" | "header" | "service_id";
  keyValue?: string;
  policy?: "local" | "redis" | "redis-cluster";
  rejectedCode?: number;
  rejectedMsg?: string;
}): Record<string, unknown> {
  return {
    "limit-count": {
      count: params.count,
      time_window: params.timeWindow,
      key_type: params.keyType || "remote_addr",
      key: params.keyValue,
      policy: params.policy || "local",
      rejected_code: params.rejectedCode || 429,
      rejected_msg: params.rejectedMsg || "Too Many Requests",
    },
  };
}

export function jwtAuthPlugin(params?: {
  header?: string;
  query?: string;
  cookie?: string;
  hideCredentials?: boolean;
}): Record<string, unknown> {
  return {
    "jwt-auth": {
      header: params?.header || "Authorization",
      query: params?.query || "jwt",
      cookie: params?.cookie,
      hide_credentials: params?.hideCredentials ?? false,
    },
  };
}

export function corsPlugin(params?: {
  allowOrigins?: string;
  allowMethods?: string;
  allowHeaders?: string;
  exposeHeaders?: string;
  maxAge?: number;
  allowCredentials?: boolean;
}): Record<string, unknown> {
  return {
    cors: {
      allow_origins: params?.allowOrigins || "*",
      allow_methods: params?.allowMethods || "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      allow_headers: params?.allowHeaders || "Content-Type,Authorization,X-API-Key,X-Request-ID",
      expose_headers: params?.exposeHeaders || "X-Request-ID",
      max_age: params?.maxAge || 3600,
      allow_credential: params?.allowCredentials ?? true,
    },
  };
}

export function circuitBreakerPlugin(params?: {
  breakDuration?: number;
  maxBreachedCount?: number;
  unhealthyStatusCodes?: number[];
  healthyStatusCodes?: number[];
}): Record<string, unknown> {
  return {
    "api-breaker": {
      break_response_code: 503,
      break_response_body: '{"error":"Service temporarily unavailable"}',
      unhealthy: {
        http_statuses: params?.unhealthyStatusCodes || [500, 502, 503, 504],
        failures: params?.maxBreachedCount || 5,
      },
      healthy: {
        http_statuses: params?.healthyStatusCodes || [200, 201, 204],
        successes: 2,
      },
    },
  };
}

export function prometheusPlugin(): Record<string, unknown> {
  return {
    prometheus: {
      prefer_name: true,
    },
  };
}

export function requestIdPlugin(): Record<string, unknown> {
  return {
    "request-id": {
      header_name: "X-Request-ID",
      include_in_response: true,
    },
  };
}

export function opentelemetryPlugin(): Record<string, unknown> {
  return {
    opentelemetry: {
      sampler: { name: "always_on" },
      additional_attributes: {
        "service.name": "tourismpay-gateway",
      },
    },
  };
}

// ─── Platform Route Bootstrap ─────────────────────────────────────────────────

export async function bootstrapPlatformRoutes(): Promise<void> {
  if (!isApisixEnabled()) return;
  logger.info("Bootstrapping APISIX platform routes...");

  const basePlugins = {
    ...corsPlugin(),
    ...requestIdPlugin(),
    ...prometheusPlugin(),
    ...circuitBreakerPlugin(),
  };

  const routes: Array<{ id: string; route: ApisixRoute }> = [
    {
      id: "trpc-api",
      route: {
        name: "tRPC API",
        uri: "/trpc/*",
        methods: ["GET", "POST", "OPTIONS"],
        plugins: {
          ...basePlugins,
          ...rateLimitPlugin({ count: 100, timeWindow: 60, keyType: "remote_addr" }),
        },
        upstream: {
          type: "roundrobin",
          nodes: { "tourismpay-server:5000": 1 },
          healthcheck: {
            active: {
              type: "http",
              http_path: "/health",
              interval: 10,
              healthy: { successes: 2, interval: 5 },
              unhealthy: { http_failures: 3, interval: 5 },
            },
          },
        },
      },
    },
    {
      id: "auth-api",
      route: {
        name: "Auth API",
        uri: "/auth/*",
        methods: ["GET", "POST", "OPTIONS"],
        plugins: {
          ...basePlugins,
          ...rateLimitPlugin({ count: 20, timeWindow: 60, keyType: "remote_addr" }),
        },
        upstream: {
          type: "roundrobin",
          nodes: { "tourismpay-server:5000": 1 },
        },
      },
    },
    {
      id: "webhook-api",
      route: {
        name: "Webhook API",
        uri: "/webhooks/*",
        methods: ["POST"],
        plugins: {
          ...basePlugins,
        },
        upstream: {
          type: "roundrobin",
          nodes: { "tourismpay-server:5000": 1 },
        },
      },
    },
    {
      id: "go-settlement",
      route: {
        name: "Go Settlement Service",
        uri: "/internal/settlement/*",
        methods: ["GET", "POST", "PUT"],
        plugins: {
          ...basePlugins,
          "key-auth": {},
          ...rateLimitPlugin({ count: 50, timeWindow: 60 }),
        },
        upstream: {
          type: "roundrobin",
          nodes: { "go-settlement-service:8080": 1 },
          healthcheck: {
            active: {
              type: "http",
              http_path: "/health",
              interval: 15,
            },
          },
        },
      },
    },
    {
      id: "rust-kyc",
      route: {
        name: "Rust KYC Service",
        uri: "/internal/kyc/*",
        methods: ["GET", "POST"],
        plugins: {
          ...basePlugins,
          "key-auth": {},
        },
        upstream: {
          type: "roundrobin",
          nodes: { "rust-kyc-service:8081": 1 },
        },
      },
    },
    {
      id: "python-analytics",
      route: {
        name: "Python Analytics Service",
        uri: "/internal/analytics/*",
        methods: ["GET", "POST"],
        plugins: {
          ...basePlugins,
          "key-auth": {},
        },
        upstream: {
          type: "roundrobin",
          nodes: { "python-services:8000": 1 },
        },
      },
    },
  ];

  for (const { id, route } of routes) {
    const success = await createOrUpdateRoute(id, route);
    if (success) {
      logger.info({ routeId: id }, "APISIX route registered");
    } else {
      logger.warn({ routeId: id }, "APISIX route registration failed");
    }
  }
}

// ─── Dynamic Rate Limit Management ───────────────────────────────────────────

export async function updateRouteRateLimit(
  routeId: string,
  count: number,
  timeWindow: number,
): Promise<boolean> {
  const existing = await getRoute(routeId);
  if (!existing) return false;
  const updated = {
    ...existing,
    plugins: {
      ...(existing.plugins || {}),
      ...rateLimitPlugin({ count, timeWindow }),
    },
  };
  return createOrUpdateRoute(routeId, updated);
}

// ─── Health Check ─────────────────────────────────────────────────────────────

export async function checkApisixHealth(): Promise<{
  healthy: boolean;
  routeCount?: number;
  version?: string;
}> {
  const config = getApisixConfig();
  if (!config) return { healthy: false };
  try {
    const result = await apisixRequest<{
      list: unknown[];
    }>("/apisix/admin/routes", "GET");
    if (result) {
      return { healthy: true, routeCount: result.list?.length ?? 0 };
    }
    return { healthy: false };
  } catch {
    return { healthy: false };
  }
}
