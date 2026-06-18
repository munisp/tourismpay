import { Router, Request, Response } from "express";
import { query, queryOne } from "../lib/database";
import { cacheGet, cacheSet, cacheDelete } from "../lib/redis";
import { publishEvent, TOPICS } from "../lib/kafka";
import crypto from "crypto";

export const pnrRouter = Router();
const TENANT_ID = "00000000-0000-0000-0000-000000000001";

function generateLocator(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let loc = "";
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) loc += chars[bytes[i] % chars.length];
  return loc;
}

pnrRouter.get("/", async (req: Request, res: Response) => {
  const { status } = req.query;
  const cached = await cacheGet("pnr:list");
  if (cached && !status) return res.json(JSON.parse(cached));

  let sql = "SELECT * FROM gds_pnr_records WHERE tenant_id = $1";
  const params: unknown[] = [TENANT_ID];
  if (status) { sql += " AND status = $2"; params.push(status); }
  sql += " ORDER BY created_at DESC";

  const result = await query(sql, params);
  const resp = { pnrs: result.rows, total: result.rowCount };
  if (!status) await cacheSet("pnr:list", JSON.stringify(resp), 60);
  res.json(resp);
});

pnrRouter.get("/search", async (req: Request, res: Response) => {
  const { q } = req.query;
  if (!q) return res.json({ pnrs: [], total: 0 });
  const result = await query(
    "SELECT * FROM gds_pnr_records WHERE tenant_id = $1 AND (record_locator ILIKE $2 OR guest_name ILIKE $2 OR contact_email ILIKE $2) ORDER BY created_at DESC LIMIT 20",
    [TENANT_ID, `%${q}%`]
  );
  res.json({ pnrs: result.rows, total: result.rowCount });
});

pnrRouter.get("/:locator", async (req: Request, res: Response) => {
  const row = await queryOne("SELECT * FROM gds_pnr_records WHERE record_locator = $1 AND tenant_id = $2", [req.params.locator, TENANT_ID]);
  if (!row) return res.status(404).json({ error: "PNR not found" });
  res.json(row);
});

pnrRouter.post("/", async (req: Request, res: Response) => {
  const { guest_name, contact_email, agency_id, agent_id, status, segments, remarks } = req.body;
  if (!guest_name || !contact_email) return res.status(400).json({ error: "guest_name and contact_email required" });

  const locator = generateLocator();
  const result = await queryOne(
    `INSERT INTO gds_pnr_records (tenant_id, record_locator, guest_name, contact_email, agency_id, agent_id, status, ticketing_status, segments, remarks, history)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDING',$8,$9,$10) RETURNING *`,
    [TENANT_ID, locator, guest_name, contact_email, agency_id || null, agent_id || null, status || "CONFIRMED",
     JSON.stringify(segments || []), JSON.stringify(remarks || []),
     JSON.stringify([{ action: "CREATED", timestamp: new Date().toISOString(), details: "PNR created" }])]
  );
  await cacheDelete("pnr:list");
  await publishEvent({ topic: TOPICS.PNR_CREATED, key: locator, value: { locator, guest_name, contact_email } });
  res.status(201).json(result);
});

pnrRouter.put("/:locator", async (req: Request, res: Response) => {
  const { guest_name, contact_email, agency_id, agent_id, status } = req.body;
  const existing = await queryOne("SELECT * FROM gds_pnr_records WHERE record_locator = $1 AND tenant_id = $2", [req.params.locator, TENANT_ID]);
  if (!existing) return res.status(404).json({ error: "PNR not found" });

  const history = Array.isArray(existing.history) ? existing.history : [];
  history.push({ action: "MODIFIED", timestamp: new Date().toISOString(), details: `Updated by agent` });

  const result = await queryOne(
    `UPDATE gds_pnr_records SET guest_name=COALESCE($2,guest_name), contact_email=COALESCE($3,contact_email),
     agency_id=COALESCE($4,agency_id), agent_id=COALESCE($5,agent_id), status=COALESCE($6,status),
     history=$7, updated_at=NOW()
     WHERE record_locator=$1 AND tenant_id=$8 RETURNING *`,
    [req.params.locator, guest_name, contact_email, agency_id, agent_id, status, JSON.stringify(history), TENANT_ID]
  );
  await cacheDelete("pnr:list");
  await publishEvent({ topic: TOPICS.PNR_MODIFIED, key: req.params.locator, value: { locator: req.params.locator, changes: req.body } });
  res.json(result);
});

pnrRouter.delete("/:locator", async (req: Request, res: Response) => {
  const result = await query("DELETE FROM gds_pnr_records WHERE record_locator = $1 AND tenant_id = $2", [req.params.locator, TENANT_ID]);
  if (result.rowCount === 0) return res.status(404).json({ error: "PNR not found" });
  await cacheDelete("pnr:list");
  await publishEvent({ topic: TOPICS.PNR_CANCELLED, key: req.params.locator, value: { locator: req.params.locator } });
  res.json({ deleted: true, locator: req.params.locator });
});

pnrRouter.post("/:locator/segments", async (req: Request, res: Response) => {
  const existing = await queryOne("SELECT * FROM gds_pnr_records WHERE record_locator = $1 AND tenant_id = $2", [req.params.locator, TENANT_ID]);
  if (!existing) return res.status(404).json({ error: "PNR not found" });
  const segments = Array.isArray(existing.segments) ? existing.segments : [];
  segments.push({ ...req.body, id: crypto.randomUUID(), status: "HK" });
  const result = await queryOne("UPDATE gds_pnr_records SET segments = $2, updated_at = NOW() WHERE record_locator = $1 RETURNING *", [req.params.locator, JSON.stringify(segments)]);
  await cacheDelete("pnr:list");
  res.json(result);
});

pnrRouter.post("/:locator/remarks", async (req: Request, res: Response) => {
  const existing = await queryOne("SELECT * FROM gds_pnr_records WHERE record_locator = $1 AND tenant_id = $2", [req.params.locator, TENANT_ID]);
  if (!existing) return res.status(404).json({ error: "PNR not found" });
  const remarks = Array.isArray(existing.remarks) ? existing.remarks : [];
  remarks.push({ type: req.body.type || "general", text: req.body.text });
  const result = await queryOne("UPDATE gds_pnr_records SET remarks = $2, updated_at = NOW() WHERE record_locator = $1 RETURNING *", [req.params.locator, JSON.stringify(remarks)]);
  res.json(result);
});

pnrRouter.post("/:locator/ticket", async (req: Request, res: Response) => {
  const result = await queryOne("UPDATE gds_pnr_records SET ticketing_status = 'ISSUED', updated_at = NOW() WHERE record_locator = $1 AND tenant_id = $2 RETURNING *", [req.params.locator, TENANT_ID]);
  if (!result) return res.status(404).json({ error: "PNR not found" });
  await cacheDelete("pnr:list");
  res.json(result);
});

pnrRouter.get("/:locator/history", async (req: Request, res: Response) => {
  const row = await queryOne("SELECT history FROM gds_pnr_records WHERE record_locator = $1 AND tenant_id = $2", [req.params.locator, TENANT_ID]);
  if (!row) return res.status(404).json({ error: "PNR not found" });
  res.json({ history: row.history || [] });
});
