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

export async function seedFraudAndCompliance(db: any, schema: any, users: any[], establishments: any[], agents: any[]) {
  console.log("  Seeding Fraud Alerts, Rules, KYB, and Compliance...");
  
  // Seed Fraud Rules
  const rules = [
    { name: "High Velocity", type: "velocity", severity: "high" },
    { name: "Large Transaction", type: "amount", severity: "medium" },
    { name: "Suspicious IP", type: "location", severity: "critical" },
    { name: "Multiple Failed PINs", type: "auth", severity: "high" },
    { name: "New Device Login", type: "device", severity: "low" },
  ];
  
  for (const rule of rules) {
    await db.insert(schema.fraudRules).values({
      name: rule.name,
      ruleType: rule.type,
      description: `Detects ${rule.name.toLowerCase()} patterns`,
      conditions: { threshold: randomInt(5, 100) },
      action: rule.severity === "critical" ? "block" : "flag",
      severity: rule.severity,
      isActive: true,
      createdAt: randomDate(60),
    });
  }
  
  // Seed Fraud Alerts
  let alertCount = 0;
  for (let i = 0; i < 30; i++) {
    const user = randomElement(users);
    const agent = randomElement(agents);
    
    await db.insert(schema.fraudAlerts).values({
      transactionId: `TX-${randomInt(1000, 9999)}`,
      alertId: `FA-${Date.now()}-${i}`,
      userId: user.id,
      agentId: agent.id,
      fraudScore: (randomInt(60, 99) + Math.random()).toFixed(2),
      reason: randomElement(["Velocity exceeded", "Location mismatch", "Amount anomaly", "Known bad IP"]),
      type: randomElement(["velocity", "location", "amount", "device"]),
      status: randomElement(["open", "investigating", "resolved", "false_positive"]),
      riskLevel: randomElement(["medium", "high", "critical"]),
      amount: randomInt(10000, 500000).toFixed(2),
      createdAt: randomDate(30),
    });
    alertCount++;
  }
  
  // Seed KYB Applications
  console.log("  Seeding KYB & BIS Investigations...");
  for (const est of establishments.slice(0, 20)) {
    const [kyb] = await db.insert(schema.kybApplications).values({
      userId: est.ownerId,
      businessName: est.name,
      registrationNumber: `RC${randomInt(100000, 999999)}`,
      taxId: `TIN${randomInt(10000000, 99999999)}`,
      country: est.country,
      status: randomElement(["pending", "approved", "rejected", "in_review"]),
      riskScore: randomInt(10, 80),
      createdAt: randomDate(90),
    }).returning();
    
    // KYB Documents
    await db.insert(schema.kybDocuments).values([
      { applicationId: kyb.id, documentType: "certificate_of_incorporation", fileUrl: "https://example.com/doc1.pdf", status: "verified" },
      { applicationId: kyb.id, documentType: "proof_of_address", fileUrl: "https://example.com/doc2.pdf", status: "verified" },
      { applicationId: kyb.id, documentType: "director_id", fileUrl: "https://example.com/doc3.pdf", status: "pending" },
    ]);
    
    // BIS Investigations (for high risk)
    if (kyb.riskScore > 60) {
      await db.insert(schema.bisInvestigations).values({
        targetType: "merchant",
        targetId: String(est.id),
        status: randomElement(["open", "closed", "escalated"]),
        priority: "high",
        assignedTo: randomElement(users.filter(u => u.role === "bis_analyst"))?.id,
        findings: { flags: ["PEP match", "Adverse media"] },
        createdAt: randomDate(15),
      });
    }
  }
  
  // Seed SLA Definitions and Breaches
  await db.insert(schema.sla_definitions).values([
    { name: "Payment Processing", targetMs: 2000 },
    { name: "KYB Review", targetMs: 86400000 },
    { name: "Support Response", targetMs: 3600000 },
  ]);
  
  for (let i = 0; i < 10; i++) {
    await db.insert(schema.sla_breaches).values({
      definitionId: randomInt(1, 3),
      actualMs: randomInt(5000, 10000000),
      createdAt: randomDate(10),
    });
  }

  console.log(`  ✓ Seeded ${alertCount} fraud alerts and related compliance data`);
}
