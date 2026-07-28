import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";

export const lakehouseEtlRouter = router({
  // List ETL job runs
  listRuns: adminProcedure
    .input(z.object({ jobName: z.string().optional(), limit: z.number().default(50) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const jobFilter = input.jobName ? sql`WHERE job_name = ${input.jobName}` : sql``;
      const rows = await db.execute(sql`SELECT * FROM lakehouse_etl_runs ${jobFilter} ORDER BY started_at DESC LIMIT ${input.limit}`);
      return rows as any[];
    }),

  // Get ETL job statistics
  jobStats: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.execute(sql`
      SELECT job_name, COUNT(*) as total_runs,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_duration_seconds,
        MAX(started_at) as last_run
      FROM lakehouse_etl_runs WHERE started_at > NOW() - INTERVAL '30 days'
      GROUP BY job_name ORDER BY last_run DESC
    `);
    return rows as any[];
  }),

  // Trigger an ETL job manually
  triggerJob: adminProcedure
    .input(z.object({
      jobName: z.enum(["transactions_bronze", "bookings_bronze", "fx_flows_bronze", "kyb_bronze", "ml_features_silver", "intelligence_gold", "full_pipeline"]),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const runId = `ETL-${input.jobName}-${Date.now()}`;
      await db.execute(sql`
        INSERT INTO lakehouse_etl_runs (id, job_name, status, started_at)
        VALUES (${runId}, ${input.jobName}, 'running', NOW())
      `);
      // In production: trigger the Python lakehouse-etl service via HTTP
      const etlServiceUrl = process.env.LAKEHOUSE_ETL_URL ?? "http://lakehouse-etl:8105";
      try {
        const resp = await fetch(`${etlServiceUrl}/jobs/${input.jobName}/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId }) });
        if (!resp.ok) throw new Error(`ETL service returned ${resp.status}`);
        return { runId, status: "triggered", message: `ETL job ${input.jobName} triggered successfully` };
      } catch (e) {
        await db.execute(sql`UPDATE lakehouse_etl_runs SET status = 'failed', error_message = ${String(e)}, completed_at = NOW() WHERE id = ${runId}`);
        return { runId, status: "failed", message: `Failed to trigger ETL job: ${String(e)}` };
      }
    }),

  // Get data quality metrics
  dataQuality: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { overallScore: 0, tables: [] };
    const tables = [
      { name: "wallet_transactions", query: sql`SELECT COUNT(*) as total, SUM(CASE WHEN amount IS NULL OR amount <= 0 THEN 1 ELSE 0 END) as invalid FROM wallet_transactions` },
      { name: "establishments", query: sql`SELECT COUNT(*) as total, SUM(CASE WHEN latitude IS NULL OR longitude IS NULL THEN 1 ELSE 0 END) as invalid FROM establishments` },
      { name: "users", query: sql`SELECT COUNT(*) as total, SUM(CASE WHEN email IS NULL THEN 1 ELSE 0 END) as invalid FROM users` },
    ];
    const results = [];
    for (const t of tables) {
      const rows = await db.execute(t.query);
      const r = (rows as any[])[0] ?? {};
      const total = Number(r.total ?? 0);
      const invalid = Number(r.invalid ?? 0);
      const score = total > 0 ? Math.round(((total - invalid) / total) * 100) : 100;
      results.push({ table: t.name, totalRows: total, invalidRows: invalid, qualityScore: score });
    }
    const overallScore = results.length > 0 ? Math.round(results.reduce((s, r) => s + r.qualityScore, 0) / results.length) : 0;
    return { overallScore, tables: results };
  }),
});
