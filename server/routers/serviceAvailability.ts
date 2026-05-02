/**
 * serviceAvailability router
 *
 * Manages per-date slot availability for merchant products/services.
 * Merchants can set total slots, block dates, and add notes for each date.
 * The calendar UI reads this data to show availability at a glance.
 *
 * Round 111: Initial implementation.
 */
import { z } from "zod";
import { and, between, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { serviceAvailability, merchantProducts, establishments } from "../../drizzle/schema";

// ── Ownership helpers ─────────────────────────────────────────────────────────

async function assertEstablishmentOwner(userId: number, establishmentId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  const [est] = await db
    .select({ ownerId: establishments.ownerId })
    .from(establishments)
    .where(eq(establishments.id, establishmentId))
    .limit(1);
  if (!est) throw new TRPCError({ code: "NOT_FOUND", message: "Establishment not found" });
  if (est.ownerId !== userId) throw new TRPCError({ code: "FORBIDDEN", message: "Not your establishment" });
}

async function assertProductOwner(userId: number, productId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  const [row] = await db
    .select({ ownerId: establishments.ownerId, establishmentId: merchantProducts.establishmentId })
    .from(merchantProducts)
    .innerJoin(establishments, eq(merchantProducts.establishmentId, establishments.id))
    .where(eq(merchantProducts.id, productId))
    .limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found" });
  if (row.ownerId !== userId) throw new TRPCError({ code: "FORBIDDEN", message: "Not your product" });
  return row.establishmentId;
}

// ── Date helpers ──────────────────────────────────────────────────────────────

/** Returns an array of YYYY-MM-DD strings for all days in [startDate, endDate] inclusive */
function dateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const start = new Date(startDate + "T00:00:00Z");
  const end = new Date(endDate + "T00:00:00Z");
  const cur = new Date(start);
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

// ── Router ────────────────────────────────────────────────────────────────────

export const serviceAvailabilityRouter = router({
  /**
   * Get availability for a product over a date range (e.g., one calendar month).
   * Returns one record per date that has an explicit availability entry.
   * Dates without a record are implicitly "unlimited / open".
   */
  getByProduct: protectedProcedure
    .input(
      z.object({
        productId: z.number().int().positive(),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertProductOwner(ctx.user.id, input.productId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      return db
        .select()
        .from(serviceAvailability)
        .where(
          and(
            eq(serviceAvailability.productId, input.productId),
            between(serviceAvailability.date, input.startDate, input.endDate)
          )
        )
        .orderBy(serviceAvailability.date);
    }),

  /**
   * Get availability for all products of an establishment over a date range.
   * Used by the calendar overview page.
   */
  getByEstablishment: protectedProcedure
    .input(
      z.object({
        establishmentId: z.number().int().positive(),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertEstablishmentOwner(ctx.user.id, input.establishmentId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      // Also return the product names for display
      const rows = await db
        .select({
          id: serviceAvailability.id,
          productId: serviceAvailability.productId,
          productName: merchantProducts.name,
          date: serviceAvailability.date,
          totalSlots: serviceAvailability.totalSlots,
          bookedSlots: serviceAvailability.bookedSlots,
          isBlocked: serviceAvailability.isBlocked,
          notes: serviceAvailability.notes,
        })
        .from(serviceAvailability)
        .innerJoin(merchantProducts, eq(serviceAvailability.productId, merchantProducts.id))
        .where(
          and(
            eq(serviceAvailability.establishmentId, input.establishmentId),
            between(serviceAvailability.date, input.startDate, input.endDate)
          )
        )
        .orderBy(serviceAvailability.date, merchantProducts.name);
      return rows;
    }),

  /**
   * Upsert availability for a single product on a single date.
   * Creates the record if it doesn't exist, updates it if it does.
   */
  setDate: protectedProcedure
    .input(
      z.object({
        productId: z.number().int().positive(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
        totalSlots: z.number().int().min(0).default(0),
        isBlocked: z.boolean().default(false),
        notes: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const establishmentId = await assertProductOwner(ctx.user.id, input.productId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [row] = await db
        .insert(serviceAvailability)
        .values({
          productId: input.productId,
          establishmentId,
          date: input.date,
          totalSlots: input.totalSlots,
          bookedSlots: 0,
          isBlocked: input.isBlocked,
          notes: input.notes ?? null,
        })
        .onConflictDoUpdate({
          target: [serviceAvailability.productId, serviceAvailability.date],
          set: {
            totalSlots: input.totalSlots,
            isBlocked: input.isBlocked,
            notes: input.notes ?? null,
            updatedAt: new Date(),
          },
        })
        .returning();
      return row;
    }),

  /**
   * Bulk-set availability for a product over a date range (e.g., set all Mondays in a month).
   * Overwrites any existing records in the range.
   */
  bulkSetRange: protectedProcedure
    .input(
      z.object({
        productId: z.number().int().positive(),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
        totalSlots: z.number().int().min(0).default(0),
        isBlocked: z.boolean().default(false),
        notes: z.string().max(500).optional(),
        /** Optional: only apply to specific weekdays (0=Sun, 1=Mon, ... 6=Sat). Empty = all days. */
        weekdays: z.array(z.number().int().min(0).max(6)).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const establishmentId = await assertProductOwner(ctx.user.id, input.productId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const allDates = dateRange(input.startDate, input.endDate);
      const filteredDates = input.weekdays?.length
        ? allDates.filter((d) => {
            const day = new Date(d + "T00:00:00Z").getUTCDay();
            return input.weekdays!.includes(day);
          })
        : allDates;

      if (filteredDates.length === 0) return { updated: 0 };
      if (filteredDates.length > 366) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Date range too large (max 366 days)" });
      }

      const values = filteredDates.map((date) => ({
        productId: input.productId,
        establishmentId,
        date,
        totalSlots: input.totalSlots,
        bookedSlots: 0,
        isBlocked: input.isBlocked,
        notes: input.notes ?? null,
      }));

      await db
        .insert(serviceAvailability)
        .values(values)
        .onConflictDoUpdate({
          target: [serviceAvailability.productId, serviceAvailability.date],
          set: {
            totalSlots: input.totalSlots,
            isBlocked: input.isBlocked,
            notes: input.notes ?? null,
            updatedAt: new Date(),
          },
        });

      return { updated: filteredDates.length };
    }),

  /**
   * Block a date range for a product (convenience wrapper around bulkSetRange).
   */
  blockRange: protectedProcedure
    .input(
      z.object({
        productId: z.number().int().positive(),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
        notes: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const establishmentId = await assertProductOwner(ctx.user.id, input.productId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const dates = dateRange(input.startDate, input.endDate);
      if (dates.length > 366) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Date range too large (max 366 days)" });
      }

      const values = dates.map((date) => ({
        productId: input.productId,
        establishmentId,
        date,
        totalSlots: 0,
        bookedSlots: 0,
        isBlocked: true,
        notes: input.notes ?? null,
      }));

      await db
        .insert(serviceAvailability)
        .values(values)
        .onConflictDoUpdate({
          target: [serviceAvailability.productId, serviceAvailability.date],
          set: {
            isBlocked: true,
            notes: input.notes ?? null,
            updatedAt: new Date(),
          },
        });

      return { blocked: dates.length };
    }),

  /**
   * Unblock / clear availability records for a date range.
   * Removes the explicit records so the dates revert to "unlimited / open".
   */
  clearRange: protectedProcedure
    .input(
      z.object({
        productId: z.number().int().positive(),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertProductOwner(ctx.user.id, input.productId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const dates = dateRange(input.startDate, input.endDate);
      if (dates.length === 0) return { cleared: 0 };

      await db
        .delete(serviceAvailability)
        .where(
          and(
            eq(serviceAvailability.productId, input.productId),
            inArray(serviceAvailability.date, dates)
          )
        );

      return { cleared: dates.length };
    }),

  /**
   * Public: Get aggregated availability summary for a list of establishments on a given date.
   * Returns availability status (available / limited / full / blocked / none) per establishment.
   * Used by TouristExperience to show slot indicators on cards and map pins.
   */
  getEstablishmentAvailabilitySummary: publicProcedure
    .input(
      z.object({
        establishmentIds: z.array(z.number().int().positive()).max(100),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
      })
    )
    .query(async ({ input }) => {
      if (input.establishmentIds.length === 0) return {};
      const db = await getDb();
      if (!db) return {};

      // Aggregate across all products for each establishment on the given date
      const rows = await db
        .select({
          establishmentId: serviceAvailability.establishmentId,
          totalSlots: serviceAvailability.totalSlots,
          bookedSlots: serviceAvailability.bookedSlots,
          isBlocked: serviceAvailability.isBlocked,
        })
        .from(serviceAvailability)
        .where(
          and(
            inArray(serviceAvailability.establishmentId, input.establishmentIds),
            eq(serviceAvailability.date, input.date)
          )
        );

      // Aggregate per establishment
      const summary: Record<number, { status: "available" | "limited" | "full" | "blocked" | "none"; totalSlots: number; availableSlots: number }> = {};

      for (const estId of input.establishmentIds) {
        const estRows = rows.filter((r) => r.establishmentId === estId);
        if (estRows.length === 0) {
          summary[estId] = { status: "none", totalSlots: 0, availableSlots: 0 };
          continue;
        }
        const anyBlocked = estRows.some((r) => r.isBlocked);
        const totalSlots = estRows.reduce((s, r) => s + (r.totalSlots ?? 0), 0);
        const bookedSlots = estRows.reduce((s, r) => s + (r.bookedSlots ?? 0), 0);
        const availableSlots = Math.max(0, totalSlots - bookedSlots);
        let status: "available" | "limited" | "full" | "blocked" | "none";
        if (anyBlocked) {
          status = "blocked";
        } else if (totalSlots === 0) {
          status = "none";
        } else if (availableSlots === 0) {
          status = "full";
        } else if (availableSlots / totalSlots <= 0.25) {
          status = "limited";
        } else {
          status = "available";
        }
        summary[estId] = { status, totalSlots, availableSlots };
      }

      return summary;
    }),
});
