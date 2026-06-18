import { Router, Request, Response } from "express";
import { query, queryOne } from "../lib/database";
import { cacheDelete } from "../lib/redis";
import { publishEvent, TOPICS } from "../lib/kafka";

const router = Router();
const TENANT_ID = "00000000-0000-0000-0000-000000000001";

// ─── Onboarding Dashboard ────────────────────────────────────────
router.get("/dashboard", async (_req: Request, res: Response) => {
  const apps = await query("SELECT * FROM gds_onboarding_applications WHERE tenant_id = $1", [TENANT_ID]);
  const ests = await query("SELECT * FROM gds_establishments WHERE tenant_id = $1", [TENANT_ID]);
  const agents = await query("SELECT * FROM gds_field_agents WHERE tenant_id = $1", [TENANT_ID]);

  const byStatus: Record<string, number> = {};
  const byChannel: Record<string, number> = {};
  for (const a of apps.rows) {
    byStatus[a.status as string] = (byStatus[a.status as string] || 0) + 1;
    byChannel[a.channel as string] = (byChannel[a.channel as string] || 0) + 1;
  }

  res.json({
    pipeline: { total_applications: apps.rowCount, active: apps.rows.filter((a: any) => !["rejected", "verified"].includes(a.status)).length, by_status: byStatus, by_channel: byChannel },
    funnel: {
      registered: apps.rowCount,
      details_complete: apps.rows.filter((a: any) => a.step >= 2).length,
      rates_set: apps.rows.filter((a: any) => a.step >= 3).length,
      documents_verified: apps.rows.filter((a: any) => a.step >= 4).length,
      live: apps.rows.filter((a: any) => a.status === "verified").length,
      rejected: apps.rows.filter((a: any) => a.status === "rejected").length,
    },
    establishments: {
      total: ests.rowCount, active: ests.rows.filter((e: any) => e.status === "active").length,
      pending: ests.rows.filter((e: any) => e.status !== "active").length,
      by_tier: { sms_only: ests.rows.filter((e: any) => e.tier === "sms_only").length, whatsapp: ests.rows.filter((e: any) => e.tier === "whatsapp").length, web_lite: ests.rows.filter((e: any) => e.tier === "web_lite").length, full: ests.rows.filter((e: any) => e.tier === "full").length },
    },
    agents: { total: agents.rowCount, active: agents.rows.filter((a: any) => a.status === "active").length, pending_kyc: agents.rows.filter((a: any) => a.status === "pending_kyc").length, total_onboarded: agents.rows.reduce((s: number, a: any) => s + (a.properties_onboarded || 0), 0) },
  });
});

// ─── Establishment CRUD ──────────────────────────────────────────
router.get("/establishments", async (req: Request, res: Response) => {
  let sql = "SELECT * FROM gds_establishments WHERE tenant_id = $1";
  const params: unknown[] = [TENANT_ID];
  let idx = 2;
  const { country, status, tier } = req.query;
  if (country) { sql += ` AND country = $${idx++}`; params.push(country); }
  if (status) { sql += ` AND status = $${idx++}`; params.push(status); }
  if (tier) { sql += ` AND tier = $${idx++}`; params.push(tier); }
  sql += " ORDER BY created_at DESC";
  const result = await query(sql, params);
  res.json({ establishments: result.rows, total: result.rowCount });
});

router.get("/establishments/:id", async (req: Request, res: Response) => {
  const row = await queryOne("SELECT * FROM gds_establishments WHERE id = $1 AND tenant_id = $2", [req.params.id, TENANT_ID]);
  if (!row) return res.status(404).json({ error: "Establishment not found" });
  res.json(row);
});

