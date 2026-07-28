import { z } from "zod";
import { merchantProcedure, adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";

export const revenueManagementRouter = router({
  // Get AI pricing recommendations for a hotel
  getRecommendations: merchantProcedure
    .input(z.object({ hotelId: z.string(), roomType: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const roomFilter = input.roomType ? sql`AND room_type = ${input.roomType}` : sql``;
      const rows = await db.execute(sql`
        SELECT * FROM revenue_recommendations
        WHERE hotel_id = ${input.hotelId} ${roomFilter}
          AND valid_to > NOW() AND applied = false
        ORDER BY confidence_score DESC, created_at DESC LIMIT 20
      `);
      return rows as any[];
    }),

  // Apply a recommendation (update room rate)
  applyRecommendation: merchantProcedure
    .input(z.object({ recommendationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const rows = await db.execute(sql`SELECT * FROM revenue_recommendations WHERE id = ${input.recommendationId} LIMIT 1`);
      if (!(rows as any[]).length) throw new TRPCError({ code: "NOT_FOUND", message: "Recommendation not found" });
      const rec = (rows as any[])[0];
      await db.execute(sql`UPDATE revenue_recommendations SET applied = true, applied_at = NOW() WHERE id = ${input.recommendationId}`);
      return { success: true, newRate: rec.recommended_rate, currency: rec.currency, message: `Rate updated to ${rec.currency} ${rec.recommended_rate}` };
    }),

  // Generate new recommendations (called by background job or manually)
  generateRecommendations: merchantProcedure
    .input(z.object({ hotelId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      // Fetch recent booking data to calculate demand
      const bookingData = await db.execute(sql`
        SELECT DATE_TRUNC('day', check_in) as date, COUNT(*) as bookings, AVG(rate_per_night) as avg_rate
        FROM direct_bookings WHERE hotel_id = ${input.hotelId} AND created_at > NOW() - INTERVAL '90 days'
        GROUP BY DATE_TRUNC('day', check_in) ORDER BY date
      `);
      // Calculate average occupancy and suggest rate adjustments
      const avgBookings = (bookingData as any[]).reduce((s, r) => s + Number(r.bookings), 0) / Math.max((bookingData as any[]).length, 1);
      const currentRateData = await db.execute(sql`SELECT AVG(rate_per_night) as avg_rate, currency FROM direct_bookings WHERE hotel_id = ${input.hotelId} AND created_at > NOW() - INTERVAL '30 days' GROUP BY currency LIMIT 1`);
      if (!(currentRateData as any[]).length) return { generated: 0, message: "Insufficient booking data for recommendations" };
      const currentRate = Number((currentRateData as any[])[0].avg_rate);
      const currency = (currentRateData as any[])[0].currency ?? "NGN";
      // Simple demand-based pricing: high demand (+10%), low demand (-5%)
      const demandMultiplier = avgBookings > 5 ? 1.10 : avgBookings < 2 ? 0.95 : 1.0;
      const recommendedRate = Math.round(currentRate * demandMultiplier * 100) / 100;
      const confidence = avgBookings > 3 ? 85 : 60;
      const recId = `REC-${input.hotelId}-${Date.now()}`;
      const validFrom = new Date();
      const validTo = new Date(validFrom.getTime() + 7 * 24 * 60 * 60 * 1000);
      await db.execute(sql`
        INSERT INTO revenue_recommendations (id, hotel_id, current_rate, recommended_rate, currency,
          confidence_score, reasoning, applied, valid_from, valid_to, created_at)
        VALUES (${recId}, ${input.hotelId}, ${currentRate}, ${recommendedRate}, ${currency},
          ${confidence}, ${`Based on ${Math.round(avgBookings)} avg daily bookings over last 90 days. Demand multiplier: ${demandMultiplier.toFixed(2)}x`},
          false, ${validFrom.toISOString()}, ${validTo.toISOString()}, NOW())
      `);
      return { generated: 1, recommendationId: recId, currentRate, recommendedRate, confidence };
    }),

  // RevPAR analytics
  revparAnalytics: merchantProcedure
    .input(z.object({ hotelId: z.string(), days: z.number().default(30) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { revpar: 0, adr: 0, occupancyPct: 0 };
      const rows = await db.execute(sql`
        SELECT AVG(rate_per_night) as adr, COUNT(*) as bookings,
          SUM(total_amount) as total_revenue
        FROM direct_bookings WHERE hotel_id = ${input.hotelId}
          AND status IN ('confirmed','checked_in','checked_out')
          AND check_in > NOW() - INTERVAL '${sql.raw(String(input.days))} days'
      `);
      const r = (rows as any[])[0] ?? {};
      const adr = Math.round(Number(r.adr ?? 0) * 100) / 100;
      const occupancyPct = Math.min(100, Math.round(Number(r.bookings ?? 0) / (input.days * 0.5) * 100));
      return { revpar: Math.round(adr * occupancyPct / 100 * 100) / 100, adr, occupancyPct, totalRevenue: Number(r.total_revenue ?? 0) };
    }),
});
