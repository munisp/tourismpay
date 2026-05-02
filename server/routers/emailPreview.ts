/**
 * Email Preview Router
 *
 * Admin-only procedures for previewing and testing transactional email templates.
 * Allows compliance officers to review email copy before it goes live.
 */

import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { buildBisEmailHtml, sendTransactionalEmail } from "../_core/email";
import { ENV } from "../_core/env";

export const emailPreviewRouter = router({
  /**
   * Render a sample BIS email template for preview.
   * Returns the full HTML string for display in an iframe.
   */
  getTemplate: adminProcedure
    .input(
      z.object({
        status: z.enum(["completed", "flagged"]).default("completed"),
        merchantName: z.string().default("Alex Kamau"),
        establishmentName: z.string().default("Savanna Lodge Nairobi"),
        referenceId: z.string().default("BIS-2026-PREVIEW"),
        riskScore: z.number().min(0).max(100).default(28),
        riskLevel: z.string().default("low"),
        recommendation: z
          .string()
          .default(
            "Your establishment has passed all BIS checks. Please await KYB admin approval, which typically takes 1–3 business days."
          ),
        actionUrl: z.string().default("/merchant/bis-status"),
      })
    )
    .query(({ input }) => {
      const html = buildBisEmailHtml({
        merchantName: input.merchantName,
        establishmentName: input.establishmentName,
        referenceId: input.referenceId,
        status: input.status,
        riskScore: input.riskScore,
        riskLevel: input.riskLevel,
        recommendation: input.recommendation,
        actionUrl: input.actionUrl,
      });
      return {
        html,
        smtpConfigured: !!(ENV.smtpHost && ENV.smtpUser && ENV.smtpPass),
        smtpHost: ENV.smtpHost || null,
        smtpFrom: ENV.smtpFrom,
      };
    }),

  /**
   * Send a test email to the admin's own email address.
   * Uses the same sendTransactionalEmail helper as the real BIS job.
   */
  sendTest: adminProcedure
    .input(
      z.object({
        status: z.enum(["completed", "flagged"]).default("completed"),
        toEmail: z.string().email(),
        merchantName: z.string().default("Alex Kamau"),
        establishmentName: z.string().default("Savanna Lodge Nairobi"),
        referenceId: z.string().default("BIS-2026-PREVIEW"),
        riskScore: z.number().min(0).max(100).default(28),
        riskLevel: z.string().default("low"),
        recommendation: z
          .string()
          .default(
            "Your establishment has passed all BIS checks. Please await KYB admin approval."
          ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const html = buildBisEmailHtml({
        merchantName: input.merchantName,
        establishmentName: input.establishmentName,
        referenceId: input.referenceId,
        status: input.status,
        riskScore: input.riskScore,
        riskLevel: input.riskLevel,
        recommendation: input.recommendation,
        actionUrl: "/merchant/bis-status",
      });

      const subject =
        input.status === "completed"
          ? `[TEST] BIS Investigation Complete — ${input.establishmentName}`
          : `[TEST] BIS Investigation Requires Attention — ${input.establishmentName}`;

      const result = await sendTransactionalEmail({
        userId: ctx.user.id,
        to: input.toEmail,
        subject,
        text: `[TEST EMAIL] BIS investigation for ${input.establishmentName} (${input.referenceId}) is ${input.status}. Risk score: ${input.riskScore}/100 (${input.riskLevel}).`,
        html,
        category: "bis",
        actionUrl: "/merchant/bis-status",
        actionLabel: "View BIS Status",
      });

      return {
        sent: result.sent,
        method: result.method,
        to: input.toEmail,
        subject,
      };
    }),
});
