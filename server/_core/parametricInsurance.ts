/**
 * Parametric Travel Insurance (4.3)
 * 
 * Auto-trigger payouts without claims process based on verifiable events:
 * - Flight delay > 3 hours → automatic wallet credit
 * - Weather event at destination → partial refund
 * - Medical emergency → instant cash advance
 *
 * Middleware integration: Kafka (event triggers), Temporal (payout workflows),
 * Redis (policy cache), OpenSearch (claims indexing), TigerBeetle (payouts).
 * Persistence: PostgreSQL via Drizzle ORM.
 */
import { logger } from "./logger";
import { publishAuditEvent } from "./kafka";
import { cacheGet, cacheSet } from "./redis";
import { signalWorkflow } from "./temporal";
import { getDb } from "../db";
import { eq, and } from "drizzle-orm";
import { insurancePolicies, insuranceClaims } from "../../drizzle/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InsurancePolicy {
  id: string;
  userId: string;
  tripId: string;
  type: "flight_delay" | "weather" | "medical" | "baggage" | "comprehensive";
  premium: number; // USD cents
  maxPayout: number; // USD cents
  startDate: string;
  endDate: string;
  status: "active" | "expired" | "claimed" | "cancelled";
  triggers: TriggerCondition[];
  createdAt: string;
}

export interface TriggerCondition {
  event: string;
  threshold: number;
  unit: string;
  payoutPercentage: number;
  description: string;
}

export interface InsuranceClaim {
  id: string;
  policyId: string;
  userId: string;
  triggerEvent: string;
  eventData: Record<string, unknown>;
  payoutAmount: number;
  status: "auto_triggered" | "pending_verification" | "paid" | "denied";
  triggeredAt: string;
  paidAt?: string;
}

export interface PolicyQuote {
  type: InsurancePolicy["type"];
  premium: number;
  maxPayout: number;
  triggers: TriggerCondition[];
  validDays: number;
}

// ─── Policy Templates ─────────────────────────────────────────────────────────

const POLICY_TEMPLATES: Record<string, PolicyQuote> = {
  flight_delay: {
    type: "flight_delay",
    premium: 500,
    maxPayout: 20000,
    validDays: 30,
    triggers: [
      { event: "flight_delay", threshold: 180, unit: "minutes", payoutPercentage: 50, description: "Flight delayed > 3 hours" },
      { event: "flight_delay", threshold: 360, unit: "minutes", payoutPercentage: 100, description: "Flight delayed > 6 hours" },
      { event: "flight_cancelled", threshold: 1, unit: "event", payoutPercentage: 100, description: "Flight cancelled" },
    ],
  },
  weather: {
    type: "weather",
    premium: 800,
    maxPayout: 15000,
    validDays: 14,
    triggers: [
      { event: "heavy_rain", threshold: 50, unit: "mm/day", payoutPercentage: 30, description: "Heavy rain > 50mm" },
      { event: "cyclone_warning", threshold: 1, unit: "event", payoutPercentage: 75, description: "Cyclone/hurricane warning issued" },
      { event: "extreme_heat", threshold: 45, unit: "celsius", payoutPercentage: 25, description: "Temperature > 45°C" },
    ],
  },
  medical: {
    type: "medical",
    premium: 2000,
    maxPayout: 100000,
    validDays: 30,
    triggers: [
      { event: "hospital_admission", threshold: 1, unit: "event", payoutPercentage: 50, description: "Hospital admission abroad" },
      { event: "emergency_evacuation", threshold: 1, unit: "event", payoutPercentage: 100, description: "Emergency medical evacuation" },
    ],
  },
  baggage: {
    type: "baggage",
    premium: 300,
    maxPayout: 50000,
    validDays: 30,
    triggers: [
      { event: "baggage_delayed", threshold: 360, unit: "minutes", payoutPercentage: 30, description: "Baggage delayed > 6 hours" },
      { event: "baggage_lost", threshold: 1, unit: "event", payoutPercentage: 100, description: "Baggage lost permanently" },
    ],
  },
  comprehensive: {
    type: "comprehensive",
    premium: 3500,
    maxPayout: 150000,
    validDays: 30,
    triggers: [
      { event: "flight_delay", threshold: 180, unit: "minutes", payoutPercentage: 15, description: "Flight delayed > 3 hours" },
      { event: "flight_cancelled", threshold: 1, unit: "event", payoutPercentage: 25, description: "Flight cancelled" },
      { event: "heavy_rain", threshold: 50, unit: "mm/day", payoutPercentage: 10, description: "Heavy rain at destination" },
      { event: "hospital_admission", threshold: 1, unit: "event", payoutPercentage: 50, description: "Hospital admission" },
      { event: "baggage_lost", threshold: 1, unit: "event", payoutPercentage: 30, description: "Baggage lost" },
    ],
  },
};

// ─── Policy Operations ────────────────────────────────────────────────────────

export function getQuote(type: InsurancePolicy["type"]): PolicyQuote | null {
  return POLICY_TEMPLATES[type] || null;
}

export function getAllQuotes(): PolicyQuote[] {
  return Object.values(POLICY_TEMPLATES);
}

