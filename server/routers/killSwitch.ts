/**
 * Kill Switch Router
 *
 * Manages per-corridor and global payment kill switches.
 * Activating a kill switch blocks all new remittance initiations for that corridor.
 * Every toggle is persisted to psKillSwitchHistory for full audit trail.
 *
 * Corridors: "USD-NGN", "USD-KES", "GBP-NGN", "EUR-NGN", "USD-GHS",
 *            "USD-ZAR", "USD-TZS", "USD-UGX", "USD-XOF", "GLOBAL"
 */

import crypto from "crypto";
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { drizzle } from "drizzle-orm/postgres-js";
import {
  psKillSwitches,
  psKillSwitchHistory,
  type PsKillSwitch,
} from "../../drizzle/schema";
import { publishEvent, TOPICS } from "../_core/kafka";
import { requirePermission, RESOURCES, ACTIONS } from "../_core/permify";

type DbInstance = NonNullable<ReturnType<typeof drizzle>>;

async function requireDb(): Promise<DbInstance> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db as DbInstance;
}

// ─── Supported corridors ───────────────────────────────────────────────────────

export const SUPPORTED_CORRIDORS = [
  "GLOBAL",
  "USD-NGN",
  "USD-KES",
  "USD-GHS",
  "USD-ZAR",
  "USD-TZS",
  "USD-UGX",
  "USD-XOF",
  "GBP-NGN",
  "EUR-NGN",
  "EUR-KES",
  "USD-MAD",
] as const;

export type SupportedCorridor = (typeof SUPPORTED_CORRIDORS)[number];

// ─── Seed default corridor rows if missing ─────────────────────────────────────

