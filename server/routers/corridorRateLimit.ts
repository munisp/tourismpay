/**
 * corridorRateLimit.ts
 *
 * tRPC router for managing per-corridor transaction rate limits and daily volume caps.
 * Enforces limits via a sliding 1-minute window (txCount) and a 24-hour rolling window
 * (volumeSum). The enforcement function `checkAndIncrementRateLimit` is exported for
 * use inside `initiateRemittance`.
 *
 * Procedures:
 *   list         — list all corridor rate limit configs
 *   get          — get a single corridor's config
 *   create       — create a new rate limit for a corridor
 *   update       — update an existing rate limit config
 *   delete       — remove a rate limit config
 *   getUsage     — get current window usage for a corridor
 *   reset        — reset usage counters for a corridor
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, and, gte } from "drizzle-orm";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  psCorridorRateLimits,
  psCorridorRateLimitUsage,
} from "../../drizzle/schema";

// ─── Supported corridors (mirrors killSwitch.ts) ──────────────────────────────

export const RATE_LIMIT_CORRIDORS = [
  "NG-KE", "NG-GH", "NG-ZA", "NG-TZ", "NG-UG",
  "KE-NG", "KE-GH", "KE-ZA", "KE-TZ", "KE-UG",
  "GH-NG", "GH-KE", "GH-ZA",
  "ZA-NG", "ZA-KE", "ZA-GH",
  "TZ-NG", "TZ-KE", "UG-NG", "UG-KE",
  "GLOBAL",
] as const;

export type RateLimitCorridor = (typeof RATE_LIMIT_CORRIDORS)[number];

// ─── DB helper ────────────────────────────────────────────────────────────────

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

// ─── Rate limit enforcement (exported for use in initiateRemittance) ──────────

/**
 * Check whether a remittance would exceed the corridor's rate limits.
 * If within limits, atomically increment the usage counters.
 * Throws RATE_LIMIT_EXCEEDED (429) if any limit is breached.
 *
 * @param corridor  The corridor string, e.g. "NG-KE"
 * @param amountMinorUnits  Amount in minor currency units (e.g. cents)
 * @param currency  3-letter ISO currency code
 */
