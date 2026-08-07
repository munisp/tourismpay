/**
 * AR Tourism Router
 * =================
 * Backend procedures for the TourismPay AR engine:
 *  - getNearbyEstablishments: GPS-based radius lookup for AR overlays
 *  - getHeritageContent: Cultural heritage AR content for a destination
 *  - recordARInteraction: Analytics for AR card taps and QR triggers
 *  - getARConfig: Per-region AR configuration (max radius, card limit, etc.)
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { db } from '../db';
import { establishments, walletTransactions } from "../../drizzle/schema";
import { and, sql, gte, lte, desc } from "drizzle-orm";

// ─── Haversine SQL expression ─────────────────────────────────────────────────
// Returns distance in metres between two GPS points using the Haversine formula
// expressed as a PostgreSQL expression.
function haversineSQL(lat: number, lng: number) {
  return sql<number>`
    (6371000 * acos(
      LEAST(1.0, cos(radians(${lat}))
      * cos(radians(CAST(establishments.latitude AS float)))
      * cos(radians(CAST(establishments.longitude AS float)) - radians(${lng}))
      + sin(radians(${lat}))
      * sin(radians(CAST(establishments.latitude AS float))))
    ))
  `;
}

export const arTourismRouter = router({
  // ── Nearby establishments for AR overlays ──────────────────────────────────
  getNearbyEstablishments: protectedProcedure
    .input(
      z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        radiusMeters: z.number().min(50).max(2000).default(500),
        limit: z.number().min(1).max(20).default(10),
        mode: z.enum(["location", "heritage", "all"]).default("all"),
      })
    )
    .query(async ({ input }) => {
      const { lat, lng, radiusMeters, limit, mode } = input;

      try {
        // Query establishments with GPS coordinates within radius
        const rows = await db
          .select({
            id: establishments.id,
            name: establishments.name,
            category: establishments.category,
            lat: establishments.latitude,
            lng: establishments.longitude,
            rating: establishments.rating,
            country: establishments.country,
            walletId: establishments.walletId,
            acceptsQRPay: establishments.acceptsQRPay,
            heritage: establishments.heritage,
            heritageDescription: establishments.heritageDescription,
            loyaltyMultiplier: establishments.loyaltyMultiplier,
            distanceM: haversineSQL(lat, lng),
          })
          .from(establishments)
          .where(
            and(
              // Bounding box pre-filter for performance (before Haversine)
              gte(sql`CAST(establishments.latitude AS float)`, lat - radiusMeters / 111320),
              lte(sql`CAST(establishments.latitude AS float)`, lat + radiusMeters / 111320),
              gte(sql`CAST(establishments.longitude AS float)`, lng - radiusMeters / (111320 * Math.cos((lat * Math.PI) / 180))),
              lte(sql`CAST(establishments.longitude AS float)`, lng + radiusMeters / (111320 * Math.cos((lat * Math.PI) / 180))),
              // Mode filter
              mode === "heritage"
                ? sql`establishments.heritage = true`
                : mode === "location"
                ? sql`establishments.heritage IS DISTINCT FROM true`
                : sql`1=1`
            )
          )
          .orderBy(haversineSQL(lat, lng))
          .limit(limit);

        // Post-filter: only return rows within exact radius
        const filtered = rows.filter((r) => Number(r.distanceM) <= radiusMeters);

        return {
          establishments: filtered.map((r) => ({
            id: r.id,
            name: r.name,
            category: r.category ?? "General",
            lat: Number(r.latitude ?? 0),
            lng: Number(r.longitude ?? 0),
            distanceM: Math.round(Number(r.distanceM)),
            rating: r.rating ? Number(r.rating) : undefined,
            country: r.country ?? "",
            walletId: r.walletId ?? undefined,
            acceptsQRPay: Boolean(r.acceptsQRPay),
            heritage: Boolean(r.heritage),
            heritageDescription: r.heritageDescription ?? undefined,
            loyaltyMultiplier: r.loyaltyMultiplier ? Number(r.loyaltyMultiplier) : 1,
          })),
          userLat: lat,
          userLng: lng,
          radiusMeters,
          timestamp: new Date().toISOString(),
        };
      } catch (err) {
        // Fallback: return empty list if DB schema doesn't have lat/lng columns yet
        console.error("AR getNearbyEstablishments error:", err);
        return {
          establishments: [],
          userLat: lat,
          userLng: lng,
          radiusMeters,
          timestamp: new Date().toISOString(),
          _fallback: true,
        };
      }
    }),

  // ── Heritage content for a specific establishment ──────────────────────────
  getHeritageContent: protectedProcedure
    .input(z.object({ establishmentId: z.number() }))
    .query(async ({ input }) => {
      try {
        const [est] = await db
          .select({
            id: establishments.id,
            name: establishments.name,
            heritageDescription: establishments.heritageDescription,
            country: establishments.country,
            category: establishments.category,
          })
          .from(establishments)
          .where(sql`establishments.id = ${input.establishmentId}`)
          .limit(1);

        if (!est) return null;

        return {
          id: est.id,
          name: est.name,
          description: est.heritageDescription ?? "A significant cultural and tourism landmark.",
          country: est.country,
          category: est.category,
          // AR overlay content
          arContent: {
            title: est.name,
            subtitle: `${est.category} · ${est.country}`,
            description: est.heritageDescription ?? "",
            facts: [
              `Located in ${est.country}`,
              `Category: ${est.category}`,
              "TourismPay verified establishment",
            ],
            accentColor: "#7c3aed",
          },
        };
      } catch {
        return null;
      }
    }),

  // ── Record AR interaction for analytics ───────────────────────────────────
  recordARInteraction: protectedProcedure
    .input(
      z.object({
        establishmentId: z.number(),
        interactionType: z.enum(["card_view", "card_tap", "qr_trigger", "heritage_view"]),
        lat: z.number().optional(),
        lng: z.number().optional(),
        mode: z.enum(["location", "marker", "heritage"]).default("location"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Log AR interaction (non-blocking — analytics only)
      try {
        // We use walletTransactions metadata or a simple log — no dedicated AR analytics table needed
        console.log("[AR Analytics]", {
          userId: ctx.session?.userId,
          ...input,
          timestamp: new Date().toISOString(),
        });
      } catch {
        // Silent — analytics should never block the AR experience
      }
      return { recorded: true };
    }),

  // ── AR configuration per region ────────────────────────────────────────────
  getARConfig: protectedProcedure
    .input(z.object({ country: z.string().optional() }))
    .query(async ({ input }) => {
      // Per-region AR configuration
      const configs: Record<string, object> = {
        NG: { maxRadiusMeters: 500, maxCards: 8, enableHeritage: true, enableQRPay: true },
        KE: { maxRadiusMeters: 400, maxCards: 6, enableHeritage: true, enableQRPay: true },
        GH: { maxRadiusMeters: 400, maxCards: 6, enableHeritage: true, enableQRPay: true },
        ZA: { maxRadiusMeters: 600, maxCards: 10, enableHeritage: true, enableQRPay: true },
        EG: { maxRadiusMeters: 500, maxCards: 8, enableHeritage: true, enableQRPay: false },
      };

      return {
        ...(configs[input.country ?? ""] ?? {
          maxRadiusMeters: 500,
          maxCards: 8,
          enableHeritage: true,
          enableQRPay: true,
        }),
        webxrSupported: true,
        fallback2DEnabled: true,
        cardFloatAmplitude: 0.05,
        cardBillboard: true,
        version: "1.0.0",
      };
    }),

  // ── Get AR-enabled establishments count for a country ─────────────────────
  getARStats: protectedProcedure
    .input(z.object({ country: z.string().optional() }))
    .query(async ({ input }) => {
      try {
        const [stats] = await db
          .select({
            total: sql<number>`COUNT(*)`,
            withQRPay: sql<number>`SUM(CASE WHEN establishments.accepts_qr_pay = true THEN 1 ELSE 0 END)`,
            heritage: sql<number>`SUM(CASE WHEN establishments.heritage = true THEN 1 ELSE 0 END)`,
          })
          .from(establishments)
          .where(
            input.country
              ? sql`establishments.country = ${input.country}`
              : sql`1=1`
          );

        return {
          total: Number(stats?.total ?? 0),
          withQRPay: Number(stats?.withQRPay ?? 0),
          heritage: Number(stats?.heritage ?? 0),
          arEnabled: Number(stats?.total ?? 0),
        };
      } catch {
        return { total: 0, withQRPay: 0, heritage: 0, arEnabled: 0 };
      }
    }),
});
