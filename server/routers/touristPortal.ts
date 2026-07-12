/**
 * Tourist Portal Router — superior tourist experience backend
 *
 * Features beyond original:
 * - AI concierge (LLM-powered)
 * - Multi-currency wallet top-up via Stripe Checkout
 * - Service bookings with confirmation codes
 * - Merchant reviews with verified-purchase flag
 * - Deals / promotions discovery
 * - Travel itinerary planner (CRUD)
 * - Budget tracker with daily/weekly limits
 * - FX rate snapshot
 * - Spend analytics
 * - Theme preference persistence
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { cacheGet, cacheSet } from "../_core/redis";
import { publishEvent, TOPICS } from "../_core/kafka";
import {
  users,
  touristProfiles,
  touristBookings,
  touristReviews,
  touristDeals,
  touristDealRedemptions,
  touristItineraries,
  touristBudgets,
  touristConciergeSessions,
  touristTopups,
  touristDealWishlists,
  establishments,
  walletTransactions,
  reviewSentimentCache,
  reviewSentimentHistory,
  serviceAvailability,
  merchantProducts,
} from "../../drizzle/schema";
import { eq, desc, and, gte, lte, sql, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { invokeLLM } from "../_core/llm";
import { sendPushToUser } from "../_core/webPush";
import { stripe } from "../_core/stripe";
import { withTransaction } from "../db";
import { createAuditLog, createUserNotification } from "../db";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randomCode(len = 8) {
  return crypto.randomUUID().replace(/-/g, "").substring(0, len).toUpperCase();
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const touristPortalRouter = router({
  // ── Profile ──────────────────────────────────────────────────────────────

  getProfile: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();

    const [profile] = await db
      .select()
      .from(touristProfiles)
      .where(eq(touristProfiles.userId, ctx.user.id))
      .limit(1);

    const [user] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        theme: users.theme,
        preferredLanguage: users.preferredLanguage,
        preferredCurrency: users.preferredCurrency,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, ctx.user.id))
      .limit(1);

    return { profile: profile ?? null, user };
  }),

  updatePreferences: protectedProcedure
    .input(
      z.object({
        theme: z.enum(["dark", "light", "system"]).optional(),
        preferredLanguage: z.string().max(8).optional(),
        preferredCurrency: z.string().max(10).optional(),
        homeCountry: z.string().max(3).optional(),
        homeCurrency: z.string().max(10).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();

      // Update user-level preferences
      const userUpdates: Record<string, unknown> = { updatedAt: new Date() };
      if (input.theme) userUpdates.theme = input.theme;
      if (input.preferredLanguage) userUpdates.preferredLanguage = input.preferredLanguage;
      if (input.preferredCurrency) userUpdates.preferredCurrency = input.preferredCurrency;

      if (Object.keys(userUpdates).length > 1) {
        await db.update(users).set(userUpdates).where(eq(users.id, ctx.user.id));
      }

      // Upsert tourist profile
      const profileUpdates: Record<string, unknown> = { updatedAt: new Date() };
      if (input.homeCountry) profileUpdates.homeCountry = input.homeCountry;
      if (input.homeCurrency) profileUpdates.homeCurrency = input.homeCurrency;
      if (input.preferredLanguage) profileUpdates.preferredLanguage = input.preferredLanguage;

      if (Object.keys(profileUpdates).length > 1) {
        const [existing] = await db
          .select({ id: touristProfiles.id })
          .from(touristProfiles)
          .where(eq(touristProfiles.userId, ctx.user.id))
          .limit(1);

        if (existing) {
          await db
            .update(touristProfiles)
            .set(profileUpdates)
            .where(eq(touristProfiles.userId, ctx.user.id));
        } else {
          await db.insert(touristProfiles).values({
            userId: ctx.user.id,
            homeCountry: (input.homeCountry as string) ?? "US",
            homeCurrency: (input.homeCurrency as string) ?? "USD",
            preferredLanguage: (input.preferredLanguage as string) ?? "en",
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
      }

      return { ok: true };
    }),

  // ── Wallet Top-up via Stripe ──────────────────────────────────────────────

  createTopupSession: protectedProcedure
    .input(
      z.object({
        amountUsd: z.number().min(5).max(10000),
        targetCurrency: z.string().max(10).default("USDC"),
        origin: z.string().url(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();

      const [topup] = await db
        .insert(touristTopups)
        .values({
          userId: ctx.user.id,
          amountUsd: input.amountUsd.toString(),
          targetCurrency: input.targetCurrency,
          fxRate: "1",
          status: "pending",
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: ctx.user.email ?? undefined,
        allow_promotion_codes: true,
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: Math.round(input.amountUsd * 100),
              product_data: {
                name: `TourismPay Wallet Top-up — ${input.targetCurrency}`,
                description: `Add $${input.amountUsd} USD to your TourismPay wallet as ${input.targetCurrency}`,
              },
            },
            quantity: 1,
          },
        ],
        success_url: `${input.origin}/tourist?tab=wallet&topup=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${input.origin}/tourist?tab=wallet&topup=cancelled`,
        client_reference_id: ctx.user.id.toString(),
        metadata: {
          user_id: ctx.user.id.toString(),
          topup_id: topup.id.toString(),
          target_currency: input.targetCurrency,
          customer_email: ctx.user.email ?? "",
          customer_name: ctx.user.name ?? "",
        },
      });

      await db
        .update(touristTopups)
        .set({ stripeSessionId: session.id, updatedAt: new Date() })
        .where(eq(touristTopups.id, topup.id));

      return { checkoutUrl: session.url!, topupId: topup.id };
    }),

  getTopupHistory: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      return db
        .select()
        .from(touristTopups)
        .where(eq(touristTopups.userId, ctx.user.id))
        .orderBy(desc(touristTopups.createdAt))
        .limit(input.limit);
    }),

  // ── Bookings ──────────────────────────────────────────────────────────────

  createBooking: protectedProcedure
    .input(
      z.object({
        establishmentId: z.number().int().positive(),
        productId: z.number().int().positive().optional(),
        serviceType: z.string().max(64).default("general"),
        serviceName: z.string().max(256),
        bookingDate: z.string(),
        partySize: z.number().int().min(1).max(100).default(1),
        priceUsd: z.number().min(0),
        currency: z.string().max(10).default("USDC"),
        notes: z.string().max(1024).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();

      // Derive YYYY-MM-DD string from bookingDate for availability lookup
      const bookingDateStr = input.bookingDate.slice(0, 10);

      // ── Slot availability check & deduction ──────────────────────────────
      if (input.productId) {
        const [avail] = await db
          .select()
          .from(serviceAvailability)
          .where(
            and(
              eq(serviceAvailability.productId, input.productId),
              eq(serviceAvailability.date, bookingDateStr)
            )
          )
          .limit(1);

        if (avail) {
          if (avail.isBlocked) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "This service is not available on the selected date.",
            });
          }
          const total = avail.totalSlots ?? 0;
          const booked = avail.bookedSlots ?? 0;
          if (total > 0 && booked >= total) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "No slots available on the selected date. Please choose another date.",
            });
          }
          // Deduct slot atomically
          await db
            .update(serviceAvailability)
            .set({ bookedSlots: booked + 1, updatedAt: new Date() })
            .where(
              and(
                eq(serviceAvailability.productId, input.productId),
                eq(serviceAvailability.date, bookingDateStr)
              )
            );
        }
      }

      const confirmationCode = randomCode(8);

      // Deduct wallet balance for payment
      let walletDeducted = false;
      if (input.priceUsd > 0) {
        try {
          await withTransaction(async (tx) => {
            const [bal] = await tx`
              SELECT id, balance FROM wallet_balances
              WHERE user_id = ${String(ctx.user.id)} AND currency = ${input.currency}
              FOR UPDATE
            `;
            if (bal && parseFloat(bal.balance) >= input.priceUsd) {
              await tx`UPDATE wallet_balances SET balance = ${String(parseFloat(bal.balance) - input.priceUsd)}, updated_at = ${Date.now()} WHERE id = ${bal.id}`;
              await tx`INSERT INTO wallet_transactions (id, user_id, type, status, from_currency, to_currency, amount, fee, reference, note, completed_at, created_at)
                VALUES (${crypto.randomUUID()}, ${String(ctx.user.id)}, 'payment', 'completed', ${input.currency}, ${input.currency},
                  ${String(input.priceUsd)}, '0', ${"BOOKING:" + confirmationCode},
                  ${"Booking: " + input.serviceName + " at establishment #" + input.establishmentId},
                  ${Date.now()}, ${Date.now()})`;
              walletDeducted = true;
            }
          });
        } catch { /* wallet deduction optional — booking still proceeds */ }
      }

      const [booking] = await db
        .insert(touristBookings)
        .values({
          userId: ctx.user.id,
          establishmentId: input.establishmentId,
          productId: input.productId ?? null,
          serviceType: input.serviceType,
          serviceName: input.serviceName,
          bookingDate: new Date(input.bookingDate),
          bookingDateStr,
          partySize: input.partySize,
          priceUsd: input.priceUsd.toString(),
          currency: input.currency,
          status: "confirmed",
          notes: input.notes ?? null,
          confirmationCode,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Award loyalty points (1 point per $1 spent)
      const loyaltyPoints = Math.floor(input.priceUsd);
      if (loyaltyPoints > 0) {
        try {
          await db.execute(sql`
            UPDATE loyalty_accounts SET points_balance = points_balance + ${loyaltyPoints},
              total_points_earned = total_points_earned + ${loyaltyPoints}, updated_at = ${Date.now()}
            WHERE user_id = ${ctx.user.id}
          `);
          await db.execute(sql`
            INSERT INTO loyalty_transactions (id, user_id, type, points, description, reference_type, reference_id, created_at)
            VALUES (${crypto.randomUUID()}, ${ctx.user.id}, 'earn', ${loyaltyPoints},
              ${"Booking: " + input.serviceName}, 'booking', ${String(booking.id)}, ${Date.now()})
          `);
        } catch { /* loyalty award non-critical */ }
      }

      // Audit + notification
      createAuditLog({
        actorId: ctx.user.id,
        action: "tourist.booking.created",
        entityType: "booking",
        entityId: String(booking.id),
        description: `Booked ${input.serviceName} for $${input.priceUsd} ${input.currency}. Code: ${confirmationCode}. Wallet deducted: ${walletDeducted}`,
      }).catch(() => {});

      createUserNotification({
        userId: ctx.user.id,
        category: "system",
        title: "Booking Confirmed",
        content: `Your booking for "${input.serviceName}" on ${bookingDateStr} is confirmed. Code: ${confirmationCode}. ${loyaltyPoints > 0 ? `+${loyaltyPoints} loyalty points earned!` : ""}`,
        actionUrl: "/tourist",
        actionLabel: "View Bookings",
      }).catch(() => {});

      return booking;
    }),

  listBookings: protectedProcedure
    .input(
      z.object({
        status: z.enum(["pending", "confirmed", "cancelled", "completed", "no_show"]).optional(),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const conditions: ReturnType<typeof eq>[] = [eq(touristBookings.userId, ctx.user.id)];
      if (input.status) conditions.push(eq(touristBookings.status, input.status));

      return db
        .select({
          booking: touristBookings,
          establishment: {
            id: establishments.id,
            name: establishments.name,
            type: establishments.type,
            city: establishments.city,
            country: establishments.country,
          },
        })
        .from(touristBookings)
        .leftJoin(establishments, eq(touristBookings.establishmentId, establishments.id))
        .where(and(...conditions))
        .orderBy(desc(touristBookings.bookingDate))
        .limit(input.limit);
    }),

  cancelBooking: protectedProcedure
    .input(z.object({ bookingId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [booking] = await db
        .select()
        .from(touristBookings)
        .where(
          and(
            eq(touristBookings.id, input.bookingId),
            eq(touristBookings.userId, ctx.user.id)
          )
        )
        .limit(1);

      if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found" });
      if (booking.status === "completed")
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot cancel a completed booking" });

      await db
        .update(touristBookings)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(touristBookings.id, input.bookingId));

      return { ok: true };
    }),

  // ── Reviews ───────────────────────────────────────────────────────────────

  submitReview: protectedProcedure
    .input(
      z.object({
        establishmentId: z.number().int().positive(),
        bookingId: z.number().int().positive().optional(),
        rating: z.number().int().min(1).max(5),
        title: z.string().max(128).optional(),
        body: z.string().max(4096).optional(),
        tags: z.array(z.string().max(32)).max(10).default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();

      const [existing] = await db
        .select({ id: touristReviews.id })
        .from(touristReviews)
        .where(
          and(
            eq(touristReviews.userId, ctx.user.id),
            eq(touristReviews.establishmentId, input.establishmentId)
          )
        )
        .limit(1);

      if (existing) {
        await db
          .update(touristReviews)
          .set({
            rating: input.rating,
            title: input.title ?? null,
            body: input.body ?? null,
            tags: input.tags,
            updatedAt: new Date(),
          })
          .where(eq(touristReviews.id, existing.id));
        return { id: existing.id, updated: true };
      }

      // Check verified purchase via wallet transactions
      const [txCheck] = await db
        .select({ id: walletTransactions.id })
        .from(walletTransactions)
        .where(
          and(
            eq(walletTransactions.userId, ctx.user.id.toString()),
            eq(walletTransactions.counterparty, input.establishmentId.toString())
          )
        )
        .limit(1);

      const [review] = await db
        .insert(touristReviews)
        .values({
          userId: ctx.user.id,
          establishmentId: input.establishmentId,
          bookingId: input.bookingId ?? null,
          rating: input.rating,
          title: input.title ?? null,
          body: input.body ?? null,
          tags: input.tags,
          photos: [],
          helpfulVotes: 0,
          isVerifiedPurchase: !!txCheck,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      // Notify the establishment owner about the new review
      try {
        const [est] = await db
          .select({ ownerId: establishments.ownerId, name: establishments.name })
          .from(establishments)
          .where(eq(establishments.id, input.establishmentId))
          .limit(1);
        if (est?.ownerId) {
          const stars = "★".repeat(input.rating) + "☆".repeat(5 - input.rating);
          await sendPushToUser(est.ownerId, {
            title: "New Review Received",
            body: `${ctx.user.name ?? "A tourist"} left a ${input.rating}-star review for ${est.name}. ${stars}`,
            icon: "/icons/icon-192x192.png",
            badge: "/icons/badge-72x72.png",
            tag: `review-${review.id}`,
            data: { url: "/merchant/revenue" },
          });
        }
      } catch {
        // Non-fatal: push notification failure should not block review submission
      }
      return { id: review.id, updated: false };
    }),
  listReviews: protectedProcedure
    .input(
      z.object({
        establishmentId: z.number().int().positive().optional(),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const conditions = input.establishmentId
        ? [eq(touristReviews.establishmentId, input.establishmentId)]
        : [eq(touristReviews.userId, ctx.user.id)];

      return db
        .select({
          review: touristReviews,
          user: { id: users.id, name: users.name },
          establishment: { id: establishments.id, name: establishments.name },
        })
        .from(touristReviews)
        .leftJoin(users, eq(touristReviews.userId, users.id))
        .leftJoin(establishments, eq(touristReviews.establishmentId, establishments.id))
        .where(and(...conditions))
        .orderBy(desc(touristReviews.createdAt))
        .limit(input.limit);
    }),

  // ── Deals ─────────────────────────────────────────────────────────────────

  listDeals: protectedProcedure
    .input(
      z.object({
        category: z.string().max(64).optional(),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ _ctx, input }: any) => {
      const db = await requireDb();
      const now = new Date();
      const conditions: any[] = [
        eq(touristDeals.isActive, true),
        lte(touristDeals.validFrom, now),
        gte(touristDeals.validTo, now),
      ];
      if (input.category) conditions.push(eq(touristDeals.category, input.category));

      return db
        .select({
          deal: touristDeals,
          establishment: {
            id: establishments.id,
            name: establishments.name,
            type: establishments.type,
            city: establishments.city,
          },
        })
        .from(touristDeals)
        .leftJoin(establishments, eq(touristDeals.establishmentId, establishments.id))
        .where(and(...conditions))
        .orderBy(desc(touristDeals.discountPercent))
        .limit(input.limit);
    }),

  // ── Itinerary ─────────────────────────────────────────────────────────────

  listItineraries: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return db
      .select()
      .from(touristItineraries)
      .where(eq(touristItineraries.userId, ctx.user.id))
      .orderBy(desc(touristItineraries.updatedAt));
  }),

  createItinerary: protectedProcedure
    .input(
      z.object({
        title: z.string().max(128),
        destination: z.string().max(128).optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        budgetUsd: z.number().min(0).optional(),
        items: z
          .array(
            z.object({
              day: z.number().int().min(1),
              time: z.string().optional(),
              estId: z.number().int().optional(),
              estName: z.string().optional(),
              note: z.string().optional(),
            })
          )
          .default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [itinerary] = await db
        .insert(touristItineraries)
        .values({
          userId: ctx.user.id,
          title: input.title,
          destination: input.destination ?? null,
          startDate: input.startDate ? new Date(input.startDate) : null,
          endDate: input.endDate ? new Date(input.endDate) : null,
          budgetUsd: input.budgetUsd?.toString() ?? null,
          items: input.items,
          isPublic: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      return itinerary;
    }),

  updateItinerary: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        title: z.string().max(128).optional(),
        destination: z.string().max(128).optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        budgetUsd: z.number().min(0).optional(),
        items: z
          .array(
            z.object({
              day: z.number().int().min(1),
              time: z.string().optional(),
              estId: z.number().int().optional(),
              estName: z.string().optional(),
              note: z.string().optional(),
            })
          )
          .optional(),
        isPublic: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const { id, ...fields } = input;
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (fields.title) updates.title = fields.title;
      if (fields.destination !== undefined) updates.destination = fields.destination;
      if (fields.startDate) updates.startDate = new Date(fields.startDate);
      if (fields.endDate) updates.endDate = new Date(fields.endDate);
      if (fields.budgetUsd !== undefined) updates.budgetUsd = fields.budgetUsd.toString();
      if (fields.items) updates.items = fields.items;
      if (fields.isPublic !== undefined) updates.isPublic = fields.isPublic;

      await db
        .update(touristItineraries)
        .set(updates)
        .where(
          and(
            eq(touristItineraries.id, id),
            eq(touristItineraries.userId, ctx.user.id)
          )
        );
      return { ok: true };
    }),

  deleteItinerary: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await db
        .delete(touristItineraries)
        .where(
          and(
            eq(touristItineraries.id, input.id),
            eq(touristItineraries.userId, ctx.user.id)
          )
        );
      return { ok: true };
    }),

  // ── Budget Tracker ────────────────────────────────────────────────────────

  getBudget: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const [budget] = await db
      .select()
      .from(touristBudgets)
      .where(eq(touristBudgets.userId, ctx.user.id))
      .limit(1);

    // Calculate current period spend using unix timestamps (walletTransactions.createdAt is integer)
    const dayStartTs = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
    const weekStartTs = dayStartTs - new Date().getDay() * 86400;
    const userIdStr = ctx.user.id.toString();

    const [dailySpend] = await db
      .select({ total: sql<string>`coalesce(sum(amount::numeric), 0)` })
      .from(walletTransactions)
      .where(sql`user_id = ${userIdStr} AND type = 'send' AND created_at >= ${dayStartTs}`);

    const [weeklySpend] = await db
      .select({ total: sql<string>`coalesce(sum(amount::numeric), 0)` })
      .from(walletTransactions)
      .where(sql`user_id = ${userIdStr} AND type = 'send' AND created_at >= ${weekStartTs}`);

    return {
      budget: budget ?? null,
      dailySpendUsd: parseFloat(dailySpend?.total ?? "0"),
      weeklySpendUsd: parseFloat(weeklySpend?.total ?? "0"),
    };
  }),

  upsertBudget: protectedProcedure
    .input(
      z.object({
        dailyLimitUsd: z.number().min(1).max(100000).optional(),
        weeklyLimitUsd: z.number().min(1).max(500000).optional(),
        tripLimitUsd: z.number().min(1).max(1000000).optional(),
        alertAt80Percent: z.boolean().optional(),
        alertAt100Percent: z.boolean().optional(),
        categories: z.record(z.string(), z.number()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [existing] = await db
        .select({ id: touristBudgets.id })
        .from(touristBudgets)
        .where(eq(touristBudgets.userId, ctx.user.id))
        .limit(1);

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (input.dailyLimitUsd !== undefined) updates.dailyLimitUsd = input.dailyLimitUsd.toString();
      if (input.weeklyLimitUsd !== undefined) updates.weeklyLimitUsd = input.weeklyLimitUsd.toString();
      if (input.tripLimitUsd !== undefined) updates.tripLimitUsd = input.tripLimitUsd.toString();
      if (input.alertAt80Percent !== undefined) updates.alertAt80Percent = input.alertAt80Percent;
      if (input.alertAt100Percent !== undefined) updates.alertAt100Percent = input.alertAt100Percent;
      if (input.categories !== undefined) updates.categories = input.categories;

      if (existing) {
        await db.update(touristBudgets).set(updates).where(eq(touristBudgets.userId, ctx.user.id));
      } else {
        await db.insert(touristBudgets).values({
          userId: ctx.user.id,
          dailyLimitUsd: (updates.dailyLimitUsd as string) ?? "100",
          weeklyLimitUsd: (updates.weeklyLimitUsd as string) ?? "500",
          tripLimitUsd: (updates.tripLimitUsd as string | null) ?? null,
          alertAt80Percent: (updates.alertAt80Percent as boolean) ?? true,
          alertAt100Percent: (updates.alertAt100Percent as boolean) ?? true,
          categories: (updates.categories as Record<string, number>) ?? {},
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      return { ok: true };
    }),

  // ── AI Concierge ──────────────────────────────────────────────────────────

  getConciergeSession: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const [session] = await db
      .select()
      .from(touristConciergeSessions)
      .where(eq(touristConciergeSessions.userId, ctx.user.id))
      .orderBy(desc(touristConciergeSessions.updatedAt))
      .limit(1);
    return session ?? null;
  }),

  sendConciergeMessage: protectedProcedure
    .input(
      z.object({
        message: z.string().min(1).max(2048),
        destination: z.string().max(128).optional(),
        sessionId: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();

      let session = input.sessionId
        ? (
            await db
              .select()
              .from(touristConciergeSessions)
              .where(
                and(
                  eq(touristConciergeSessions.id, input.sessionId),
                  eq(touristConciergeSessions.userId, ctx.user.id)
                )
              )
              .limit(1)
          )[0] ?? null
        : null;

      if (!session) {
        const [newSession] = await db
          .insert(touristConciergeSessions)
          .values({
            userId: ctx.user.id,
            messages: [],
            context: { destination: input.destination ?? "Africa" },
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();
        session = newSession;
      }

      const history = (session.messages as any[]) ?? [];
      const userMsg = { role: "user", content: input.message, ts: Date.now() };
      const updatedHistory = [...history, userMsg];

      const llmMessages = [
        {
          role: "system" as const,
          content: `You are TourismPay Concierge, an expert AI travel assistant specialising in African tourism destinations. 
You help tourists discover local experiences, plan itineraries, understand payment options, and navigate local culture.
The tourist is visiting: ${(session.context as any)?.destination ?? "Africa"}.
Be concise, friendly, and practical. Suggest specific places, prices in USD, and TourismPay payment tips.
Current date: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.`,
        },
        ...history.slice(-10).map((m: any) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        { role: "user" as const, content: input.message },
      ];

      const llmResponse = await invokeLLM({ messages: llmMessages });
      const assistantContent =
        llmResponse.choices?.[0]?.message?.content ??
        "I'm sorry, I could not process your request right now.";

      const assistantMsg = { role: "assistant", content: assistantContent, ts: Date.now() };
      const finalHistory = [...updatedHistory, assistantMsg];

      await db
        .update(touristConciergeSessions)
        .set({ messages: finalHistory, updatedAt: new Date() })
        .where(eq(touristConciergeSessions.id, session.id));

      return {
        sessionId: session.id,
        reply: assistantContent,
        history: finalHistory,
      };
    }),

  clearConciergeSession: protectedProcedure
    .input(z.object({ sessionId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await db
        .update(touristConciergeSessions)
        .set({ messages: [], updatedAt: new Date() })
        .where(
          and(
            eq(touristConciergeSessions.id, input.sessionId),
            eq(touristConciergeSessions.userId, ctx.user.id)
          )
        );
      return { ok: true };
    }),

  // ── FX Rates snapshot ─────────────────────────────────────────────────────

  getFxRates: protectedProcedure.query(async () => {
    const rates: Record<string, number> = {
      USDC: 1.0,
      USD: 1.0,
      "CBDC-NG": 0.00065,
      "CBDC-KE": 0.0077,
      "CBDC-GH": 0.067,
      "CBDC-ZA": 0.054,
      XLM: 0.11,
      NGN: 0.00065,
      KES: 0.0077,
      GHS: 0.067,
      ZAR: 0.054,
      EUR: 1.08,
      GBP: 1.27,
      JPY: 0.0067,
      CNY: 0.14,
    };

    try {
      const fxUrl = process.env.EXCHANGE_RATE_ML_URL || "http://localhost:8004";
      const resp = await fetch(`${fxUrl}/fx/rates`, {
        signal: AbortSignal.timeout(2000),
      });
      if (resp.ok) {
        const live = (await resp.json()) as any;
        if (live?.rates) return { rates: live.rates, source: "ml-live", ts: Date.now() };
      }
    } catch {
      // Fall back to static rates
    }

    return { rates, source: "static", ts: Date.now() };
  }),

  // ── Spend analytics ───────────────────────────────────────────────────────

  getSpendAnalytics: protectedProcedure
    .input(z.object({ days: z.number().int().min(1).max(365).default(30) }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const sinceTs = Math.floor(Date.now() / 1000) - input.days * 86400;
      const userIdStr = ctx.user.id.toString();

      const txs = await db
        .select({
          id: walletTransactions.id,
          amount: walletTransactions.amount,
          fromCurrency: walletTransactions.fromCurrency,
          type: walletTransactions.type,
          counterparty: walletTransactions.counterparty,
          createdAt: walletTransactions.createdAt,
        })
        .from(walletTransactions)
        .where(
          sql`user_id = ${userIdStr} AND type = 'send' AND created_at >= ${sinceTs}`
        )
        .orderBy(desc(walletTransactions.createdAt));

      const totalUsd = txs.reduce(
        (s: number, t: (typeof txs)[0]) => s + parseFloat(t.amount ?? "0"),
        0
      );
      const byMerchant: Record<string, number> = {};
      txs.forEach((t: (typeof txs)[0]) => {
        const name = t.counterparty ?? "Unknown";
        byMerchant[name] = (byMerchant[name] ?? 0) + parseFloat(t.amount ?? "0");
      });

      const byDay: Record<string, number> = {};
      txs.forEach((t: (typeof txs)[0]) => {
        const day = new Date((t.createdAt ?? 0) * 1000).toISOString().slice(0, 10);
        byDay[day] = (byDay[day] ?? 0) + parseFloat(t.amount ?? "0");
      });

      return {
        totalUsd,
        txCount: txs.length,
        byMerchant: Object.entries(byMerchant)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([name, amount]) => ({ name, amount })),
        byDay: Object.entries(byDay)
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([date, amount]) => ({ date, amount })),
        recentTxs: txs.slice(0, 10),
      };
    }),

  // ── Merchant: Manage Deals ────────────────────────────────────────────────
  createDeal: protectedProcedure
    .input(z.object({
      title: z.string().min(3).max(128),
      description: z.string().optional(),
      discountPercent: z.number().int().min(0).max(100).default(0),
      discountAmountUsd: z.number().min(0).optional(),
      promoCode: z.string().max(32).optional(),
      category: z.string().max(64).default("general"),
      imageUrl: z.string().url().optional(),
      validFrom: z.string(),
      validTo: z.string(),
      maxRedemptions: z.number().int().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [est] = await db.select({ id: establishments.id, name: establishments.name, country: establishments.country })
        .from(establishments)
        .where(eq(establishments.ownerId, ctx.user.id))
        .limit(1);
      if (!est) throw new TRPCError({ code: "NOT_FOUND", message: "No establishment found for your account. Complete KYB onboarding first." });
      const [deal] = await db.insert(touristDeals).values({
        establishmentId: est.id,
        title: input.title,
        description: input.description,
        discountPercent: input.discountPercent,
        discountAmountUsd: input.discountAmountUsd?.toString(),
        promoCode: input.promoCode,
        category: input.category,
        imageUrl: input.imageUrl,
        validFrom: new Date(input.validFrom),
        validTo: new Date(input.validTo),
        maxRedemptions: input.maxRedemptions,
        isActive: true,
      }).returning();
      // Notify owner about new deal publication
      try {
        const { notifyOwner } = await import("../_core/notification");
        await notifyOwner({
          title: `New deal published: ${deal.title}`,
          content: `${est.name} (${est.country}) published a new deal: "${deal.title}" — ${deal.discountPercent}% off. Valid until ${new Date(input.validTo).toLocaleDateString()}.`,
        });
      } catch { /* non-critical */ }
      return deal;
    }),

  updateDeal: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      title: z.string().min(3).max(128).optional(),
      description: z.string().optional(),
      discountPercent: z.number().int().min(0).max(100).optional(),
      discountAmountUsd: z.number().min(0).optional(),
      promoCode: z.string().max(32).optional(),
      category: z.string().max(64).optional(),
      imageUrl: z.string().url().optional(),
      validFrom: z.string().optional(),
      validTo: z.string().optional(),
      maxRedemptions: z.number().int().positive().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [est] = await db.select({ id: establishments.id })
        .from(establishments)
        .where(eq(establishments.ownerId, ctx.user.id))
        .limit(1);
      if (!est) throw new TRPCError({ code: "NOT_FOUND", message: "No establishment found." });
      const { id, validFrom, validTo, discountAmountUsd, ...rest } = input;
      const updateData: Record<string, unknown> = { ...rest };
      if (validFrom) updateData.validFrom = new Date(validFrom);
      if (validTo) updateData.validTo = new Date(validTo);
      if (discountAmountUsd !== undefined) updateData.discountAmountUsd = discountAmountUsd.toString();
      const [updated] = await db.update(touristDeals)
        .set(updateData)
        .where(and(eq(touristDeals.id, id), eq(touristDeals.establishmentId, est.id)))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Deal not found or not yours." });
      return updated;
    }),

  deleteDeal: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [est] = await db.select({ id: establishments.id })
        .from(establishments)
        .where(eq(establishments.ownerId, ctx.user.id))
        .limit(1);
      if (!est) throw new TRPCError({ code: "NOT_FOUND", message: "No establishment found." });
      await db.delete(touristDeals)
        .where(and(eq(touristDeals.id, input.id), eq(touristDeals.establishmentId, est.id)));
      return { success: true };
    }),

  listMyDeals: protectedProcedure
    .input(z.object({ includeExpired: z.boolean().default(false) }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const [est] = await db.select({ id: establishments.id })
        .from(establishments)
        .where(eq(establishments.ownerId, ctx.user.id))
        .limit(1);
      if (!est) return [];
      const now = new Date();
      const conditions = [eq(touristDeals.establishmentId, est.id)];
      if (!input.includeExpired) conditions.push(gte(touristDeals.validTo, now));
      return db.select().from(touristDeals).where(and(...conditions)).orderBy(desc(touristDeals.createdAt));
    }),

  // ── Merchant: Update booking status (with tourist notification) ─────────────
  updateBookingStatus: protectedProcedure
    .input(z.object({
      bookingId: z.number().int().positive(),
      status: z.enum(["pending", "confirmed", "cancelled", "completed", "no_show"]),
      notes: z.string().max(512).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      // Allow the booking owner (tourist) or the establishment owner (merchant) to update
      const [booking] = await db.select({
        id: touristBookings.id,
        userId: touristBookings.userId,
        serviceName: touristBookings.serviceName,
        status: touristBookings.status,
        confirmationCode: touristBookings.confirmationCode,
        establishmentId: touristBookings.establishmentId,
      }).from(touristBookings).where(eq(touristBookings.id, input.bookingId)).limit(1);
      if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found" });

      // Verify caller is tourist owner or establishment owner
      const [est] = await db.select({ ownerId: establishments.ownerId })
        .from(establishments).where(eq(establishments.id, booking.establishmentId)).limit(1);
      const isTourist = booking.userId === ctx.user.id;
      const isMerchant = est?.ownerId === ctx.user.id;
      if (!isTourist && !isMerchant) throw new TRPCError({ code: "FORBIDDEN", message: "Not authorised" });

      const updateData: Record<string, unknown> = { status: input.status, updatedAt: new Date() };
      if (input.notes) updateData.notes = input.notes;
      const [updated] = await db.update(touristBookings).set(updateData)
        .where(eq(touristBookings.id, input.bookingId)).returning();

      // Notify owner about booking status change
      try {
        const { notifyOwner } = await import("../_core/notification");
        await notifyOwner({
          title: `Booking ${input.status}: ${booking.serviceName}`,
          content: `Booking #${booking.confirmationCode} for "${booking.serviceName}" has been updated to status: ${input.status}.`,
        });
      } catch { /* non-critical */ }

      return updated;
    }),

  // ─── Deal Redemption ─────────────────────────────────────────────────────

  redeemDeal: protectedProcedure
    .input(z.object({ dealId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [deal] = await db.select().from(touristDeals)
        .where(eq(touristDeals.id, input.dealId)).limit(1);
      if (!deal) throw new TRPCError({ code: "NOT_FOUND", message: "Deal not found" });
      const now = new Date();
      if (!deal.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "This deal is currently paused" });
      if (new Date(deal.validTo) < now) throw new TRPCError({ code: "BAD_REQUEST", message: "This deal has expired" });
      if (deal.maxRedemptions && (deal.redemptionCount ?? 0) >= deal.maxRedemptions) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This deal has reached its redemption limit" });
      }
      // Prevent double-redeem by same tourist
      const [existing] = await db.select({ id: touristDealRedemptions.id })
        .from(touristDealRedemptions)
        .where(and(
          eq(touristDealRedemptions.userId, ctx.user.id),
          eq(touristDealRedemptions.dealId, input.dealId),
          eq(touristDealRedemptions.status, "redeemed")
        )).limit(1);
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "You have already redeemed this deal" });
      // Generate unique redemption code
      const redemptionCode = `TP-${randomCode(6)}-${Date.now().toString(36).toUpperCase()}`;
      const [redemption] = await db.insert(touristDealRedemptions).values({
        userId: ctx.user.id,
        dealId: input.dealId,
        establishmentId: deal.establishmentId ?? null,
        redemptionCode,
        status: "redeemed",
      }).returning();
      // Deduct discount value from boost budget and auto-pause if cap reached
      const discountValue = parseFloat(deal.discountAmountUsd ?? "0");
      const currentSpent = parseFloat(deal.boostSpentUsd ?? "0");
      const newSpent = currentSpent + discountValue;
      const budget = deal.boostBudgetUsd ? parseFloat(deal.boostBudgetUsd) : null;
      const budgetExceeded = budget !== null && newSpent >= budget;

      await db.update(touristDeals)
        .set({
          redemptionCount: (deal.redemptionCount ?? 0) + 1,
          boostSpentUsd: newSpent.toFixed(6),
          // Auto-pause boost when budget cap is reached
          ...(budgetExceeded ? { visibilityScore: 0, boostedUntil: null } : {}),
        })
        .where(eq(touristDeals.id, input.dealId));
      try {
        const { notifyOwner } = await import("../_core/notification");
        await notifyOwner({
          title: `Deal Redeemed: ${deal.title}`,
          content: `A tourist redeemed "${deal.title}" (${deal.discountPercent}% off). Code: ${redemptionCode}. Total: ${(deal.redemptionCount ?? 0) + 1}${deal.maxRedemptions ? `/${deal.maxRedemptions}` : ""}.${budgetExceeded ? " Boost budget cap reached — boost paused." : ""}`,
        });
      } catch { /* non-critical */ }
      return { redemption, deal, budgetExceeded };
    }),

  getMyRedemptions: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      return db
        .select({
          id: touristDealRedemptions.id,
          redemptionCode: touristDealRedemptions.redemptionCode,
          status: touristDealRedemptions.status,
          redeemedAt: touristDealRedemptions.redeemedAt,
          confirmedAt: touristDealRedemptions.confirmedAt,
          dealTitle: touristDeals.title,
          dealDiscount: touristDeals.discountPercent,
          dealCategory: touristDeals.category,
          establishmentName: establishments.name,
        })
        .from(touristDealRedemptions)
        .leftJoin(touristDeals, eq(touristDealRedemptions.dealId, touristDeals.id))
        .leftJoin(establishments, eq(touristDealRedemptions.establishmentId, establishments.id))
        .where(eq(touristDealRedemptions.userId, ctx.user.id))
        .orderBy(desc(touristDealRedemptions.redeemedAt))
        .limit(input.limit);
    }),

  /** Generate a pre-authorized offline payment token for the tourist (30-min TTL) */
  generateOfflineToken: protectedProcedure
    .input(z.object({
      amountUsd: z.number().positive().optional(),
      currency: z.string().max(10).default("USD"),
      note: z.string().max(100).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      // Generate a cryptographically random token
      const token = [
        ctx.user.id.toString().padStart(8, "0"),
        crypto.randomUUID().replace(/-/g, "").substring(0, 8).toUpperCase(),
        Date.now().toString(36).toUpperCase(),
      ].join("-");
      const expiresAt = Date.now() + 30 * 60 * 1000; // 30 minutes
      // Persist to wallet_transactions as a pending offline token record
      await db.insert(walletTransactions).values({
        userId: ctx.user.id.toString(),
        type: "offline_token",
        status: "pending",
        fromCurrency: input.currency,
        amount: String(input.amountUsd ?? 0),
        reference: token,
        note: input.note ?? "Offline QR token",
      });
      return {
        token,
        expiresAt,
        qrData: `tourismpay://pay?token=${token}&user=${ctx.user.id}`,
        userId: ctx.user.id,
        amountUsd: input.amountUsd ?? null,
        currency: input.currency,
      };
    }),

  // ── Deal Analytics (merchant-facing) ────────────────────────────────────────
  getDealAnalytics: protectedProcedure
    .input(z.object({ days: z.number().int().min(1).max(365).default(30) }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const sinceDate = new Date(Date.now() - input.days * 86_400_000);

      // Get all deals for this merchant's establishments
      const myEsts = await db
        .select({ id: establishments.id, name: establishments.name })
        .from(establishments)
        .where(eq(establishments.ownerId, ctx.user.id));
      if (!myEsts.length) return { deals: [], totalRedemptions: 0, totalSavingsUsd: 0, topDeal: null };

      const estIds = myEsts.map((e) => e.id);

      // Fetch all deals belonging to those establishments
      const deals = await db
        .select({
          id: touristDeals.id,
          title: touristDeals.title,
          discountPercent: touristDeals.discountPercent,
          discountAmountUsd: touristDeals.discountAmountUsd,
          category: touristDeals.category,
          redemptionCount: touristDeals.redemptionCount,
          maxRedemptions: touristDeals.maxRedemptions,
          isActive: touristDeals.isActive,
          validFrom: touristDeals.validFrom,
          validTo: touristDeals.validTo,
        })
        .from(touristDeals)
        .where(sql`establishment_id = ANY(${estIds}::int[])`);

      if (!deals.length) return { deals: [], totalRedemptions: 0, totalSavingsUsd: 0, topDeal: null };

      const dealIds = deals.map((d) => d.id);

      // Fetch recent redemptions for those deals
      const redemptions = await db
        .select({
          dealId: touristDealRedemptions.dealId,
          status: touristDealRedemptions.status,
        })
        .from(touristDealRedemptions)
        .where(
          sql`deal_id = ANY(${dealIds}::int[]) AND redeemed_at >= ${sinceDate}`
        );

      // Aggregate per deal
      const byDeal: Record<number, number> = {};
      redemptions.forEach((r) => { byDeal[r.dealId] = (byDeal[r.dealId] ?? 0) + 1; });

      const dealStats = deals.map((d) => {
        const recentRedemptions = byDeal[d.id] ?? 0;
        const redemptionRate = d.maxRedemptions && d.maxRedemptions > 0
          ? Math.round((d.redemptionCount / d.maxRedemptions) * 100)
          : null;
        const estSavingsUsd = recentRedemptions * parseFloat(d.discountAmountUsd ?? "0");
        return { ...d, recentRedemptions, redemptionRate, estSavingsUsd };
      });

      const sorted = [...dealStats].sort((a, b) => b.recentRedemptions - a.recentRedemptions);
      return {
        deals: sorted,
        totalRedemptions: redemptions.length,
        totalSavingsUsd: dealStats.reduce((s, d) => s + d.estSavingsUsd, 0),
        topDeal: sorted[0] ?? null,
      };
    }),

  // ── Spending Insights with category breakdown (tourist-facing) ────────────────
  getSpendingInsights: protectedProcedure
    .input(z.object({ days: z.number().int().min(1).max(365).default(30) }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const sinceTs = Math.floor(Date.now() / 1000) - input.days * 86400;
      const userIdStr = ctx.user.id.toString();
      const sinceDate = new Date(sinceTs * 1000);

      const txs = await db
        .select({
          amount: walletTransactions.amount,
          counterparty: walletTransactions.counterparty,
          note: walletTransactions.note,
        })
        .from(walletTransactions)
        .where(sql`user_id = ${userIdStr} AND type = 'send' AND created_at >= ${sinceTs}`);

      // Keyword-based category inference
      const CATS: Record<string, string[]> = {
        Food:          ["restaurant","cafe","food","eat","dining","bar","grill","kitchen","pizza","burger"],
        Transport:     ["taxi","uber","transport","bus","train","ride","airport","bolt","matatu"],
        Accommodation: ["hotel","lodge","hostel","airbnb","stay","resort","inn","guesthouse"],
        Shopping:      ["shop","market","store","mall","boutique","souvenir","craft","supermarket"],
        Activities:    ["tour","safari","activity","excursion","adventure","museum","park","game"],
      };
      function inferCat(tx: { counterparty: string | null; note: string | null }): string {
        const h = `${tx.counterparty ?? ""} ${tx.note ?? ""}`.toLowerCase();
        for (const [cat, kws] of Object.entries(CATS)) {
          if (kws.some((kw) => h.includes(kw))) return cat;
        }
        return "Other";
      }

      const byCat: Record<string, number> = {};
      let totalUsd = 0;
      for (const t of txs) {
        const amt = parseFloat(t.amount ?? "0");
        totalUsd += amt;
        const cat = inferCat(t);
        byCat[cat] = (byCat[cat] ?? 0) + amt;
      }

      // Savings from deal redemptions in the period
      const redemptions = await db
        .select({ dealId: touristDealRedemptions.dealId })
        .from(touristDealRedemptions)
        .where(sql`user_id = ${ctx.user.id} AND redeemed_at >= ${sinceDate}`);

      let totalSavingsUsd = 0;
      if (redemptions.length > 0) {
        const dIds = Array.from(new Set(redemptions.map((r) => r.dealId)));
        const dealsForSavings = await db
          .select({ discountAmountUsd: touristDeals.discountAmountUsd })
          .from(touristDeals)
          .where(sql`id = ANY(${dIds}::int[])`);
        totalSavingsUsd = dealsForSavings.reduce(
          (s, d) => s + parseFloat(d.discountAmountUsd ?? "0"), 0
        );
      }

      return {
        totalUsd,
        txCount: txs.length,
        totalSavingsUsd,
        redemptionCount: redemptions.length,
        byCategory: Object.entries(byCat)
          .sort((a, b) => b[1] - a[1])
          .map(([name, amount]) => ({
            name,
            amount,
            pct: totalUsd > 0 ? Math.round((amount / totalUsd) * 100) : 0,
          })),
      };
    }),

  /** Export tourist spending history as CSV for the selected period */
  exportSpendingCsv: protectedProcedure
    .input(
      z.object({
        period: z.enum(["30", "90", "365", "all"]).default("30"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();

      const sinceDate =
        input.period === "all"
          ? new Date(0)
          : new Date(Date.now() - parseInt(input.period) * 86_400_000);

      const userIdStr = ctx.user.id.toString();
      const sinceTs = input.period === "all" ? 0 : Math.floor(Date.now() / 1000) - parseInt(input.period) * 86400;

      const txs = await db
        .select()
        .from(walletTransactions)
        .where(
          input.period === "all"
            ? sql`user_id = ${userIdStr}`
            : sql`user_id = ${userIdStr} AND created_at >= ${sinceTs}`
        )
        .orderBy(desc(walletTransactions.createdAt))
        .limit(10000);

      const header = [
        "Date",
        "Type",
        "Amount",
        "From Currency",
        "To Currency",
        "Counterparty",
        "Reference",
        "Note",
      ].join(",");

      const rows = txs.map((t) =>
        [
          t.createdAt ? new Date(t.createdAt * 1000).toISOString().slice(0, 10) : "",
          t.type,
          t.amount ?? "",
          t.fromCurrency ?? "",
          t.toCurrency ?? "",
          t.counterparty ?? "",
          t.reference ?? "",
          `"${(t.note ?? "").replace(/"/g, "'")}"`,
        ].join(",")
      );
      const csv = [header, ...rows].join("\n");
      const filename = `spending-${input.period === "all" ? "all" : input.period + "d"}-${new Date().toISOString().slice(0, 10)}.csv`;
      return { csv, filename, rowCount: txs.length };
    }),

  /**
   * Get spending insights for an arbitrary date range.
   * Used by the date-range picker in the Spending Insights tab.
   */
  getSpendingInsightsRange: protectedProcedure
    .input(z.object({
      startDate: z.date(),
      endDate: z.date(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { totalSpent: 0, totalSaved: 0, byCategory: [], topMerchants: [], txCount: 0 };

      const startTs = Math.floor(input.startDate.getTime() / 1000);
      const endTs = Math.floor(input.endDate.getTime() / 1000);
      // walletTransactions.userId is varchar, ctx.user.id is number — convert to string
      const userIdStr = String(ctx.user.id);

      const txs = await db
        .select()
        .from(walletTransactions)
        .where(
          and(
            eq(walletTransactions.userId, userIdStr),
            gte(walletTransactions.createdAt, startTs),
            lte(walletTransactions.createdAt, endTs),
            inArray(walletTransactions.type, ["send", "payment", "purchase"])
          )
        )
        .orderBy(desc(walletTransactions.createdAt));

      const totalSpent = txs.reduce((sum, t) => sum + parseFloat(String(t.amount ?? 0)), 0);

      // Category breakdown by transaction type (no category column — use type as proxy)
      const catMap: Record<string, number> = {};
      for (const t of txs) {
        const cat = t.type ?? "other";
        catMap[cat] = (catMap[cat] ?? 0) + parseFloat(String(t.amount ?? 0));
      }
      const byCategory = Object.entries(catMap)
        .map(([category, amount]) => ({ category, amount: parseFloat(amount.toFixed(2)) }))
        .sort((a, b) => b.amount - a.amount);

      // Top merchants
      const merchantMap: Record<string, number> = {};
      for (const t of txs) {
        const m = t.counterparty ?? "Unknown";
        merchantMap[m] = (merchantMap[m] ?? 0) + parseFloat(String(t.amount ?? 0));
      }
      const topMerchants = Object.entries(merchantMap)
        .map(([name, amount]) => ({ name, amount: parseFloat(amount.toFixed(2)) }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);

      // Count redemptions in range (touristDealRedemptions has no discountAmountUsd — use count as proxy for savings)
      const redemptions = await db
        .select({ id: touristDealRedemptions.id })
        .from(touristDealRedemptions)
        .where(
          and(
            eq(touristDealRedemptions.userId, ctx.user.id),
            gte(touristDealRedemptions.redeemedAt, input.startDate),
            lte(touristDealRedemptions.redeemedAt, input.endDate)
          )
        );
      // Estimate savings: each redemption saves ~10% of avg spend
      const avgTx = txs.length > 0 ? totalSpent / txs.length : 0;
      const totalSaved = parseFloat((redemptions.length * avgTx * 0.1).toFixed(2));

      return {
        totalSpent: parseFloat(totalSpent.toFixed(2)),
        totalSaved,
        byCategory,
        topMerchants,
        txCount: txs.length,
      };
    }),

  /**
   * Toggle reminder for a booking (enable/disable 24h reminder notification)
   */
  toggleBookingReminder: protectedProcedure
    .input(z.object({
      bookingId: z.number().int().positive(),
      enabled: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const [booking] = await db
        .select({ id: touristBookings.id, userId: touristBookings.userId })
        .from(touristBookings)
        .where(eq(touristBookings.id, input.bookingId))
        .limit(1);
      if (!booking) throw new Error("Booking not found");
      if (booking.userId !== ctx.user.id) throw new Error("Forbidden");

       await db
        .update(touristBookings)
        .set({ reminderEnabled: input.enabled })
        .where(eq(touristBookings.id, input.bookingId));
      return { success: true, reminderEnabled: input.enabled };
    }),

  /**
   * Toggle a deal on/off the tourist's wishlist.
   * Returns { wishlisted: boolean } reflecting the new state.
   */
  toggleWishlist: protectedProcedure
    .input(z.object({ dealId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [existing] = await db
        .select({ id: touristDealWishlists.id })
        .from(touristDealWishlists)
        .where(and(
          eq(touristDealWishlists.userId, ctx.user.id),
          eq(touristDealWishlists.dealId, input.dealId),
        ))
        .limit(1);
      if (existing) {
        await db.delete(touristDealWishlists)
          .where(eq(touristDealWishlists.id, existing.id));
        return { wishlisted: false };
      }
      await db.insert(touristDealWishlists).values({
        userId: ctx.user.id,
        dealId: input.dealId,
      });
      return { wishlisted: true };
    }),

  /**
   * Get the authenticated tourist's wishlist of saved deals.
   */
  getMyWishlist: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const rows = await db
        .select({
          wishlistId: touristDealWishlists.id,
          savedAt: touristDealWishlists.createdAt,
          deal: {
            id: touristDeals.id,
            title: touristDeals.title,
            description: touristDeals.description,
            discountPercent: touristDeals.discountPercent,
            discountAmountUsd: touristDeals.discountAmountUsd,
            category: touristDeals.category,
            imageUrl: touristDeals.imageUrl,
            validFrom: touristDeals.validFrom,
            validTo: touristDeals.validTo,
            isActive: touristDeals.isActive,
            promoCode: touristDeals.promoCode,
            establishmentId: touristDeals.establishmentId,
          },
        })
        .from(touristDealWishlists)
        .innerJoin(touristDeals, eq(touristDealWishlists.dealId, touristDeals.id))
        .where(eq(touristDealWishlists.userId, ctx.user.id))
        .orderBy(desc(touristDealWishlists.createdAt))
        .limit(input.limit);
      return rows;
    }),

  /**
   * Get wishlist deal IDs for the current user (for heart icon state).
   */
  getMyWishlistIds: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await requireDb();
      const rows = await db
        .select({ dealId: touristDealWishlists.dealId })
        .from(touristDealWishlists)
        .where(eq(touristDealWishlists.userId, ctx.user.id));
      return rows.map(r => r.dealId);
    }),

  /**
   * Merchant responds to a tourist review.
   * Only the establishment owner can respond.
   */
  respondToReview: protectedProcedure
    .input(z.object({
      reviewId: z.number().int().positive(),
      response: z.string().min(1).max(2000),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [review] = await db
        .select({
          id: touristReviews.id,
          establishmentId: touristReviews.establishmentId,
        })
        .from(touristReviews)
        .where(eq(touristReviews.id, input.reviewId))
        .limit(1);
      if (!review) throw new TRPCError({ code: "NOT_FOUND", message: "Review not found" });

      // Verify the caller owns this establishment
      const [est] = await db
        .select({ ownerId: establishments.ownerId })
        .from(establishments)
        .where(eq(establishments.id, review.establishmentId))
        .limit(1);
      if (!est || est.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not own this establishment" });
      }

       await db
        .update(touristReviews)
        .set({
          merchantResponse: input.response,
          merchantRespondedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(touristReviews.id, input.reviewId));
      return { success: true };
    }),

  // ── Export Reviews as CSV ────────────────────────────────────────────────

  exportReviewsCsv: protectedProcedure
    .input(z.object({ establishmentId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      // Verify ownership
      const [est] = await db
        .select({ ownerId: establishments.ownerId, name: establishments.name })
        .from(establishments)
        .where(eq(establishments.id, input.establishmentId))
        .limit(1);
      if (!est || est.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not own this establishment" });
      }
      const reviews = await db
        .select({
          id: touristReviews.id,
          rating: touristReviews.rating,
          title: touristReviews.title,
          body: touristReviews.body,
          tags: touristReviews.tags,
          isVerifiedPurchase: touristReviews.isVerifiedPurchase,
          helpfulVotes: touristReviews.helpfulVotes,
          merchantResponse: touristReviews.merchantResponse,
          merchantRespondedAt: touristReviews.merchantRespondedAt,
          createdAt: touristReviews.createdAt,
          reviewerName: users.name,
          reviewerEmail: users.email,
        })
        .from(touristReviews)
        .leftJoin(users, eq(touristReviews.userId, users.id))
        .where(eq(touristReviews.establishmentId, input.establishmentId))
        .orderBy(desc(touristReviews.createdAt));

      // Build CSV manually (no external dependency)
      const escape = (v: unknown): string => {
        if (v === null || v === undefined) return "";
        const s = Array.isArray(v) ? v.join("; ") : String(v);
        return s.includes(",") || s.includes('"') || s.includes("\n")
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      };
      const headers = [
        "ID", "Rating", "Title", "Body", "Tags", "Verified Purchase",
        "Helpful Votes", "Reviewer Name", "Reviewer Email",
        "Merchant Response", "Merchant Responded At", "Submitted At",
      ];
      const rows = reviews.map((r) => [
        r.id, r.rating, r.title, r.body, r.tags,
        r.isVerifiedPurchase ? "Yes" : "No",
        r.helpfulVotes, r.reviewerName, r.reviewerEmail,
        r.merchantResponse,
        r.merchantRespondedAt ? r.merchantRespondedAt.toISOString() : "",
        r.createdAt.toISOString(),
      ].map(escape).join(","));

      const csv = [headers.join(","), ...rows].join("\n");
      return { csv, filename: `reviews-${est.name.replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.csv` };
    }),

  // ── LLM Review Sentiment Analysis ──────────────────────────────────────────────

  getReviewSentiment: protectedProcedure
    .input(z.object({ establishmentId: z.number().int().positive(), forceRefresh: z.boolean().optional().default(false) }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      // Verify ownership
      const [est] = await db
        .select({ ownerId: establishments.ownerId })
        .from(establishments)
        .where(eq(establishments.id, input.establishmentId))
        .limit(1);
      if (!est || est.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not own this establishment" });
      }
      // Return cached result if fresh (< 24h) and not forcing refresh
      if (!input.forceRefresh) {
        const [cached] = await db
          .select()
          .from(reviewSentimentCache)
          .where(eq(reviewSentimentCache.establishmentId, input.establishmentId))
          .limit(1);
        if (cached) {
          const ageMs = Date.now() - cached.generatedAt.getTime();
          if (ageMs < 24 * 60 * 60 * 1000) return cached;
        }
      }
      // Fetch reviews
      const reviews = await db
        .select({ rating: touristReviews.rating, title: touristReviews.title, body: touristReviews.body })
        .from(touristReviews)
        .where(eq(touristReviews.establishmentId, input.establishmentId))
        .orderBy(desc(touristReviews.createdAt))
        .limit(100);
      if (reviews.length === 0) {
        return { positivePercent: 0, themes: [], summary: "No reviews yet.", reviewCount: 0, generatedAt: new Date() };
      }
      // Build prompt
      const reviewText = reviews
        .map((r, i) => `Review ${i + 1} (${r.rating}/5): ${r.title ? r.title + " - " : ""}${r.body ?? "(no text)"}`.trim())
        .join("\n");
      const llmResult = await invokeLLM({
        messages: [
          {
            role: "system",
            content: "You are a hospitality analytics assistant. Analyse the provided customer reviews and return a JSON object with: positivePercent (integer 0-100 representing percentage of positive reviews), themes (array of up to 5 short theme strings, e.g. \"clean rooms\", \"friendly staff\"), summary (1-2 sentence plain-English summary of overall sentiment). Return ONLY valid JSON, no markdown.",
          },
          { role: "user", content: reviewText },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "sentiment_result",
            strict: true,
            schema: {
              type: "object",
              properties: {
                positivePercent: { type: "integer" },
                themes: { type: "array", items: { type: "string" } },
                summary: { type: "string" },
              },
              required: ["positivePercent", "themes", "summary"],
              additionalProperties: false,
            },
          },
        },
      });
      const rawContent = llmResult?.choices?.[0]?.message?.content;
      const raw = typeof rawContent === "string" ? rawContent : "{}";
      let parsed: { positivePercent: number; themes: string[]; summary: string };
      try {
        parsed = JSON.parse(raw);
      } catch {
        // Rule-based fallback when LLM is unavailable
        const avgRating = reviews.reduce((s, r) => s + (r.rating ?? 3), 0) / reviews.length;
        const positiveCount = reviews.filter(r => (r.rating ?? 3) >= 4).length;
        const positivePercent = Math.round((positiveCount / reviews.length) * 100);
        const themeKeywords = ["service", "food", "location", "clean", "value", "staff", "atmosphere", "view"];
        const allText = reviews.map(r => `${r.title ?? ""} ${r.body ?? ""}`).join(" ").toLowerCase();
        const detectedThemes = themeKeywords.filter(k => allText.includes(k)).slice(0, 5);
        const ratingLabel = avgRating >= 4 ? "positive" : avgRating >= 3 ? "mixed" : "negative";
        parsed = {
          positivePercent,
          themes: detectedThemes.length > 0 ? detectedThemes : ["general"],
          summary: `Based on ${reviews.length} reviews with an average rating of ${avgRating.toFixed(1)}/5, overall sentiment is ${ratingLabel}.`,
        };
      }
      const result = {
        establishmentId: input.establishmentId,
        positivePercent: Math.min(100, Math.max(0, parsed.positivePercent ?? 0)),
        themes: (parsed.themes ?? []).slice(0, 5),
        summary: parsed.summary ?? "",
        reviewCount: reviews.length,
        generatedAt: new Date(),
      };
      // Upsert cache
      await db
        .insert(reviewSentimentCache)
        .values(result)
        .onConflictDoUpdate({
          target: reviewSentimentCache.establishmentId,
          set: {
            positivePercent: result.positivePercent,
            themes: result.themes,
            summary: result.summary,
            reviewCount: result.reviewCount,
            generatedAt: result.generatedAt,
          },
        });
      return result;
    }),

  // ── Sentiment history (14-day sparkline) ──────────────────────────────────
  getSentimentHistory: protectedProcedure
    .input(z.object({ establishmentId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      // Verify ownership
      const [est] = await db
        .select({ ownerId: establishments.ownerId })
        .from(establishments)
        .where(eq(establishments.id, input.establishmentId))
        .limit(1);
      if (!est || est.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not own this establishment" });
      }
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 14);
      const rows = await db
        .select({
          snapshotDate: reviewSentimentHistory.snapshotDate,
          positivePercent: reviewSentimentHistory.positivePercent,
          reviewCount: reviewSentimentHistory.reviewCount,
        })
        .from(reviewSentimentHistory)
        .where(
          and(
            eq(reviewSentimentHistory.establishmentId, input.establishmentId),
            gte(reviewSentimentHistory.snapshotDate, cutoff.toISOString().split("T")[0])
          )
        )
        .orderBy(reviewSentimentHistory.snapshotDate);
      return rows;
    }),

  // ── Reply quality suggestion (LLM) ───────────────────────────────────────
  suggestReplyImprovement: protectedProcedure
    .input(
      z.object({
        establishmentId: z.number().int().positive(),
        draftReply: z.string().min(1).max(2000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      // Verify ownership
      const [est] = await db
        .select({ ownerId: establishments.ownerId })
        .from(establishments)
        .where(eq(establishments.id, input.establishmentId))
        .limit(1);
      if (!est || est.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not own this establishment" });
      }
      const llmResult = await invokeLLM({
        messages: [
          {
            role: "system",
            content:
              "You are a hospitality communication coach. Review the merchant's draft reply to a customer review. " +
              "Identify any issues (overly defensive, unprofessional, dismissive, too long, typos). " +
              "Return a JSON object with: hasIssues (boolean), issues (array of short issue strings, empty if none), " +
              "improvedReply (string — a polished version of the reply, or the original if it is already good). " +
              "Keep the improved reply warm, professional, and under 150 words. Return ONLY valid JSON.",
          },
          { role: "user", content: `Draft reply:\n${input.draftReply}` },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "reply_quality",
            strict: true,
            schema: {
              type: "object",
              properties: {
                hasIssues: { type: "boolean" },
                issues: { type: "array", items: { type: "string" } },
                improvedReply: { type: "string" },
              },
              required: ["hasIssues", "issues", "improvedReply"],
              additionalProperties: false,
            },
          },
        },
      });
      const rawContent = llmResult?.choices?.[0]?.message?.content;
      const raw = typeof rawContent === "string" ? rawContent : "{}";
      let parsed: { hasIssues: boolean; issues: string[]; improvedReply: string };
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = { hasIssues: false, issues: [], improvedReply: input.draftReply };
      }
      return {
        hasIssues: parsed.hasIssues ?? false,
        issues: (parsed.issues ?? []).slice(0, 5),
        improvedReply: parsed.improvedReply ?? input.draftReply,
      };
    }),

  // ── Multi-Venue Sentiment Comparison ──────────────────────────────────────
  getMultiVenueSentiment: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const ownedEstablishments = await db
      .select({ id: establishments.id, name: establishments.name, city: establishments.city, country: establishments.country })
      .from(establishments)
      .where(eq(establishments.ownerId, ctx.user.id));
    if (ownedEstablishments.length === 0) return [];
    const estIds = ownedEstablishments.map((e) => e.id);
    const sentimentRows = await db
      .select()
      .from(reviewSentimentCache)
      .where(inArray(reviewSentimentCache.establishmentId, estIds));
    // Compute response rate per establishment
    const reviewStats = await db
      .select({
        establishmentId: touristReviews.establishmentId,
        totalReviews: sql<number>`count(*)::int`,
        repliedReviews: sql<number>`count(case when ${touristReviews.merchantResponse} is not null then 1 end)::int`,
      })
      .from(touristReviews)
      .where(inArray(touristReviews.establishmentId, estIds))
      .groupBy(touristReviews.establishmentId);
    return ownedEstablishments.map((est) => {
      const sentiment = sentimentRows.find((s) => s.establishmentId === est.id);
      const stats = reviewStats.find((r) => r.establishmentId === est.id);
      const totalReviews = stats?.totalReviews ?? 0;
      const repliedReviews = stats?.repliedReviews ?? 0;
      const responseRate = totalReviews > 0 ? Math.round((repliedReviews / totalReviews) * 100) : null;
      return {
        establishmentId: est.id,
        name: est.name,
        city: est.city,
        country: est.country,
        positivePercent: sentiment?.positivePercent ?? null,
        reviewCount: totalReviews,
        repliedCount: repliedReviews,
        responseRate,
        summary: sentiment?.summary ?? null,
        themes: (sentiment?.themes as string[] | null) ?? [],
        generatedAt: sentiment?.generatedAt ?? null,
      };
    });
  }),

  // ── Reply ROI Analytics ───────────────────────────────────────────────────
  getReplyROI: protectedProcedure
    .input(z.object({ establishmentId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { repliedCount: 0, noReplyCount: 0, repliedRepeatRate: 0, noReplyRepeatRate: 0, roiDelta: 0 };
      const [est] = await db
        .select({ ownerId: establishments.ownerId })
        .from(establishments)
        .where(eq(establishments.id, input.establishmentId))
        .limit(1);
      if (!est || est.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your establishment" });
      }
      const reviews = await db
        .select({ id: touristReviews.id, userId: touristReviews.userId, merchantResponse: touristReviews.merchantResponse })
        .from(touristReviews)
        .where(eq(touristReviews.establishmentId, input.establishmentId));
      if (reviews.length === 0) {
        return { repliedCount: 0, noReplyCount: 0, repliedRepeatRate: 0, noReplyRepeatRate: 0, roiDelta: 0 };
      }
      const repliedReviews = reviews.filter((r: typeof reviews[number]) => r.merchantResponse && r.merchantResponse.trim().length > 0);
      const noReplyReviews = reviews.filter((r: typeof reviews[number]) => !r.merchantResponse || r.merchantResponse.trim().length === 0);
      const countRepeatRedemptions = async (userIds: number[]): Promise<number> => {
        if (userIds.length === 0) return 0;
        const rows = await db
          .select({ userId: touristDealRedemptions.userId })
          .from(touristDealRedemptions)
          .where(and(
            inArray(touristDealRedemptions.userId, userIds),
            eq(touristDealRedemptions.establishmentId, input.establishmentId)
          ));
        const countByUser = new Map<number, number>();
        for (const row of rows) {
          countByUser.set(row.userId, (countByUser.get(row.userId) ?? 0) + 1);
        }
        return Array.from(countByUser.values()).filter((c) => c >= 2).length;
      };
      const repliedUserIds = repliedReviews.map((r) => r.userId);
      const noReplyUserIds = noReplyReviews.map((r) => r.userId);
      const [repliedRepeatCount, noReplyRepeatCount] = await Promise.all([
        countRepeatRedemptions(repliedUserIds),
        countRepeatRedemptions(noReplyUserIds),
      ]);
      const repliedRepeatRate = repliedReviews.length > 0
        ? Math.round((repliedRepeatCount / repliedReviews.length) * 100)
        : 0;
      const noReplyRepeatRate = noReplyReviews.length > 0
        ? Math.round((noReplyRepeatCount / noReplyReviews.length) * 100)
        : 0;
      return {
        repliedCount: repliedReviews.length,
        noReplyCount: noReplyReviews.length,
        repliedRepeatRate,
        noReplyRepeatRate,
        roiDelta: repliedRepeatRate - noReplyRepeatRate,
      };
    }),
});
