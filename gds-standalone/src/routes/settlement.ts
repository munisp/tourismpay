import { Router, Request, Response } from "express";
import { query, queryOne } from "../lib/database";

export const settlementRouter = Router();
const TENANT_ID = "00000000-0000-0000-0000-000000000001";

settlementRouter.get("/batches", async (_req: Request, res: Response) => {
  const result = await query("SELECT * FROM gds_settlement_batches WHERE tenant_id = $1 ORDER BY created_at DESC", [TENANT_ID]);
  res.json({ batches: result.rows, total: result.rowCount });
});

settlementRouter.get("/batches/:id", async (req: Request, res: Response) => {
  const row = await queryOne("SELECT * FROM gds_settlement_batches WHERE id = $1 AND tenant_id = $2", [req.params.id, TENANT_ID]);
  if (!row) return res.status(404).json({ error: "Batch not found" });
  res.json(row);
});

settlementRouter.post("/batches", async (req: Request, res: Response) => {
  const { property_id, agent_id, period, total_gross, total_commission, total_net, currency, payout_method } = req.body;
  if (!period || !total_gross) return res.status(400).json({ error: "period and total_gross required" });
  const result = await queryOne(
    `INSERT INTO gds_settlement_batches (tenant_id,property_id,agent_id,period,total_gross,total_commission,total_net,currency,payout_method)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [TENANT_ID, property_id || null, agent_id || null, period, total_gross, total_commission || 0, total_net || total_gross, currency || "NGN", payout_method || "bank_transfer"]
  );
  res.status(201).json(result);
});

settlementRouter.put("/batches/:id/settle", async (req: Request, res: Response) => {
  const result = await queryOne("UPDATE gds_settlement_batches SET status='settled',settled_at=NOW(),payout_ref=$2 WHERE id=$1 AND tenant_id=$3 RETURNING *", [req.params.id, req.body.payout_ref || `PAY-${Date.now()}`, TENANT_ID]);
  if (!result) return res.status(404).json({ error: "Batch not found" });
  res.json(result);
});
