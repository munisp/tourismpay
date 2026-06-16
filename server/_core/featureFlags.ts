/**
 * Feature Flags & Gradual Rollout (3.3)
 * 
 * Redis-backed feature flag system for controlling rollouts,
 * A/B testing, and kill switches.
 *
 * Middleware integration: Redis (flag storage), Kafka (flag change events),
 * OpenSearch (A/B test result indexing).
 */
import { cacheGet, cacheSet } from "./redis";
import { publishAuditEvent } from "./kafka";
import { logger } from "./logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  description: string;
  rolloutPercentage: number; // 0-100
  allowedUsers?: string[];
  allowedRoles?: string[];
  allowedRegions?: string[];
  variant?: string; // A/B test variant
  createdAt: string;
  updatedAt: string;
}

// ─── Default Flags ────────────────────────────────────────────────────────────

const DEFAULT_FLAGS: Record<string, FeatureFlag> = {
  "cbdc-payments": {
    key: "cbdc-payments",
    enabled: false,
    description: "Enable CBDC (eNaira/eCedi) payment rail",
    rolloutPercentage: 0,
    allowedRegions: ["NG", "GH"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  "offline-nfc": {
    key: "offline-nfc",
    enabled: false,
    description: "Enable offline NFC tap-to-pay for tourists",
    rolloutPercentage: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  "ai-fx-optimization": {
    key: "ai-fx-optimization",
    enabled: true,
    description: "AI-powered FX rate optimization recommendations",
    rolloutPercentage: 50,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  "parametric-insurance": {
    key: "parametric-insurance",
    enabled: false,
    description: "Auto-trigger travel insurance payouts",
    rolloutPercentage: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  "social-commerce": {
    key: "social-commerce",
    enabled: true,
    description: "Social feed and merchant discovery",
    rolloutPercentage: 100,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  "carbon-credits": {
    key: "carbon-credits",
    enabled: false,
    description: "Carbon offset purchase and tracking",
    rolloutPercentage: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  "biometric-payment": {
    key: "biometric-payment",
    enabled: false,
    description: "Face/palm payment at POS",
    rolloutPercentage: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  "loyalty-network": {
    key: "loyalty-network",
    enabled: true,
    description: "Cross-platform airline + hotel + TourismPay loyalty",
    rolloutPercentage: 25,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
};

// ─── Flag Operations ──────────────────────────────────────────────────────────

export async function getFlag(key: string): Promise<FeatureFlag | null> {
  const cached = await cacheGet<string>(`ff:${key}`);
  if (cached) return JSON.parse(cached) as FeatureFlag;
  return DEFAULT_FLAGS[key] || null;
}

export async function isEnabled(key: string, context?: { userId?: string; role?: string; region?: string }): Promise<boolean> {
  const flag = await getFlag(key);
  if (!flag) return false;
  if (!flag.enabled) return false;

  // Check role allowlist
  if (flag.allowedRoles && context?.role && !flag.allowedRoles.includes(context.role)) {
    return false;
  }

  // Check region allowlist
  if (flag.allowedRegions && context?.region && !flag.allowedRegions.includes(context.region)) {
    return false;
  }

  // Check user allowlist (always enabled for listed users)
  if (flag.allowedUsers && context?.userId && flag.allowedUsers.includes(context.userId)) {
    return true;
  }

  // Percentage-based rollout using deterministic hash
  if (flag.rolloutPercentage < 100 && context?.userId) {
    const hash = simpleHash(context.userId + key);
    return (hash % 100) < flag.rolloutPercentage;
  }

  return flag.rolloutPercentage === 100;
}

export async function setFlag(key: string, updates: Partial<FeatureFlag>): Promise<FeatureFlag> {
  const existing = await getFlag(key) || { ...DEFAULT_FLAGS[key], key, createdAt: new Date().toISOString() };
  const updated: FeatureFlag = { ...existing, ...updates, key, updatedAt: new Date().toISOString() };

  await cacheSet(`ff:${key}`, JSON.stringify(updated), 0);
  await publishAuditEvent("feature_flag.updated", { flag: key, changes: updates });
  logger.info(`[FeatureFlags] Updated flag: ${key}`, updates);

  return updated;
}

export async function getAllFlags(): Promise<FeatureFlag[]> {
  const flags: FeatureFlag[] = [];
  for (const key of Object.keys(DEFAULT_FLAGS)) {
    const flag = await getFlag(key);
    if (flag) flags.push(flag);
  }
  return flags;
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

logger.info("[FeatureFlags] Feature flag system loaded");
