/**
 * Audit Logs tRPC router
 *
 * Admin procedures to query the audit log and a public procedure
 * for the sidebar badge counts.
 */

import { z } from "zod";
import { complianceProcedure, protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { createAuditLog, getAuditLogs, getAuditLogStats, getSidebarBadgeCounts } from "../db";

// complianceProcedure allows admin + compliance_officer (defined in server/_core/trpc.ts)
const adminProcedure = complianceProcedure;

export const auditLogsRouter = router({
  // ─── List audit logs (admin only) ─────────────────────────────────────────
  list: adminProcedure
    .input(
      z.object({
        actorId: z.number().int().optional(),
        action: z.string().max(100).optional(),
        entityType: z.string().max(100).optional(),
        entityId: z.string().max(100).optional(),
        since: z.date().optional(),
        until: z.date().optional(),
        limit: z.number().int().min(1).max(200).default(100),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      return getAuditLogs(input);
    }),

  // ─── Audit log stats (admin only) ─────────────────────────────────────────
  stats: adminProcedure.query(async () => {
    return getAuditLogStats();
  }),

  // ─── Sidebar badge counts (protected, any authenticated user) ─────────────
  sidebarBadges: protectedProcedure.query(async () => {
    return getSidebarBadgeCounts();
  }),

  // ─── Manual audit log entry (admin only, for testing / manual events) ─────
  create: adminProcedure
    .input(
      z.object({
        action: z.string().max(100),
        entityType: z.string().max(100),
        entityId: z.string().max(100),
        description: z.string().optional(),
        before: z.record(z.string(), z.unknown()).optional(),
        after: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const log = await createAuditLog({
        actorId: ctx.user.id,
        actorName: ctx.user.name ?? undefined,
        actorEmail: ctx.user.email ?? undefined,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        description: input.description,
        before: input.before,
        after: input.after,
      });
      return { success: true, log };
    }),
});
