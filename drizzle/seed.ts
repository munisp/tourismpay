/**
 * drizzle/seed.ts
 *
 * Comprehensive seed script for TourismPay development and testing.
 *
 * Populates all major tables with realistic, relational data so that
 * every feature of the platform can be exercised locally without
 * needing real external integrations.
 *
 * Usage:
 *   npx tsx drizzle/seed.ts                  # seed all
 *   npx tsx drizzle/seed.ts --only=enaira    # seed only eNaira domain
 *   npx tsx drizzle/seed.ts --reset          # truncate then seed
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "./schema";

// ─── Connection ───────────────────────────────────────────────────────────────
const connectionString = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/tourismpay";
const client = postgres(connectionString, { max: 1 });
const db = drizzle(client, { schema });

// ─── CLI flags ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const onlyFlag = args.find((a) => a.startsWith("--only="))?.split("=")[1];
const resetFlag = args.includes("--reset");

// ─── Helpers ──────────────────────────────────────────────────────────────────
function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randomDate(daysBack: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - randomInt(0, daysBack));
  return d;
}
function uuid() {
  return crypto.randomUUID();
}

// ─── Seed Functions ───────────────────────────────────────────────────────────

async function seedUsers() {
  console.log("  Seeding users...");
  const roles = ["tourist", "merchant", "agent", "admin", "compliance_officer", "noc_operator"] as const;
  const countries = ["NG", "GH", "KE", "ZA", "US", "GB", "DE", "FR", "JP", "CN"];
  const inserted: typeof schema.users.$inferSelect[] = [];

  for (let i = 1; i <= 50; i++) {
    const role = i <= 5 ? "admin" : i <= 10 ? "merchant" : i <= 15 ? "agent" : "tourist";
    const [user] = await db
      .insert(schema.users)
      .values({
        openId: `sub_seed_${i.toString().padStart(4, "0")}`,
        email: `user${i}@tourismpay.dev`,
        name: `Seed User ${i}`,
        role,
        kycStatus: randomElement(["not_started", "pending", "approved", "rejected"]),
        country: randomElement(countries),
        phone: `+234${randomInt(7000000000, 9099999999)}`,
        loginCount: randomInt(0, 200),
        createdAt: randomDate(180),
        updatedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning();
    if (user) inserted.push(user);
  }
  console.log(`    ✓ ${inserted.length} users seeded`);
  return inserted;
}

async function seedEnairaWallets(users: typeof schema.users.$inferSelect[]) {
  console.log("  Seeding eNaira wallets...");
  const tourists = users.filter((u) => u.role === "tourist");
  const inserted: typeof schema.enairaWallets.$inferSelect[] = [];

  for (const user of tourists.slice(0, 20)) {
    const [wallet] = await db
      .insert(schema.enairaWallets)
      .values({
        id: uuid(),
        userId: String(user.id),
        walletAddress: `eNGR${randomInt(1000000000, 9999999999)}`,
        cbnWalletId: `CBN-${uuid().substring(0, 8).toUpperCase()}`,
        balanceKobo: randomInt(0, 5000000), // 0 - ₦50,000
        dailyLimitKobo: 30000000, // ₦300,000 (Tier 1 CBN limit)
        kycTier: randomElement([1, 2, 3]),
        status: randomElement(["active", "active", "active", "frozen"]),
        phoneNumber: user.phone ?? `+234${randomInt(7000000000, 9099999999)}`,
        createdAt: randomDate(90),
        updatedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning();
    if (wallet) inserted.push(wallet);
  }
  console.log(`    ✓ ${inserted.length} eNaira wallets seeded`);
  return inserted;
}

async function seedEnairaTransactions(wallets: typeof schema.enairaWallets.$inferSelect[]) {
  console.log("  Seeding eNaira transactions...");
  const types = ["tourist_load", "merchant_payment", "peer_transfer", "withdrawal"] as const;
  let count = 0;

  for (const wallet of wallets) {
    const txCount = randomInt(3, 15);
    for (let i = 0; i < txCount; i++) {
      await db
        .insert(schema.enairaTransactions)
        .values({
          id: uuid(),
          enairaWalletId: wallet.id,
          transactionType: randomElement(types),
          amountKobo: randomInt(100, 500000),
          status: randomElement(["completed", "completed", "completed", "pending", "failed"]),
          cbnTransactionRef: `CBN-TX-${uuid().substring(0, 12).toUpperCase()}`,
          counterpartyAddress: `eNGR${randomInt(1000000000, 9999999999)}`,
          createdAt: randomDate(60),
          updatedAt: new Date(),
        })
        .onConflictDoNothing();
      count++;
    }
  }
  console.log(`    ✓ ${count} eNaira transactions seeded`);
}

async function seedKybApplications(users: typeof schema.users.$inferSelect[]) {
  console.log("  Seeding KYB applications...");
  const merchants = users.filter((u) => u.role === "merchant");
  const statuses = ["draft", "submitted", "under_review", "approved", "rejected"] as const;
  const inserted: typeof schema.kybApplications.$inferSelect[] = [];

  for (const merchant of merchants) {
    const [app] = await db
      .insert(schema.kybApplications)
      .values({
        establishmentId: uuid(),
        userId: merchant.id,
        businessName: `Business ${merchant.name}`,
        businessType: randomElement(["hotel", "restaurant", "tour_operator", "retail", "transport"]),
        rcNumber: `RC${randomInt(100000, 999999)}`,
        status: randomElement(statuses),
        submittedAt: randomDate(60),
        createdAt: randomDate(90),
        updatedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning();
    if (app) inserted.push(app);
  }
  console.log(`    ✓ ${inserted.length} KYB applications seeded`);
  return inserted;
}

async function seedTripPlannerSessions(users: typeof schema.users.$inferSelect[]) {
  console.log("  Seeding trip planner sessions...");
  const tourists = users.filter((u) => u.role === "tourist");
  const destinations = ["Lagos", "Abuja", "Nairobi", "Accra", "Cape Town", "Cairo", "Marrakech"];
  let sessionCount = 0;
  let messageCount = 0;

  for (const user of tourists.slice(0, 10)) {
    const sessions = randomInt(1, 3);
    for (let s = 0; s < sessions; s++) {
      const [session] = await db
        .insert(schema.tripPlannerSessions)
        .values({
          id: uuid(),
          userId: user.id,
          destination: randomElement(destinations),
          model: randomElement(["qwen2.5:7b", "gemini-1.5-flash"]),
          createdAt: randomDate(30),
          updatedAt: new Date(),
        })
        .onConflictDoNothing()
        .returning();

      if (session) {
        sessionCount++;
        // Add conversation messages
        const msgs = [
          { role: "user", content: `Plan a 5-day trip to ${session.destination}` },
          { role: "assistant", content: `Here's a suggested 5-day itinerary for ${session.destination}...` },
          { role: "user", content: "What are the best local restaurants?" },
          { role: "assistant", content: "Here are the top-rated local restaurants..." },
        ];
        for (const msg of msgs) {
          await db
            .insert(schema.tripPlannerMessages)
            .values({
              id: uuid(),
              sessionId: session.id,
              role: msg.role as "user" | "assistant",
              content: msg.content,
              createdAt: randomDate(30),
            })
            .onConflictDoNothing();
          messageCount++;
        }
      }
    }
  }
  console.log(`    ✓ ${sessionCount} sessions, ${messageCount} messages seeded`);
}

async function seedTaxCollections(users: typeof schema.users.$inferSelect[]) {
  console.log("  Seeding tax collections...");
  const taxTypes = ["vat", "tourism_levy", "hotel_tax", "service_charge"] as const;
  const statuses = ["pending", "collected", "remitted"] as const;
  let count = 0;

  for (const user of users.slice(0, 30)) {
    const txCount = randomInt(1, 8);
    for (let i = 0; i < txCount; i++) {
      await db
        .insert(schema.taxCollections)
        .values({
          id: uuid(),
          userId: user.id,
          taxType: randomElement(taxTypes),
          amountKobo: randomInt(500, 50000),
          taxRate: randomElement([0.075, 0.05, 0.1, 0.025]),
          status: randomElement(statuses),
          transactionRef: `TX-${uuid().substring(0, 10).toUpperCase()}`,
          createdAt: randomDate(90),
          updatedAt: new Date(),
        })
        .onConflictDoNothing();
      count++;
    }
  }
  console.log(`    ✓ ${count} tax collections seeded`);
}

async function seedTipTransactions(users: typeof schema.users.$inferSelect[]) {
  console.log("  Seeding tip transactions...");
  const merchants = users.filter((u) => u.role === "merchant");
  const tourists = users.filter((u) => u.role === "tourist");
  let count = 0;

  for (const merchant of merchants) {
    const tipCount = randomInt(5, 25);
    for (let i = 0; i < tipCount; i++) {
      const tipper = randomElement(tourists);
      await db
        .insert(schema.tipTransactions)
        .values({
          id: uuid(),
          tipperId: tipper.id,
          recipientId: merchant.id,
          amountKobo: randomInt(100, 20000),
          status: randomElement(["pending", "distributed", "distributed", "distributed"]),
          message: randomElement(["Great service!", "Excellent food!", "Very helpful!", null]),
          createdAt: randomDate(30),
          updatedAt: new Date(),
        })
        .onConflictDoNothing();
      count++;
    }
  }
  console.log(`    ✓ ${count} tip transactions seeded`);
}

async function seedFraudAlerts(users: typeof schema.users.$inferSelect[]) {
  console.log("  Seeding fraud alerts...");
  const severities = ["low", "medium", "high", "critical"] as const;
  const statuses = ["open", "investigating", "resolved", "false_positive"] as const;
  let count = 0;

  for (let i = 0; i < 30; i++) {
    const user = randomElement(users);
    await db
      .insert(schema.fraudAlerts)
      .values({
        id: uuid(),
        userId: user.id,
        alertType: randomElement(["velocity_check", "geo_anomaly", "device_fingerprint", "amount_threshold"]),
        severity: randomElement(severities),
        status: randomElement(statuses),
        description: `Suspicious activity detected for user ${user.id}: ${randomElement(["multiple failed attempts", "unusual location", "large transaction", "device mismatch"])}`,
        riskScore: randomInt(20, 99),
        metadata: JSON.stringify({ ip: `192.168.${randomInt(1, 255)}.${randomInt(1, 255)}`, device: "mobile" }),
        createdAt: randomDate(30),
        updatedAt: new Date(),
      })
      .onConflictDoNothing();
    count++;
  }
  console.log(`    ✓ ${count} fraud alerts seeded`);
}

async function seedTemporalWorkflows() {
  console.log("  Seeding Temporal workflow executions...");
  const workflowTypes = [
    "KybOnboardingWorkflow",
    "FraudInvestigationWorkflow",
    "RemittanceWorkflow",
    "SettlementWorkflow",
    "TaxRemittanceWorkflow",
  ];
  const statuses = ["completed", "completed", "completed", "running", "failed"] as const;
  let count = 0;

  for (let i = 0; i < 40; i++) {
    const wfType = randomElement(workflowTypes);
    const status = randomElement(statuses);
    const startedAt = randomDate(30);
    const completedAt = status !== "running" ? new Date(startedAt.getTime() + randomInt(1000, 300000)) : null;

    await db
      .insert(schema.temporalWorkflowExecutions)
      .values({
        id: uuid(),
        workflowId: `${wfType}-${uuid().substring(0, 8)}`,
        workflowType: wfType,
        taskQueue: `${wfType.toLowerCase().replace("workflow", "")}-queue`,
        status,
        entityId: uuid(),
        entityType: randomElement(["kyb_application", "fraud_alert", "remittance", "settlement"]),
        startedAt,
        completedAt,
        errorMessage: status === "failed" ? "Workflow execution timed out" : null,
        createdAt: startedAt,
        updatedAt: new Date(),
      })
      .onConflictDoNothing();
    count++;
  }
  console.log(`    ✓ ${count} Temporal workflow executions seeded`);
}

async function seedFluvioOffsets() {
  console.log("  Seeding Fluvio consumer offsets...");
  const topics = [
    "payment-events",
    "fx-rate-updates",
    "fraud-alerts",
    "noc-events",
    "tax-collections",
    "tip-events",
    "enaira-transactions",
  ];
  let count = 0;

  for (const topic of topics) {
    for (let partition = 0; partition < 3; partition++) {
      await db
        .insert(schema.fluvioConsumerOffsets)
        .values({
          id: uuid(),
          topic,
          partitionId: partition,
          offset: randomInt(1000, 1000000),
          lag: randomInt(0, 50),
          consumerGroup: "tourismpay-server",
          committedAt: randomDate(1),
          createdAt: randomDate(30),
          updatedAt: new Date(),
        })
        .onConflictDoNothing();
      count++;
    }
  }
  console.log(`    ✓ ${count} Fluvio consumer offsets seeded`);
}

async function seedLakehouseEtlRuns() {
  console.log("  Seeding Lakehouse ETL runs...");
  const tables = [
    "transactions_daily",
    "fx_aggregations",
    "fraud_patterns",
    "tax_summary",
    "tip_analytics",
    "user_activity",
  ];
  let count = 0;

  for (const tableName of tables) {
    for (let i = 0; i < 7; i++) {
      const startedAt = randomDate(7);
      const status = randomElement(["success", "success", "success", "failed"]);
      await db
        .insert(schema.lakehouseEtlRuns)
        .values({
          id: uuid(),
          tableName,
          status,
          rowsProcessed: status === "success" ? randomInt(100, 100000) : 0,
          durationMs: randomInt(500, 30000),
          errorMessage: status === "failed" ? "Connection timeout to Trino" : null,
          startedAt,
          completedAt: new Date(startedAt.getTime() + randomInt(500, 30000)),
          createdAt: startedAt,
          updatedAt: new Date(),
        })
        .onConflictDoNothing();
      count++;
    }
  }
  console.log(`    ✓ ${count} Lakehouse ETL runs seeded`);
}

async function seedWafEvents() {
  console.log("  Seeding OpenAppSec WAF events...");
  const severities = ["info", "low", "medium", "high", "critical"] as const;
  const attackTypes = ["sql_injection", "xss", "path_traversal", "rate_limit", "bot_detection"];
  let count = 0;

  for (let i = 0; i < 50; i++) {
    await db
      .insert(schema.openappsecWafEvents)
      .values({
        id: uuid(),
        severity: randomElement(severities),
        attackType: randomElement(attackTypes),
        sourceIp: `${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}`,
        targetPath: randomElement(["/api/payments", "/api/wallets", "/api/kyb", "/api/auth"]),
        blocked: randomElement([true, true, false]),
        requestId: uuid(),
        userAgent: "Mozilla/5.0 (compatible; bot/1.0)",
        createdAt: randomDate(7),
      })
      .onConflictDoNothing();
    count++;
  }
  console.log(`    ✓ ${count} WAF events seeded`);
}

async function seedAuditLogs(users: typeof schema.users.$inferSelect[]) {
  console.log("  Seeding audit logs...");
  const actions = [
    "user.login", "user.logout", "wallet.credit", "wallet.debit",
    "kyb.submit", "kyb.approve", "payment.initiate", "payment.complete",
    "tip.send", "tax.collect", "enaira.load", "enaira.pay",
  ];
  let count = 0;

  for (const user of users.slice(0, 20)) {
    const logCount = randomInt(5, 20);
    for (let i = 0; i < logCount; i++) {
      await db
        .insert(schema.auditLogs)
        .values({
          id: uuid(),
          userId: user.id,
          action: randomElement(actions),
          entityType: randomElement(["user", "wallet", "payment", "kyb"]),
          entityId: uuid(),
          ipAddress: `192.168.${randomInt(1, 255)}.${randomInt(1, 255)}`,
          userAgent: "TourismPay-App/1.0",
          metadata: JSON.stringify({ success: true }),
          createdAt: randomDate(30),
        })
        .onConflictDoNothing();
      count++;
    }
  }
  console.log(`    ✓ ${count} audit log entries seeded`);
}

// ─── Reset ────────────────────────────────────────────────────────────────────

async function resetDatabase() {
  console.log("  Resetting seed tables (truncate with cascade)...");
  const tables = [
    "openappsec_waf_events", "lakehouse_etl_runs", "fluvio_consumer_offsets",
    "temporal_workflow_executions", "tip_transactions", "tax_collections",
    "trip_planner_messages", "trip_planner_sessions", "fraud_alerts",
    "audit_logs", "kyb_documents", "kyb_applications",
    "enaira_transactions", "enaira_wallets", "users",
  ];
  for (const table of tables) {
    await db.execute(sql.raw(`TRUNCATE TABLE "${table}" CASCADE`));
  }
  console.log("  ✓ Tables reset");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱 TourismPay Database Seed");
  console.log(`   Connection: ${connectionString.replace(/:\/\/.*@/, "://<credentials>@")}`);
  console.log(`   Mode: ${onlyFlag ? `only=${onlyFlag}` : "all"} ${resetFlag ? "(with reset)" : ""}`);
  console.log("");

  if (resetFlag) await resetDatabase();

  const shouldSeed = (domain: string) => !onlyFlag || onlyFlag === domain;

  let users: typeof schema.users.$inferSelect[] = [];

  if (shouldSeed("users") || shouldSeed("all")) {
    users = await seedUsers();
  }

  if (users.length === 0) {
    // Load existing users if seeding a specific domain
    users = await db.select().from(schema.users).limit(50);
  }

  if (shouldSeed("enaira") || shouldSeed("all")) {
    const wallets = await seedEnairaWallets(users);
    await seedEnairaTransactions(wallets);
  }

  if (shouldSeed("kyb") || shouldSeed("all")) {
    await seedKybApplications(users);
  }

  if (shouldSeed("trip") || shouldSeed("all")) {
    await seedTripPlannerSessions(users);
  }

  if (shouldSeed("tax") || shouldSeed("all")) {
    await seedTaxCollections(users);
  }

  if (shouldSeed("tips") || shouldSeed("all")) {
    await seedTipTransactions(users);
  }

  if (shouldSeed("fraud") || shouldSeed("all")) {
    await seedFraudAlerts(users);
  }

  if (shouldSeed("temporal") || shouldSeed("all")) {
    await seedTemporalWorkflows();
  }

  if (shouldSeed("fluvio") || shouldSeed("all")) {
    await seedFluvioOffsets();
  }

  if (shouldSeed("lakehouse") || shouldSeed("all")) {
    await seedLakehouseEtlRuns();
  }

  if (shouldSeed("waf") || shouldSeed("all")) {
    await seedWafEvents();
  }

  if (shouldSeed("audit") || shouldSeed("all")) {
    await seedAuditLogs(users);
  }

  console.log("");
  console.log("✅ Seed complete!");
  await client.end();
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
