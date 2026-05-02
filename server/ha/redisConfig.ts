/**
 * Redis High-Availability Configuration
 *
 * Supports both Sentinel (managed failover) and Cluster (horizontal scaling)
 * modes. Sentinel is recommended for most deployments; Cluster is used when
 * dataset size exceeds a single node's memory capacity.
 *
 * Usage in TourismPay:
 *  - Session caching (auth tokens, JWT blacklist)
 *  - FX rate cache (5-minute TTL)
 *  - Kill switch state (sub-millisecond reads)
 *  - Rate limiting counters (per-participant, per-user)
 *  - Pub/Sub for real-time NOC event broadcasting
 */

export type RedisMode = "sentinel" | "cluster" | "standalone";

export interface RedisSentinelNode {
  host: string;
  port: number;
}

export interface RedisClusterNode {
  host: string;
  port: number;
}

export interface RedisConnectionPool {
  minConnections: number;
  maxConnections: number;
  acquireTimeoutMs: number;
  idleTimeoutMs: number;
  connectionTimeoutMs: number;
}

export interface RedisCachePolicy {
  name: string;
  ttlSeconds: number;
  maxMemoryPolicy: "allkeys-lru" | "volatile-lru" | "allkeys-lfu" | "noeviction";
  keyPrefix: string;
}

export interface RedisHAConfig {
  mode: RedisMode;
  sentinel?: {
    masterName: string;
    sentinels: RedisSentinelNode[];
    quorum: number;
    downAfterMs: number;
    failoverTimeoutMs: number;
    parallelSyncs: number;
  };
  cluster?: {
    nodes: RedisClusterNode[];
    maxRedirects: number;
    enableReadyCheck: boolean;
    scaleReads: "master" | "slave" | "all";
  };
  standalone?: {
    host: string;
    port: number;
  };
  auth?: {
    password?: string;
    username?: string;
    tls: boolean;
  };
  pool: RedisConnectionPool;
  cachePolicies: RedisCachePolicy[];
  pubSub: {
    channels: string[];
    maxSubscriptions: number;
  };
}

export const REDIS_HA_CONFIG: RedisHAConfig = {
  mode: (process.env.REDIS_MODE as RedisMode) ?? "sentinel",

  sentinel: {
    masterName: process.env.REDIS_SENTINEL_MASTER ?? "tourismpay-master",
    sentinels: [
      { host: process.env.REDIS_SENTINEL_1_HOST ?? "redis-sentinel-1", port: 26379 },
      { host: process.env.REDIS_SENTINEL_2_HOST ?? "redis-sentinel-2", port: 26379 },
      { host: process.env.REDIS_SENTINEL_3_HOST ?? "redis-sentinel-3", port: 26379 },
    ],
    quorum: 2,              // 2 of 3 sentinels must agree on failover
    downAfterMs: 5_000,     // Mark master down after 5s of no response
    failoverTimeoutMs: 60_000,
    parallelSyncs: 1,       // One replica syncs at a time during failover
  },

  cluster: {
    nodes: [
      { host: process.env.REDIS_CLUSTER_1_HOST ?? "redis-cluster-1", port: 6379 },
      { host: process.env.REDIS_CLUSTER_2_HOST ?? "redis-cluster-2", port: 6379 },
      { host: process.env.REDIS_CLUSTER_3_HOST ?? "redis-cluster-3", port: 6379 },
      { host: process.env.REDIS_CLUSTER_4_HOST ?? "redis-cluster-4", port: 6379 },
      { host: process.env.REDIS_CLUSTER_5_HOST ?? "redis-cluster-5", port: 6379 },
      { host: process.env.REDIS_CLUSTER_6_HOST ?? "redis-cluster-6", port: 6379 },
    ],
    maxRedirects: 16,
    enableReadyCheck: true,
    scaleReads: "slave",    // Read from replicas to reduce master load
  },

  auth: {
    password: process.env.REDIS_PASSWORD,
    username: process.env.REDIS_USERNAME,
    tls: process.env.REDIS_TLS === "true",
  },

  pool: {
    minConnections: 5,
    maxConnections: 50,
    acquireTimeoutMs: 5_000,
    idleTimeoutMs: 30_000,
    connectionTimeoutMs: 3_000,
  },

  cachePolicies: [
    {
      name: "fx-rates",
      ttlSeconds: 300,           // 5-minute FX rate cache
      maxMemoryPolicy: "volatile-lru",
      keyPrefix: "fx:",
    },
    {
      name: "session-tokens",
      ttlSeconds: 86_400,        // 24-hour session cache
      maxMemoryPolicy: "volatile-lru",
      keyPrefix: "sess:",
    },
    {
      name: "kill-switch",
      ttlSeconds: 0,             // No TTL — persists until explicitly cleared
      maxMemoryPolicy: "noeviction",
      keyPrefix: "ks:",
    },
    {
      name: "rate-limits",
      ttlSeconds: 60,            // 1-minute sliding window for rate limiting
      maxMemoryPolicy: "allkeys-lru",
      keyPrefix: "rl:",
    },
    {
      name: "participant-health",
      ttlSeconds: 30,            // 30-second health score cache
      maxMemoryPolicy: "volatile-lru",
      keyPrefix: "ph:",
    },
    {
      name: "bis-investigation-lock",
      ttlSeconds: 300,           // 5-minute distributed lock for BIS jobs
      maxMemoryPolicy: "volatile-lru",
      keyPrefix: "lock:bis:",
    },
  ],

  pubSub: {
    channels: [
      "tourismpay:noc:events",
      "tourismpay:fraud:alerts",
      "tourismpay:remittance:status",
      "tourismpay:settlement:completed",
      "tourismpay:kill-switch:changed",
    ],
    maxSubscriptions: 100,
  },
};

export function getRedisConfigSummary() {
  const cfg = REDIS_HA_CONFIG;
  const nodeCount =
    cfg.mode === "sentinel" ? cfg.sentinel!.sentinels.length :
    cfg.mode === "cluster" ? cfg.cluster!.nodes.length : 1;
  return {
    mode: cfg.mode,
    nodeCount,
    quorum: cfg.sentinel?.quorum,
    tlsEnabled: cfg.auth?.tls ?? false,
    maxConnections: cfg.pool.maxConnections,
    cachePolicies: cfg.cachePolicies.map(p => ({ name: p.name, ttlSeconds: p.ttlSeconds, keyPrefix: p.keyPrefix })),
    pubSubChannels: cfg.pubSub.channels,
  };
}
