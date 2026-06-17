/**
 * GDS Platform — tRPC App Router
 * Standalone GDS server with its own auth, property management, reservations,
 * and agent management. Calls TourismPay API for tax, tipping, loyalty, remittance.
 */
import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import superjson from "superjson";
import type { Context } from "../middleware/context";
import { tourismPayClient } from "../services/tourismpayClient";

const t = initTRPC.context<Context>().create({ transformer: superjson });

const publicProcedure = t.procedure;
const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, user: ctx.user } });
});
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "gds_admin" && ctx.user.role !== "revenue_manager") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next();
});

// ─── GDS Internal Data (in production: PostgreSQL) ───────────────────────────

const PROPERTIES = [
  { id: "prop_1", name: "Hemingways Nairobi", type: "boutique", countryCode: "KE", city: "Nairobi", lat: -1.264, lng: 36.782, starRating: 5, totalRooms: 45, status: "active" as const },
  { id: "prop_2", name: "Angama Mara", type: "safari_camp", countryCode: "KE", city: "Maasai Mara", lat: -1.230, lng: 35.040, starRating: 5, totalRooms: 30, status: "active" as const },
  { id: "prop_3", name: "Giraffe Manor", type: "lodge", countryCode: "KE", city: "Nairobi", lat: -1.376, lng: 36.746, starRating: 5, totalRooms: 12, status: "active" as const },
  { id: "prop_4", name: "Eko Hotels & Suites", type: "hotel", countryCode: "NG", city: "Lagos", lat: 6.425, lng: 3.430, starRating: 5, totalRooms: 450, status: "active" as const },
  { id: "prop_5", name: "Zanzibar Serena", type: "resort", countryCode: "TZ", city: "Stone Town", lat: -6.159, lng: 39.192, starRating: 5, totalRooms: 51, status: "active" as const },
  { id: "prop_6", name: "Mount Nelson", type: "hotel", countryCode: "ZA", city: "Cape Town", lat: -33.935, lng: 18.408, starRating: 5, totalRooms: 198, status: "active" as const },
  { id: "prop_7", name: "Kempinski Gold Coast", type: "hotel", countryCode: "GH", city: "Accra", lat: 5.556, lng: -0.177, starRating: 5, totalRooms: 269, status: "active" as const },
  { id: "prop_8", name: "Singita Kwitonda", type: "lodge", countryCode: "RW", city: "Musanze", lat: -1.450, lng: 29.530, starRating: 5, totalRooms: 8, status: "active" as const },
  { id: "prop_9", name: "Mena House", type: "resort", countryCode: "EG", city: "Cairo", lat: 29.976, lng: 31.134, starRating: 5, totalRooms: 331, status: "active" as const },
  { id: "prop_10", name: "La Mamounia", type: "resort", countryCode: "MA", city: "Marrakech", lat: 31.621, lng: -7.999, starRating: 5, totalRooms: 209, status: "active" as const },
];

const AGENTS = [
  { id: "agent_1", name: "SafariLink Travel", email: "ops@safarilink.co.ke", agency: "SafariLink", countryCode: "KE", commissionRate: 12, totalBookings: 847, totalCommissionUSD: 42350, tier: "gold" as const, status: "active" as const },
  { id: "agent_2", name: "Wakanow", email: "bookings@wakanow.com", agency: "Wakanow", countryCode: "NG", commissionRate: 10, totalBookings: 1253, totalCommissionUSD: 87710, tier: "platinum" as const, status: "active" as const },
  { id: "agent_3", name: "Kibo Safaris", email: "info@kibosafaris.com", agency: "Kibo Safaris", countryCode: "TZ", commissionRate: 15, totalBookings: 312, totalCommissionUSD: 21840, tier: "silver" as const, status: "active" as const },
  { id: "agent_4", name: "Rhino Africa", email: "team@rhinoafrica.com", agency: "Rhino Africa", countryCode: "ZA", commissionRate: 11, totalBookings: 620, totalCommissionUSD: 49600, tier: "gold" as const, status: "active" as const },
];

// ─── Router ──────────────────────────────────────────────────────────────────

