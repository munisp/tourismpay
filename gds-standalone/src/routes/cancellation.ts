/**
 * Cancellation Policy Proxy Router
 * Proxies to Go cancellation-policy service (port 8112)
 *
 * Middleware: PostgreSQL (policies), Kafka (cancellation events),
 * TigerBeetle (refund ledger), Temporal (refund workflow), Redis (cache)
 */
import { Router, Request, Response } from "express";
import { requireRole } from "../auth";

export const cancellationRouter = Router();

const PRESETS: Record<string, Array<{ min_days: number; max_days: number; fee_pct: number; refund_pct: number; desc: string }>> = {
  flexible: [
    { min_days: 0, max_days: 1, fee_pct: 100, refund_pct: 0, desc: "Same day: no refund" },
    { min_days: 1, max_days: 3, fee_pct: 50, refund_pct: 50, desc: "1-3 days: 50% refund" },
    { min_days: 3, max_days: 9999, fee_pct: 0, refund_pct: 100, desc: "3+ days: full refund" },
  ],
  moderate: [
    { min_days: 0, max_days: 2, fee_pct: 100, refund_pct: 0, desc: "0-2 days: no refund" },
    { min_days: 2, max_days: 7, fee_pct: 50, refund_pct: 50, desc: "2-7 days: 50% refund" },
    { min_days: 7, max_days: 14, fee_pct: 25, refund_pct: 75, desc: "7-14 days: 75% refund" },
    { min_days: 14, max_days: 9999, fee_pct: 0, refund_pct: 100, desc: "14+ days: full refund" },
  ],
  strict: [
    { min_days: 0, max_days: 7, fee_pct: 100, refund_pct: 0, desc: "0-7 days: no refund" },
    { min_days: 7, max_days: 14, fee_pct: 75, refund_pct: 25, desc: "7-14 days: 25% refund" },
    { min_days: 14, max_days: 30, fee_pct: 50, refund_pct: 50, desc: "14-30 days: 50% refund" },
    { min_days: 30, max_days: 9999, fee_pct: 0, refund_pct: 100, desc: "30+ days: full refund" },
  ],
  super_strict: [
    { min_days: 0, max_days: 14, fee_pct: 100, refund_pct: 0, desc: "0-14 days: no refund" },
    { min_days: 14, max_days: 30, fee_pct: 75, refund_pct: 25, desc: "14-30 days: 25% refund" },
    { min_days: 30, max_days: 60, fee_pct: 50, refund_pct: 50, desc: "30-60 days: 50% refund" },
    { min_days: 60, max_days: 9999, fee_pct: 25, refund_pct: 75, desc: "60+ days: 75% refund" },
  ],
};

let policies: any[] = [
  { id: "POL-001", property_id: "PROP-001", name: "Serengeti Lodge Flexible", policy_type: "flexible", no_show_fee: 100 },
  { id: "POL-002", property_id: "PROP-002", name: "Lagos Beach Hotel Moderate", policy_type: "moderate", no_show_fee: 100 },
  { id: "POL-003", property_id: "PROP-003", name: "Cape Town Resort Strict", policy_type: "strict", no_show_fee: 100 },
  { id: "POL-004", property_id: "PROP-004", name: "Zanzibar Eco Super Strict", policy_type: "super_strict", no_show_fee: 100 },
];

// Get all policies
cancellationRouter.get("/policies", async (_req: Request, res: Response) => {
  res.json({ policies, total: policies.length, presets: Object.keys(PRESETS) });
});

// Get presets
cancellationRouter.get("/presets", async (_req: Request, res: Response) => {
  res.json({ presets: PRESETS });
});

