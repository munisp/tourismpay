/**
 * Notifications tRPC router
 *
 * Provides per-user notification inbox: list, unread count,
 * mark-read, mark-all-read, delete, and email-send procedures.
 *
 * Three notification channels:
 *   1. In-app (always) — stored in notifications table
 *   2. Push (when subscribed) — via Web Push
 *   3. Email (when SMTP configured + user has email) — via Nodemailer
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
  getDb,
} from "../db";
import { sendTransactionalEmail } from "../_core/email";
import { sendPushToUser } from "../_core/webPush";
import { logger } from "../_core/logger";

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
        category: z.enum(["kyb", "bis", "fraud", "soc", "system", "report", "wallet"]),
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

  // ─── Multi-channel notification: in-app + push + email ────────────────────
  sendMultiChannel: protectedProcedure
    .input(
      z.object({
        userId: z.number().int().positive(),
        category: z.enum(["kyb", "bis", "fraud", "soc", "system", "report", "wallet"]),
        title: z.string().min(1).max(255),
        content: z.string().min(1),
        actionUrl: z.string().max(500).optional(),
        actionLabel: z.string().max(100).optional(),
        channels: z.object({
          inApp: z.boolean().default(true),
          push: z.boolean().default(true),
          email: z.boolean().default(true),
        }).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin" && input.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not have required permission (10002)" });
      }

      const channels = input.channels ?? { inApp: true, push: true, email: true };
      const results: { inApp: boolean; push: boolean; email: { sent: boolean; method: string } } = {
        inApp: false,
        push: false,
        email: { sent: false, method: "none" },
      };

      // 1. In-app notification (always)
      if (channels.inApp) {
        try {
          await createUserNotification({
            userId: input.userId,
            category: input.category,
            title: input.title,
            content: input.content,
            actionUrl: input.actionUrl,
            actionLabel: input.actionLabel,
          });
          results.inApp = true;
        } catch (err) {
          logger.error("[Notification] In-app creation failed:", err);
        }
      }

      // 2. Web Push notification
      if (channels.push) {
        try {
          await sendPushToUser(input.userId, {
            title: input.title,
            body: input.content,
            url: input.actionUrl ?? "/notifications",
            tag: `${input.category}-${Date.now()}`,
            data: { category: input.category },
          });
          results.push = true;
        } catch {
          // Non-critical — user may not have push subscription
        }
      }

      // 3. Email notification
      if (channels.email) {
        try {
          const db = await getDb();
          if (db) {
            const { users } = await import("../../drizzle/schema");
            const { eq } = await import("drizzle-orm");
            const [user] = await db
              .select({ email: users.email, name: users.name })
              .from(users)
              .where(eq(users.id, input.userId))
              .limit(1);

            if (user?.email) {
              results.email = await sendTransactionalEmail({
                userId: input.userId,
                to: user.email,
                subject: `[TourismPay] ${input.title}`,
                text: input.content,
                html: buildNotificationEmailHtml({
                  recipientName: user.name ?? "User",
                  title: input.title,
                  content: input.content,
                  category: input.category,
                  actionUrl: input.actionUrl,
                  actionLabel: input.actionLabel ?? "View Details",
                }),
                category: input.category as "bis" | "kyb" | "system" | "fraud" | "soc" | "report" | "wallet",
                actionUrl: input.actionUrl,
                actionLabel: input.actionLabel,
              });
            }
          }
        } catch (err) {
          logger.error("[Notification] Email send failed:", err);
        }
      }

      return results;
    }),
});

/** Build a generic TourismPay notification email template */
function buildNotificationEmailHtml(opts: {
  recipientName: string;
  title: string;
  content: string;
  category: string;
  actionUrl?: string;
  actionLabel?: string;
}): string {
  const categoryColors: Record<string, string> = {
    bis: "#f59e0b",
    kyb: "#3b82f6",
    fraud: "#ef4444",
    soc: "#8b5cf6",
    system: "#6b7280",
    report: "#10b981",
    wallet: "#22c55e",
  };
  const color = categoryColors[opts.category] ?? "#6b7280";
  const categoryLabel = opts.category.toUpperCase();

  const ctaBlock = opts.actionUrl
    ? `<table cellpadding="0" cellspacing="0" style="margin-top:24px;">
        <tr>
          <td style="border-radius:8px;background:${color};">
            <a href="${opts.actionUrl}" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
              ${opts.actionLabel ?? "View Details"} &rarr;
            </a>
          </td>
        </tr>
      </table>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#0a0f1e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0f1e;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <tr>
            <td style="background:linear-gradient(135deg,#1e293b 0%,#0f172a 100%);border-radius:12px 12px 0 0;padding:24px 32px;border-bottom:1px solid #1e293b;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td><span style="font-size:20px;font-weight:700;color:#ffffff;">Tourism<span style="color:#22c55e;">Pay</span></span></td>
                  <td align="right">
                    <span style="display:inline-block;background:${color}22;color:${color};border:1px solid ${color}44;border-radius:16px;padding:3px 10px;font-size:11px;font-weight:600;">${categoryLabel}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:#111827;padding:32px;">
              <p style="margin:0 0 6px;font-size:13px;color:#94a3b8;">Hello, ${opts.recipientName}</p>
              <h1 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#ffffff;line-height:1.3;">${opts.title}</h1>
              <p style="margin:0;font-size:14px;color:#cbd5e1;line-height:1.6;">${opts.content}</p>
              ${ctaBlock}
            </td>
          </tr>
          <tr>
            <td style="background:#0f172a;border-radius:0 0 12px 12px;padding:20px 32px;border-top:1px solid #1e293b;">
              <p style="margin:0;font-size:11px;color:#475569;">This is an automated notification from TourismPay. &copy; ${new Date().getFullYear()} TourismPay.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
