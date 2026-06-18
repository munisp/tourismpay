import { Router, Request, Response } from "express";
import { query, queryOne } from "../lib/database";
import { cacheGet, cacheSet, cacheDelete } from "../lib/redis";
import { publishEvent, TOPICS } from "../lib/kafka";

export const ratesRouter = Router();

ratesRouter.get("/", async (req: Request, res: Response) => {
  const { property_id, room_type_code, from_date, to_date } = req.query;
  let sql = "SELECT rp.*, p.name as property_name FROM gds_rate_plans rp JOIN gds_properties p ON rp.property_id = p.id WHERE 1=1";
  const params: unknown[] = [];
  let idx = 1;
  if (property_id) { sql += ` AND rp.property_id = $${idx++}`; params.push(property_id); }
  if (room_type_code) { sql += ` AND rp.room_type_code = $${idx++}`; params.push(room_type_code); }
  if (from_date) { sql += ` AND rp.date >= $${idx++}`; params.push(from_date); }
  if (to_date) { sql += ` AND rp.date <= $${idx++}`; params.push(to_date); }
  sql += " ORDER BY rp.date ASC LIMIT 100";
  const result = await query(sql, params);
  res.json({ rates: result.rows, total: result.rowCount });
});

ratesRouter.post("/", async (req: Request, res: Response) => {
  const { property_id, room_type_code, rate_plan_code, date, rate, currency, meal_plan, min_stay } = req.body;
  if (!property_id || !room_type_code || !date || !rate) return res.status(400).json({ error: "property_id, room_type_code, date, rate required" });
  const result = await queryOne(
    "INSERT INTO gds_rate_plans (property_id,room_type_code,rate_plan_code,date,rate,currency,meal_plan,min_stay) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
    [property_id, room_type_code, rate_plan_code || "BAR", date, rate, currency || "NGN", meal_plan || "RO", min_stay || 1]
  );
  await publishEvent({ topic: TOPICS.RATE_CHANGED, value: { property_id, room_type_code, date, rate } });
  res.status(201).json(result);
});

ratesRouter.put("/:id", async (req: Request, res: Response) => {
  const { rate, currency, meal_plan, min_stay, stop_sell } = req.body;
  const result = await queryOne(
    "UPDATE gds_rate_plans SET rate=COALESCE($2,rate),currency=COALESCE($3,currency),meal_plan=COALESCE($4,meal_plan),min_stay=COALESCE($5,min_stay),stop_sell=COALESCE($6,stop_sell),updated_at=NOW() WHERE id=$1 RETURNING *",
    [req.params.id, rate, currency, meal_plan, min_stay, stop_sell]
  );
  if (!result) return res.status(404).json({ error: "Rate plan not found" });
  await publishEvent({ topic: TOPICS.RATE_CHANGED, value: { id: req.params.id, rate } });
  res.json(result);
});

ratesRouter.delete("/:id", async (req: Request, res: Response) => {
  const result = await query("DELETE FROM gds_rate_plans WHERE id = $1", [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: "Rate plan not found" });
  res.json({ deleted: true, id: req.params.id });
});
