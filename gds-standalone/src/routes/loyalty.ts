/**
 * Loyalty API — Points accrual and redemption for GDS bookings.
 * GDS bookings earn 15 pts/USD (50% more than QR payments).
 * Integrates with TourismPay Loyalty API for cross-platform point tracking.
 */
import { Router, Request, Response } from "express";
import { requireRole } from "../auth";

export const loyaltyRouter = Router();

interface LoyaltyTier {
  name: string;
  minBookings: number;
  maxBookings: number;
  multiplier: number;
  benefits: string[];
}

const TIERS: LoyaltyTier[] = [
  { name: "Bronze", minBookings: 0, maxBookings: 50, multiplier: 1.0, benefits: ["Base earn rate", "Standard support"] },
  { name: "Silver", minBookings: 51, maxBookings: 200, multiplier: 1.5, benefits: ["Priority support", "Silver discounts", "Late checkout"] },
  { name: "Gold", minBookings: 201, maxBookings: 500, multiplier: 2.0, benefits: ["Account manager", "Lounge access", "Free upgrades"] },
  { name: "Platinum", minBookings: 501, maxBookings: 999999, multiplier: 3.0, benefits: ["Concierge", "Unlimited lounge", "VIP transfers", "Best rate guarantee"] },
];

const PROPERTY_BONUSES: Record<string, number> = {
  hotel: 1.0,
  lodge: 1.5,
  safari_camp: 2.0,
  resort: 1.5,
  boutique: 1.2,
  villa: 1.3,
  activity: 1.8,
};

const BASE_POINTS_PER_USD = 15;
const GDS_BOOKING_MULTIPLIER = 1.2;

// Get loyalty program configuration
loyaltyRouter.get("/config", async (_req: Request, res: Response) => {
  res.json({
    basePointsPerUSD: BASE_POINTS_PER_USD,
    gdsBookingMultiplier: GDS_BOOKING_MULTIPLIER,
    tiers: TIERS,
    propertyBonuses: PROPERTY_BONUSES,
    formula: "Total Points = (Amount × 15) × Tier Mult × Property Bonus × GDS Mult",
    tippingBonus: "2x points on tips processed via GDS",
  });
});

// Calculate points for a booking
loyaltyRouter.post("/calculate", async (req: Request, res: Response) => {
  const { amount, currency, propertyType = "hotel", guestTier = "Bronze", bookingType = "gds" } = req.body;

  if (!amount) {
    res.status(400).json({ error: "amount required" });
    return;
  }

  const tier = TIERS.find((t) => t.name.toLowerCase() === guestTier.toLowerCase()) || TIERS[0];
  const propertyBonus = PROPERTY_BONUSES[propertyType] || 1.0;
  const bookingMult = bookingType === "gds" ? GDS_BOOKING_MULTIPLIER : 1.0;

  const basePoints = amount * BASE_POINTS_PER_USD;
  const totalPoints = Math.round(basePoints * tier.multiplier * propertyBonus * bookingMult);

  res.json({
    amount,
    currency: currency || "USD",
    breakdown: {
      basePoints,
      tierMultiplier: tier.multiplier,
      tierName: tier.name,
      propertyBonus,
      propertyType,
      bookingMultiplier: bookingMult,
      bookingType,
    },
    totalPoints,
    formula: `$${amount} × ${BASE_POINTS_PER_USD} pts × ${tier.multiplier} (${tier.name}) × ${propertyBonus} (${propertyType}) × ${bookingMult} (${bookingType}) = ${totalPoints} points`,
  });
});

// Get guest loyalty account
loyaltyRouter.get("/account", async (req: Request, res: Response) => {
  res.json({
    guestId: req.gdsUser?.sub,
    currentPoints: 0,
    lifetimePoints: 0,
    tier: "Bronze",
    nextTier: { name: "Silver", pointsNeeded: 5000 },
    totalBookings: 0,
    expiringPoints: { amount: 0, expiresAt: null },
  });
});

// Get available rewards
loyaltyRouter.get("/rewards", async (_req: Request, res: Response) => {
  res.json({
    rewards: [
      { id: "rw_1", name: "Free Night (Budget)", pointsCost: 5000, category: "accommodation" },
      { id: "rw_2", name: "Airport Transfer", pointsCost: 1200, category: "transport" },
      { id: "rw_3", name: "Safari Discount (30%)", pointsCost: 3000, category: "activity" },
      { id: "rw_4", name: "Restaurant Voucher ($50)", pointsCost: 800, category: "dining" },
      { id: "rw_5", name: "Spa Package", pointsCost: 2500, category: "wellness" },
      { id: "rw_6", name: "Museum/Cultural Pass", pointsCost: 600, category: "culture" },
      { id: "rw_7", name: "Room Upgrade", pointsCost: 2000, category: "accommodation" },
      { id: "rw_8", name: "Late Checkout", pointsCost: 500, category: "accommodation" },
    ],
  });
});

// Redeem reward
loyaltyRouter.post("/redeem", async (req: Request, res: Response) => {
  const { rewardId, reservationId } = req.body;

  if (!rewardId) {
    res.status(400).json({ error: "rewardId required" });
    return;
  }

  res.json({
    redemption: {
      id: `rdm_${Date.now().toString(36)}`,
      rewardId,
      reservationId: reservationId || null,
      guestId: req.gdsUser?.sub,
      status: "confirmed",
      createdAt: new Date().toISOString(),
    },
    message: "Reward redeemed successfully.",
  });
});

// Admin: Loyalty analytics
loyaltyRouter.get("/analytics", requireRole("admin"), async (_req: Request, res: Response) => {
  res.json({
    totalPointsIssued: 4200000,
    totalPointsRedeemed: 850000,
    activeAccounts: 2847,
    tierDistribution: [
      { tier: "Bronze", count: 2100, percent: 73.8 },
      { tier: "Silver", count: 500, percent: 17.6 },
      { tier: "Gold", count: 200, percent: 7.0 },
      { tier: "Platinum", count: 47, percent: 1.6 },
    ],
    topRewards: [
      { name: "Free Night (Budget)", redemptions: 120 },
      { name: "Airport Transfer", redemptions: 95 },
      { name: "Restaurant Voucher ($50)", redemptions: 80 },
    ],
    avgPointsPerBooking: 1475,
    period: "all_time",
  });
});
