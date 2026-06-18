import { Router, Request, Response } from "express";
import { query, queryOne } from "../lib/database";
import crypto from "crypto";

export const sandboxRouter = Router();
const TENANT_ID = "00000000-0000-0000-0000-000000000001";

sandboxRouter.get("/keys", async (_req: Request, res: Response) => {
  const result = await query("SELECT * FROM gds_sandbox_keys WHERE tenant_id = $1 ORDER BY created_at DESC", [TENANT_ID]);
  res.json({ keys: result.rows, total: result.rowCount });
});

sandboxRouter.post("/keys", async (req: Request, res: Response) => {
  const { name, rate_limit } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });
  const apiKey = `sk_sandbox_${crypto.randomBytes(16).toString("hex")}`;
  const result = await queryOne(
    "INSERT INTO gds_sandbox_keys (tenant_id,name,api_key,rate_limit) VALUES ($1,$2,$3,$4) RETURNING *",
    [TENANT_ID, name, apiKey, rate_limit || 100]
  );
  res.status(201).json(result);
});

sandboxRouter.delete("/keys/:id", async (req: Request, res: Response) => {
  const result = await query("DELETE FROM gds_sandbox_keys WHERE id = $1 AND tenant_id = $2", [req.params.id, TENANT_ID]);
  if (result.rowCount === 0) return res.status(404).json({ error: "Key not found" });
  res.json({ deleted: true, id: req.params.id });
});

sandboxRouter.put("/keys/:id/rotate", async (req: Request, res: Response) => {
  const newKey = `sk_sandbox_${crypto.randomBytes(16).toString("hex")}`;
  const result = await queryOne("UPDATE gds_sandbox_keys SET api_key = $2 WHERE id = $1 AND tenant_id = $3 RETURNING *", [req.params.id, newKey, TENANT_ID]);
  if (!result) return res.status(404).json({ error: "Key not found" });
  res.json(result);
});

sandboxRouter.get("/test-cards", async (_req: Request, res: Response) => {
  const result = await query("SELECT * FROM gds_sandbox_test_cards ORDER BY brand, scenario");
  res.json({ cards: result.rows, total: result.rowCount });
});

sandboxRouter.post("/test-payment", async (req: Request, res: Response) => {
  const { card_number, amount, currency } = req.body;
  if (!card_number || !amount) return res.status(400).json({ error: "card_number and amount required" });
  const card = await queryOne("SELECT * FROM gds_sandbox_test_cards WHERE card_number = $1", [card_number]);
  if (!card) return res.status(404).json({ error: "Test card not found" });
  const approved = card.expected_result === "approved";
  res.json({
    transaction_id: `txn_test_${Date.now()}`,
    card_brand: card.brand,
    scenario: card.scenario,
    result: card.expected_result,
    approved,
    amount: Number(amount),
    currency: currency || "NGN",
    message: approved ? "Payment successful (sandbox)" : `Payment ${card.expected_result}: ${card.scenario}`,
  });
});
