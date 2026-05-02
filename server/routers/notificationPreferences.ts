/**
 * Notification Preferences Router
 * Allows users to manage per-category notification toggles and delivery channels.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getNotificationPreferences,
  upsertNotificationPreferences,
} from "../db";

export const notificationPreferencesRouter = router({
  /**
   * Get the current user's notification preferences.
   * Returns defaults if no preferences have been saved yet.
   */
  get: protectedProcedure.query(async ({ ctx }) => {
    const prefs = await getNotificationPreferences(ctx.user.id);
    // Return defaults if not yet configured
    return prefs ?? {
      id: null,
      userId: ctx.user.id,
      bisEnabled: true,
      kybEnabled: true,
      fraudEnabled: true,
      socEnabled: true,
      systemEnabled: true,
      reportEnabled: true,
      wishlistExpiryAlerts: true,
      sentimentAlertThreshold: null,
      inAppEnabled: true,
      emailEnabled: false,
      quietHoursStart: null,
      quietHoursEnd: null,
      createdAt: null,
      updatedAt: null,
    };
  }),

  /**
   * Update the current user's notification preferences.
   * Uses upsert so first-time saves create the record.
   */
  update: protectedProcedure
    .input(
      z.object({
        bisEnabled: z.boolean().optional(),
        kybEnabled: z.boolean().optional(),
        fraudEnabled: z.boolean().optional(),
        socEnabled: z.boolean().optional(),
        systemEnabled: z.boolean().optional(),
        reportEnabled: z.boolean().optional(),
        wishlistExpiryAlerts: z.boolean().optional(),
        sentimentAlertThreshold: z.number().int().min(0).max(100).nullable().optional(),
        inAppEnabled: z.boolean().optional(),
        emailEnabled: z.boolean().optional(),
        quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
        quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Validate quiet hours: both must be set or both must be null
      if (
        (input.quietHoursStart !== undefined || input.quietHoursEnd !== undefined) &&
        input.quietHoursStart !== input.quietHoursEnd
      ) {
        const hasStart = input.quietHoursStart != null;
        const hasEnd = input.quietHoursEnd != null;
        if (hasStart !== hasEnd) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Both quietHoursStart and quietHoursEnd must be set together, or both cleared.",
          });
        }
      }

      const updated = await upsertNotificationPreferences(ctx.user.id, input);
      return updated;
    }),

  /**
   * Reset preferences to defaults.
   */
  reset: protectedProcedure.mutation(async ({ ctx }) => {
    return upsertNotificationPreferences(ctx.user.id, {
      bisEnabled: true,
      kybEnabled: true,
      fraudEnabled: true,
      socEnabled: true,
      systemEnabled: true,
      reportEnabled: true,
      wishlistExpiryAlerts: true,
      sentimentAlertThreshold: null,
      inAppEnabled: true,
      emailEnabled: false,
      quietHoursStart: null,
      quietHoursEnd: null,
    });
  }),
});
