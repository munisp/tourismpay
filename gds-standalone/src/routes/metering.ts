/**
 * GDS Metered Token System
 *
 * Tracks API usage per-tenant and per-API-key. Enforces quota limits.
 * Supports tiered pricing plans with different token allocations.
 *
 * Token cost per operation:
 *   - Search: 1 token
 *   - Property read: 1 token
 *   - Availability check: 2 tokens
 *   - Reservation create: 5 tokens
 *   - Reservation modify/cancel: 3 tokens
 *   - Analytics query: 3 tokens
 *   - Distribution push: 2 tokens
 *   - Webhook delivery: 1 token
 *   - Bulk operations: N × base cost
 */

import { Router, Request, Response } from "express";

const router = Router();

// Token costs per operation type
const TOKEN_COSTS: Record<string, number> = {
  "search": 1,
  "search.suggest": 1,
  "search.trending": 1,
  "properties.list": 1,
  "properties.get": 1,
  "properties.register": 5,
  "properties.update": 3,
  "availability.check": 2,
  "availability.bulk": 10,
  "availability.update": 2,
  "reservations.create": 5,
  "reservations.get": 1,
  "reservations.list": 1,
  "reservations.modify": 3,
  "reservations.cancel": 3,
  "rates.get": 1,
  "rates.dynamic": 3,
  "rates.plan": 3,
  "agents.register": 5,
  "agents.profile": 1,
  "agents.commission": 1,
  "agents.payout": 5,
  "settlement.list": 1,
  "settlement.create": 5,
  "settlement.process": 10,
  "analytics.bookings": 3,
  "analytics.market": 3,
  "analytics.forecast": 5,
  "distribution.channels": 1,
  "distribution.push": 2,
  "distribution.webhooks": 1,
};

// Plan definitions with monthly token allocations
interface MeteringPlan {
  name: string;
  monthlyTokens: number;
  overageRate: number; // USD per 1000 tokens over quota
  features: string[];
}

const PLANS: Record<string, MeteringPlan> = {
  sandbox: {
    name: "Sandbox",
    monthlyTokens: 10_000,
    overageRate: 0, // no overage allowed in sandbox
    features: ["search", "properties.list", "availability.check"],
  },
  starter: {
    name: "Starter",
    monthlyTokens: 100_000,
    overageRate: 2.00,
    features: ["*"], // all operations
  },
  professional: {
    name: "Professional",
    monthlyTokens: 1_000_000,
    overageRate: 1.50,
    features: ["*"],
  },
  enterprise: {
    name: "Enterprise",
    monthlyTokens: -1, // unlimited
    overageRate: 0,
    features: ["*"],
  },
};

// In-memory metering store (production: Redis + PostgreSQL)
interface UsageRecord {
  tenantId: string;
  apiKeyId: string;
  plan: string;
  tokensUsed: number;
  tokensRemaining: number;
  periodStart: string; // ISO date
  periodEnd: string;
  operations: Record<string, number>;
  dailyUsage: Record<string, number>; // date -> tokens
  overageTokens: number;
  overageCost: number;
}

const usageStore = new Map<string, UsageRecord>();

function getOrCreateUsage(tenantId: string, apiKeyId: string): UsageRecord {
  const key = `${tenantId}:${apiKeyId}`;
  if (!usageStore.has(key)) {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    usageStore.set(key, {
      tenantId,
      apiKeyId,
      plan: "starter",
      tokensUsed: 0,
      tokensRemaining: PLANS.starter.monthlyTokens,
      periodStart: periodStart.toISOString().split("T")[0],
      periodEnd: periodEnd.toISOString().split("T")[0],
      operations: {},
      dailyUsage: {},
      overageTokens: 0,
      overageCost: 0,
    });
  }
  return usageStore.get(key)!;
}

