/**
 * Reservations API — Create, modify, cancel bookings.
 */
import { Router, Request, Response } from "express";
import { requireRole } from "../auth";

export const reservationsRouter = Router();

// Create reservation
reservationsRouter.post("/", async (req: Request, res: Response) => {
  const { propertyId, roomTypeCode, checkIn, checkOut, guestName, guestEmail, guests } = req.body;

  if (!propertyId || !roomTypeCode || !checkIn || !checkOut || !guestName) {
    res.status(400).json({ error: "Missing required booking fields" });
    return;
  }

  const nights = Math.ceil(
    (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000,
  );

  if (nights <= 0) {
    res.status(400).json({ error: "Check-out must be after check-in" });
    return;
  }

  const reservation = {
    id: `res_${Date.now().toString(36)}`,
    confirmationNo: `GDS${Date.now().toString(36).toUpperCase()}`,
    propertyId,
    roomTypeCode,
    checkIn,
    checkOut,
    nights,
    guestName,
    guestEmail,
    guests: guests || 2,
    status: "confirmed",
    agentId: req.gdsUser?.agentId || req.gdsUser?.sub,
    tenantId: (req as any).tenant?.tenantId,
    createdAt: new Date().toISOString(),
  };

  res.status(201).json({ reservation });
});

// Get reservation by ID
reservationsRouter.get("/:id", async (req: Request, res: Response) => {
  res.json({ reservation: null, id: req.params.id });
});

// List agent's reservations
reservationsRouter.get("/", async (req: Request, res: Response) => {
  const { status, page = "1", page_size = "20" } = req.query;
  res.json({
    reservations: [],
    total: 0,
    page: parseInt(page as string),
    pageSize: parseInt(page_size as string),
    filters: { status, agentId: req.gdsUser?.agentId },
  });
});

// Modify reservation
reservationsRouter.patch("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  res.json({ modified: true, reservationId: id, changes: req.body });
});

// Cancel reservation
reservationsRouter.post("/:id/cancel", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason || reason.length < 5) {
    res.status(400).json({ error: "Cancellation reason required (min 5 chars)" });
    return;
  }

  res.json({
    cancelled: true,
    reservationId: id,
    reason,
    refundAmount: 0,
    refundCurrency: "USD",
  });
});

// Get reservation confirmation (PDF-ready)
reservationsRouter.get("/:id/confirmation", async (req: Request, res: Response) => {
  res.json({ reservationId: req.params.id, format: "pdf", url: null });
});