export const appRouter = t.router({
  // === Health ===
  health: publicProcedure.query(() => ({ status: "ok", service: "gds-platform", version: "1.0.0" })),

  // === Properties ===
  properties: t.router({
    list: protectedProcedure
      .input(z.object({ countryCode: z.string().optional(), type: z.string().optional() }).optional())
      .query(({ input }) => {
        let filtered = PROPERTIES;
        if (input?.countryCode) filtered = filtered.filter((p) => p.countryCode === input.countryCode);
        if (input?.type) filtered = filtered.filter((p) => p.type === input.type);
        return { properties: filtered, total: filtered.length };
      }),

    get: protectedProcedure
      .input(z.object({ id: z.string() }))
      .query(({ input }) => {
        const prop = PROPERTIES.find((p) => p.id === input.id);
        if (!prop) throw new TRPCError({ code: "NOT_FOUND" });
        return prop;
      }),
  }),

  // === Reservations ===
  reservations: t.router({
    create: protectedProcedure
      .input(z.object({
        propertyId: z.string(),
        roomTypeCode: z.string().default("standard"),
        checkIn: z.string(),
        checkOut: z.string(),
        guests: z.number().min(1),
        guestName: z.string(),
        guestEmail: z.string().email(),
        guestCountry: z.string().length(2),
      }))
      .mutation(async ({ input }) => {
        const property = PROPERTIES.find((p) => p.id === input.propertyId);
        if (!property) throw new TRPCError({ code: "NOT_FOUND", message: "Property not found" });

        const nights = Math.ceil(
          (new Date(input.checkOut).getTime() - new Date(input.checkIn).getTime()) / 86400000,
        );
        const baseAmount = 200 * nights; // In production: real rate lookup

        // Call TourismPay API for tax calculation
        let taxBreakdown;
        try {
          taxBreakdown = await tourismPayClient.tax.calculate(property.countryCode, baseAmount, "USD", "accommodation");
        } catch {
          // Fallback: estimate 15% tax if TourismPay is unreachable
          taxBreakdown = { totalTax: baseAmount * 0.15, grandTotal: baseAmount * 1.15, effectiveRate: 15 };
        }

        // Call TourismPay API for loyalty calculation
        let loyalty;
        try {
          loyalty = await tourismPayClient.loyalty.calculate(
            `res_${Date.now()}`, input.guestEmail, baseAmount, "bronze", property.type, "gds",
          );
        } catch {
          loyalty = { totalPoints: Math.round(baseAmount * 15 * 1.2), basePoints: baseAmount * 15, bonusPoints: Math.round(baseAmount * 15 * 0.2) };
        }

        return {
          reservation: {
            id: `res_${Date.now()}`,
            confirmationNo: `GDS${Date.now().toString(36).toUpperCase()}`,
            propertyId: input.propertyId,
            propertyName: property.name,
            guestName: input.guestName,
            checkIn: input.checkIn,
            checkOut: input.checkOut,
            nights,
            status: "confirmed",
            createdAt: new Date().toISOString(),
          },
          pricing: {
            baseAmount,
            tax: taxBreakdown,
            grandTotal: taxBreakdown.grandTotal,
            currency: "USD",
          },
          loyalty,
          tippingSuggestion: {
            propertyType: property.type,
            message: "Tip your staff after checkout via TourismPay",
          },
        };
      }),

    list: protectedProcedure
      .input(z.object({ propertyId: z.string().optional(), status: z.string().optional() }).optional())
      .query(() => ({ reservations: [], total: 0 })),
  }),

  // === Agents & Commissions ===
  agents: t.router({
    list: protectedProcedure.query(() => ({ agents: AGENTS, total: AGENTS.length })),

    get: protectedProcedure
      .input(z.object({ id: z.string() }))
      .query(({ input }) => {
        const agent = AGENTS.find((a) => a.id === input.id);
        if (!agent) throw new TRPCError({ code: "NOT_FOUND" });
        return agent;
      }),

    commissions: protectedProcedure
      .input(z.object({ agentId: z.string() }))
      .query(({ input }) => {
        const agent = AGENTS.find((a) => a.id === input.agentId);
        if (!agent) return { commissions: [], total: 0 };
        return {
          commissions: [
            { id: "comm_1", reservationId: "res_001", amountUSD: agent.commissionRate * 20, rate: agent.commissionRate, status: "paid" },
            { id: "comm_2", reservationId: "res_002", amountUSD: agent.commissionRate * 35, rate: agent.commissionRate, status: "pending" },
          ],
          total: 2,
        };
      }),
  }),

  // === TourismPay Tax Integration (via API) ===
  tax: t.router({
    calculate: protectedProcedure
      .input(z.object({
        countryCode: z.string().length(2),
        amount: z.number().positive(),
        currency: z.string().length(3).default("USD"),
        bookingType: z.string().default("accommodation"),
      }))
      .query(async ({ input }) => {
        return tourismPayClient.tax.calculate(input.countryCode, input.amount, input.currency, input.bookingType);
      }),

    jurisdictions: protectedProcedure.query(async () => {
      return tourismPayClient.tax.listJurisdictions();
    }),

    config: protectedProcedure
      .input(z.object({ countryCode: z.string().length(2) }))
      .query(async ({ input }) => {
        return tourismPayClient.tax.getConfig(input.countryCode);
      }),
  }),

  // === TourismPay Tipping Integration (via API) ===
  tipping: t.router({
    roles: protectedProcedure
      .input(z.object({ propertyType: z.string().default("hotel") }))
      .query(async ({ input }) => {
        return tourismPayClient.tipping.getRoles(input.propertyType);
      }),

    send: protectedProcedure
      .input(z.object({
        reservationId: z.string(),
        propertyId: z.string(),
        totalAmount: z.number().positive(),
        currency: z.string().length(3),
        recipients: z.array(z.object({
          staffRole: z.string(),
          staffName: z.string().optional(),
          amount: z.number().optional(),
          percentage: z.number().optional(),
        })).min(1).max(20),
        splitMode: z.enum(["equal", "custom_amount", "custom_percent"]).default("equal"),
        message: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return tourismPayClient.tipping.process({
          ...input,
          guestId: ctx.user.id,
        });
      }),
  }),

  // === TourismPay Loyalty Integration (via API) ===
  loyalty: t.router({
    calculate: protectedProcedure
      .input(z.object({
        bookingId: z.string(),
        amountUSD: z.number().positive(),
        propertyType: z.string().default("hotel"),
        bookingType: z.string().default("gds"),
      }))
      .query(async ({ input, ctx }) => {
        return tourismPayClient.loyalty.calculate(
          input.bookingId, ctx.user.id, input.amountUSD, "bronze", input.propertyType, input.bookingType,
        );
      }),

    config: protectedProcedure.query(async () => {
      return tourismPayClient.loyalty.getConfig();
    }),
  }),

  // === TourismPay Remittance (admin-only via API) ===
  remittance: t.router({
    summary: adminProcedure.query(async () => {
      return tourismPayClient.remittance.getSummary("");
    }),
  }),

  // === Trip Planner → GDS Booking Conversion (via API) ===
  tripPlanner: t.router({
    convert: protectedProcedure
      .input(z.object({
        itineraryId: z.string(),
        items: z.array(z.object({
          establishmentId: z.number(),
          propertyId: z.string().optional(),
          checkIn: z.string(),
          checkOut: z.string().optional(),
          guests: z.number().min(1).default(1),
          roomType: z.string().optional(),
        })),
        guestName: z.string(),
        guestEmail: z.string().email(),
        guestCountry: z.string().length(2),
      }))
      .mutation(async ({ input }) => {
        return tourismPayClient.tripPlanner.convert(input);
      }),
  }),

  // === GDS Dashboard Stats ===
  stats: protectedProcedure.query(() => ({
    totalProperties: PROPERTIES.length,
    totalReservations: 3247,
    totalRevenue: 2847000,
    occupancyRate: 72.3,
    activeAgents: AGENTS.length,
    countriesCovered: [...new Set(PROPERTIES.map((p) => p.countryCode))].length,
  })),

  // === Budget Comparison (calls Tax API for tax overlay) ===
  budgetCompare: protectedProcedure
    .input(z.object({
      countryCode: z.string().length(2),
      nights: z.number().min(1).max(30).default(3),
      guests: z.number().min(1).default(2),
    }))
    .query(async ({ input }) => {
      const tiers = [
        { tier: "budget", nightlyRate: 45, propertyTypes: ["guesthouse", "hostel"], amenities: ["WiFi", "Breakfast"] },
        { tier: "mid_range", nightlyRate: 150, propertyTypes: ["hotel", "boutique"], amenities: ["WiFi", "Breakfast", "Pool", "Restaurant"] },
        { tier: "luxury", nightlyRate: 450, propertyTypes: ["resort", "lodge", "safari_camp"], amenities: ["Full-service", "Spa", "Concierge", "Activities", "Restaurant", "Bar"] },
      ];

      const results = await Promise.all(
        tiers.map(async (t) => {
          const baseTotal = t.nightlyRate * input.nights * input.guests;
          let taxInfo;
          try {
            taxInfo = await tourismPayClient.tax.calculate(input.countryCode, baseTotal, "USD", "accommodation");
          } catch {
            taxInfo = { totalTax: baseTotal * 0.15, grandTotal: baseTotal * 1.15, effectiveRate: 15 };
          }

          const loyaltyPoints = Math.round(baseTotal * 15 * (t.tier === "luxury" ? 2.0 : t.tier === "mid_range" ? 1.2 : 1.0));

          return {
            ...t,
            baseTotal,
            tax: taxInfo.totalTax,
            grandTotal: taxInfo.grandTotal,
            effectiveRate: taxInfo.effectiveRate,
            loyaltyPoints,
          };
        }),
      );

      return { country: input.countryCode, nights: input.nights, guests: input.guests, tiers: results };
    }),
});

export type AppRouter = typeof appRouter;
