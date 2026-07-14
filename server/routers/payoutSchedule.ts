/**
 * Payout Schedule Router
 * Lets merchants configure automatic payout frequency and preferred day.
 * A background job reads these schedules and initiates settlement batches.
 */
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { settlementWorkflow as startSettlementWorkflow } from "../_core/temporalWorkflows";
import { publishEvent, TOPICS } from "../_core/kafka";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { merchantPayoutSchedules } from "../../drizzle/schema";
import { TRPCError } from "@trpc/server";
import { createAuditLog, createUserNotification } from "../db";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Compute the next UTC timestamp when a schedule should fire. */
export function computeNextRunAt(
  frequency: "daily" | "weekly" | "monthly",
  preferredDay: number,
  fromMs = Date.now()
): number {
  const now = new Date(fromMs);
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );

  if (frequency === "daily") {
    // Next midnight UTC
    d.setUTCDate(d.getUTCDate() + 1);
    return d.getTime();
  }

  if (frequency === "weekly") {
    // preferredDay: 0=Sun … 6=Sat
    const currentDay = d.getUTCDay();
    const daysUntil = (preferredDay - currentDay + 7) % 7 || 7;
    d.setUTCDate(d.getUTCDate() + daysUntil);
    return d.getTime();
  }

  // monthly: preferredDay = 1–28
  const day = Math.min(Math.max(preferredDay, 1), 28);
  // Try this month first
  let candidate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), day));
  if (candidate.getTime() <= fromMs) {
    // Already past — use next month
    candidate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, day));
  }
  return candidate.getTime();
}

function requireMerchantOrAdmin(role: string) {
  if (role !== "merchant" && role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only merchants can manage payout schedules",
    });
  }
}

// ── Router ────────────────────────────────────────────────────────────────────

export const payoutScheduleRouter = router({
  /** Get the current merchant's payout schedule (or null if not configured). */
  get: protectedProcedure.query(async ({ ctx }) => {
    requireMerchantOrAdmin(ctx.user.role);
    const db = await getDb();
    if (!db) return null;
    const [row] = await db
      .select()
      .from(merchantPayoutSchedules)
      .where(eq(merchantPayoutSchedules.merchantId, ctx.user.id))
      .limit(1);
    return row ?? null;
  }),

  /** Create or update the merchant's payout schedule. */
  set: protectedProcedure
    .input(
      z.object({
        frequency: z.enum(["daily", "weekly", "monthly"]),
        preferredDay: z.number().int().min(0).max(28),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireMerchantOrAdmin(ctx.user.role);
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database unavailable",
        });

      const nextRunAt = new Date(
        computeNextRunAt(input.frequency, input.preferredDay)
      );

      const [existing] = await db
        .select({ id: merchantPayoutSchedules.id })
        .from(merchantPayoutSchedules)
        .where(eq(merchantPayoutSchedules.merchantId, ctx.user.id))
        .limit(1);

      if (existing) {
        await db
          .update(merchantPayoutSchedules)
          .set({
            frequency: input.frequency,
            preferredDay: input.preferredDay,
            nextRunAt,
            isActive: true,
            updatedAt: new Date(),
          })
          .where(eq(merchantPayoutSchedules.merchantId, ctx.user.id));
      } else {
        await db.insert(merchantPayoutSchedules).values({
          merchantId: ctx.user.id,
          frequency: input.frequency,
          preferredDay: input.preferredDay,
          nextRunAt,
          isActive: true,
        });
      }

      await createAuditLog({
        actorId: ctx.user.id,
        actorName: ctx.user.name ?? ctx.user.email ?? `User #${ctx.user.id}`,
        action: "payoutSchedule.set",
        entityType: "merchant_payout_schedule",
        entityId: String(ctx.user.id),
        after: input,
      });

      return {
        success: true,
        nextRunAt,
        message: `Payout schedule set to ${input.frequency}. Next run: ${nextRunAt.toUTCString()}.`,
      };
    }),

  /** Pause or resume the merchant's payout schedule. */
  toggle: protectedProcedure
    .input(z.object({ isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      requireMerchantOrAdmin(ctx.user.role);
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database unavailable",
        });

      const [existing] = await db
        .select()
        .from(merchantPayoutSchedules)
        .where(eq(merchantPayoutSchedules.merchantId, ctx.user.id))
        .limit(1);

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No payout schedule configured. Please set one first.",
        });
      }

      await db
        .update(merchantPayoutSchedules)
        .set({ isActive: input.isActive, updatedAt: new Date() })
        .where(eq(merchantPayoutSchedules.merchantId, ctx.user.id));

      const label = input.isActive ? "resumed" : "paused";
      await createUserNotification({
        userId: ctx.user.id,
        category: "wallet",
        title: `Payout schedule ${label}`,
        content: `Your automatic payout schedule has been ${label}.`,
      });

      return { success: true, isActive: input.isActive };
    }),
});
