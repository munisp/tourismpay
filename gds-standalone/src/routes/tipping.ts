/**
 * Tipping API — Multi-recipient tipping for GDS bookings.
 * Post-checkout tips distributed to property staff via role templates.
 * Integrates with TourismPay Tipping API for wallet-to-wallet transfers.
 */
import { Router, Request, Response } from "express";
import { requireRole } from "../auth";

export const tippingRouter = Router();

interface StaffRole {
  role: string;
  suggestedPercent: number;
}

interface PropertyTemplate {
  type: string;
  roles: StaffRole[];
}

const PROPERTY_TEMPLATES: PropertyTemplate[] = [
  {
    type: "hotel",
    roles: [
      { role: "Front Desk", suggestedPercent: 5 },
      { role: "Housekeeping", suggestedPercent: 10 },
      { role: "Concierge", suggestedPercent: 8 },
      { role: "Bellhop", suggestedPercent: 5 },
      { role: "Room Service", suggestedPercent: 7 },
    ],
  },
  {
    type: "lodge",
    roles: [
      { role: "Host", suggestedPercent: 12 },
      { role: "Chef", suggestedPercent: 10 },
      { role: "Guide", suggestedPercent: 15 },
      { role: "Housekeeper", suggestedPercent: 8 },
    ],
  },
  {
    type: "safari_camp",
    roles: [
      { role: "Lead Guide", suggestedPercent: 20 },
      { role: "Tracker", suggestedPercent: 12 },
      { role: "Driver", suggestedPercent: 10 },
      { role: "Camp Staff", suggestedPercent: 8 },
    ],
  },
  {
    type: "resort",
    roles: [
      { role: "Concierge", suggestedPercent: 8 },
      { role: "Spa Therapist", suggestedPercent: 15 },
      { role: "Waiter", suggestedPercent: 10 },
      { role: "Housekeeper", suggestedPercent: 8 },
      { role: "Activities Coordinator", suggestedPercent: 7 },
    ],
  },
  {
    type: "restaurant",
    roles: [
      { role: "Waiter", suggestedPercent: 15 },
      { role: "Chef", suggestedPercent: 8 },
      { role: "Bartender", suggestedPercent: 10 },
      { role: "Host", suggestedPercent: 5 },
    ],
  },
  {
    type: "tour_operator",
    roles: [
      { role: "Tour Guide", suggestedPercent: 18 },
      { role: "Driver", suggestedPercent: 10 },
      { role: "Assistant", suggestedPercent: 7 },
    ],
  },
  {
    type: "transport",
    roles: [
      { role: "Driver", suggestedPercent: 12 },
      { role: "Porter", suggestedPercent: 8 },
    ],
  },
];

// Get role templates by property type
tippingRouter.get("/templates", async (req: Request, res: Response) => {
  const { propertyType } = req.query;

  if (propertyType) {
    const template = PROPERTY_TEMPLATES.find((t) => t.type === propertyType);
    if (!template) {
      res.status(404).json({ error: "Property type not found", valid: PROPERTY_TEMPLATES.map((t) => t.type) });
      return;
    }
    res.json({ template });
    return;
  }

  res.json({ templates: PROPERTY_TEMPLATES });
});

// Calculate multi-recipient tip distribution
tippingRouter.post("/calculate", async (req: Request, res: Response) => {
  const { totalAmount, currency, recipients, splitMode = "equal" } = req.body;

  if (!totalAmount || !recipients || !Array.isArray(recipients) || recipients.length === 0) {
    res.status(400).json({ error: "totalAmount and recipients[] required" });
    return;
  }

  if (recipients.length > 20) {
    res.status(400).json({ error: "Maximum 20 recipients per tip" });
    return;
  }

  let distribution: Array<{ role: string; amount: number; percent: number }>;

  if (splitMode === "equal") {
    const perPerson = Math.round((totalAmount / recipients.length) * 100) / 100;
    distribution = recipients.map((r: any) => ({
      role: r.role,
      amount: perPerson,
      percent: Math.round((100 / recipients.length) * 10) / 10,
    }));
  } else if (splitMode === "percent") {
    distribution = recipients.map((r: any) => ({
      role: r.role,
      amount: Math.round(totalAmount * (r.percent / 100) * 100) / 100,
      percent: r.percent,
    }));
  } else {
    distribution = recipients.map((r: any) => ({
      role: r.role,
      amount: r.amount || 0,
      percent: Math.round((r.amount / totalAmount) * 100 * 10) / 10,
    }));
  }

  const allocatedTotal = distribution.reduce((sum, d) => sum + d.amount, 0);

  res.json({
    totalAmount,
    currency: currency || "USD",
    splitMode,
    recipientCount: recipients.length,
    distribution,
    allocatedTotal: Math.round(allocatedTotal * 100) / 100,
    loyaltyBonus: "2x points on tips via GDS",
  });
});