router.post("/establishments", async (req: Request, res: Response) => {
  const { name, type, country, city, contact_name, contact_email, contact_phone, rooms, star_rating, amenities, currency, base_rate } = req.body;
  if (!name || !type || !country || !contact_name || !contact_email) return res.status(400).json({ error: "name, type, country, contact_name, contact_email required" });
  const result = await queryOne(
    `INSERT INTO gds_establishments (tenant_id,name,type,country,city,contact_name,contact_email,contact_phone,rooms,star_rating,amenities,currency,base_rate)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [TENANT_ID, name, type, country, city || "", contact_name, contact_email, contact_phone || "", rooms || 0, star_rating || null, amenities || [], currency || "NGN", base_rate || 0]
  );
  res.status(201).json(result);
});

router.put("/establishments/:id", async (req: Request, res: Response) => {
  const { name, type, country, city, contact_name, contact_email, rooms, star_rating, tier, status, amenities, base_rate } = req.body;
  const result = await queryOne(
    `UPDATE gds_establishments SET name=COALESCE($2,name),type=COALESCE($3,type),country=COALESCE($4,country),city=COALESCE($5,city),
     contact_name=COALESCE($6,contact_name),contact_email=COALESCE($7,contact_email),rooms=COALESCE($8,rooms),
     star_rating=COALESCE($9,star_rating),tier=COALESCE($10,tier),status=COALESCE($11,status),amenities=COALESCE($12,amenities),
     base_rate=COALESCE($13,base_rate),updated_at=NOW() WHERE id=$1 AND tenant_id=$14 RETURNING *`,
    [req.params.id, name, type, country, city, contact_name, contact_email, rooms, star_rating, tier, status, amenities, base_rate, TENANT_ID]
  );
  if (!result) return res.status(404).json({ error: "Establishment not found" });
  res.json(result);
});

router.delete("/establishments/:id", async (req: Request, res: Response) => {
  const result = await query("DELETE FROM gds_establishments WHERE id = $1 AND tenant_id = $2", [req.params.id, TENANT_ID]);
  if (result.rowCount === 0) return res.status(404).json({ error: "Establishment not found" });
  res.json({ deleted: true, id: req.params.id });
});

// ─── Onboarding Applications ─────────────────────────────────────
router.get("/applications", async (_req: Request, res: Response) => {
  const result = await query("SELECT * FROM gds_onboarding_applications WHERE tenant_id = $1 ORDER BY created_at DESC", [TENANT_ID]);
  res.json({ applications: result.rows, total: result.rowCount });
});

router.delete("/applications/:id", async (req: Request, res: Response) => {
  const result = await query("DELETE FROM gds_onboarding_applications WHERE id = $1 AND tenant_id = $2", [req.params.id, TENANT_ID]);
  if (result.rowCount === 0) return res.status(404).json({ error: "Application not found" });
  res.json({ deleted: true, id: req.params.id });
});

// ─── Wizard Steps ────────────────────────────────────────────────
router.post("/wizard/start", async (req: Request, res: Response) => {
  const { establishment_name, contact_name, contact_email, contact_phone, country, city, property_type, rooms, channel } = req.body;
  if (!establishment_name || !contact_name || !contact_email || !country) return res.status(400).json({ error: "establishment_name, contact_name, contact_email, country required" });
  const result = await queryOne(
    `INSERT INTO gds_onboarding_applications (tenant_id,establishment_name,contact_name,contact_email,contact_phone,country,city,property_type,rooms,channel,status,step,notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'registered',1,'Application submitted') RETURNING *`,
    [TENANT_ID, establishment_name, contact_name, contact_email, contact_phone || "", country, city || "", property_type || "hotel", rooms || 0, channel || "web"]
  );
  await publishEvent({ topic: TOPICS.ONBOARDING_TIER_CHANGE, value: { action: "wizard_started", application: result } });
  res.status(201).json({ application: result, next_step: "property_details", message: "Step 1/5: Registration complete" });
});

router.put("/wizard/:id/details", async (req: Request, res: Response) => {
  const result = await queryOne(
    `UPDATE gds_onboarding_applications SET rooms=COALESCE($2,rooms),property_type=COALESCE($3,property_type),city=COALESCE($4,city),
     step=GREATEST(step,2),status='rate_setup',notes=COALESCE($5,'Property details captured'),updated_at=NOW()
     WHERE id=$1 AND tenant_id=$6 RETURNING *`,
    [req.params.id, req.body.rooms, req.body.property_type, req.body.city, req.body.notes, TENANT_ID]
  );
  if (!result) return res.status(404).json({ error: "Application not found" });
  res.json({ application: result, next_step: "rate_setup", message: "Step 2/5: Property details saved" });
});

router.put("/wizard/:id/rates", async (req: Request, res: Response) => {
  const result = await queryOne(
    `UPDATE gds_onboarding_applications SET step=GREATEST(step,3),status='documents_pending',
     notes=COALESCE($2,'Rates set'),updated_at=NOW() WHERE id=$1 AND tenant_id=$3 RETURNING *`,
    [req.params.id, `Rates set: ${req.body.currency || "NGN"} ${req.body.base_rate || 0}/night`, TENANT_ID]
  );
  if (!result) return res.status(404).json({ error: "Application not found" });
  res.json({ application: result, next_step: "documents", message: "Step 3/5: Rates configured" });
});

router.put("/wizard/:id/documents", async (req: Request, res: Response) => {
  const result = await queryOne(
    `UPDATE gds_onboarding_applications SET step=GREATEST(step,4),status='in_review',
     notes=COALESCE($2,'Documents submitted'),updated_at=NOW() WHERE id=$1 AND tenant_id=$3 RETURNING *`,
    [req.params.id, req.body.notes, TENANT_ID]
  );
  if (!result) return res.status(404).json({ error: "Application not found" });
  res.json({ application: result, next_step: "activate", message: "Step 4/5: Documents under review" });
});

router.put("/wizard/:id/activate", async (req: Request, res: Response) => {
  const app = await queryOne("SELECT * FROM gds_onboarding_applications WHERE id = $1 AND tenant_id = $2", [req.params.id, TENANT_ID]);
  if (!app) return res.status(404).json({ error: "Application not found" });

  await queryOne("UPDATE gds_onboarding_applications SET step=5,status='verified',notes='Go live!',updated_at=NOW() WHERE id=$1", [req.params.id]);

  const est = await queryOne(
    `INSERT INTO gds_establishments (tenant_id,name,type,country,city,contact_name,contact_email,contact_phone,rooms,tier,status,onboarding_step,onboarding_channel,verified)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'sms_only','active',5,$10,true) RETURNING *`,
    [TENANT_ID, app.establishment_name, app.property_type, app.country, app.city, app.contact_name, app.contact_email, app.contact_phone, app.rooms, app.channel]
  );
  await publishEvent({ topic: TOPICS.ONBOARDING_TIER_CHANGE, value: { action: "establishment_activated", establishment: est } });
  res.json({ application: app, establishment: est, message: "Step 5/5: Establishment is now LIVE!" });
});

// ─── Field Agents CRUD ───────────────────────────────────────────
router.get("/agents", async (_req: Request, res: Response) => {
  const result = await query("SELECT * FROM gds_field_agents WHERE tenant_id = $1 ORDER BY created_at DESC", [TENANT_ID]);
  res.json({ agents: result.rows, total: result.rowCount });
});

router.post("/agents", async (req: Request, res: Response) => {
  const { name, phone, email, region, country } = req.body;
  if (!name || !phone || !country) return res.status(400).json({ error: "name, phone, country required" });
  const result = await queryOne(
    `INSERT INTO gds_field_agents (tenant_id,name,phone,email,region,country) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [TENANT_ID, name, phone, email || null, region || null, country]
  );
  res.status(201).json(result);
});

router.delete("/agents/:id", async (req: Request, res: Response) => {
  const result = await query("DELETE FROM gds_field_agents WHERE id = $1 AND tenant_id = $2", [req.params.id, TENANT_ID]);
  if (result.rowCount === 0) return res.status(404).json({ error: "Agent not found" });
  res.json({ deleted: true, id: req.params.id });
});

router.post("/agents/:id/verify-kyc", async (req: Request, res: Response) => {
  const result = await queryOne("UPDATE gds_field_agents SET kyc_verified=true,status='training',updated_at=NOW() WHERE id=$1 AND tenant_id=$2 RETURNING *", [req.params.id, TENANT_ID]);
  if (!result) return res.status(404).json({ error: "Agent not found" });
  res.json(result);
});

router.post("/agents/:id/complete-training", async (req: Request, res: Response) => {
  const result = await queryOne("UPDATE gds_field_agents SET training_completed=true,status='active',updated_at=NOW() WHERE id=$1 AND tenant_id=$2 RETURNING *", [req.params.id, TENANT_ID]);
  if (!result) return res.status(404).json({ error: "Agent not found" });
  res.json(result);
});

export { router as onboardingRouter };