// Record token consumption
function consumeTokens(tenantId: string, apiKeyId: string, operation: string, count: number = 1): { allowed: boolean; tokensConsumed: number; remaining: number; overage: boolean } {
  const usage = getOrCreateUsage(tenantId, apiKeyId);
  const plan = PLANS[usage.plan] || PLANS.starter;
  const costPerOp = TOKEN_COSTS[operation] || 1;
  const totalCost = costPerOp * count;

  // Check quota (unlimited if plan.monthlyTokens === -1)
  if (plan.monthlyTokens !== -1) {
    const totalAfter = usage.tokensUsed + totalCost;
    if (totalAfter > plan.monthlyTokens && plan.overageRate === 0) {
      return { allowed: false, tokensConsumed: 0, remaining: Math.max(0, plan.monthlyTokens - usage.tokensUsed), overage: false };
    }
  }

  // Consume tokens
  usage.tokensUsed += totalCost;
  usage.operations[operation] = (usage.operations[operation] || 0) + count;

  const today = new Date().toISOString().split("T")[0];
  usage.dailyUsage[today] = (usage.dailyUsage[today] || 0) + totalCost;

  // Calculate overage
  let overage = false;
  if (plan.monthlyTokens !== -1 && usage.tokensUsed > plan.monthlyTokens) {
    const overageAmount = usage.tokensUsed - plan.monthlyTokens;
    usage.overageTokens = overageAmount;
    usage.overageCost = (overageAmount / 1000) * plan.overageRate;
    overage = true;
  }

  usage.tokensRemaining = plan.monthlyTokens === -1 ? -1 : Math.max(0, plan.monthlyTokens - usage.tokensUsed);

  return { allowed: true, tokensConsumed: totalCost, remaining: usage.tokensRemaining, overage };
}

// ─── Metering Middleware (attach to APISIX via plugin or to Express routes) ───

export function meteringMiddleware(operation: string) {
  return (req: Request, res: Response, next: Function) => {
    const tenantId = (req as any).gdsUser?.tenantId || "default";
    const apiKeyId = (req as any).gdsUser?.sub || req.get("X-GDS-API-Key") || "anonymous";

    const result = consumeTokens(tenantId, apiKeyId, operation);

    // Set metering headers
    res.setHeader("X-GDS-Tokens-Consumed", result.tokensConsumed.toString());
    res.setHeader("X-GDS-Tokens-Remaining", result.remaining.toString());
    if (result.overage) {
      res.setHeader("X-GDS-Quota-Overage", "true");
    }

    if (!result.allowed) {
      res.status(429).json({
        error: "Token quota exceeded",
        tokensUsed: getOrCreateUsage(tenantId, apiKeyId).tokensUsed,
        monthlyLimit: PLANS[getOrCreateUsage(tenantId, apiKeyId).plan]?.monthlyTokens,
        resetDate: getOrCreateUsage(tenantId, apiKeyId).periodEnd,
        upgradeUrl: "/api/v1/gds/metering/plans",
      });
      return;
    }

    next();
  };
}

// ─── Routes ───────────────────────────────────────────────────────

// GET /api/v1/gds/metering/usage — Get current usage
router.get("/usage", (req: Request, res: Response) => {
  const tenantId = (req as any).gdsUser?.tenantId || "default";
  const apiKeyId = (req as any).gdsUser?.sub || "anonymous";
  const usage = getOrCreateUsage(tenantId, apiKeyId);

  res.json({
    plan: usage.plan,
    period: { start: usage.periodStart, end: usage.periodEnd },
    tokens: {
      used: usage.tokensUsed,
      remaining: usage.tokensRemaining,
      limit: PLANS[usage.plan]?.monthlyTokens || 0,
    },
    overage: {
      tokens: usage.overageTokens,
      cost: `$${usage.overageCost.toFixed(2)}`,
    },
    operations: usage.operations,
    dailyUsage: usage.dailyUsage,
  });
});

// GET /api/v1/gds/metering/quota — Get quota status
router.get("/quota", (req: Request, res: Response) => {
  const tenantId = (req as any).gdsUser?.tenantId || "default";
  const apiKeyId = (req as any).gdsUser?.sub || "anonymous";
  const usage = getOrCreateUsage(tenantId, apiKeyId);
  const plan = PLANS[usage.plan] || PLANS.starter;

  const percentUsed = plan.monthlyTokens === -1 ? 0 : (usage.tokensUsed / plan.monthlyTokens) * 100;

  res.json({
    plan: usage.plan,
    quota: {
      total: plan.monthlyTokens === -1 ? "unlimited" : plan.monthlyTokens,
      used: usage.tokensUsed,
      remaining: usage.tokensRemaining === -1 ? "unlimited" : usage.tokensRemaining,
      percentUsed: Math.round(percentUsed * 100) / 100,
    },
    resetDate: usage.periodEnd,
    overageAllowed: plan.overageRate > 0,
    overageRate: `$${plan.overageRate.toFixed(2)}/1000 tokens`,
  });
});

