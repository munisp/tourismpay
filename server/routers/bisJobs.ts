/**
 * BIS Jobs tRPC router
 *
 * Admin procedures to manually trigger the BIS auto-advance job
 * and check its current status.
 */

import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { runBisAutoAdvanceCycle, startBisAutoAdvanceJob, stopBisAutoAdvanceJob } from "../jobs/bisAutoAdvance";
import { getPendingBisInvestigations, getProcessingBisInvestigations } from "../db";

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "You do not have required permission (10002)" });
  }
  return next({ ctx });
});

export const bisJobsRouter = router({
  // ─── Manually trigger one auto-advance cycle ──────────────────────────────
  triggerAutoAdvance: adminProcedure.mutation(async () => {
    const result = await runBisAutoAdvanceCycle();
    return {
      success: true,
      advanced: result.advanced,
      completed: result.completed,
      errors: result.errors,
      message: `Cycle complete — ${result.advanced} advanced to processing, ${result.completed} completed/flagged`,
    };
  }),

  // ─── Queue status ─────────────────────────────────────────────────────────
  queueStatus: adminProcedure.query(async () => {
    const [pending, processing] = await Promise.all([
      getPendingBisInvestigations(100),
      getProcessingBisInvestigations(100),
    ]);
    return {
      pendingCount: pending.length,
      processingCount: processing.length,
      pending: pending.map((i) => ({
        id: i.id,
        referenceId: i.referenceId,
        subjectFullName: i.subjectFullName,
        tier: i.tier,
        createdAt: i.createdAt,
      })),
      processing: processing.map((i) => ({
        id: i.id,
        referenceId: i.referenceId,
        subjectFullName: i.subjectFullName,
        tier: i.tier,
        updatedAt: i.updatedAt,
      })),
    };
  }),
});
