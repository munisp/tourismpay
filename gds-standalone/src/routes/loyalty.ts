import { Router, Request, Response } from "express";
import { query, queryOne } from "../lib/database";
import { cacheGet, cacheSet } from "../lib/redis";

export const loyaltyRouter = Router();

loyaltyRouter.get("/tiers", async (_req: Request, res: Response) => {
  const cached = await cacheGet("loyalty:tiers");
  if (cached) return res.json(JSON.parse(cached));
  const result = await query("SELECT * FROM gds_loyalty_config ORDER BY min_points ASC");
  const resp = { tiers: result.rows, total: result.rowCount };
  await cacheSet("loyalty:tiers", JSON.stringify(resp), 600);
  res.json(resp);
});

loyaltyRouter.get("/rewards", async (_req: Request, res: Response) => {
  const result = await query("SELECT * FROM gds_loyalty_rewards WHERE status = 'active' ORDER BY points_required ASC");
  res.json({ rewards: result.rows, total: result.rowCount });
});

loyaltyRouter.post("/calculate", async (req: Request, res: Response) => {
  const { amount, guest_tier, property_type } = req.body;
  if (!amount) return res.status(400).json({ error: "amount required" });
  const gross = Number(amount);
  const tier = guest_tier || "bronze";
  const config = await queryOne("SELECT * FROM gds_loyalty_config WHERE tier = $1", [tier]);
  const multiplier = Number(config?.multiplier || 1.0);
  const basePoints = Math.floor(gross / 1000);
  const earnedPoints = Math.round(basePoints * multiplier);
  const nightCredits = Number((gross / 85000 * 0.5 * multiplier).toFixed(2));

  const txn = await queryOne(
    "INSERT INTO gds_loyalty_transactions (amount,property_type,guest_tier,points_earned,night_credits) VALUES ($1,$2,$3,$4,$5) RETURNING *",
    [gross, property_type || "hotel", tier, earnedPoints, nightCredits]
  );
  res.json({ transaction: txn, summary: { amount: gross, tier, multiplier, base_points: basePoints, earned_points: earnedPoints, night_credits: nightCredits, currency: "NGN" } });
});

loyaltyRouter.get("/transactions", async (_req: Request, res: Response) => {
  const result = await query("SELECT * FROM gds_loyalty_transactions ORDER BY created_at DESC LIMIT 50");
  res.json({ transactions: result.rows, total: result.rowCount });
});
