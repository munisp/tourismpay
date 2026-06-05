# PostgreSQL Scaling Module

**Inspired by OpenAI's PostgreSQL Architecture for 800M+ Users**

This module implements PostgreSQL scaling patterns learned from OpenAI's approach to handling millions of queries per second with a single primary and ~50 read replicas.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Application Layer                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  Customer   │  │   Agent     │  │  Analytics  │  │   Fraud     │    │
│  │   Portal    │  │   Portal    │  │   Service   │  │  Detection  │    │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘    │
│         │                │                │                │            │
│         ▼                ▼                ▼                ▼            │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Workload Router                               │   │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐    │   │
│  │  │   High    │  │  Medium   │  │    Low    │  │  Isolated │    │   │
│  │  │ Priority  │  │ Priority  │  │ Priority  │  │  (Fraud)  │    │   │
│  │  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘    │   │
│  └────────┼──────────────┼──────────────┼──────────────┼───────────┘   │
└───────────┼──────────────┼──────────────┼──────────────┼───────────────┘
            │              │              │              │
            ▼              ▼              ▼              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      PgBouncer (Connection Pool)                         │
│  - Transaction pooling mode                                              │
│  - 10,000 max client connections                                         │
│  - 500 max DB connections per database                                   │
└─────────────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        PostgreSQL Cluster                                │
│                                                                          │
│  ┌──────────────────┐                                                   │
│  │     Primary      │◄──── Writes only                                  │
│  │   (Single Node)  │                                                   │
│  └────────┬─────────┘                                                   │
│           │                                                              │
│           │ Streaming Replication                                        │
│           │                                                              │
│  ┌────────▼─────────┐                                                   │
│  │   Hot Standby    │◄──── Automatic failover                           │
│  └──────────────────┘                                                   │
│                                                                          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐      │
│  │  Read Replica 1  │  │  Read Replica 2  │  │  Read Replica N  │      │
│  │   (Region: NG)   │  │   (Region: GH)   │  │   (Region: KE)   │      │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘      │
│                                                                          │
│  Load Balancing: Round-robin / Region-aware / Random                    │
└─────────────────────────────────────────────────────────────────────────┘
```

## Key Components

### 1. PgBouncer Connection Pooling (`pgbouncer.ini`)

Connection pooling is critical for handling thousands of concurrent connections efficiently.

**Configuration Highlights:**
- Transaction pooling mode (releases connection after each transaction)
- 10,000 max client connections
- 500 max DB connections per database
- Per-user pool settings for workload isolation
- Query timeout: 30 seconds
- Idle transaction timeout: 60 seconds (prevents autovacuum blocking)

### 2. Read Replica Pool (`read_replica_config.go`)

Manages multiple read replicas with intelligent load balancing.

**Features:**
- Round-robin load balancing
- Region-aware routing for latency optimization
- Automatic health checks
- Graceful fallback to primary if replicas unavailable
- Workload isolation by tier

**Usage:**
```go
// Create replica pool
pool, err := postgresql.NewReadReplicaPool(primaryConf, replicaConfs)

// Execute read on replica
rows, err := pool.ExecuteRead(ctx, "SELECT * FROM policies WHERE user_id = $1", userID)

// Execute write on primary
result, err := pool.ExecuteWrite(ctx, "INSERT INTO claims (...) VALUES (...)", args...)
```

### 3. Workload Isolation (`WorkloadRouter`)

Isolates workloads to prevent "noisy neighbor" problems.

**Tiers:**
| Tier | Use Case | Priority |
|------|----------|----------|
| High | Customer portal, claims submission, payments | Highest |
| Medium | Agent portal, underwriting | Medium |
| Low | Analytics, reporting, batch jobs | Low |
| Isolated | Fraud detection (Insurance Radar) | Isolated |

**Usage:**
```go
// Get pool for specific tier
pool, err := router.GetPool(postgresql.TierHighPriority)

// Execute on appropriate tier
rows, err := router.ExecuteRead(ctx, postgresql.TierHighPriority, query, args...)
```

### 4. Query Optimizer (`query_optimizer.go`)

Analyzes and optimizes queries based on OpenAI's learnings.

**Features:**
- Detects problematic patterns (excessive JOINs, missing indexes)
- Tracks query execution metrics
- Identifies slow queries (>100ms threshold)
- Provides optimization suggestions

**Anti-patterns Detected:**
- Queries with >4 JOINs (OpenAI had issues with 12-table joins)
- SELECT * (retrieves unnecessary columns)
- ORDER BY without LIMIT
- UPDATE/DELETE without WHERE
- LIKE with leading wildcard
- NOT IN with subquery

**Usage:**
```go
optimizer := postgresql.NewQueryOptimizer()

