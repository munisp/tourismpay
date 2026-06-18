import { Router, Request, Response } from "express";
import { query, queryOne } from "../lib/database";
import { cacheGet, cacheSet, cacheDelete } from "../lib/redis";
import { publishEvent, TOPICS } from "../lib/kafka";

export const guestProfileRouter = Router();
const TENANT_ID = "00000000-0000-0000-0000-000000000001";

guestProfileRouter.get("/search", async (req: Request, res: Response) => {
  const { q, limit } = req.query;
  const cached = await cacheGet("guests:list");
  if (cached && !q) return res.json(JSON.parse(cached));

  let sql = "SELECT * FROM gds_guest_profiles WHERE tenant_id = $1";
  const params: unknown[] = [TENANT_ID];
  if (q && String(q).length > 0) { sql += " AND (name ILIKE $2 OR email ILIKE $2)"; params.push(`%${q}%`); }
  sql += ` ORDER BY total_spend DESC LIMIT ${Number(limit) || 50}`;

  const result = await query(sql, params);
  const resp = { guests: result.rows, total: result.rowCount };
  if (!q) await cacheSet("guests:list", JSON.stringify(resp), 120);
  res.json(resp);
});

guestProfileRouter.get("/:id", async (req: Request, res: Response) => {
  const row = await queryOne("SELECT * FROM gds_guest_profiles WHERE id = $1 AND tenant_id = $2", [req.params.id, TENANT_ID]);
  if (!row) return res.status(404).json({ error: "Guest not found" });
  res.json(row);
});

guestProfileRouter.post("/", async (req: Request, res: Response) => {
  const { first_name, last_name, email, phone, nationality, tier } = req.body;
  const name = `${first_name || ""} ${last_name || ""}`.trim();
  if (!name || !email) return res.status(400).json({ error: "name and email required" });

  const result = await queryOne(
    `INSERT INTO gds_guest_profiles (tenant_id, name, email, phone, country_code, loyalty_tier, preferences)
     VALUES ($1,$2,$3,$4,$5,$6,'{}') RETURNING *`,
    [TENANT_ID, name, email, phone || null, nationality || "NG", tier || "bronze"]
  );
  await cacheDelete("guests:list");
  await publishEvent({ topic: TOPICS.GUEST_CREATED, key: result?.id as string, value: { name, email, tier } });
  res.status(201).json(result);
});

guestProfileRouter.put("/:id", async (req: Request, res: Response) => {
  const { first_name, last_name, email, phone, nationality, tier } = req.body;
  const name = first_name && last_name ? `${first_name} ${last_name}` : null;
  const result = await queryOne(
    `UPDATE gds_guest_profiles SET name=COALESCE($2,name), email=COALESCE($3,email), phone=COALESCE($4,phone),
     country_code=COALESCE($5,country_code), loyalty_tier=COALESCE($6,loyalty_tier), updated_at=NOW()
     WHERE id=$1 AND tenant_id=$7 RETURNING *`,
    [req.params.id, name, email, phone, nationality, tier, TENANT_ID]
  );
  if (!result) return res.status(404).json({ error: "Guest not found" });
  await cacheDelete("guests:list");
  await publishEvent({ topic: TOPICS.GUEST_UPDATED, key: req.params.id, value: { id: req.params.id } });
  res.json(result);
});

guestProfileRouter.delete("/:id", async (req: Request, res: Response) => {
  const result = await query("DELETE FROM gds_guest_profiles WHERE id = $1 AND tenant_id = $2", [req.params.id, TENANT_ID]);
  if (result.rowCount === 0) return res.status(404).json({ error: "Guest not found" });
  await cacheDelete("guests:list");
  res.json({ deleted: true, id: req.params.id });
});
