import { z } from "zod";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";

const EARTH_RADIUS_M = 6371000;

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export const geospatialAnalyticsRouter = router({
  // Find establishments near a GPS coordinate
  nearbyEstablishments: protectedProcedure
    .input(z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      radiusMetres: z.number().int().min(100).max(50000).default(2000),
      type: z.string().optional(),
      limit: z.number().int().max(50).default(20),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const typeFilter = input.type ? sql`AND type = ${input.type}` : sql``;
      // Bounding box pre-filter for performance
      const latDelta = input.radiusMetres / EARTH_RADIUS_M * (180 / Math.PI);
      const lngDelta = latDelta / Math.cos(input.lat * Math.PI / 180);
      const rows = await db.execute(sql`
        SELECT id, name, type, city, country, latitude, longitude, rating, category,
          accepts_qr_pay, heritage, loyalty_multiplier, kyb_status
        FROM establishments
        WHERE latitude BETWEEN ${input.lat - latDelta} AND ${input.lat + latDelta}
          AND longitude BETWEEN ${input.lng - lngDelta} AND ${input.lng + lngDelta}
          AND kyb_status = 'approved' ${typeFilter}
        LIMIT ${input.limit * 3}
      `);
      // Apply exact Haversine distance filter and sort
      const withDistance = (rows as any[])
        .map(r => ({ ...r, distanceMetres: Math.round(haversineDistance(input.lat, input.lng, Number(r.latitude), Number(r.longitude))) }))
        .filter(r => r.distanceMetres <= input.radiusMetres)
        .sort((a, b) => a.distanceMetres - b.distanceMetres)
        .slice(0, input.limit);
      return withDistance;
    }),

  // Get loyalty zones near a coordinate
  nearbyLoyaltyZones: protectedProcedure
    .input(z.object({ lat: z.number(), lng: z.number(), radiusMetres: z.number().default(5000) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db.execute(sql`SELECT * FROM geospatial_loyalty_zones WHERE active = true`);
      return (rows as any[])
        .map(z => ({ ...z, distanceMetres: Math.round(haversineDistance(input.lat, input.lng, Number(z.center_lat), Number(z.center_lng))) }))
        .filter(z => z.distanceMetres <= input.radiusMetres + Number(z.radius_metres))
        .sort((a, b) => a.distanceMetres - b.distanceMetres);
    }),

  // Check if a coordinate is inside a loyalty zone
  checkLoyaltyZone: protectedProcedure
    .input(z.object({ lat: z.number(), lng: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { inZone: false, multiplier: 1.0 };
      const rows = await db.execute(sql`SELECT * FROM geospatial_loyalty_zones WHERE active = true`);
      for (const zone of rows as any[]) {
        const dist = haversineDistance(input.lat, input.lng, Number(zone.center_lat), Number(zone.center_lng));
        if (dist <= Number(zone.radius_metres)) {
          return { inZone: true, zoneName: zone.name, multiplier: Number(zone.loyalty_multiplier), distanceMetres: Math.round(dist) };
        }
      }
      return { inZone: false, multiplier: 1.0 };
    }),

  // Admin: manage loyalty zones
  createLoyaltyZone: adminProcedure
    .input(z.object({
      name: z.string().min(2),
      city: z.string(),
      country: z.string().default("NGA"),
      centerLat: z.number(),
      centerLng: z.number(),
      radiusMetres: z.number().int().min(100).max(50000),
      loyaltyMultiplier: z.number().min(1.0).max(5.0),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const zoneId = `ZONE-${Date.now()}`;
      await db.execute(sql`
        INSERT INTO geospatial_loyalty_zones (id, name, city, country, center_lat, center_lng, radius_metres, loyalty_multiplier, active, created_at)
        VALUES (${zoneId}, ${input.name}, ${input.city}, ${input.country}, ${input.centerLat}, ${input.centerLng}, ${input.radiusMetres}, ${input.loyaltyMultiplier}, true, NOW())
      `);
      return { zoneId, message: `Loyalty zone "${input.name}" created` };
    }),

  // Admin: list all loyalty zones
  listLoyaltyZones: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.execute(sql`SELECT * FROM geospatial_loyalty_zones ORDER BY created_at DESC`);
    return rows as any[];
  }),

  // Tourism density heatmap data
  densityHeatmap: adminProcedure
    .input(z.object({ city: z.string().optional(), days: z.number().default(30) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const cityFilter = input.city ? sql`AND e.city = ${input.city}` : sql``;
      const rows = await db.execute(sql`
        SELECT e.latitude, e.longitude, e.name, e.type, e.city,
          COUNT(wt.id) as transaction_count, SUM(wt.amount) as total_spend
        FROM establishments e
        LEFT JOIN wallet_transactions wt ON wt.establishment_id = e.id::text
          AND wt.created_at > NOW() - INTERVAL '${sql.raw(String(input.days))} days'
        WHERE e.latitude IS NOT NULL AND e.longitude IS NOT NULL ${cityFilter}
        GROUP BY e.id, e.latitude, e.longitude, e.name, e.type, e.city
        HAVING COUNT(wt.id) > 0
        ORDER BY transaction_count DESC LIMIT 200
      `);
      return rows as any[];
    }),
});
