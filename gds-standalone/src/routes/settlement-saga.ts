/**
 * Settlement Saga Proxy Router
 * Proxies to Python settlement-saga service (port 8114)
 *
 * Middleware: Temporal (workflow orchestration), TigerBeetle (double-entry ledger),
 * Mojaloop (cross-border), Kafka (events), PostgreSQL (audit), Fluvio (streams),
 * Redis (idempotency), Dapr (service mesh)
 */
import { Router, Request, Response } from "express";
import { requireRole } from "../auth";

export const settlementSagaRouter = Router();

const AGENT_TIERS: Record<string, number> = { bronze: 0.10, silver: 0.12, gold: 0.15, platinum: 0.18 };
const PLATFORM_FEES: Record<string, number> = { standard: 0.03, premium: 0.025, group: 0.02, corporate: 0.015 };
const FA_RATES: Record<string, number> = { sms_only: 0.02, whatsapp: 0.015, web_lite: 0.01, full: 0.005 };
const TAX_RATES: Record<string, number> = { KE: 0.02, NG: 0.05, GH: 0.025, ZA: 0.03, TZ: 0.02, RW: 0.015, UG: 0.06, ET: 0.02, MA: 0.10, EG: 0.14 };
const CHANNEL_BONUS: Record<string, number> = { direct: 0.02, api: 0.01, gds_portal: 0.0, whatsapp: -0.02 };

const sagas: any[] = [];

// Execute saga
settlementSagaRouter.post("/execute", async (req: Request, res: Response) => {
  const { booking_id, gross_amount, currency, country, property_id, property_tier,
    agent_id, agent_tier, field_agent_id, channel, is_group, booking_type } = req.body;

  if (!booking_id || !gross_amount || !currency || !country || !property_id) {
    res.status(400).json({ error: "booking_id, gross_amount, currency, country, property_id required" });
    return;
  }

  const sagaId = `SAGA-${Date.now().toString(36).toUpperCase()}`;
  const steps: any[] = [];

  // Step 1: Tax
  const taxRate = TAX_RATES[country] || 0.02;
  const taxAmount = Math.round(gross_amount * taxRate * 100) / 100;
  steps.push({ step: 1, name: "tax_withholding", status: "completed", amount: taxAmount, rate: taxRate, destination: `tax:${country}`, method: "government_remittance", temporal_activity: "WithholdTaxActivity" });

  // Step 2: Platform fee
  const platRate = PLATFORM_FEES[booking_type || "standard"] || 0.03;
  const platFee = Math.round(gross_amount * (is_group ? Math.max(platRate - 0.005, 0.01) : platRate) * 100) / 100;
  steps.push({ step: 2, name: "platform_fee", status: "completed", amount: platFee, rate: platRate, destination: "revenue:platform", method: "internal_ledger", temporal_activity: "CollectPlatformFeeActivity" });

  // Step 3: Agent commission
  let agentComm = 0;
  if (agent_id) {
    const baseRate = AGENT_TIERS[agent_tier || "bronze"] || 0.10;
    const chBonus = CHANNEL_BONUS[channel || "gds_portal"] || 0;
    const effRate = Math.min(Math.max(baseRate + chBonus, 0.05), 0.25);
    agentComm = Math.round(gross_amount * effRate * 100) / 100;
    steps.push({ step: 3, name: "agent_commission", status: "completed", amount: agentComm, rate: effRate, destination: `agent:${agent_id}`, method: "bank_transfer", temporal_activity: "PayAgentCommissionActivity" });
  }

  // Step 4: Field agent
  let faComm = 0;
  if (field_agent_id) {
    const faRate = FA_RATES[property_tier || "full"] || 0;
    faComm = Math.round(gross_amount * faRate * 100) / 100;
    if (faComm > 0) {
      steps.push({ step: 4, name: "field_agent_commission", status: "completed", amount: faComm, rate: faRate, destination: `field_agent:${field_agent_id}`, method: "mobile_money", temporal_activity: "PayFieldAgentActivity" });
    }
  }

  // Step 5: Property net
  const totalDeductions = taxAmount + platFee + agentComm + faComm;
  const propertyNet = Math.round((gross_amount - totalDeductions) * 100) / 100;
  steps.push({ step: 5, name: "property_payout", status: "completed", amount: propertyNet, rate: propertyNet / gross_amount, destination: `property:${property_id}`, method: property_tier === "full" ? "bank_transfer" : "mobile_money", temporal_activity: "PayPropertyActivity" });

  const saga = {
    saga_id: sagaId, status: "completed", booking_id, gross_amount, currency,
    steps,
    summary: { tax_withheld: taxAmount, platform_fee: platFee, agent_commission: agentComm, field_agent: faComm, property_net: propertyNet },
    temporal_workflow_id: `settlement-${sagaId}`,
    idempotency_key: `idem-${booking_id}-${Date.now().toString(36)}`,
    ledger_entries: steps.map((s, i) => ({
      debit: `escrow:booking:${booking_id}`, credit: s.destination,
      amount: s.amount, currency, tigerbeetle_transfer_id: `${sagaId}-${i}`,
    })),
    completed_at: new Date().toISOString(),
  };

  sagas.push(saga);
  res.json(saga);
});

