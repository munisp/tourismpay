import { Router, Request, Response } from "express";
import { query, queryOne } from "../lib/database";
import { cacheGet, cacheSet, cacheDelete } from "../lib/redis";
import { publishEvent, TOPICS } from "../lib/kafka";

export const contentRouter = Router();

contentRouter.get("/languages", async (_req: Request, res: Response) => {
  const cached = await cacheGet("content:languages");
  if (cached) return res.json(JSON.parse(cached));
  const result = await query("SELECT * FROM gds_languages WHERE active = true ORDER BY name");
  const resp = { languages: result.rows, total: result.rowCount };
  await cacheSet("content:languages", JSON.stringify(resp), 600);
  res.json(resp);
});

contentRouter.get("/", async (req: Request, res: Response) => {
  const { property_id, language } = req.query;
  let sql = "SELECT c.*, p.name as property_name FROM gds_content c LEFT JOIN gds_properties p ON c.property_id = p.id WHERE 1=1";
  const params: unknown[] = [];
  let idx = 1;
  if (property_id) { sql += ` AND c.property_id = $${idx++}`; params.push(property_id); }
  if (language) { sql += ` AND c.language_code = $${idx++}`; params.push(language); }
  sql += " ORDER BY c.completeness_score DESC";
  const result = await query(sql, params);
  res.json({ content: result.rows, total: result.rowCount });
});

contentRouter.get("/stats", async (_req: Request, res: Response) => {
  const langs = await query("SELECT COUNT(*) as count FROM gds_languages WHERE active = true");
  const content = await query("SELECT COUNT(*) as count, AVG(completeness_score) as avg_score FROM gds_content");
  const amenities = await query("SELECT COUNT(*) as count FROM gds_properties WHERE array_length(amenities, 1) > 0");
  res.json({
    languages: { supported: Number(langs.rows[0]?.count || 0) },
    content: { total_entries: Number(content.rows[0]?.count || 0), avg_completeness: Number(Number(content.rows[0]?.avg_score || 0).toFixed(1)) },
    amenities: { properties_with_amenities: Number(amenities.rows[0]?.count || 0) },
  });
});

contentRouter.post("/", async (req: Request, res: Response) => {
  const { property_id, language_code, title, description, highlights, amenity_categories } = req.body;
  if (!language_code || !title) return res.status(400).json({ error: "language_code and title required" });
  const result = await queryOne(
    `INSERT INTO gds_content (property_id,language_code,title,description,highlights,amenity_categories,completeness_score)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [property_id || null, language_code, title, description || "", highlights || [], JSON.stringify(amenity_categories || {}),
     description && highlights && amenity_categories ? 90 : description ? 60 : 30]
  );
  await cacheDelete("content:languages");
  await publishEvent({ topic: TOPICS.CONTENT_UPDATED, value: { action: "created", language_code } });
  res.status(201).json(result);
});

contentRouter.put("/:id", async (req: Request, res: Response) => {
  const { title, description, highlights, amenity_categories, completeness_score } = req.body;
  const result = await queryOne(
    `UPDATE gds_content SET title=COALESCE($2,title),description=COALESCE($3,description),
     highlights=COALESCE($4,highlights),amenity_categories=COALESCE($5,amenity_categories),
     completeness_score=COALESCE($6,completeness_score),updated_at=NOW() WHERE id=$1 RETURNING *`,
    [req.params.id, title, description, highlights, amenity_categories ? JSON.stringify(amenity_categories) : null, completeness_score]
  );
  if (!result) return res.status(404).json({ error: "Content not found" });
  await publishEvent({ topic: TOPICS.CONTENT_UPDATED, value: { action: "updated", id: req.params.id } });
  res.json(result);
});

contentRouter.delete("/:id", async (req: Request, res: Response) => {
  const result = await query("DELETE FROM gds_content WHERE id = $1", [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: "Content not found" });
  res.json({ deleted: true, id: req.params.id });
});
