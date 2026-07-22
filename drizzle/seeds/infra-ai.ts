import { sql } from "drizzle-orm";
import crypto from "crypto";

function uuid() { return crypto.randomUUID(); }
function randomInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randomDate(daysBack: number) {
  const d = new Date();
  d.setDate(d.getDate() - randomInt(0, daysBack));
  return d;
}
function randomElement<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

export async function seedInfrastructureAndAi(db: any, schema: any, users: any[]) {
  console.log("  Seeding Infrastructure (WAF, ETL, Temporal, Fluvio)...");
  
  // WAF Events
  const severities = ["info", "low", "medium", "high", "critical"] as const;
  const attackTypes = ["sql_injection", "xss", "path_traversal", "rate_limit", "bot_detection"];
  
  for (let i = 0; i < 50; i++) {
    await db.insert(schema.openappsecWafEvents).values({
      id: uuid(),
      severity: randomElement(severities),
      attackType: randomElement(attackTypes),
      sourceIp: `${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}`,
      targetPath: randomElement(["/api/payments", "/api/wallets", "/api/kyb", "/api/auth"]),
      blocked: randomElement([true, true, false]),
      requestId: uuid(),
      userAgent: "Mozilla/5.0 (compatible; bot/1.0)",
      createdAt: randomDate(7),
    }).onConflictDoNothing();
  }
  
  // Temporal Workflows
  const workflows = ["ProcessSettlement", "KYBVerification", "FraudInvestigation", "TaxRemittance"];
  for (let i = 0; i < 30; i++) {
    await db.insert(schema.temporalWorkflowExecutions).values({
      workflowId: `wf-${randomElement(workflows)}-${uuid().slice(0, 8)}`,
      runId: uuid(),
      workflowType: randomElement(workflows),
      status: randomElement(["COMPLETED", "COMPLETED", "RUNNING", "FAILED", "TERMINATED"]),
      startTime: randomDate(14),
      closeTime: randomDate(13),
      createdAt: randomDate(14),
    }).onConflictDoNothing();
  }
  
  // Fluvio Offsets
  const topics = ["payments.stream", "fraud.alerts", "audit.logs", "noc.events"];
  for (const topic of topics) {
    await db.insert(schema.fluvioConsumerOffsets).values({
      consumerGroup: `cg-${topic.split('.')[0]}-processor`,
      topic,
      partition: 0,
      offset: randomInt(1000, 50000),
      lastUpdated: randomDate(1),
    }).onConflictDoNothing();
  }
  
  // Lakehouse ETL
  const pipelines = ["tx_daily_agg", "fraud_features", "merchant_metrics", "settlement_recon"];
  for (let i = 0; i < 20; i++) {
    await db.insert(schema.lakehouseEtlRuns).values({
      runId: `etl-${uuid().slice(0, 8)}`,
      pipelineName: randomElement(pipelines),
      status: randomElement(["success", "success", "success", "failed", "running"]),
      recordsProcessed: randomInt(10000, 500000),
      startTime: randomDate(7),
      endTime: randomDate(6),
      createdAt: randomDate(7),
    }).onConflictDoNothing();
  }
  
  // Audit Logs
  const actions = ["user.login", "wallet.credit", "kyb.approve", "payment.initiate", "tip.send", "tax.collect"];
  for (let i = 0; i < 100; i++) {
    await db.insert(schema.auditLogs).values({
      id: uuid(),
      userId: randomElement(users).id,
      action: randomElement(actions),
      entityType: randomElement(["user", "wallet", "payment", "kyb"]),
      entityId: uuid(),
      ipAddress: `192.168.${randomInt(1, 255)}.${randomInt(1, 255)}`,
      userAgent: "TourismPay-App/1.0",
      metadata: JSON.stringify({ success: true }),
      createdAt: randomDate(30),
    }).onConflictDoNothing();
  }
  
  // Dapr State
  await db.insert(schema.daprStateEntries).values([
    { appId: "tourismpay-pwa", stateKey: "system_status", stateValue: JSON.stringify({ maintenance: false }), eTag: "1" },
    { appId: "tourismpay-pwa", stateKey: "active_promotions", stateValue: JSON.stringify({ count: 5 }), eTag: "1" },
  ]).onConflictDoNothing();

  console.log("  ✓ Seeded Infrastructure and System Logs");
}
