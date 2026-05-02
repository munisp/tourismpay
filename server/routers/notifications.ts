/**
 * Notifications tRPC router
 *
 * Provides per-user notification inbox: list, unread count,
 * mark-read, mark-all-read, and delete procedures.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createUserNotification,
  getUserNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
} from "../db";

export const notificationsRouter = router({
  // ─── List notifications for the current user ─────────────────────────────
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
        unreadOnly: z.boolean().default(false),
        category: z.string().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      return getUserNotifications(ctx.user.id, {
        limit: input?.limit ?? 50,
        offset: input?.offset ?? 0,
        unreadOnly: input?.unreadOnly ?? false,
        category: input?.category,
      });
    }),

  // ─── Unread count badge ───────────────────────────────────────────────────
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const count = await getUnreadNotificationCount(ctx.user.id);
    return { count };
  }),

  // ─── Mark a single notification as read ──────────────────────────────────
  markRead: protectedProcedure
    .input(z.object({ notificationId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const row = await markNotificationRead(input.notificationId, ctx.user.id);
      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Notification not found or does not belong to you",
        });
      }
      return row;
    }),

  // ─── Mark all notifications as read ──────────────────────────────────────
  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    const updated = await markAllNotificationsRead(ctx.user.id);
    return { updated };
  }),

  // ─── Delete a notification ────────────────────────────────────────────────
  delete: protectedProcedure
    .input(z.object({ notificationId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const ok = await deleteNotification(input.notificationId, ctx.user.id);
      if (!ok) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Notification not found or does not belong to you",
        });
      }
      return { success: true };
    }),

  // ─── Internal: create a notification for a specific user (admin only) ────
  createForUser: protectedProcedure
    .input(
      z.object({
        userId: z.number().int().positive(),
        category: z.enum(["kyb", "bis", "fraud", "soc", "system", "report"]),
        title: z.string().min(1).max(255),
        content: z.string().min(1),
        actionUrl: z.string().max(500).optional(),
        actionLabel: z.string().max(100).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Only admins can create notifications for other users
      if (ctx.user.role !== "admin" && input.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not have required permission (10002)" });
      }
      const row = await createUserNotification({
        userId: input.userId,
        category: input.category,
        title: input.title,
        content: input.content,
        actionUrl: input.actionUrl,
        actionLabel: input.actionLabel,
      });
      return row;
    }),
});