export async function seedKillSwitchCorridors() {
  const db = await requireDb();
  for (const corridor of SUPPORTED_CORRIDORS) {
    await db
      .insert(psKillSwitches)
      .values({
        corridor,
        isActive: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .onConflictDoNothing();
  }
}

// ─── Helper: record history entry ─────────────────────────────────────────────

async function recordHistory(
  corridor: string,
  action: "activated" | "deactivated" | "scheduled_activate" | "scheduled_deactivate",
  actorId: number | undefined,
  actorName: string | undefined,
  reason: string | undefined,
  metadata: Record<string, unknown> = {}
) {
  const db = await requireDb();
  await db.insert(psKillSwitchHistory).values({
    corridor,
    action,
    actorId,
    actorName,
    reason,
    metadata,
    createdAt: Date.now(),
  });
}

// ─── Helper: check if a corridor is blocked ───────────────────────────────────

export async function isCorridorBlocked(
  senderCurrency: string,
  recipientCurrency: string
): Promise<{ blocked: boolean; reason: string | null; corridor: string | null }> {
  const db = await requireDb();
  const corridorKey = `${senderCurrency}-${recipientCurrency}`;

  // Check GLOBAL kill switch first
  const globalSwitch = await db
    .select()
    .from(psKillSwitches)
    .where(eq(psKillSwitches.corridor, "GLOBAL"))
    .limit(1);

  if (globalSwitch[0]?.isActive) {
    return {
      blocked: true,
      reason: globalSwitch[0].reason ?? "Global payment kill switch is active",
      corridor: "GLOBAL",
    };
  }

  // Check corridor-specific kill switch
  const corridorSwitch = await db
    .select()
    .from(psKillSwitches)
    .where(eq(psKillSwitches.corridor, corridorKey))
    .limit(1);

  if (corridorSwitch[0]?.isActive) {
    return {
      blocked: true,
      reason:
        corridorSwitch[0].reason ??
        `Kill switch active for corridor ${corridorKey}`,
      corridor: corridorKey,
    };
  }

  return { blocked: false, reason: null, corridor: null };
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const killSwitchRouter = router({
  /**
   * List all corridor kill switches with their current status.
   * Seeds missing corridors on first call.
   */
  list: protectedProcedure.query(async () => {
    // Ensure all corridors exist
    await seedKillSwitchCorridors();
    const db = await requireDb();

    const switches = await db
      .select()
      .from(psKillSwitches)
      .orderBy(sql`CASE WHEN ${psKillSwitches.corridor} = 'GLOBAL' THEN 0 ELSE 1 END`, psKillSwitches.corridor);

    return switches;
  }),

  /**
   * Get a single corridor kill switch by corridor name.
   */
  get: protectedProcedure
    .input(z.object({ corridor: z.string().min(1).max(32) }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const [ks] = await db
        .select()
        .from(psKillSwitches)
        .where(eq(psKillSwitches.corridor, input.corridor))
        .limit(1);

      if (!ks) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Kill switch for corridor "${input.corridor}" not found`,
        });
      }

      return ks;
    }),

  /**
   * Activate a kill switch for a corridor (admin only).
   * Blocks all new remittances for that corridor immediately.
   */
  activate: protectedProcedure
    .input(
      z.object({
        corridor: z.enum(SUPPORTED_CORRIDORS),
        reason: z.string().min(10).max(500),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requirePermission(String(ctx.user.id), ctx.user.role, RESOURCES.SYSTEM, ACTIONS.EDIT);
      const db = await requireDb();
      const now = Date.now();

      // Upsert the kill switch row
      const existing = await db
        .select()
        .from(psKillSwitches)
        .where(eq(psKillSwitches.corridor, input.corridor))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(psKillSwitches).values({
          corridor: input.corridor,
          isActive: true,
          activatedBy: ctx.user.id,
          activatedByName: ctx.user.name ?? undefined,
          reason: input.reason,
          activatedAt: now,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        await db
          .update(psKillSwitches)
          .set({
            isActive: true,
            activatedBy: ctx.user.id,
            activatedByName: ctx.user.name ?? undefined,
            reason: input.reason,
            activatedAt: now,
            deactivatedAt: undefined,
            deactivatedBy: undefined,
            deactivatedByName: undefined,
            updatedAt: now,
          })
          .where(eq(psKillSwitches.corridor, input.corridor));
      }

      // Record audit history
      await recordHistory(
        input.corridor,
        "activated",
        ctx.user.id,
        ctx.user.name ?? undefined,
        input.reason,
        { userId: ctx.user.id, timestamp: now }
      );

      publishEvent(TOPICS.KILL_SWITCH, { type: "kill_switch.activated", payload: { corridor: input.corridor, reason: input.reason, activatedBy: ctx.user.name || String(ctx.user.id) } });

      return {
        success: true,
        corridor: input.corridor,
        isActive: true,
        activatedAt: now,
        activatedBy: ctx.user.name,
      };
    }),

  /**
   * Deactivate a kill switch for a corridor (admin only).
   * Resumes remittance processing for that corridor.
   */
  deactivate: protectedProcedure
    .input(
      z.object({
        corridor: z.enum(SUPPORTED_CORRIDORS),
        reason: z.string().min(5).max(500).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requirePermission(String(ctx.user.id), ctx.user.role, RESOURCES.SYSTEM, ACTIONS.EDIT);
      const db = await requireDb();
      const now = Date.now();

      const existing = await db
        .select()
        .from(psKillSwitches)
        .where(eq(psKillSwitches.corridor, input.corridor))
        .limit(1);

      if (!existing[0]) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Kill switch for corridor "${input.corridor}" not found`,
        });
      }

      if (!existing[0].isActive) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Kill switch for corridor "${input.corridor}" is already inactive`,
        });
      }

      await db
        .update(psKillSwitches)
        .set({
          isActive: false,
          deactivatedAt: now,
          deactivatedBy: ctx.user.id,
          deactivatedByName: ctx.user.name ?? undefined,
          updatedAt: now,
        })
        .where(eq(psKillSwitches.corridor, input.corridor));

      await recordHistory(
        input.corridor,
        "deactivated",
        ctx.user.id,
        ctx.user.name ?? undefined,
        input.reason,
        { userId: ctx.user.id, timestamp: now }
      );

      return {
        success: true,
        corridor: input.corridor,
        isActive: false,
        deactivatedAt: now,
        deactivatedBy: ctx.user.name,
      };
    }),

  /**
   * Get activation/deactivation history for a corridor.
   */
  getHistory: protectedProcedure
    .input(
      z.object({
        corridor: z.string().min(1).max(32).optional(),
        limit: z.number().min(1).max(200).default(50),
      })
    )
    .query(async ({ input }) => {
      const db = await requireDb();
      const conditions = input.corridor
        ? [eq(psKillSwitchHistory.corridor, input.corridor)]
        : [];

      const history = await db
        .select()
        .from(psKillSwitchHistory)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(psKillSwitchHistory.createdAt))
        .limit(input.limit);

      return history;
    }),

  /**
   * Get a summary of active kill switches (for dashboard widgets).
   */
  summary: protectedProcedure.query(async () => {
    const db = await requireDb();
    const all = await db.select().from(psKillSwitches);
    const active = all.filter((ks: PsKillSwitch) => ks.isActive);
    const globalActive = active.some((ks: PsKillSwitch) => ks.corridor === "GLOBAL");

    return {
      total: all.length,
      active: active.length,
      globalActive,
      activeCorridors: active
        .filter((ks: PsKillSwitch) => ks.corridor !== "GLOBAL")
        .map((ks: PsKillSwitch) => ks.corridor),
      lastActivation: active.reduce(
        (latest: number | null, ks: PsKillSwitch) =>
          ks.activatedAt && ks.activatedAt > (latest ?? 0)
            ? ks.activatedAt
            : latest,
        null as number | null
      ),
    };
  }),

  /**
   * Check if a specific corridor is currently blocked.
   * Used by remittance initiation to gate transactions.
   */
  checkCorridor: protectedProcedure
    .input(
      z.object({
        senderCurrency: z.string().length(3),
        recipientCurrency: z.string().length(3),
      })
    )
    .query(async ({ input }) => {
      return isCorridorBlocked(input.senderCurrency, input.recipientCurrency);
    }),

  // Schedule a kill switch activation or deactivation
  schedule: protectedProcedure
    .input(z.object({
      corridor: z.enum(SUPPORTED_CORRIDORS),
      action: z.enum(["activate", "deactivate"]),
      scheduledAt: z.number().positive(),
      reason: z.string().min(5).max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      await requirePermission(String(ctx.user.id), ctx.user.role, RESOURCES.SYSTEM, ACTIONS.EDIT);
      const db = await requireDb();
      const scheduleId = crypto.randomUUID();

      await db.execute(sql`
        INSERT INTO kill_switch_schedules (id, corridor, action, scheduled_at, reason, created_by, created_by_name, status, created_at)
        VALUES (${scheduleId}, ${input.corridor}, ${input.action}, ${input.scheduledAt}, ${input.reason}, ${ctx.user.id}, ${ctx.user.name ?? String(ctx.user.id)}, 'pending', ${Date.now()})
      `);

      await recordHistory(
        input.corridor,
        `scheduled_${input.action}`,
        ctx.user.id,
        ctx.user.name ?? undefined,
        `Scheduled ${input.action} at ${new Date(input.scheduledAt).toISOString()}: ${input.reason}`,
        { scheduleId, scheduledAt: input.scheduledAt }
      );

      publishEvent(TOPICS.KILL_SWITCH, {
        type: `kill_switch.scheduled`,
        payload: { corridor: input.corridor, action: input.action, scheduledAt: input.scheduledAt, reason: input.reason },
      });

      return { scheduleId, corridor: input.corridor, action: input.action, scheduledAt: input.scheduledAt };
    }),

  // List pending scheduled kill switch actions
  listScheduled: protectedProcedure.query(async () => {
    const db = await requireDb();
    try {
      const rows = await db.execute(
        sql`SELECT * FROM kill_switch_schedules WHERE status = 'pending' ORDER BY scheduled_at ASC`
      );
      return rows as any[];
    } catch {
      return [];
    }
  }),
});
