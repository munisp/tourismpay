import { Router, Request, Response } from "express";
import { query, queryOne } from "../lib/database";
import { cacheGet, cacheSet, cacheDelete } from "../lib/redis";
import { publishEvent, TOPICS } from "../lib/kafka";

export const propertiesRouter = Router();
const TENANT_ID = "00000000-0000-0000-0000-000000000001";

propertiesRouter.get("/", async (req: Request, res: Response) => {
  const { country, type, status } = req.query;
  const cached = await cacheGet("properties:list");
  if (cached && !country && !type && !status) return res.json(JSON.parse(cached));

  let sql = "SELECT * FROM gds_properties WHERE tenant_id = $1";
  const params: unknown[] = [TENANT_ID];
  let idx = 2;
  if (country) { sql += ` AND country_code = $${idx++}`; params.push(country); }
  if (type) { sql += ` AND type = $${idx++}`; params.push(type); }
  if (status) { sql += ` AND status = $${idx++}`; params.push(status); }
  sql += " ORDER BY created_at DESC";

  const result = await query(sql, params);
  const resp = { properties: result.rows, total: result.rowCount };
  if (!country && !type && !status) await cacheSet("properties:list", JSON.stringify(resp), 120);
  res.json(resp);
});

propertiesRouter.get("/:id", async (req: Request, res: Response) => {
  const cached = await cacheGet(`properties:${req.params.id}`);
  if (cached) return res.json(JSON.parse(cached));

  const row = await queryOne("SELECT * FROM gds_properties WHERE id = $1 AND tenant_id = $2", [req.params.id, TENANT_ID]);
  if (!row) return res.status(404).json({ error: "Property not found" });

  const rooms = await query("SELECT * FROM gds_room_types WHERE property_id = $1", [req.params.id]);
  const resp = { ...row, room_types: rooms.rows };
  await cacheSet(`properties:${req.params.id}`, JSON.stringify(resp), 300);
  res.json(resp);
});

propertiesRouter.post("/", async (req: Request, res: Response) => {
  const { name, type, country_code, city, star_rating, currency, commission_pct, amenities, contact_email, contact_phone, property_code } = req.body;
  if (!name || !type || !country_code) return res.status(400).json({ error: "name, type, country_code required" });

  const result = await queryOne(
    `INSERT INTO gds_properties (tenant_id, name, type, country_code, city, star_rating, currency, commission_pct, amenities, contact_email, contact_phone, property_code, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending')
     RETURNING *`,
    [TENANT_ID, name, type, country_code, city || null, star_rating || null, currency || "NGN", commission_pct || 15, amenities || [], contact_email || null, contact_phone || null, property_code || null]
  );
  await cacheDelete("properties:list");
  await publishEvent({ topic: TOPICS.AVAILABILITY_UPDATED, key: result?.id as string, value: { action: "property_created", property: result } });
  res.status(201).json(result);
});

propertiesRouter.put("/:id", async (req: Request, res: Response) => {
  const { name, type, country_code, city, star_rating, currency, commission_pct, amenities, contact_email, contact_phone, status } = req.body;
  const result = await queryOne(
    `UPDATE gds_properties SET name=COALESCE($2,name), type=COALESCE($3,type), country_code=COALESCE($4,country_code),
     city=COALESCE($5,city), star_rating=COALESCE($6,star_rating), currency=COALESCE($7,currency),
     commission_pct=COALESCE($8,commission_pct), amenities=COALESCE($9,amenities), contact_email=COALESCE($10,contact_email),
     contact_phone=COALESCE($11,contact_phone), status=COALESCE($12,status), updated_at=NOW()
     WHERE id=$1 AND tenant_id=$13 RETURNING *`,
    [req.params.id, name, type, country_code, city, star_rating, currency, commission_pct, amenities, contact_email, contact_phone, status, TENANT_ID]
  );
  if (!result) return res.status(404).json({ error: "Property not found" });
  await cacheDelete("properties:list");
  await cacheDelete(`properties:${req.params.id}`);
  res.json(result);
});

propertiesRouter.delete("/:id", async (req: Request, res: Response) => {
  const result = await query("DELETE FROM gds_properties WHERE id = $1 AND tenant_id = $2", [req.params.id, TENANT_ID]);
  if (result.rowCount === 0) return res.status(404).json({ error: "Property not found" });
  await cacheDelete("properties:list");
  await cacheDelete(`properties:${req.params.id}`);
  res.json({ deleted: true, id: req.params.id });
});
