import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { router, protectedProcedure, publicProcedure, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { establishments } from "../../drizzle/schema";
import {
  createEstablishment,
  getEstablishments,
  getEstablishmentById,
  updateEstablishmentKybStatus,
  createKybApplication,
  getKybApplicationsByEstablishment,
  updateKybApplicationStep,
} from "../db";

import { encryptPII } from "../_core/encryption";
import { logger } from "../_core/logger";
import { publishKybStatusChange } from "../_core/kafka";
import { requirePermission, RESOURCES, ACTIONS } from "../_core/permify";
import { recordKybApplication } from "../_core/metrics";
import { cacheGet, cacheSet } from "../_core/redis";

const KYB_SERVICE_URL = process.env.KYB_SERVICE_URL || "http://localhost:8083";

async function callKybService(path: string, body?: unknown): Promise<unknown> {
  try {
    const res = await fetch(`${KYB_SERVICE_URL}${path}`, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`KYB service error: ${res.status}`);
    return res.json();
  } catch (err) {
    logger.warn(`[KYB] Service call failed (${path}):`, err);
    return null;
  }
}

export const kybRouter = router({
  // ─── Establishments ────────────────────────────────────────────────────────

  listEstablishments: protectedProcedure
    .input(
      z.object({
        country: z.string().length(2).optional(),
        kybStatus: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }).optional()
    )
    .query(async ({ input }) => {
      return getEstablishments(input);
    }),

  getEstablishment: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const est = await getEstablishmentById(input.id);
      if (!est) throw new Error("Establishment not found");
      return est;
    }),

  createEstablishment: protectedProcedure
    .input(
      z.object({
        name: z.string().min(2),
        type: z.enum([
          "hotel", "restaurant", "concert_venue", "safari_lodge",
          "tour_operator", "airline", "car_rental", "spa_wellness",
          "museum", "theme_park", "beach_resort", "conference_center",
          "nightclub", "sports_venue", "travel_agency",
        ]),
        country: z.string().length(2),
        city: z.string().optional(),
        address: z.string().optional(),
        registrationNumber: z.string().optional(),
        taxId: z.string().optional(),
        contactEmail: z.string().email().optional(),
        contactPhone: z.string().optional(),
        website: z.string().url().optional(),
        employeeCount: z.number().optional(),
        annualRevenue: z.string().optional(),
        currency: z.string().length(3).default("USD"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const est = await createEstablishment({
        ...input,
        ownerId: ctx.user.id,
        kybStatus: "draft",
        registrationNumber: input.registrationNumber ? encryptPII(input.registrationNumber) : undefined,
        taxId: input.taxId ? encryptPII(input.taxId) : undefined,
        contactPhone: input.contactPhone ? encryptPII(input.contactPhone) : undefined,
      });

      // Notify Go KYB service of new establishment
      callKybService("/api/v1/establishments", {
        id: est?.id,
        name: input.name,
        type: input.type,
        country: input.country,
        registration_number: input.registrationNumber,
        tax_id: input.taxId,
      });

      return est;
    }),

  // ─── KYB Applications ──────────────────────────────────────────────────────

  startKybApplication: protectedProcedure
    .input(z.object({ establishmentId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const est = await getEstablishmentById(input.establishmentId);
      if (!est) throw new Error("Establishment not found");

      // Update establishment status to submitted
      await updateEstablishmentKybStatus(input.establishmentId, "submitted");

      // Create KYB application record
      const app = await createKybApplication({
        establishmentId: input.establishmentId,
        submittedBy: ctx.user.id,
        status: "submitted",
        currentStep: 1,
        totalSteps: 5,
      });

      // ── Kafka event + metrics ────────────────────────────────────────────────
      recordKybApplication();
      publishKybStatusChange({
        applicationId: app?.id,
        establishmentId: input.establishmentId,
        status: "submitted",
        submittedBy: ctx.user.id,
      }).catch(() => {});

      // Trigger Go KYB orchestrator
      callKybService("/api/v1/applications/start", {
        establishment_id: input.establishmentId,
        application_id: app?.id,
        country: est.country,
        type: est.type,
      });

      return app;
    }),

  getKybApplications: protectedProcedure
    .input(z.object({ establishmentId: z.number() }))
    .query(async ({ input }) => {
      return getKybApplicationsByEstablishment(input.establishmentId);
    }),

  advanceKybStep: protectedProcedure
    .input(
      z.object({
        applicationId: z.number(),
        step: z.number().min(1).max(5),
        documentsUploaded: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const status = input.step === 5 ? "under_review" : "submitted";
      const result = await updateKybApplicationStep(input.applicationId, input.step, status);

      // ── Auto-trigger BIS entity investigation on final submission (step 5) ──
      if (input.step === 5) {
        try {
          const db = await getDb();
          if (db) {
            // Look up the establishment linked to this application
            const { kybApplications: kybAppsTable } = await import("../../drizzle/schema");
            const appRows = await db
              .select({ establishmentId: kybAppsTable.establishmentId })
              .from(kybAppsTable)
              .where(eq(kybAppsTable.id, input.applicationId))
              .limit(1);
            if (appRows.length && appRows[0].establishmentId) {
              const estId = appRows[0].establishmentId;
              // Fetch establishment details for the BIS subject
              const estRows = await db
                .select({
                  name: establishments.name,
                  type: establishments.type,
                  country: establishments.country,
                  registrationNumber: establishments.registrationNumber,
                  website: establishments.website,
                  contactEmail: establishments.contactEmail,
                })
                .from(establishments)
                .where(eq(establishments.id, estId))
                .limit(1);
              if (estRows.length) {
                const est = estRows[0];
                // Check if a BIS investigation already exists for this establishment
                const { bisInvestigations } = await import("../../drizzle/schema");
                const { eq: eqFn } = await import("drizzle-orm");
                const existingBis = await db
                  .select({ id: bisInvestigations.id })
                  .from(bisInvestigations)
                  .where(eqFn(bisInvestigations.establishmentId, estId))
                  .limit(1);
                if (!existingBis.length) {
                  // Auto-create a standard-tier entity investigation
                  const { createBisInvestigation } = await import("../db");
                  await createBisInvestigation({
                    establishmentId: estId,
                    requestedBy: ctx.user.id,
                    subjectType: "entity",
                    subjectFullName: est.name,
                    subjectEmail: est.contactEmail ?? undefined,
                    subjectCountry: est.country ?? undefined,
                    entityRegistrationNumber: est.registrationNumber ?? undefined,
                    entityType: est.type ?? undefined,
                    entityWebsite: est.website ?? undefined,
                    tier: "standard",
                    status: "pending",
                    consentObtained: true,
                    pricePaid: "0.00",
                    currency: "USD",
                  });
                  logger.info(`[KYB] Auto-triggered BIS entity investigation for establishment #${estId} (${est.name})`);
                }
              }
            }
          }
        } catch (err) {
          // Non-fatal: log but don't block the KYB submission
          logger.warn("[KYB] Failed to auto-trigger BIS investigation:", err);
        }
      }

      return result;
    }),

  // Approve or reject a KYB application (admin only)
  reviewKybApplication: adminProcedure
    .input(
      z.object({
        establishmentId: z.number(),
        decision: z.enum(["approved", "rejected"]),
        notes: z.string().optional(),
        complianceScore: z.number().min(0).max(100).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requirePermission(String(ctx.user.id), ctx.user.role, RESOURCES.ESTABLISHMENT, ACTIONS.APPROVE);
      return updateEstablishmentKybStatus(
        input.establishmentId,
        input.decision,
        input.complianceScore,
        input.notes
      );
    }),

  // ─── Re-submission workflow for rejected merchants ─────────────────────────
  resubmit: protectedProcedure
    .input(
      z.object({
        establishmentId: z.number().int().positive(),
        updatedFields: z.object({
          name: z.string().min(2).optional(),
          registrationNumber: z.string().optional(),
          taxId: z.string().optional(),
          contactEmail: z.string().email().optional(),
          contactPhone: z.string().optional(),
          website: z.string().url().optional(),
          address: z.string().optional(),
        }).optional(),
        resubmissionNotes: z.string().min(10).max(2000),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [est] = await db
        .select()
        .from(establishments)
        .where(eq(establishments.id, input.establishmentId))
        .limit(1);

      if (!est) throw new TRPCError({ code: "NOT_FOUND", message: "Establishment not found" });
      if (est.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your establishment" });
      }
      if (est.kybStatus !== "rejected") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only rejected applications can be resubmitted. Current status: " + est.kybStatus,
        });
      }

      // Apply updated fields if provided
      const updates: Record<string, unknown> = {};
      if (input.updatedFields) {
        if (input.updatedFields.name) updates.name = input.updatedFields.name;
        if (input.updatedFields.registrationNumber) updates.registrationNumber = encryptPII(input.updatedFields.registrationNumber);
        if (input.updatedFields.taxId) updates.taxId = encryptPII(input.updatedFields.taxId);
        if (input.updatedFields.contactEmail) updates.contactEmail = input.updatedFields.contactEmail;
        if (input.updatedFields.contactPhone) updates.contactPhone = encryptPII(input.updatedFields.contactPhone);
        if (input.updatedFields.website) updates.website = input.updatedFields.website;
        if (input.updatedFields.address) updates.address = input.updatedFields.address;
      }

      // Reset status to submitted
      await db
        .update(establishments)
        .set({ ...updates, kybStatus: "submitted", updatedAt: new Date() })
        .where(eq(establishments.id, input.establishmentId));

      // Create a new KYB application for this resubmission
      const app = await createKybApplication({
        establishmentId: input.establishmentId,
        submittedBy: ctx.user.id,
        status: "submitted",
        currentStep: 1,
        totalSteps: 5,
      });

      // Log the resubmission
      logger.info(`[KYB] Resubmission for establishment #${input.establishmentId} by user #${ctx.user.id}: ${input.resubmissionNotes}`);

      // Notify KYB service
      callKybService("/api/v1/applications/resubmit", {
        establishment_id: input.establishmentId,
        application_id: app?.id,
        resubmission_notes: input.resubmissionNotes,
      });

      return { success: true, applicationId: app?.id, status: "submitted" };
    }),

  // ─── Merchant self-service status page data ──────────────────────────────────
  getOnboardingStatus: protectedProcedure
    .input(z.object({ establishmentId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [est] = await db
        .select()
        .from(establishments)
        .where(eq(establishments.id, input.establishmentId))
        .limit(1);
      if (!est) throw new TRPCError({ code: "NOT_FOUND", message: "Establishment not found" });
      if (est.ownerId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Get latest KYB application
      const apps = await getKybApplicationsByEstablishment(input.establishmentId);
      const latestApp = apps[0] ?? null;

      // Get document status
      const { kybDocuments: kybDocsTable } = await import("../../drizzle/schema");
      const docs = latestApp
        ? await db.select().from(kybDocsTable).where(eq(kybDocsTable.applicationId, latestApp.id))
        : [];

      const requiredDocs = [
        "certificate_of_incorporation",
        "business_license",
        "tax_certificate",
        "director_id",
        "proof_of_address",
      ];
      const uploadedTypes = new Set(docs.map((d: { documentType: string }) => d.documentType));
      const rejectedDocs = docs.filter((d: { status: string }) => d.status === "rejected");

      // BIS status
      const { bisInvestigations } = await import("../../drizzle/schema");
      const bisRows = await db
        .select({ id: bisInvestigations.id, status: bisInvestigations.status, createdAt: bisInvestigations.createdAt })
        .from(bisInvestigations)
        .where(eq(bisInvestigations.establishmentId, input.establishmentId))
        .limit(5);

      // Stripe Connect status
      const stripeStatus = est.stripeConnectStatus ?? "not_started";

      // Compute blockers
      const blockers: string[] = [];
      if (est.kybStatus === "rejected") blockers.push("KYB application was rejected — please resubmit with corrections");
      for (const req of requiredDocs) {
        if (!uploadedTypes.has(req)) blockers.push(`Missing document: ${req.replace(/_/g, " ")}`);
      }
      for (const doc of rejectedDocs) {
        blockers.push(`Document rejected: ${(doc as { documentType: string }).documentType.replace(/_/g, " ")} — please re-upload`);
      }
      if (!bisRows.some((r: { status: string }) => r.status === "completed")) {
        blockers.push("Background investigation not yet completed");
      }
      if (stripeStatus !== "active") {
        blockers.push("Stripe Connect not yet active — complete payout setup");
      }

      return {
        establishment: { id: est.id, name: est.name, kybStatus: est.kybStatus, createdAt: est.createdAt },
        application: latestApp,
        documents: {
          required: requiredDocs,
          uploaded: Array.from(uploadedTypes),
          completeness: Math.round((uploadedTypes.size / requiredDocs.length) * 100),
          rejectedCount: rejectedDocs.length,
        },
        bis: {
          status: bisRows.length ? bisRows[0].status : "none",
          investigationId: bisRows[0]?.id ?? null,
        },
        stripe: { status: stripeStatus },
        blockers,
        canGoLive: blockers.length === 0,
      };
    }),

  // Get KYB stats for dashboard
  stats: protectedProcedure.query(async () => {
    const cached = await cacheGet<Record<string, number>>("kyb:stats");
    if (cached) return cached;
    const [all, draft, submitted, underReview, approved, rejected] = await Promise.all([
      getEstablishments({ limit: 1000 }),
      getEstablishments({ kybStatus: "draft", limit: 1000 }),
      getEstablishments({ kybStatus: "submitted", limit: 1000 }),
      getEstablishments({ kybStatus: "under_review", limit: 1000 }),
      getEstablishments({ kybStatus: "approved", limit: 1000 }),
      getEstablishments({ kybStatus: "rejected", limit: 1000 }),
    ]);

    const result = {
      total: all.length,
      draft: draft.length,
      submitted: submitted.length,
      underReview: underReview.length,
      approved: approved.length,
      rejected: rejected.length,
    };
    await cacheSet("kyb:stats", result, 30);
    return result;
  }),

  // ─── Update establishment location ──────────────────────────────────────────
  updateLocation: protectedProcedure
    .input(
      z.object({
        establishmentId: z.number().int().positive(),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [est] = await db
        .select({ id: establishments.id, ownerId: establishments.ownerId })
        .from(establishments)
        .where(eq(establishments.id, input.establishmentId))
        .limit(1);
      if (!est) throw new TRPCError({ code: "NOT_FOUND", message: "Establishment not found" });
      if (est.ownerId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your establishment" });
      }
      await db
        .update(establishments)
        .set({
          latitude: String(input.latitude),
          longitude: String(input.longitude),
        })
        .where(eq(establishments.id, input.establishmentId));
      return { success: true, latitude: input.latitude, longitude: input.longitude };
    }),

  // Mobile KYB: get current user's KYB status
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error('Database unavailable');
    const est = await db
      .select({ id: establishments.id, kybStatus: establishments.kybStatus })
      .from(establishments)
      .where(eq(establishments.ownerId, ctx.user.id))
      .limit(1);
    if (!est.length) return { status: "not_started" as const, establishmentId: null };
    return { status: est[0].kybStatus ?? "pending", establishmentId: est[0].id };
  }),

  // Mobile KYB: submit application from mobile onboarding flow
  submitApplication: protectedProcedure
    .input(
      z.object({
        businessName: z.string().min(1),
        registrationNumber: z.string().min(1),
        businessType: z.enum([
          "hotel", "restaurant", "concert_venue", "safari_lodge",
          "tour_operator", "airline", "car_rental", "spa_wellness",
          "museum", "theme_park", "beach_resort", "conference_center",
          "nightclub", "sports_venue", "travel_agency",
        ]),
        country: z.string().min(1),
        address: z.string().optional(),
        website: z.string().optional(),
        contactEmail: z.string().email(),
        contactPhone: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database unavailable');
      const existing = await db
        .select({ id: establishments.id })
        .from(establishments)
        .where(eq(establishments.ownerId, ctx.user.id))
        .limit(1);
      let establishmentId: number;
      if (existing.length) {
        establishmentId = existing[0].id as number;
        await db
          .update(establishments)
          .set({ name: input.businessName, type: input.businessType, kybStatus: "submitted" })
          .where(eq(establishments.id, establishmentId));
      } else {
        const created = await createEstablishment({
          name: input.businessName,
          type: input.businessType,
          country: input.country.slice(0, 2).toUpperCase(),
          address: input.address,
          registrationNumber: input.registrationNumber,
          contactEmail: input.contactEmail,
          contactPhone: input.contactPhone,
          website: input.website,
          ownerId: ctx.user.id,
          kybStatus: "submitted",
        });
        establishmentId = (created as any)?.id ?? 0;
      }
      await createKybApplication({ establishmentId, submittedBy: ctx.user.id, status: "submitted", currentStep: 1, totalSteps: 5 });
      return { success: true, status: "pending", establishmentId };
    }),

  // Get supported countries and establishment types
  supportedCountries: publicProcedure.query(() => [
    { code: "NG", name: "Nigeria", currency: "NGN", flag: "🇳🇬" },
    { code: "KE", name: "Kenya", currency: "KES", flag: "🇰🇪" },
    { code: "ZA", name: "South Africa", currency: "ZAR", flag: "🇿🇦" },
    { code: "GH", name: "Ghana", currency: "GHS", flag: "🇬🇭" },
    { code: "TZ", name: "Tanzania", currency: "TZS", flag: "🇹🇿" },
    { code: "RW", name: "Rwanda", currency: "RWF", flag: "🇷🇼" },
    { code: "ET", name: "Ethiopia", currency: "ETB", flag: "🇪🇹" },
    { code: "EG", name: "Egypt", currency: "EGP", flag: "🇪🇬" },
    { code: "MA", name: "Morocco", currency: "MAD", flag: "🇲🇦" },
    { code: "SN", name: "Senegal", currency: "XOF", flag: "🇸🇳" },
    { code: "CI", name: "Côte d'Ivoire", currency: "XOF", flag: "🇨🇮" },
    { code: "UG", name: "Uganda", currency: "UGX", flag: "🇺🇬" },
  ]),
});