// GET /api/v1/gds/metering/plans — List available plans
router.get("/plans", (_req: Request, res: Response) => {
  const plans = Object.entries(PLANS).map(([id, plan]) => ({
    id,
    name: plan.name,
    monthlyTokens: plan.monthlyTokens === -1 ? "unlimited" : plan.monthlyTokens,
    overageRate: plan.overageRate > 0 ? `$${plan.overageRate.toFixed(2)}/1000 tokens` : "not allowed",
    features: plan.features,
  }));
  res.json({ plans });
});

// GET /api/v1/gds/metering/costs — List token costs per operation
router.get("/costs", (_req: Request, res: Response) => {
  res.json({
    costs: TOKEN_COSTS,
    note: "Bulk operations multiply the base cost by the number of items.",
  });
});

// POST /api/v1/gds/metering/upgrade — Upgrade plan
router.post("/upgrade", (req: Request, res: Response) => {
  const tenantId = (req as any).gdsUser?.tenantId || "default";
  const apiKeyId = (req as any).gdsUser?.sub || "anonymous";
  const { plan } = req.body;

  if (!PLANS[plan]) {
    res.status(400).json({ error: "Invalid plan", validPlans: Object.keys(PLANS) });
    return;
  }

  const usage = getOrCreateUsage(tenantId, apiKeyId);
  usage.plan = plan;
  usage.tokensRemaining = PLANS[plan].monthlyTokens === -1 ? -1 : Math.max(0, PLANS[plan].monthlyTokens - usage.tokensUsed);

  res.json({
    success: true,
    plan: plan,
    newQuota: PLANS[plan].monthlyTokens === -1 ? "unlimited" : PLANS[plan].monthlyTokens,
    tokensRemaining: usage.tokensRemaining === -1 ? "unlimited" : usage.tokensRemaining,
  });
});

// POST /api/v1/gds/metering/tokens/purchase — Purchase additional tokens
router.post("/tokens/purchase", (req: Request, res: Response) => {
  const tenantId = (req as any).gdsUser?.tenantId || "default";
  const apiKeyId = (req as any).gdsUser?.sub || "anonymous";
  const { amount } = req.body;

  if (!amount || amount < 1000) {
    res.status(400).json({ error: "Minimum purchase is 1000 tokens" });
    return;
  }

  const usage = getOrCreateUsage(tenantId, apiKeyId);
  const plan = PLANS[usage.plan] || PLANS.starter;
  const cost = (amount / 1000) * plan.overageRate;

  // Add purchased tokens to remaining
  if (usage.tokensRemaining !== -1) {
    usage.tokensRemaining += amount;
  }

  res.json({
    success: true,
    tokensPurchased: amount,
    cost: `$${cost.toFixed(2)}`,
    newRemaining: usage.tokensRemaining === -1 ? "unlimited" : usage.tokensRemaining,
  });
});

// GET /api/v1/gds/metering/invoice — Get current period invoice
router.get("/invoice", (req: Request, res: Response) => {
  const tenantId = (req as any).gdsUser?.tenantId || "default";
  const apiKeyId = (req as any).gdsUser?.sub || "anonymous";
  const usage = getOrCreateUsage(tenantId, apiKeyId);
  const plan = PLANS[usage.plan] || PLANS.starter;

  const baseCost = plan.name === "Sandbox" ? 0 : plan.name === "Starter" ? 49 : plan.name === "Professional" ? 199 : 999;

  res.json({
    period: { start: usage.periodStart, end: usage.periodEnd },
    plan: { name: plan.name, baseCost: `$${baseCost}` },
    usage: {
      tokensIncluded: plan.monthlyTokens === -1 ? "unlimited" : plan.monthlyTokens,
      tokensUsed: usage.tokensUsed,
      overage: usage.overageTokens,
      overageCost: `$${usage.overageCost.toFixed(2)}`,
    },
    total: `$${(baseCost + usage.overageCost).toFixed(2)}`,
    operationBreakdown: Object.entries(usage.operations).map(([op, count]) => ({
      operation: op,
      calls: count,
      tokenCost: TOKEN_COSTS[op] || 1,
      totalTokens: count * (TOKEN_COSTS[op] || 1),
    })),
  });
});

export default router;
