import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import crypto from "crypto";

export const whiteLabelRouter = router({
  createTenant: adminProcedure
    .input(z.object({
      name: z.string().min(2).max(100),
      slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/),
      country: z.string().length(2),
      primary_color: z.string().optional(),
      logo_url: z.string().url().optional(),
      contact_email: z.string().email().optional(),
      plan: z.enum(["starter", "professional", "enterprise"]).default("starter"),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = `WL-${Date.now()}`;
      const apiKey = `tp_wl_${crypto.randomBytes(24).toString("hex")}`;
      await db.execute(sql`
        INSERT INTO white_label_tenants (id, name, slug, country, primary_color, logo_url, contact_email, plan, api_key, status, created_at)
        VALUES (${tenantId}, ${input.name}, ${input.slug}, ${input.country},
          ${input.primary_color ?? "#1a56db"}, ${input.logo_url ?? null},
          ${input.contact_email ?? null}, ${input.plan}, ${apiKey}, 'active', NOW())
      `);
      return { tenantId, api_key: apiKey, message: `White-label tenant ${input.name} created for ${input.country}` };
    }),

  listTenants: adminProcedure
    .input(z.object({ status: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db.execute(sql`
        SELECT id, name, slug, country, primary_color, logo_url, contact_email, plan, status, created_at::text
        FROM white_label_tenants
        WHERE status = COALESCE(${input?.status ?? null}, status)
        ORDER BY created_at DESC LIMIT 50
      `);
      return (rows as any).rows ?? [];
    }),

  getTenant: adminProcedure
    .input(z.object({ tenantId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const rows = await db.execute(sql`
        SELECT id, name, slug, country, primary_color, logo_url, contact_email, plan, status, created_at::text
        FROM white_label_tenants WHERE id = ${input.tenantId}
      `);
      const row = (rows as any).rows?.[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found" });
      return row;
    }),

  rotateApiKey: adminProcedure
    .input(z.object({ tenantId: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const newKey = `tp_wl_${crypto.randomBytes(24).toString("hex")}`;
      await db.execute(sql`UPDATE white_label_tenants SET api_key = ${newKey} WHERE id = ${input.tenantId}`);
      return { api_key: newKey, message: "API key rotated successfully" };
    }),

  updateTenant: adminProcedure
    .input(z.object({
      tenantId: z.string(),
      name: z.string().optional(),
      primary_color: z.string().optional(),
      logo_url: z.string().url().optional(),
      plan: z.enum(["starter", "professional", "enterprise"]).optional(),
      status: z.enum(["active", "suspended", "cancelled"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const { tenantId, ...updates } = input;
      if (Object.keys(updates).length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "No fields to update" });
      await db.execute(sql`
        UPDATE white_label_tenants SET
          name = COALESCE(${updates.name ?? null}, name),
          primary_color = COALESCE(${updates.primary_color ?? null}, primary_color),
          logo_url = COALESCE(${updates.logo_url ?? null}, logo_url),
          plan = COALESCE(${updates.plan ?? null}, plan),
          status = COALESCE(${updates.status ?? null}, status)
        WHERE id = ${tenantId}
      `);
      return { success: true, message: "Tenant updated" };
    }),
});
