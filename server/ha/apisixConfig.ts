/**
 * APISIX High-Availability Configuration
 *
 * Defines upstream services, load balancing strategies, health check probes,
 * circuit breaker settings, rate limiting, and plugin configurations for the
 * TourismPay API gateway layer.
 *
 * APISIX sits in front of all services and handles:
 *  - TLS termination
 *  - JWT authentication
 *  - Rate limiting per participant/user
 *  - Circuit breaking for downstream service failures
 *  - Request/response transformation
 *  - Observability (Prometheus metrics, Zipkin tracing)
 */

export interface ApisixUpstreamNode {
  host: string;
  port: number;
  weight: number;
}

export interface ApisixHealthCheck {
  active: {
    type: "http" | "https" | "tcp";
    httpPath?: string;
    intervalMs: number;
    timeoutMs: number;
    healthyThreshold: number;
    unhealthyThreshold: number;
    httpStatusCodes?: number[];
  };
  passive?: {
    type: "http" | "https" | "tcp";
    healthyStatusCodes: number[];
    unhealthyStatusCodes: number[];
    unhealthyTcpFailures: number;
    unhealthyHttpFailures: number;
  };
}

export interface ApisixCircuitBreaker {
  breakDurationSeconds: number;
  maxBreaches: number;
  unhealthyStatusCodes: number[];
}

export interface ApisixUpstream {
  name: string;
  description: string;
  loadBalancingAlgorithm: "roundrobin" | "chash" | "ewma" | "least_conn";
  nodes: ApisixUpstreamNode[];
  healthCheck: ApisixHealthCheck;
  circuitBreaker?: ApisixCircuitBreaker;
  timeoutMs: {
    connect: number;
    send: number;
    read: number;
  };
  retries: number;
  retryTimeoutMs: number;
}

export interface ApisixRateLimitPolicy {
  name: string;
  requestsPerSecond: number;
  requestsPerMinute: number;
  burstMultiplier: number;
  keyType: "consumer" | "service" | "remote_addr";
  rejectionCode: number;
}

export interface ApisixRoute {
  name: string;
  uriPattern: string;
  methods: string[];
  upstreamName: string;
  plugins: string[];
  rateLimitPolicy?: string;
  authRequired: boolean;
  stripPrefix?: string;
}

export interface ApisixHAConfig {
  etcdCluster: string[];       // etcd nodes for APISIX configuration storage
  adminApiPort: number;
  dataPlanePort: number;
  upstreams: ApisixUpstream[];
  rateLimitPolicies: ApisixRateLimitPolicy[];
  routes: ApisixRoute[];
  globalPlugins: string[];
}

