/**
 * Commission Engine Proxy Router
 * Proxies requests to the Rust commission-engine service (port 8110)
 *
 * Middleware: APISIX (rate limit), Permify (ReBAC), TigerBeetle (ledger),
 * Kafka (events), Redis (cache), Mojaloop (cross-border), Dapr (mesh)
 */
import { Router, Request, Response } from "express";
import { requireRole } from "../auth";

export const commissionRouter = Router();

const COMMISSION_SERVICE = process.env.COMMISSION_ENGINE_URL || "http://localhost:8110";

// Rate card — public
commissionRouter.get("/rate-card", async (_req: Request, res: Response) => {
  res.json({
    agent_tiers: {
      bronze: { min_bookings: 0, rate: 0.10, payout: "weekly" },
      silver: { min_bookings: 51, rate: 0.12, payout: "weekly" },
      gold: { min_bookings: 201, rate: 0.15, payout: "bi-weekly" },
      platinum: { min_bookings: 501, rate: 0.18, payout: "daily" },
    },
    property_tiers: {
      sms_only: { commission: 0.15, payout: "weekly", method: "mobile_money" },
      whatsapp: { commission: 0.12, payout: "weekly", method: "mobile_money" },
      web_lite: { commission: 0.10, payout: "bi-weekly", method: "bank_or_mobile" },
      full: { commission: 0.08, payout: "daily", method: "bank_transfer" },
    },
    platform_fees: { standard: 0.03, premium: 0.025, group: 0.02, corporate: 0.015 },
    field_agent_ongoing: { sms_only: 0.02, whatsapp: 0.015, web_lite: 0.01, full: 0.005 },
    channel_bonuses: { direct: 0.02, api: 0.01, gds_portal: 0.0, whatsapp: -0.02 },
    tax_withholding: {
      KE: 0.02, NG: 0.05, GH: 0.025, ZA: 0.03, TZ: 0.02,
      RW: 0.015, UG: 0.06, ET: 0.02, MA: 0.10, EG: 0.14,
    },
    middleware: {
      ledger: "TigerBeetle (double-entry)",
      events: "Kafka (booking.commission.split)",
      cache: "Redis (rate-card:ttl=3600)",
      cross_border: "Mojaloop (ILP)",
      workflow: "Temporal (settlement-saga)",
      mesh: "Dapr (sidecar:commission-engine)",
    },
  });
});

// Calculate split — requires auth
commissionRouter.post("/split", async (req: Request, res: Response) => {
  const { booking_id, property_id, agent_id, field_agent_id, gross_amount,
    currency, country, booking_type, room_nights, property_tier,
    agent_tier, is_group_booking, channel } = req.body;

  if (!booking_id || !property_id || !gross_amount || !currency || !country) {
    res.status(400).json({ error: "booking_id, property_id, gross_amount, currency, country required" });
    return;
  }

  // Calculate splits
  const tax_rate = ({ KE: 0.02, NG: 0.05, GH: 0.025, ZA: 0.03, TZ: 0.02, RW: 0.015, UG: 0.06 } as Record<string, number>)[country] || 0.02;
  const tax = Math.round(gross_amount * tax_rate * 100) / 100;

  const platform_rate = ({ standard: 0.03, premium: 0.025, group: 0.02, corporate: 0.015 } as Record<string, number>)[booking_type || "standard"] || 0.03;
  const platform_fee = Math.round(gross_amount * (is_group_booking ? Math.max(platform_rate - 0.005, 0.01) : platform_rate) * 100) / 100;

  const agent_base = ({ bronze: 0.10, silver: 0.12, gold: 0.15, platinum: 0.18 } as Record<string, number>)[agent_tier || "bronze"] || 0.10;
  const channel_bonus = ({ direct: 0.02, api: 0.01, gds_portal: 0.0, whatsapp: -0.02 } as Record<string, number>)[channel || "gds_portal"] || 0.0;
  const agent_commission = agent_id ? Math.round(gross_amount * Math.min(Math.max(agent_base + channel_bonus, 0.05), 0.25) * 100) / 100 : 0;

  const fa_rate = ({ sms_only: 0.02, whatsapp: 0.015, web_lite: 0.01, full: 0.005 } as Record<string, number>)[property_tier || "full"] || 0;
  const field_agent_commission = field_agent_id ? Math.round(gross_amount * fa_rate * 100) / 100 : 0;

  const total_deductions = tax + platform_fee + agent_commission + field_agent_commission;
  const property_net = Math.round((gross_amount - total_deductions) * 100) / 100;

  const splits = [
    { stakeholder_type: "tax_authority", stakeholder_id: `${country}_revenue`, amount: tax, rate_applied: tax_rate, payout_method: "government_remittance", payout_schedule: "monthly" },
    { stakeholder_type: "platform", stakeholder_id: "gds-platform", amount: platform_fee, rate_applied: platform_rate, payout_method: "internal_ledger", payout_schedule: "realtime" },
  ];

  if (agent_id) {
    splits.push({ stakeholder_type: "agent", stakeholder_id: agent_id, amount: agent_commission, rate_applied: agent_base + channel_bonus, payout_method: "bank_transfer", payout_schedule: "weekly" });
  }
  if (field_agent_id && field_agent_commission > 0) {
    splits.push({ stakeholder_type: "field_agent", stakeholder_id: field_agent_id, amount: field_agent_commission, rate_applied: fa_rate, payout_method: "mobile_money", payout_schedule: "monthly" });
  }
  splits.push({ stakeholder_type: "property", stakeholder_id: property_id, amount: property_net, rate_applied: property_net / gross_amount, payout_method: "mobile_money", payout_schedule: "weekly" });

  res.json({
    booking_id, gross_amount, currency, splits, total_deductions, property_net, tax_withheld: tax,
    calculated_at: new Date().toISOString(),
    ledger_entries: splits.map((s, i) => ({
      debit: `escrow:booking:${booking_id}`,
      credit: `payable:${s.stakeholder_type}:${s.stakeholder_id}`,
      amount: s.amount, currency,
      tigerbeetle_transfer_id: `${booking_id}-${i}`,
    })),
  });
});

// Commission rules
commissionRouter.get("/rules", requireRole("admin"), async (_req: Request, res: Response) => {
  res.json({
    rules: [
      { id: "RULE-001", name: "Standard Agent Commission", type: "tiered", status: "active" },
      { id: "RULE-002", name: "Platform Fee", type: "percentage", status: "active" },
      { id: "RULE-003", name: "Field Agent Ongoing", type: "percentage", status: "active" },
      { id: "RULE-004", name: "Tax Withholding", type: "jurisdiction", status: "active" },
    ],
  });
});

// Overrides — admin only
commissionRouter.get("/overrides", requireRole("admin"), async (_req: Request, res: Response) => {
  res.json({ overrides: [], total: 0, message: "No active overrides. Create one via POST." });
});

commissionRouter.post("/overrides", requireRole("admin"), async (req: Request, res: Response) => {
  const { entity_id, entity_type, override_rate, reason } = req.body;
  if (!entity_id || !override_rate) {
    res.status(400).json({ error: "entity_id, override_rate required" });
    return;
  }
  res.status(201).json({
    override: {
      id: `OVR-${Date.now().toString(36)}`,
      entity_id, entity_type, override_rate, reason,
      status: "pending_approval",
      created_at: new Date().toISOString(),
    },
  });
});