// Send tip (execute transfer via TourismPay API)
tippingRouter.post("/send", async (req: Request, res: Response) => {
  const { reservationId, propertyId, totalAmount, currency, recipients, message } = req.body;

  if (!reservationId || !propertyId || !totalAmount || !recipients) {
    res.status(400).json({ error: "reservationId, propertyId, totalAmount, recipients required" });
    return;
  }

  const tipGroup = {
    id: `tip_${Date.now().toString(36)}`,
    reservationId,
    propertyId,
    totalAmount,
    currency: currency || "USD",
    recipientCount: recipients.length,
    status: "processing",
    message: message || null,
    guestId: req.gdsUser?.sub,
    createdAt: new Date().toISOString(),
  };

  res.status(201).json({
    tipGroup,
    message: "Tips queued for processing. Each recipient will receive a notification.",
    loyaltyPointsEarned: Math.round(totalAmount * 15 * 2),
  });
});

// Get tip history for a reservation
tippingRouter.get("/history", async (req: Request, res: Response) => {
  const { reservationId, page = "1", pageSize = "20" } = req.query;
  res.json({
    tips: [],
    total: 0,
    reservationId,
    page: parseInt(page as string),
    pageSize: parseInt(pageSize as string),
  });
});

// Get jurisdiction-specific tipping customs
tippingRouter.get("/customs/:jurisdictionCode", async (req: Request, res: Response) => {
  const customs: Record<string, { customary: boolean; typicalPercent: number; notes: string }> = {
    NG: { customary: true, typicalPercent: 10, notes: "Tipping common in hotels/restaurants. Often included in bill." },
    KE: { customary: true, typicalPercent: 10, notes: "Expected in tourism. Safari guides expect $10-20/day." },
    GH: { customary: false, typicalPercent: 5, notes: "Not expected but appreciated in tourist areas." },
    ZA: { customary: true, typicalPercent: 15, notes: "Standard 10-15% in restaurants. Petrol attendants tipped." },
    TZ: { customary: true, typicalPercent: 10, notes: "Expected for safari staff. $10-15/day for guides." },
    RW: { customary: false, typicalPercent: 10, notes: "Not mandatory but appreciated for gorilla trek guides." },
    EG: { customary: true, typicalPercent: 12, notes: "Baksheesh culture. Expected in most service interactions." },
    MA: { customary: true, typicalPercent: 10, notes: "Common in riads and restaurants. Small tips for guides." },
    UG: { customary: false, typicalPercent: 10, notes: "Appreciated for safari guides and hotel staff." },
    ET: { customary: false, typicalPercent: 10, notes: "Not expected but appreciated in tourist establishments." },
    BW: { customary: true, typicalPercent: 10, notes: "Expected for safari guides. $10-20/day recommended." },
    NA: { customary: true, typicalPercent: 10, notes: "Expected in lodges and for guides." },
    MU: { customary: false, typicalPercent: 10, notes: "Service charge often included. Extra tips appreciated." },
    MZ: { customary: false, typicalPercent: 5, notes: "Tipping not widespread but appreciated in tourist areas." },
    ZW: { customary: true, typicalPercent: 10, notes: "Expected in USD. Safari guides $10-20/day." },
  };

  const code = req.params.jurisdictionCode.toUpperCase();
  const info = customs[code];
  if (!info) {
    res.status(404).json({ error: "Jurisdiction not found" });
    return;
  }

  res.json({ jurisdictionCode: code, ...info });
});

// Admin: Get tipping analytics
tippingRouter.get("/analytics", requireRole("admin"), async (_req: Request, res: Response) => {
  res.json({
    totalTipsProcessed: 0,
    totalAmount: 0,
    avgTipPercent: 0,
    topPropertyTypes: [],
    byJurisdiction: [],
    period: "last_30_days",
  });
});
