/**
 * Revenue Management Route — Proxies to Python revenue service (port 8086).
 * Falls back to in-memory seed data when service is unavailable.
 */
import { Router, Request, Response } from "express";

export const revenueRouter = Router();

const REVENUE_SERVICE_URL = process.env.REVENUE_SERVICE_URL || "http://localhost:8086";

// ─── Seed Data ───────────────────────────────────────────────────
const SEED_EVENTS = [
  { id: "EVT-001", name: "Great Migration", region: "KE/TZ", months: "Jul-Oct", demand_multiplier: 2.8, impact: "+180%", properties_affected: 142 },
  { id: "EVT-002", name: "Cape Town Summer", region: "ZA", months: "Dec-Feb", demand_multiplier: 2.2, impact: "+120%", properties_affected: 89 },
  { id: "EVT-003", name: "Gorilla Season", region: "RW/UG", months: "Jun-Sep", demand_multiplier: 2.5, impact: "+150%", properties_affected: 34 },
  { id: "EVT-004", name: "Marrakech Festival", region: "MA", months: "Jun", demand_multiplier: 1.9, impact: "+90%", properties_affected: 67 },
  { id: "EVT-005", name: "Zanzibar High Season", region: "TZ", months: "Jul-Mar", demand_multiplier: 2.0, impact: "+100%", properties_affected: 52 },
  { id: "EVT-006", name: "Victoria Falls Peak", region: "ZW/ZM", months: "Aug-Dec", demand_multiplier: 2.1, impact: "+110%", properties_affected: 28 },
  { id: "EVT-007", name: "AFCON Tournament", region: "Various", months: "Jan-Feb", demand_multiplier: 3.0, impact: "+200%", properties_affected: 215 },
  { id: "EVT-008", name: "Lagos Fashion Week", region: "NG", months: "Oct", demand_multiplier: 1.75, impact: "+75%", properties_affected: 45 },
];

const SEED_COMPETITORS = [
  { property: "Serena Nairobi", our_rate: 220, competitor_avg: 245, parity_index: 0.90, recommendation: "Hold — 10% below market" },
  { property: "Mara Safari Lodge", our_rate: 450, competitor_avg: 420, parity_index: 1.07, recommendation: "Consider -5% to match market" },
  { property: "Zanzibar Beach Resort", our_rate: 320, competitor_avg: 310, parity_index: 1.03, recommendation: "At parity" },
  { property: "Table Mountain Hotel", our_rate: 400, competitor_avg: 380, parity_index: 1.05, recommendation: "At parity" },
];

// Proxy with fallback
async function proxyWithFallback(req: Request, res: Response, path: string, method: string, fallback: () => void) {
  try {
    const url = `${REVENUE_SERVICE_URL}${path}`;
    const options: RequestInit = { method, headers: { "Content-Type": "application/json" } };
    if (method !== "GET") options.body = JSON.stringify(req.body);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    options.signal = controller.signal;
    const response = await fetch(url, options);
    clearTimeout(timeout);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch {
    fallback();
  }
}

// Yield calculation
revenueRouter.post("/yield", (req, res) => {
  proxyWithFallback(req, res, "/api/v1/revenue/yield", "POST", () => {
    const { base_rate = 200, occupancy = 0.75, season = "peak" } = req.body;
    const seasonMultiplier: Record<string, number> = { peak: 1.5, high: 1.3, shoulder: 1.0, low: 0.7 };
    const occMultiplier = 1 + 2 * (1 / (1 + Math.exp(-10 * (occupancy - 0.5))));
    const final_rate = Math.round(base_rate * (seasonMultiplier[season] || 1.0) * occMultiplier * 100) / 100;
    res.json({ base_rate, occupancy, season, season_multiplier: seasonMultiplier[season] || 1.0, occupancy_multiplier: Math.round(occMultiplier * 100) / 100, final_rate, source: "gds-gateway-seed" });
  });
});

// Overbooking calculation
revenueRouter.post("/overbooking", (req, res) => {
  proxyWithFallback(req, res, "/api/v1/revenue/overbooking", "POST", () => {
    const { capacity = 100, no_show_rate = 0.08, cancellation_rate = 0.05 } = req.body;
    const recommended_overbook = Math.round(capacity * (no_show_rate + cancellation_rate * 0.5));
    res.json({ capacity, no_show_rate, cancellation_rate, recommended_overbook, total_bookable: capacity + recommended_overbook, risk_score: "low", source: "gds-gateway-seed" });
  });
});

// Demand forecast
revenueRouter.post("/forecast", (req, res) => {
  proxyWithFallback(req, res, "/api/v1/revenue/forecast", "POST", () => {
    const { property_id = "PROP-001", days_ahead = 30 } = req.body;
    const forecast = Array.from({ length: Math.min(days_ahead, 30) }, (_, i) => ({
      date: new Date(Date.now() + i * 86400000).toISOString().split("T")[0],
      predicted_occupancy: Math.round((65 + Math.random() * 30) * 10) / 10,
      predicted_adr: Math.round((180 + Math.random() * 80) * 100) / 100,
      confidence: Math.round((85 + Math.random() * 10) * 10) / 10,
    }));
    res.json({ property_id, forecast, source: "gds-gateway-seed" });
  });
});

// Competitor analysis
revenueRouter.get("/competitors", (req, res) => {
  proxyWithFallback(req, res, `/api/v1/revenue/competitors?${new URLSearchParams(req.query as Record<string, string>).toString()}`, "GET", () => {
    res.json({ competitors: SEED_COMPETITORS, market_avg_rate: 338.75, our_avg_rate: 347.50, overall_parity: 1.01, source: "gds-gateway-seed" });
  });
});

// Event calendar
revenueRouter.get("/events", (req, res) => {
  proxyWithFallback(req, res, `/api/v1/revenue/events?${new URLSearchParams(req.query as Record<string, string>).toString()}`, "GET", () => {
    res.json({ events: SEED_EVENTS, total: SEED_EVENTS.length, source: "gds-gateway-seed" });
  });
});
