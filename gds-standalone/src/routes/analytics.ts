import { Router, Request, Response } from "express";
import { query } from "../lib/database";
import { cacheGet, cacheSet } from "../lib/redis";

export const analyticsRouter = Router();
const TENANT_ID = "00000000-0000-0000-0000-000000000001";

analyticsRouter.get("/overview", async (_req: Request, res: Response) => {
  const cached = await cacheGet("analytics:overview");
  if (cached) return res.json(JSON.parse(cached));

  const props = await query("SELECT COUNT(*) as count FROM gds_properties WHERE tenant_id = $1", [TENANT_ID]);
  const agents = await query("SELECT COUNT(*) as count FROM gds_agents WHERE tenant_id = $1", [TENANT_ID]);
  const pnrs = await query("SELECT COUNT(*) as count FROM gds_pnr_records WHERE tenant_id = $1", [TENANT_ID]);
  const guests = await query("SELECT COUNT(*) as count, SUM(total_spend) as total_spend FROM gds_guest_profiles WHERE tenant_id = $1", [TENANT_ID]);
  const reservations = await query("SELECT COUNT(*) as count, SUM(total_amount) as total_revenue FROM gds_reservations WHERE tenant_id = $1", [TENANT_ID]);
  const groups = await query("SELECT COUNT(*) as count, SUM(rooms_blocked) as total_rooms FROM gds_group_bookings WHERE tenant_id = $1", [TENANT_ID]);

  const resp = {
    properties: Number(props.rows[0]?.count || 0),
    agents: Number(agents.rows[0]?.count || 0),
    pnrs: Number(pnrs.rows[0]?.count || 0),
    guests: Number(guests.rows[0]?.count || 0),
    guest_total_spend: Number(guests.rows[0]?.total_spend || 0),
    reservations: Number(reservations.rows[0]?.count || 0),
    total_revenue: Number(reservations.rows[0]?.total_revenue || 0),
    groups: Number(groups.rows[0]?.count || 0),
    group_rooms: Number(groups.rows[0]?.total_rooms || 0),
    currency: "NGN",
  };
  await cacheSet("analytics:overview", JSON.stringify(resp), 60);
  res.json(resp);
});

analyticsRouter.get("/bookings", async (req: Request, res: Response) => {
  const { period } = req.query;
  const interval = period === "weekly" ? "7 days" : period === "yearly" ? "365 days" : "30 days";
  const result = await query(
    `SELECT DATE(created_at) as date, COUNT(*) as bookings, SUM(total_amount) as revenue
     FROM gds_reservations WHERE tenant_id = $1 AND created_at > NOW() - $2::interval
     GROUP BY DATE(created_at) ORDER BY date ASC`,
    [TENANT_ID, interval]
  );
  res.json({ data: result.rows, period: period || "monthly" });
});

analyticsRouter.get("/agents/performance", async (_req: Request, res: Response) => {
  const result = await query("SELECT agency_name, agent_name, tier, total_bookings, commission_rate, status FROM gds_agents WHERE tenant_id = $1 ORDER BY total_bookings DESC LIMIT 20", [TENANT_ID]);
  res.json({ agents: result.rows, total: result.rowCount });
});

analyticsRouter.get("/properties/occupancy", async (_req: Request, res: Response) => {
  const result = await query(
    `SELECT p.name, p.city, a.date, a.total_rooms, a.booked_rooms,
     ROUND(a.booked_rooms::numeric / NULLIF(a.total_rooms,0) * 100, 1) as occupancy_pct
     FROM gds_availability a JOIN gds_properties p ON a.property_id = p.id
     WHERE a.date >= CURRENT_DATE ORDER BY a.date ASC LIMIT 100`
  );
  res.json({ occupancy: result.rows, total: result.rowCount });
});

analyticsRouter.get("/search-trends", async (_req: Request, res: Response) => {
  const result = await query(
    `SELECT query, COUNT(*) as search_count, AVG(results_count) as avg_results
     FROM gds_search_log WHERE created_at > NOW() - '30 days'::interval AND query != ''
     GROUP BY query ORDER BY search_count DESC LIMIT 20`
  );
  res.json({ trends: result.rows, total: result.rowCount });
});
