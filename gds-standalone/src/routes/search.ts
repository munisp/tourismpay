import { Router, Request, Response } from "express";
import { query, queryOne } from "../lib/database";
import { cacheGet, cacheSet } from "../lib/redis";

export const searchRouter = Router();
const TENANT_ID = "00000000-0000-0000-0000-000000000001";

searchRouter.get("/", async (req: Request, res: Response) => {
  const { q, country, type, star_rating, check_in, check_out, guests: guestCount, min_rate, max_rate } = req.query;

  let sql = "SELECT * FROM gds_properties WHERE tenant_id = $1 AND status = 'active'";
  const params: unknown[] = [TENANT_ID];
  let idx = 2;

  if (q) { sql += ` AND (name ILIKE $${idx} OR city ILIKE $${idx} OR region ILIKE $${idx})`; params.push(`%${q}%`); idx++; }
  if (country) { sql += ` AND country_code = $${idx++}`; params.push(country); }
  if (type) { sql += ` AND type = $${idx++}`; params.push(type); }
  if (star_rating) { sql += ` AND star_rating >= $${idx++}`; params.push(Number(star_rating)); }
  sql += " ORDER BY star_rating DESC NULLS LAST, name ASC LIMIT 50";

  const result = await query(sql, params);

  // Log search to gds_search_log
  await query("INSERT INTO gds_search_log (tenant_id,query,filters,results_count) VALUES ($1,$2,$3,$4)",
    [TENANT_ID, q || "", JSON.stringify({ country, type, star_rating, check_in, check_out, guests: guestCount, min_rate, max_rate }), result.rowCount]);

  res.json({ results: result.rows, total: result.rowCount, query: q || "" });
});

searchRouter.get("/destinations", async (_req: Request, res: Response) => {
  const cached = await cacheGet("search:destinations");
  if (cached) return res.json(JSON.parse(cached));

  const result = await query(
    `SELECT city, country_code, COUNT(*) as property_count, MIN(commission_pct) as min_rate
     FROM gds_properties WHERE tenant_id = $1 AND status = 'active' AND city IS NOT NULL
     GROUP BY city, country_code ORDER BY property_count DESC LIMIT 20`,
    [TENANT_ID]
  );
  const resp = { destinations: result.rows, total: result.rowCount };
  await cacheSet("search:destinations", JSON.stringify(resp), 600);
  res.json(resp);
});

searchRouter.get("/autocomplete", async (req: Request, res: Response) => {
  const { q } = req.query;
  if (!q || String(q).length < 2) return res.json({ suggestions: [] });
  const result = await query(
    "SELECT DISTINCT name, city, country_code FROM gds_properties WHERE tenant_id = $1 AND (name ILIKE $2 OR city ILIKE $2) AND status = 'active' LIMIT 10",
    [TENANT_ID, `%${q}%`]
  );
  res.json({ suggestions: result.rows });
});

searchRouter.get("/filters", async (_req: Request, res: Response) => {
  const countries = await query("SELECT DISTINCT country_code FROM gds_properties WHERE tenant_id = $1 AND status = 'active' ORDER BY country_code", [TENANT_ID]);
  const types = await query("SELECT DISTINCT type FROM gds_properties WHERE tenant_id = $1 AND status = 'active' ORDER BY type", [TENANT_ID]);
  const stars = await query("SELECT DISTINCT star_rating FROM gds_properties WHERE tenant_id = $1 AND status = 'active' AND star_rating IS NOT NULL ORDER BY star_rating DESC", [TENANT_ID]);
  res.json({
    countries: countries.rows.map((r: any) => r.country_code),
    types: types.rows.map((r: any) => r.type),
    star_ratings: stars.rows.map((r: any) => r.star_rating),
  });
});
