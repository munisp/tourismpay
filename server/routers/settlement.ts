/**
 * Settlement Router — Settlement Console for settlement_officer and admin roles
 * Provides batch listing, approval, rejection, stats, and merchant payout history.
 */
import { settlementProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { z } from "zod";
import { sql, count, eq, and, desc, gte, lte } from "drizzle-orm";
import { psSettlements } from "../../drizzle/schema";
import { createAuditLog, createUserNotification } from "../db";
import { TRPCError } from "@trpc/server";
import { Parser } from "json2csv";
import { pushSettlementUpdate } from "../sse";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

export const settlementRouter = router({
  // ── Summary stats ─────────────────────────────────────────────────────────
  stats: settlementProcedure.query(async () => {
    const db = await requireDb();
    const thirtyDaysAgo = Date.now() - 30 * 86_400_000;
    const [stats] = await db
      .select({
        total: count(),
        pending: sql<number>`count(*) filter (where status = 'pending')`,
        processing: sql<number>`count(*) filter (where status = 'processing')`,
        completed: sql<number>`count(*) filter (where status = 'completed')`,
        failed: sql<number>`count(*) filter (where status = 'failed')`,
        disputed: sql<number>`count(*) filter (where status = 'disputed')`,
        totalAmountPending: sql<number>`coalesce(sum(total_amount::numeric) filter (where status = 'pending'), 0)`,
        totalAmountCompleted: sql<number>`coalesce(sum(total_amount::numeric) filter (where status = 'completed'), 0)`,
      })
      .from(psSettlements)
      .where(sql`created_at >= ${thirtyDaysAgo}`);
    return {
      total: Number(stats?.total ?? 0),
      pending: Number(stats?.pending ?? 0),
      processing: Number(stats?.processing ?? 0),
      completed: Number(stats?.completed ?? 0),
      failed: Number(stats?.failed ?? 0),
      disputed: Number(stats?.disputed ?? 0),
      totalAmountPending: Number(stats?.totalAmountPending ?? 0),
      totalAmountCompleted: Number(stats?.totalAmountCompleted ?? 0),
    };
  }),

  // ── List settlements with optional status filter ───────────────────────────
  list: settlementProcedure
    .input(z.object({
      status: z.enum(["pending", "processing", "completed", "failed", "disputed"]).optional(),
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
    }).optional())
    .query(async ({ input }) => {
      const db = await requireDb();
      const conditions = [];
      if (input?.status) {
        conditions.push(eq(psSettlements.status, input.status));
      }
      const rows = await db
        .select()
        .from(psSettlements)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(psSettlements.createdAt))
        .limit(input?.limit ?? 50)
        .offset(input?.offset ?? 0);
      const [{ total }] = await db
        .select({ total: count() })
        .from(psSettlements)
        .where(conditions.length > 0 ? and(...conditions) : undefined);
      return {
        rows: rows.map((r) => ({
          ...r,
          totalAmount: Number(r.totalAmount),
        })),
        total: Number(total),
      };
    }),

  // ── Approve a batch of pending settlements ─────────────────────────────────
  approveBatch: settlementProcedure
    .input(z.object({
      ids: z.array(z.string()).min(1).max(100),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const rows = await db
        .select({ id: psSettlements.id, status: psSettlements.status })
        .from(psSettlements)
        .where(sql`id = ANY(${input.ids})`);
      const eligibleIds = rows.filter((r) => r.status === "pending").map((r) => r.id);
      if (eligibleIds.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No pending settlements found in selection" });
      }
      await db.execute(
        sql`UPDATE ps_settlements
            SET status = 'processing', updated_at = ${Date.now()}
            WHERE id = ANY(${eligibleIds}) AND status = 'pending'`
      );
      await createAuditLog({
        actorId: ctx.user.id,
        actorName: ctx.user.name || String(ctx.user.id),
        action: "settlement.batch.approve",
        entityType: "ps_settlement",
        entityId: eligibleIds.join(","),
        after: { ids: eligibleIds, newStatus: "processing" },
      });
      // Notify each participant
      for (const approvedRow of rows.filter((r) => r.status === "pending")) {
        try {
          const [fullRow] = await db
            .select({ participantId: psSettlements.participantId, totalAmount: psSettlements.totalAmount, currency: psSettlements.currency })
            .from(psSettlements)
            .where(eq(psSettlements.id, approvedRow.id));
          if (fullRow) {
            const participantIdInt = parseInt(fullRow.participantId, 10);
            if (!isNaN(participantIdInt)) {
              await createUserNotification({
                userId: participantIdInt,
                category: "system",
                title: "Settlement Approved ✅",
                content: `Your settlement of ${Number(fullRow.totalAmount).toFixed(2)} ${fullRow.currency} has been approved and is now processing.`,
                actionUrl: "/merchant/payouts",
                actionLabel: "View Payouts",
              });
            }
          }
        } catch (_) { /* non-critical */ }
      }
      // Push real-time update to SSE clients
      try {
        pushSettlementUpdate({ ids: eligibleIds, newStatus: "processing", count: eligibleIds.length, actorName: ctx.user.name || String(ctx.user.id) });
      } catch { /* non-critical */ }
      return { approved: eligibleIds.length, ids: eligibleIds };
    }),

  // ── Reject a settlement ────────────────────────────────────────────────────
  reject: settlementProcedure
    .input(z.object({
      id: z.string(),
      reason: z.string().min(1).max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [row] = await db
        .select({ id: psSettlements.id, status: psSettlements.status })
        .from(psSettlements)
        .where(eq(psSettlements.id, input.id));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Settlement not found" });
      if (row.status === "completed") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot reject a completed settlement" });
      }
      await db.execute(
        sql`UPDATE ps_settlements
            SET status = 'failed', updated_at = ${Date.now()}
            WHERE id = ${input.id}`
      );
      await createAuditLog({
        actorId: ctx.user.id,
        actorName: ctx.user.name || String(ctx.user.id),
        action: "settlement.reject",
        entityType: "ps_settlement",
        entityId: input.id,
        after: { newStatus: "failed", reason: input.reason },
      });
      try {
        const [rejectedRow] = await db
          .select({ participantId: psSettlements.participantId, totalAmount: psSettlements.totalAmount, currency: psSettlements.currency })
          .from(psSettlements)
          .where(eq(psSettlements.id, input.id));
        if (rejectedRow) {
          const participantIdInt = parseInt(rejectedRow.participantId, 10);
          if (!isNaN(participantIdInt)) {
            await createUserNotification({
              userId: participantIdInt,
              category: "system",
              title: "Settlement Rejected ❌",
              content: `Your settlement of ${Number(rejectedRow.totalAmount).toFixed(2)} ${rejectedRow.currency} was rejected. Reason: ${input.reason}.`,
              actionUrl: "/merchant/payouts",
              actionLabel: "View Payouts",
            });
          }
        }
      } catch (_) { /* non-critical */ }
      // Push real-time update to SSE clients
      try {
        pushSettlementUpdate({ ids: [input.id], newStatus: "failed", count: 1, actorName: ctx.user.name || String(ctx.user.id) });
      } catch { /* non-critical */ }
      return { success: true };
    }),

  // ── Mark processing settlements as completed ───────────────────────────────
  markCompleted: settlementProcedure
    .input(z.object({
      ids: z.array(z.string()).min(1).max(100),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await db.execute(
        sql`UPDATE ps_settlements
            SET status = 'completed', settled_at = ${Date.now()}, updated_at = ${Date.now()}
            WHERE id = ANY(${input.ids}) AND status = 'processing'`
      );
      await createAuditLog({
        actorId: ctx.user.id,
        actorName: ctx.user.name || String(ctx.user.id),
        action: "settlement.batch.complete",
        entityType: "ps_settlement",
        entityId: input.ids.join(","),
        after: { ids: input.ids, newStatus: "completed" },
      });
      // Push real-time update to SSE clients
      try {
        pushSettlementUpdate({ ids: input.ids, newStatus: "completed", count: input.ids.length, actorName: ctx.user.name || String(ctx.user.id) });
      } catch { /* non-critical */ }
      return { completed: input.ids.length };
    }),

  // ── Merchant-facing payout history ────────────────────────────────────────
  myPayouts: protectedProcedure
    .input(z.object({
      status: z.enum(["pending", "processing", "completed", "failed", "disputed"]).optional(),
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const participantId = String(ctx.user.id);
      const conditions = [eq(psSettlements.participantId, participantId)] as any[];
      if (input?.status) conditions.push(eq(psSettlements.status, input.status));
      const rows = await db
        .select()
        .from(psSettlements)
        .where(and(...conditions))
        .orderBy(desc(psSettlements.createdAt))
        .limit(input?.limit ?? 20)
        .offset(input?.offset ?? 0);
      const [{ total }] = await db
        .select({ total: count() })
        .from(psSettlements)
        .where(and(...conditions));
      const [summaryRow] = await db
        .select({
          totalCompleted: sql<number>`coalesce(sum(total_amount::numeric) filter (where status = 'completed'), 0)`,
          totalPending: sql<number>`coalesce(sum(total_amount::numeric) filter (where status = 'pending'), 0)`,
          countCompleted: sql<number>`count(*) filter (where status = 'completed')`,
          countPending: sql<number>`count(*) filter (where status = 'pending')`,
        })
        .from(psSettlements)
        .where(eq(psSettlements.participantId, participantId));
      return {
        rows: rows.map((r) => ({ ...r, totalAmount: Number(r.totalAmount) })),
        total: Number(total),
        summary: {
          totalCompleted: Number(summaryRow?.totalCompleted ?? 0),
          totalPending: Number(summaryRow?.totalPending ?? 0),
          countCompleted: Number(summaryRow?.countCompleted ?? 0),
          countPending: Number(summaryRow?.countPending ?? 0),
        },
      };
    }),

  // ── Export settlements as CSV ─────────────────────────────────────────────────
  exportCsv: settlementProcedure
    .input(z.object({
      status: z.enum(["pending", "processing", "completed", "failed", "disputed"]).optional(),
      dateFrom: z.number().optional(),
      dateTo: z.number().optional(),
    }).optional())
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const conditions: ReturnType<typeof eq>[] = [];
      if (input?.status) conditions.push(eq(psSettlements.status, input.status));
      if (input?.dateFrom) conditions.push(gte(psSettlements.createdAt, input.dateFrom));
      if (input?.dateTo) conditions.push(lte(psSettlements.createdAt, input.dateTo));
      const rows = await db.select().from(psSettlements)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(psSettlements.createdAt))
        .limit(5000);
      if (rows.length === 0) return { csv: null, filename: "settlements.csv", rowCount: 0 };
      const fields = [
        { label: "Batch ID", value: "id" },
        { label: "Merchant ID", value: "merchantId" },
        { label: "Participant ID", value: "participantId" },
        { label: "Status", value: "status" },
        { label: "Total Amount", value: (r: any) => Number(r.totalAmount).toFixed(2) },
        { label: "Currency", value: "currency" },
        { label: "Transaction Count", value: "transactionCount" },
        { label: "Settlement Date", value: (r: any) => r.settlementDate ? new Date(r.settlementDate).toISOString() : "" },
        { label: "Created At", value: (r: any) => new Date(r.createdAt).toISOString() },
        { label: "Updated At", value: (r: any) => new Date(r.updatedAt).toISOString() },
        { label: "Notes", value: (r: any) => r.notes ?? "" },
      ];
      const parser = new Parser({ fields } as any);
      const csv = parser.parse(rows);
      const date = new Date().toISOString().slice(0, 10);
      return { csv, filename: `settlements-${date}.csv`, rowCount: rows.length };
    }),

  // ── Daily settlement volume chart (last 30 days) ──────────────────────────
  dailyVolume: settlementProcedure.query(async () => {
    const db = await requireDb();
    const since = new Date(Date.now() - 30 * 86_400_000);
    const rows = await db.execute(
      sql`SELECT
        to_char(to_timestamp(created_at / 1000), 'YYYY-MM-DD') as day,
        count(*) as total,
        count(*) filter (where status = 'completed') as completed,
        coalesce(sum(total_amount::numeric) filter (where status = 'completed'), 0) as volume
      FROM ps_settlements
      WHERE created_at >= ${since.getTime()}
      GROUP BY day ORDER BY day`
    );
    return (rows as any[]).map((r) => ({
      day: r.day as string,
      total: Number(r.total),
      completed: Number(r.completed),
      volume: Number(r.volume),
    }));
  }),
});
