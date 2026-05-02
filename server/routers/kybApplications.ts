/**
 * KYB Applications admin tRPC router
 *
 * Admin-only procedures for listing all KYB applications with
 * document completeness, one-click approve/reject, and stats.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { complianceProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { sql, eq, and } from "drizzle-orm";
import { bisInvestigations, establishments } from "../../drizzle/schema";
import {
  getAllKybApplications,
  approveKybApplication,
  rejectKybApplication,
  getKybApplicationStats,
  getKybDocumentsByApplication,
  createUserNotification,
} from "../db";
import { notifyOwner } from "../_core/notification";
import { createAuditLog } from "../db";

// ─── Router ───────────────────────────────────────────────────────────────────
// complianceProcedure allows admin + compliance_officer (defined in server/_core/trpc.ts)
const adminProcedure = complianceProcedure;

export const kybApplicationsRouter = router({
  // ─── List all applications with establishment info ────────────────────────
  listAll: adminProcedure
    .input(
      z.object({
        status: z.enum(["draft", "submitted", "under_review", "approved", "rejected", "suspended"]).optional(),
        limit: z.number().int().min(1).max(200).default(100),
        offset: z.number().int().min(0).default(0),
      }).optional()
    )
    .query(async ({ input }) => {
      const apps = await getAllKybApplications({
        status: input?.status,
        limit: input?.limit ?? 100,
        offset: input?.offset ?? 0,
      });

        // Enrich each application with document completeness + BIS status
      type AppRow = (typeof apps)[number];
      const db2 = await getDb();
      const enriched = await Promise.all(
        apps.map(async (app: AppRow) => {
          const docs = await getKybDocumentsByApplication(app.id);
          const requiredTypes = [
            "certificate_of_incorporation",
            "business_license",
            "tax_certificate",
            "director_id",
            "proof_of_address",
          ];
          const uploadedTypes = new Set(docs.map((d: { documentType: string }) => d.documentType));
          const requiredUploaded = requiredTypes.filter((t) => uploadedTypes.has(t)).length;
          const docCompleteness = Math.round((requiredUploaded / requiredTypes.length) * 100);
          const verifiedCount = docs.filter((d: { status: string }) => d.status === "verified").length;
          const pendingCount = docs.filter((d: { status: string }) => d.status === "pending").length;
          const rejectedCount = docs.filter((d: { status: string }) => d.status === "rejected").length;
          // BIS status for this establishment
          let bisStatus: "none" | "pending" | "processing" | "completed" | "failed" = "none";
          if (db2 && app.establishmentId) {
            const bisRows = await db2
              .select({ status: bisInvestigations.status })
              .from(bisInvestigations)
              .where(eq(bisInvestigations.establishmentId, app.establishmentId))
              .orderBy(bisInvestigations.createdAt)
              .limit(10);
            if (bisRows.length) {
              const statuses = bisRows.map((r: { status: string }) => r.status);
              if (statuses.includes("completed")) bisStatus = "completed";
              else if (statuses.includes("processing")) bisStatus = "processing";
              else if (statuses.includes("pending")) bisStatus = "pending";
              else if (statuses.every((s: string) => s === "failed")) bisStatus = "failed";
            }
          }
          return {
            ...app,
            docCompleteness,
            totalDocs: docs.length,
            verifiedDocs: verifiedCount,
            pendingDocs: pendingCount,
            rejectedDocs: rejectedCount,
            bisStatus,
          };
        })
      );
      return enriched;
    }),

  // ─── Stats ────────────────────────────────────────────────────────────────
  stats: adminProcedure.query(async () => {
    return getKybApplicationStats();
  }),

  // ─── Approve a KYB application ─────────────────────────────────────────────
  approve: adminProcedure
    .input(
      z.object({
        applicationId: z.number().int().positive(),
        reviewNotes: z.string().max(1000).optional(),
        bypassBisCheck: z.boolean().optional().default(false),
        // bypassReason is REQUIRED when bypassBisCheck is true; validated at mutation level
        bypassReason: z.string().max(1000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // ── Validate bypassReason is provided when bypassing ──
      if (input.bypassBisCheck && (!input.bypassReason || input.bypassReason.trim().length < 10)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A bypass reason of at least 10 characters is required when overriding the BIS gate.",
        });
      }

      // ── BIS Gate: require a completed BIS investigation unless bypassed ──
      if (!input.bypassBisCheck) {
        const db = await getDb();
        if (db) {
          // Find the establishment linked to this KYB application
          const { kybApplications: kybAppsTable } = await import("../../drizzle/schema");
          const appRows = await db
            .select({ establishmentId: kybAppsTable.establishmentId })
            .from(kybAppsTable)
            .where(eq(kybAppsTable.id, input.applicationId))
            .limit(1);
          if (appRows.length && appRows[0].establishmentId) {
            const estId = appRows[0].establishmentId;
            const completedBis = await db
              .select({ id: bisInvestigations.id })
              .from(bisInvestigations)
              .where(
                and(
                  eq(bisInvestigations.establishmentId, estId),
                  eq(bisInvestigations.status, "completed")
                )
              )
              .limit(1);
            if (!completedBis.length) {
              // Find pending BIS investigation to link in the notification
              const pendingBis = await db
                .select({ id: bisInvestigations.id })
                .from(bisInvestigations)
                .where(eq(bisInvestigations.establishmentId, estId))
                .limit(1);
              const bisId = pendingBis[0]?.id ?? null;

              // Notify the merchant (submitter) that their KYB is held pending BIS
              const submitterRows = await db
                .select({ submittedBy: kybAppsTable.submittedBy, establishmentId: kybAppsTable.establishmentId })
                .from(kybAppsTable)
                .where(eq(kybAppsTable.id, input.applicationId))
                .limit(1);
              if (submitterRows.length && submitterRows[0].submittedBy) {
                await createUserNotification({
                  userId: submitterRows[0].submittedBy,
                  category: "kyb",
                  title: "KYB Approval Pending BIS Clearance",
                  content: [
                    "Your KYB application is currently on hold pending completion of a Background Investigation (BIS) check.",
                    "",
                    "This is a standard compliance step required before your establishment can go live on TourismPay.",
                    "",
                    bisId
                      ? `You can track the progress of your BIS investigation at the link below. Once it is marked as completed, your KYB application will be eligible for approval.`
                      : `A BIS investigation has not yet been initiated for your establishment. Please contact the compliance team for assistance.`,
                    "",
                    "If you have questions, please reach out to the TourismPay compliance team.",
                  ].join("\n"),
                  actionUrl: bisId ? `/bis/${bisId}` : "/kyb",
                  actionLabel: bisId ? "View BIS Investigation" : "Return to KYB Wizard",
                }).catch(() => null);
              }

              throw new TRPCError({
                code: "PRECONDITION_FAILED",
                message:
                  "No completed BIS investigation found for this establishment. Run a BIS investigation first, or enable the bypass flag to override this check.",
              });
            }
          }
        }
      }
      const app = await approveKybApplication(
        input.applicationId,
        ctx.user.id,
        input.reviewNotes
      );
      if (!app) {
        throw new TRPCError({ code: "NOT_FOUND", message: "KYB application not found" });
      }

      // Fetch establishment details for the rich notification
      const db2 = await getDb();
      let estName = "your establishment";
      let estContactEmail: string | null = null;
      if (db2 && app.establishmentId) {
        const { establishments: estsTable } = await import("../../drizzle/schema");
        const { eq: eqFn } = await import("drizzle-orm");
        const estRows = await db2
          .select({ name: estsTable.name, contactEmail: estsTable.contactEmail, country: estsTable.country })
          .from(estsTable)
          .where(eqFn(estsTable.id, app.establishmentId))
          .limit(1);
        if (estRows.length) {
          estName = estRows[0].name;
          estContactEmail = estRows[0].contactEmail ?? null;
        }
      }

      // Notify the submitter with a rich onboarding completion message
      if (app.submittedBy) {
        const payoutDay = "every Friday";
        const richContent = [
          `🎉 Congratulations! ${estName} is now fully verified on TourismPay.`,
          ``,
          `Your establishment is live and ready to accept tourist payments via QR codes.`,
          ``,
          `📅 First payout: Payouts are processed ${payoutDay}. Your first payout will arrive within 7 days of your first completed transaction.`,
          ``,
          `📊 Revenue Dashboard: Track real-time earnings, transaction history, and payout schedules at /merchant/revenue.`,
          ``,
          `🖨️ Cashier Terminal: Your staff can process payments at /merchant/cashier.`,
          ``,
          `📦 Product Catalog: Add your menu or service items at /merchant/products so tourists can browse before paying.`,
          ``,
          input.reviewNotes ? `Admin note: ${input.reviewNotes}` : `Welcome aboard — your TourismPay journey starts now!`,
        ].join("\n");

        await createUserNotification({
          userId: app.submittedBy,
          category: "kyb",
          title: `🎉 ${estName} is now LIVE on TourismPay!`,
          content: richContent,
          actionUrl: "/merchant/revenue",
          actionLabel: "Open Revenue Dashboard",
        }).catch(() => null);
      }

      // Notify owner
      await notifyOwner({
        title: "KYB Application Approved",
        content: `Application #${app.id} approved by ${ctx.user.name ?? ctx.user.email}. Notes: ${input.reviewNotes ?? "N/A"}`,
      }).catch(() => null);

      // Audit log — standard approval
      await createAuditLog({
        actorId: ctx.user.id,
        actorName: ctx.user.name ?? undefined,
        actorEmail: ctx.user.email ?? undefined,
        action: "kyb.application.approve",
        entityType: "kyb_application",
        entityId: String(app.id),
        description: `KYB application #${app.id} approved by ${ctx.user.name ?? ctx.user.email}.${input.reviewNotes ? ` Notes: ${input.reviewNotes}` : ""}`,
        before: { status: "submitted" },
        after: { status: "approved", reviewNotes: input.reviewNotes },
      }).catch(() => null);

      // Dedicated bypass audit log — written whenever bypassBisCheck was used
      if (input.bypassBisCheck) {
        await createAuditLog({
          actorId: ctx.user.id,
          actorName: ctx.user.name ?? undefined,
          actorEmail: ctx.user.email ?? undefined,
          action: "kyb_bis_bypass",
          entityType: "kyb_application",
          entityId: String(app.id),
          description: `Admin ${ctx.user.name ?? ctx.user.email} bypassed the BIS gate when approving KYB application #${app.id} for ${estName}. Bypass reason: ${input.bypassReason ?? "none"}. Review notes: ${input.reviewNotes ?? "none"}.`,
          before: { bisGateStatus: "not_completed" },
          after: { bisGateBypassed: true, approvedBy: ctx.user.email, bypassReason: input.bypassReason, reviewNotes: input.reviewNotes },
        }).catch(() => null);
      }

      return app;
    }),

  // ─── Reject a KYB application ─────────────────────────────────────────────
  reject: adminProcedure
    .input(
      z.object({
        applicationId: z.number().int().positive(),
        reviewNotes: z.string().min(1, "Rejection reason is required").max(1000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const app = await rejectKybApplication(
        input.applicationId,
        ctx.user.id,
        input.reviewNotes
      );
      if (!app) {
        throw new TRPCError({ code: "NOT_FOUND", message: "KYB application not found" });
      }

      // Notify the submitter
      if (app.submittedBy) {
        await createUserNotification({
          userId: app.submittedBy,
          category: "kyb",
          title: "KYB Application Rejected",
          content: `Your KYB application (ID: ${app.id}) was rejected. Reason: ${input.reviewNotes}. Please address the issues and resubmit.`,
          actionUrl: "/kyb",
          actionLabel: "View KYB Status",
        }).catch(() => null);
      }

      // Notify owner
      await notifyOwner({
        title: "KYB Application Rejected",
        content: `Application #${app.id} rejected by ${ctx.user.name ?? ctx.user.email}. Reason: ${input.reviewNotes}`,
      }).catch(() => null);

      // Audit log
      await createAuditLog({
        actorId: ctx.user.id,
        actorName: ctx.user.name ?? undefined,
        actorEmail: ctx.user.email ?? undefined,
        action: "kyb.application.reject",
        entityType: "kyb_application",
        entityId: String(app.id),
        description: `KYB application #${app.id} rejected by ${ctx.user.name ?? ctx.user.email}. Reason: ${input.reviewNotes}`,
        before: { status: "submitted" },
        after: { status: "rejected", reviewNotes: input.reviewNotes },
      }).catch(() => null);

      return app;
    }),

  // Compliance score distribution for radial/bar chart
  complianceScoreDistribution: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    // Bucket scores into ranges
    const rows = await db.execute(
      sql`SELECT
        CASE
          WHEN compliance_score IS NULL THEN 'No Score'
          WHEN compliance_score <= 20 THEN '0-20'
          WHEN compliance_score <= 40 THEN '21-40'
          WHEN compliance_score <= 60 THEN '41-60'
          WHEN compliance_score <= 80 THEN '61-80'
          ELSE '81-100'
        END as bucket,
        COUNT(*) as count
      FROM kyb_applications
      GROUP BY bucket
      ORDER BY bucket`
    );
    const bucketOrder = ['0-20', '21-40', '41-60', '61-80', '81-100', 'No Score'];
    const result = (rows as any[]).map((r: any) => ({ bucket: String(r.bucket), count: Number(r.count) }));
    return bucketOrder
      .map(b => result.find(r => r.bucket === b) ?? { bucket: b, count: 0 });
  }),
});
