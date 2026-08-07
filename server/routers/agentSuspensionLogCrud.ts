import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

export const agentSuspensionLogRouter = router({
  list: protectedProcedure
    .input(z.object({ agentId: z.string().optional(), limit: z.number().default(20), offset: z.number().default(0) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };
      const rows = await db.execute(sql`
        SELECT id, agent_id, action, reason, suspended_by, suspended_at, reinstated_at
        FROM agent_suspension_logs
        WHERE (${input.agentId}::text IS NULL OR agent_id = ${input.agentId})
        ORDER BY suspended_at DESC LIMIT ${input.limit} OFFSET ${input.offset}
      `);
      const count = await db.execute(sql`SELECT COUNT(*) as total FROM agent_suspension_logs`);
      return { items: rows.rows, total: Number(count.rows[0]?.total ?? 0) };
    }),
  suspend: protectedProcedure
    .input(z.object({ agentId: z.string(), reason: z.string(), suspendedBy: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const rows = await db.execute(sql`
        INSERT INTO agent_suspension_logs (agent_id, action, reason, suspended_by, suspended_at)
        VALUES (${input.agentId}, 'suspended', ${input.reason}, ${input.suspendedBy}, NOW())
        RETURNING *
      `);
      await db.execute(sql`UPDATE agents SET status = 'suspended' WHERE id = ${input.agentId}`);
      return rows.rows[0];
    }),
  reinstate: protectedProcedure
    .input(z.object({ agentId: z.string(), reason: z.string(), reinstatedBy: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const rows = await db.execute(sql`
        INSERT INTO agent_suspension_logs (agent_id, action, reason, suspended_by, suspended_at, reinstated_at)
        VALUES (${input.agentId}, 'reinstated', ${input.reason}, ${input.reinstatedBy}, NOW(), NOW())
        RETURNING *
      `);
      await db.execute(sql`UPDATE agents SET status = 'active' WHERE id = ${input.agentId}`);
      return rows.rows[0];
    }),
});