// Analyze query before execution
analysis := optimizer.AnalyzeQuery(query)
if analysis.RiskLevel == "high" {
    log.Warn("High-risk query detected", "warnings", analysis.Warnings)
}

// Record execution metrics
start := time.Now()
rows, err := db.Query(query)
optimizer.RecordExecution(query, time.Since(start).Milliseconds())
```

### 5. Lazy Writer (`LazyWriter`)

Implements lazy writes to smooth traffic spikes.

**Features:**
- Queues non-critical writes
- Batches writes for efficiency
- Configurable flush period
- Fallback to immediate execution if queue full

**Usage:**
```go
writer := postgresql.NewLazyWriter(db, 100, 5*time.Second)

// Queue non-critical write
writer.QueueWrite(
    "UPDATE user_preferences SET last_seen = $1 WHERE user_id = $2",
    []interface{}{time.Now(), userID},
    func(result sql.Result, err error) {
        if err != nil {
            log.Error("Failed to update last_seen", "error", err)
        }
    },
)
```

### 6. Rate Limiter (`RateLimiter`)

Implements rate limiting for batch operations.

**Usage:**
```go
processor := postgresql.NewBatchProcessor(db, 100, 50) // 100 ops/sec, batch size 50

operations := make([]func() error, len(records))
for i, record := range records {
    operations[i] = func() error {
        _, err := db.Exec("UPDATE ...", record.ID)
        return err
    }
}

err := processor.ProcessBatch(ctx, operations)
```

### 7. High Availability (`high_availability.go`)

Manages automatic failover to hot standby.

**Features:**
- Continuous health monitoring
- Automatic failover (configurable)
- Failover cooldown to prevent flapping
- Manual failover for maintenance
- Replication lag monitoring

**Usage:**
```go
ha, err := postgresql.NewHAManager(&postgresql.HAConfig{
    Primary:    primaryConf,
    HotStandby: standbyConf,
    FailoverPolicy: postgresql.FailoverPolicy{
        AutoFailover:      true,
        FailoverThreshold: 3,
        FailoverCooldown:  5 * time.Minute,
    },
    HealthCheck: postgresql.HealthCheckConfig{
        Interval: 10 * time.Second,
        Timeout:  5 * time.Second,
    },
})

// Set failover callback
ha.OnFailover(func(oldPrimary, newPrimary string) {
    log.Info("Failover completed", "from", oldPrimary, "to", newPrimary)
    alertOps("PostgreSQL failover occurred")
})

// Get current primary
db := ha.GetPrimary()
```

## Configuration for Insurance Platform

### Recommended Setup

```yaml
# Primary (Writes)
primary:
  host: primary.postgres.internal
  port: 5432
  max_connections: 500
  
# Hot Standby (Failover)
hot_standby:
  host: standby.postgres.internal
  port: 5432
  max_connections: 500

# Read Replicas (by region)
replicas:
  - host: replica-ng-1.postgres.internal
    region: nigeria
    priority: 1
  - host: replica-ng-2.postgres.internal
    region: nigeria
    priority: 2
  - host: replica-gh-1.postgres.internal
    region: ghana
    priority: 1
  - host: replica-ke-1.postgres.internal
    region: kenya
    priority: 1

# Workload Isolation
tiers:
  high_priority:
    services: [customer-portal, claims-service, payments-service]
    max_connections: 300
  medium_priority:
    services: [agent-portal, underwriting-service]
    max_connections: 200
  low_priority:
    services: [analytics-service, reporting-service, batch-processor]
    max_connections: 50
  isolated:
    services: [insurance-radar, fraud-detection]
    max_connections: 100
```

## Key Learnings from OpenAI

1. **Single Primary Can Scale**: With proper optimization, a single primary can handle massive write loads
2. **Read Replicas Are Key**: Offload 90%+ of reads to replicas
3. **Connection Pooling Is Essential**: PgBouncer prevents connection storms
4. **Workload Isolation Prevents Outages**: Noisy neighbors can bring down the entire service
5. **Query Optimization Matters**: A single bad query (12-table join) can cause SEVs
6. **Lazy Writes Smooth Spikes**: Non-critical writes can be batched
7. **Rate Limit Batch Operations**: Backfills should be rate-limited
8. **Hot Standby for HA**: Automatic failover minimizes downtime

## Monitoring Metrics

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Query latency (p99) | <100ms | >200ms |
| Replication lag | <1s | >5s |
| Connection utilization | <80% | >90% |
| Slow queries/min | <10 | >50 |
| Failed health checks | 0 | >2 |

## References

- [OpenAI: Scaling PostgreSQL to power 800 million ChatGPT users](https://openai.com/index/scaling-postgresql/)
- [The Part of PostgreSQL We Hate the Most](https://ottertune.com/blog/the-part-of-postgresql-we-hate-the-most/)
- [PgBouncer Documentation](https://www.pgbouncer.org/config.html)
