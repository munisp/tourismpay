import { Router, Request, Response } from "express";
import { query, queryOne } from "../lib/database";

export const tippingRouter = Router();

tippingRouter.get("/templates", async (req: Request, res: Response) => {
  const { country } = req.query;
  let sql = "SELECT * FROM gds_tipping_templates WHERE 1=1";
  const params: unknown[] = [];
  if (country) { sql += " AND country = $1"; params.push(country); }
  sql += " ORDER BY service_type";
  const result = await query(sql, params);
  res.json({ templates: result.rows, total: result.rowCount });
});

tippingRouter.post("/calculate", async (req: Request, res: Response) => {
  const { amount, service_type, country, recipients } = req.body;
  if (!amount) return res.status(400).json({ error: "amount required" });
  const gross = Number(amount);
  const tmpl = await queryOne("SELECT * FROM gds_tipping_templates WHERE country = $1 AND service_type = $2", [country || "NG", service_type || "restaurant"]);
  const pct = Number(tmpl?.suggested_pct || 10) / 100;
  const tipAmount = Math.round(gross * pct * 100) / 100;
  const recips = recipients || [{ name: "Staff", share: 100 }];
  const splits = recips.map((r: any) => ({ name: r.name, share: r.share, amount: Math.round(tipAmount * r.share / 100 * 100) / 100 }));

  const result = await queryOne(
    "INSERT INTO gds_tip_records (booking_id,total_amount,currency,split_mode,recipients) VALUES ($1,$2,'NGN',$3,$4) RETURNING *",
    [req.body.booking_id || null, tipAmount, recipients && recipients.length > 1 ? "custom" : "equal", JSON.stringify(splits)]
  );
  res.json({ tip: result, summary: { bill_amount: gross, tip_amount: tipAmount, tip_pct: Number(tmpl?.suggested_pct || 10), currency: "NGN", splits } });
});

tippingRouter.get("/records", async (_req: Request, res: Response) => {
  const result = await query("SELECT * FROM gds_tip_records ORDER BY created_at DESC LIMIT 50");
  res.json({ records: result.rows, total: result.rowCount });
});
