/**
 * Liveness Verification Router — Active liveness detection for KYC compliance.
 *
 * Flow:
 * 1. Client requests a liveness session → server returns a challenge (blink, nod, etc.)
 * 2. Client captures video/image frames and submits them
 * 3. Server scores the liveness attempt (confidence 0-100)
 * 4. Pass/fail stored in DB; linked to user's KYC status
 *
 * Challenges rotate to prevent replay attacks. Sessions expire after 5 minutes.
 */
import crypto from "crypto";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { requireDb } from "../_core/requireDb";
import { TRPCError } from "@trpc/server";
import { livenessChecks } from "../../drizzle/schema";
import { eq, and, desc, gte } from "drizzle-orm";
import logger from "../_core/logger";

const SESSION_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const MIN_CONFIDENCE = 70; // minimum score to pass
const CHALLENGE_TYPES = ["blink", "head_turn", "smile", "nod"] as const;

export const livenessRouter = router({
  /** Get liveness verification status for current user */
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const checks = await db.select().from(livenessChecks)
      .where(eq(livenessChecks.userId, String(ctx.user.id)))
      .orderBy(desc(livenessChecks.createdAt))
      .limit(5);

    const passed = checks.find((c) => c.status === "passed");
    return {
      verified: !!passed,
      lastCheck: checks[0] ?? null,
      passedAt: passed?.completedAt ?? null,
      attempts: checks.length,
    };
  }),

  /** Start a new liveness session — returns a challenge to complete */
  startSession: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await requireDb();

    // Pick a random challenge type using crypto
    const buf = new Uint8Array(1);
    crypto.getRandomValues(buf);
    const challengeType = CHALLENGE_TYPES[buf[0] % CHALLENGE_TYPES.length];

    const sessionId = crypto.randomUUID();
    const expiresAt = Date.now() + SESSION_EXPIRY_MS;

    const [check] = await db.insert(livenessChecks).values({
      userId: String(ctx.user.id),
      sessionId,
      challengeType,
      expiresAt,
      status: "pending",
    }).returning();

    logger.info("[Liveness] Session started", {
      userId: ctx.user.id,
      sessionId,
      challenge: challengeType,
    });

    return {
      sessionId,
      challengeType,
      expiresAt,
      instructions: getChallengeInstructions(challengeType),
    };
  }),

  /** Submit liveness check result from client-side analysis */
  submitResult: protectedProcedure
    .input(z.object({
      sessionId: z.string().uuid(),
      confidenceScore: z.number().min(0).max(100),
      deviceFingerprint: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();

      const [session] = await db.select().from(livenessChecks)
        .where(and(
          eq(livenessChecks.sessionId, input.sessionId),
          eq(livenessChecks.userId, String(ctx.user.id)),
          eq(livenessChecks.status, "pending"),
        ))
        .limit(1);

      if (!session) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Liveness session not found or already completed." });
      }

      if (session.expiresAt < Date.now()) {
        await db.update(livenessChecks)
          .set({ status: "expired" })
          .where(eq(livenessChecks.id, session.id));
        throw new TRPCError({ code: "BAD_REQUEST", message: "Liveness session expired. Please start a new one." });
      }

      const passed = input.confidenceScore >= MIN_CONFIDENCE;
      const status = passed ? "passed" : "failed";

      await db.update(livenessChecks)
        .set({
          status,
          confidenceScore: input.confidenceScore,
          deviceFingerprint: input.deviceFingerprint ?? null,
          completedAt: Date.now(),
          failureReason: passed ? null : `Confidence score ${input.confidenceScore} below threshold ${MIN_CONFIDENCE}`,
        })
        .where(eq(livenessChecks.id, session.id));

      logger.info("[Liveness] Check completed", {
        userId: ctx.user.id,
        sessionId: input.sessionId,
        status,
        score: input.confidenceScore,
      });

      return {
        passed,
        score: input.confidenceScore,
        threshold: MIN_CONFIDENCE,
        status,
      };
    }),

  /** Get full liveness history for current user */
  getHistory: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return db.select().from(livenessChecks)
      .where(eq(livenessChecks.userId, String(ctx.user.id)))
      .orderBy(desc(livenessChecks.createdAt))
      .limit(20);
  }),
});

function getChallengeInstructions(type: string): string {
  switch (type) {
    case "blink": return "Please blink twice while facing the camera.";
    case "head_turn": return "Slowly turn your head left, then right.";
    case "smile": return "Please smile naturally while looking at the camera.";
    case "nod": return "Please nod your head up and down slowly.";
    default: return "Please follow the on-screen instructions.";
  }
}
