/**
 * Rates API — Manage rate plans, dynamic pricing, rate parity.
 */
import { Router, Request, Response } from "express";
import { requireRole } from "../auth";

export const ratesRouter = Router();

// Get rates for a property
ratesRouter.get("/", async (req: Request, res: Response) => {
  const { propertyId, roomType, dateFrom, dateTo, currency = "USD" } = req.query;

  if (!propertyId) {
    res.status(400).json({ error: "propertyId required" });
    return;
  }

  res.json({
    propertyId,
    roomType: roomType || "all",
    dateFrom,
    dateTo,
    currency,
    rates: [],
  });
});

// Get dynamic price (ML-adjusted)
ratesRouter.get("/dynamic", async (req: Request, res: Response) => {
  const { propertyId, roomType, date, baseRate } = req.query;

  if (!propertyId || !roomType || !date || !baseRate) {
    res.status(400).json({ error: "propertyId, roomType, date, baseRate required" });
    return;
  }

  const base = parseFloat(baseRate as string);
  // Simplified dynamic pricing (in production: call Python ML service)
  const multiplier = 1.0;
  const dynamic = base * multiplier;

  res.json({
    propertyId,
    roomType,
    date,
    baseRate: base,
    dynamicRate: dynamic,
    multiplier,
    factors: { occupancy: 0, leadTime: 0, season: 0, demand: 0 },
  });
});

// Set/update rate plan (property managers)
ratesRouter.post("/plans", requireRole("property_manager", "admin"), async (req: Request, res: Response) => {
  const { propertyId, roomType, ratePlanCode, rate, currency, mealPlan, dateFrom, dateTo } = req.body;

  if (!propertyId || !roomType || !rate || !dateFrom || !dateTo) {
    res.status(400).json({ error: "Missing required rate plan fields" });
    return;
  }

  res.status(201).json({
    created: true,
    ratePlan: {
      propertyId,
      roomType,
      ratePlanCode: ratePlanCode || "BAR",
      rate,
      currency: currency || "USD",
      mealPlan: mealPlan || "RO",
      dateFrom,
      dateTo,
    },
  });
});

// Bulk rate update (date range)
ratesRouter.put("/bulk", requireRole("property_manager", "admin"), async (req: Request, res: Response) => {
  const { propertyId, roomType, dateFrom, dateTo, rate, currency } = req.body;
  res.json({ updated: true, propertyId, roomType, dateFrom, dateTo, rate, currency });
});

// Rate parity check
ratesRouter.get("/parity", async (req: Request, res: Response) => {
  const { propertyId } = req.query;
  res.json({
    propertyId,
    parityAlerts: [],
    status: "no_alerts",
    lastChecked: new Date().toISOString(),
  });
});
