import { Router, Request, Response } from "express";
import { query, queryOne } from "../lib/database";
import { cacheGet, cacheSet, cacheDelete } from "../lib/redis";
import { publishEvent, TOPICS } from "../lib/kafka";

export const queueRouter = Router();
const TENANT_ID = "00000000-0000-0000-0000-000000000001";

queueRouter.get("/stats", async (_req: Request, res: Response) => {
  const cached = await cacheGet("queue:stats");
  if (cached) return res.json(JSON.parse(cached));

  const all = await query("SELECT * FROM gds_queue_items WHERE tenant_id = $1", [TENANT_ID]);
  const items = all.rows;
  const pending = items.filter((i: any) => i.status === "pending");
  const inProgress = items.filter((i: any) => i.status === "in_progress");
  const resolved = items.filter((i: any) => i.status === "resolved");
  const now = new Date();
  const breached = pending.filter((i: any) => i.sla_deadline && new Date(i.sla_deadline as string) < now);

  const byType: Record<string, number> = {};
  for (const i of items) byType[i.queue_type as string] = (byType[i.queue_type as string] || 0) + 1;

  const resp = {
    stats: { total: items.length, pending: pending.length, in_progress: inProgress.length, resolved: resolved.length, sla_breached: breached.length, avg_wait_min: pending.length > 0 ? Math.round(pending.reduce((s: number, i: any) => s + ((now.getTime() - new Date(i.created_at as string).getTime()) / 60000), 0) / pending.length) : 0 },
    by_type: byType,
  };
  await cacheSet("queue:stats", JSON.stringify(resp), 30);
  res.json(resp);
});

queueRouter.get("/items", async (req: Request, res: Response) => {
  const { type, status, priority } = req.query;
  let sql = "SELECT * FROM gds_queue_items WHERE tenant_id = $1";
  const params: unknown[] = [TENANT_ID];
  let idx = 2;
  if (type) { sql += ` AND queue_type = $${idx++}`; params.push(type); }
  if (status) { sql += ` AND status = $${idx++}`; params.push(status); }
  if (priority) { sql += ` AND priority <= $${idx++}`; params.push(Number(priority)); }
  sql += " ORDER BY priority ASC, created_at ASC";
  const result = await query(sql, params);
  res.json({ items: result.rows, total: result.rowCount });
});

queueRouter.post("/items", async (req: Request, res: Response) => {
  const { queue_type, priority, pnr_locator, title, details, sla_minutes } = req.body;
  if (!queue_type || !title) return res.status(400).json({ error: "queue_type and title required" });
  const slaMin = sla_minutes || 30;
  const result = await queryOne(
    `INSERT INTO gds_queue_items (tenant_id,queue_type,priority,pnr_locator,title,details,status,sla_minutes,sla_deadline)
     VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,NOW()+($7||' minutes')::interval) RETURNING *`,
    [TENANT_ID, queue_type, priority || 3, pnr_locator || null, title, JSON.stringify(details || {}), slaMin]
  );
  await cacheDelete("queue:stats");
  await publishEvent({ topic: TOPICS.QUEUE_ITEM_CREATED, value: { queue_type, title } });
  res.status(201).json(result);
});

queueRouter.put("/items/:id/assign", async (req: Request, res: Response) => {
  const result = await queryOne("UPDATE gds_queue_items SET assigned_to=$2,status='in_progress' WHERE id=$1 AND tenant_id=$3 RETURNING *", [req.params.id, req.body.assigned_to, TENANT_ID]);
  if (!result) return res.status(404).json({ error: "Queue item not found" });
  await cacheDelete("queue:stats");
  res.json(result);
});

queueRouter.put("/items/:id/resolve", async (req: Request, res: Response) => {
  const result = await queryOne("UPDATE gds_queue_items SET status='resolved',resolved_at=NOW() WHERE id=$1 AND tenant_id=$2 RETURNING *", [req.params.id, TENANT_ID]);
  if (!result) return res.status(404).json({ error: "Queue item not found" });
  await cacheDelete("queue:stats");
  res.json(result);
});

queueRouter.delete("/items/:id", async (req: Request, res: Response) => {
  const result = await query("DELETE FROM gds_queue_items WHERE id = $1 AND tenant_id = $2", [req.params.id, TENANT_ID]);
  if (result.rowCount === 0) return res.status(404).json({ error: "Queue item not found" });
  await cacheDelete("queue:stats");
  res.json({ deleted: true, id: req.params.id });
});
