import { Router, Request, Response } from "express";
import { query, queryOne } from "../lib/database";
import { cacheGet, cacheSet, cacheDelete } from "../lib/redis";
import crypto from "crypto";

export const agentsRouter = Router();
const TENANT_ID = "00000000-0000-0000-0000-000000000001";

agentsRouter.get("/", async (_req: Request, res: Response) => {
  const cached = await cacheGet("agents:list");
  if (cached) return res.json(JSON.parse(cached));
  const result = await query("SELECT * FROM gds_agents WHERE tenant_id = $1 ORDER BY total_bookings DESC", [TENANT_ID]);
  const resp = { agents: result.rows, total: result.rowCount };
  await cacheSet("agents:list", JSON.stringify(resp), 120);
  res.json(resp);
});

agentsRouter.get("/:id", async (req: Request, res: Response) => {
  const row = await queryOne("SELECT * FROM gds_agents WHERE id = $1 AND tenant_id = $2", [req.params.id, TENANT_ID]);
  if (!row) return res.status(404).json({ error: "Agent not found" });
  res.json(row);
});

agentsRouter.post("/", async (req: Request, res: Response) => {
  const { agency_name, agent_name, email, phone, country_code, iata_code, preferred_currency, tier, commission_rate } = req.body;
  if (!agency_name || !agent_name || !email || !country_code) return res.status(400).json({ error: "agency_name, agent_name, email, country_code required" });
  const apiKey = `gds_${crypto.randomBytes(24).toString("hex")}`;
  const result = await queryOne(
    `INSERT INTO gds_agents (tenant_id,agency_name,agent_name,email,phone,country_code,iata_code,preferred_currency,tier,commission_rate,api_key,status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'active') RETURNING *`,
    [TENANT_ID, agency_name, agent_name, email, phone || null, country_code, iata_code || null, preferred_currency || "NGN", tier || "bronze", commission_rate || 10, apiKey]
  );
  await cacheDelete("agents:list");
  res.status(201).json(result);
});

agentsRouter.put("/:id", async (req: Request, res: Response) => {
  const { agency_name, agent_name, email, phone, tier, commission_rate, status } = req.body;
  const result = await queryOne(
    `UPDATE gds_agents SET agency_name=COALESCE($2,agency_name),agent_name=COALESCE($3,agent_name),
     email=COALESCE($4,email),phone=COALESCE($5,phone),tier=COALESCE($6,tier),
     commission_rate=COALESCE($7,commission_rate),status=COALESCE($8,status),updated_at=NOW()
     WHERE id=$1 AND tenant_id=$9 RETURNING *`,
    [req.params.id, agency_name, agent_name, email, phone, tier, commission_rate, status, TENANT_ID]
  );
  if (!result) return res.status(404).json({ error: "Agent not found" });
  await cacheDelete("agents:list");
  res.json(result);
});

agentsRouter.delete("/:id", async (req: Request, res: Response) => {
  const result = await query("DELETE FROM gds_agents WHERE id = $1 AND tenant_id = $2", [req.params.id, TENANT_ID]);
  if (result.rowCount === 0) return res.status(404).json({ error: "Agent not found" });
  await cacheDelete("agents:list");
  res.json({ deleted: true, id: req.params.id });
});
