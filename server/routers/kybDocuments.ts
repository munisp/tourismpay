import { z } from "zod";
import crypto from "crypto";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import {
  createKybDocument,
  getKybDocumentsByApplication,
  getKybDocumentsByEstablishment,
  updateKybDocumentStatus,
  deleteKybDocument,
  getKybApplicationsByEstablishment,
  updateKybApplicationStep,
  getAllKybDocuments,
  getKybDocumentStats,
} from "../db";
import { notifyOwner } from "../_core/notification";
import { storagePut } from "../storage";
import { createAuditLog } from "../db";

// Allowed MIME types for KYB document uploads
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/tiff",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

// Max file size: 10 MB
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

function randomSuffix(): string {
  return crypto.randomUUID().replace(/-/g, "").substring(0, 8);
}

export const kybDocumentsRouter = router({
  // Upload a document for a KYB application
  upload: protectedProcedure
    .input(
      z.object({
        applicationId: z.number(),
        establishmentId: z.number(),
        documentType: z.enum([
          "certificate_of_incorporation",
          "business_license",
          "tax_certificate",
          "director_id",
          "proof_of_address",
          "bank_statement",
          "audited_accounts",
          "ownership_structure",
          "regulatory_approval",
          "other",
        ]),
        fileName: z.string().min(1).max(255),
        mimeType: z.string(),
        fileSizeBytes: z.number().min(1).max(MAX_FILE_SIZE_BYTES),
        // Base64-encoded file content
        fileDataBase64: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Validate MIME type
      if (!ALLOWED_MIME_TYPES.includes(input.mimeType)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `File type "${input.mimeType}" is not allowed. Accepted types: PDF, JPEG, PNG, WEBP, TIFF, DOC, DOCX.`,
        });
      }

      // Validate file size
      if (input.fileSizeBytes > MAX_FILE_SIZE_BYTES) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `File size exceeds the 10 MB limit.`,
        });
      }

      // Decode base64 to buffer
      let fileBuffer: Buffer;
      try {
        fileBuffer = Buffer.from(input.fileDataBase64, "base64");
      } catch {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid file data encoding.",
        });
      }

      // Build a non-enumerable S3 key
      const ext = input.fileName.split(".").pop() ?? "bin";
      const sanitizedName = input.fileName
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .substring(0, 100);
      const fileKey = `kyb-documents/est-${input.establishmentId}/app-${input.applicationId}/${input.documentType}-${randomSuffix()}-${sanitizedName}`;

      // Upload to S3
      let fileUrl: string;
      try {
        const result = await storagePut(fileKey, fileBuffer, input.mimeType);
        fileUrl = result.url;
      } catch (err) {
        console.error("[KYB Upload] S3 upload failed:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to upload document to storage. Please try again.",
        });
      }

      // Persist document record in PostgreSQL
      const doc = await createKybDocument({
        applicationId: input.applicationId,
        establishmentId: input.establishmentId,
        uploadedBy: ctx.user.id,
        documentType: input.documentType,
        status: "pending",
        fileName: input.fileName,
        fileKey,
        fileUrl,
        mimeType: input.mimeType,
        fileSizeBytes: input.fileSizeBytes,
      });

      // Update the KYB application's documentsUploaded list
      const apps = await getKybApplicationsByEstablishment(input.establishmentId);
      const app = apps.find((a) => a.id === input.applicationId);
      if (app) {
        const existingDocs: string[] = Array.isArray(app.documentsUploaded)
          ? (app.documentsUploaded as string[])
          : [];
        if (!existingDocs.includes(input.documentType)) {
          existingDocs.push(input.documentType);
        }
        await updateKybApplicationStep(
          input.applicationId,
          app.currentStep,
          app.status
        );
      }

      return doc;
    }),

  // List documents for a KYB application
  listByApplication: protectedProcedure
    .input(z.object({ applicationId: z.number() }))
    .query(async ({ input }) => {
      return getKybDocumentsByApplication(input.applicationId);
    }),

  // List all documents for an establishment
  listByEstablishment: protectedProcedure
    .input(z.object({ establishmentId: z.number() }))
    .query(async ({ input }) => {
      return getKybDocumentsByEstablishment(input.establishmentId);
    }),

  // Admin: review (approve/reject) a document
  review: adminProcedure
    .input(
      z.object({
        documentId: z.number(),
        status: z.enum(["verified", "rejected"]),
        reviewNotes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await updateKybDocumentStatus(
        input.documentId,
        input.status,
        ctx.user.id,
        input.reviewNotes
      );
      if (!result.length) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Document not found.",
        });
      }
      const doc = result[0]!;

      // Notify owner of document review decision
      const action = input.status === "verified" ? "Approved" : "Rejected";
      await notifyOwner({
        title: `KYB Document ${action}`,
        content: `Document #${doc.id} (${doc.documentType.replace(/_/g, " ")}) has been ${action.toLowerCase()} by admin ${ctx.user.name ?? ctx.user.email ?? "Unknown"}.${input.reviewNotes ? `\n\nReview Notes: ${input.reviewNotes}` : ""}`,
      }).catch(() => {});

      // Write audit log
      await createAuditLog({
        actorId: ctx.user.id,
        actorName: ctx.user.name ?? undefined,
        actorEmail: ctx.user.email ?? undefined,
        action: `kyb.document.${input.status}`,
        entityType: "kyb_document",
        entityId: String(doc.id),
        description: `Document "${doc.documentType.replace(/_/g, " ")}" (${doc.fileName}) ${action.toLowerCase()} by ${ctx.user.name ?? ctx.user.email ?? "admin"}.${input.reviewNotes ? ` Notes: ${input.reviewNotes}` : ""}`,
        before: { status: "pending" },
        after: { status: input.status, reviewNotes: input.reviewNotes },
      }).catch(() => {});

      return doc;
    }),

  // Delete a document (uploader or admin only)
  delete: protectedProcedure
    .input(z.object({ documentId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const docs = await getKybDocumentsByApplication(0); // We'll fetch by ID below
      // Fetch the specific document first to check ownership
      const { getDb } = await import("../db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const { kybDocuments } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const [doc] = await db
        .select()
        .from(kybDocuments)
        .where(eq(kybDocuments.id, input.documentId))
        .limit(1);

      if (!doc) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Document not found." });
      }

      // Only the uploader or an admin can delete
      if (doc.uploadedBy !== ctx.user.id && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to delete this document." });
      }

      // Note: S3 object is not deleted to preserve audit trail; only DB record is removed
      const deleted = await deleteKybDocument(input.documentId);
      return deleted[0];
    }),

  // Admin: list all documents across all establishments
  listAll: adminProcedure
    .input(
      z.object({
        status: z.enum(["pending", "verified", "rejected", "expired"]).optional(),
        documentType: z.string().optional(),
        establishmentId: z.number().optional(),
        limit: z.number().min(1).max(200).default(100),
        offset: z.number().min(0).default(0),
      }).optional()
    )
    .query(async ({ input }) => {
      return getAllKybDocuments(input);
    }),

  // Admin: get document review stats
  stats: adminProcedure.query(async () => {
    return getKybDocumentStats();
  }),

  // Admin: bulk approve or reject multiple documents
  bulkReview: adminProcedure
    .input(
      z.object({
        documentIds: z.array(z.number()).min(1).max(50),
        status: z.enum(["verified", "rejected"]),
        reviewNotes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const results = await Promise.all(
        input.documentIds.map((id) =>
          updateKybDocumentStatus(id, input.status, ctx.user.id, input.reviewNotes)
        )
      );
      const updated = results.flat();

      // Notify owner about bulk review action
      const action = input.status === "verified" ? "approved" : "rejected";
      await notifyOwner({
        title: `KYB Documents Bulk ${action.charAt(0).toUpperCase() + action.slice(1)}`,
        content: `Admin ${ctx.user.name ?? ctx.user.email ?? "Unknown"} has ${action} ${updated.length} KYB document(s).${input.reviewNotes ? `\n\nNotes: ${input.reviewNotes}` : ""}`,
      }).catch(() => {});

      // Write audit log for bulk action
      await createAuditLog({
        actorId: ctx.user.id,
        actorName: ctx.user.name ?? undefined,
        actorEmail: ctx.user.email ?? undefined,
        action: `kyb.document.bulk_${input.status}`,
        entityType: "kyb_document",
        entityId: input.documentIds.join(","),
        description: `Bulk ${action}: ${updated.length} document(s) by ${ctx.user.name ?? ctx.user.email ?? "admin"}.${input.reviewNotes ? ` Notes: ${input.reviewNotes}` : ""}`,
        before: { status: "pending", count: input.documentIds.length },
        after: { status: input.status, count: updated.length },
      }).catch(() => {});

      return { updated: updated.length, status: input.status };
    }),

  // Get document type labels for the UI — returns type-specific required docs
  documentTypes: protectedProcedure
    .input(z.object({ establishmentType: z.string().optional() }).optional())
    .query(({ input }) => {
      const estType = input?.establishmentType ?? "other";

      // Base documents required for ALL establishment types
      const base = [
        { value: "certificate_of_incorporation", label: "Certificate of Incorporation", required: true },
        { value: "business_license", label: "Business License / Operating Permit", required: true },
        { value: "tax_certificate", label: "Tax Registration Certificate", required: true },
        { value: "director_id", label: "Director / Owner ID Document", required: true },
        { value: "proof_of_address", label: "Proof of Business Address", required: true },
        { value: "bank_statement", label: "Bank Statement (last 3 months)", required: false },
        { value: "audited_accounts", label: "Audited Financial Accounts", required: false },
        { value: "ownership_structure", label: "Ownership Structure / Shareholding", required: false },
        { value: "regulatory_approval", label: "Regulatory Approval / Sector License", required: false },
        { value: "other", label: "Other Supporting Document", required: false },
      ];

      // Type-specific additional required documents
      const typeSpecific: Record<string, { value: string; label: string; required: boolean }[]> = {
        hotel: [
          { value: "star_rating_certificate", label: "Hotel Star Rating Certificate", required: true },
          { value: "fire_safety_certificate", label: "Fire Safety / Health & Safety Certificate", required: true },
        ],
        safari_lodge: [
          { value: "wildlife_permit", label: "Wildlife / Game Reserve Permit", required: true },
          { value: "environmental_clearance", label: "Environmental Impact Clearance", required: true },
          { value: "conservation_license", label: "Conservation Authority License", required: false },
        ],
        tour_operator: [
          { value: "tour_operator_license", label: "Tour Operator License", required: true },
          { value: "guide_certification", label: "Certified Tour Guide Credentials", required: true },
          { value: "public_liability_insurance", label: "Public Liability Insurance", required: true },
        ],
        airline: [
          { value: "air_operator_certificate", label: "Air Operator Certificate (AOC)", required: true },
          { value: "aviation_authority_license", label: "Civil Aviation Authority License", required: true },
          { value: "aircraft_insurance", label: "Aircraft Insurance Certificate", required: true },
        ],
        car_rental: [
          { value: "vehicle_fleet_registration", label: "Vehicle Fleet Registration Documents", required: true },
          { value: "vehicle_insurance", label: "Comprehensive Vehicle Insurance", required: true },
          { value: "transport_license", label: "Commercial Transport License", required: true },
        ],
        spa_wellness: [
          { value: "health_facility_license", label: "Health Facility / Wellness Center License", required: true },
          { value: "practitioner_certifications", label: "Practitioner Certifications", required: false },
        ],
        museum: [
          { value: "cultural_institution_registration", label: "Cultural Institution Registration", required: true },
          { value: "heritage_authority_approval", label: "Heritage Authority Approval", required: false },
        ],
        theme_park: [
          { value: "amusement_park_license", label: "Amusement / Theme Park Operating License", required: true },
          { value: "safety_inspection_certificate", label: "Rides & Attractions Safety Certificate", required: true },
          { value: "public_liability_insurance", label: "Public Liability Insurance", required: true },
        ],
        beach_resort: [
          { value: "coastal_development_permit", label: "Coastal Development / Beach Access Permit", required: true },
          { value: "environmental_clearance", label: "Environmental Impact Clearance", required: true },
          { value: "water_safety_certificate", label: "Water Safety / Lifeguard Certificate", required: false },
        ],
        concert_venue: [
          { value: "entertainment_license", label: "Entertainment / Events Venue License", required: true },
          { value: "fire_safety_certificate", label: "Fire Safety Certificate", required: true },
          { value: "noise_permit", label: "Noise / Sound Permit", required: false },
        ],
        nightclub: [
          { value: "liquor_license", label: "Liquor / Alcohol License", required: true },
          { value: "entertainment_license", label: "Entertainment License", required: true },
          { value: "fire_safety_certificate", label: "Fire Safety Certificate", required: true },
        ],
        sports_venue: [
          { value: "sports_facility_license", label: "Sports Facility Operating License", required: true },
          { value: "public_liability_insurance", label: "Public Liability Insurance", required: true },
          { value: "safety_inspection_certificate", label: "Safety Inspection Certificate", required: false },
        ],
        conference_center: [
          { value: "events_venue_license", label: "Events / Conference Venue License", required: true },
          { value: "fire_safety_certificate", label: "Fire Safety Certificate", required: true },
        ],
        travel_agency: [
          { value: "travel_agency_license", label: "Travel Agency License / IATA Accreditation", required: true },
          { value: "bonding_insurance", label: "Travel Bond / Client Protection Insurance", required: true },
        ],
        restaurant: [
          { value: "food_hygiene_certificate", label: "Food Hygiene / Health Certificate", required: true },
          { value: "liquor_license", label: "Liquor License (if applicable)", required: false },
        ],
      };

      const extra = typeSpecific[estType] ?? [];
      // Merge: type-specific docs come first (after base required docs)
      const required = base.filter((d) => d.required);
      const optional = base.filter((d) => !d.required);
      return [...required, ...extra, ...optional];
    }),
});
