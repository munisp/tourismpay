/**
 * NOC Dashboard Router
 *
 * Network Operations Centre procedures for the PaymentSwitch:
 * - Kill switch (activate / deactivate all payment processing)
 * - NOC event log (audit trail of all operational events)
 * - Transaction volume charts (hourly/daily aggregates)
 * - System health summary
 */
import { z } from "zod";
import { adminProcedure, nocProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { requirePermission, RESOURCES, ACTIONS } from "../_core/permify";
import {
  nocEvents,
  psKillSwitchState,
  remittances,
  psParticipants,
  psSettlements,
  nocAlertThresholds,
} from "../../drizzle/schema";
import { eq, desc, and, gte, lte, sql, count, sum } from "drizzle-orm";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

export const nocDashboardRouter = router({
  // ── Kill Switch ──────────────────────────────────────────────────────────────

  /** Get current kill switch state */
  getKillSwitchState: nocProcedure.query(async () => {
    const db = await requireDb();
    const rows = await db
      .select()
      .from(psKillSwitchState)
      .orderBy(desc(psKillSwitchState.id))
      .limit(1);
    return rows[0] ?? { isActive: false, reason: null, activatedBy: null, activatedAt: null };
  }),

  /** Activate the kill switch — halts all new payment processing */
  activateKillSwitch: adminProcedure
    .input(z.object({ reason: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      await requirePermission(String(ctx.user.id), ctx.user.role, RESOURCES.SYSTEM, ACTIONS.EDIT);
      const db = await requireDb();
      const now = Date.now();

      // Upsert kill switch state (only one row ever exists)
      const existing = await db.select().from(psKillSwitchState).limit(1);
      if (existing.length > 0) {
        await db
          .update(psKillSwitchState)
          .set({
            isActive: true,
            activatedBy: ctx.user.id,
            activatedByName: ctx.user.name ?? "Admin",
            reason: input.reason,
            activatedAt: now,
            deactivatedAt: null,
            updatedAt: now,
          })
          .where(eq(psKillSwitchState.id, existing[0].id));
      } else {
        await db.insert(psKillSwitchState).values({
          isActive: true,
          activatedBy: ctx.user.id,
          activatedByName: ctx.user.name ?? "Admin",
          reason: input.reason,
          activatedAt: now,
        });
      }

      // Log NOC event
      await db.insert(nocEvents).values({
        type: "kill_switch_activated",
        severity: "critical",
        title: "Kill switch activated — all payments halted",
        description: `Reason: ${input.reason}`,
        actorId: ctx.user.id,
        actorName: ctx.user.name ?? "Admin",
        targetType: "system",
      });

      return { isActive: true, activatedAt: now };
    }),

  /** Deactivate the kill switch — resumes payment processing */
  deactivateKillSwitch: adminProcedure
    .input(z.object({ reason: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const now = Date.now();

      await db
        .update(psKillSwitchState)
        .set({
          isActive: false,
          deactivatedAt: now,
          updatedAt: now,
        });

      await db.insert(nocEvents).values({
        type: "kill_switch_deactivated",
        severity: "info",
        title: "Kill switch deactivated — payments resumed",
        description: input.reason ?? "Manual deactivation by operator",
        actorId: ctx.user.id,
        actorName: ctx.user.name ?? "Admin",
        targetType: "system",
      });

      return { isActive: false, deactivatedAt: now };
    }),

  // ── NOC Event Log ────────────────────────────────────────────────────────────

  /** List NOC events with optional filters */
  listEvents: nocProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
        severity: z.enum(["info", "warning", "critical"]).optional(),
        type: z
          .enum([
            "kill_switch_activated",
            "kill_switch_deactivated",
            "participant_suspended",
            "participant_restored",
            "rate_limit_breach",
            "fraud_alert",
            "system_alert",
            "settlement_failed",
            "settlement_completed",
          ])
          .optional(),
        dateFrom: z.number().optional(),
        dateTo: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await requireDb();
      const conditions: ReturnType<typeof eq>[] = [];
      if (input.severity) conditions.push(eq(nocEvents.severity, input.severity));
      if (input.type) conditions.push(eq(nocEvents.type, input.type));
      if (input.dateFrom) conditions.push(gte(nocEvents.createdAt, input.dateFrom));
      if (input.dateTo) conditions.push(lte(nocEvents.createdAt, input.dateTo));

      const rows = await db
        .select()
        .from(nocEvents)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(nocEvents.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      const [{ total }] = await db
        .select({ total: count() })
        .from(nocEvents)
        .where(conditions.length ? and(...conditions) : undefined);

      return { items: rows, total };
    }),

  // ── Transaction Volume Charts ────────────────────────────────────────────────

  /** Hourly transaction volume for the last 24 hours */
  hourlyVolume: nocProcedure.query(async () => {
    const db = await requireDb();
    const since = Date.now() - 24 * 60 * 60 * 1000;

    const rows = await db
      .select({
        hour: sql<number>`extract(epoch from date_trunc('hour', to_timestamp(created_at / 1000.0))) * 1000`,
        count: count(),
        volume: sum(remittances.senderAmount),
      })
      .from(remittances)
      .where(gte(remittances.createdAt, since))
      .groupBy(
        sql`date_trunc('hour', to_timestamp(created_at / 1000.0))`
      )
      .orderBy(
        sql`date_trunc('hour', to_timestamp(created_at / 1000.0))`
      );

    return rows.map((r) => ({
      hour: Number(r.hour),
      count: Number(r.count),
      volume: r.volume ?? "0",
    }));
  }),

  /** Daily transaction volume for the last 30 days */
  dailyVolume: nocProcedure.query(async () => {
    const db = await requireDb();
    const since = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const rows = await db
      .select({
        day: sql<number>`extract(epoch from date_trunc('day', to_timestamp(created_at / 1000.0))) * 1000`,
        count: count(),
        volume: sum(remittances.senderAmount),
        completed: sql<number>`count(*) filter (where status = 'completed')`,
        failed: sql<number>`count(*) filter (where status = 'failed')`,
      })
      .from(remittances)
      .where(gte(remittances.createdAt, since))
      .groupBy(
        sql`date_trunc('day', to_timestamp(created_at / 1000.0))`
      )
      .orderBy(
        sql`date_trunc('day', to_timestamp(created_at / 1000.0))`
      );

    return rows.map((r) => ({
      day: Number(r.day),
      count: Number(r.count),
      volume: r.volume ?? "0",
      completed: Number(r.completed),
      failed: Number(r.failed),
    }));
  }),

  // ── System Health Summary ────────────────────────────────────────────────────

  /** Full system health snapshot for the NOC dashboard */
  systemHealth: nocProcedure.query(async () => {
    const db = await requireDb();

    const [remittanceStats] = await db
      .select({
        total: count(),
        processing: sql<number>`count(*) filter (where status = 'processing')`,
        failed24h: sql<number>`count(*) filter (where status = 'failed' and created_at > ${Date.now() - 86400000})`,
        successRate: sql<number>`
          round(
            100.0 * count(*) filter (where status = 'completed') /
            nullif(count(*) filter (where status in ('completed','failed')), 0),
            2
          )
        `,
      })
      .from(remittances);

    const [participantStats] = await db
      .select({
        total: count(),
        active: sql<number>`count(*) filter (where status = 'active')`,
        suspended: sql<number>`count(*) filter (where status = 'suspended')`,
        avgHealth: sql<number>`round(avg(health_score), 1)`,
        unhealthy: sql<number>`count(*) filter (where health_score < 50)`,
      })
      .from(psParticipants);

    const [settlementStats] = await db
      .select({
        pending: sql<number>`count(*) filter (where status = 'pending')`,
        failed24h: sql<number>`count(*) filter (where status = 'failed' and created_at > ${Date.now() - 86400000})`,
      })
      .from(psSettlements);

    const ks = await db
      .select()
      .from(psKillSwitchState)
      .orderBy(desc(psKillSwitchState.id))
      .limit(1);

    const recentCritical = await db
      .select()
      .from(nocEvents)
      .where(
        and(
          eq(nocEvents.severity, "critical"),
          gte(nocEvents.createdAt, Date.now() - 3600000)
        )
      )
      .orderBy(desc(nocEvents.createdAt))
      .limit(5);

    return {
      killSwitch: ks[0] ?? { isActive: false },
      remittances: {
        total: Number(remittanceStats.total),
        processing: Number(remittanceStats.processing),
        failed24h: Number(remittanceStats.failed24h),
        successRate: remittanceStats.successRate ?? 100,
      },
      participants: {
        total: Number(participantStats.total),
        active: Number(participantStats.active),
        suspended: Number(participantStats.suspended),
        avgHealth: Number(participantStats.avgHealth ?? 100),
        unhealthy: Number(participantStats.unhealthy),
      },
      settlements: {
        pending: Number(settlementStats.pending),
        failed24h: Number(settlementStats.failed24h),
      },
      recentCriticalEvents: recentCritical,
      checkedAt: Date.now(),
    };
  }),

  // ── Recent events (alias for listEvents with sensible defaults) ────────────
  recentEvents: adminProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(20),
      severity: z.enum(["info", "warning", "error", "critical"]).optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await requireDb();
      const rows = await db
        .select()
        .from(nocEvents)
        .where(input?.severity ? eq(nocEvents.severity, input.severity as any) : undefined)
        .orderBy(desc(nocEvents.createdAt))
        .limit(input?.limit ?? 20);
      return rows;
    }),

  // ── Transaction volume (aggregated) ────────────────────────────────────
  transactionVolume: adminProcedure
    .input(z.object({
      period: z.enum(["hourly", "daily", "weekly"]).default("daily"),
    }).optional())
    .query(async ({ input }) => {
      const period = input?.period ?? "daily";
      const db = await requireDb();
      if (period === "hourly") {
        const rows = await db
          .select({
            hour: sql<number>`extract(epoch from date_trunc('hour', to_timestamp(created_at / 1000.0))) * 1000`,
            count: count(),
          })
          .from(remittances)
          .where(gte(remittances.createdAt, Date.now() - 24 * 60 * 60 * 1000))
          .groupBy(sql`date_trunc('hour', to_timestamp(created_at / 1000.0))`)
          .orderBy(sql`date_trunc('hour', to_timestamp(created_at / 1000.0))`);
        return rows;
      }
      const rows = await db
        .select({
          day: sql<number>`extract(epoch from date_trunc('day', to_timestamp(created_at / 1000.0))) * 1000`,
          count: count(),
        })
        .from(remittances)
        .where(gte(remittances.createdAt, Date.now() - 30 * 24 * 60 * 60 * 1000))
        .groupBy(sql`date_trunc('day', to_timestamp(created_at / 1000.0))`)
        .orderBy(sql`date_trunc('day', to_timestamp(created_at / 1000.0))`);
      return rows;
    }),

  // ── Log a NOC event ───────────────────────────────────────────────────────────
  logEvent: adminProcedure
    .input(z.object({
      type: z.string().min(1),
      severity: z.enum(["info", "warning", "error", "critical"]).default("info"),
      title: z.string().min(1),
      description: z.string().optional(),
      targetId: z.string().optional(),
      targetType: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const [event] = await db.insert(nocEvents).values({
        type: input.type as any,
        severity: input.severity as any,
        title: input.title,
        description: input.description ?? null,
        actorId: ctx.user.id,
        actorName: ctx.user.name ?? "Admin",
        targetId: input.targetId ?? null,
        targetType: input.targetType ?? null,
        metadata: input.metadata ?? {},
        createdAt: Date.now(),
      }).returning();
      return event;
    }),

  // ── Kill switch toggle (convenience alias) ───────────────────────────────
  killSwitch: adminProcedure
    .input(z.object({
      activate: z.boolean(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const now = Date.now();
      const existing = await db.select().from(psKillSwitchState).limit(1);
      if (existing.length > 0) {
        await db.update(psKillSwitchState).set({
          isActive: input.activate,
          activatedBy: input.activate ? ctx.user.id : existing[0].activatedBy,
          activatedByName: input.activate ? (ctx.user.name ?? "Admin") : existing[0].activatedByName,
          reason: input.reason ?? null,
          activatedAt: input.activate ? now : existing[0].activatedAt,
          deactivatedAt: input.activate ? null : now,
          updatedAt: now,
        }).where(eq(psKillSwitchState.id, existing[0].id));
      } else {
        await db.insert(psKillSwitchState).values({
          isActive: input.activate,
          activatedBy: ctx.user.id,
          activatedByName: ctx.user.name ?? "Admin",
          reason: input.reason ?? null,
          activatedAt: input.activate ? now : null,
        });
      }
      await db.insert(nocEvents).values({
        type: input.activate ? "kill_switch_activated" : "kill_switch_deactivated",
        severity: input.activate ? "critical" : "warning",
        title: input.activate ? "Kill switch ACTIVATED" : "Kill switch deactivated",
        description: input.reason ?? null,
        actorId: ctx.user.id,
        actorName: ctx.user.name ?? "Admin",
        createdAt: now,
      });
      return { success: true, isActive: input.activate };
    }),

  // ── Alert Thresholds ─────────────────────────────────────────────────────
  /** Get all configured alert thresholds (or seed defaults if none exist) */
  getThresholds: adminProcedure.query(async () => {
    const db = await requireDb();
    const rows = await db.select().from(nocAlertThresholds);
    if (rows.length > 0) return rows;
    // Seed defaults on first access
    const defaults = [
      { metric: "tps", label: "Transactions Per Second", unit: "tps", warnMin: null, warnMax: "500", critMin: null, critMax: "800" },
      { metric: "successRate", label: "Success Rate", unit: "%", warnMin: "95", warnMax: null, critMin: "90", critMax: null },
      { metric: "avgLatency", label: "Avg Latency", unit: "ms", warnMin: null, warnMax: "300", critMin: null, critMax: "500" },
      { metric: "todayVolume", label: "Today's Volume", unit: "txns", warnMin: null, warnMax: null, critMin: null, critMax: null },
    ];
    const inserted = await db.insert(nocAlertThresholds).values(defaults).returning();
    return inserted;
  }),

  /** Update a single metric's threshold values */
  updateThreshold: adminProcedure
    .input(
      z.object({
        metric: z.string().min(1),
        warnMin: z.number().nullable().optional(),
        warnMax: z.number().nullable().optional(),
        critMin: z.number().nullable().optional(),
        critMax: z.number().nullable().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const toStr = (v: number | null | undefined) => (v == null ? null : String(v));
      const existing = await db
        .select()
        .from(nocAlertThresholds)
        .where(eq(nocAlertThresholds.metric, input.metric));
      if (existing.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Threshold for metric '${input.metric}' not found` });
      }
      const [updated] = await db
        .update(nocAlertThresholds)
        .set({
          warnMin: toStr(input.warnMin),
          warnMax: toStr(input.warnMax),
          critMin: toStr(input.critMin),
          critMax: toStr(input.critMax),
          updatedBy: ctx.user.name ?? String(ctx.user.id),
          updatedAt: Date.now(),
        })
        .where(eq(nocAlertThresholds.metric, input.metric))
        .returning();
      return updated;
    }),

  /** Reset all thresholds to factory defaults */
  resetThresholds: adminProcedure.mutation(async ({ ctx }) => {
    const db = await requireDb();
    const defaults = [
      { metric: "tps", warnMax: "500", critMax: "800", warnMin: null as string | null, critMin: null as string | null },
      { metric: "successRate", warnMin: "95", critMin: "90", warnMax: null as string | null, critMax: null as string | null },
      { metric: "avgLatency", warnMax: "300", critMax: "500", warnMin: null as string | null, critMin: null as string | null },
      { metric: "todayVolume", warnMin: null as string | null, warnMax: null as string | null, critMin: null as string | null, critMax: null as string | null },
    ];
    for (const d of defaults) {
      await db
        .update(nocAlertThresholds)
        .set({ warnMin: d.warnMin, warnMax: d.warnMax, critMin: d.critMin, critMax: d.critMax, updatedBy: ctx.user.name ?? String(ctx.user.id), updatedAt: Date.now() })
        .where(eq(nocAlertThresholds.metric, d.metric));
    }
    return { success: true };
  }),
});
