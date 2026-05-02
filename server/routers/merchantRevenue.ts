/**
 * Merchant Revenue Router
 * Powers the restaurant post-go-live revenue dashboard.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  establishments,
  qrPaymentTokens,
  loyaltyTransactions,
  kybApplications,
  touristDeals,
  touristDealRedemptions,
  touristBookings,
  touristReviews,
  establishmentScoreSnapshots,
} from "../../drizzle/schema";
import { eq, and, gte, desc, count, sql, avg, sum, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";


export const merchantRevenueRouter = router({
  /** Summary stats for a merchant's establishment */
  summary: protectedProcedure
    .input(z.object({ establishmentId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return null;

      const [est] = await db
        .select()
        .from(establishments)
        .where(eq(establishments.id, input.establishmentId))
        .limit(1);

      if (!est) throw new Error("Establishment not found");
      if (est.ownerId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new Error("Not authorized");
      }

      // Total paid QR payments
      const allPaid = await db
        .select()
        .from(qrPaymentTokens)
        .where(
          and(
            eq(qrPaymentTokens.establishmentId, input.establishmentId),
            eq(qrPaymentTokens.status, "paid")
          )
        );

      const totalRevenue = allPaid.reduce(
        (sum, r) => sum + parseFloat(r.amountUsd ?? "0"),
        0
      );
      const totalTransactions = allPaid.length;

      // Today's revenue
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayPaid = allPaid.filter(
        (r) => r.paidAt && r.paidAt >= todayStart
      );
      const todayRevenue = todayPaid.reduce(
        (sum, r) => sum + parseFloat(r.amountUsd ?? "0"),
        0
      );

      // This week
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);
      const weekPaid = allPaid.filter(
        (r) => r.paidAt && r.paidAt >= weekStart
      );
      const weekRevenue = weekPaid.reduce(
        (sum, r) => sum + parseFloat(r.amountUsd ?? "0"),
        0
      );

      // Loyalty points issued
      const loyaltyRows = await db
        .select()
        .from(loyaltyTransactions)
        .where(eq(loyaltyTransactions.partner, `est:${input.establishmentId}`));

      const totalPointsIssued = loyaltyRows
        .filter((r) => r.type === "earn")
        .reduce((sum, r) => sum + r.points, 0);

      const totalPointsRedeemed = loyaltyRows
        .filter((r) => r.type === "redeem")
        .reduce((sum, r) => sum + r.points, 0);

      return {
        establishment: est,
        totalRevenue: totalRevenue.toFixed(2),
        totalTransactions,
        todayRevenue: todayRevenue.toFixed(2),
        todayTransactions: todayPaid.length,
        weekRevenue: weekRevenue.toFixed(2),
        weekTransactions: weekPaid.length,
        avgTransactionValue:
          totalTransactions > 0
            ? (totalRevenue / totalTransactions).toFixed(2)
            : "0.00",
        totalPointsIssued,
        totalPointsRedeemed,
      };
    }),

  /** Daily revenue for the last 30 days (for chart) */
  dailyRevenue: protectedProcedure
    .input(z.object({ establishmentId: z.number(), days: z.number().max(90).default(30) }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];

      const [est] = await db
        .select()
        .from(establishments)
        .where(eq(establishments.id, input.establishmentId))
        .limit(1);

      if (!est) throw new Error("Establishment not found");
      if (est.ownerId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new Error("Not authorized");
      }

      const since = new Date();
      since.setDate(since.getDate() - input.days);

      const rows = await db
        .select()
        .from(qrPaymentTokens)
        .where(
          and(
            eq(qrPaymentTokens.establishmentId, input.establishmentId),
            eq(qrPaymentTokens.status, "paid"),
            gte(qrPaymentTokens.paidAt, since)
          )
        )
        .orderBy(qrPaymentTokens.paidAt);

      // Group by date
      const byDate: Record<string, { date: string; revenue: number; count: number }> = {};
      for (const row of rows) {
        if (!row.paidAt) continue;
        const dateKey = row.paidAt.toISOString().slice(0, 10);
        if (!byDate[dateKey]) byDate[dateKey] = { date: dateKey, revenue: 0, count: 0 };
        byDate[dateKey].revenue += parseFloat(row.amountUsd ?? "0");
        byDate[dateKey].count += 1;
      }

      return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
    }),

  /** Recent transactions for the establishment */
  recentTransactions: protectedProcedure
    .input(
      z.object({
        establishmentId: z.number(),
        limit: z.number().max(50).default(20),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];

      const [est] = await db
        .select()
        .from(establishments)
        .where(eq(establishments.id, input.establishmentId))
        .limit(1);

      if (!est) throw new Error("Establishment not found");
      if (est.ownerId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new Error("Not authorized");
      }

      return db
        .select()
        .from(qrPaymentTokens)
        .where(
          and(
            eq(qrPaymentTokens.establishmentId, input.establishmentId),
            eq(qrPaymentTokens.status, "paid")
          )
        )
        .orderBy(desc(qrPaymentTokens.paidAt))
        .limit(input.limit);
    }),

  /** Get the merchant's KYB application status */
  kybStatus: protectedProcedure
    .input(z.object({ establishmentId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return null;

      const [app] = await db
        .select()
        .from(kybApplications)
        .where(
          and(
            eq(kybApplications.establishmentId, input.establishmentId),
            eq(kybApplications.submittedBy, ctx.user.id)
          )
        )
        .orderBy(desc(kybApplications.createdAt))
        .limit(1);

      return app ?? null;
    }),

  /** Export payout history as CSV for a given establishment */
  exportPayouts: protectedProcedure
    .input(
      z.object({
        establishmentId: z.number(),
        dateFrom: z.number().optional(),
        dateTo: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const [est] = await db
        .select()
        .from(establishments)
        .where(eq(establishments.id, input.establishmentId))
        .limit(1);
      if (!est) throw new Error("Establishment not found");
      if (est.ownerId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new Error("Not authorized");
      }

      const conditions: any[] = [
        eq(qrPaymentTokens.establishmentId, input.establishmentId),
        eq(qrPaymentTokens.status, "paid"),
      ];
      if (input.dateFrom) {
        conditions.push(gte(qrPaymentTokens.paidAt, new Date(input.dateFrom)));
      }

      const rows = await db
        .select()
        .from(qrPaymentTokens)
        .where(and(...conditions))
        .orderBy(desc(qrPaymentTokens.paidAt))
        .limit(5000);

      const filtered = input.dateTo
        ? rows.filter((r) => r.paidAt && r.paidAt.getTime() <= input.dateTo!)
        : rows;

      const header = ["Reference", "Amount (USD)", "Currency", "Status", "Paid At", "Token", "Description"].join(",");
      const csvRows = filtered.map((r) => [
        r.walletTxId ?? r.token,
        r.amountUsd ?? "",
        r.currency ?? "USD",
        r.status,
        r.paidAt ? r.paidAt.toISOString() : "",
        r.token,
        `"${(r.description ?? "").replace(/"/g, "'")}"`,
      ].join(","));

      const csv = [header, ...csvRows].join("\n");
      const filename = `payouts-est${input.establishmentId}-${new Date().toISOString().slice(0, 10)}.csv`;
      return { csv, filename, rowCount: filtered.length };
    }),

  /** Get all paid transactions for a specific date (for chart bar drill-down) */
  transactionsByDate: protectedProcedure
    .input(
      z.object({
        establishmentId: z.number(),
        date: z.string(), // ISO date string e.g. "2025-01-15"
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const [est] = await db
        .select()
        .from(establishments)
        .where(eq(establishments.id, input.establishmentId))
        .limit(1);
      if (!est) throw new Error("Establishment not found");
      if (est.ownerId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new Error("Not authorized");
      }
      const startOfDay = new Date(input.date + "T00:00:00.000Z");
      const endOfDay = new Date(input.date + "T23:59:59.999Z");
      const rows = await db
        .select()
        .from(qrPaymentTokens)
        .where(
          and(
            eq(qrPaymentTokens.establishmentId, input.establishmentId),
            eq(qrPaymentTokens.status, "paid")
          )
        )
        .orderBy(desc(qrPaymentTokens.paidAt));
      return rows.filter((r) => {
        if (!r.paidAt) return false;
        const t = r.paidAt.getTime();
        return t >= startOfDay.getTime() && t <= endOfDay.getTime();
      });
    }),

  /** Deal performance leaderboard for a merchant's establishment */
  getDealLeaderboard: protectedProcedure
    .input(
      z.object({
        establishmentId: z.number(),
        period: z.enum(["30", "90", "365"]).default("30"),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];

      const [est] = await db
        .select()
        .from(establishments)
        .where(eq(establishments.id, input.establishmentId))
        .limit(1);
      if (!est) throw new Error("Establishment not found");
      if (est.ownerId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new Error("Not authorized");
      }

      const since = new Date();
      since.setDate(since.getDate() - parseInt(input.period));

      // Fetch all active deals for this establishment
      const deals = await db
        .select()
        .from(touristDeals)
        .where(eq(touristDeals.establishmentId, input.establishmentId))
        .orderBy(desc(touristDeals.redemptionCount));

      if (deals.length === 0) return [];

      // Fetch redemptions in the period for these deals
      const dealIds = deals.map((d) => d.id);
      const redemptions = await db
        .select()
        .from(touristDealRedemptions)
        .where(
          and(
            eq(touristDealRedemptions.establishmentId, input.establishmentId),
            gte(touristDealRedemptions.redeemedAt, since)
          )
        );

      // Aggregate per deal
      const redemptionMap: Record<number, { count: number; revenue: number }> = {};
      for (const r of redemptions) {
        if (!redemptionMap[r.dealId]) redemptionMap[r.dealId] = { count: 0, revenue: 0 };
        redemptionMap[r.dealId].count += 1;
        // Estimate revenue saved = discountAmountUsd per redemption
        const deal = deals.find((d) => d.id === r.dealId);
        if (deal?.discountAmountUsd) {
          redemptionMap[r.dealId].revenue += parseFloat(deal.discountAmountUsd);
        }
      }

      const leaderboard = deals.map((deal) => {
        const stats = redemptionMap[deal.id] ?? { count: 0, revenue: 0 };
        const redemptionRate =
          deal.maxRedemptions && deal.maxRedemptions > 0
            ? Math.round((stats.count / deal.maxRedemptions) * 100)
            : null;
        return {
          id: deal.id,
          title: deal.title,
          category: deal.category,
          discountPercent: deal.discountPercent,
          discountAmountUsd: deal.discountAmountUsd,
          isActive: deal.isActive,
          validTo: deal.validTo,
          redemptionsInPeriod: stats.count,
          totalRedemptions: deal.redemptionCount,
          maxRedemptions: deal.maxRedemptions,
          redemptionRate,
          revenueAttributedUsd: stats.revenue.toFixed(2),
        };
      });

      // Sort by redemptions in period desc
      return leaderboard.sort((a, b) => b.redemptionsInPeriod - a.redemptionsInPeriod);
    }),

  /** List all establishments owned by the current user */
  myEstablishments: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    return db
      .select()
      .from(establishments)
      .where(eq(establishments.ownerId, ctx.user.id))
      .orderBy(desc(establishments.createdAt));
  }),

  /**
   * Boost a deal: increments visibilityScore by 10 and sets boostedUntil to 7 days from now.
   * Boosted deals are sorted first in the tourist discovery feed.
   */
  boostDeal: protectedProcedure
    .input(z.object({
      dealId: z.number().int().positive(),
      boostBudgetUsd: z.number().min(0).optional(), // optional spend cap for this boost campaign
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const [deal] = await db
        .select({ id: touristDeals.id, establishmentId: touristDeals.establishmentId, visibilityScore: touristDeals.visibilityScore })
        .from(touristDeals)
        .where(eq(touristDeals.id, input.dealId))
        .limit(1);
      if (!deal) throw new Error("Deal not found");

      const [est] = await db
        .select({ ownerId: establishments.ownerId })
        .from(establishments)
        .where(eq(establishments.id, deal.establishmentId))
        .limit(1);
      if (!est || est.ownerId !== ctx.user.id) throw new Error("Forbidden: not your deal");

      const boostedAt = new Date();
      const boostedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const newScore = (deal.visibilityScore ?? 0) + 10;

      await db
        .update(touristDeals)
        .set({
          visibilityScore: newScore,
          boostedAt,
          boostedUntil,
          // Reset spend tracking for new boost campaign
          boostSpentUsd: "0",
          ...(input.boostBudgetUsd !== undefined
            ? { boostBudgetUsd: input.boostBudgetUsd.toFixed(2) }
            : {}),
        })
        .where(eq(touristDeals.id, input.dealId));

      return { success: true, newVisibilityScore: newScore, boostedAt, boostedUntil, boostBudgetUsd: input.boostBudgetUsd ?? null };
    }),

  /**
   * Get Boost ROI: compare redemption rate before and after the most recent boost.
   * Returns preboost and postboost redemption counts and daily rates.
   */
  getBoostROI: protectedProcedure
    .input(z.object({ dealId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;

      const [deal] = await db
        .select({
          id: touristDeals.id,
          title: touristDeals.title,
          establishmentId: touristDeals.establishmentId,
          boostedAt: touristDeals.boostedAt,
          boostedUntil: touristDeals.boostedUntil,
          createdAt: touristDeals.createdAt,
          redemptionCount: touristDeals.redemptionCount,
          discountAmountUsd: touristDeals.discountAmountUsd,
        })
        .from(touristDeals)
        .where(eq(touristDeals.id, input.dealId))
        .limit(1);

      if (!deal) return null;

      // Verify ownership
      const [est] = await db
        .select({ ownerId: establishments.ownerId })
        .from(establishments)
        .where(eq(establishments.id, deal.establishmentId))
        .limit(1);
      if (!est || (est.ownerId !== ctx.user.id && ctx.user.role !== "admin")) {
        throw new Error("Forbidden");
      }

      if (!deal.boostedAt) {
        return {
          dealId: deal.id,
          title: deal.title,
          hasBoostData: false,
          message: "This deal has not been boosted yet.",
        };
      }

      const boostedAt = new Date(deal.boostedAt);
      const boostedUntil = deal.boostedUntil ? new Date(deal.boostedUntil) : new Date();
      const boostDurationMs = boostedUntil.getTime() - boostedAt.getTime();
      const boostDurationDays = Math.max(boostDurationMs / (1000 * 60 * 60 * 24), 1);

      // Pre-boost window: same duration before boostedAt
      const preBoostStart = new Date(boostedAt.getTime() - boostDurationMs);

      // Fetch all redemptions for this deal
      const allRedemptions = await db
        .select({ redeemedAt: touristDealRedemptions.redeemedAt })
        .from(touristDealRedemptions)
        .where(eq(touristDealRedemptions.dealId, input.dealId));

      const preBoostRedemptions = allRedemptions.filter((r) => {
        const t = r.redeemedAt.getTime();
        return t >= preBoostStart.getTime() && t < boostedAt.getTime();
      });

      const postBoostRedemptions = allRedemptions.filter((r) => {
        const t = r.redeemedAt.getTime();
        return t >= boostedAt.getTime() && t <= boostedUntil.getTime();
      });

      const preRate = preBoostRedemptions.length / boostDurationDays;
      const postRate = postBoostRedemptions.length / boostDurationDays;
      const liftPct = preRate > 0 ? Math.round(((postRate - preRate) / preRate) * 100) : null;

      // Revenue from boost = post-boost redemptions × discountAmountUsd (if set)
      const discountUsd = deal.discountAmountUsd ? parseFloat(deal.discountAmountUsd) : null;
      const revenueFromBoost = discountUsd !== null
        ? parseFloat((postBoostRedemptions.length * discountUsd).toFixed(2))
        : null;

      return {
        dealId: deal.id,
        title: deal.title,
        hasBoostData: true,
        boostedAt: deal.boostedAt,
        boostedUntil: deal.boostedUntil,
        boostDurationDays: Math.round(boostDurationDays),
        preBoostRedemptions: preBoostRedemptions.length,
        postBoostRedemptions: postBoostRedemptions.length,
        preBoostDailyRate: parseFloat(preRate.toFixed(2)),
        postBoostDailyRate: parseFloat(postRate.toFixed(2)),
        liftPercent: liftPct,
        revenueFromBoost,
      };
    }),

  /** Get a single deal's boost status */
  getDealBoostStatus: protectedProcedure
    .input(z.object({ dealId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;
      const [deal] = await db
        .select({
          id: touristDeals.id,
          title: touristDeals.title,
          visibilityScore: touristDeals.visibilityScore,
          boostedUntil: touristDeals.boostedUntil,
          isActive: touristDeals.isActive,
        })
        .from(touristDeals)
        .where(eq(touristDeals.id, input.dealId))
        .limit(1);
      if (!deal) return null;
      const isBoosted = deal.boostedUntil ? new Date(deal.boostedUntil) > new Date() : false;
      return { ...deal, isBoosted };
    }),

  /** Renew an expired deal for N more days, reactivating it */
  renewDeal: protectedProcedure
    .input(
      z.object({
        dealId: z.number().int().positive(),
        renewDays: z.number().int().min(1).max(365).default(30),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      // Verify the deal exists
      const [deal] = await db
        .select({ id: touristDeals.id, title: touristDeals.title, establishmentId: touristDeals.establishmentId })
        .from(touristDeals)
        .where(eq(touristDeals.id, input.dealId))
        .limit(1);
      if (!deal) throw new Error("Deal not found");
      // Verify the merchant owns this establishment
      const [est] = await db
        .select({ ownerId: establishments.ownerId })
        .from(establishments)
        .where(eq(establishments.id, deal.establishmentId))
        .limit(1);
      if (!est || est.ownerId !== ctx.user.id) throw new Error("Not authorised");
      const newValidTo = new Date(Date.now() + input.renewDays * 24 * 60 * 60 * 1000);
      await db
        .update(touristDeals)
        .set({ isActive: true, validTo: newValidTo })
        .where(eq(touristDeals.id, input.dealId));
      return { renewed: true, newValidTo, dealTitle: deal.title };
    }),

  /**
   * Type-specific KPIs for a merchant's establishment.
   * Returns metrics relevant to the establishment type:
   *  - hotel: occupancy rate, avg stay duration, room bookings
   *  - safari_lodge: game drive bookings, avg group size, wildlife sightings (from notes)
   *  - restaurant: covers per day, avg table turn, repeat diners
   *  - tour_operator: tours booked, avg group size, top destinations
   *  - beach_resort: water sports bookings, avg stay, beach access count
   *  - spa_wellness: treatments booked, avg treatment value, top treatments
   *  - airline: seat bookings, avg load factor, top routes
   *  - car_rental: vehicles rented, avg rental days, fleet utilisation
   *  - All others: bookings count, avg party size, avg booking value
   */
  typeKpis: protectedProcedure
    .input(z.object({ establishmentId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return null;

      const [est] = await db
        .select()
        .from(establishments)
        .where(eq(establishments.id, input.establishmentId))
        .limit(1);
      if (!est) throw new Error("Establishment not found");
      if (est.ownerId !== ctx.user.id && ctx.user.role !== "admin") throw new Error("Not authorized");

      // Fetch all bookings for this establishment
      const allBookings = await db
        .select()
        .from(touristBookings)
        .where(eq(touristBookings.establishmentId, input.establishmentId));

      const confirmedBookings = allBookings.filter((b) => b.status === "confirmed");
      const totalBookings = allBookings.length;
      const confirmedCount = confirmedBookings.length;
      const totalRevenue = confirmedBookings.reduce((s, b) => s + parseFloat(String(b.priceUsd ?? "0")), 0);
      const avgPartySize = confirmedCount > 0
        ? confirmedBookings.reduce((s, b) => s + (b.partySize ?? 1), 0) / confirmedCount
        : 0;
      const avgBookingValue = confirmedCount > 0 ? totalRevenue / confirmedCount : 0;

      // Fetch reviews for this establishment
      const reviews = await db
        .select()
        .from(touristReviews)
        .where(eq(touristReviews.establishmentId, input.establishmentId));
      const avgRating = reviews.length > 0
        ? reviews.reduce((s, r) => s + (r.rating ?? 0), 0) / reviews.length
        : null;

      // Last 30 days bookings
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const recentBookings = confirmedBookings.filter((b) => b.createdAt >= thirtyDaysAgo);
      const recentRevenue = recentBookings.reduce((s, b) => s + parseFloat(String(b.priceUsd ?? "0")), 0);

      // Service type breakdown
      const byServiceType: Record<string, number> = {};
      for (const b of confirmedBookings) {
        const st = b.serviceType ?? "other";
        byServiceType[st] = (byServiceType[st] ?? 0) + 1;
      }
      const topServiceTypes = Object.entries(byServiceType)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([type, count]) => ({ type, count }));

      // Base KPIs shared across all types
      const base = {
        establishmentType: est.type,
        totalBookings,
        confirmedBookings: confirmedCount,
        avgPartySize: parseFloat(avgPartySize.toFixed(1)),
        avgBookingValue: parseFloat(avgBookingValue.toFixed(2)),
        totalBookingRevenue: parseFloat(totalRevenue.toFixed(2)),
        recentBookings: recentBookings.length,
        recentRevenue: parseFloat(recentRevenue.toFixed(2)),
        avgRating: avgRating !== null ? parseFloat(avgRating.toFixed(1)) : null,
        reviewCount: reviews.length,
        topServiceTypes,
      };

      // Type-specific derived KPIs
      switch (est.type) {
        case "hotel": {
          // Occupancy rate: confirmed bookings / (30 days * assumed 10 rooms)
          const assumedRooms = 10;
          const occupancyRate = Math.min(100, Math.round((recentBookings.length / (30 * assumedRooms)) * 100));
          const roomBookings = confirmedBookings.filter((b) => ["hotel", "suite", "room_rate"].includes(b.serviceType ?? ""));
          return { ...base, kpiType: "hotel", occupancyRate, roomBookings: roomBookings.length, avgStayNights: avgPartySize };
        }
        case "safari_lodge": {
          const gameDriveBookings = confirmedBookings.filter((b) => ["safari_game_drive", "safari_lodge", "day_trip"].includes(b.serviceType ?? ""));
          const avgGroupSize = gameDriveBookings.length > 0
            ? gameDriveBookings.reduce((s, b) => s + (b.partySize ?? 1), 0) / gameDriveBookings.length
            : 0;
          return { ...base, kpiType: "safari_lodge", gameDriveBookings: gameDriveBookings.length, avgGroupSize: parseFloat(avgGroupSize.toFixed(1)) };
        }
        case "restaurant": {
          const coversPerDay = recentBookings.length > 0 ? parseFloat((recentBookings.reduce((s, b) => s + (b.partySize ?? 1), 0) / 30).toFixed(1)) : 0;
          return { ...base, kpiType: "restaurant", coversPerDay };
        }
        case "tour_operator": {
          const tourBookings = confirmedBookings.filter((b) => ["guided_tour", "day_trip", "cultural_experience"].includes(b.serviceType ?? ""));
          const avgTourGroupSize = tourBookings.length > 0
            ? tourBookings.reduce((s, b) => s + (b.partySize ?? 1), 0) / tourBookings.length
            : 0;
          return { ...base, kpiType: "tour_operator", tourBookings: tourBookings.length, avgTourGroupSize: parseFloat(avgTourGroupSize.toFixed(1)) };
        }
        case "beach_resort": {
          const waterSportsBookings = confirmedBookings.filter((b) => ["water_sports", "beach_access", "beach_resort"].includes(b.serviceType ?? ""));
          return { ...base, kpiType: "beach_resort", waterSportsBookings: waterSportsBookings.length };
        }
        case "spa_wellness": {
          const spaBookings = confirmedBookings.filter((b) => ["spa_treatment", "fitness"].includes(b.serviceType ?? ""));
          const avgTreatmentValue = spaBookings.length > 0
            ? spaBookings.reduce((s, b) => s + parseFloat(String(b.priceUsd ?? "0")), 0) / spaBookings.length
            : 0;
          return { ...base, kpiType: "spa_wellness", spaBookings: spaBookings.length, avgTreatmentValue: parseFloat(avgTreatmentValue.toFixed(2)) };
        }
        case "airline": {
          const flightBookings = confirmedBookings.filter((b) => ["flight", "airport_transfer"].includes(b.serviceType ?? ""));
          const totalSeats = flightBookings.reduce((s, b) => s + (b.partySize ?? 1), 0);
          const loadFactor = flightBookings.length > 0 ? Math.min(100, Math.round((totalSeats / (flightBookings.length * 150)) * 100)) : 0;
          return { ...base, kpiType: "airline", flightBookings: flightBookings.length, totalSeats, loadFactor };
        }
        case "car_rental": {
          const rentalBookings = confirmedBookings.filter((b) => ["car_rental", "bus_coach"].includes(b.serviceType ?? ""));
          return { ...base, kpiType: "car_rental", rentalBookings: rentalBookings.length };
        }
        case "museum": {
          const entryBookings = confirmedBookings.filter((b) => ["museum_entry", "cultural_experience"].includes(b.serviceType ?? ""));
          const totalVisitors = entryBookings.reduce((s, b) => s + (b.partySize ?? 1), 0);
          return { ...base, kpiType: "museum", entryBookings: entryBookings.length, totalVisitors };
        }
        case "theme_park": {
          const parkBookings = confirmedBookings.filter((b) => ["theme_park", "event_ticket"].includes(b.serviceType ?? ""));
          const totalVisitors = parkBookings.reduce((s, b) => s + (b.partySize ?? 1), 0);
          return { ...base, kpiType: "theme_park", parkBookings: parkBookings.length, totalVisitors };
        }
        case "concert_venue": {
          const eventBookings = confirmedBookings.filter((b) => ["event_ticket", "nightlife"].includes(b.serviceType ?? ""));
          const totalAttendees = eventBookings.reduce((s, b) => s + (b.partySize ?? 1), 0);
          return { ...base, kpiType: "concert_venue", eventBookings: eventBookings.length, totalAttendees };
        }
        case "sports_venue": {
          const sportsBookings = confirmedBookings.filter((b) => ["sports_event", "event_ticket"].includes(b.serviceType ?? ""));
          const totalAttendees = sportsBookings.reduce((s, b) => s + (b.partySize ?? 1), 0);
          return { ...base, kpiType: "sports_venue", sportsBookings: sportsBookings.length, totalAttendees };
        }
        default:
          return { ...base, kpiType: "generic" };
      }
    }),

  /**
   * kpiBenchmark — returns peer average KPIs for the same establishment type
   * in the same country, so the merchant can compare their performance.
   */
  kpiBenchmark: protectedProcedure
    .input(z.object({ establishmentId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return null;

      // Verify ownership
      const [est] = await db
        .select({ id: establishments.id, type: establishments.type, country: establishments.country })
        .from(establishments)
        .where(and(eq(establishments.id, input.establishmentId), eq(establishments.ownerId, ctx.user.id)))
        .limit(1);
      if (!est) return null;

      // Find all establishments of the same type in the same country (excluding this one)
      const peers = await db
        .select({ id: establishments.id })
        .from(establishments)
        .where(
          and(
            eq(establishments.type, est.type ?? "restaurant"),
            eq(establishments.country, est.country ?? "")
          )
        );
      const peerIds = peers.map((p) => p.id).filter((pid) => pid !== est.id);

      if (peerIds.length === 0) {
        return { peerCount: 0, benchmarks: {} };
      }

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      // Peer booking stats
      const peerBookingRows = await db
        .select({
          estId: touristBookings.establishmentId,
          status: touristBookings.status,
          partySize: touristBookings.partySize,
          priceUsd: touristBookings.priceUsd,
          serviceType: touristBookings.serviceType,
        })
        .from(touristBookings)
        .where(
          and(
            sql`${touristBookings.establishmentId} = ANY(ARRAY[${sql.raw(peerIds.join(","))}]::int[])`,
            gte(touristBookings.createdAt, thirtyDaysAgo)
          )
        );

      // Peer review stats
      const peerReviewRows = await db
        .select({
          estId: touristReviews.establishmentId,
          rating: touristReviews.rating,
          merchantResponse: touristReviews.merchantResponse,
        })
        .from(touristReviews)
        .where(
          sql`${touristReviews.establishmentId} = ANY(ARRAY[${sql.raw(peerIds.join(","))}]::int[])`
        );

      // Compute per-peer averages
      const peerBookingMap: Record<number, typeof peerBookingRows> = {};
      for (const b of peerBookingRows) {
        if (!b.estId) continue;
        if (!peerBookingMap[b.estId]) peerBookingMap[b.estId] = [];
        peerBookingMap[b.estId].push(b);
      }
      const peerReviewMap: Record<number, typeof peerReviewRows> = {};
      for (const r of peerReviewRows) {
        if (!r.estId) continue;
        if (!peerReviewMap[r.estId]) peerReviewMap[r.estId] = [];
        peerReviewMap[r.estId].push(r);
      }

      const peerStats = peerIds.map((pid) => {
        const bookings = peerBookingMap[pid] ?? [];
        const reviews = peerReviewMap[pid] ?? [];
        const confirmed = bookings.filter((b) => b.status === "confirmed" || b.status === "completed");
        const totalRevenue = confirmed.reduce((s, b) => s + (Number(b.priceUsd) || 0), 0);
        const avgRating = reviews.length > 0
          ? reviews.reduce((s, r) => s + (r.rating ?? 0), 0) / reviews.length
          : 0;
        const responseRate = reviews.length > 0
          ? (reviews.filter((r) => r.merchantResponse).length / reviews.length) * 100
          : 0;
        const totalGuests = confirmed.reduce((s, b) => s + (b.partySize ?? 1), 0);
        return { bookings: confirmed.length, revenue: totalRevenue, avgRating, responseRate, totalGuests };
      });

      const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

      const benchmarks = {
        avgBookings: Math.round(avg(peerStats.map((p) => p.bookings))),
        avgRevenue: Math.round(avg(peerStats.map((p) => p.revenue)) * 100) / 100,
        avgRating: Math.round(avg(peerStats.map((p) => p.avgRating)) * 10) / 10,
        avgResponseRate: Math.round(avg(peerStats.map((p) => p.responseRate))),
        avgGuests: Math.round(avg(peerStats.map((p) => p.totalGuests))),
      };

      return {
        peerCount: peerIds.length,
        country: est.country,
        establishmentType: est.type,
        benchmarks,
      };
    }),

  /**
   * peerLeaderboard — ranks all same-type establishments in the same country
   * by composite score: bookings 40% + avg_rating 30% + response_rate 30%.
   * Returns ranked list with the requesting merchant's own entry highlighted,
   * plus weekDelta (positive = improved rank, negative = dropped rank).
   */
  peerLeaderboard: protectedProcedure
    .input(z.object({ establishmentId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [est] = await db
        .select({ id: establishments.id, type: establishments.type, country: establishments.country, name: establishments.name, ownerId: establishments.ownerId })
        .from(establishments)
        .where(and(eq(establishments.id, input.establishmentId), eq(establishments.ownerId, ctx.user.id)))
        .limit(1);
      if (!est) throw new TRPCError({ code: "NOT_FOUND", message: "Establishment not found" });

      // All same-type peers in the same country
      const peers = await db
        .select({ id: establishments.id, name: establishments.name })
        .from(establishments)
        .where(and(eq(establishments.type, est.type), eq(establishments.country, est.country)));

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      // Fetch the two most recent weekly snapshots for all peers (for trend delta)
      const peerIds = peers.map((p) => p.id);
      let lastWeekRankMap: Record<number, number> = {};
      if (peerIds.length > 0) {
        try {
          // Get the two most recent distinct snapshot dates for these peers
          const recentDates = await db
            .selectDistinct({ snapshotDate: establishmentScoreSnapshots.snapshotDate })
            .from(establishmentScoreSnapshots)
            .where(inArray(establishmentScoreSnapshots.establishmentId, peerIds))
            .orderBy(desc(establishmentScoreSnapshots.snapshotDate))
            .limit(2);

          if (recentDates.length >= 2) {
            const prevDate = recentDates[1].snapshotDate;
            const prevSnapshots = await db
              .select({
                establishmentId: establishmentScoreSnapshots.establishmentId,
                compositeScore: establishmentScoreSnapshots.compositeScore,
              })
              .from(establishmentScoreSnapshots)
              .where(
                and(
                  inArray(establishmentScoreSnapshots.establishmentId, peerIds),
                  eq(establishmentScoreSnapshots.snapshotDate, prevDate)
                )
              );

            // Sort by compositeScore desc to determine last week's ranks
            prevSnapshots.sort((a, b) => b.compositeScore - a.compositeScore);
            prevSnapshots.forEach((s, i) => {
              lastWeekRankMap[s.establishmentId] = i + 1;
            });
          }
        } catch (err) {
          // Non-fatal: trend data unavailable
          console.warn("[peerLeaderboard] Could not fetch snapshot data for trends:", err);
        }
      }

      const ranked = await Promise.all(
        peers.map(async (peer) => {
          const [bStats] = await db
            .select({ cnt: count() })
            .from(touristBookings)
            .where(and(
              eq(touristBookings.establishmentId, peer.id),
              eq(touristBookings.status, "confirmed"),
              gte(touristBookings.createdAt, thirtyDaysAgo),
            ));
          const bookings = Number(bStats?.cnt ?? 0);

          const [rStats] = await db
            .select({ avgRating: avg(touristReviews.rating), total: count(), replied: count(touristReviews.merchantResponse) })
            .from(touristReviews)
            .where(eq(touristReviews.establishmentId, peer.id));
          const avgRatingVal = Number(rStats?.avgRating ?? 0);
          const totalReviews = Number(rStats?.total ?? 0);
          const repliedCount = Number(rStats?.replied ?? 0);
          const responseRate = totalReviews > 0 ? Math.round((repliedCount / totalReviews) * 100) : 0;

          // Composite: bookings (max 100 → 0-100) * 0.4 + rating (0-5 → 0-100) * 0.3 + responseRate * 0.3
          const bookingScore = Math.min(bookings, 100);
          const ratingScore = Math.round((avgRatingVal / 5) * 100);
          const compositeScore = Math.round(bookingScore * 0.4 + ratingScore * 0.3 + responseRate * 0.3);

          return {
            id: peer.id,
            name: peer.name,
            isOwn: peer.id === input.establishmentId,
            bookings,
            avgRating: Math.round(avgRatingVal * 10) / 10,
            responseRate,
            compositeScore,
          };
        })
      );

      ranked.sort((a, b) => b.compositeScore - a.compositeScore);
      const withRank = ranked.map((r, i) => {
        const currentRank = i + 1;
        const prevRank = lastWeekRankMap[r.id];
        // weekDelta: positive = rank improved (moved up), negative = rank dropped
        const weekDelta = prevRank != null ? prevRank - currentRank : null;
        return { ...r, rank: currentRank, weekDelta };
      });
      const ownRank = withRank.find((r) => r.isOwn)?.rank ?? null;

      return {
        leaderboard: withRank,
        ownRank,
        totalPeers: withRank.length,
        country: est.country,
        establishmentType: est.type,
      };
    }),

  /**
   * Onboarding Completion Score
   * Returns a structured checklist of onboarding milestones with pass/fail status
   * and an overall weighted percentage score.
   */
  onboardingScore: protectedProcedure
    .input(z.object({ establishmentId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;

      // Verify ownership
      const [est] = await db
        .select()
        .from(establishments)
        .where(
          and(
            eq(establishments.id, input.establishmentId),
            eq(establishments.ownerId, ctx.user.id)
          )
        )
        .limit(1);
      if (!est) throw new TRPCError({ code: "FORBIDDEN", message: "Establishment not found" });

      // 1. Establishment details complete
      const detailsComplete = !!(est.name && est.country && est.city && est.address && est.contactEmail);

      // 2. KYB documents uploaded (at least 1)
      const { kybDocuments, merchantProducts: mpTable } = await import("../../drizzle/schema");
      const docs = await db
        .select({ id: kybDocuments.id })
        .from(kybDocuments)
        .where(eq(kybDocuments.establishmentId, input.establishmentId))
        .limit(1);
      const docsUploaded = docs.length > 0;

      // 3. KYB application approved
      const kybApproved = est.kybStatus === "approved";

      // 4. At least one product listed
      const products = await db
        .select({ id: mpTable.id })
        .from(mpTable)
        .where(eq(mpTable.establishmentId, input.establishmentId))
        .limit(1);
      const hasProduct = products.length > 0;

      // 5. Stripe Connect active (payouts enabled)
      const stripeActive = est.stripePayoutsEnabled === true;

      // 6. First deal published
      const deals = await db
        .select({ id: touristDeals.id })
        .from(touristDeals)
        .where(
          and(
            eq(touristDeals.establishmentId, input.establishmentId),
            eq(touristDeals.isActive, true)
          )
        )
        .limit(1);
      const hasDeal = deals.length > 0;

      const steps = [
        {
          key: "details",
          label: "Establishment details complete",
          description: "Name, country, city, address, and contact email filled in",
          completed: detailsComplete,
          href: "/restaurant-onboarding",
          weight: 15,
        },
        {
          key: "docs",
          label: "KYB documents uploaded",
          description: "At least one compliance document uploaded",
          completed: docsUploaded,
          href: "/africa/kyb",
          weight: 20,
        },
        {
          key: "kyb_approved",
          label: "KYB application approved",
          description: "Compliance review completed and approved",
          completed: kybApproved,
          href: "/africa/kyb",
          weight: 25,
        },
        {
          key: "product",
          label: "First service/product listed",
          description: "At least one product added to your catalog",
          completed: hasProduct,
          href: "/merchant/products",
          weight: 15,
        },
        {
          key: "stripe",
          label: "Stripe Connect active",
          description: "Payout account connected and payouts enabled",
          completed: stripeActive,
          href: "/merchant/stripe-connect",
          weight: 15,
        },
        {
          key: "deal",
          label: "First deal published",
          description: "At least one active deal visible to tourists",
          completed: hasDeal,
          href: "/merchant/revenue",
          weight: 10,
        },
      ];

      const totalWeight = steps.reduce((s, st) => s + st.weight, 0);
      const earnedWeight = steps.filter((st) => st.completed).reduce((s, st) => s + st.weight, 0);
      const score = Math.round((earnedWeight / totalWeight) * 100);

      return {
        steps,
        score,
        completedCount: steps.filter((s) => s.completed).length,
        totalCount: steps.length,
      };
    }),
});
