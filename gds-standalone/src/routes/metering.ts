import { Router, Request, Response } from "express";
import { query } from "../lib/database";

export const meteringRouter = Router();
const TENANT_ID = "00000000-0000-0000-0000-000000000001";

meteringRouter.get("/usage", async (req: Request, res: Response) => {
  const { period } = req.query;
  const interval = period === "daily" ? "1 day" : period === "weekly" ? "7 days" : "30 days";
  const result = await query(
    `SELECT endpoint, method, COUNT(*) as request_count, AVG(response_time_ms) as avg_latency,
     COUNT(*) FILTER (WHERE status_code >= 400) as error_count
     FROM gds_api_usage WHERE tenant_id = $1 AND created_at > NOW() - $2::interval
     GROUP BY endpoint, method ORDER BY request_count DESC LIMIT 50`,
    [TENANT_ID, interval]
  );
  res.json({ usage: result.rows, total: result.rowCount, period: period || "monthly" });
});

meteringRouter.get("/summary", async (_req: Request, res: Response) => {
  const total = await query("SELECT COUNT(*) as count, AVG(response_time_ms) as avg_latency FROM gds_api_usage WHERE tenant_id = $1 AND created_at > NOW() - '30 days'::interval", [TENANT_ID]);
  const errors = await query("SELECT COUNT(*) as count FROM gds_api_usage WHERE tenant_id = $1 AND status_code >= 400 AND created_at > NOW() - '30 days'::interval", [TENANT_ID]);
  const topEndpoints = await query(
    "SELECT endpoint, COUNT(*) as count FROM gds_api_usage WHERE tenant_id = $1 AND created_at > NOW() - '30 days'::interval GROUP BY endpoint ORDER BY count DESC LIMIT 5",
    [TENANT_ID]
  );
  res.json({
    total_requests: Number(total.rows[0]?.count || 0),
    avg_latency_ms: Number(Number(total.rows[0]?.avg_latency || 0).toFixed(1)),
    error_count: Number(errors.rows[0]?.count || 0),
    error_rate: total.rows[0]?.count ? Number((Number(errors.rows[0]?.count || 0) / Number(total.rows[0]?.count) * 100).toFixed(2)) : 0,
    top_endpoints: topEndpoints.rows,
  });
});

meteringRouter.get("/keys", async (_req: Request, res: Response) => {
  const result = await query("SELECT a.api_key, a.agency_name, COUNT(u.id) as requests FROM gds_agents a LEFT JOIN gds_api_usage u ON a.api_key = u.api_key WHERE a.tenant_id = $1 GROUP BY a.api_key, a.agency_name ORDER BY requests DESC", [TENANT_ID]);
  res.json({ api_keys: result.rows, total: result.rowCount });
});