export const APISIX_HA_CONFIG: ApisixHAConfig = {
  // etcd cluster for distributed APISIX configuration — 3 nodes for quorum
  etcdCluster: [
    process.env.ETCD_HOST_1 ?? "etcd-1:2379",
    process.env.ETCD_HOST_2 ?? "etcd-2:2379",
    process.env.ETCD_HOST_3 ?? "etcd-3:2379",
  ],
  adminApiPort: 9180,
  dataPlanePort: 9080,

  upstreams: [
    {
      name: "tourismpay-pwa",
      description: "Main TourismPay PWA backend (Node.js/Express)",
      loadBalancingAlgorithm: "roundrobin",
      nodes: [
        { host: process.env.PWA_HOST_1 ?? "pwa-1", port: 3000, weight: 100 },
        { host: process.env.PWA_HOST_2 ?? "pwa-2", port: 3000, weight: 100 },
        { host: process.env.PWA_HOST_3 ?? "pwa-3", port: 3000, weight: 100 },
      ],
      healthCheck: {
        active: {
          type: "http",
          httpPath: "/api/health",
          intervalMs: 5_000,
          timeoutMs: 2_000,
          healthyThreshold: 2,
          unhealthyThreshold: 3,
          httpStatusCodes: [200],
        },
        passive: {
          type: "http",
          healthyStatusCodes: [200, 201, 204],
          unhealthyStatusCodes: [500, 502, 503, 504],
          unhealthyTcpFailures: 3,
          unhealthyHttpFailures: 5,
        },
      },
      circuitBreaker: {
        breakDurationSeconds: 10,
        maxBreaches: 3,
        unhealthyStatusCodes: [500, 502, 503],
      },
      timeoutMs: { connect: 2_000, send: 30_000, read: 30_000 },
      retries: 2,
      retryTimeoutMs: 10_000,
    },
    {
      name: "payment-switch-go",
      description: "Go-based PaymentSwitch microservice (TigerBeetle/Mojaloop bridge)",
      loadBalancingAlgorithm: "least_conn",
      nodes: [
        { host: process.env.PS_HOST_1 ?? "payment-switch-1", port: 8080, weight: 100 },
        { host: process.env.PS_HOST_2 ?? "payment-switch-2", port: 8080, weight: 100 },
      ],
      healthCheck: {
        active: {
          type: "http",
          httpPath: "/health",
          intervalMs: 3_000,
          timeoutMs: 1_000,
          healthyThreshold: 2,
          unhealthyThreshold: 2,
          httpStatusCodes: [200],
        },
        passive: {
          type: "http",
          healthyStatusCodes: [200, 201, 202],
          unhealthyStatusCodes: [500, 502, 503],
          unhealthyTcpFailures: 2,
          unhealthyHttpFailures: 3,
        },
      },
      circuitBreaker: {
        breakDurationSeconds: 30,
        maxBreaches: 5,
        unhealthyStatusCodes: [500, 502, 503, 504],
      },
      timeoutMs: { connect: 1_000, send: 10_000, read: 10_000 },
      retries: 1,
      retryTimeoutMs: 5_000,
    },
    {
      name: "tigerbeetle",
      description: "TigerBeetle double-entry ledger service",
      loadBalancingAlgorithm: "chash",  // Consistent hashing for ledger affinity
      nodes: [
        { host: process.env.TB_HOST_1 ?? "tigerbeetle-1", port: 3001, weight: 100 },
        { host: process.env.TB_HOST_2 ?? "tigerbeetle-2", port: 3001, weight: 100 },
        { host: process.env.TB_HOST_3 ?? "tigerbeetle-3", port: 3001, weight: 100 },
      ],
      healthCheck: {
        active: {
          type: "tcp",
          intervalMs: 5_000,
          timeoutMs: 2_000,
          healthyThreshold: 2,
          unhealthyThreshold: 3,
        },
      },
      timeoutMs: { connect: 1_000, send: 5_000, read: 5_000 },
      retries: 0,  // TigerBeetle is idempotent — no retries needed
      retryTimeoutMs: 0,
    },
  ],

  rateLimitPolicies: [
    {
      name: "standard-api",
      requestsPerSecond: 100,
      requestsPerMinute: 3_000,
      burstMultiplier: 2,
      keyType: "consumer",
      rejectionCode: 429,
    },
    {
      name: "remittance-creation",
      requestsPerSecond: 5,
      requestsPerMinute: 100,
      burstMultiplier: 1,
      keyType: "consumer",
      rejectionCode: 429,
    },
    {
      name: "admin-api",
      requestsPerSecond: 50,
      requestsPerMinute: 1_000,
      burstMultiplier: 3,
      keyType: "consumer",
      rejectionCode: 429,
    },
    {
      name: "public-api",
      requestsPerSecond: 20,
      requestsPerMinute: 500,
      burstMultiplier: 1,
      keyType: "remote_addr",
      rejectionCode: 429,
    },
  ],

  routes: [
    {
      name: "trpc-api",
      uriPattern: "/api/trpc/*",
      methods: ["GET", "POST"],
      upstreamName: "tourismpay-pwa",
      plugins: ["jwt-auth", "rate-limiting", "prometheus", "zipkin"],
      rateLimitPolicy: "standard-api",
      authRequired: true,
    },
    {
      name: "oauth-callback",
      uriPattern: "/api/oauth/*",
      methods: ["GET", "POST"],
      upstreamName: "tourismpay-pwa",
      plugins: ["rate-limiting", "prometheus"],
      rateLimitPolicy: "public-api",
      authRequired: false,
    },
    {
      name: "payment-switch-proxy",
      uriPattern: "/api/ps/*",
      methods: ["GET", "POST", "PUT", "DELETE"],
      upstreamName: "payment-switch-go",
      plugins: ["jwt-auth", "rate-limiting", "prometheus", "zipkin", "request-id"],
      rateLimitPolicy: "remittance-creation",
      authRequired: true,
      stripPrefix: "/api/ps",
    },
    {
      name: "health-check",
      uriPattern: "/api/health",
      methods: ["GET"],
      upstreamName: "tourismpay-pwa",
      plugins: [],
      authRequired: false,
    },
  ],

  globalPlugins: [
    "cors",
    "response-rewrite",
    "real-ip",
    "request-id",
    "prometheus",
  ],
};

export function getApisixConfigSummary() {
  return {
    etcdNodes: APISIX_HA_CONFIG.etcdCluster.length,
    upstreamCount: APISIX_HA_CONFIG.upstreams.length,
    totalUpstreamNodes: APISIX_HA_CONFIG.upstreams.reduce((s, u) => s + u.nodes.length, 0),
    routeCount: APISIX_HA_CONFIG.routes.length,
    rateLimitPolicies: APISIX_HA_CONFIG.rateLimitPolicies.map(p => ({
      name: p.name,
      rps: p.requestsPerSecond,
      rpm: p.requestsPerMinute,
    })),
    globalPlugins: APISIX_HA_CONFIG.globalPlugins,
    upstreams: APISIX_HA_CONFIG.upstreams.map(u => ({
      name: u.name,
      nodeCount: u.nodes.length,
      lbAlgorithm: u.loadBalancingAlgorithm,
      circuitBreaker: !!u.circuitBreaker,
    })),
  };
}
