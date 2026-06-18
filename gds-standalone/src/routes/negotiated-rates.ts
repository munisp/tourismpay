import { Router, Request, Response } from "express";
import { query, queryOne } from "../lib/database";
import { cacheGet, cacheSet, cacheDelete } from "../lib/redis";

export const negotiatedRatesRouter = Router();

negotiatedRatesRouter.get("/", async (_req: Request, res: Response) => {
  const cached = await cacheGet("negrates:list");
  if (cached) return res.json(JSON.parse(cached));
  const result = await query("SELECT * FROM gds_negotiated_rates WHERE status = 'active' ORDER BY created_at DESC");
  const resp = { agreements: result.rows, total: result.rowCount };
  await cacheSet("negrates:list", JSON.stringify(resp), 300);
  res.json(resp);
});

negotiatedRatesRouter.get("/:id", async (req: Request, res: Response) => {
  const row = await queryOne("SELECT * FROM gds_negotiated_rates WHERE id = $1", [req.params.id]);
  if (!row) return res.status(404).json({ error: "Agreement not found" });
  res.json(row);
});

negotiatedRatesRouter.get("/corporate/:corp_id", async (req: Request, res: Response) => {
  const row = await queryOne("SELECT * FROM gds_negotiated_rates WHERE corporate_id = $1 AND status = 'active'", [req.params.corp_id]);
  if (!row) return res.status(404).json({ error: "Corporate agreement not found" });
  res.json(row);
});

negotiatedRatesRouter.post("/", async (req: Request, res: Response) => {
  const { corporate_id, corporate_name, agreement_type, discount_pct, valid_from, valid_until } = req.body;
  if (!corporate_id || !corporate_name || !discount_pct) return res.status(400).json({ error: "corporate_id, corporate_name, discount_pct required" });
  const result = await queryOne(
    "INSERT INTO gds_negotiated_rates (corporate_id,corporate_name,agreement_type,discount_pct,valid_from,valid_until) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
    [corporate_id, corporate_name, agreement_type || "corporate", discount_pct, valid_from || null, valid_until || null]
  );
  await cacheDelete("negrates:list");
  res.status(201).json(result);
});

negotiatedRatesRouter.put("/:id", async (req: Request, res: Response) => {
  const { corporate_name, agreement_type, discount_pct, valid_from, valid_until, status } = req.body;
  const result = await queryOne(
    `UPDATE gds_negotiated_rates SET corporate_name=COALESCE($2,corporate_name),agreement_type=COALESCE($3,agreement_type),
     discount_pct=COALESCE($4,discount_pct),valid_from=COALESCE($5,valid_from),valid_until=COALESCE($6,valid_until),
     status=COALESCE($7,status) WHERE id=$1 RETURNING *`,
    [req.params.id, corporate_name, agreement_type, discount_pct, valid_from, valid_until, status]
  );
  if (!result) return res.status(404).json({ error: "Agreement not found" });
  await cacheDelete("negrates:list");
  res.json(result);
});

negotiatedRatesRouter.delete("/:id", async (req: Request, res: Response) => {
  const result = await query("DELETE FROM gds_negotiated_rates WHERE id = $1", [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: "Agreement not found" });
  await cacheDelete("negrates:list");
  res.json({ deleted: true, id: req.params.id });
});

negotiatedRatesRouter.post("/calculate", async (req: Request, res: Response) => {
  const { corporate_id, public_rate } = req.body;
  if (!corporate_id || !public_rate) return res.status(400).json({ error: "corporate_id and public_rate required" });
  const row = await queryOne("SELECT * FROM gds_negotiated_rates WHERE corporate_id = $1 AND status = 'active'", [corporate_id]);
  if (!row) return res.status(404).json({ error: "No active agreement for this corporate ID" });
  const rate = Number(public_rate);
  const discount = Number(row.discount_pct);
  const negotiated = Math.round(rate * (1 - discount / 100));
  const savings = rate - negotiated;
  res.json({ corporate_id, corporate_name: row.corporate_name, public_rate: rate, negotiated_rate: negotiated, discount_pct: discount, savings, currency: "NGN" });
});
