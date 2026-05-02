/**
 * exchangeRateOverrides router — admin-managed exchange rate overrides.
 *
 * Admins can set a manual rate for any currency pair that takes precedence
 * over the live API rate for a configurable duration.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { exchangeRateOverrides } from "../../drizzle/schema";

const SUPPORTED_CURRENCIES = [
  "USD", "EUR", "GBP", "NGN", "KES", "ZAR", "GHS", "TZS", "EGP",
  "MAD", "XOF", "XAF", "UGX", "ETB", "RWF", "MZN", "BWP", "MUR",
] as const;

type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number];

function adminGuard(role: string) {
  if (role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
}

export const exchangeRateOverridesRouter = router({
  /** List all overrides (admin only) */
  list: protectedProcedure.query(async ({ ctx }) => {
    adminGuard(ctx.user.role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    const rows = await db
      .select()
      .from(exchangeRateOverrides)
      .orderBy(desc(exchangeRateOverrides.createdAt));

    const now = Date.now();
    return rows.map((r) => ({
      ...r,
      isExpired: r.expiresAt != null && r.expiresAt < now,
      effectiveRate: parseFloat(r.rate),
    }));
  }),

  /** Get the active override rate for a currency pair (public — used by ExchangeRateIndicator) */
  getActive: protectedProcedure
    .input(z.object({
      baseCurrency: z.string().default("USD"),
      targetCurrency: z.string(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const now = Date.now();
      const rows = await db
        .select()
        .from(exchangeRateOverrides)
        .where(
          and(
            eq(exchangeRateOverrides.baseCurrency, input.baseCurrency.toUpperCase()),
            eq(exchangeRateOverrides.targetCurrency, input.targetCurrency.toUpperCase()),
            eq(exchangeRateOverrides.isActive, true),
          )
        )
        .orderBy(desc(exchangeRateOverrides.createdAt))
        .limit(1);

      if (!rows.length) return null;
      const override = rows[0];
      // Return null if expired
      if (override.expiresAt != null && override.expiresAt < now) return null;
      return {
        id: override.id,
        baseCurrency: override.baseCurrency,
        targetCurrency: override.targetCurrency,
        rate: parseFloat(override.rate),
        reason: override.reason,
        expiresAt: override.expiresAt,
      };
    }),

  /** Create or update an override (admin only) */
  upsert: protectedProcedure
    .input(z.object({
      baseCurrency: z.string().default("USD"),
      targetCurrency: z.string().min(2).max(10),
      rate: z.number().positive(),
      reason: z.string().max(500).optional(),
      durationHours: z.number().int().positive().max(8760).optional(), // max 1 year
    }))
    .mutation(async ({ ctx, input }) => {
      adminGuard(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const base = input.baseCurrency.toUpperCase();
      const target = input.targetCurrency.toUpperCase();
      const expiresAt = input.durationHours
        ? Date.now() + input.durationHours * 60 * 60 * 1000
        : null;
      const now = Date.now();

      // Deactivate any existing active override for this pair
      await db
        .update(exchangeRateOverrides)
        .set({ isActive: false, updatedAt: now })
        .where(
          and(
            eq(exchangeRateOverrides.baseCurrency, base),
            eq(exchangeRateOverrides.targetCurrency, target),
            eq(exchangeRateOverrides.isActive, true),
          )
        );

      // Insert new override
      const [row] = await db
        .insert(exchangeRateOverrides)
        .values({
          baseCurrency: base,
          targetCurrency: target,
          rate: String(input.rate),
          reason: input.reason ?? null,
          isActive: true,
          expiresAt: expiresAt ?? undefined,
          createdByUserId: ctx.user.id,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return { id: row.id, rate: parseFloat(row.rate), expiresAt };
    }),

  /** Deactivate an override (admin only) */
  deactivate: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      adminGuard(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      await db
        .update(exchangeRateOverrides)
        .set({ isActive: false, updatedAt: Date.now() })
        .where(eq(exchangeRateOverrides.id, input.id));

      return { success: true };
    }),

  /** Delete an override permanently (admin only) */
  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      adminGuard(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      await db
        .delete(exchangeRateOverrides)
        .where(eq(exchangeRateOverrides.id, input.id));

      return { success: true };
    }),

  /** Get list of supported currencies */
  supportedCurrencies: protectedProcedure.query(() => {
    return SUPPORTED_CURRENCIES as readonly SupportedCurrency[];
  }),
});
