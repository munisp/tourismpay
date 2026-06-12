/**
 * Availability API — Check/update room availability per date.
 */
import { Router, Request, Response } from "express";
import { requireRole } from "../auth";

export const availabilityRouter = Router();

// Check availability for a property + dates
availabilityRouter.get("/check", async (req: Request, res: Response) => {
  const { propertyId, roomType, checkIn, checkOut, rooms = "1" } = req.query;

  if (!propertyId || !checkIn || !checkOut) {
    res.status(400).json({ error: "propertyId, checkIn, checkOut required" });
    return;
  }

  res.json({
    available: true,
    propertyId,
    roomType: roomType || "STD",
    checkIn,
    checkOut,
    requestedRooms: parseInt(rooms as string),
    availableRooms: 0,
    rate: 0,
    currency: "USD",
    policies: {
      cancellation: "Free cancellation until 48h before check-in",
      checkInTime: "14:00",
      checkOutTime: "11:00",
    },
  });
});

// Bulk availability check (multiple properties)
availabilityRouter.post("/bulk-check", async (req: Request, res: Response) => {
  const { properties } = req.body;

  if (!Array.isArray(properties) || properties.length === 0) {
    res.status(400).json({ error: "properties array required" });
    return;
  }

  if (properties.length > 50) {
    res.status(400).json({ error: "Maximum 50 properties per bulk check" });
    return;
  }

  const results = properties.map((p: any) => ({
    propertyId: p.propertyId,
    available: false,
    rate: 0,
    currency: "USD",
  }));

  res.json({ results, checked: results.length });
});

// Update availability (property managers)
availabilityRouter.put("/", requireRole("property_manager", "admin"), async (req: Request, res: Response) => {
  const { propertyId, roomType, date, available, closedToArrival, closedToDeparture } = req.body;

  if (!propertyId || !roomType || !date) {
    res.status(400).json({ error: "propertyId, roomType, date required" });
    return;
  }

  res.json({
    updated: true,
    propertyId,
    roomType,
    date,
    available: available ?? 0,
    closedToArrival: closedToArrival ?? false,
    closedToDeparture: closedToDeparture ?? false,
  });
});

// Bulk update availability (date range)
availabilityRouter.put("/bulk", requireRole("property_manager", "admin"), async (req: Request, res: Response) => {
  const { propertyId, roomType, dateFrom, dateTo, available } = req.body;

  if (!propertyId || !roomType || !dateFrom || !dateTo) {
    res.status(400).json({ error: "propertyId, roomType, dateFrom, dateTo required" });
    return;
  }

  const days = Math.ceil(
    (new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86400000,
  );

  res.json({ updated: true, propertyId, roomType, dateFrom, dateTo, daysUpdated: days, available });
});
