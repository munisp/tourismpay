/**
 * BIS Investigation Router
 * Bank for International Settlements-style investigation workflows
 */
import { z } from "zod";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

export const bisInvestigationRouter = router({
  list: adminProcedure
    .input(z.object({
      status: z.string().optional(),
      riskLevel: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(50),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.execute(sql`
        SELECT bi.*, u.email as subject_email
        FROM bis_investigations bi
        LEFT JOIN users u ON u.id::text = bi.subject_id
        WHERE (${input.status ?? null} IS NULL OR bi.status = ${input.status ?? null})
          AND (${input.riskLevel ?? null} IS NULL OR bi.risk_level = ${input.riskLevel ?? null})
        ORDER BY bi.created_at DESC
        LIMIT ${input.limit} OFFSET ${input.offset}
      `);
      const total = await db.execute(sql`SELECT COUNT(*) as count FROM bis_investigations`);
      return { investigations: rows as any[], total: parseInt((total as any[])[0]?.count ?? "0") };
    }),

  get: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.execute(sql`
        SELECT bi.*, u.email as subject_email, u.full_name as subject_name
        FROM bis_investigations bi
        LEFT JOIN users u ON u.id::text = bi.subject_id
        WHERE bi.id = ${input.id} LIMIT 1
      `);
      return (rows as any[])[0] ?? null;
    }),

  create: adminProcedure
    .input(z.object({
      subjectId: z.string(),
      subjectType: z.enum(["user", "merchant", "agent"]),
      investigationType: z.enum(["aml", "fraud", "compliance", "sanctions", "pep"]),
      riskLevel: z.enum(["low", "medium", "high", "critical"]).default("medium"),
      description: z.string().min(10).max(2000),
      triggeredBy: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const id = crypto.randomUUID();
      const now = Math.floor(Date.now() / 1000);
      await db.execute(sql`
        INSERT INTO bis_investigations (id, subject_id, subject_type, investigation_type, risk_level, description, status, assigned_to, created_at, updated_at)
        VALUES (${id}, ${input.subjectId}, ${input.subjectType}, ${input.investigationType}, ${input.riskLevel}, ${input.description}, 'open', ${String(ctx.user.id)}, ${now}, ${now})
      `);
      await db.execute(sql`
        INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata, created_at)
        VALUES (${crypto.randomUUID()}, ${String(ctx.user.id)}, 'bis.investigation.created', 'bis_investigation', ${id}, ${JSON.stringify({ investigationType: input.investigationType, riskLevel: input.riskLevel })}, ${now})
      `);
      return { id, status: "open" };
    }),

  updateStatus: adminProcedure
    .input(z.object({
      id: z.string(),
      status: z.enum(["open", "in_progress", "escalated", "resolved", "closed"]),
      notes: z.string().optional(),
      resolution: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const now = Math.floor(Date.now() / 1000);
      await db.execute(sql`
        UPDATE bis_investigations
        SET status = ${input.status}, notes = COALESCE(${input.notes ?? null}, notes),
            resolution = COALESCE(${input.resolution ?? null}, resolution), updated_at = ${now}
        WHERE id = ${input.id}
      `);
      await db.execute(sql`
        INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata, created_at)
        VALUES (${crypto.randomUUID()}, ${String(ctx.user.id)}, 'bis.investigation.status_updated', 'bis_investigation', ${input.id}, ${JSON.stringify({ status: input.status })}, ${now})
      `);
      return { id: input.id, status: input.status };
    }),

  addEvidence: adminProcedure
    .input(z.object({
      investigationId: z.string(),
      evidenceType: z.string(),
      description: z.string(),
      fileUrl: z.string().url().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const id = crypto.randomUUID();
      const now = Math.floor(Date.now() / 1000);
      await db.execute(sql`
        INSERT INTO bis_evidence (id, investigation_id, evidence_type, description, file_url, submitted_by, created_at)
        VALUES (${id}, ${input.investigationId}, ${input.evidenceType}, ${input.description}, ${input.fileUrl ?? null}, ${String(ctx.user.id)}, ${now})
        ON CONFLICT DO NOTHING
      `);
      return { id };
    }),

  getStats: adminProcedure.query(async () => {
    const db = getDb();
    const rows = await db.execute(sql`
      SELECT status, risk_level, investigation_type, COUNT(*) as count
      FROM bis_investigations
      GROUP BY status, risk_level, investigation_type
      ORDER BY count DESC
    `);
    const total = await db.execute(sql`SELECT COUNT(*) as total FROM bis_investigations`);
    const open = await db.execute(sql`SELECT COUNT(*) as open FROM bis_investigations WHERE status IN ('open', 'in_progress', 'escalated')`);
    return {
      breakdown: rows as any[],
      totalInvestigations: parseInt((total as any[])[0]?.total ?? "0"),
      openInvestigations: parseInt((open as any[])[0]?.open ?? "0"),
    };
  }),

  autoFlag: adminProcedure
    .input(z.object({
      subjectId: z.string(),
      subjectType: z.enum(["user", "merchant", "agent"]),
      reason: z.string(),
      riskScore: z.number().min(0).max(100),
    }))
    .mutation(async ({ input, ctx }) => {
      const riskLevel = input.riskScore >= 80 ? "critical" : input.riskScore >= 60 ? "high" : input.riskScore >= 40 ? "medium" : "low";
      const db = getDb();
      const id = crypto.randomUUID();
      const now = Math.floor(Date.now() / 1000);
      await db.execute(sql`
        INSERT INTO bis_investigations (id, subject_id, subject_type, investigation_type, risk_level, description, status, created_at, updated_at)
        VALUES (${id}, ${input.subjectId}, ${input.subjectType}, 'aml', ${riskLevel}, ${input.reason}, 'open', ${now}, ${now})
        ON CONFLICT DO NOTHING
      `);
      return { id, riskLevel, autoFlagged: true };
    }),
});
