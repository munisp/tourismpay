import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

export const agentPerformanceScoresRouter = router({
  list: protectedProcedure
    .input(z.object({ agentId: z.string().optional(), limit: z.number().default(20), offset: z.number().default(0) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };
      const rows = await db.execute(sql`
        SELECT id, agent_id, period, score, transactions_count, revenue_ngn, rank, created_at
        FROM agent_performance_scores
        WHERE (${input.agentId}::text IS NULL OR agent_id = ${input.agentId})
        ORDER BY created_at DESC LIMIT ${input.limit} OFFSET ${input.offset}
      `);
      const count = await db.execute(sql`SELECT COUNT(*) as total FROM agent_performance_scores`);
      return { items: rows.rows, total: Number(count.rows[0]?.total ?? 0) };
    }),
  getByAgent: protectedProcedure
    .input(z.object({ agentId: z.string(), period: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db.execute(sql`
        SELECT * FROM agent_performance_scores
        WHERE agent_id = ${input.agentId}
        ${input.period ? sql`AND period = ${input.period}` : sql``}
        ORDER BY created_at DESC LIMIT 1
      `);
      return rows.rows[0] ?? null;
    }),
  upsert: protectedProcedure
    .input(z.object({ agentId: z.string(), period: z.string(), score: z.number(), transactionsCount: z.number().default(0), revenueNgn: z.number().default(0) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const rows = await db.execute(sql`
        INSERT INTO agent_performance_scores (agent_id, period, score, transactions_count, revenue_ngn)
        VALUES (${input.agentId}, ${input.period}, ${input.score}, ${input.transactionsCount}, ${input.revenueNgn})
        ON CONFLICT (agent_id, period) DO UPDATE
        SET score = ${input.score}, transactions_count = ${input.transactionsCount},
            revenue_ngn = ${input.revenueNgn}, updated_at = NOW()
        RETURNING *
      `);
      return rows.rows[0];
    }),
});
