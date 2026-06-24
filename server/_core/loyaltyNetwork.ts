/**
 * Cross-Platform Loyalty Network (4.8)
 * 
 * Unified loyalty program connecting airline miles, hotel points,
 * and TourismPay credits. Coalition loyalty across merchants.
 *
 * Middleware integration: Redis (points cache), Kafka (earn/burn events),
 * OpenSearch (partner catalog), Temporal (tier evaluation workflows).
 * Persistence: PostgreSQL via Drizzle ORM.
 */
import { logger } from "./logger";
import { publishAuditEvent } from "./kafka";
import { cacheGet, cacheSet } from "./redis";
import { getDb } from "../db";
import { eq } from "drizzle-orm";
import { loyaltyBalances, loyaltyConversions, tourismPassesTable } from "../../drizzle/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LoyaltyPartner {
  id: string;
  name: string;
  type: "airline" | "hotel" | "merchant" | "transport" | "attraction";
  pointsName: string;
  conversionRate: number;
  reverseRate: number;
  logo?: string;
  regions: string[];
  active: boolean;
}

export interface LoyaltyBalance {
  userId: string;
  tourismpayCredits: number;
  partnerBalances: PartnerBalance[];
  totalValueUsd: number;
  tier: LoyaltyTier;
  tierProgress: number;
  achievements: Achievement[];
}

export interface PartnerBalance {
  partnerId: string;
  partnerName: string;
  pointsName: string;
  balance: number;
  valueInCredits: number;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  earnedAt: string;
  category: "travel" | "spending" | "social" | "sustainability";
}

export type LoyaltyTier = "explorer" | "adventurer" | "voyager" | "globetrotter" | "ambassador";

export interface PointsConversion {
  id: string;
  userId: string;
  fromPartner: string;
  toPartner: string;
  fromAmount: number;
  toAmount: number;
  rate: number;
  status: "pending" | "completed" | "failed";
  createdAt: string;
}

export interface TourismPass {
  id: string;
  userId: string;
  region: string;
  validFrom: string;
  validTo: string;
  includedServices: string[];
  maxUsages: number;
  currentUsages: number;
  price: number;
  currency: string;
}

// ─── Partners ─────────────────────────────────────────────────────────────────

const PARTNERS: LoyaltyPartner[] = [
  {
    id: "kenya_airways",
    name: "Kenya Airways",
    type: "airline",
    pointsName: "Asante Miles",
    conversionRate: 100,
    reverseRate: 80,
    regions: ["KE", "EA"],
    active: true,
  },
  {
    id: "ethiopian_airlines",
    name: "Ethiopian Airlines",
    type: "airline",
    pointsName: "ShebaMiles",
    conversionRate: 120,
    reverseRate: 90,
    regions: ["ET", "AF"],
    active: true,
  },
  {
    id: "south_african_airways",
    name: "South African Airways",
    type: "airline",
    pointsName: "Voyager Miles",
    conversionRate: 110,
    reverseRate: 85,
    regions: ["ZA", "SA"],
    active: true,
  },
  {
    id: "serena_hotels",
    name: "Serena Hotels",
    type: "hotel",
    pointsName: "Serena Points",
    conversionRate: 50,
    reverseRate: 40,
    regions: ["KE", "TZ", "RW", "UG", "MZ"],
    active: true,
  },
  {
    id: "protea_hotels",
    name: "Protea Hotels (Marriott)",
    type: "hotel",
    pointsName: "Bonvoy Points",
    conversionRate: 200,
    reverseRate: 150,
    regions: ["ZA", "NG", "GH"],
    active: true,
  },
  {
    id: "uber_africa",
    name: "Uber Africa",
    type: "transport",
    pointsName: "Uber Credits",
    conversionRate: 10,
    reverseRate: 8,
    regions: ["KE", "NG", "ZA", "GH", "TZ"],
    active: true,
  },
];

// ─── Tier Calculation ─────────────────────────────────────────────────────────

function calculateTier(totalCredits: number, countriesVisited: number): LoyaltyTier {
  if (totalCredits >= 50000 && countriesVisited >= 10) return "ambassador";
  if (totalCredits >= 20000 && countriesVisited >= 7) return "globetrotter";
  if (totalCredits >= 10000 && countriesVisited >= 5) return "voyager";
  if (totalCredits >= 3000 && countriesVisited >= 3) return "adventurer";
  return "explorer";
}

function getTierBenefits(tier: LoyaltyTier): string[] {
  const benefits: Record<LoyaltyTier, string[]> = {
    explorer: ["1x earn rate", "Basic partner access"],
    adventurer: ["1.5x earn rate", "Airport lounge 2x/year", "Priority support"],
    voyager: ["2x earn rate", "Airport lounge unlimited", "Free insurance upgrade", "Partner tier match"],
    globetrotter: ["3x earn rate", "Concierge service", "Free upgrades", "VIP merchant access"],
    ambassador: ["5x earn rate", "Personal travel advisor", "Exclusive experiences", "Lifetime status guarantee"],
  };
  return benefits[tier];
}

// ─── Operations ───────────────────────────────────────────────────────────────

export function getPartners(region?: string): LoyaltyPartner[] {
  if (region) return PARTNERS.filter(p => p.active && p.regions.includes(region));
  return PARTNERS.filter(p => p.active);
}

