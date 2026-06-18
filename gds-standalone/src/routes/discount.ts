import { Router, Request, Response } from "express";
import { query, queryOne } from "../lib/database";
import { cacheDelete } from "../lib/redis";
import { publishEvent, TOPICS } from "../lib/kafka";

export const discountRouter = Router();

discountRouter.get("/", async (_req: Request, res: Response) => {
  const result = await query("SELECT * FROM gds_discounts ORDER BY created_at DESC");
  res.json({ discounts: result.rows, total: result.rowCount });
});

discountRouter.get("/:code", async (req: Request, res: Response) => {
  const row = await queryOne("SELECT * FROM gds_discounts WHERE code = $1", [req.params.code.toUpperCase()]);
  if (!row) return res.status(404).json({ error: "Discount code not found" });
  res.json(row);
});

discountRouter.post("/validate", async (req: Request, res: Response) => {
  const { code, amount, country } = req.body;
  if (!code) return res.status(400).json({ error: "code required" });
  const row = await queryOne("SELECT * FROM gds_discounts WHERE code = $1 AND status = 'active'", [code.toUpperCase()]);
  if (!row) return res.status(404).json({ error: "Invalid or expired discount code" });

  const now = new Date();
  if (row.valid_from && new Date(row.valid_from as string) > now) return res.status(400).json({ error: "Discount not yet active" });
  if (row.valid_until && new Date(row.valid_until as string) < now) return res.status(400).json({ error: "Discount has expired" });
  if (row.max_uses && Number(row.used_count) >= Number(row.max_uses)) return res.status(400).json({ error: "Discount usage limit reached" });
  const gross = Number(amount) || 100000;
  if (gross < Number(row.min_amount || 0)) return res.status(400).json({ error: `Minimum amount is ${row.min_amount}` });

  const countries = row.applicable_countries as string[] || [];
  if (countries.length > 0 && country && !countries.includes(country)) return res.status(400).json({ error: "Discount not valid in your country" });

  let discount: number;
  if (row.type === "percentage") { discount = Math.round(gross * Number(row.value) / 100 * 100) / 100; }
  else { discount = Number(row.value); }

  res.json({ valid: true, code: row.code, type: row.type, value: row.value, original_amount: gross, discount_amount: discount, final_amount: gross - discount, currency: "NGN" });
});

discountRouter.post("/apply", async (req: Request, res: Response) => {
  const { code, amount } = req.body;
  if (!code || !amount) return res.status(400).json({ error: "code and amount required" });
  const row = await queryOne("SELECT * FROM gds_discounts WHERE code = $1 AND status = 'active'", [code.toUpperCase()]);
  if (!row) return res.status(404).json({ error: "Invalid discount code" });

  let discount: number;
  const gross = Number(amount);
  if (row.type === "percentage") { discount = Math.round(gross * Number(row.value) / 100 * 100) / 100; }
  else { discount = Number(row.value); }

  await queryOne("UPDATE gds_discounts SET used_count = used_count + 1 WHERE code = $1", [code.toUpperCase()]);
  await publishEvent({ topic: TOPICS.DISCOUNT_APPLIED, value: { code, amount: gross, discount, final: gross - discount } });
  res.json({ applied: true, code: row.code, discount_amount: discount, final_amount: gross - discount });
});

discountRouter.post("/", async (req: Request, res: Response) => {
  const { code, type, value, min_amount, max_uses, valid_from, valid_until, applicable_countries } = req.body;
  if (!code || !type || !value) return res.status(400).json({ error: "code, type, value required" });
  const result = await queryOne(
    `INSERT INTO gds_discounts (code,type,value,min_amount,max_uses,valid_from,valid_until,applicable_countries)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [code.toUpperCase(), type, value, min_amount || 0, max_uses || null, valid_from || null, valid_until || null, applicable_countries || []]
  );
  res.status(201).json(result);
});

discountRouter.put("/:code", async (req: Request, res: Response) => {
  const { type, value, min_amount, max_uses, valid_from, valid_until, status } = req.body;
  const result = await queryOne(
    `UPDATE gds_discounts SET type=COALESCE($2,type),value=COALESCE($3,value),min_amount=COALESCE($4,min_amount),
     max_uses=COALESCE($5,max_uses),valid_from=COALESCE($6,valid_from),valid_until=COALESCE($7,valid_until),
     status=COALESCE($8,status) WHERE code=$1 RETURNING *`,
    [req.params.code.toUpperCase(), type, value, min_amount, max_uses, valid_from, valid_until, status]
  );
  if (!result) return res.status(404).json({ error: "Discount not found" });
  res.json(result);
});

discountRouter.delete("/:code", async (req: Request, res: Response) => {
  const result = await query("DELETE FROM gds_discounts WHERE code = $1", [req.params.code.toUpperCase()]);
  if (result.rowCount === 0) return res.status(404).json({ error: "Discount not found" });
  res.json({ deleted: true, code: req.params.code.toUpperCase() });
});
