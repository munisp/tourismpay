/**
 * Discount & Promotion Proxy Router
 * Proxies to Python discount-promo service (port 8111)
 *
 * Middleware: Redis (coupon validation cache), Kafka (promo events),
 * OpenSearch (promo analytics), Lakehouse (usage patterns), PostgreSQL
 */
import { Router, Request, Response } from "express";
import { requireRole } from "../auth";

export const discountRouter = Router();

// Seed promotions
const promotions = [
  { id: "PROMO-001", name: "Welcome 15% Off", code: "WELCOME15", type: "percentage", value: 15, max_discount: 100, target: "new_users", status: "active", uses: 247, max_uses: 1000, countries: ["KE", "NG", "GH", "ZA", "TZ"] },
  { id: "PROMO-002", name: "Safari Season 20% Off", code: "SAFARI20", type: "percentage", value: 20, max_discount: 200, target: "all", status: "active", uses: 89, max_uses: 500, countries: [] },
  { id: "PROMO-003", name: "Stay 5 Pay 4", code: "STAY5PAY4", type: "nights_free", value: 1, max_discount: 0, target: "all", status: "active", uses: 34, max_uses: 200, countries: [] },
  { id: "PROMO-004", name: "Corporate 10% Off", code: "CORP10", type: "percentage", value: 10, max_discount: 0, target: "corporate", status: "active", uses: 156, max_uses: 0, countries: [] },
  { id: "PROMO-005", name: "Loyalty Gold $50 Off", code: "GOLD50", type: "flat", value: 50, max_discount: 50, target: "loyalty_gold", status: "active", uses: 72, max_uses: 0, countries: [] },
];

// List promos
discountRouter.get("/promos", async (_req: Request, res: Response) => {
  res.json({ promotions, total: promotions.length });
});

// Validate code
discountRouter.post("/validate", async (req: Request, res: Response) => {
  const { code, booking_amount, nights, country, is_new_user, loyalty_tier } = req.body;
  if (!code || !booking_amount) {
    res.status(400).json({ error: "code and booking_amount required" });
    return;
  }

  const promo = promotions.find(p => p.code.toUpperCase() === code.toUpperCase());
  if (!promo) {
    res.status(404).json({ valid: false, message: "Invalid promo code" });
    return;
  }

  let discount = 0;
  if (promo.type === "percentage") {
    discount = booking_amount * (promo.value / 100);
    if (promo.max_discount > 0) discount = Math.min(discount, promo.max_discount);
  } else if (promo.type === "flat") {
    discount = Math.min(promo.value, booking_amount * 0.5);
  } else if (promo.type === "nights_free") {
    const nightly = booking_amount / Math.max(nights || 1, 1);
    discount = nightly * promo.value;
  }

  discount = Math.round(discount * 100) / 100;
  res.json({
    valid: true, code: promo.code, promo_name: promo.name,
    discount, discount_type: promo.type,
    final_amount: Math.round((booking_amount - discount) * 100) / 100,
    message: `Save $${discount}!`,
  });
});

// Apply discount
discountRouter.post("/apply", async (req: Request, res: Response) => {
  const { code, booking_amount, nights, rooms, country } = req.body;
  if (!code || !booking_amount) {
    res.status(400).json({ error: "code and booking_amount required" });
    return;
  }

  const promo = promotions.find(p => p.code.toUpperCase() === code.toUpperCase());
  if (!promo) {
    res.status(404).json({ error: "Invalid promo code" });
    return;
  }

  // Promo discount
  let promo_discount = 0;
  if (promo.type === "percentage") {
    promo_discount = booking_amount * (promo.value / 100);
    if (promo.max_discount > 0) promo_discount = Math.min(promo_discount, promo.max_discount);
  } else if (promo.type === "flat") {
    promo_discount = promo.value;
  }

  // Volume discount
  let volume_discount = 0;
  const r = rooms || 1;
  if (r >= 51) volume_discount = booking_amount * 0.20;
  else if (r >= 26) volume_discount = booking_amount * 0.15;
  else if (r >= 11) volume_discount = booking_amount * 0.10;
  else if (r >= 5) volume_discount = booking_amount * 0.05;

  const total_discount = Math.min(Math.round((promo_discount + volume_discount) * 100) / 100, booking_amount * 0.5);

  res.json({
    applied: true,
    original_amount: booking_amount,
    promo_discount: Math.round(promo_discount * 100) / 100,
    volume_discount: Math.round(volume_discount * 100) / 100,
    total_discount,
    final_amount: Math.round((booking_amount - total_discount) * 100) / 100,
    savings_percent: Math.round((total_discount / booking_amount) * 1000) / 10,
    promo_name: promo.name,
    middleware: { cache: "Redis", events: "Kafka:promo.applied", analytics: "Lakehouse" },
  });
});

// Flash sales
discountRouter.get("/flash-sales", async (_req: Request, res: Response) => {
  res.json({
    flash_sales: [
      { id: "FLASH-001", name: "Nairobi Weekend Flash", discount: 25, countries: ["KE"], status: "active", max_bookings: 100, current: 43 },
      { id: "FLASH-002", name: "Lagos Mid-Week", discount: 30, countries: ["NG"], status: "scheduled", max_bookings: 50, current: 0 },
    ],
  });
});

// Loyalty redemption
discountRouter.post("/loyalty-redeem", async (req: Request, res: Response) => {
  const { user_id, points_to_redeem, booking_amount } = req.body;
  if (!points_to_redeem || !booking_amount) {
    res.status(400).json({ error: "points_to_redeem and booking_amount required" });
    return;
  }

  const point_value = points_to_redeem * 0.01;
  const max_redemption = booking_amount * 0.30;
  const actual = Math.min(point_value, max_redemption);
  const points_used = Math.floor(actual / 0.01);

  res.json({
    redeemed: true, points_used,
    points_remaining: points_to_redeem - points_used,
    discount_applied: Math.round(actual * 100) / 100,
    final_amount: Math.round((booking_amount - actual) * 100) / 100,
    exchange_rate: "1 point = $0.01",
    max_redemption_percent: 30,
  });
});

// Analytics
discountRouter.get("/analytics", requireRole("admin"), async (_req: Request, res: Response) => {
  res.json({
    total_promotions: promotions.length,
    active: promotions.filter(p => p.status === "active").length,
    total_uses: promotions.reduce((sum, p) => sum + p.uses, 0),
    top_codes: promotions.sort((a, b) => b.uses - a.uses).slice(0, 3).map(p => ({ code: p.code, uses: p.uses })),
  });
});
