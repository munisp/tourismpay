/**
 * Email & Phone Verification Router — KYC-compliant identity verification
 * for tourist onboarding.
 *
 * Flow:
 * 1. User requests verification → 6-digit code generated → stored in DB
 * 2. Code sent via email (SMTP) or SMS (configurable provider)
 * 3. User submits code → verified within 10-minute window
 * 4. Verification status stored and checked during wallet activation
 */
import { z } from "zod";
import crypto from "crypto";
import { protectedProcedure, router } from "../_core/trpc";
import { requireDb } from "../_core/requireDb";
import { TRPCError } from "@trpc/server";
import { verificationCodes } from "../../drizzle/schema";
import { eq, and, gte, desc } from "drizzle-orm";
import logger from "../_core/logger";

const CODE_LENGTH = 6;
const CODE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;
const COOLDOWN_MS = 60_000; // 1 minute between resends

function generateCode(): string {
  const bytes = crypto.randomBytes(4);
  const num = bytes.readUInt32BE(0) % 1_000_000;
  return num.toString().padStart(CODE_LENGTH, "0");
}

export const verificationRouter = router({
  /** Get current verification status for the authenticated user. */
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const [emailCode] = await db.select().from(verificationCodes)
      .where(and(eq(verificationCodes.userId, String(ctx.user.id)), eq(verificationCodes.type, "email"), eq(verificationCodes.verified, true)))
      .limit(1);
    const [phoneCode] = await db.select().from(verificationCodes)
      .where(and(eq(verificationCodes.userId, String(ctx.user.id)), eq(verificationCodes.type, "phone"), eq(verificationCodes.verified, true)))
      .limit(1);
    return {
      emailVerified: !!emailCode,
      phoneVerified: !!phoneCode,
      emailVerifiedAt: emailCode?.verifiedAt ?? null,
      phoneVerifiedAt: phoneCode?.verifiedAt ?? null,
    };
  }),

  /** Request a verification code be sent to the user's email or phone. */
  requestCode: protectedProcedure
    .input(z.object({
      type: z.enum(["email", "phone"]),
      target: z.string().min(3), // email address or phone number
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();

      // Check cooldown — prevent spam
      const cutoff = Date.now() - COOLDOWN_MS;
      const [recent] = await db.select().from(verificationCodes)
        .where(and(
          eq(verificationCodes.userId, String(ctx.user.id)),
          eq(verificationCodes.type, input.type),
          gte(verificationCodes.createdAt, cutoff),
        ))
        .orderBy(desc(verificationCodes.createdAt))
        .limit(1);

      if (recent) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Please wait before requesting another code.",
        });
      }

      const code = generateCode();
      const expiresAt = Date.now() + CODE_EXPIRY_MS;

      await db.insert(verificationCodes).values({
        userId: String(ctx.user.id),
        type: input.type,
        target: input.target,
        code,
        expiresAt,
        attempts: 0,
        verified: false,
      });

      // Send verification code via real provider (falls back to console in dev)
      const { sendVerificationEmail, sendVerificationSms } = await import("../integrations/emailSms");
      if (input.type === "email") {
        const result = await sendVerificationEmail(input.target, code);
        logger.info(`[Verification] Email ${result.success ? "sent" : "failed"}`, {
          userId: ctx.user.id, provider: result.provider, messageId: result.messageId,
        });
      } else {
        const result = await sendVerificationSms(input.target, code);
        logger.info(`[Verification] SMS ${result.success ? "sent" : "failed"}`, {
          userId: ctx.user.id, provider: result.provider, messageId: result.messageId,
        });
      }

      return {
        sent: true,
        expiresAt,
        target: input.type === "email"
          ? input.target.replace(/(.{2}).*(@.*)/, "$1***$2") // Mask email
          : input.target.replace(/.(?=.{4})/g, "*"),         // Mask phone
      };
    }),

  /** Verify a submitted code. */
  verifyCode: protectedProcedure
    .input(z.object({
      type: z.enum(["email", "phone"]),
      code: z.string().length(CODE_LENGTH),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();

      // Find the most recent unexpired code for this user/type
      const [record] = await db.select().from(verificationCodes)
        .where(and(
          eq(verificationCodes.userId, String(ctx.user.id)),
          eq(verificationCodes.type, input.type),
          eq(verificationCodes.verified, false),
          gte(verificationCodes.expiresAt, Date.now()),
        ))
        .orderBy(desc(verificationCodes.createdAt))
        .limit(1);

      if (!record) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No active verification code. Please request a new one." });
      }

      if (record.attempts >= MAX_ATTEMPTS) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many attempts. Please request a new code." });
      }

      // Increment attempts
      await db.update(verificationCodes)
        .set({ attempts: record.attempts + 1 })
        .where(eq(verificationCodes.id, record.id));

      // Constant-time comparison
      const isValid = crypto.timingSafeEqual(
        Buffer.from(input.code),
        Buffer.from(record.code),
      );

      if (!isValid) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid verification code." });
      }

      // Mark as verified
      await db.update(verificationCodes)
        .set({ verified: true, verifiedAt: Date.now() })
        .where(eq(verificationCodes.id, record.id));

      logger.info(`[Verification] ${input.type} verified for user ${ctx.user.id}`);
      return { verified: true };
    }),
});
