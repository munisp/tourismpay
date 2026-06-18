import { Router, Request, Response } from "express";
import { query, queryOne } from "../lib/database";
import { cacheGet, cacheSet, cacheDelete } from "../lib/redis";

export const distributionRouter = Router();
const TENANT_ID = "00000000-0000-0000-0000-000000000001";

distributionRouter.get("/", async (_req: Request, res: Response) => {
  const cached = await cacheGet("distribution:list");
  if (cached) return res.json(JSON.parse(cached));
  const result = await query("SELECT * FROM gds_distribution_channels WHERE tenant_id = $1 ORDER BY bookings_count DESC", [TENANT_ID]);
  const resp = { channels: result.rows, total: result.rowCount };
  await cacheSet("distribution:list", JSON.stringify(resp), 120);
  res.json(resp);
});

distributionRouter.get("/:id", async (req: Request, res: Response) => {
  const row = await queryOne("SELECT * FROM gds_distribution_channels WHERE id = $1 AND tenant_id = $2", [req.params.id, TENANT_ID]);
  if (!row) return res.status(404).json({ error: "Channel not found" });
  res.json(row);
});

distributionRouter.post("/", async (req: Request, res: Response) => {
  const { name, type, endpoint, countries, status } = req.body;
  if (!name || !type) return res.status(400).json({ error: "name and type required" });
  const result = await queryOne(
    "INSERT INTO gds_distribution_channels (tenant_id,name,type,endpoint,countries,status) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
    [TENANT_ID, name, type, endpoint || null, countries || [], status || "active"]
  );
  await cacheDelete("distribution:list");
  res.status(201).json(result);
});

distributionRouter.put("/:id", async (req: Request, res: Response) => {
  const { name, type, endpoint, countries, status } = req.body;
  const result = await queryOne(
    `UPDATE gds_distribution_channels SET name=COALESCE($2,name),type=COALESCE($3,type),endpoint=COALESCE($4,endpoint),
     countries=COALESCE($5,countries),status=COALESCE($6,status),updated_at=NOW() WHERE id=$1 AND tenant_id=$7 RETURNING *`,
    [req.params.id, name, type, endpoint, countries, status, TENANT_ID]
  );
  if (!result) return res.status(404).json({ error: "Channel not found" });
  await cacheDelete("distribution:list");
  res.json(result);
});

distributionRouter.delete("/:id", async (req: Request, res: Response) => {
  const result = await query("DELETE FROM gds_distribution_channels WHERE id = $1 AND tenant_id = $2", [req.params.id, TENANT_ID]);
  if (result.rowCount === 0) return res.status(404).json({ error: "Channel not found" });
  await cacheDelete("distribution:list");
  res.json({ deleted: true, id: req.params.id });
});
