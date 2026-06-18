import { Router, Request, Response } from "express";
import { query, queryOne } from "../lib/database";
import { cacheGet, cacheSet, cacheDelete } from "../lib/redis";
import { publishEvent, TOPICS } from "../lib/kafka";

export const reservationsRouter = Router();
const TENANT_ID = "00000000-0000-0000-0000-000000000001";

reservationsRouter.get("/", async (req: Request, res: Response) => {
  const { status, property_id } = req.query;
  const cached = await cacheGet("reservations:list");
  if (cached && !status && !property_id) return res.json(JSON.parse(cached));

  let sql = "SELECT r.*, p.name as property_name FROM gds_reservations r LEFT JOIN gds_properties p ON r.property_id = p.id WHERE r.tenant_id = $1";
  const params: unknown[] = [TENANT_ID];
  let idx = 2;
  if (status) { sql += ` AND r.status = $${idx++}`; params.push(status); }
  if (property_id) { sql += ` AND r.property_id = $${idx++}`; params.push(property_id); }
  sql += " ORDER BY r.check_in DESC LIMIT 100";
  const result = await query(sql, params);
  const resp = { reservations: result.rows, total: result.rowCount };
  if (!status && !property_id) await cacheSet("reservations:list", JSON.stringify(resp), 60);
  res.json(resp);
});

reservationsRouter.get("/:id", async (req: Request, res: Response) => {
  const row = await queryOne("SELECT * FROM gds_reservations WHERE id = $1 AND tenant_id = $2", [req.params.id, TENANT_ID]);
  if (!row) return res.status(404).json({ error: "Reservation not found" });
  res.json(row);
});

reservationsRouter.post("/", async (req: Request, res: Response) => {
  const { guest_name, property_id, room_type_code, check_in, check_out, total_amount, currency, guests: guestCount, rooms, special_requests } = req.body;
  if (!guest_name || !property_id || !check_in || !check_out || !total_amount) return res.status(400).json({ error: "guest_name, property_id, check_in, check_out, total_amount required" });
  const confirmNo = `RES-${Date.now().toString(36).toUpperCase()}`;
  const ci = new Date(check_in as string); const co = new Date(check_out as string);
  const nights = Math.max(1, Math.round((co.getTime() - ci.getTime()) / 86400000));
  const result = await queryOne(
    `INSERT INTO gds_reservations (tenant_id,guest_name,property_id,room_type_code,check_in,check_out,nights,total_amount,currency,guests,rooms,special_requests,confirmation_no,status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'confirmed') RETURNING *`,
    [TENANT_ID, guest_name, property_id, room_type_code || "STD", check_in, check_out, nights, total_amount, currency || "NGN", guestCount || 2, rooms || 1, special_requests || "", confirmNo]
  );
  await cacheDelete("reservations:list");
  await publishEvent({ topic: TOPICS.BOOKING_CONFIRMED, key: confirmNo, value: { guest_name, property_id, check_in, check_out, total_amount } });
  res.status(201).json(result);
});

reservationsRouter.put("/:id", async (req: Request, res: Response) => {
  const { room_type_code, check_in, check_out, total_amount, guests: guestCount, rooms, special_requests, status } = req.body;
  const result = await queryOne(
    `UPDATE gds_reservations SET room_type_code=COALESCE($2,room_type_code),check_in=COALESCE($3,check_in),
     check_out=COALESCE($4,check_out),total_amount=COALESCE($5,total_amount),guests=COALESCE($6,guests),
     rooms=COALESCE($7,rooms),special_requests=COALESCE($8,special_requests),status=COALESCE($9,status),
     updated_at=NOW() WHERE id=$1 AND tenant_id=$10 RETURNING *`,
    [req.params.id, room_type_code, check_in, check_out, total_amount, guestCount, rooms, special_requests, status, TENANT_ID]
  );
  if (!result) return res.status(404).json({ error: "Reservation not found" });
  await cacheDelete("reservations:list");
  res.json(result);
});

reservationsRouter.put("/:id/cancel", async (req: Request, res: Response) => {
  const result = await queryOne("UPDATE gds_reservations SET status='cancelled',cancelled_at=NOW(),cancellation_reason=$2 WHERE id=$1 AND tenant_id=$3 RETURNING *", [req.params.id, req.body.reason || "guest_request", TENANT_ID]);
  if (!result) return res.status(404).json({ error: "Reservation not found" });
  await cacheDelete("reservations:list");
  await publishEvent({ topic: TOPICS.BOOKING_CANCELLED, key: req.params.id, value: { id: req.params.id, reason: req.body.reason } });
  res.json(result);
});

reservationsRouter.delete("/:id", async (req: Request, res: Response) => {
  const result = await query("DELETE FROM gds_reservations WHERE id = $1 AND tenant_id = $2", [req.params.id, TENANT_ID]);
  if (result.rowCount === 0) return res.status(404).json({ error: "Reservation not found" });
  await cacheDelete("reservations:list");
  res.json({ deleted: true, id: req.params.id });
});
