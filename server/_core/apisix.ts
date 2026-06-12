/**
 * APISIX API Gateway Runtime Client
 *
 * Manages route registration, JWT validation, and service discovery
 * via the APISIX Admin API. Syncs application routes to the gateway.
 *
 * Falls back to direct Express routing when APISIX is not configured.
 */
import { logger } from "./logger";

// ─── Configuration ───────────────────────────────────────────────────────────

interface ApisixConfig {
  adminUrl: string;
  apiKey: string;
}

function getApisixConfig(): ApisixConfig | null {
  const adminUrl = process.env.APISIX_ADMIN_URL;
  if (!adminUrl) return null;
  return {
    adminUrl: adminUrl.replace(/\/+$/, ""),
    apiKey: process.env.APISIX_ADMIN_KEY || "",
  };
}

// ─── Admin API Client ────────────────────────────────────────────────────────

async function apisixRequest(method: string, path: string, body?: unknown): Promise<Record<string, unknown> | null> {
  const config = getApisixConfig();
  if (!config) return null;
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-API-KEY": config.apiKey,
    };
    const res = await fetch(`${config.adminUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      logger.warn(`[APISIX] ${method} ${path} failed: ${res.status}`);
      return null;
    }
    return (await res.json()) as Record<string, unknown>;
  } catch (err) {
    logger.warn(`[APISIX] ${method} ${path} error: ${(err as Error).message}`);
    return null;
  }
}

// ─── Route Registration ──────────────────────────────────────────────────────

interface RouteConfig {
  id: string;
  uri: string;
  methods: string[];
  upstream: {
    type: "roundrobin" | "least_conn";
    nodes: Record<string, number>;
    checks?: {
      active?: { http_path: string; healthy: { interval: number }; unhealthy: { interval: number } };
    };
  };
  plugins?: Record<string, unknown>;
}

const TOURISMPAY_ROUTES: RouteConfig[] = [
  {
    id: "tourismpay-pwa",
    uri: "/api/*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    upstream: {
      type: "roundrobin",
      nodes: { [`${process.env.PWA_HOST || "127.0.0.1"}:${process.env.PORT || 3000}`]: 1 },
      checks: {
        active: { http_path: "/health", healthy: { interval: 5 }, unhealthy: { interval: 3 } },
      },
    },
    plugins: {
      "jwt-auth": { _meta: { disable: false } },
      "limit-count": {
        count: 1000,
        time_window: 60,
        rejected_code: 429,
        key: "remote_addr",
      },
      "cors": {
        allow_origins: process.env.CORS_ORIGIN || "https://tourismpay.com",
        allow_methods: "GET,POST,PUT,PATCH,DELETE,OPTIONS",
        allow_headers: "Content-Type,Authorization,X-API-Key,X-Request-ID,X-CSRF-Token",
        allow_credential: true,
      },
    },
  },
  {
    id: "tourismpay-settlement",
    uri: "/settlement/*",
    methods: ["GET", "POST", "PUT"],
    upstream: {
      type: "roundrobin",
      nodes: { [`${process.env.SETTLEMENT_HOST || "127.0.0.1"}:8080`]: 1 },
      checks: {
        active: { http_path: "/health", healthy: { interval: 5 }, unhealthy: { interval: 3 } },
      },
    },
    plugins: {
      "jwt-auth": { _meta: { disable: false } },
      "limit-count": { count: 500, time_window: 60, rejected_code: 429, key: "remote_addr" },
    },
  },
  {
    id: "tourismpay-kyc",
    uri: "/kyc/*",
    methods: ["GET", "POST", "PUT"],
    upstream: {
      type: "roundrobin",
      nodes: { [`${process.env.KYC_HOST || "127.0.0.1"}:8081`]: 1 },
      checks: {
        active: { http_path: "/health", healthy: { interval: 5 }, unhealthy: { interval: 3 } },
      },
    },
    plugins: {
      "jwt-auth": { _meta: { disable: false } },
      "limit-count": { count: 200, time_window: 60, rejected_code: 429, key: "remote_addr" },
    },
  },
  {
    id: "tourismpay-python-ml",
    uri: "/ml/*",
    methods: ["GET", "POST"],
    upstream: {
      type: "roundrobin",
      nodes: { [`${process.env.ML_HOST || "127.0.0.1"}:8000`]: 1 },
    },
    plugins: {
      "jwt-auth": { _meta: { disable: false } },
      "limit-count": { count: 300, time_window: 60, rejected_code: 429, key: "remote_addr" },
    },
  },
];

export async function syncRoutes(): Promise<number> {
  const config = getApisixConfig();
  if (!config) {
    logger.info("[APISIX] Not configured — using direct Express routing");
    return 0;
  }

  let synced = 0;
  for (const route of TOURISMPAY_ROUTES) {
    const result = await apisixRequest("PUT", `/apisix/admin/routes/${route.id}`, {
      uri: route.uri,
      methods: route.methods,
      upstream: route.upstream,
      plugins: route.plugins,
    });
    if (result) synced++;
  }
  logger.info(`[APISIX] Synced ${synced}/${TOURISMPAY_ROUTES.length} routes`);
  return synced;
}

// ─── Upstream Management ─────────────────────────────────────────────────────

export async function updateUpstreamNodes(
  routeId: string,
  nodes: Record<string, number>,
): Promise<boolean> {
  const result = await apisixRequest("PATCH", `/apisix/admin/routes/${routeId}`, {
    upstream: { nodes },
  });
  return result !== null;
}

// ─── Health Check ────────────────────────────────────────────────────────────

export async function getGatewayHealth(): Promise<Record<string, unknown> | null> {
  return apisixRequest("GET", "/apisix/admin/routes");
}

// ─── SSL Certificate Management ──────────────────────────────────────────────

export async function registerSSLCertificate(
  id: string,
  cert: string,
  key: string,
  snis: string[],
): Promise<boolean> {
  const result = await apisixRequest("PUT", `/apisix/admin/ssls/${id}`, {
    cert,
    key,
    snis,
  });
  return result !== null;
}

export function isApisixEnabled(): boolean {
  return !!process.env.APISIX_ADMIN_URL;
}
