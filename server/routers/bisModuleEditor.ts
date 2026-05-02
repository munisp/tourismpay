import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { updateBisModuleResults, getBisInvestigationById, calculateAndStoreComplianceScore } from "../db";
import { createAuditLog } from "../db";

const moduleResultSchema = z.object({
  score: z.number().min(0).max(100),
  status: z.enum(["clear", "flagged", "inconclusive", "pending"]),
  summary: z.string().max(500).optional(),
  findings: z.array(z.string()).optional(),
  analystOverride: z.boolean().optional(),
});

export const bisModuleEditorRouter = router({
  /**
   * Update module results for a BIS investigation (admin only).
   * Recalculates the overall risk score from the updated module scores.
   */
  updateModuleResults: protectedProcedure
    .input(
      z.object({
        investigationId: z.number().int().positive(),
        modules: z.object({
          identity: moduleResultSchema.optional(),
          criminal: moduleResultSchema.optional(),
          financial: moduleResultSchema.optional(),
          sanctions: moduleResultSchema.optional(),
          pep: moduleResultSchema.optional(),
          adverse_media: moduleResultSchema.optional(),
        }),
        analystNotes: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      }

      const existing = await getBisInvestigationById(input.investigationId);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Investigation not found" });
      }

      // Merge with existing module results so we don't overwrite untouched modules
      const existingModules =
        (existing.moduleResults as Record<string, unknown>) ?? {};
      const mergedModules = { ...existingModules, ...input.modules };

      const updated = await updateBisModuleResults(
        input.investigationId,
        mergedModules,
        input.analystNotes
      );

      if (!updated) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to update module results" });
      }

      // Write audit log
      await createAuditLog({
        actorId: ctx.user.id,
        actorName: ctx.user.name ?? "Admin",
        actorEmail: ctx.user.email ?? "",
        action: "bis.module_results.updated",
        entityType: "bis_investigation",
        entityId: String(input.investigationId),
        description: `Admin updated module results for ${existing.referenceId}. New risk score: ${updated.riskScore}/100 (${updated.riskLevel})`,
        before: { moduleResults: existingModules, riskScore: existing.riskScore, riskLevel: existing.riskLevel },
        after: { moduleResults: mergedModules, riskScore: updated.riskScore, riskLevel: updated.riskLevel },
      });

      return {
        success: true,
        investigation: updated,
        message: `Module results updated. New risk score: ${updated.riskScore}/100 (${updated.riskLevel})`,
      };
    }),

  /**
   * Get the current module results for an investigation.
   */
  getModuleResults: protectedProcedure
    .input(z.object({ investigationId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const inv = await getBisInvestigationById(input.investigationId);
      if (!inv) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Investigation not found" });
      }
      return {
        investigationId: inv.id,
        referenceId: inv.referenceId,
        moduleResults: (inv.moduleResults as Record<string, unknown>) ?? {},
        riskScore: inv.riskScore,
        riskLevel: inv.riskLevel,
        recommendations: inv.recommendations ?? [],
      };
    }),
});

export const kybComplianceRouter = router({
  /**
   * Recalculate and store the compliance score for a KYB application.
   * Scores are based on document completeness, verification status, and step progress.
   */
  recalculateScore: protectedProcedure
    .input(z.object({ applicationId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      }

      const updated = await calculateAndStoreComplianceScore(input.applicationId);
      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "KYB application not found" });
      }

      await createAuditLog({
        actorId: ctx.user.id,
        actorName: ctx.user.name ?? "Admin",
        actorEmail: ctx.user.email ?? "",
        action: "kyb.compliance_score.recalculated",
        entityType: "kyb_application",
        entityId: String(input.applicationId),
        description: `Compliance score recalculated: ${updated.complianceScore}/100. Risk flags: ${(updated.riskFlags as string[])?.join(", ") || "none"}`,
        after: { complianceScore: updated.complianceScore, riskFlags: updated.riskFlags },
      });

      return {
        success: true,
        applicationId: updated.id,
        complianceScore: updated.complianceScore,
        riskFlags: updated.riskFlags as string[],
        status: updated.status,
      };
    }),
});
