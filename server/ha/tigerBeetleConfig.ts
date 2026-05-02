/**
 * TigerBeetle High-Availability Configuration
 *
 * TigerBeetle uses a Viewstamped Replication (VSR) consensus protocol.
 * A cluster of N replicas can tolerate floor((N-1)/2) failures.
 *
 * Recommended configurations:
 *  - 3 replicas: tolerates 1 failure (development/staging)
 *  - 6 replicas: tolerates 2 failures (production)
 *
 * Each replica stores its own copy of the ledger data. The primary replica
 * processes all writes; replicas serve reads and take over on primary failure.
 */

export interface TigerBeetleReplica {
  id: number;
  address: string;       // host:port
  dataDirectory: string;
  zone: string;          // Availability zone for rack-awareness
}

export interface TigerBeetleClusterConfig {
  clusterId: number;
  replicas: TigerBeetleReplica[];
  /** Cache size in bytes per replica (recommended: 256MB–8GB depending on dataset) */
  cacheSizeBytes: number;
  /** Storage size in bytes per replica */
  storageSizeBytes: number;
  /** Number of accounts the cluster is pre-allocated for */
  accountsPreallocated: number;
  /** Number of transfers the cluster is pre-allocated for */
  transfersPreallocated: number;
}

export interface TigerBeetleLedgerConfig {
  /** Ledger ID for each currency/asset type */
  ledgers: Record<string, number>;
  /** Transfer codes for different operation types */
  transferCodes: Record<string, number>;
  /** Account flags for different account types */
  accountFlags: Record<string, number>;
}

export interface TigerBeetleHAConfig {
  cluster: TigerBeetleClusterConfig;
  ledger: TigerBeetleLedgerConfig;
  client: {
    concurrencyMax: number;
    requestTimeoutMs: number;
    retryCount: number;
  };
  monitoring: {
    metricsPort: number;
    metricsPath: string;
    healthCheckIntervalMs: number;
  };
}

export const TIGERBEETLE_HA_CONFIG: TigerBeetleHAConfig = {
  cluster: {
    clusterId: Number(process.env.TB_CLUSTER_ID ?? 0),

    // 6-replica production cluster across 3 availability zones (2 per zone)
    // Tolerates up to 2 simultaneous replica failures
    replicas: [
      { id: 0, address: process.env.TB_REPLICA_0 ?? "tigerbeetle-0:3001", dataDirectory: "/data/tb-0", zone: "az-1" },
      { id: 1, address: process.env.TB_REPLICA_1 ?? "tigerbeetle-1:3001", dataDirectory: "/data/tb-1", zone: "az-1" },
      { id: 2, address: process.env.TB_REPLICA_2 ?? "tigerbeetle-2:3001", dataDirectory: "/data/tb-2", zone: "az-2" },
      { id: 3, address: process.env.TB_REPLICA_3 ?? "tigerbeetle-3:3001", dataDirectory: "/data/tb-3", zone: "az-2" },
      { id: 4, address: process.env.TB_REPLICA_4 ?? "tigerbeetle-4:3001", dataDirectory: "/data/tb-4", zone: "az-3" },
      { id: 5, address: process.env.TB_REPLICA_5 ?? "tigerbeetle-5:3001", dataDirectory: "/data/tb-5", zone: "az-3" },
    ],

    // 1GB cache per replica — adjust based on working set size
    cacheSizeBytes: 1 * 1024 * 1024 * 1024,

    // 64GB storage per replica — pre-allocated for performance
    storageSizeBytes: 64 * 1024 * 1024 * 1024,

    // Pre-allocate for 10M accounts and 100M transfers
    accountsPreallocated: 10_000_000,
    transfersPreallocated: 100_000_000,
  },

  ledger: {
    // Each currency has its own ledger ID for isolation
    ledgers: {
      USD: 1,
      NGN: 2,
      KES: 3,
      GHS: 4,
      TZS: 5,
      UGX: 6,
      ZAR: 7,
      BTC: 100,
      ETH: 101,
      USDC: 102,
      USDT: 103,
    },

    // Transfer codes identify the type of financial operation
    transferCodes: {
      REMITTANCE_DEBIT: 1,
      REMITTANCE_CREDIT: 2,
      SETTLEMENT_DEBIT: 3,
      SETTLEMENT_CREDIT: 4,
      FEE_COLLECTION: 5,
      REVERSAL_DEBIT: 6,
      REVERSAL_CREDIT: 7,
      LIQUIDITY_PROVISION: 8,
      LIQUIDITY_WITHDRAWAL: 9,
      INTER_LEDGER_TRANSFER: 10,
    },

    // Account flags for different account types
    accountFlags: {
      PARTICIPANT_SETTLEMENT: 1,   // Participant settlement account
      PARTICIPANT_PREFUNDED: 2,    // Pre-funded liquidity account
      FEE_COLLECTION: 4,           // Platform fee collection account
      SUSPENSE: 8,                 // Suspense account for in-flight transfers
      NOSTRO: 16,                  // Nostro account for cross-border
    },
  },

  client: {
    // Maximum concurrent in-flight requests per client instance
    concurrencyMax: 32,
    requestTimeoutMs: 5_000,
    retryCount: 3,
  },

  monitoring: {
    metricsPort: 9090,
    metricsPath: "/metrics",
    healthCheckIntervalMs: 5_000,
  },
};

export function getTigerBeetleConfigSummary() {
  const cfg = TIGERBEETLE_HA_CONFIG;
  const replicaCount = cfg.cluster.replicas.length;
  const faultTolerance = Math.floor((replicaCount - 1) / 2);
  return {
    clusterId: cfg.cluster.clusterId,
    replicaCount,
    faultTolerance,
    zonesUsed: Array.from(new Set(cfg.cluster.replicas.map(r => r.zone))),
    cacheSizeGb: cfg.cluster.cacheSizeBytes / (1024 ** 3),
    storageSizeGb: cfg.cluster.storageSizeBytes / (1024 ** 3),
    accountsPreallocated: cfg.cluster.accountsPreallocated,
    transfersPreallocated: cfg.cluster.transfersPreallocated,
    ledgerCount: Object.keys(cfg.ledger.ledgers).length,
    transferCodeCount: Object.keys(cfg.ledger.transferCodes).length,
    concurrencyMax: cfg.client.concurrencyMax,
  };
}
