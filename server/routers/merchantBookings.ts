/**
 * Merchant Bookings Router
 * Allows merchants to view and manage tourist bookings for their establishments.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb, withTransaction } from "../db";
import {
  touristBookings,
  establishments,
  users,
} from "../../drizzle/schema";
import { eq, and, desc, count, sql, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createAuditLog, createUserNotification } from "../db";
import crypto from "crypto";

async function requireMerchantEstablishment(userId: number, establishmentId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  const [est] = await db
    .select({ id: establishments.id, ownerId: establishments.ownerId, name: establishments.name })
    .from(establishments)
    .where(eq(establishments.id, establishmentId))
    .limit(1);
  if (!est) throw new TRPCError({ code: "NOT_FOUND", message: "Establishment not found" });
  if (est.ownerId !== userId) throw new TRPCError({ code: "FORBIDDEN", message: "Not your establishment" });
  return { db, est };
}

export const merchantBookingsRouter = router({

  // ── Summary stats for the booking inbox ────────────────────────────────────

  getStats: protectedProcedure
    .input(z.object({ establishmentId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const { db } = await requireMerchantEstablishment(ctx.user.id, input.establishmentId);
      const rows = await db
        .select({
          status: touristBookings.status,
          cnt: count(touristBookings.id),
        })
        .from(touristBookings)
        .where(eq(touristBookings.establishmentId, input.establishmentId))
        .groupBy(touristBookings.status);

      const stats = { total: 0, pending: 0, confirmed: 0, checkedIn: 0, completed: 0, cancelled: 0, noShow: 0 };
      for (const r of rows) {
        const c = Number(r.cnt);
        stats.total += c;
        if (r.status === "pending") stats.pending = c;
        else if (r.status === "confirmed") stats.confirmed = c;
        else if (r.status === "completed") stats.completed = c;
        else if (r.status === "cancelled") stats.cancelled = c;
        else if (r.status === "no_show") stats.noShow = c;
      }

      // Revenue from completed bookings
      const revenueRow = await db
        .select({ total: sql<string>`COALESCE(SUM(price_usd::numeric), 0)` })
        .from(touristBookings)
        .where(and(
          eq(touristBookings.establishmentId, input.establishmentId),
          eq(touristBookings.status, "completed")
        ));
      stats.total; // already set
      return { ...stats, completedRevenue: parseFloat(revenueRow[0]?.total ?? "0") };
    }),

  // ── List bookings with tourist details ─────────────────────────────────────

  listBookings: protectedProcedure
    .input(z.object({
      establishmentId: z.number().int().positive(),
      status: z.enum(["pending", "confirmed", "completed", "cancelled", "no_show", "all"]).default("all"),
      limit: z.number().int().min(1).max(100).default(30),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const { db } = await requireMerchantEstablishment(ctx.user.id, input.establishmentId);

      const conditions = [eq(touristBookings.establishmentId, input.establishmentId)];
      if (input.status !== "all") conditions.push(eq(touristBookings.status, input.status));

      const bookings = await db
        .select({
          id: touristBookings.id,
          userId: touristBookings.userId,
          serviceType: touristBookings.serviceType,
          serviceName: touristBookings.serviceName,
          bookingDate: touristBookings.bookingDate,
          partySize: touristBookings.partySize,
          priceUsd: touristBookings.priceUsd,
          currency: touristBookings.currency,
          status: touristBookings.status,
          notes: touristBookings.notes,
          confirmationCode: touristBookings.confirmationCode,
          createdAt: touristBookings.createdAt,
          updatedAt: touristBookings.updatedAt,
          touristName: users.name,
          touristEmail: users.email,
        })
        .from(touristBookings)
        .leftJoin(users, eq(touristBookings.userId, users.id))
        .where(and(...conditions))
        .orderBy(desc(touristBookings.bookingDate))
        .limit(input.limit)
        .offset(input.offset);

      const [totalRow] = await db
        .select({ cnt: count(touristBookings.id) })
        .from(touristBookings)
        .where(and(...conditions));

      return { bookings, total: Number(totalRow?.cnt ?? 0) };
    }),

  // ── Update booking status ───────────────────────────────────────────────────

  updateStatus: protectedProcedure
    .input(z.object({
      bookingId: z.number().int().positive(),
      establishmentId: z.number().int().positive(),
      status: z.enum(["confirmed", "completed", "cancelled", "no_show"]),
      notes: z.string().max(512).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db } = await requireMerchantEstablishment(ctx.user.id, input.establishmentId);

      const [booking] = await db
        .select()
        .from(touristBookings)
        .where(and(
          eq(touristBookings.id, input.bookingId),
          eq(touristBookings.establishmentId, input.establishmentId)
        ))
        .limit(1);

      if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found" });

      // Validate allowed status transitions
      const allowed: Record<string, string[]> = {
        pending: ["confirmed", "cancelled"],
        confirmed: ["completed", "cancelled", "no_show"],
        completed: [],
        cancelled: [],
        no_show: [],
      };
      if (!allowed[booking.status]?.includes(input.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot transition from "${booking.status}" to "${input.status}"`,
        });
      }

      // Overbooking prevention: check capacity before confirming
      if (input.status === "confirmed" && booking.bookingDate) {
        const bookingDateStr = typeof booking.bookingDate === "string"
          ? booking.bookingDate
          : new Date(booking.bookingDate).toISOString().slice(0, 10);
        const confirmedOnDate = await db
          .select({ totalGuests: sql<number>`COALESCE(SUM(party_size), 0)` })
          .from(touristBookings)
          .where(and(
            eq(touristBookings.establishmentId, input.establishmentId),
            eq(touristBookings.status, "confirmed"),
            sql`CAST(booking_date AS TEXT) LIKE ${bookingDateStr + '%'}`,
          ));
        const currentGuests = Number(confirmedOnDate[0]?.totalGuests ?? 0);
        // Use establishment max capacity (default 100 if not set)
        const [est] = await db.select().from(establishments).where(eq(establishments.id, input.establishmentId)).limit(1);
        const maxCapacity = Number((est as any)?.maxCapacity ?? 100);
        if (currentGuests + (booking.partySize ?? 1) > maxCapacity) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `Cannot confirm: capacity exceeded for ${bookingDateStr}. Current: ${currentGuests} guests, attempting to add ${booking.partySize ?? 1}, max: ${maxCapacity}.`,
          });
        }
      }

      const updateData: Record<string, unknown> = {
        status: input.status,
        updatedAt: new Date(),
      };
      if (input.notes) updateData.notes = input.notes;

      const [updated] = await db
        .update(touristBookings)
        .set(updateData)
        .where(eq(touristBookings.id, input.bookingId))
        .returning();

      // On completion: credit merchant wallet + create settlement entry
      if (input.status === "completed" && booking.priceUsd) {
        const priceUsd = parseFloat(booking.priceUsd);
        const platformFee = Math.round(priceUsd * 0.03 * 100) / 100; // 3% platform fee
        const merchantCredit = priceUsd - platformFee;

        try {
          // Credit merchant wallet
          const merchantOwnerId = (await db.select({ ownerId: establishments.ownerId }).from(establishments).where(eq(establishments.id, input.establishmentId)).limit(1))[0]?.ownerId;
          if (merchantOwnerId) {
            await withTransaction(async (tx) => {
              const [bal] = await tx`
                SELECT id, balance FROM wallet_balances WHERE user_id = ${String(merchantOwnerId)} AND currency = ${booking.currency ?? 'USDC'} FOR UPDATE
              `;
              if (bal) {
                await tx`UPDATE wallet_balances SET balance = ${String(parseFloat(bal.balance) + merchantCredit)}, updated_at = ${Date.now()} WHERE id = ${bal.id}`;
              } else {
                await tx`INSERT INTO wallet_balances (id, user_id, currency, balance, locked_balance, wallet_address, network, created_at, updated_at)
                  VALUES (${crypto.randomUUID()}, ${String(merchantOwnerId)}, ${booking.currency ?? 'USDC'}, ${String(merchantCredit)}, '0',
                    ${'tp_merchant_' + String(merchantOwnerId).slice(0, 8)}, 'Stellar / Ethereum', ${Date.now()}, ${Date.now()})`;
              }
              await tx`INSERT INTO wallet_transactions (id, user_id, type, status, from_currency, to_currency, amount, fee, reference, note, completed_at, created_at)
                VALUES (${crypto.randomUUID()}, ${String(merchantOwnerId)}, 'deposit', 'completed', ${booking.currency ?? 'USDC'}, ${booking.currency ?? 'USDC'},
                  ${String(merchantCredit)}, ${String(platformFee)}, ${'BOOKING_REVENUE:' + booking.confirmationCode},
                  ${'Revenue from booking: ' + booking.serviceName + ' ($' + priceUsd + ' - $' + platformFee + ' fee)'},
                  ${Date.now()}, ${Date.now()})`;
            });

            // Create settlement batch entry
            await db.execute(sql`
              INSERT INTO settlement_batches (id, status, total_amount, currency, merchant_count, transaction_count, initiated_by, notes, created_at, updated_at)
              VALUES (${crypto.randomUUID()}, 'completed', ${String(merchantCredit)}, ${booking.currency ?? 'USDC'}, 1, 1,
                ${ctx.user.id}, ${'Auto-settlement for booking #' + booking.confirmationCode}, ${Date.now()}, ${Date.now()})
            `);

            // Notify merchant
            createUserNotification({
              userId: merchantOwnerId,
              category: "system",
              title: "Payment Received",
              content: `$${merchantCredit.toFixed(2)} ${booking.currency ?? 'USDC'} credited for completed booking "${booking.serviceName}". Platform fee: $${platformFee.toFixed(2)}.`,
              actionUrl: "/merchant/revenue",
              actionLabel: "View Revenue",
            }).catch(() => {});
          }
        } catch { /* settlement non-critical — booking still marked completed */ }
      }

      // Notify booking owner about status change
      try {
        const { notifyOwner } = await import("../_core/notification");
        await notifyOwner({
          title: `Booking ${input.status.replace("_", " ")}: ${booking.serviceName}`,
          content: `Booking #${booking.confirmationCode} for "${booking.serviceName}" (party of ${booking.partySize}) has been updated to: ${input.status}. Revenue: $${booking.priceUsd}.`,
        });
      } catch { /* non-critical */ }

      // Notify tourist about completion
      if (input.status === "completed") {
        createUserNotification({
          userId: booking.userId,
          category: "system",
          title: "Booking Completed",
          content: `Your booking "${booking.serviceName}" has been completed. Thank you for visiting!`,
          actionUrl: "/tourist",
          actionLabel: "Leave a Review",
        }).catch(() => {});
      }

      createAuditLog({
        actorId: ctx.user.id,
        action: `merchant.booking.${input.status}`,
        entityType: "booking",
        entityId: String(input.bookingId),
        description: `Booking #${booking.confirmationCode} status: ${booking.status} → ${input.status}`,
      }).catch(() => {});

      return updated;
    }),

  // ── Bulk status update ──────────────────────────────────────────────────────

  bulkUpdateStatus: protectedProcedure
    .input(z.object({
      establishmentId: z.number().int().positive(),
      bookingIds: z.array(z.number().int().positive()).min(1).max(50),
      status: z.enum(["confirmed", "cancelled", "no_show"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db } = await requireMerchantEstablishment(ctx.user.id, input.establishmentId);

      const updated = await db
        .update(touristBookings)
        .set({ status: input.status as "confirmed" | "cancelled" | "no_show", updatedAt: new Date() })
        .where(and(
          inArray(touristBookings.id, input.bookingIds),
          eq(touristBookings.establishmentId, input.establishmentId)
        ))
        .returning({ id: touristBookings.id });

      return { updatedCount: updated.length };
    }),

  // ── Get a single booking detail ─────────────────────────────────────────────

  getBooking: protectedProcedure
    .input(z.object({
      bookingId: z.number().int().positive(),
      establishmentId: z.number().int().positive(),
    }))
    .query(async ({ ctx, input }) => {
      const { db } = await requireMerchantEstablishment(ctx.user.id, input.establishmentId);

      const [booking] = await db
        .select({
          id: touristBookings.id,
          userId: touristBookings.userId,
          serviceType: touristBookings.serviceType,
          serviceName: touristBookings.serviceName,
          bookingDate: touristBookings.bookingDate,
          partySize: touristBookings.partySize,
          priceUsd: touristBookings.priceUsd,
          currency: touristBookings.currency,
          status: touristBookings.status,
          notes: touristBookings.notes,
          confirmationCode: touristBookings.confirmationCode,
          createdAt: touristBookings.createdAt,
          touristName: users.name,
          touristEmail: users.email,
        })
        .from(touristBookings)
        .leftJoin(users, eq(touristBookings.userId, users.id))
        .where(and(
          eq(touristBookings.id, input.bookingId),
          eq(touristBookings.establishmentId, input.establishmentId)
        ))
        .limit(1);

      if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found" });
      return booking;
    }),

  // ── Reschedule a booking (conflict resolution) ───────────────────────────────

  rescheduleBooking: protectedProcedure
    .input(z.object({
      bookingId: z.number().int().positive(),
      establishmentId: z.number().int().positive(),
      newBookingDate: z.string(), // ISO datetime string
      notes: z.string().max(1024).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db } = await requireMerchantEstablishment(ctx.user.id, input.establishmentId);

      const [booking] = await db
        .select()
        .from(touristBookings)
        .where(and(
          eq(touristBookings.id, input.bookingId),
          eq(touristBookings.establishmentId, input.establishmentId)
        ))
        .limit(1);

      if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found" });
      if (booking.status === "cancelled" || booking.status === "completed") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot reschedule a ${booking.status} booking` });
      }

      const newDate = new Date(input.newBookingDate);
      if (isNaN(newDate.getTime())) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid date format" });
      }

      const [updated] = await db
        .update(touristBookings)
        .set({
          bookingDate: newDate,
          notes: input.notes !== undefined ? input.notes : booking.notes,
          updatedAt: new Date(),
        })
        .where(eq(touristBookings.id, input.bookingId))
        .returning();

      return updated;
    }),

  /**
   * Toggle the 24h reminder notification for a specific booking.
   */
  toggleReminderEnabled: protectedProcedure
    .input(z.object({
      bookingId: z.number().int().positive(),
      establishmentId: z.number().int().positive(),
      enabled: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db } = await requireMerchantEstablishment(ctx.user.id, input.establishmentId);

      const [booking] = await db
        .select({ id: touristBookings.id })
        .from(touristBookings)
        .where(and(
          eq(touristBookings.id, input.bookingId),
          eq(touristBookings.establishmentId, input.establishmentId)
        ))
        .limit(1);
      if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found" });

      const [updated] = await db
        .update(touristBookings)
        .set({ reminderEnabled: input.enabled })
        .where(eq(touristBookings.id, input.bookingId))
        .returning({ id: touristBookings.id, reminderEnabled: touristBookings.reminderEnabled });

      return { id: updated.id, reminderEnabled: updated.reminderEnabled };
    }),
});
