import { Router, Request, Response } from "express";
import { query, queryOne, transaction } from "../lib/database";
import { publishEvent, TOPICS } from "../lib/kafka";
import crypto from "crypto";

export const settlementSagaRouter = Router();

settlementSagaRouter.get("/", async (_req: Request, res: Response) => {
  const result = await query("SELECT * FROM gds_settlement_sagas ORDER BY created_at DESC LIMIT 50");
  res.json({ sagas: result.rows, total: result.rowCount });
});

settlementSagaRouter.get("/:id", async (req: Request, res: Response) => {
  const row = await queryOne("SELECT * FROM gds_settlement_sagas WHERE id = $1", [req.params.id]);
  if (!row) return res.status(404).json({ error: "Saga not found" });
  res.json(row);
});

settlementSagaRouter.post("/execute", async (req: Request, res: Response) => {
  const { booking_id, amount, country } = req.body;
  if (!booking_id || !amount) return res.status(400).json({ error: "booking_id and amount required" });
  const gross = Number(amount);
  const cc = country || "NG";
  const idempotencyKey = `saga-${booking_id}-${Date.now()}`;

  const existing = await queryOne("SELECT * FROM gds_settlement_sagas WHERE booking_id = $1 ORDER BY created_at DESC LIMIT 1", [booking_id]);
  if (existing) return res.json({ saga: existing, message: "Settlement already processed", idempotent: true });

  const taxRate = 0.02; const platformRate = 0.03; const agentRate = 0.16; const fieldRate = 0.01;
  const tax = Math.round(gross * taxRate * 100) / 100;
  const platform = Math.round(gross * platformRate * 100) / 100;
  const agent = Math.round(gross * agentRate * 100) / 100;
  const field = Math.round(gross * fieldRate * 100) / 100;
  const property = Math.round((gross - tax - platform - agent - field) * 100) / 100;

  const steps = [
    { step: 1, name: "calculate_tax", amount: tax, status: "completed", timestamp: new Date().toISOString() },
    { step: 2, name: "deduct_platform_fee", amount: platform, status: "completed", timestamp: new Date().toISOString() },
    { step: 3, name: "pay_agent_commission", amount: agent, status: "completed", timestamp: new Date().toISOString() },
    { step: 4, name: "pay_field_agent", amount: field, status: "completed", timestamp: new Date().toISOString() },
    { step: 5, name: "remit_to_property", amount: property, status: "completed", timestamp: new Date().toISOString() },
  ];

  const result = await queryOne(
    "INSERT INTO gds_settlement_sagas (booking_id,gross_amount,currency,country,steps,status,idempotency_key) VALUES ($1,$2,$3,$4,$5,'completed',$6) RETURNING *",
    [booking_id, gross, cc === "NG" ? "NGN" : "USD", cc, JSON.stringify(steps), idempotencyKey]
  );
  await publishEvent({ topic: TOPICS.SETTLEMENT_COMPLETED, key: booking_id, value: { booking_id, gross, tax, platform, agent, field, property } });
  res.status(201).json({ saga: result, steps, total_distributed: tax + platform + agent + field + property });
});

settlementSagaRouter.get("/rates/card", async (_req: Request, res: Response) => {
  res.json({
    rates: {
      NG: { tax: 0.02, platform: 0.03, agent: 0.16, field_agent: 0.01, property: 0.78, currency: "NGN" },
      KE: { tax: 0.02, platform: 0.03, agent: 0.15, field_agent: 0.01, property: 0.79, currency: "KES" },
      GH: { tax: 0.025, platform: 0.03, agent: 0.15, field_agent: 0.01, property: 0.785, currency: "GHS" },
    },
  });
});
