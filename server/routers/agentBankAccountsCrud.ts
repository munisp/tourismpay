import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

export const agentBankAccountsRouter = router({
  list: protectedProcedure
    .input(z.object({ agentId: z.string().optional(), limit: z.number().default(20), offset: z.number().default(0) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };
      const rows = await db.execute(sql`
        SELECT id, agent_id, bank_name, account_number, account_name, is_primary, created_at
        FROM agent_bank_accounts
        WHERE (${input.agentId}::text IS NULL OR agent_id = ${input.agentId})
        ORDER BY created_at DESC LIMIT ${input.limit} OFFSET ${input.offset}
      `);
      const count = await db.execute(sql`SELECT COUNT(*) as total FROM agent_bank_accounts`);
      return { items: rows.rows, total: Number(count.rows[0]?.total ?? 0) };
    }),
  create: protectedProcedure
    .input(z.object({ agentId: z.string(), bankName: z.string(), accountNumber: z.string(), accountName: z.string(), isPrimary: z.boolean().default(false) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const rows = await db.execute(sql`
        INSERT INTO agent_bank_accounts (agent_id, bank_name, account_number, account_name, is_primary)
        VALUES (${input.agentId}, ${input.bankName}, ${input.accountNumber}, ${input.accountName}, ${input.isPrimary})
        RETURNING id, agent_id, bank_name, account_number, account_name, is_primary, created_at
      `);
      return rows.rows[0];
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.execute(sql`DELETE FROM agent_bank_accounts WHERE id = ${input.id}`);
      return { success: true };
    }),
});
