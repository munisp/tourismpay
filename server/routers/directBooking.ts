import { z } from "zod";
import { protectedProcedure, merchantProcedure, publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";

export const directBookingRouter = router({
  // Public: get hotel booking page config by slug
  getHotelConfig: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const rows = await db.execute(sql`
        SELECT e.id, e.name, e.city, e.country, e.address, e.website, e.contact_email,
          e.latitude, e.longitude, e.rating, e.category, e.heritage, e.heritage_description
        FROM establishments e
        WHERE LOWER(REPLACE(e.name, ' ', '-')) = ${input.slug.toLowerCase()} AND e.kyb_status = 'approved'
        LIMIT 1
      `);
      if (!(rows as any[]).length) throw new TRPCError({ code: "NOT_FOUND", message: "Hotel not found" });
      return (rows as any[])[0];
    }),

  // Public: get available room types and rates
  getRoomAvailability: publicProcedure
    .input(z.object({ hotelId: z.string(), checkIn: z.string(), checkOut: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db.execute(sql`
        SELECT rt.id, rt.name, rt.description, rt.max_occupancy, rt.base_rate_ngn, rt.currency,
          rt.amenities, rt.image_url,
          (rt.total_rooms - COALESCE(booked.count, 0)) AS available_rooms
        FROM room_types rt
        LEFT JOIN (
          SELECT room_type_id, COUNT(*) as count FROM direct_bookings
          WHERE hotel_id = ${input.hotelId} AND status IN ('confirmed','checked_in')
          AND check_in < ${input.checkOut}::timestamp AND check_out > ${input.checkIn}::timestamp
          GROUP BY room_type_id
        ) booked ON booked.room_type_id = rt.id::text
        WHERE rt.hotel_id = ${input.hotelId} AND rt.is_active = true
        ORDER BY rt.base_rate_ngn ASC
      `);
      return rows as any[];
    }),

  // Create a direct booking (with Stripe payment)
  createBooking: publicProcedure
    .input(z.object({
      hotelId: z.string(),
      hotelSlug: z.string(),
      guestName: z.string().min(2),
      guestEmail: z.string().email(),
      guestPhone: z.string().optional(),
      guestPassport: z.string().optional(),
      roomType: z.string(),
      checkIn: z.string(),
      checkOut: z.string(),
      nights: z.number().int().min(1),
      ratePerNight: z.number().positive(),
      totalAmount: z.number().positive(),
      currency: z.string().default("NGN"),
      specialRequests: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const bookingId = `DB-${Date.now()}`;
      const confirmationCode = Math.random().toString(36).substring(2, 10).toUpperCase();
      const depositAmount = input.totalAmount * 0.3; // 30% deposit
      await db.execute(sql`
        INSERT INTO direct_bookings (id, hotel_id, hotel_slug, guest_name, guest_email, guest_phone,
          guest_passport, room_type, check_in, check_out, nights, rate_per_night, total_amount,
          deposit_amount, currency, status, confirmation_code, special_requests, source, created_at)
        VALUES (${bookingId}, ${input.hotelId}, ${input.hotelSlug}, ${input.guestName},
          ${input.guestEmail}, ${input.guestPhone ?? null}, ${input.guestPassport ?? null},
          ${input.roomType}, ${input.checkIn}::timestamp, ${input.checkOut}::timestamp,
          ${input.nights}, ${input.ratePerNight}, ${input.totalAmount}, ${depositAmount},
          ${input.currency}, 'pending', ${confirmationCode}, ${input.specialRequests ?? null},
          'direct', NOW())
      `);
      return { bookingId, confirmationCode, depositAmount, message: `Booking ${confirmationCode} created. Deposit of ${input.currency} ${depositAmount.toFixed(2)} required.` };
    }),

  // Confirm booking after payment
  confirmBooking: protectedProcedure
    .input(z.object({ bookingId: z.string(), stripePaymentIntentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db.execute(sql`
        UPDATE direct_bookings SET status = 'confirmed', stripe_payment_intent_id = ${input.stripePaymentIntentId}, confirmed_at = NOW()
        WHERE id = ${input.bookingId} AND status = 'pending'
      `);
      return { success: true, message: "Booking confirmed" };
    }),

  // Merchant: list bookings for their hotel
  myHotelBookings: merchantProcedure
    .input(z.object({ hotelId: z.string(), status: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const statusFilter = input.status ? sql`AND status = ${input.status}` : sql``;
      const rows = await db.execute(sql`
        SELECT * FROM direct_bookings WHERE hotel_id = ${input.hotelId} ${statusFilter}
        ORDER BY check_in ASC LIMIT 100
      `);
      return rows as any[];
    }),

  // Get booking by confirmation code
  getByConfirmation: publicProcedure
    .input(z.object({ confirmationCode: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const rows = await db.execute(sql`SELECT * FROM direct_bookings WHERE confirmation_code = ${input.confirmationCode.toUpperCase()} LIMIT 1`);
      if (!(rows as any[]).length) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found" });
      return (rows as any[])[0];
    }),
});
