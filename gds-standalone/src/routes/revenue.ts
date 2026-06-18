import { Router, Request, Response } from "express";
import { query, queryOne } from "../lib/database";
import { cacheGet, cacheSet } from "../lib/redis";

export const revenueRouter = Router();

revenueRouter.get("/demand-events", async (req: Request, res: Response) => {
  const { country } = req.query;
  const cached = await cacheGet("revenue:demand-events");
  if (cached && !country) return res.json(JSON.parse(cached));

  let sql = "SELECT * FROM gds_demand_events WHERE 1=1";
  const params: unknown[] = [];
  if (country) { sql += " AND country = $1"; params.push(country); }
  sql += " ORDER BY start_date ASC";
  const result = await query(sql, params);
  const resp = { events: result.rows, total: result.rowCount };
  if (!country) await cacheSet("revenue:demand-events", JSON.stringify(resp), 300);
  res.json(resp);
});

revenueRouter.get("/yield", async (req: Request, res: Response) => {
  const { property_id, date } = req.query;
  if (!property_id || !date) return res.status(400).json({ error: "property_id and date required" });

  const prop = await queryOne("SELECT * FROM gds_properties WHERE id = $1", [property_id]);
  if (!prop) return res.status(404).json({ error: "Property not found" });

  const rate = await queryOne("SELECT * FROM gds_rate_plans WHERE property_id = $1 AND date = $2 LIMIT 1", [property_id, date]);
  const avail = await queryOne("SELECT * FROM gds_availability WHERE property_id = $1 AND date = $2 LIMIT 1", [property_id, date]);
  const events = await query("SELECT * FROM gds_demand_events WHERE country = $1 AND start_date <= $2 AND end_date >= $2", [prop.country_code, date]);

  const baseRate = Number(rate?.rate || prop.commission_pct || 85000);
  const totalRooms = Number(avail?.total_rooms || 100);
  const bookedRooms = Number(avail?.booked_rooms || 50);
  const occupancy = totalRooms > 0 ? bookedRooms / totalRooms : 0.5;
  const demandMultiplier = events.rows.length > 0 ? Math.max(...events.rows.map((e: any) => Number(e.demand_multiplier))) : 1.0;
  const occupancyMultiplier = 1 + (occupancy - 0.5) * 0.6;
  const season = demandMultiplier > 1.4 ? "peak" : demandMultiplier > 1.1 ? "high" : "standard";
  const dynamicRate = Math.round(baseRate * occupancyMultiplier * demandMultiplier);

  res.json({
    property: { id: prop.id, name: prop.name, country: prop.country_code },
    yield: { base_rate: baseRate, dynamic_rate: dynamicRate, multiplier: Number((occupancyMultiplier * demandMultiplier).toFixed(2)), season, currency: prop.currency },
    occupancy: { total_rooms: totalRooms, booked: bookedRooms, occupancy_pct: Number((occupancy * 100).toFixed(1)) },
    demand: { active_events: events.rows, event_count: events.rowCount, peak_multiplier: demandMultiplier },
  });
});

revenueRouter.post("/yield/calculate", async (req: Request, res: Response) => {
  const { base_rate, occupancy_pct, season, country } = req.body;
  const base = Number(base_rate) || 85000;
  const occ = Number(occupancy_pct) || 65;
  const events = await query("SELECT * FROM gds_demand_events WHERE country = $1 AND start_date <= CURRENT_DATE AND end_date >= CURRENT_DATE", [country || "NG"]);
  const demandMult = events.rows.length > 0 ? Math.max(...events.rows.map((e: any) => Number(e.demand_multiplier))) : (season === "peak" ? 1.5 : season === "high" ? 1.3 : 1.0);
  const occMult = 1 + ((occ / 100) - 0.5) * 0.6;
  const dynamic = Math.round(base * occMult * demandMult);

  res.json({ base_rate: base, dynamic_rate: dynamic, multiplier: Number((occMult * demandMult).toFixed(2)), season: season || "standard", currency: "NGN" });
});

revenueRouter.get("/competitors", async (req: Request, res: Response) => {
  const { property_id } = req.query;
  if (!property_id) return res.status(400).json({ error: "property_id required" });
  const prop = await queryOne("SELECT * FROM gds_properties WHERE id = $1", [property_id]);
  if (!prop) return res.status(404).json({ error: "Property not found" });
  const competitors = await query("SELECT id,name,type,star_rating,city,currency,commission_pct FROM gds_properties WHERE city = $1 AND id != $2 LIMIT 10", [prop.city, property_id]);
  res.json({ property: { id: prop.id, name: prop.name }, competitors: competitors.rows, total: competitors.rowCount });
});
