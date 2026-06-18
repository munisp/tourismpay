import { Router, Request, Response } from "express";
import { query, queryOne } from "../lib/database";
import { publishEvent, TOPICS } from "../lib/kafka";

export const cancellationRouter = Router();

cancellationRouter.get("/policies", async (req: Request, res: Response) => {
  const { property_id } = req.query;
  let sql = "SELECT cp.*, p.name as property_name FROM gds_cancellation_policies cp LEFT JOIN gds_properties p ON cp.property_id = p.id WHERE 1=1";
  const params: unknown[] = [];
  if (property_id) { sql += " AND cp.property_id = $1"; params.push(property_id); }
  sql += " ORDER BY cp.created_at DESC";
  const result = await query(sql, params);
  res.json({ policies: result.rows, total: result.rowCount });
});

cancellationRouter.get("/policies/:id", async (req: Request, res: Response) => {
  const row = await queryOne("SELECT * FROM gds_cancellation_policies WHERE id = $1", [req.params.id]);
  if (!row) return res.status(404).json({ error: "Policy not found" });
  res.json(row);
});

cancellationRouter.post("/policies", async (req: Request, res: Response) => {
  const { property_id, policy_type, tiers, refund_waterfall } = req.body;
  if (!policy_type) return res.status(400).json({ error: "policy_type required" });
  const result = await queryOne(
    "INSERT INTO gds_cancellation_policies (property_id,policy_type,tiers,refund_waterfall) VALUES ($1,$2,$3,$4) RETURNING *",
    [property_id || null, policy_type, JSON.stringify(tiers || []), JSON.stringify(refund_waterfall || {})]
  );
  res.status(201).json(result);
});

cancellationRouter.put("/policies/:id", async (req: Request, res: Response) => {
  const { policy_type, tiers, refund_waterfall } = req.body;
  const result = await queryOne(
    "UPDATE gds_cancellation_policies SET policy_type=COALESCE($2,policy_type),tiers=COALESCE($3,tiers),refund_waterfall=COALESCE($4,refund_waterfall) WHERE id=$1 RETURNING *",
    [req.params.id, policy_type, tiers ? JSON.stringify(tiers) : null, refund_waterfall ? JSON.stringify(refund_waterfall) : null]
  );
  if (!result) return res.status(404).json({ error: "Policy not found" });
  res.json(result);
});

cancellationRouter.delete("/policies/:id", async (req: Request, res: Response) => {
  const result = await query("DELETE FROM gds_cancellation_policies WHERE id = $1", [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: "Policy not found" });
  res.json({ deleted: true, id: req.params.id });
});

cancellationRouter.post("/simulate", async (req: Request, res: Response) => {
  const { policy_type, amount, days_before, reason } = req.body;
  const gross = Number(amount) || 750;
  const days = Number(days_before) || 5;
  const ptype = policy_type || "moderate";

  if (reason === "force_majeure") return res.json({ policy_type: ptype, amount: gross, days_before: days, reason, penalty_pct: 0, fee: 0, refund: gross, currency: "NGN" });

  const policies: Record<string, { days: number; pct: number }[]> = {
    flexible: [{ days: 0, pct: 100 }, { days: 1, pct: 50 }, { days: 3, pct: 0 }],
    moderate: [{ days: 0, pct: 100 }, { days: 3, pct: 50 }, { days: 7, pct: 25 }, { days: 14, pct: 0 }],
    strict: [{ days: 0, pct: 100 }, { days: 7, pct: 75 }, { days: 14, pct: 50 }, { days: 30, pct: 25 }],
    non_refundable: [{ days: 0, pct: 100 }],
  };
  const tiers = policies[ptype] || policies.moderate;
  let penaltyPct = tiers[tiers.length - 1].pct;
  for (const t of tiers) { if (days >= t.days) { penaltyPct = t.pct; } else { break; } }
  for (let i = tiers.length - 1; i >= 0; i--) { if (days >= tiers[i].days) { penaltyPct = tiers[i].pct; break; } }

  const fee = Math.round(gross * penaltyPct / 100 * 100) / 100;
  const refund = Math.round((gross - fee) * 100) / 100;

  await publishEvent({ topic: TOPICS.CANCELLATION_FEE, value: { policy_type: ptype, amount: gross, fee, refund, days_before: days } });
  res.json({ policy_type: ptype, amount: gross, days_before: days, penalty_pct: penaltyPct, fee, refund, currency: "NGN", waterfall: { property: Math.round(fee * 0.5), platform: Math.round(fee * 0.3), agent: Math.round(fee * 0.2) } });
});
