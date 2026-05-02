/**
 * HA Configuration Router
 *
 * Exposes read-only HA configuration summaries and simulated health status
 * for all infrastructure components: Kafka, Temporal, Redis, APISIX, TigerBeetle.
 *
 * In production these endpoints would query live cluster APIs.
 * Currently they return configuration-derived summaries with simulated health.
 */
import { adminProcedure, router } from "../_core/trpc";
import { getKafkaConfigSummary } from "../ha/kafkaConfig";
import { getTemporalConfigSummary } from "../ha/temporalConfig";
import { getRedisConfigSummary } from "../ha/redisConfig";
import { getApisixConfigSummary } from "../ha/apisixConfig";
import { getTigerBeetleConfigSummary } from "../ha/tigerBeetleConfig";
import {
  getInfrastructureStatus,
  getSettlementHealth,
  getMojaloopStatus,
} from "../_core/settlementClient";

export const haConfigRouter = router({
  /** Full HA configuration overview for all infrastructure components */
  overview: adminProcedure.query(async () => {
    const [infraStatus, settlementHealth, mojaloopStatus] = await Promise.allSettled([
      getInfrastructureStatus(),
      getSettlementHealth(),
      getMojaloopStatus(),
    ]);

    const kafka = getKafkaConfigSummary();
    const temporal = getTemporalConfigSummary();
    const redis = getRedisConfigSummary();
    const apisix = getApisixConfigSummary();
    const tigerBeetle = getTigerBeetleConfigSummary();

    return {
      timestamp: Date.now(),
      components: {
        kafka: {
          ...kafka,
          status: "configured",
          description: `${kafka.brokerCount}-broker cluster, ${kafka.topicCount} topics, replication factor ${kafka.minReplicationFactor}`,
        },
        temporal: {
          ...temporal,
          status: "configured",
          description: `${temporal.serverCount}-node cluster, ${temporal.totalWorkers} workers across ${temporal.taskQueues.length} task queues`,
        },
        redis: {
          ...redis,
          status: "configured",
          description: `${redis.mode} mode, ${redis.nodeCount} nodes, ${redis.maxConnections} max connections`,
        },
        apisix: {
          ...apisix,
          status: "configured",
          description: `${apisix.upstreamCount} upstreams, ${apisix.routeCount} routes, ${apisix.totalUpstreamNodes} total nodes`,
        },
        tigerBeetle: {
          ...tigerBeetle,
          status: infraStatus.status === "fulfilled" && infraStatus.value?.tigerbeetle?.connected
            ? "online" : "configured",
          description: `${tigerBeetle.replicaCount}-replica cluster, tolerates ${tigerBeetle.faultTolerance} failures, ${tigerBeetle.ledgerCount} ledgers`,
          liveStatus: infraStatus.status === "fulfilled" ? infraStatus.value?.tigerbeetle : null,
        },
        mojaloop: {
          status: mojaloopStatus.status === "fulfilled" && mojaloopStatus.value?.connected
            ? "online" : "configured",
          description: "Mojaloop settlement network connectivity",
          liveStatus: mojaloopStatus.status === "fulfilled" ? mojaloopStatus.value : null,
        },
        settlementService: {
          status: settlementHealth.status === "fulfilled" && settlementHealth.value?.status === "healthy"
            ? "online" : "configured",
          description: "Go settlement microservice health",
          liveStatus: settlementHealth.status === "fulfilled" ? settlementHealth.value : null,
        },
      },
    };
  }),

  /** Kafka-specific configuration detail */
  kafka: adminProcedure.query(() => getKafkaConfigSummary()),

  /** Temporal-specific configuration detail */
  temporal: adminProcedure.query(() => getTemporalConfigSummary()),

  /** Redis-specific configuration detail */
  redis: adminProcedure.query(() => getRedisConfigSummary()),

  /** APISIX-specific configuration detail */
  apisix: adminProcedure.query(() => getApisixConfigSummary()),

  /** TigerBeetle-specific configuration detail */
  tigerBeetle: adminProcedure.query(async () => {
    const summary = getTigerBeetleConfigSummary();
    const liveStatus = await getInfrastructureStatus().catch(() => null);
    return {
      ...summary,
      liveStatus: liveStatus?.tigerbeetle ?? null,
    };
  }),
});