export async function purchasePolicy(userId: string, tripId: string, type: InsurancePolicy["type"]): Promise<InsurancePolicy> {
  const template = POLICY_TEMPLATES[type];
  if (!template) throw new Error(`Unknown policy type: ${type}`);

  const policy: InsurancePolicy = {
    id: `pol_${Date.now()}_${globalThis.crypto.randomUUID().slice(0, 8)}`,
    userId,
    tripId,
    type,
    premium: template.premium,
    maxPayout: template.maxPayout,
    startDate: new Date().toISOString(),
    endDate: new Date(Date.now() + template.validDays * 86400000).toISOString(),
    status: "active",
    triggers: template.triggers,
    createdAt: new Date().toISOString(),
  };

  const db = await getDb();
  if (db) {
    await db.insert(insurancePolicies).values({
      id: policy.id,
      userId: policy.userId,
      tripId: policy.tripId,
      type: policy.type,
      premium: policy.premium,
      maxPayout: policy.maxPayout,
      startDate: policy.startDate,
      endDate: policy.endDate,
      status: policy.status,
      triggers: policy.triggers,
      createdAt: policy.createdAt,
    });
  }

  await cacheSet(`insurance:policy:${policy.id}`, JSON.stringify(policy), template.validDays * 86400);
  await publishAuditEvent("insurance.policy_purchased", { policyId: policy.id, type, premium: template.premium });

  logger.info(`[Insurance] Policy purchased: ${policy.id} (${type}) for user ${userId}`);
  return policy;
}

// ─── Event-Driven Trigger System ──────────────────────────────────────────────

export async function processEvent(eventType: string, eventData: Record<string, unknown>, userId: string): Promise<InsuranceClaim | null> {
  const db = await getDb();
  let userPolicies: InsurancePolicy[] = [];

  if (db) {
    const rows = await db.select().from(insurancePolicies)
      .where(and(eq(insurancePolicies.userId, userId), eq(insurancePolicies.status, "active")));
    userPolicies = rows.map(r => ({
      ...r,
      type: r.type as InsurancePolicy["type"],
      status: r.status as InsurancePolicy["status"],
      triggers: r.triggers as TriggerCondition[],
    })).filter(p => new Date(p.endDate) > new Date());
  }

  for (const policy of userPolicies) {
    for (const trigger of policy.triggers) {
      if (trigger.event === eventType) {
        const eventValue = (eventData.value as number) || 1;
        if (eventValue >= trigger.threshold) {
          const payoutAmount = Math.round(policy.maxPayout * (trigger.payoutPercentage / 100));
          return await autoTriggerPayout(policy, trigger, eventData, payoutAmount);
        }
      }
    }
  }
  return null;
}

async function autoTriggerPayout(
  policy: InsurancePolicy,
  trigger: TriggerCondition,
  eventData: Record<string, unknown>,
  payoutAmount: number,
): Promise<InsuranceClaim> {
  const claim: InsuranceClaim = {
    id: `clm_${Date.now()}`,
    policyId: policy.id,
    userId: policy.userId,
    triggerEvent: trigger.event,
    eventData,
    payoutAmount,
    status: "auto_triggered",
    triggeredAt: new Date().toISOString(),
  };

  const db = await getDb();
  if (db) {
    await db.insert(insuranceClaims).values({
      id: claim.id,
      policyId: claim.policyId,
      userId: claim.userId,
      triggerEvent: claim.triggerEvent,
      eventData: claim.eventData,
      payoutAmount: claim.payoutAmount,
      status: claim.status,
      triggeredAt: claim.triggeredAt,
    });
    await db.update(insurancePolicies).set({ status: "claimed" }).where(eq(insurancePolicies.id, policy.id));
  }

  await signalWorkflow(`insurance-payout-${claim.id}`, "process_payout", claim);
  await publishAuditEvent("insurance.auto_payout_triggered", {
    claimId: claim.id,
    policyId: policy.id,
    amount: payoutAmount,
    trigger: trigger.event,
  });

  logger.info(`[Insurance] Auto-payout triggered: ${claim.id} — $${(payoutAmount / 100).toFixed(2)} for ${trigger.description}`);
  return claim;
}

export async function getUserPolicies(userId: string): Promise<InsurancePolicy[]> {
  const db = await getDb();
  if (db) {
    const rows = await db.select().from(insurancePolicies).where(eq(insurancePolicies.userId, userId));
    return rows.map(r => ({
      ...r,
      type: r.type as InsurancePolicy["type"],
      status: r.status as InsurancePolicy["status"],
      triggers: r.triggers as TriggerCondition[],
    }));
  }
  return [];
}

export async function getUserClaims(userId: string): Promise<InsuranceClaim[]> {
  const db = await getDb();
  if (db) {
    const rows = await db.select().from(insuranceClaims).where(eq(insuranceClaims.userId, userId));
    return rows.map(r => ({
      ...r,
      status: r.status as InsuranceClaim["status"],
      eventData: r.eventData as Record<string, unknown>,
      paidAt: r.paidAt ?? undefined,
    }));
  }
  return [];
}

logger.info("[Insurance] Parametric insurance module loaded");
