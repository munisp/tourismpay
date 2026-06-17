/**
 * Revenue Management Route — Proxies to Python revenue service (port 8086).
 * Yield optimization, overbooking, demand forecasting, competitor parity.
 */
import { Router, Request, Response } from "express";

export const revenueRouter = Router();

const REVENUE_SERVICE_URL = process.env.REVENUE_SERVICE_URL || "http://localhost:8086";

async function proxy(req: Request, res: Response, path: string, method: string = "GET") {
  try {
    const url = `${REVENUE_SERVICE_URL}${path}`;
    const options: RequestInit = {
      method,
      headers: { "Content-Type": "application/json" },
    };
    if (method !== "GET") {
      options.body = JSON.stringify(req.body);
    }
    const response = await fetch(url, options);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    res.status(503).json({ error: "Revenue service unavailable" });
  }
}

// Yield calculation
revenueRouter.post("/yield", (req, res) => proxy(req, res, "/api/v1/revenue/yield", "POST"));

// Overbooking calculation
revenueRouter.post("/overbooking", (req, res) => proxy(req, res, "/api/v1/revenue/overbooking", "POST"));

// Demand forecast
revenueRouter.post("/forecast", (req, res) => proxy(req, res, "/api/v1/revenue/forecast", "POST"));

// Competitor analysis
revenueRouter.get("/competitors", (req, res) => {
  const params = new URLSearchParams(req.query as Record<string, string>);
  proxy(req, res, `/api/v1/revenue/competitors?${params.toString()}`);
});

// Event calendar
revenueRouter.get("/events", (req, res) => {
  const params = new URLSearchParams(req.query as Record<string, string>);
  proxy(req, res, `/api/v1/revenue/events?${params.toString()}`);
});
