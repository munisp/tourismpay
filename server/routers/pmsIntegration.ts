import { z } from "zod";
import { merchantProcedure, adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";

export const pmsIntegrationRouter = router({
  // List PMS connections for a hotel
  listConnections: merchantProcedure
    .input(z.object({ hotelId: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db.execute(sql`SELECT id, hotel_id, provider, api_endpoint, property_id, status, last_sync_at, last_sync_error, sync_interval_minutes, created_at FROM pms_connections WHERE hotel_id = ${input.hotelId} ORDER BY created_at DESC`);
      return rows as any[];
    }),

  // Create/update PMS connection
  upsertConnection: merchantProcedure
    .input(z.object({
      hotelId: z.string(),
      provider: z.enum(["oracle_opera", "cloudbeds", "mews", "protel", "hotelogix", "custom"]),
      apiEndpoint: z.string().url(),
      apiKey: z.string().min(8),
      propertyId: z.string().optional(),
      syncIntervalMinutes: z.number().int().min(5).max(1440).default(15),
      webhookSecret: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const connId = `PMS-${input.hotelId}-${input.provider}`;
      // Hash the API key before storing (in production use bcrypt/argon2)
      const apiKeyHash = Buffer.from(input.apiKey).toString("base64").substring(0, 64);
      await db.execute(sql`
        INSERT INTO pms_connections (id, hotel_id, provider, api_endpoint, api_key_hash, property_id,
          status, sync_interval_minutes, webhook_secret, created_at, updated_at)
        VALUES (${connId}, ${input.hotelId}, ${input.provider}, ${input.apiEndpoint}, ${apiKeyHash},
          ${input.propertyId ?? null}, 'connected', ${input.syncIntervalMinutes},
          ${input.webhookSecret ?? null}, NOW(), NOW())
        ON CONFLICT (hotel_id, provider) DO UPDATE SET
          api_endpoint = EXCLUDED.api_endpoint, api_key_hash = EXCLUDED.api_key_hash,
          property_id = EXCLUDED.property_id, status = 'connected',
          sync_interval_minutes = EXCLUDED.sync_interval_minutes, updated_at = NOW()
      `);
      return { connectionId: connId, message: `${input.provider} PMS connected successfully` };
    }),

  // Disconnect PMS
  disconnect: merchantProcedure
    .input(z.object({ connectionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db.execute(sql`UPDATE pms_connections SET status = 'disconnected', updated_at = NOW() WHERE id = ${input.connectionId}`);
      return { success: true };
    }),

  // List folio charges for a hotel
  listFolioCharges: merchantProcedure
    .input(z.object({ hotelId: z.string(), settled: z.boolean().optional(), limit: z.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const settledFilter = input.settled !== undefined ? sql`AND fc.settled = ${input.settled}` : sql``;
      const rows = await db.execute(sql`
        SELECT fc.* FROM pms_folio_charges fc
        JOIN pms_connections pc ON pc.id = fc.connection_id
        WHERE pc.hotel_id = ${input.hotelId} ${settledFilter}
        ORDER BY fc.created_at DESC LIMIT ${input.limit}
      `);
      return rows as any[];
    }),

  // Settle a folio charge (link to wallet transaction)
  settleFolioCharge: merchantProcedure
    .input(z.object({ chargeId: z.string(), walletTransactionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db.execute(sql`
        UPDATE pms_folio_charges SET settled = true, settled_at = NOW(), wallet_transaction_id = ${input.walletTransactionId}
        WHERE id = ${input.chargeId} AND settled = false
      `);
      return { success: true, message: "Folio charge settled" };
    }),

  // Admin: connection health overview
  connectionHealth: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.execute(sql`
      SELECT provider, status, COUNT(*) as count,
        SUM(CASE WHEN last_sync_at > NOW() - INTERVAL '1 hour' THEN 1 ELSE 0 END) as recently_synced
      FROM pms_connections GROUP BY provider, status ORDER BY count DESC
    `);
    return rows as any[];
  }),
});
