import { z } from "zod";
import { protectedProcedure, merchantProcedure, adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";

export const groupTravelRouter = router({
  // Create a group booking / MICE enquiry
  createGroupBooking: protectedProcedure
    .input(z.object({
      groupName: z.string().min(2),
      hotelId: z.string(),
      eventType: z.enum(["conference", "wedding", "corporate", "leisure", "incentive"]),
      paxCount: z.number().int().min(10),
      roomsRequired: z.number().int().min(1),
      checkIn: z.string(),
      checkOut: z.string(),
      nights: z.number().int().min(1),
      ratePerRoomPerNight: z.number().positive(),
      currency: z.string().default("NGN"),
      attritionPct: z.number().min(0).max(50).default(20),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const totalAmount = input.roomsRequired * input.nights * input.ratePerRoomPerNight;
      const depositAmount = totalAmount * 0.25; // 25% deposit
      const bookingId = `GRP-${Date.now()}`;
      await db.execute(sql`
        INSERT INTO group_bookings (id, group_name, organizer_id, organizer_email, hotel_id, event_type,
          pax_count, rooms_required, check_in, check_out, nights, rate_per_room_per_night, total_amount,
          deposit_amount, deposit_paid, attrition_pct, currency, status, notes, created_at)
        VALUES (${bookingId}, ${input.groupName}, ${String(ctx.user.id)}, ${ctx.user.email ?? ""},
          ${input.hotelId}, ${input.eventType}, ${input.paxCount}, ${input.roomsRequired},
          ${input.checkIn}::timestamp, ${input.checkOut}::timestamp, ${input.nights},
          ${input.ratePerRoomPerNight}, ${totalAmount}, ${depositAmount}, 0,
          ${input.attritionPct}, ${input.currency}, 'draft', ${input.notes ?? null}, NOW())
      `);
      return { bookingId, totalAmount, depositAmount, message: `Group booking ${bookingId} created. Deposit of ${input.currency} ${depositAmount.toFixed(2)} required to confirm.` };
    }),

  // Get group booking details
  getGroupBooking: protectedProcedure
    .input(z.object({ bookingId: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const rows = await db.execute(sql`SELECT * FROM group_bookings WHERE id = ${input.bookingId} LIMIT 1`);
      if (!(rows as any[]).length) throw new TRPCError({ code: "NOT_FOUND", message: "Group booking not found" });
      return (rows as any[])[0];
    }),

  // List my group bookings
  myGroupBookings: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.execute(sql`SELECT * FROM group_bookings WHERE organizer_id = ${String(ctx.user.id)} ORDER BY created_at DESC LIMIT 50`);
    return rows as any[];
  }),

  // Merchant: list group bookings for their hotel
  hotelGroupBookings: merchantProcedure
    .input(z.object({ hotelId: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db.execute(sql`SELECT * FROM group_bookings WHERE hotel_id = ${input.hotelId} ORDER BY check_in ASC LIMIT 100`);
      return rows as any[];
    }),

  // Pay deposit
  payDeposit: protectedProcedure
    .input(z.object({ bookingId: z.string(), amount: z.number().positive(), paymentRef: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db.execute(sql`
        UPDATE group_bookings SET deposit_paid = deposit_paid + ${input.amount},
          status = CASE WHEN deposit_paid + ${input.amount} >= deposit_amount THEN 'confirmed' ELSE status END
        WHERE id = ${input.bookingId} AND organizer_id = ${String(ctx.user.id)}
      `);
      return { success: true, message: "Deposit payment recorded" };
    }),

  // Calculate attrition charge
  calculateAttrition: protectedProcedure
    .input(z.object({ bookingId: z.string(), actualRoomsUsed: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const rows = await db.execute(sql`SELECT * FROM group_bookings WHERE id = ${input.bookingId} LIMIT 1`);
      if (!(rows as any[]).length) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found" });
      const booking = (rows as any[])[0];
      const contractedRooms = Number(booking.rooms_required);
      const attritionPct = Number(booking.attrition_pct);
      const minRooms = Math.ceil(contractedRooms * (1 - attritionPct / 100));
      const shortfall = Math.max(0, minRooms - input.actualRoomsUsed);
      const chargePerRoom = Number(booking.rate_per_room_per_night) * Number(booking.nights) * 0.5;
      const attritionCharge = shortfall * chargePerRoom;
      return { contractedRooms, actualRoomsUsed: input.actualRoomsUsed, minRooms, shortfall, attritionCharge, currency: booking.currency };
    }),
});
