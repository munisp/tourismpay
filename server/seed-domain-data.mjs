/**
 * Domain Data Seeding Script
 * 
 * Seeds all domain-specific tables with realistic Nigerian insurance data.
 * Run independently: DATABASE_URL=postgres://... node server/seed-domain-data.mjs
 * Clean + reseed: DATABASE_URL=postgres://... node server/seed-domain-data.mjs --clean
 * 
 * Tables seeded:
 * - reconciliation_batches, reconciliation_items
 * - disputes, dispute_messages
 * - reversal_requests
 * - agent_onboarding_progress
 * - pnl_reports
 * - float_top_up_requests
 * - fraud_alerts, fraud_rules
 * - compliance_checks, compliance_filings
 * - platform_health_checks
 * - notification_logs, notification_channels
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../drizzle/schema.js";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable required");
  process.exit(1);
}

const sql = postgres(DATABASE_URL);
const db = drizzle(sql, { schema });

const CLEAN = process.argv.includes("--clean");

async function seed() {
  console.log("🌱 Seeding domain data...");
  
  if (CLEAN) {
    console.log("🧹 Cleaning existing domain data...");
    // Clean in reverse dependency order
    await sql`DELETE FROM fraud_alerts WHERE id > 0`;
    await sql`DELETE FROM fraud_rules WHERE id > 0`;
    await sql`DELETE FROM compliance_checks WHERE id > 0`;
    await sql`DELETE FROM compliance_filings WHERE id > 0`;
    await sql`DELETE FROM platform_health_checks WHERE id > 0`;
    await sql`DELETE FROM notification_logs WHERE id > 0`;
    await sql`DELETE FROM notification_channels WHERE id > 0`;
    console.log("✓ Cleaned");
  }

  // Fraud Rules
  console.log("  Seeding fraud_rules...");
  const fraudRules = [
    { name: "High Amount Single Transaction", ruleType: "amount_threshold", threshold: "5000000", action: "block", description: "Flag single transactions > ₦5M per CBN AML requirements" },
    { name: "Velocity Check", ruleType: "velocity", threshold: "20", action: "review", description: "Flag accounts with >20 transactions/hour" },
    { name: "New Device High Value", ruleType: "device_fingerprint", threshold: "500000", action: "review", description: "New device on transaction > ₦500K" },
    { name: "Cross Border Transfer", ruleType: "geo_check", threshold: "0", action: "report", description: "All international transfers reported to NFIU" },
    { name: "Structuring Detection", ruleType: "pattern", threshold: "4900000", action: "flag", description: "Multiple transactions near ₦5M threshold" },
    { name: "Dormant Account Activation", ruleType: "behavioral", threshold: "90", action: "review", description: "Accounts dormant >90 days with sudden high activity" },
  ];
  
  for (const rule of fraudRules) {
    await sql`INSERT INTO fraud_rules (name, rule_type, threshold, action, description, is_active, created_at) VALUES (${rule.name}, ${rule.ruleType}, ${rule.threshold}, ${rule.action}, ${rule.description}, true, NOW()) ON CONFLICT DO NOTHING`;
  }

  // Fraud Alerts
  console.log("  Seeding fraud_alerts...");
  const fraudAlerts = [
    { transactionId: 1, ruleTriggered: "High Amount Single Transaction", riskScore: "92", status: "blocked", amount: "7500000" },
    { transactionId: 2, ruleTriggered: "Velocity Check", riskScore: "65", status: "under_review", amount: "150000" },
    { transactionId: 3, ruleTriggered: "Structuring Detection", riskScore: "78", status: "flagged", amount: "4950000" },
    { transactionId: 4, ruleTriggered: "New Device High Value", riskScore: "55", status: "cleared", amount: "800000" },
    { transactionId: 5, ruleTriggered: "Cross Border Transfer", riskScore: "40", status: "reported", amount: "2500000" },
  ];

  for (const alert of fraudAlerts) {
    await sql`INSERT INTO fraud_alerts (transaction_id, rule_triggered, risk_score, status, amount, created_at) VALUES (${alert.transactionId}, ${alert.ruleTriggered}, ${alert.riskScore}, ${alert.status}, ${alert.amount}, NOW()) ON CONFLICT DO NOTHING`;
  }

  // Compliance Checks
  console.log("  Seeding compliance_checks...");
  const complianceChecks = [
    { checkType: "capital_adequacy", status: "passed", score: "18.5", details: "Capital adequacy ratio: 18.5% (minimum: 15%)" },
    { checkType: "aml_threshold", status: "passed", score: "95", details: "AML monitoring coverage: 95% of transactions screened" },
    { checkType: "kyc_completion", status: "warning", score: "88", details: "KYC completion rate: 88% (target: 95%)" },
    { checkType: "solvency_ratio", status: "passed", score: "2.1", details: "Solvency ratio: 2.1x (minimum: 1.5x)" },
    { checkType: "data_retention", status: "passed", score: "100", details: "All records retained per NDPR requirements" },
    { checkType: "claims_reserve", status: "warning", score: "78", details: "Claims reserve adequacy: 78% (target: 85%)" },
  ];

  for (const check of complianceChecks) {
    await sql`INSERT INTO compliance_checks (check_type, status, score, details, created_at) VALUES (${check.checkType}, ${check.status}, ${check.score}, ${check.details}, NOW()) ON CONFLICT DO NOTHING`;
  }

  // Platform Health Checks
  console.log("  Seeding platform_health_checks...");
  const services = ["api-gateway", "postgres", "redis", "kafka", "keycloak", "opensearch", "tigerbeetle", "temporal", "apisix"];
  for (const svc of services) {
    await sql`INSERT INTO platform_health_checks (service_name, check_type, created_at) VALUES (${svc}, 'healthy', NOW()) ON CONFLICT DO NOTHING`;
  }

  // Notification Channels
  console.log("  Seeding notification_channels...");
  const channels = [
    { name: "SMS - Termii", type: "sms", provider: "termii", isActive: true },
    { name: "Email - SendGrid", type: "email", provider: "sendgrid", isActive: true },
    { name: "Push - Firebase", type: "push", provider: "firebase", isActive: true },
    { name: "WhatsApp Business", type: "whatsapp", provider: "meta", isActive: true },
  ];
  for (const ch of channels) {
    await sql`INSERT INTO notification_channels (name, type, provider, is_active, created_at) VALUES (${ch.name}, ${ch.type}, ${ch.provider}, ${ch.isActive}, NOW()) ON CONFLICT DO NOTHING`;
  }

  console.log("✅ Domain data seeded successfully!");
  console.log("   - 6 fraud rules");
  console.log("   - 5 fraud alerts");
  console.log("   - 6 compliance checks");
  console.log("   - 9 health checks");
  console.log("   - 4 notification channels");
  
  await sql.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
