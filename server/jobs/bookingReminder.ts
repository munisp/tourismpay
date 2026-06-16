/**
 * Booking Reminder Job
 * Runs every 15 minutes. Finds confirmed bookings where:
 *  - bookingDate is between 23h and 25h from now (24h window)
 *  - reminderEnabled = true
 *  - reminderSentAt IS NULL (not yet sent)
 * Sends an owner notification and marks reminderSentAt.
 */

import { getDb } from "../db";
import { touristBookings, establishments, users } from "../../drizzle/schema";
import { eq, and, gte, lte, isNull } from "drizzle-orm";
import { notifyOwner } from "../_core/notification";
import { logger } from "../_core/logger";

export async function runBookingReminderJob(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const now = new Date();
  const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000); // 23h from now
  const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);   // 25h from now

  try {
    // Find bookings needing reminders
    const bookings = await db
      .select({
        id: touristBookings.id,
        serviceName: touristBookings.serviceName,
        bookingDate: touristBookings.bookingDate,
        partySize: touristBookings.partySize,
        confirmationCode: touristBookings.confirmationCode,
        establishmentId: touristBookings.establishmentId,
        userId: touristBookings.userId,
        estName: establishments.name,
        userName: users.name,
        userEmail: users.email,
      })
      .from(touristBookings)
      .leftJoin(establishments, eq(touristBookings.establishmentId, establishments.id))
      .leftJoin(users, eq(touristBookings.userId, users.id))
      .where(
        and(
          eq(touristBookings.status, "confirmed"),
          eq(touristBookings.reminderEnabled, true),
          isNull(touristBookings.reminderSentAt),
          gte(touristBookings.bookingDate, windowStart),
          lte(touristBookings.bookingDate, windowEnd)
        )
      )
      .limit(50); // Process max 50 per run

    if (bookings.length === 0) return;

    logger.info(`[BookingReminder] Processing ${bookings.length} reminder(s)`);

    for (const booking of bookings) {
      try {
        const bookingTime = new Date(booking.bookingDate).toLocaleString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "UTC",
        });

        const title = `⏰ Upcoming Booking Reminder`;
        const content = [
          `A confirmed booking is coming up in ~24 hours:`,
          ``,
          `📋 Service: ${booking.serviceName}`,
          `🏢 Establishment: ${booking.estName ?? "Unknown"}`,
          `👤 Guest: ${booking.userName ?? "Unknown"} (${booking.userEmail ?? "no email"})`,
          `👥 Party size: ${booking.partySize}`,
          `📅 Date & Time: ${bookingTime} UTC`,
          booking.confirmationCode ? `🔑 Confirmation: #${booking.confirmationCode}` : "",
        ].filter(Boolean).join("\n");

        await notifyOwner({ title, content });

        // Mark reminder as sent
        await db
          .update(touristBookings)
          .set({ reminderSentAt: new Date() })
          .where(eq(touristBookings.id, booking.id));

        logger.info(`[BookingReminder] Sent reminder for booking #${booking.id}`);
      } catch (err) {
        logger.error(`[BookingReminder] Failed for booking #${booking.id}:`, err);
      }
    }
  } catch (err) {
    logger.error("[BookingReminder] Job error:", err);
  }
}

/**
 * Start the booking reminder job — runs every 15 minutes.
 */
export function startBookingReminderJob(intervalMs = 15 * 60 * 1000): void {
  logger.info("[BookingReminder] Job started (interval: 15 min)");
  // Run once immediately, then on interval
  runBookingReminderJob().catch((err) => logger.error("Unhandled error", err));
  setInterval(() => {
    runBookingReminderJob().catch((err) => logger.error("Unhandled error", err));
  }, intervalMs);
}
