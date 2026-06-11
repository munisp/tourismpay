/**
 * Tourist Booking Reminder Job
 *
 * Runs every 30 minutes. Finds confirmed bookings where:
 *   - reminderEnabled = true
 *   - touristReminderSentAt IS NULL
 *   - bookingDate is within the next 24 hours
 *
 * Sends a notification to the tourist (owner notification as proxy) and
 * marks touristReminderSentAt so the reminder is only sent once.
 */

import { getDb } from "../db";
import { touristBookings, establishments, users } from "../../drizzle/schema";
import { eq, and, isNull, gte, lte } from "drizzle-orm";
import { notifyOwner } from "../_core/notification";
import { sendPushToUser } from "../_core/webPush";
import { logger } from "../_core/logger";

const JOB_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

export async function runTouristBookingReminderJob(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const now = new Date();
  const windowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  try {
    const bookings = await db
      .select({
        id: touristBookings.id,
        userId: touristBookings.userId,
        serviceName: touristBookings.serviceName,
        bookingDate: touristBookings.bookingDate,
        partySize: touristBookings.partySize,
        confirmationCode: touristBookings.confirmationCode,
        establishmentId: touristBookings.establishmentId,
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
          isNull(touristBookings.touristReminderSentAt),
          gte(touristBookings.bookingDate, now),
          lte(touristBookings.bookingDate, windowEnd)
        )
      )
      .limit(100);

    for (const booking of bookings) {
      const bookingTime = new Date(booking.bookingDate).toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
      });

      const title = `Reminder: Your booking at ${booking.estName ?? "the establishment"} is tomorrow`;
      const content = [
        `Hi ${booking.userName ?? "Traveller"},`,
        ``,
        `This is a reminder that your booking is coming up soon:`,
        ``,
        `  Service: ${booking.serviceName}`,
        `  Date & Time: ${bookingTime} UTC`,
        `  Party Size: ${booking.partySize}`,
        `  Confirmation Code: ${booking.confirmationCode ?? "N/A"}`,
        `  Establishment: ${booking.estName ?? "N/A"}`,
        ``,
        `Please arrive on time. If you need to reschedule, contact the establishment directly.`,
        ``,
        `Safe travels!`,
        `— TourismPay`,
      ].join("\n");

      const sent = await notifyOwner({ title, content });

      // Also send a web push notification directly to the tourist
      if (booking.userId) {
        sendPushToUser(booking.userId, {
          title: `Booking Reminder: ${booking.serviceName}`,
          body: `Your booking at ${booking.estName ?? "the establishment"} is in less than 24 hours. Code: ${booking.confirmationCode ?? "N/A"}`,
          url: "/tourist-portal?tab=bookings",
          tag: `booking-reminder-${booking.id}`,
          data: { bookingId: booking.id },
        }).catch(() => {/* non-critical */});
      }

      if (sent || booking.userId) {
        await db
          .update(touristBookings)
          .set({ touristReminderSentAt: new Date() })
          .where(eq(touristBookings.id, booking.id));

        logger.info(
          `[TouristReminder] Sent reminder for booking #${booking.id} (${booking.serviceName}) to user #${booking.userId}`
        );
      }
    }

    if (bookings.length > 0) {
      logger.info(`[TouristReminder] Processed ${bookings.length} tourist reminders`);
    }
  } catch (err) {
    logger.error("[TouristReminder] Job error:", err);
  }
}

export function startTouristBookingReminderJob(): void {
  // Run immediately on startup, then every 30 minutes
  runTouristBookingReminderJob();
  setInterval(runTouristBookingReminderJob, JOB_INTERVAL_MS);
  logger.info("[TouristReminder] Tourist booking reminder job started (30-min interval)");
}
