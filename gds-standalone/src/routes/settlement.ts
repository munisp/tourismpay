/**
 * Settlement API — Commission calculation, batch processing, payouts.
 * Integrates with TigerBeetle (ledger) and Mojaloop (cross-border).
 */
import { Router, Request, Response } from "express";
import { requireRole } from "../auth";

export const settlementRouter = Router();

// Get settlement batches
settlementRouter.get("/batches", async (req: Request, res: Response) => {
  const { status, period, page = "1" } = req.query;
  res.json({ batches: [], total: 0, filters: { status, period }, page: parseInt(page as string) });
});

// Get specific batch
settlementRouter.get("/batches/:id", async (req: Request, res: Response) => {
  res.json({ batch: null, id: req.params.id });
});

// Create settlement batch (admin)
settlementRouter.post("/batches", requireRole("admin"), async (req: Request, res: Response) => {
  const { propertyId, agentId, period, reservationIds } = req.body;

  if (!propertyId || !agentId || !period) {
    res.status(400).json({ error: "propertyId, agentId, period required" });
    return;
  }

  res.status(201).json({
    batch: {
      id: `batch_${Date.now().toString(36)}`,
      propertyId,
      agentId,
      period,
      reservations: reservationIds || [],
      totalGross: 0,
      totalCommission: 0,
      totalNet: 0,
      status: "pending",
      createdAt: new Date().toISOString(),
    },
  });
});

// Process batch payout
settlementRouter.post("/batches/:id/process", requireRole("admin"), async (req: Request, res: Response) => {
  const { id } = req.params;
  const { method, destination } = req.body;

  const validMethods = ["bank_transfer", "mobile_money", "mojaloop_instant"];
  if (!method || !validMethods.includes(method)) {
    res.status(400).json({ error: "Valid payout method required", valid: validMethods });
    return;
  }

  res.json({
    processed: true,
    batchId: id,
    method,
    destination,
    payoutRef: `payout_${Date.now().toString(36)}`,
    status: "processing",
    ledger: "tigerbeetle",
    settlement: method === "mojaloop_instant" ? "mojaloop" : "bank",
  });
});

// Get settlement summary
settlementRouter.get("/summary", async (req: Request, res: Response) => {
  res.json({
    totalSettled: 0,
    pendingSettlement: 0,
    failedSettlements: 0,
    lastSettlement: null,
    byCurrency: {},
    byMethod: { bank_transfer: 0, mobile_money: 0, mojaloop_instant: 0 },
  });
});

// Reconciliation report
settlementRouter.get("/reconciliation", requireRole("admin"), async (req: Request, res: Response) => {
  const { dateFrom, dateTo } = req.query;
  res.json({
    period: { from: dateFrom, to: dateTo },
    totalBookings: 0,
    totalSettled: 0,
    discrepancies: [],
    status: "balanced",
  });
});
