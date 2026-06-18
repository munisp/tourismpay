import { Router, Request, Response } from "express";
import { query, queryOne } from "../lib/database";

export const remittanceRouter = Router();
const TENANT_ID = "00000000-0000-0000-0000-000000000001";

remittanceRouter.get("/records", async (_req: Request, res: Response) => {
  const result = await query("SELECT * FROM gds_remittance_records WHERE tenant_id = $1 ORDER BY created_at DESC", [TENANT_ID]);
  res.json({ records: result.rows, total: result.rowCount });
});

remittanceRouter.get("/schedules", async (_req: Request, res: Response) => {
  const result = await query("SELECT * FROM gds_remittance_schedules ORDER BY next_due ASC");
  res.json({ schedules: result.rows, total: result.rowCount });
});

remittanceRouter.post("/file", async (req: Request, res: Response) => {
  const { jurisdiction_code, period, tax_type, amount, due_date } = req.body;
  if (!jurisdiction_code || !period || !tax_type || !amount) return res.status(400).json({ error: "jurisdiction_code, period, tax_type, amount required" });
  const ref = `${jurisdiction_code.toUpperCase()}-${tax_type.toUpperCase()}-${period.replace(/[^a-zA-Z0-9]/g, "")}-${Date.now() % 1000}`;
  const result = await queryOne(
    `INSERT INTO gds_remittance_records (tenant_id,jurisdiction_code,period,tax_type,amount,currency,status,due_date,filed_at,reference)
     VALUES ($1,$2,$3,$4,$5,'NGN','filed',$6,NOW(),$7) RETURNING *`,
    [TENANT_ID, jurisdiction_code, period, tax_type, amount, due_date || null, ref]
  );
  res.status(201).json(result);
});

remittanceRouter.get("/summary", async (_req: Request, res: Response) => {
  const filed = await query("SELECT SUM(amount) as total, COUNT(*) as count FROM gds_remittance_records WHERE tenant_id = $1 AND status = 'filed'", [TENANT_ID]);
  const pending = await query("SELECT SUM(amount) as total, COUNT(*) as count FROM gds_remittance_records WHERE tenant_id = $1 AND status = 'pending'", [TENANT_ID]);
  const overdue = await query("SELECT SUM(amount) as total, COUNT(*) as count FROM gds_remittance_records WHERE tenant_id = $1 AND status = 'pending' AND due_date < CURRENT_DATE", [TENANT_ID]);
  res.json({
    filed: { total: Number(filed.rows[0]?.total || 0), count: Number(filed.rows[0]?.count || 0) },
    pending: { total: Number(pending.rows[0]?.total || 0), count: Number(pending.rows[0]?.count || 0) },
    overdue: { total: Number(overdue.rows[0]?.total || 0), count: Number(overdue.rows[0]?.count || 0) },
    currency: "NGN",
  });
});
