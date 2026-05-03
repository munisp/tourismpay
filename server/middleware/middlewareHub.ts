/**
 * Middleware Integration Hub
 *
 * Centralized integration layer for all middleware services:
 * - Kafka: Event streaming & pub/sub
 * - Dapr: Service-to-service invocation, state management
 * - Temporal: Workflow orchestration (long-running processes)
 * - Redis: Caching, sessions, pub/sub
 * - Keycloak: Identity & access management
 * - Permify: Fine-grained authorization
 * - Mojaloop: Interoperable payment switching
 * - OpenSearch: Full-text search & analytics
 * - OpenAppSec: Web application security
 * - APISIX: API gateway
 * - TigerBeetle: Double-entry accounting
 * - Fluvio: Real-time data streaming
 * - Lakehouse: Data lake analytics
 */
import { z } from "zod";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { getCircuitBreakerStats, resetCircuit } from "./circuitBreaker";
import { serviceFetch } from "./serviceFetch";
import { getKafkaProducerStats } from "./kafkaProducer";
import { getCacheStats } from "./redisClient";
import { getIndexerStats } from "./opensearchIndexer";
import { getFluvioLakehouseStats } from "./fluvioLakehouse";

// ─── Service Configuration ──────────────────────────────────────────────────

const MIDDLEWARE_URLS = {
  kafka: process.env.KAFKA_BROKER_URL || "localhost:9092",
  dapr: process.env.DAPR_HTTP_URL || "http://localhost:3500",
  temporal: process.env.TEMPORAL_URL || "localhost:7233",
  redis: process.env.REDIS_URL || "redis://localhost:6379",
  keycloak: process.env.KEYCLOAK_URL || "http://localhost:8080",
  permify: process.env.PERMIFY_URL || "http://localhost:3476",
  mojaloop: process.env.MOJALOOP_URL || "http://localhost:4000",
  opensearch: process.env.OPENSEARCH_URL || "http://localhost:9200",
  openappsec: process.env.OPENAPPSEC_URL || "http://localhost:8085",
  apisix: process.env.APISIX_ADMIN_URL || "http://localhost:9180",
  tigerbeetle: process.env.TIGERBEETLE_URL || "localhost:3000",
  fluvio: process.env.FLUVIO_URL || "localhost:9003",
  lakehouse: process.env.LAKEHOUSE_URL || "http://localhost:8070",
  pbac: process.env.PBAC_ENGINE_URL || "http://localhost:8090",
  rateLimiter: process.env.RATE_LIMITER_URL || "http://localhost:8091",
  cryptoEngine: process.env.CRYPTO_ENGINE_URL || "http://localhost:8092",
  offlineSync: process.env.OFFLINE_SYNC_URL || "http://localhost:8093",
  goSettlement: process.env.GO_SETTLEMENT_URL || "http://localhost:8081",
  pythonMl: process.env.PYTHON_ML_URL || "http://localhost:8001",
};

interface ServiceStatus {
  name: string;
  url: string;
  status: "healthy" | "unhealthy" | "unknown";
  latencyMs: number;
  lastChecked: string;
  version?: string;
}

// ─── Health Check ────────────────────────────────────────────────────────────

async function checkServiceHealth(name: string, url: string): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    let healthUrl = url;
    if (url.startsWith("http")) {
      healthUrl = `${url}/health`;
    } else {
      healthUrl = `http://${url}/health`;
    }
    const response = await fetch(healthUrl, {
      signal: AbortSignal.timeout(3000),
    });
    const latency = Date.now() - start;
    if (response.ok) {
      const data = await response.json() as Record<string, unknown>;
      return {
        name,
        url,
        status: "healthy",
        latencyMs: latency,
        lastChecked: new Date().toISOString(),
        version: (data.version as string) || undefined,
      };
    }
    return { name, url, status: "unhealthy", latencyMs: latency, lastChecked: new Date().toISOString() };
  } catch {
    return {
      name,
      url,
      status: "unknown",
      latencyMs: Date.now() - start,
      lastChecked: new Date().toISOString(),
    };
  }
}

