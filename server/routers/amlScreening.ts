/**
 * amlScreening.ts — Anti-Money Laundering screening router
 * Provides CRUD for AML screening records and risk assessments.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";

export const amlScreeningRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().default(20),
        offset: z.number().default(0),
        status: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      try {
        const db = await getDb();
        if (!db) return { items: [], total: 0 };
        const sql = require("drizzle-orm").sql;
        const statusFilter = input.status ? sql`WHERE status = ${input.status}` : sql``;
        const items = await db.execute(sql`
          SELECT id, entity_name, entity_type, risk_score, status, screened_at, country
          FROM aml_screenings
          ${statusFilter}
          ORDER BY screened_at DESC
          LIMIT ${input.limit} OFFSET ${input.offset}
        `);
        const countRow = await db.execute(sql`SELECT COUNT(*) as total FROM aml_screenings ${statusFilter}`);
        return { items: items.rows, total: Number(countRow.rows[0]?.total ?? 0) };
      } catch (e) {
        console.error("amlScreening.list error:", e);
        return { items: [], total: 0 };
      }
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      try {
        const db = await getDb();
        if (!db) return null;
        const sql = require("drizzle-orm").sql;
        const rows = await db.execute(sql`
          SELECT * FROM aml_screenings WHERE id = ${input.id} LIMIT 1
        `);
        return rows.rows[0] ?? null;
      } catch { return null; }
    }),

  screen: protectedProcedure
    .input(
      z.object({
        entityName: z.string(),
        entityType: z.enum(["individual", "organization"]),
        country: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const sql = require("drizzle-orm").sql;
      // Compute risk score based on country and entity type
      const highRiskCountries = ["NG","KE","GH","ZA","EG","LY","SD","ZW","IR","KP","SY","CU"];
      let riskScore = 0;
      if (input.country && highRiskCountries.includes(input.country.toUpperCase())) riskScore += 30;
      if (input.entityType === "organization") riskScore += 10;
      const status = riskScore >= 60 ? "high_risk" : riskScore >= 30 ? "medium_risk" : "clear";
      const rows = await db.execute(sql`
        INSERT INTO aml_screenings (entity_name, entity_type, country, risk_score, status, screened_at)
        VALUES (${input.entityName}, ${input.entityType}, ${input.country ?? null}, ${riskScore}, ${status}, NOW())
        RETURNING id, entity_name, entity_type, risk_score, status, screened_at
      `);
      return rows.rows[0];
    }),
});
