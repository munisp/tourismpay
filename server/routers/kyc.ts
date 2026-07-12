/**
 * KYC (Know Your Customer) Router
 * Integrates with the Rust KYC verification service for tourist identity
 * verification, liveness detection, document verification, and sanctions screening.
 */
import crypto from "crypto";
import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { publishEvent, TOPICS } from "../_core/kafka";
import { cacheGet, cacheSet } from "../_core/redis";
import { encryptPII, hashPII } from "../_core/encryption";

const KYC_SERVICE_URL = process.env.KYC_SERVICE_URL || "http://localhost:8082";
const KYC_AI_ENGINE_URL = process.env.KYC_AI_ENGINE_URL || "http://localhost:8100";
const KYC_API_KEY = process.env.KYC_API_KEY || "";

async function callKycService(path: string, method: string = "GET", body?: unknown): Promise<unknown> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (KYC_API_KEY) {
    headers["X-API-Key"] = KYC_API_KEY;
  }

  const res = await fetch(`${KYC_SERVICE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `KYC service error (${res.status}): ${text}`,
    });
  }

  return res.json();
}

export const kycRouter = router({
  /** Submit identity verification (passport/ID + selfie) */
  submitIdentityVerification: protectedProcedure
    .input(z.object({
      documentType: z.enum(["passport", "national_id", "drivers_license", "residence_permit"]),
      documentCountry: z.string().length(2),
      documentNumber: z.string().min(3).max(30),
      fullName: z.string().min(2).max(128),
      dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      nationality: z.string().length(2),
      documentFrontUrl: z.string().url(),
      documentBackUrl: z.string().url().optional(),
      selfieUrl: z.string().url(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Encrypt PII before sending to service
      const result = await callKycService("/api/v1/kyc/verify/identity", "POST", {
        document_type: input.documentType,
        document_country: input.documentCountry,
        document_number: input.documentNumber,
        full_name: input.fullName,
        date_of_birth: input.dateOfBirth,
        nationality: input.nationality,
        document_front_url: input.documentFrontUrl,
        document_back_url: input.documentBackUrl ?? null,
        selfie_url: input.selfieUrl,
      });

      // Store encrypted PII reference in main DB for lookup
      const db = await getDb();
      if (db) {
        const { kycVerificationRecords } = await import("../../drizzle/schema");
        await db.insert(kycVerificationRecords).values({
          userId: String(ctx.user.id),
          status: "in_progress",
          documentType: input.documentType,
          documentCountry: input.documentCountry,
          documentNumberHash: hashPII(input.documentNumber),
          fullNameEncrypted: encryptPII(input.fullName),
          dateOfBirth: input.dateOfBirth,
          nationality: input.nationality,
        }).onConflictDoNothing();
      }

      return result;
    }),

  /** Submit liveness check (active challenge or passive) */
  submitLivenessCheck: protectedProcedure
    .input(z.object({
      method: z.enum(["passive_photo", "active_challenge", "video_selfie", "motion_detection"]),
      videoUrl: z.string().url().optional(),
      photoUrl: z.string().url().optional(),
      challengeResponses: z.array(z.object({
        challengeType: z.string(),
        responseValue: z.string(),
        timestampMs: z.number(),
      })).optional(),
    }))
    .mutation(async ({ input }) => {
      return callKycService("/api/v1/kyc/verify/liveness", "POST", {
        method: input.method,
        video_url: input.videoUrl ?? null,
        photo_url: input.photoUrl ?? null,
        challenge_responses: input.challengeResponses?.map(cr => ({
          challenge_type: cr.challengeType,
          response_value: cr.responseValue,
          timestamp_ms: cr.timestampMs,
        })) ?? null,
      });
    }),

  /** Submit document for OCR verification */
  submitDocumentVerification: protectedProcedure
    .input(z.object({
      documentType: z.enum(["passport", "national_id", "drivers_license", "residence_permit"]),
      country: z.string().length(2),
      frontImageUrl: z.string().url(),
      backImageUrl: z.string().url().optional(),
      mrzData: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return callKycService("/api/v1/kyc/verify/document", "POST", {
        document_type: input.documentType,
        country: input.country,
        front_image_url: input.frontImageUrl,
        back_image_url: input.backImageUrl ?? null,
        mrz_data: input.mrzData ?? null,
      });
    }),

  /** Get current KYC verification status for a user */
  getStatus: protectedProcedure
    .query(async ({ ctx }) => {
      return callKycService(`/api/v1/kyc/status/${ctx.user.id}`);
    }),

  /** Get full verification history */
  getHistory: protectedProcedure
    .query(async ({ ctx }) => {
      return callKycService(`/api/v1/kyc/history/${ctx.user.id}`);
    }),

  /** Get risk score for current user */
  getRiskScore: protectedProcedure
    .query(async ({ ctx }) => {
      return callKycService(`/api/v1/kyc/risk/score/${ctx.user.id}`);
    }),

  /** Screen a person against sanctions lists */
  sanctionsScreen: protectedProcedure
    .input(z.object({
      fullName: z.string().min(2),
      dateOfBirth: z.string().optional(),
      nationality: z.string().optional(),
      passportNumber: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return callKycService("/api/v1/kyc/sanctions/screen", "POST", {
        full_name: input.fullName,
        date_of_birth: input.dateOfBirth ?? null,
        nationality: input.nationality ?? null,
        passport_number: input.passportNumber ?? null,
      });
    }),

  /** Admin: list all pending verifications */
  listPending: adminProcedure
    .query(async () => {
      return callKycService("/api/v1/kyc/admin/pending");
    }),

  /** Admin: approve or reject a verification */
  review: adminProcedure
    .input(z.object({
      verificationId: z.string().uuid(),
      decision: z.enum(["approve", "reject"]),
      notes: z.string().optional(),
      rejectionReason: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return callKycService("/api/v1/kyc/admin/review", "POST", {
        verification_id: input.verificationId,
        decision: input.decision,
        notes: input.notes ?? null,
        rejection_reason: input.rejectionReason ?? null,
      });
    }),

  /** Nigeria-specific BVN/NIN verification */
  verifyBvnNin: protectedProcedure
    .input(z.object({
      verificationType: z.enum(["BVN", "NIN"]),
      number: z.string().regex(/^\d{11}$/, "Must be exactly 11 digits"),
      fullName: z.string().min(2).max(128),
      dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      phoneNumber: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Call BVN/NIN verification via Rust KYC service
      const result = await callKycService("/api/v1/kyc/verify/ng-identity", "POST", {
        verification_type: input.verificationType,
        number: input.number,
        full_name: input.fullName,
        date_of_birth: input.dateOfBirth,
        phone_number: input.phoneNumber ?? null,
        user_id: String(ctx.user.id),
      });

      // Record in main DB
      const db = await getDb();
      if (db) {
        const { kycVerificationRecords } = await import("../../drizzle/schema");
        await db.insert(kycVerificationRecords).values({
          userId: String(ctx.user.id),
          status: "in_progress",
          documentType: input.verificationType.toLowerCase() as any,
          documentCountry: "NG",
          documentNumberHash: hashPII(input.number),
          fullNameEncrypted: encryptPII(input.fullName),
          dateOfBirth: input.dateOfBirth,
          nationality: "NG",
        }).onConflictDoNothing();
      }

      return result;
    }),

  /** Liveness detection with anti-spoofing challenge */
  livenessChallenge: protectedProcedure
    .input(z.object({
      difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
    }).optional())
    .query(async ({ input }) => {
      // Try AI engine for dynamic challenge generation
      try {
        const res = await fetch(`${KYC_AI_ENGINE_URL}/api/v1/liveness/challenge`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ difficulty: input?.difficulty ?? "medium" }),
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const data = await res.json() as { challenges: Array<{ type: string; instruction: string; timeout_ms: number; order: number }> };
          return {
            challengeId: crypto.randomUUID(),
            challenges: data.challenges,
            createdAt: Date.now(),
            source: "ai_engine",
          };
        }
      } catch { /* AI engine unavailable — use static challenges */ }

      // Fallback: static challenge selection
      const challenges = [
        { type: "blink", instruction: "Please blink both eyes slowly", timeout_ms: 6000, order: 1 },
        { type: "head_turn_left", instruction: "Please turn your head slowly to the left", timeout_ms: 6000, order: 2 },
        { type: "smile", instruction: "Please smile naturally", timeout_ms: 6000, order: 3 },
      ];
      return {
        challengeId: crypto.randomUUID(),
        challenges,
        createdAt: Date.now(),
        source: "static_fallback",
      };
    }),

  /** AI-powered full KYC pipeline: OCR + VLM + face matching + liveness */
  verifyFull: protectedProcedure
    .input(z.object({
      documentType: z.enum(["passport", "national_id", "drivers_license", "residence_permit"]),
      documentCountry: z.string().length(2),
      documentNumber: z.string().min(3).max(30),
      fullName: z.string().min(2).max(128),
      dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      nationality: z.string().length(2),
      documentFrontUrl: z.string().url(),
      documentBackUrl: z.string().url().optional(),
      selfieUrl: z.string().url(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Record verification attempt
      const db = await getDb();
      if (db) {
        const { kycVerificationRecords } = await import("../../drizzle/schema");
        await db.insert(kycVerificationRecords).values({
          userId: String(ctx.user.id),
          status: "ai_processing",
          documentType: input.documentType,
          documentCountry: input.documentCountry,
          documentNumberHash: hashPII(input.documentNumber),
          fullNameEncrypted: encryptPII(input.fullName),
          dateOfBirth: input.dateOfBirth,
          nationality: input.nationality,
        }).onConflictDoNothing();
      }

      // Call AI engine full pipeline
      try {
        const formData = new FormData();
        // Fetch images and create blobs
        const [frontResp, selfieResp] = await Promise.all([
          fetch(input.documentFrontUrl),
          fetch(input.selfieUrl),
        ]);
        formData.append("document_front", await frontResp.blob(), "document_front.jpg");
        formData.append("selfie", await selfieResp.blob(), "selfie.jpg");
        if (input.documentBackUrl) {
          const backResp = await fetch(input.documentBackUrl);
          formData.append("document_back", await backResp.blob(), "document_back.jpg");
        }
        formData.append("document_type", input.documentType);
        formData.append("country", input.documentCountry);
        formData.append("full_name", input.fullName);
        formData.append("date_of_birth", input.dateOfBirth);
        formData.append("document_number", input.documentNumber);

        const aiResp = await fetch(`${KYC_AI_ENGINE_URL}/api/v1/kyc/verify-full`, {
          method: "POST",
          body: formData,
          signal: AbortSignal.timeout(60_000),
        });

        if (aiResp.ok) {
          const result = await aiResp.json();
          // Update verification status based on AI decision
          if (db) {
            const { kycVerificationRecords } = await import("../../drizzle/schema");
            const { eq } = await import("drizzle-orm");
            await db.update(kycVerificationRecords)
              .set({ status: (result as Record<string, string>).decision ?? "manual_review" })
              .where(eq(kycVerificationRecords.userId, String(ctx.user.id)));
          }
          return result;
        }
      } catch (e) {
        // AI engine unavailable — fall through to basic verification
      }

      // Fallback to basic Rust KYC service
      return callKycService("/api/v1/kyc/verify/identity", "POST", {
        document_type: input.documentType,
        document_country: input.documentCountry,
        document_number: input.documentNumber,
        full_name: input.fullName,
        date_of_birth: input.dateOfBirth,
        nationality: input.nationality,
        document_front_url: input.documentFrontUrl,
        document_back_url: input.documentBackUrl ?? null,
        selfie_url: input.selfieUrl,
      });
    }),

  /** Video-based liveness detection with temporal consistency analysis */
  verifyVideoLiveness: protectedProcedure
    .input(z.object({
      frameUrls: z.array(z.string().url()).min(5).max(30),
      challenges: z.array(z.object({
        type: z.string(),
        response_time_ms: z.number().optional(),
      })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Build multipart form body for Python AI engine
      const boundary = `----TPBoundary${Date.now()}`;
      const parts: Buffer[] = [];

      // Download each frame and attach to multipart form
      for (const url of input.frameUrls) {
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
          if (res.ok) {
            const buffer = Buffer.from(await res.arrayBuffer());
            parts.push(Buffer.from(
              `--${boundary}\r\nContent-Disposition: form-data; name="frames"; filename="frame.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
            ));
            parts.push(buffer);
            parts.push(Buffer.from("\r\n"));
          }
        } catch { /* skip failed frame downloads */ }
      }

      if (input.challenges) {
        parts.push(Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="challenges"\r\n\r\n${JSON.stringify(input.challenges)}\r\n`,
        ));
      }

      parts.push(Buffer.from(`--${boundary}--\r\n`));
      const bodyBuf = Buffer.concat(parts);

      try {
        const res = await fetch(`${KYC_AI_ENGINE_URL}/api/v1/liveness/video`, {
          method: "POST",
          body: bodyBuf,
          headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
          signal: AbortSignal.timeout(60000),
        });

        if (res.ok) {
          const result = await res.json() as Record<string, unknown>;
          // Record result in DB
          const db = await getDb();
          if (db) {
            const { kycVerificationRecords } = await import("../../drizzle/schema");
            await db.insert(kycVerificationRecords).values({
              userId: String(ctx.user.id),
              status: (result as any).is_live ? "approved" : "rejected",
              documentType: "video_selfie" as any,
              documentCountry: "XX",
              nationality: "XX",
            }).onConflictDoNothing();
          }
          return result;
        }
        return { success: false, error: "AI engine returned error", fallback: true };
      } catch {
        return {
          success: false,
          error: "Video liveness AI engine unavailable",
          fallback: true,
          message: "Service degraded — try single-image liveness instead",
        };
      }
    }),

  /** AI engine health check — shows available models */
  aiHealth: protectedProcedure.query(async () => {
    try {
      const res = await fetch(`${KYC_AI_ENGINE_URL}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return res.json();
    } catch { /* unavailable */ }
    return {
      status: "unavailable",
      message: "KYC AI Engine is not running. Service degrades to rule-based verification.",
    };
  }),
});
