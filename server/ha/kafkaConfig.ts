/**
 * Kafka High-Availability Configuration
 *
 * Defines broker topology, replication factors, consumer group settings,
 * and topic configurations for the TourismPay event streaming layer.
 *
 * Topics:
 *  - tourismpay.remittances       → remittance lifecycle events
 *  - tourismpay.settlements       → settlement batch events
 *  - tourismpay.fraud.alerts      → real-time fraud signals
 *  - tourismpay.noc.events        → NOC operational events
 *  - tourismpay.bis.investigations→ BIS investigation state changes
 */

export interface KafkaBroker {
  id: number;
  host: string;
  port: number;
  rack?: string;
}

export interface KafkaTopicConfig {
  name: string;
  partitions: number;
  replicationFactor: number;
  retentionMs: number;
  minInsyncReplicas: number;
  compressionType: "gzip" | "snappy" | "lz4" | "zstd" | "none";
}

export interface KafkaConsumerGroupConfig {
  groupId: string;
  topics: string[];
  sessionTimeoutMs: number;
  heartbeatIntervalMs: number;
  maxPollIntervalMs: number;
  autoOffsetReset: "earliest" | "latest" | "none";
  enableAutoCommit: boolean;
  maxPollRecords: number;
}

export interface KafkaHAConfig {
  brokers: KafkaBroker[];
  topics: KafkaTopicConfig[];
  consumerGroups: KafkaConsumerGroupConfig[];
  security: {
    protocol: "PLAINTEXT" | "SSL" | "SASL_PLAINTEXT" | "SASL_SSL";
    saslMechanism?: "PLAIN" | "SCRAM-SHA-256" | "SCRAM-SHA-512";
  };
  producer: {
    acks: "all" | "1" | "0";
    retries: number;
    retryBackoffMs: number;
    requestTimeoutMs: number;
    enableIdempotence: boolean;
    maxInFlightRequestsPerConnection: number;
    compressionType: "gzip" | "snappy" | "lz4" | "zstd" | "none";
  };
}

export const KAFKA_HA_CONFIG: KafkaHAConfig = {
  // Three-broker cluster across availability zones for fault tolerance.
  // Minimum of 2 brokers must be available for the cluster to accept writes.
  brokers: [
    { id: 1, host: process.env.KAFKA_BROKER_1_HOST ?? "kafka-1", port: 9092, rack: "az-1" },
    { id: 2, host: process.env.KAFKA_BROKER_2_HOST ?? "kafka-2", port: 9092, rack: "az-2" },
    { id: 3, host: process.env.KAFKA_BROKER_3_HOST ?? "kafka-3", port: 9092, rack: "az-3" },
  ],

  topics: [
    {
      name: "tourismpay.remittances",
      partitions: 12,          // 12 partitions allows 12 parallel consumers
      replicationFactor: 3,    // Replicated across all 3 brokers
      retentionMs: 7 * 24 * 60 * 60 * 1000, // 7 days
      minInsyncReplicas: 2,    // At least 2 replicas must acknowledge writes
      compressionType: "snappy",
    },
    {
      name: "tourismpay.settlements",
      partitions: 6,
      replicationFactor: 3,
      retentionMs: 30 * 24 * 60 * 60 * 1000, // 30 days for audit trail
      minInsyncReplicas: 2,
      compressionType: "gzip",
    },
    {
      name: "tourismpay.fraud.alerts",
      partitions: 6,
      replicationFactor: 3,
      retentionMs: 14 * 24 * 60 * 60 * 1000, // 14 days
      minInsyncReplicas: 2,
      compressionType: "snappy",
    },
    {
      name: "tourismpay.noc.events",
      partitions: 3,
      replicationFactor: 3,
      retentionMs: 90 * 24 * 60 * 60 * 1000, // 90 days for compliance
      minInsyncReplicas: 2,
      compressionType: "gzip",
    },
    {
      name: "tourismpay.bis.investigations",
      partitions: 3,
      replicationFactor: 3,
      retentionMs: 365 * 24 * 60 * 60 * 1000, // 1 year for regulatory
      minInsyncReplicas: 2,
      compressionType: "gzip",
    },
  ],

  consumerGroups: [
    {
      groupId: "tourismpay-remittance-processor",
      topics: ["tourismpay.remittances"],
      sessionTimeoutMs: 30_000,
      heartbeatIntervalMs: 3_000,
      maxPollIntervalMs: 300_000,
      autoOffsetReset: "earliest",
      enableAutoCommit: false, // Manual commit for exactly-once semantics
      maxPollRecords: 500,
    },
    {
      groupId: "tourismpay-settlement-processor",
      topics: ["tourismpay.settlements"],
      sessionTimeoutMs: 30_000,
      heartbeatIntervalMs: 3_000,
      maxPollIntervalMs: 600_000, // Longer for settlement batch processing
      autoOffsetReset: "earliest",
      enableAutoCommit: false,
      maxPollRecords: 100,
    },
    {
      groupId: "tourismpay-fraud-detector",
      topics: ["tourismpay.remittances", "tourismpay.fraud.alerts"],
      sessionTimeoutMs: 10_000,  // Shorter for low-latency fraud detection
      heartbeatIntervalMs: 1_000,
      maxPollIntervalMs: 30_000,
      autoOffsetReset: "latest",
      enableAutoCommit: true,
      maxPollRecords: 1000,
    },
    {
      groupId: "tourismpay-noc-monitor",
      topics: ["tourismpay.noc.events", "tourismpay.fraud.alerts"],
      sessionTimeoutMs: 30_000,
      heartbeatIntervalMs: 3_000,
      maxPollIntervalMs: 120_000,
      autoOffsetReset: "latest",
      enableAutoCommit: true,
      maxPollRecords: 200,
    },
  ],

  security: {
    protocol: (process.env.KAFKA_SECURITY_PROTOCOL as KafkaHAConfig["security"]["protocol"]) ?? "SASL_SSL",
    saslMechanism: "SCRAM-SHA-512",
  },

  producer: {
    acks: "all",               // Wait for all in-sync replicas to acknowledge
    retries: 10,
    retryBackoffMs: 200,
    requestTimeoutMs: 30_000,
    enableIdempotence: true,   // Exactly-once delivery guarantee
    maxInFlightRequestsPerConnection: 5,
    compressionType: "snappy",
  },
};

/**
 * Returns a health summary of the Kafka configuration.
 * In production this would query the Kafka Admin API.
 */
export function getKafkaConfigSummary() {
  return {
    brokerCount: KAFKA_HA_CONFIG.brokers.length,
    topicCount: KAFKA_HA_CONFIG.topics.length,
    consumerGroupCount: KAFKA_HA_CONFIG.consumerGroups.length,
    minReplicationFactor: Math.min(...KAFKA_HA_CONFIG.topics.map(t => t.replicationFactor)),
    securityProtocol: KAFKA_HA_CONFIG.security.protocol,
    idempotentProducer: KAFKA_HA_CONFIG.producer.enableIdempotence,
    brokers: KAFKA_HA_CONFIG.brokers.map(b => ({
      id: b.id,
      host: b.host,
      port: b.port,
      rack: b.rack,
    })),
  };
}
