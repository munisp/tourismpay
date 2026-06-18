import { Router, Request, Response } from "express";
import { query, queryOne } from "../lib/database";
import { cacheGet, cacheSet } from "../lib/redis";

export const taxRouter = Router();

taxRouter.get("/jurisdictions", async (_req: Request, res: Response) => {
  const cached = await cacheGet("tax:jurisdictions");
  if (cached) return res.json(JSON.parse(cached));
  const result = await query("SELECT * FROM gds_tax_jurisdictions ORDER BY country, code");
  const resp = { jurisdictions: result.rows, total: result.rowCount };
  await cacheSet("tax:jurisdictions", JSON.stringify(resp), 600);
  res.json(resp);
});

taxRouter.get("/jurisdictions/:code", async (req: Request, res: Response) => {
  const row = await queryOne("SELECT * FROM gds_tax_jurisdictions WHERE code = $1", [req.params.code]);
  if (!row) return res.status(404).json({ error: "Jurisdiction not found" });
  res.json(row);
});

taxRouter.post("/calculate", async (req: Request, res: Response) => {
  const { amount, jurisdiction_code } = req.body;
  if (!amount || !jurisdiction_code) return res.status(400).json({ error: "amount and jurisdiction_code required" });
  const jur = await queryOne("SELECT * FROM gds_tax_jurisdictions WHERE code = $1", [jurisdiction_code]);
  if (!jur) return res.status(404).json({ error: "Jurisdiction not found" });

  const gross = Number(amount);
  const vat = Math.round(gross * Number(jur.vat_rate) / 100 * 100) / 100;
  const tourismLevy = Math.round(gross * Number(jur.tourism_levy) / 100 * 100) / 100;
  const serviceCharge = Math.round(gross * Number(jur.service_charge) / 100 * 100) / 100;
  const totalTax = vat + tourismLevy + serviceCharge;

  const calc = await queryOne(
    "INSERT INTO gds_tax_calculations (jurisdiction_code,amount,vat,tourism_levy,service_charge,total_tax,total_with_tax) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *",
    [jurisdiction_code, gross, vat, tourismLevy, serviceCharge, totalTax, gross + totalTax]
  );
  res.json({ jurisdiction: jur, calculation: calc, summary: { gross, vat, tourism_levy: tourismLevy, service_charge: serviceCharge, total_tax: totalTax, total_with_tax: gross + totalTax, currency: "NGN" } });
});

taxRouter.get("/calculations", async (_req: Request, res: Response) => {
  const result = await query("SELECT * FROM gds_tax_calculations ORDER BY created_at DESC LIMIT 50");
  res.json({ calculations: result.rows, total: result.rowCount });
});