export async function getBalance(userId: string): Promise<LoyaltyBalance> {
  const cached = await cacheGet<string>(`loyalty:balance:${userId}`);
  if (cached) return JSON.parse(cached) as LoyaltyBalance;

  const db = await getDb();
  if (db) {
    const rows = await db.select().from(loyaltyBalances).where(eq(loyaltyBalances.userId, userId));
    if (rows.length > 0) {
      const r = rows[0];
      const balance: LoyaltyBalance = {
        userId: r.userId,
        tourismpayCredits: r.tourismpayCredits,
        partnerBalances: r.partnerBalances as PartnerBalance[],
        totalValueUsd: parseFloat(r.totalValueUsd),
        tier: r.tier as LoyaltyTier,
        tierProgress: r.tierProgress,
        achievements: r.achievements as Achievement[],
      };
      await cacheSet(`loyalty:balance:${userId}`, JSON.stringify(balance), 3600);
      return balance;
    }
  }

  const balance: LoyaltyBalance = {
    userId,
    tourismpayCredits: 0,
    partnerBalances: [],
    totalValueUsd: 0,
    tier: "explorer",
    tierProgress: 0,
    achievements: [],
  };

  if (db) {
    await db.insert(loyaltyBalances).values({
      userId: balance.userId,
      tourismpayCredits: balance.tourismpayCredits,
      partnerBalances: balance.partnerBalances,
      totalValueUsd: String(balance.totalValueUsd),
      tier: balance.tier,
      tierProgress: balance.tierProgress,
      achievements: balance.achievements,
    }).onConflictDoNothing();
  }

  return balance;
}

export async function earnCredits(userId: string, amount: number, source: string): Promise<LoyaltyBalance> {
  const balance = await getBalance(userId);
  balance.tourismpayCredits += amount;
  balance.totalValueUsd = balance.tourismpayCredits / 100;
  balance.tier = calculateTier(balance.tourismpayCredits, balance.achievements.filter(a => a.category === "travel").length);

  const db = await getDb();
  if (db) {
    await db.update(loyaltyBalances).set({
      tourismpayCredits: balance.tourismpayCredits,
      totalValueUsd: String(balance.totalValueUsd),
      tier: balance.tier,
    }).where(eq(loyaltyBalances.userId, userId));
  }

  await cacheSet(`loyalty:balance:${userId}`, JSON.stringify(balance), 3600);
  await publishAuditEvent("loyalty.credits_earned", { userId, amount, source });
  return balance;
}

export async function convertPoints(
  userId: string,
  fromPartner: string,
  toPartner: string,
  fromAmount: number,
): Promise<PointsConversion> {
  const partner = PARTNERS.find(p => p.id === fromPartner);
  if (!partner) throw new Error(`Partner not found: ${fromPartner}`);

  const toAmount = toPartner === "tourismpay"
    ? Math.floor(fromAmount / partner.conversionRate)
    : Math.floor(fromAmount * partner.reverseRate);

  const conversion: PointsConversion = {
    id: `conv_${Date.now()}`,
    userId,
    fromPartner,
    toPartner,
    fromAmount,
    toAmount,
    rate: toAmount / fromAmount,
    status: "completed",
    createdAt: new Date().toISOString(),
  };

  const db = await getDb();
  if (db) {
    await db.insert(loyaltyConversions).values({
      id: conversion.id,
      userId: conversion.userId,
      fromPartner: conversion.fromPartner,
      toPartner: conversion.toPartner,
      fromAmount: conversion.fromAmount,
      toAmount: conversion.toAmount,
      rate: String(conversion.rate),
      status: conversion.status,
      createdAt: conversion.createdAt,
    });
  }

  if (toPartner === "tourismpay") {
    await earnCredits(userId, toAmount, `conversion:${fromPartner}`);
  }

  await publishAuditEvent("loyalty.points_converted", { ...conversion });
  return conversion;
}

export async function awardAchievement(userId: string, achievement: Omit<Achievement, "earnedAt">): Promise<Achievement> {
  const balance = await getBalance(userId);
  const awarded: Achievement = { ...achievement, earnedAt: new Date().toISOString() };
  balance.achievements.push(awarded);

  const db = await getDb();
  if (db) {
    await db.update(loyaltyBalances).set({
      achievements: balance.achievements,
    }).where(eq(loyaltyBalances.userId, userId));
  }

  await cacheSet(`loyalty:balance:${userId}`, JSON.stringify(balance), 3600);
  await publishAuditEvent("loyalty.achievement_awarded", { userId, achievementId: achievement.id });
  return awarded;
}

// ─── Tourism Pass ─────────────────────────────────────────────────────────────

export async function createTourismPass(
  userId: string,
  region: string,
  durationDays: number,
  services: string[],
): Promise<TourismPass> {
  const pass: TourismPass = {
    id: `pass_${Date.now()}`,
    userId,
    region,
    validFrom: new Date().toISOString(),
    validTo: new Date(Date.now() + durationDays * 86400000).toISOString(),
    includedServices: services,
    maxUsages: services.length * 3,
    currentUsages: 0,
    price: durationDays * 500,
    currency: "USD",
  };

  const db = await getDb();
  if (db) {
    await db.insert(tourismPassesTable).values({
      id: pass.id,
      userId: pass.userId,
      region: pass.region,
      validFrom: pass.validFrom,
      validTo: pass.validTo,
      includedServices: pass.includedServices,
      maxUsages: pass.maxUsages,
      currentUsages: pass.currentUsages,
      price: pass.price,
      currency: pass.currency,
    });
  }

  await publishAuditEvent("loyalty.pass_created", { passId: pass.id, region });
  return pass;
}

export function getTierBenefitsForUser(tier: LoyaltyTier): string[] {
  return getTierBenefits(tier);
}

logger.info("[Loyalty] Cross-platform loyalty network loaded");