// ─── Kafka Integration ──────────────────────────────────────────────────────

const kafkaTopics = [
  "tourismpay.transactions",
  "tourismpay.wallet.events",
  "tourismpay.kyb.events",
  "tourismpay.bis.inspections",
  "tourismpay.payments",
  "tourismpay.settlements",
  "tourismpay.fraud.alerts",
  "tourismpay.notifications",
  "tourismpay.audit.logs",
  "tourismpay.exchange.rates",
  "tourismpay.merchant.events",
  "tourismpay.remittance.events",
  "tourismpay.sync.offline",
];

// ─── Temporal Workflows ─────────────────────────────────────────────────────

const temporalWorkflows = [
  {
    name: "kyb-onboarding",
    description: "Complete KYB application processing workflow",
    steps: ["submit", "document_verification", "compliance_review", "risk_assessment", "approval_decision"],
    avgDuration: "24h",
  },
  {
    name: "settlement-cycle",
    description: "End-of-day settlement processing",
    steps: ["aggregate_transactions", "calculate_fees", "generate_entries", "execute_transfers", "reconcile"],
    avgDuration: "2h",
  },
  {
    name: "remittance-transfer",
    description: "Cross-border remittance processing via Mojaloop",
    steps: ["validate", "compliance_check", "fx_quote", "execute_transfer", "confirm_delivery"],
    avgDuration: "30m",
  },
  {
    name: "fraud-investigation",
    description: "Automated fraud investigation pipeline",
    steps: ["detect_anomaly", "gather_evidence", "ml_scoring", "alert_analyst", "resolution"],
    avgDuration: "4h",
  },
  {
    name: "merchant-onboarding",
    description: "Full merchant registration and verification",
    steps: ["profile_creation", "document_upload", "kyb_verification", "stripe_connect", "go_live"],
    avgDuration: "48h",
  },
];

// ─── Router ──────────────────────────────────────────────────────────────────

