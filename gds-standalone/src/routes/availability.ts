import { Router, Request, Response } from "express";
import { query, queryOne } from "../lib/database";
import { cacheGet, cacheSet } from "../lib/redis";
import { publishEvent, TOPICS } from "../lib/kafka";

export const availabilityRouter = Router();

availabilityRouter.get("/", async (req: Request, res: Response) => {
  const { property_id, from_date, to_date } = req.query;
  if (!property_id) return res.status(400).json({ error: "property_id required" });
  let sql = "SELECT a.*, p.name as property_name FROM gds_availability a JOIN gds_properties p ON a.property_id = p.id WHERE a.property_id = $1";
  const params: unknown[] = [property_id];
  let idx = 2;
  if (from_date) { sql += ` AND a.date >= $${idx++}`; params.push(from_date); }
  if (to_date) { sql += ` AND a.date <= $${idx++}`; params.push(to_date); }
  sql += " ORDER BY a.date ASC LIMIT 365";
  const result = await query(sql, params);
  res.json({ availability: result.rows, total: result.rowCount });
});

availabilityRouter.get("/room-types", async (req: Request, res: Response) => {
  const { property_id } = req.query;
  let sql = "SELECT rt.*, p.name as property_name FROM gds_room_types rt JOIN gds_properties p ON rt.property_id = p.id WHERE 1=1";
  const params: unknown[] = [];
  if (property_id) { sql += " AND rt.property_id = $1"; params.push(property_id); }
  sql += " ORDER BY rt.max_occupancy ASC";
  const result = await query(sql, params);
  res.json({ room_types: result.rows, total: result.rowCount });
});

availabilityRouter.post("/", async (req: Request, res: Response) => {
  const { property_id, date, total_rooms, booked_rooms, room_type_code } = req.body;
  if (!property_id || !date || !total_rooms) return res.status(400).json({ error: "property_id, date, total_rooms required" });
  const result = await queryOne(
    "INSERT INTO gds_availability (property_id,date,total_rooms,booked_rooms,room_type_code) VALUES ($1,$2,$3,$4,$5) RETURNING *",
    [property_id, date, total_rooms, booked_rooms || 0, room_type_code || null]
  );
  await publishEvent({ topic: TOPICS.AVAILABILITY_UPDATED, value: { property_id, date, total_rooms, booked_rooms: booked_rooms || 0 } });
  res.status(201).json(result);
});

availabilityRouter.put("/:id", async (req: Request, res: Response) => {
  const { total_rooms, booked_rooms } = req.body;
  const result = await queryOne(
    "UPDATE gds_availability SET total_rooms=COALESCE($2,total_rooms),booked_rooms=COALESCE($3,booked_rooms),updated_at=NOW() WHERE id=$1 RETURNING *",
    [req.params.id, total_rooms, booked_rooms]
  );
  if (!result) return res.status(404).json({ error: "Availability record not found" });
  await publishEvent({ topic: TOPICS.AVAILABILITY_UPDATED, value: { id: req.params.id, total_rooms, booked_rooms } });
  res.json(result);
});

availabilityRouter.get("/check", async (req: Request, res: Response) => {
  const { property_id, check_in, check_out, room_type } = req.query;
  if (!property_id || !check_in || !check_out) return res.status(400).json({ error: "property_id, check_in, check_out required" });
  let sql = "SELECT date, total_rooms, booked_rooms, (total_rooms - booked_rooms) as available FROM gds_availability WHERE property_id = $1 AND date >= $2 AND date < $3";
  const params: unknown[] = [property_id, check_in, check_out];
  if (room_type) { sql += " AND room_type_code = $4"; params.push(room_type); }
  sql += " ORDER BY date ASC";
  const result = await query(sql, params);
  const available = result.rows.every((r: any) => Number(r.available) > 0);
  const minAvailable = result.rows.length > 0 ? Math.min(...result.rows.map((r: any) => Number(r.available))) : 0;
  res.json({ available, min_available: minAvailable, dates: result.rows, nights: result.rowCount });
});