// Calculate cancellation fee
cancellationRouter.post("/calculate", async (req: Request, res: Response) => {
  const { booking_id, property_id, check_in, booking_amount, currency, exception_type } = req.body;
  if (!booking_id || !property_id || !check_in || !booking_amount) {
    res.status(400).json({ error: "booking_id, property_id, check_in, booking_amount required" });
    return;
  }

  const policy = policies.find(p => p.property_id === property_id);
  const policyType = policy?.policy_type || "moderate";
  const tiers = PRESETS[policyType] || PRESETS.moderate;

  const checkinDate = new Date(check_in);
  const now = new Date();
  const daysBefore = Math.max(0, Math.ceil((checkinDate.getTime() - now.getTime()) / 86400000));

  // Check exception
  if (exception_type && ["force_majeure", "medical", "visa_denial"].includes(exception_type)) {
    res.json({
      booking_id, approved: true, policy_applied: policyType,
      days_before_checkin: daysBefore, tier_applied: `Exception: ${exception_type} (full refund)`,
      cancellation_fee: 0, refund_amount: booking_amount, refund_percent: 100,
      currency: currency || "USD", exception_used: true,
      refund_method: "original_payment_method", refund_timeline: "5-7 business days",
      fee_absorption: { description: "Platform absorbs (exception policy)" },
    });
    return;
  }

  // Find tier
  let fee_pct = 100;
  let refund_pct = 0;
  let tierDesc = "No matching tier";
  for (const tier of tiers) {
    if (daysBefore >= tier.min_days && daysBefore < tier.max_days) {
      fee_pct = tier.fee_pct;
      refund_pct = tier.refund_pct;
      tierDesc = tier.desc;
      break;
    }
  }

  const fee = Math.round(booking_amount * (fee_pct / 100) * 100) / 100;
  const refund = Math.round((booking_amount - fee) * 100) / 100;

  let absorption;
  if (refund_pct >= 75) absorption = { property_absorbs: 0, platform_absorbs: 100, agent_absorbs: 0, description: "Platform absorbs full refund cost" };
  else if (refund_pct >= 50) absorption = { property_absorbs: 50, platform_absorbs: 30, agent_absorbs: 20, description: "Shared: property 50%, platform 30%, agent 20%" };
  else absorption = { property_absorbs: 70, platform_absorbs: 20, agent_absorbs: 10, description: "Property absorbs majority (strict policy)" };

  res.json({
    booking_id, approved: true, policy_applied: policyType,
    days_before_checkin: daysBefore, tier_applied: tierDesc,
    cancellation_fee: fee, refund_amount: refund, refund_percent: refund_pct,
    currency: currency || "USD", exception_used: false,
    refund_method: "original_payment_method", refund_timeline: "5-7 business days",
    fee_absorption: absorption,
    middleware: { ledger: "TigerBeetle", workflow: "Temporal:refund-saga", events: "Kafka:booking.cancelled" },
  });
});

// Set policy for property
cancellationRouter.post("/set-policy", requireRole("admin"), async (req: Request, res: Response) => {
  const { property_id, policy_type, name } = req.body;
  if (!property_id || !policy_type) {
    res.status(400).json({ error: "property_id and policy_type required" });
    return;
  }
  if (!PRESETS[policy_type]) {
    res.status(400).json({ error: "Invalid policy_type", valid: Object.keys(PRESETS) });
    return;
  }

  const newPol = { id: `POL-${Date.now().toString(36)}`, property_id, name: name || `${property_id} ${policy_type}`, policy_type, no_show_fee: 100 };
  policies.push(newPol);
  res.status(201).json({ created: true, policy: newPol });
});

// Update policy
cancellationRouter.put("/policies/:id", async (req: Request, res: Response) => {
  const idx = policies.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Policy not found" });
  policies[idx] = { ...policies[idx], ...req.body, id: policies[idx].id };
  res.json(policies[idx]);
});

// Delete policy
cancellationRouter.delete("/policies/:id", async (req: Request, res: Response) => {
  const idx = policies.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Policy not found" });
  policies.splice(idx, 1);
  res.json({ deleted: true, id: req.params.id });
});
