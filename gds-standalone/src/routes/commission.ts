import { Router, Request, Response } from "express";
import { query, queryOne } from "../lib/database";
import { publishEvent, TOPICS } from "../lib/kafka";

export const commissionRouter = Router();

const COMMISSION_RATES: Record<string, { tax: number; platform: number; agent: Record<string, number>; field_agent: number }> = {
  NG: { tax: 0.02, platform: 0.03, agent: { bronze: 0.10, silver: 0.12, gold: 0.15, platinum: 0.18 }, field_agent: 0.01 },
  KE: { tax: 0.02, platform: 0.03, agent: { bronze: 0.10, silver: 0.12, gold: 0.15, platinum: 0.18 }, field_agent: 0.01 },
  GH: { tax: 0.025, platform: 0.03, agent: { bronze: 0.10, silver: 0.12, gold: 0.15, platinum: 0.18 }, field_agent: 0.01 },
};

commissionRouter.get("/rates", async (_req: Request, res: Response) => {
  res.json({ rates: COMMISSION_RATES, countries: Object.keys(COMMISSION_RATES) });
});

commissionRouter.post("/simulate", async (req: Request, res: Response) => {
  const { amount, country, agent_tier, property_tier } = req.body;
  const gross = Number(amount) || 500;
  const cc = String(country || "NG").toUpperCase();
  const rates = COMMISSION_RATES[cc] || COMMISSION_RATES["NG"];
  const tier = agent_tier || "gold";

  const tax = Math.round(gross * rates.tax * 100) / 100;
  const platform = Math.round(gross * rates.platform * 100) / 100;
  const agentPct = rates.agent[tier] || 0.15;
  const agent = Math.round(gross * agentPct * 100) / 100;
  const field = Math.round(gross * rates.field_agent * 100) / 100;
  const property = Math.round((gross - tax - platform - agent - field) * 100) / 100;

  res.json({ gross, currency: cc === "NG" ? "NGN" : "USD", country: cc, splits: { tax, platform_fee: platform, agent_commission: agent, field_agent_fee: field, property_net: property }, total_distributed: tax + platform + agent + field + property, agent_tier: tier, property_tier: property_tier || "standard" });
});

commissionRouter.post("/calculate", async (req: Request, res: Response) => {
  const { booking_id, amount, country, agent_tier } = req.body;
  if (!booking_id || !amount) return res.status(400).json({ error: "booking_id and amount required" });
  const gross = Number(amount);
  const cc = String(country || "NG").toUpperCase();
  const rates = COMMISSION_RATES[cc] || COMMISSION_RATES["NG"];
  const tier = agent_tier || "gold";

  const tax = Math.round(gross * rates.tax * 100) / 100;
  const platform = Math.round(gross * rates.platform * 100) / 100;
  const agentPct = rates.agent[tier] || 0.15;
  const agent = Math.round(gross * agentPct * 100) / 100;
  const field = Math.round(gross * rates.field_agent * 100) / 100;
  const property = Math.round((gross - tax - platform - agent - field) * 100) / 100;

  const result = await queryOne(
    `INSERT INTO gds_commission_splits (booking_id,gross_amount,currency,country_code,agent_tier,property_tier,tax_amount,platform_fee,agent_commission,field_agent_fee,property_net)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [booking_id, gross, cc === "NG" ? "NGN" : "USD", cc, tier, req.body.property_tier || "standard", tax, platform, agent, field, property]
  );
  await publishEvent({ topic: TOPICS.COMMISSION_SPLIT, key: booking_id, value: { booking_id, gross, tax, platform, agent, field, property } });
  res.status(201).json(result);
});

commissionRouter.get("/splits", async (_req: Request, res: Response) => {
  const result = await query("SELECT * FROM gds_commission_splits ORDER BY created_at DESC LIMIT 50");
  res.json({ splits: result.rows, total: result.rowCount });
});

commissionRouter.get("/splits/:booking_id", async (req: Request, res: Response) => {
  const row = await queryOne("SELECT * FROM gds_commission_splits WHERE booking_id = $1", [req.params.booking_id]);
  if (!row) return res.status(404).json({ error: "Split not found" });
  res.json(row);
});
