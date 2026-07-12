# TourismPay: Drizzle ORM Enhancements & Middleware Monitoring Report

**Author:** Manus AI  
**Date:** July 12, 2026  

This report details the comprehensive implementation of the Prometheus/Grafana monitoring suite for the newly deployed eNaira Gateway and Permify ReBAC systems, alongside a massive overhaul of the Drizzle ORM database layer to achieve production-grade type safety, performance, and developer experience.

---

## 1. Middleware Monitoring & Observability

### 1.1 Prometheus Alert Rules
I implemented comprehensive alert rules (`infra/prometheus/rules/tourismpay-alerts.yml`) covering both infrastructure and business logic:
- **eNaira Gateway Alerts:** 
  - `eNairaHighFailureRate`: Triggers if the payment failure rate exceeds 5% over 5 minutes.
  - `eNairaCBNLatencyHigh`: Triggers if the 95th percentile latency to the CBN API exceeds 2 seconds.
  - `eNairaWalletBalanceLow`: Critical alert if the hot wallet float drops below ₦500,000.
  - `eNairaWebhookQueueBackup`: Triggers if asynchronous webhook processing lags.
- **Permify ReBAC Alerts:**
  - `PermifyHighDenialRate`: Triggers if authorization denial rate spikes above 10%, indicating a potential misconfiguration or credential stuffing attack.
  - `PermifyEvaluationLatency`: Triggers if P99 evaluation latency exceeds 50ms.
  - `PermifyCacheHitRateLow`: Triggers if the check cache hit rate drops below 80%.

### 1.2 Grafana Dashboards
Two detailed Grafana dashboards were provisioned as code:
1. **eNaira Gateway Dashboard (`enaira-gateway.json`):** Tracks transaction volume (Kobo/sec), success/failure rates, CBN API latency histograms, wallet creation velocity, and active hot wallet balances.
2. **Permify ReBAC Dashboard (`permify-rebac.json`):** Visualizes authorization checks per second, allow/deny ratios, evaluation latency percentiles, and schema version consistency across nodes.

---

## 2. Drizzle ORM Schema Improvements

The schema audit revealed significant gaps: 76 tables were missing TypeScript type exports, 0 Drizzle relations were defined, and raw SQL was heavily used.

### 2.1 Type Safety & Relations
I created `drizzle/schema-improvements.ts` which acts as a barrel file to export the enhanced schema:
- **76 Missing Type Exports:** Added `$inferSelect` and `$inferInsert` exports for all previously untyped tables (e.g., `VirtualCard`, `TripPlannerSession`, `FluvioConsumerOffset`).
- **Drizzle Relations:** Defined explicit `relations()` for all major entities. This allows developers to use Drizzle's relational queries (e.g., `db.query.users.findFirst({ with: { enairaWallets: true } })`) instead of writing raw `JOIN` statements.

### 2.2 PostgreSQL Enums & Check Constraints
Migration `0077_schema_improvements.sql` was created to push business logic down to the database level:
- **12 New Enums:** Replaced raw `text` columns with strict PostgreSQL enums (e.g., `enaira_wallet_status`, `temporal_workflow_status`, `fluvio_offset_status`).
- **11 Check Constraints:** Added critical constraints such as `chk_enaira_wallet_balance_non_negative` and `chk_tip_amount_positive` to prevent invalid states even if the application layer fails.

### 2.3 Performance Indexing
The migration also includes 22 new composite and partial indexes optimized for the specific query patterns observed in the codebase:
- **Composite Indexes:** E.g., `(enaira_wallet_id, created_at DESC)` for transaction history.
- **Partial Indexes:** E.g., `WHERE status = 'active'` for active wallets, significantly reducing index size and improving hot-path query performance.
- **Full-Text Search:** Added GIN indexes using `to_tsvector` for Trip Planner messages and Audit Logs.

---

## 3. Typed Repository Layer

To eliminate the scattered, untyped raw SQL queries, I built a comprehensive Repository Pattern layer in `server/db/repositories.ts` (900+ lines).

- **13 Domain Repositories:** Including Users, eNaira Wallets, eNaira Transactions, Trip Planner, Tax Collections, Temporal Workflows, and Fluvio Offsets.
- **Type Safety:** All methods return strictly typed interfaces based on the Drizzle schema.
- **Redis Caching:** Integrated an optional `CacheAdapter` interface, allowing high-read repositories (like `UserRepo.findById` and `EnairaWalletRepo.findByUserId`) to automatically cache results with TTLs and targeted invalidation on updates.

---

## 4. Developer Tooling & Ergonomics

### 4.1 Comprehensive Database Seeding
I wrote a robust, realistic seed script (`drizzle/seed.ts`) that populates the database with interconnected data across all domains:
- Seeds 50 users with realistic roles and KYC statuses.
- Generates eNaira wallets, transactions, KYB applications, Trip Planner sessions, Tax collections, and Tip distributions.
- Includes observability mock data: Temporal workflow executions, Fluvio consumer offsets, Lakehouse ETL runs, and OpenAppSec WAF events.
- Supports domain-specific seeding (e.g., `npx tsx drizzle/seed.ts --only=enaira`).

### 4.2 Production Migration Utilities
I created a production-safe migration runner (`drizzle/migrate.ts`) that replaces raw `drizzle-kit migrate`:
- **Pre-flight Checks:** Verifies PostgreSQL version, available disk space, and checks for long-running blocking queries before attempting schema changes.
- **Dry-Run Mode:** Shows pending migrations without applying them.
- **Verification:** Automatically verifies that all expected tables and critical indexes exist post-migration.
- **Webhooks:** Supports Slack/Teams notifications upon migration success or failure.

### 4.3 Drizzle Configuration
Updated `drizzle.config.ts` to enable:
- **Strict Mode:** Warns developers on missing relations.
- **Breakpoints:** Adds statement breakpoints to SQL migrations to prevent partial failures.
- **Drizzle Studio:** Added the `npm run db:studio` command to launch the local visual schema browser.

---

## Conclusion

The platform now possesses a highly robust, type-safe data layer that pushes constraints down to the database while providing a clean, cached repository interface for the application layer. The addition of the Prometheus/Grafana stack ensures the newly integrated eNaira and Permify services are fully observable in production.
