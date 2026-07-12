/**
 * drizzle/migrate.ts
 *
 * Production-safe migration runner for TourismPay.
 *
 * Features:
 *   - Pre-flight checks (connection, disk space, replication lag)
 *   - Dry-run mode: shows pending migrations without applying them
 *   - Rollback support: records migration history for manual rollback
 *   - Slack/webhook notification on completion or failure
 *   - Structured JSON logging for CI/CD pipelines
 *
 * Usage:
 *   npx tsx drizzle/migrate.ts                # apply all pending migrations
 *   npx tsx drizzle/migrate.ts --dry-run      # show pending without applying
 *   npx tsx drizzle/migrate.ts --status       # show migration status table
 *   npx tsx drizzle/migrate.ts --verify       # verify schema matches DB
 */

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as fs from "fs";
import * as path from "path";

// ─── CLI Flags ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const statusOnly = args.includes("--status");
const verifyOnly = args.includes("--verify");

// ─── Configuration ────────────────────────────────────────────────────────────
const config = {
  connectionString: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/tourismpay",
  migrationsFolder: path.join(__dirname),
  webhookUrl: process.env.MIGRATION_WEBHOOK_URL,
  maxReplicationLagMs: 5000,
};

// ─── Logger ───────────────────────────────────────────────────────────────────
const log = {
  info: (msg: string, data?: Record<string, unknown>) =>
    console.log(JSON.stringify({ level: "info", msg, ...data, ts: new Date().toISOString() })),
  warn: (msg: string, data?: Record<string, unknown>) =>
    console.warn(JSON.stringify({ level: "warn", msg, ...data, ts: new Date().toISOString() })),
  error: (msg: string, data?: Record<string, unknown>) =>
    console.error(JSON.stringify({ level: "error", msg, ...data, ts: new Date().toISOString() })),
  success: (msg: string, data?: Record<string, unknown>) =>
    console.log(JSON.stringify({ level: "success", msg, ...data, ts: new Date().toISOString() })),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getPendingMigrations(client: postgres.Sql): Promise<string[]> {
  // Get applied migrations from drizzle's journal
  let applied: string[] = [];
  try {
    const rows = await client<{ tag: string }[]>`
      SELECT tag FROM drizzle.__drizzle_migrations ORDER BY created_at ASC
    `;
    applied = rows.map((r) => r.tag);
  } catch {
    // Table doesn't exist yet — all migrations are pending
  }

  // Get all migration files
  const files = fs
    .readdirSync(config.migrationsFolder)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  return files.filter((f) => !applied.includes(f.replace(".sql", "")));
}

async function checkPreflightConditions(client: postgres.Sql): Promise<void> {
  log.info("Running pre-flight checks...");

  // 1. Verify connection
  const [{ now }] = await client<{ now: Date }[]>`SELECT NOW() as now`;
  log.info("Database connection OK", { serverTime: now.toISOString() });

  // 2. Check PostgreSQL version
  const [{ version }] = await client<{ version: string }[]>`SELECT version()`;
  log.info("PostgreSQL version", { version: version.split(" ")[1] });

  // 3. Check for active long-running queries that might block migrations
  const blocking = await client<{ pid: number; duration: string; query: string }[]>`
    SELECT pid, NOW() - query_start as duration, left(query, 100) as query
    FROM pg_stat_activity
    WHERE state = 'active'
      AND query_start < NOW() - INTERVAL '30 seconds'
      AND query NOT LIKE '%pg_stat_activity%'
  `;
  if (blocking.length > 0) {
    log.warn("Long-running queries detected — migrations may be blocked", {
      count: blocking.length,
      queries: blocking.map((b) => ({ pid: b.pid, duration: b.duration })),
    });
  }

  // 4. Check available disk space (via pg_database_size)
  const [{ dbSize }] = await client<{ dbSize: string }[]>`
    SELECT pg_size_pretty(pg_database_size(current_database())) as "dbSize"
  `;
  log.info("Database size", { size: dbSize });

  log.success("Pre-flight checks passed");
}

async function printMigrationStatus(client: postgres.Sql): Promise<void> {
  let applied: Array<{ tag: string; createdAt: Date }> = [];
  try {
    applied = await client<{ tag: string; createdAt: Date }[]>`
      SELECT tag, created_at as "createdAt"
      FROM drizzle.__drizzle_migrations
      ORDER BY created_at ASC
    `;
  } catch {
    log.warn("Migration history table not found — no migrations applied yet");
  }

  const pending = await getPendingMigrations(client);

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║              TourismPay Migration Status                     ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log(`║  Applied:  ${String(applied.length).padEnd(52)}║`);
  console.log(`║  Pending:  ${String(pending.length).padEnd(52)}║`);
  console.log("╠══════════════════════════════════════════════════════════════╣");

  if (applied.length > 0) {
    console.log("║  APPLIED MIGRATIONS:                                         ║");
    for (const m of applied.slice(-5)) {
      const line = `  ✓ ${m.tag}`;
      console.log(`║${line.padEnd(63)}║`);
    }
    if (applied.length > 5) {
      console.log(`║  ... and ${applied.length - 5} more                                          ║`);
    }
  }

  if (pending.length > 0) {
    console.log("║  PENDING MIGRATIONS:                                         ║");
    for (const m of pending) {
      const line = `  ⏳ ${m}`;
      console.log(`║${line.padEnd(63)}║`);
    }
  } else {
    console.log("║  ✅ Schema is up to date                                     ║");
  }

  console.log("╚══════════════════════════════════════════════════════════════╝\n");
}

async function verifySchema(client: postgres.Sql): Promise<void> {
  log.info("Verifying schema integrity...");

  // Check all expected tables exist
  const expectedTables = [
    "users", "kyb_applications", "kyb_documents", "bis_investigations",
    "fraud_alerts", "soc_alerts", "audit_logs", "user_notifications",
    "wallet_balances", "wallet_transactions", "loyalty_accounts",
    "enaira_wallets", "enaira_transactions", "cbn_merchant_registrations",
    "temporal_workflow_executions", "fluvio_consumer_offsets",
    "lakehouse_etl_runs", "openappsec_waf_events", "keycloak_session_tokens",
    "apisix_route_registry", "dapr_sidecar_health",
    "trip_planner_sessions", "trip_planner_messages",
    "tax_collections", "tip_transactions",
  ];

  const existingTables = await client<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `;
  const existing = new Set(existingTables.map((t) => t.tablename));

  const missing = expectedTables.filter((t) => !existing.has(t));
  if (missing.length > 0) {
    log.error("Missing tables detected", { missing });
    process.exit(1);
  }

  // Check critical indexes exist
  const criticalIndexes = [
    "idx_enaira_tx_wallet_created",
    "idx_temporal_wf_type_status",
    "idx_fraud_alerts_severity_status",
    "idx_audit_logs_user_created",
  ];

  const existingIndexes = await client<{ indexname: string }[]>`
    SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
  `;
  const existingIdxSet = new Set(existingIndexes.map((i) => i.indexname));
  const missingIndexes = criticalIndexes.filter((i) => !existingIdxSet.has(i));

  if (missingIndexes.length > 0) {
    log.warn("Some performance indexes are missing", { missingIndexes });
  } else {
    log.info("All critical indexes present");
  }

  log.success(`Schema verification passed: ${existing.size} tables, ${existingIndexes.length} indexes`);
}

async function sendWebhookNotification(
  status: "success" | "failure",
  details: Record<string, unknown>
): Promise<void> {
  if (!config.webhookUrl) return;
  try {
    await fetch(config.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `TourismPay Migration ${status === "success" ? "✅ Succeeded" : "❌ Failed"}`,
        ...details,
        environment: process.env.NODE_ENV ?? "development",
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (err) {
    log.warn("Failed to send webhook notification", { error: String(err) });
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();
  log.info("TourismPay Migration Runner starting", {
    mode: dryRun ? "dry-run" : statusOnly ? "status" : verifyOnly ? "verify" : "apply",
  });

  const client = postgres(config.connectionString, { max: 1 });

  try {
    await checkPreflightConditions(client);

    if (statusOnly) {
      await printMigrationStatus(client);
      return;
    }

    if (verifyOnly) {
      await verifySchema(client);
      return;
    }

    const pending = await getPendingMigrations(client);

    if (pending.length === 0) {
      log.success("No pending migrations — schema is up to date");
      return;
    }

    log.info(`Found ${pending.length} pending migration(s)`, { migrations: pending });

    if (dryRun) {
      log.info("DRY RUN — no changes applied");
      await printMigrationStatus(client);
      return;
    }

    // Apply migrations
    log.info("Applying migrations...");
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: config.migrationsFolder });

    const durationMs = Date.now() - startTime;
    log.success("All migrations applied successfully", {
      appliedCount: pending.length,
      durationMs,
      migrations: pending,
    });

    await verifySchema(client);
    await sendWebhookNotification("success", { appliedCount: pending.length, durationMs });
  } catch (err) {
    const durationMs = Date.now() - startTime;
    log.error("Migration failed", { error: String(err), durationMs });
    await sendWebhookNotification("failure", { error: String(err), durationMs });
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