export async function checkAndIncrementRateLimit(
  corridor: string,
  amountMinorUnits: number,
  currency: string
): Promise<void> {
  const db = await getDb();
  if (!db) return; // Fail open when DB is unavailable

  // Look up the rate limit config for this corridor or GLOBAL
  const configs = await db
    .select()
    .from(psCorridorRateLimits)
    .where(
      and(
        eq(psCorridorRateLimits.isActive, true)
      )
    );

  const corridorConfig = configs.find((c: typeof configs[0]) => c.corridor === corridor);
  const globalConfig = configs.find((c: typeof configs[0]) => c.corridor === "GLOBAL");

  for (const config of [corridorConfig, globalConfig].filter(Boolean)) {
    if (!config) continue;

    const now = Date.now();
    // 1-minute window: floor to nearest minute
    const windowStart = Math.floor(now / 60_000) * 60_000;
    // 24-hour window: floor to nearest day (UTC midnight)
    const dayWindowStart = Math.floor(now / 86_400_000) * 86_400_000;

    // Fetch or create usage record for this corridor + minute window
    const usageRows = await db
      .select()
      .from(psCorridorRateLimitUsage)
      .where(
        and(
          eq(psCorridorRateLimitUsage.corridor, config.corridor),
          eq(psCorridorRateLimitUsage.windowStart, windowStart)
        )
      );

    const minuteUsage = usageRows[0];
    const currentTxCount = minuteUsage?.txCount ?? 0;

    // Check per-minute tx limit
    if (config.maxTxPerMinute > 0 && currentTxCount >= config.maxTxPerMinute) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `RATE_LIMIT_EXCEEDED: corridor ${config.corridor} has reached the per-minute transaction limit of ${config.maxTxPerMinute}`,
      });
    }

    // Fetch day usage for volume check
    const dayUsageRows = await db
      .select()
      .from(psCorridorRateLimitUsage)
      .where(
        and(
          eq(psCorridorRateLimitUsage.corridor, config.corridor),
          eq(psCorridorRateLimitUsage.dayWindowStart, dayWindowStart)
        )
      );

    const dayUsage = dayUsageRows[0];
    const currentVolumeSum = dayUsage?.volumeSum ?? 0;

    // Check daily volume limit (only if same currency)
    if (
      config.maxVolumePerDay > 0 &&
      config.currency === currency &&
      currentVolumeSum + amountMinorUnits > config.maxVolumePerDay
    ) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `RATE_LIMIT_EXCEEDED: corridor ${config.corridor} would exceed the daily volume cap of ${config.maxVolumePerDay} ${config.currency}`,
      });
    }

    // Increment minute window counter (upsert)
    if (minuteUsage) {
      await db
        .update(psCorridorRateLimitUsage)
        .set({
          txCount: currentTxCount + 1,
          lastUpdatedAt: now,
        })
        .where(eq(psCorridorRateLimitUsage.id, minuteUsage.id));
    } else {
      await db.insert(psCorridorRateLimitUsage).values({
        corridor: config.corridor,
        windowStart,
        dayWindowStart,
        txCount: 1,
        volumeSum: amountMinorUnits,
        currency,
        lastUpdatedAt: now,
      });
    }

    // Increment day window volume (upsert, separate from minute window)
    if (dayUsage && dayUsage.id !== minuteUsage?.id) {
      await db
        .update(psCorridorRateLimitUsage)
        .set({
          volumeSum: currentVolumeSum + amountMinorUnits,
          lastUpdatedAt: now,
        })
        .where(eq(psCorridorRateLimitUsage.id, dayUsage.id));
    }
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const corridorRateLimitRouter = router({
  /** List all corridor rate limit configurations */
  list: protectedProcedure.query(async () => {
    const db = await requireDb();
    const configs = await db
      .select()
      .from(psCorridorRateLimits)
      .orderBy(psCorridorRateLimits.corridor);
    return configs;
  }),

  /** Get a single corridor's rate limit config */
  get: protectedProcedure
    .input(z.object({ corridor: z.string() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const rows = await db
        .select()
        .from(psCorridorRateLimits)
        .where(eq(psCorridorRateLimits.corridor, input.corridor));
      if (!rows[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: `No rate limit config for corridor ${input.corridor}` });
      }
      return rows[0];
    }),

  /** Create a new rate limit config for a corridor */
  create: adminProcedure
    .input(
      z.object({
        corridor: z.string().min(2).max(16),
        maxTxPerMinute: z.number().int().min(0).default(0),
        maxVolumePerDay: z.number().int().min(0).default(0),
        currency: z.string().length(3).default("USD"),
        isActive: z.boolean().default(true),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();

      // Check for duplicate
      const existing = await db
        .select({ id: psCorridorRateLimits.id })
        .from(psCorridorRateLimits)
        .where(eq(psCorridorRateLimits.corridor, input.corridor));
      if (existing[0]) {
        throw new TRPCError({ code: "CONFLICT", message: `Rate limit config already exists for corridor ${input.corridor}` });
      }

      const [created] = await db
        .insert(psCorridorRateLimits)
        .values({
          corridor: input.corridor,
          maxTxPerMinute: input.maxTxPerMinute,
          maxVolumePerDay: input.maxVolumePerDay,
          currency: input.currency.toUpperCase(),
          isActive: input.isActive,
          notes: input.notes,
          createdBy: ctx.user.name ?? ctx.user.openId,
          updatedBy: ctx.user.name ?? ctx.user.openId,
        })
        .returning();

      return created;
    }),

  /** Update an existing rate limit config */
  update: adminProcedure
    .input(
      z.object({
        corridor: z.string(),
        maxTxPerMinute: z.number().int().min(0).optional(),
        maxVolumePerDay: z.number().int().min(0).optional(),
        currency: z.string().length(3).optional(),
        isActive: z.boolean().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const { corridor, ...updates } = input;

      const existing = await db
        .select({ id: psCorridorRateLimits.id })
        .from(psCorridorRateLimits)
        .where(eq(psCorridorRateLimits.corridor, corridor));
      if (!existing[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: `No rate limit config for corridor ${corridor}` });
      }

      const [updated] = await db
        .update(psCorridorRateLimits)
        .set({
          ...updates,
          currency: updates.currency?.toUpperCase(),
          updatedBy: ctx.user.name ?? ctx.user.openId,
          updatedAt: Date.now(),
        })
        .where(eq(psCorridorRateLimits.corridor, corridor))
        .returning();

      return updated;
    }),

  /** Delete a rate limit config */
  delete: adminProcedure
    .input(z.object({ corridor: z.string() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      await db
        .delete(psCorridorRateLimits)
        .where(eq(psCorridorRateLimits.corridor, input.corridor));
      return { deleted: true, corridor: input.corridor };
    }),

  /** Get current window usage for a corridor */
  getUsage: protectedProcedure
    .input(z.object({ corridor: z.string() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const now = Date.now();
      const windowStart = Math.floor(now / 60_000) * 60_000;
      const dayWindowStart = Math.floor(now / 86_400_000) * 86_400_000;

      // Minute window usage
      const minuteRows = await db
        .select()
        .from(psCorridorRateLimitUsage)
        .where(
          and(
            eq(psCorridorRateLimitUsage.corridor, input.corridor),
            eq(psCorridorRateLimitUsage.windowStart, windowStart)
          )
        );

      // Day window usage (aggregate all rows in current day)
      const dayRows = await db
        .select()
        .from(psCorridorRateLimitUsage)
        .where(
          and(
            eq(psCorridorRateLimitUsage.corridor, input.corridor),
            gte(psCorridorRateLimitUsage.dayWindowStart, dayWindowStart)
          )
        );

      const totalVolumeToday = dayRows.reduce((sum: number, r: typeof dayRows[0]) => sum + (r.volumeSum ?? 0), 0);
      const totalTxToday = dayRows.reduce((sum: number, r: typeof dayRows[0]) => sum + (r.txCount ?? 0), 0);

      // Get config for limit display
      const configRows = await db
        .select()
        .from(psCorridorRateLimits)
        .where(eq(psCorridorRateLimits.corridor, input.corridor));

      const config = configRows[0];

      return {
        corridor: input.corridor,
        minuteWindow: {
          windowStart,
          txCount: minuteRows[0]?.txCount ?? 0,
          limit: config?.maxTxPerMinute ?? 0,
          utilizationPct:
            config?.maxTxPerMinute && config.maxTxPerMinute > 0
              ? Math.round(((minuteRows[0]?.txCount ?? 0) / config.maxTxPerMinute) * 100)
              : 0,
        },
        dayWindow: {
          dayWindowStart,
          txCount: totalTxToday,
          volumeSum: totalVolumeToday,
          currency: config?.currency ?? "USD",
          volumeLimit: config?.maxVolumePerDay ?? 0,
          utilizationPct:
            config?.maxVolumePerDay && config.maxVolumePerDay > 0
              ? Math.round((totalVolumeToday / config.maxVolumePerDay) * 100)
              : 0,
        },
        isActive: config?.isActive ?? false,
        configExists: !!config,
      };
    }),

  /** Reset usage counters for a corridor (clears all usage rows) */
  reset: adminProcedure
    .input(z.object({ corridor: z.string() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      await db
        .delete(psCorridorRateLimitUsage)
        .where(eq(psCorridorRateLimitUsage.corridor, input.corridor));
      return { reset: true, corridor: input.corridor, resetAt: Date.now() };
    }),

  /** Get all supported corridors with their current configs */
  listWithUsage: protectedProcedure.query(async () => {
    const db = await requireDb();
    const now = Date.now();
    const windowStart = Math.floor(now / 60_000) * 60_000;
    const dayWindowStart = Math.floor(now / 86_400_000) * 86_400_000;

    const configs = await db.select().from(psCorridorRateLimits);

    const usageRows = await db
      .select()
      .from(psCorridorRateLimitUsage)
      .where(gte(psCorridorRateLimitUsage.dayWindowStart, dayWindowStart));

    return RATE_LIMIT_CORRIDORS.map((corridor) => {
      const config = configs.find((c: typeof configs[0]) => c.corridor === corridor);
      const minuteUsage = usageRows.find(
        (u: typeof usageRows[0]) => u.corridor === corridor && u.windowStart === windowStart
      );
      const dayUsageRows = usageRows.filter((u: typeof usageRows[0]) => u.corridor === corridor);
      const totalVolumeToday = dayUsageRows.reduce((s: number, r: typeof usageRows[0]) => s + (r.volumeSum ?? 0), 0);
      const totalTxToday = dayUsageRows.reduce((s: number, r: typeof usageRows[0]) => s + (r.txCount ?? 0), 0);

      return {
        corridor,
        hasConfig: !!config,
        isActive: config?.isActive ?? false,
        maxTxPerMinute: config?.maxTxPerMinute ?? 0,
        maxVolumePerDay: config?.maxVolumePerDay ?? 0,
        currency: config?.currency ?? "USD",
        currentTxThisMinute: minuteUsage?.txCount ?? 0,
        currentVolumeToday: totalVolumeToday,
        currentTxToday: totalTxToday,
        txUtilizationPct:
          config?.maxTxPerMinute && config.maxTxPerMinute > 0
            ? Math.round(((minuteUsage?.txCount ?? 0) / config.maxTxPerMinute) * 100)
            : 0,
        volumeUtilizationPct:
          config?.maxVolumePerDay && config.maxVolumePerDay > 0
            ? Math.round((totalVolumeToday / config.maxVolumePerDay) * 100)
            : 0,
      };
    });
  }),
});