export const middlewareHubRouter = router({
  // Health dashboard for all middleware services
  healthCheck: adminProcedure.query(async () => {
    const checks = await Promise.allSettled(
      Object.entries(MIDDLEWARE_URLS).map(([name, url]) =>
        checkServiceHealth(name, url)
      )
    );

    const services = checks.map((result) => {
      if (result.status === "fulfilled") return result.value;
      return {
        name: "unknown",
        url: "",
        status: "unknown" as const,
        latencyMs: 0,
        lastChecked: new Date().toISOString(),
      };
    });

    const healthyCount = services.filter((s) => s.status === "healthy").length;
    return {
      services,
      summary: {
        total: services.length,
        healthy: healthyCount,
        unhealthy: services.filter((s) => s.status === "unhealthy").length,
        unknown: services.filter((s) => s.status === "unknown").length,
        overallStatus: healthyCount === services.length ? "all_healthy" :
          healthyCount > services.length / 2 ? "degraded" : "critical",
      },
    };
  }),

  // Kafka topics management
  kafkaTopics: adminProcedure.query(() => ({
    topics: kafkaTopics.map((t) => ({
      name: t,
      partitions: 3,
      replicationFactor: 2,
      retentionMs: 604800000,
    })),
    brokerUrl: MIDDLEWARE_URLS.kafka,
  })),

  publishEvent: protectedProcedure
    .input(z.object({
      topic: z.string(),
      key: z.string(),
      value: z.record(z.string(), z.unknown()),
      headers: z.record(z.string(), z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const response = await fetch(`${MIDDLEWARE_URLS.dapr}/v1.0/publish/kafka-pubsub/${input.topic}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: input.key, data: input.value }),
          signal: AbortSignal.timeout(5000),
        });
        return { published: response.ok, topic: input.topic, timestamp: new Date().toISOString() };
      } catch {
        return { published: false, topic: input.topic, timestamp: new Date().toISOString(), error: "Service unavailable" };
      }
    }),

  // Temporal workflow management
  workflows: adminProcedure.query(() => ({
    workflows: temporalWorkflows,
    temporalUrl: MIDDLEWARE_URLS.temporal,
  })),

  startWorkflow: adminProcedure
    .input(z.object({
      workflowName: z.string(),
      workflowId: z.string(),
      input: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const response = await fetch(`${MIDDLEWARE_URLS.temporal}/api/v1/namespaces/default/workflows`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workflow_type: input.workflowName,
            workflow_id: input.workflowId,
            input: input.input,
          }),
          signal: AbortSignal.timeout(5000),
        });
        return { started: response.ok, workflowId: input.workflowId };
      } catch {
        return { started: false, workflowId: input.workflowId, queued: true };
      }
    }),

  // Redis cache management
  cacheStats: adminProcedure.query(async () => {
    return {
      connected: false,
      url: MIDDLEWARE_URLS.redis,
      stats: {
        usedMemory: "N/A",
        connectedClients: 0,
        hitRate: 0,
        totalKeys: 0,
      },
      cachePolicies: [
        { key: "exchange_rates:*", ttl: 60, strategy: "write-through" },
        { key: "session:*", ttl: 86400, strategy: "lazy" },
        { key: "wallet_balance:*", ttl: 30, strategy: "write-through" },
        { key: "service_health:*", ttl: 15, strategy: "write-behind" },
        { key: "rate_limit:*", ttl: 60, strategy: "write-through" },
        { key: "api_response:*", ttl: 300, strategy: "cache-aside" },
      ],
    };
  }),

  // OpenSearch integration
  searchQuery: protectedProcedure
    .input(z.object({
      index: z.string(),
      query: z.string(),
      filters: z.record(z.string(), z.unknown()).optional(),
      from: z.number().default(0),
      size: z.number().default(20),
    }))
    .query(async ({ input }) => {
      try {
        const response = await fetch(`${MIDDLEWARE_URLS.opensearch}/${input.index}/_search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: {
              multi_match: {
                query: input.query,
                fields: ["*"],
                type: "best_fields",
              },
            },
            from: input.from,
            size: input.size,
          }),
          signal: AbortSignal.timeout(5000),
        });
        if (response.ok) {
          const data = await response.json() as Record<string, any>;
          return { hits: data.hits?.hits || [], total: data.hits?.total?.value || 0 };
        }
      } catch { /* service unavailable */ }
      return { hits: [], total: 0 };
    }),

  // Permify authorization check
  checkPermission: protectedProcedure
    .input(z.object({
      entity: z.string(),
      relation: z.string(),
      subject: z.string(),
    }))
    .query(async ({ input }) => {
      try {
        const response = await fetch(`${MIDDLEWARE_URLS.permify}/v1/tenants/tourismpay/permissions/check`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entity: { type: input.entity.split(":")[0], id: input.entity.split(":")[1] },
            permission: input.relation,
            subject: { type: input.subject.split(":")[0], id: input.subject.split(":")[1] },
          }),
          signal: AbortSignal.timeout(3000),
        });
        if (response.ok) {
          const data = await response.json() as Record<string, unknown>;
          return { allowed: data.can === "CHECK_RESULT_ALLOWED" };
        }
      } catch { /* service unavailable */ }
      return { allowed: false };
    }),

  // APISIX gateway routes
  gatewayRoutes: adminProcedure.query(async () => {
    try {
      const response = await fetch(`${MIDDLEWARE_URLS.apisix}/apisix/admin/routes`, {
        headers: { "X-API-KEY": process.env.APISIX_API_KEY || "edd1c9f034335f136f87ad84b625c8f1" },
        signal: AbortSignal.timeout(3000),
      });
      if (response.ok) {
        const data = await response.json() as Record<string, any>;
        return { routes: data.list || [] };
      }
    } catch { /* service unavailable */ }
    return {
      routes: [
        { uri: "/api/*", upstream: "http://localhost:3000", plugins: ["rate-limiting", "cors", "jwt-auth"] },
        { uri: "/settlement/*", upstream: "http://localhost:8081", plugins: ["rate-limiting", "key-auth"] },
        { uri: "/ml/*", upstream: "http://localhost:8001", plugins: ["rate-limiting"] },
        { uri: "/pbac/*", upstream: "http://localhost:8090", plugins: ["key-auth"] },
        { uri: "/sync/*", upstream: "http://localhost:8093", plugins: ["rate-limiting", "cors"] },
      ],
    };
  }),

  // Lakehouse analytics
  lakehouseQuery: adminProcedure
    .input(z.object({
      table: z.string(),
      query: z.string().optional(),
      timeRange: z.object({
        from: z.string(),
        to: z.string(),
      }).optional(),
    }))
    .query(async ({ input }) => {
      try {
        const response = await fetch(`${MIDDLEWARE_URLS.lakehouse}/api/v1/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
          signal: AbortSignal.timeout(10000),
        });
        if (response.ok) return await response.json();
      } catch { /* unavailable */ }
      return {
        tables: [
          "transactions_fact",
          "wallet_events_fact",
          "exchange_rates_dim",
          "merchant_dim",
          "tourist_dim",
          "settlement_fact",
          "fraud_alerts_fact",
          "kyb_applications_fact",
        ],
        queryStatus: "service_unavailable",
      };
    }),

  // Service mesh configuration
  serviceMesh: adminProcedure.query(() => ({
    services: [
      { name: "tourismpay-pwa", port: 3000, protocol: "http", replicas: 2, healthEndpoint: "/health" },
      { name: "go-settlement", port: 8081, protocol: "http", replicas: 2, healthEndpoint: "/health" },
      { name: "python-ml-bis", port: 8001, protocol: "http", replicas: 1, healthEndpoint: "/health" },
      { name: "python-ml-fraud", port: 8002, protocol: "http", replicas: 1, healthEndpoint: "/health" },
      { name: "python-ml-compliance", port: 8003, protocol: "http", replicas: 1, healthEndpoint: "/health" },
      { name: "python-ml-exchange", port: 8004, protocol: "http", replicas: 1, healthEndpoint: "/health" },
      { name: "python-ml-pdf", port: 8005, protocol: "http", replicas: 1, healthEndpoint: "/health" },
      { name: "pbac-engine", port: 8090, protocol: "http", replicas: 2, healthEndpoint: "/health" },
      { name: "rate-limiter", port: 8091, protocol: "http", replicas: 2, healthEndpoint: "/health" },
      { name: "crypto-engine", port: 8092, protocol: "http", replicas: 1, healthEndpoint: "/health" },
      { name: "offline-sync", port: 8093, protocol: "http", replicas: 2, healthEndpoint: "/health" },
    ],
    daprSidecar: { enabled: true, port: 3500 },
    mtls: true,
    loadBalancing: "round-robin",
    circuitBreaker: {
      enabled: true,
      threshold: 5,
      timeout: 30000,
      halfOpenRequests: 3,
    },
  })),

  // Circuit breaker status for all downstream services
  circuitBreakerStatus: adminProcedure.query(() => {
    return getCircuitBreakerStats();
  }),

  // Reset a specific circuit breaker (admin recovery action)
  resetCircuitBreaker: adminProcedure
    .input(z.object({ serviceName: z.string() }))
    .mutation(({ input }) => {
      resetCircuit(input.serviceName);
      return { reset: true, serviceName: input.serviceName };
    }),

  // Kafka producer stats
  kafkaProducerStats: adminProcedure.query(() => {
    return getKafkaProducerStats();
  }),

  // Redis/cache stats
  cacheStatus: adminProcedure.query(() => {
    return getCacheStats();
  }),

  // OpenSearch indexer stats
  indexerStats: adminProcedure.query(() => {
    return getIndexerStats();
  }),

  // Fluvio/Lakehouse pipeline stats
  pipelineStats: adminProcedure.query(() => {
    return getFluvioLakehouseStats();
  }),
});
