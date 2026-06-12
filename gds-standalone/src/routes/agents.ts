/**
 * Agents API — Travel agent registration, management, commission tracking.
 */
import { Router, Request, Response } from "express";
import { requireRole } from "../auth";
import { v4 as uuidv4 } from "uuid";

export const agentsRouter = Router();

// Register new agent
agentsRouter.post("/register", async (req: Request, res: Response) => {
  const { agencyName, agentName, email, phone, country, iataCode, preferredCurrency } = req.body;

  if (!agencyName || !agentName || !email || !country) {
    res.status(400).json({ error: "agencyName, agentName, email, country required" });
    return;
  }

  const apiKey = `gds_${uuidv4().replace(/-/g, "")}`;

  res.status(201).json({
    agent: {
      id: `agent_${Date.now().toString(36)}`,
      agencyName,
      agentName,
      email,
      phone,
      country,
      iataCode: iataCode || null,
      preferredCurrency: preferredCurrency || "USD",
      tier: "bronze",
      commissionRate: 10.0,
      status: "pending_verification",
      apiKey,
      tenantId: (req as any).tenant?.tenantId,
      createdAt: new Date().toISOString(),
    },
    message: "Registration submitted. API key will be active after verification (24-48h).",
  });
});

// Get agent profile
agentsRouter.get("/me", async (req: Request, res: Response) => {
  res.json({
    agent: {
      id: req.gdsUser?.agentId || req.gdsUser?.sub,
      name: req.gdsUser?.name,
      email: req.gdsUser?.email,
      tier: "bronze",
      commissionRate: 10.0,
      totalBookings: 0,
      status: "active",
    },
  });
});

// Get commission summary
agentsRouter.get("/commission", async (req: Request, res: Response) => {
  res.json({
    totalEarned: 0,
    pendingPayout: 0,
    lastPayout: null,
    tier: "bronze",
    commissionRate: 10.0,
    nextTier: { name: "silver", bookingsNeeded: 50, rate: 12.0 },
    tiers: [
      { tier: "bronze", minBookings: 0, maxBookings: 50, rate: 10.0 },
      { tier: "silver", minBookings: 51, maxBookings: 200, rate: 12.0 },
      { tier: "gold", minBookings: 201, maxBookings: 500, rate: 15.0 },
      { tier: "platinum", minBookings: 501, maxBookings: 999999, rate: 18.0 },
    ],
  });
});

// Get commission history
agentsRouter.get("/commission/history", async (req: Request, res: Response) => {
  const { page = "1", page_size = "20" } = req.query;
  res.json({ history: [], total: 0, page: parseInt(page as string) });
});

// Request payout
agentsRouter.post("/payout", async (req: Request, res: Response) => {
  const { method, amount, currency, destination } = req.body;

  if (!method || !amount) {
    res.status(400).json({ error: "method and amount required" });
    return;
  }

  const validMethods = ["bank_transfer", "mobile_money", "mojaloop_instant"];
  if (!validMethods.includes(method)) {
    res.status(400).json({ error: "Invalid payout method", valid: validMethods });
    return;
  }

  res.json({
    payout: {
      id: `pay_${Date.now().toString(36)}`,
      method,
      amount,
      currency: currency || "USD",
      destination,
      status: "processing",
      estimatedArrival: method === "mojaloop_instant" ? "< 30 seconds" : "1-3 business days",
    },
  });
});

// List all agents (admin only)
agentsRouter.get("/", requireRole("admin"), async (req: Request, res: Response) => {
  const { status, tier, page = "1" } = req.query;
  res.json({ agents: [], total: 0, filters: { status, tier }, page: parseInt(page as string) });
});
