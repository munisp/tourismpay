import { Router, Request, Response } from "express";
import { query, queryOne } from "../lib/database";
import { cacheGet, cacheSet, cacheDelete } from "../lib/redis";
import { publishEvent, TOPICS } from "../lib/kafka";

export const groupBookingsRouter = Router();
const TENANT_ID = "00000000-0000-0000-0000-000000000001";

groupBookingsRouter.get("/", async (_req: Request, res: Response) => {
  const cached = await cacheGet("groups:list");
  if (cached) return res.json(JSON.parse(cached));
  const result = await query("SELECT * FROM gds_group_bookings WHERE tenant_id = $1 ORDER BY check_in ASC", [TENANT_ID]);
  const resp = { groups: result.rows, total: result.rowCount };
  await cacheSet("groups:list", JSON.stringify(resp), 120);
  res.json(resp);
});

groupBookingsRouter.get("/:id", async (req: Request, res: Response) => {
  const row = await queryOne("SELECT * FROM gds_group_bookings WHERE id = $1 AND tenant_id = $2", [req.params.id, TENANT_ID]);
  if (!row) return res.status(404).json({ error: "Group booking not found" });
  res.json(row);
});

groupBookingsRouter.post("/", async (req: Request, res: Response) => {
  const { group_name, group_type, property_id, rooms_blocked, check_in, check_out, contact_name, contact_email, attrition_schedule } = req.body;
  if (!group_name || !group_type || !rooms_blocked || !check_in || !check_out) return res.status(400).json({ error: "group_name, group_type, rooms_blocked, check_in, check_out required" });
  const result = await queryOne(
    `INSERT INTO gds_group_bookings (tenant_id,group_name,group_type,property_id,rooms_blocked,check_in,check_out,contact_name,contact_email,attrition_schedule)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [TENANT_ID, group_name, group_type, property_id || null, rooms_blocked, check_in, check_out, contact_name || null, contact_email || null, JSON.stringify(attrition_schedule || [])]
  );
  await cacheDelete("groups:list");
  await publishEvent({ topic: TOPICS.GROUP_BOOKING, key: result?.id as string, value: { group_name, rooms_blocked } });
  res.status(201).json(result);
});

groupBookingsRouter.put("/:id", async (req: Request, res: Response) => {
  const { group_name, group_type, rooms_blocked, rooms_picked_up, check_in, check_out, contact_name, contact_email, status } = req.body;
  const result = await queryOne(
    `UPDATE gds_group_bookings SET group_name=COALESCE($2,group_name),group_type=COALESCE($3,group_type),
     rooms_blocked=COALESCE($4,rooms_blocked),rooms_picked_up=COALESCE($5,rooms_picked_up),
     check_in=COALESCE($6,check_in),check_out=COALESCE($7,check_out),contact_name=COALESCE($8,contact_name),
     contact_email=COALESCE($9,contact_email),status=COALESCE($10,status),updated_at=NOW()
     WHERE id=$1 AND tenant_id=$11 RETURNING *`,
    [req.params.id, group_name, group_type, rooms_blocked, rooms_picked_up, check_in, check_out, contact_name, contact_email, status, TENANT_ID]
  );
  if (!result) return res.status(404).json({ error: "Group booking not found" });
  await cacheDelete("groups:list");
  res.json(result);
});

groupBookingsRouter.delete("/:id", async (req: Request, res: Response) => {
  const result = await query("DELETE FROM gds_group_bookings WHERE id = $1 AND tenant_id = $2", [req.params.id, TENANT_ID]);
  if (result.rowCount === 0) return res.status(404).json({ error: "Group booking not found" });
  await cacheDelete("groups:list");
  res.json({ deleted: true, id: req.params.id });
});