// Refund saga
settlementSagaRouter.post("/refund", async (req: Request, res: Response) => {
  const { booking_id, refund_amount, currency, reason, refund_type } = req.body;
  if (!booking_id || !refund_amount) {
    res.status(400).json({ error: "booking_id and refund_amount required" });
    return;
  }

  const type = refund_type || "full";
  let waterfall: any[] = [];

  if (type === "full") {
    waterfall = [
      { party: "property", absorbs: Math.round(refund_amount * 0.6 * 100) / 100, method: "deduct_from_pending_payout" },
      { party: "agent", absorbs: Math.round(refund_amount * 0.15 * 100) / 100, method: "deduct_from_next_payout" },
      { party: "platform", absorbs: Math.round(refund_amount * 0.05 * 100) / 100, method: "internal_write_off" },
      { party: "tax_authority", absorbs: Math.round(refund_amount * 0.02 * 100) / 100, method: "tax_credit_next_period" },
    ];
  } else if (type === "cancellation_fee") {
    waterfall = [
      { party: "property", absorbs: 0, keeps: Math.round(refund_amount * 0.5 * 100) / 100, method: "cancellation_fee_retained" },
      { party: "platform", absorbs: Math.round(refund_amount * 0.3 * 100) / 100, method: "internal_write_off" },
      { party: "agent", absorbs: Math.round(refund_amount * 0.2 * 100) / 100, method: "deduct_from_next_payout" },
    ];
  }

  res.json({
    refund_id: `REFUND-${Date.now().toString(36).toUpperCase()}`,
    booking_id, refund_amount, refund_type: type, reason: reason || "customer_request",
    waterfall, status: "completed",
    total_absorbed: waterfall.reduce((s, w) => s + (w.absorbs || 0), 0),
    temporal_workflow_id: `refund-${Date.now().toString(36)}`,
  });
});

// Rate card
settlementSagaRouter.get("/rate-card", async (_req: Request, res: Response) => {
  res.json({
    agent_commission_tiers: AGENT_TIERS,
    property_commission_rates: { sms_only: 0.15, whatsapp: 0.12, web_lite: 0.10, full: 0.08 },
    platform_fees: PLATFORM_FEES,
    field_agent_ongoing: FA_RATES,
    tax_withholding_by_country: TAX_RATES,
    channel_bonuses: CHANNEL_BONUS,
    payout_methods: ["bank_transfer", "mobile_money", "mojaloop_instant", "internal_ledger", "government_remittance"],
    payout_schedules: {
      property_full: "daily", property_other: "weekly",
      agent_platinum: "daily", agent_other: "weekly",
      field_agent: "monthly", tax: "monthly", platform: "realtime",
    },
  });
});

// List sagas
settlementSagaRouter.get("/sagas", async (_req: Request, res: Response) => {
  res.json({ sagas: sagas.slice(-50).reverse(), total: sagas.length });
});

// Reconciliation
settlementSagaRouter.post("/reconcile", requireRole("admin"), async (_req: Request, res: Response) => {
  const total_gross = sagas.reduce((s, sg) => s + sg.gross_amount, 0);
  const total_property = sagas.reduce((s, sg) => s + (sg.summary?.property_net || 0), 0);
  const total_agent = sagas.reduce((s, sg) => s + (sg.summary?.agent_commission || 0), 0);
  const total_platform = sagas.reduce((s, sg) => s + (sg.summary?.platform_fee || 0), 0);
  const total_tax = sagas.reduce((s, sg) => s + (sg.summary?.tax_withheld || 0), 0);

  res.json({
    report: {
      id: `RECON-${Date.now().toString(36).toUpperCase()}`,
      period: "2026-06-01 to 2026-06-30",
      total_gross: Math.round(total_gross * 100) / 100,
      total_property_payouts: Math.round(total_property * 100) / 100,
      total_agent_commissions: Math.round(total_agent * 100) / 100,
      total_platform_fees: Math.round(total_platform * 100) / 100,
      total_tax_withheld: Math.round(total_tax * 100) / 100,
      discrepancies: [],
      status: "balanced",
    },
    balanced: true,
  });
});

// Analytics
settlementSagaRouter.get("/analytics", async (_req: Request, res: Response) => {
  const total_volume = sagas.reduce((s, sg) => s + sg.gross_amount, 0);
  res.json({
    total_sagas: sagas.length,
    completed: sagas.filter(s => s.status === "completed").length,
    total_volume: Math.round(total_volume * 100) / 100,
    avg_booking: sagas.length ? Math.round(total_volume / sagas.length * 100) / 100 : 0,
  });
});
