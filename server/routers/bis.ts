import { z } from "zod";
import { router, protectedProcedure, publicProcedure, adminProcedure, bisProcedure } from "../_core/trpc";
import { ENV } from "../_core/env";
import { triggerKillSwitchFromBis } from "../bisKillSwitchBridge";
import { dispatchWebhookEvent } from "../webhookEngine";
import {
  createBisInvestigation,
  getBisInvestigations,
  getBisInvestigationById,
  updateBisInvestigationStatus,
} from "../db";
import { getDb } from "../db";
import { bisTimeline, bisInvestigations, bisDirectors, users, bisInvestigationNotes, bisExportSchedules, fraudAlerts, psSettlements, establishments } from "../../drizzle/schema";
import { eq, desc, and, count, sql, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

// ─── Auto-timeline helper ────────────────────────────────────────────────────
// Fire-and-forget: records a system timeline event for an investigation.
// Silently swallows errors so it never blocks the main mutation.
async function autoTimeline({
  investigationId,
  actorId,
  actorName,
  eventType,
  title,
  description,
  severity = "info",
  metadata,
}: {
  investigationId: number;
  actorId?: string;
  actorName?: string;
  eventType: string;
  title: string;
  description?: string;
  severity?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(bisTimeline).values({
      id: crypto.randomUUID(),
      investigationId,
      actorId: actorId ?? null,
      actorName: actorName ?? "System",
      eventType,
      title,
      description: description ?? null,
      metadata: metadata ?? null,
      severity,
      createdAt: Date.now(),
    });
  } catch {
    // Silently ignore — timeline is non-critical
  }
}

// BIS microservice proxy helpers
// Only proxy when the URL is explicitly configured via env vars.
// When not configured, all procedures fall back to the local DB.
async function callBisService(path: string, body?: unknown): Promise<unknown> {
  const baseUrl = ENV.bisCoreUrl;
  if (!baseUrl) return null; // Not configured — use DB fallback
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json", "X-Source": "tourismpay-pwa" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`BIS Core returned ${res.status}`);
    return res.json();
  } catch (err) {
    console.warn(`[BIS-Core] Service call failed (${path}):`, err);
    return null;
  }
}

async function callBisGateway(path: string, body?: unknown): Promise<unknown> {
  const baseUrl = ENV.bisGatewayUrl;
  if (!baseUrl) return null;
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json", "X-Source": "tourismpay-pwa" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`BIS Gateway returned ${res.status}`);
    return res.json();
  } catch (err) {
    console.warn(`[BIS-Gateway] Service call failed (${path}):`, err);
    return null;
  }
}

async function callBisAI(path: string, body?: unknown): Promise<unknown> {
  const baseUrl = ENV.bisAiUrl;
  if (!baseUrl) return null;
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json", "X-Source": "tourismpay-pwa" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`BIS AI returned ${res.status}`);
    return res.json();
  } catch (err) {
    console.warn(`[BIS-AI] Service call failed (${path}):`, err);
    return null;
  }
}

const tierPricing: Record<string, number> = {
  basic: 25,
  standard: 75,
  comprehensive: 150,
};

// Default SLA hours per risk level (admin can override via updateSlaConfig)
const DEFAULT_SLA_HOURS: Record<string, number> = {
  low: 72,
  medium: 48,
  high: 24,
  critical: 8,
};
// SLA config persisted to Redis with in-memory fallback
let slaConfig: Record<string, number> = { ...DEFAULT_SLA_HOURS };
const REDIS_SLA_KEY = "bis:sla_config";

async function loadSlaConfig(): Promise<void> {
  try {
    const { cacheGet } = await import("../middleware/redisClient");
    const cached = await cacheGet(REDIS_SLA_KEY);
    if (cached) slaConfig = { ...DEFAULT_SLA_HOURS, ...JSON.parse(cached) };
  } catch { /* use defaults */ }
}

async function persistSlaConfig(): Promise<void> {
  try {
    const { cacheSet } = await import("../middleware/redisClient");
    await cacheSet(REDIS_SLA_KEY, JSON.stringify(slaConfig), 0);
  } catch { /* in-memory only */ }
}

// Load on module init
loadSlaConfig().catch(() => {});



export const bisRouter = router({
  // List all investigations — accessible to admin + bis_analyst
  list: bisProcedure
    .input(
      z.object({
        status: z.string().optional(),
        riskLevel: z.string().optional(),
        establishmentId: z.number().optional(),
        subjectType: z.enum(["individual", "entity"]).optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }).optional()
    )
    .query(async ({ input }) => {
      return getBisInvestigations(input);
    }),

  // Get a single investigation by ID — accessible to admin + bis_analyst
  byId: bisProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const inv = await getBisInvestigationById(input.id);
      if (!inv) throw new Error("Investigation not found");
      return inv;
    }),

  /**
   * myEstablishmentStatus — merchant-facing procedure.
   * Returns the BIS investigation status for the current user's establishment,
   * including module results, timeline events, and KYB gate explanation.
   * Merchants can use this to track progress and understand what is delaying KYB approval.
   */
  myEstablishmentStatus: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;

    // Find the establishment owned by this user
    const { kybApplications: kybAppsTable } = await import("../../drizzle/schema");
    const [est] = await db
      .select({ id: establishments.id, name: establishments.name, kybStatus: establishments.kybStatus, type: establishments.type })
      .from(establishments)
      .where(eq(establishments.ownerId, ctx.user.id))
      .limit(1);
    if (!est) return null;

    // Find the most recent BIS investigation for this establishment
    const [inv] = await db
      .select()
      .from(bisInvestigations)
      .where(eq(bisInvestigations.establishmentId, est.id))
      .orderBy(desc(bisInvestigations.createdAt))
      .limit(1);

    if (!inv) {
      return {
        establishment: est,
        investigation: null,
        timeline: [],
        kybApplication: null,
        bisRequired: true,
        message: "No BIS investigation has been initiated for your establishment yet. The compliance team will start one after you submit your KYB application.",
      };
    }

    // Fetch timeline events for this investigation
    const timeline = await db
      .select()
      .from(bisTimeline)
      .where(eq(bisTimeline.investigationId, inv.id))
      .orderBy(desc(bisTimeline.createdAt))
      .limit(50);

    // Find the latest KYB application for this establishment
    const [kybApp] = await db
      .select({ id: kybAppsTable.id, status: kybAppsTable.status, createdAt: kybAppsTable.createdAt, reviewNotes: kybAppsTable.reviewNotes })
      .from(kybAppsTable)
      .where(eq(kybAppsTable.establishmentId, est.id))
      .orderBy(desc(kybAppsTable.createdAt))
      .limit(1);

    // Determine what message to show the merchant
    let message = "";
    if (inv.status === "completed" && est.kybStatus !== "approved") {
      message = "Your BIS investigation is complete. Your KYB application is now eligible for admin approval — this typically takes 1-3 business days.";
    } else if (inv.status === "completed") {
      message = "Your BIS investigation is complete and your establishment is approved. You are live on TourismPay.";
    } else if (inv.status === "processing") {
      message = "Your BIS investigation is in progress. Our compliance team is reviewing your business details. This typically takes 24-72 hours.";
    } else if (inv.status === "pending") {
      message = "Your BIS investigation has been queued and will begin processing shortly. No action is required from you at this time.";
    } else if (inv.status === "flagged") {
      message = "Your BIS investigation has been flagged for additional review. The compliance team will contact you if any further information is required.";
    } else if (inv.status === "failed") {
      message = "Your BIS investigation encountered an issue. Please contact the TourismPay compliance team for assistance.";
    }

    return {
      establishment: est,
      investigation: inv,
      timeline,
      kybApplication: kybApp ?? null,
      bisRequired: est.kybStatus !== "approved",
      message,
    };
  }),

  // Create a new BIS investigation (admin only — paid service)
  create: adminProcedure
    .input(
      z.object({
        // 'individual' = staff/person background check; 'entity' = company/establishment check
        subjectType: z.enum(["individual", "entity"]).default("individual"),
        subjectFullName: z.string().min(2),
        subjectDob: z.string().optional(),
        subjectNationality: z.string().optional(),
        subjectNin: z.string().optional(),
        subjectPhone: z.string().optional(),
        subjectEmail: z.string().email().optional().or(z.literal("")).transform((v) => v || undefined),
        subjectRole: z.string().optional(),
        subjectCountry: z.string().length(2).optional(),
        // Entity-specific fields (only for subjectType = 'entity')
        entityRegistrationNumber: z.string().max(100).optional(),
        entityType: z.string().max(50).optional(),
        entityWebsite: z.string().max(255).optional(),
        entityYearFounded: z.number().int().min(1800).max(new Date().getFullYear()).optional(),
        tier: z.enum(["basic", "standard", "comprehensive"]).default("standard"),
        establishmentId: z.number().optional(),
        consentObtained: z.boolean().default(false),
        linkedTransactionId: z.string().max(100).optional(), // PaymentSwitch: link to a transaction for fraud check
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Create the investigation record in PostgreSQL
      const inv = await createBisInvestigation({
        ...input,
        requestedBy: ctx.user.id,
        status: "pending",
        pricePaid: tierPricing[input.tier].toString(),
        currency: "USD",
      });

      // Set dueAt based on SLA config (default: medium = 48h)
      const slaKey = "medium"; // default until risk level is determined by AI scoring
      const slaH = slaConfig[slaKey] ?? 48;
      const dueAtMs = Date.now() + slaH * 60 * 60 * 1000;
      if (inv?.id) {
        const db2 = await getDb();
        if (db2) {
          await db2.update(bisInvestigations)
            .set({ dueAt: dueAtMs, slaHours: slaH })
            .where(eq(bisInvestigations.id, inv.id))
            .catch(() => {});
        }
      }
      // Auto-timeline: record investigation creation
      if (inv?.id) {
        autoTimeline({
          investigationId: inv.id,
          actorId: String(ctx.user.id),
          actorName: ctx.user.name ?? String(ctx.user.id),
          eventType: "created",
          title: `Investigation created — ${input.tier.toUpperCase()} tier`,
          description: `Subject: ${input.subjectFullName}. Consent: ${input.consentObtained ? "Yes" : "No"}.`,
          severity: "info",
          metadata: { tier: input.tier, consentObtained: input.consentObtained },
        }).catch(() => {});
      }

      // Fire-and-forget: trigger the Go BIS Core service asynchronously
      callBisService("/api/v1/investigations", {
        reference_id: inv?.referenceId,
        subject: {
          full_name: input.subjectFullName,
          dob: input.subjectDob,
          nationality: input.subjectNationality,
          nin: input.subjectNin,
          phone: input.subjectPhone,
          email: input.subjectEmail,
          country: input.subjectCountry,
        },
        tier: input.tier,
        consent_obtained: input.consentObtained,
      }).then((result: any) => {
        if (result?.investigation_id && inv?.id) {
          updateBisInvestigationStatus(inv.id, "processing", undefined, undefined, undefined);
          autoTimeline({
            investigationId: inv.id,
            actorName: "BIS Core",
            eventType: "status_change",
            title: "Status changed to Processing",
            description: "BIS Core service accepted the investigation and started processing.",
            severity: "info",
            metadata: { from: "pending", to: "processing" },
          }).catch(() => {});
        }
      });

      return inv;
    }),

  // Run AI risk scoring on an existing investigation (admin only)
  runAiScoring: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const inv = await getBisInvestigationById(input.id);
      if (!inv) throw new Error("Investigation not found");

      // Call the Python BIS AI service
      const aiResult: any = await callBisAI("/api/v1/risk-score", {
        investigation_id: inv.id,
        subject_name: inv.subjectFullName,
        subject_country: inv.subjectCountry,
        subject_phone: inv.subjectPhone,
        subject_email: inv.subjectEmail,
      });

       if (aiResult) {
        const riskScore = Math.round(aiResult.overall_risk_score ?? 50);
        const riskLevel =
          riskScore >= 80 ? "critical" :
          riskScore >= 60 ? "high" :
          riskScore >= 40 ? "medium" : "low";
        await updateBisInvestigationStatus(
          input.id,
          "completed",
          riskLevel,
          riskScore,
          aiResult
        );
        // Auto-timeline: AI scoring completed
        const severityMap: Record<string, string> = { low: "success", medium: "warning", high: "warning", critical: "critical" };
        autoTimeline({
          investigationId: input.id,
          actorName: "AI Risk Engine",
          eventType: "ai_score",
          title: `AI risk score: ${riskScore}/100 — ${riskLevel.toUpperCase()}`,
          description: `Overall risk score computed by AI engine. Risk level: ${riskLevel}.`,
          severity: severityMap[riskLevel] ?? "info",
          metadata: { riskScore, riskLevel, model: "bis-ai-v1" },
        }).catch(() => {});
      }
      return getBisInvestigationById(input.id);;
    }),

  // Update investigation status (admin only)
  updateStatus: adminProcedure
    .input(
      z.object({
        id: z.number(),
        status: z.enum(["pending", "processing", "completed", "flagged", "failed"]),
        riskLevel: z.enum(["low", "medium", "high", "critical"]).optional(),
        riskScore: z.number().min(0).max(100).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await updateBisInvestigationStatus(
        input.id,
        input.status,
        input.riskLevel,
        input.riskScore
      );
      // Auto-timeline: record status change
      const statusSeverityMap: Record<string, string> = {
        pending: "info",
        processing: "info",
        completed: "success",
        flagged: "warning",
        failed: "critical",
      };
      autoTimeline({
        investigationId: input.id,
        actorId: String(ctx.user.id),
        actorName: ctx.user.name ?? String(ctx.user.id),
        eventType: "status_change",
        title: `Status changed to ${input.status.charAt(0).toUpperCase() + input.status.slice(1)}`,
        description: input.riskLevel
          ? `Risk level: ${input.riskLevel.toUpperCase()}. Score: ${input.riskScore ?? "N/A"}/100.`
          : undefined,
        severity: statusSeverityMap[input.status] ?? "info",
        metadata: {
          status: input.status,
          riskLevel: input.riskLevel,
          riskScore: input.riskScore,
          updatedBy: ctx.user.id,
        },
      }).catch(() => {});
      // Notify owner when an investigation reaches a terminal state
      if (input.status === "completed" || input.status === "flagged" || input.status === "failed") {
        const inv = await getBisInvestigationById(input.id);
        if (inv) {
          const statusLabel = input.status.charAt(0).toUpperCase() + input.status.slice(1);
          const riskInfo = input.riskLevel
            ? `\nRisk Level: ${input.riskLevel.toUpperCase()}\nRisk Score: ${input.riskScore ?? "N/A"}/100`
            : "";
          const { notifyOwner } = await import("../_core/notification");
          await notifyOwner({
            title: `BIS Investigation ${statusLabel} — ${inv.referenceId}`,
            content: `Investigation for ${inv.subjectFullName} (Ref: ${inv.referenceId}) has been marked as ${statusLabel} by ${ctx.user.name ?? ctx.user.email ?? "Admin"}.${riskInfo}\n\nTier: ${String(inv.tier ?? "standard").toUpperCase()}\nConsent: ${inv.consentObtained ? "Yes" : "No"}`,
          }).catch(() => {});

          // PaymentSwitch integration: auto-create fraud alert if a transaction is linked
          if (inv.linkedTransactionId) {
            const db2 = await getDb();
            if (db2) {
              const alertId = `FA-BIS-${inv.referenceId}-${Date.now()}`;
              await db2.insert(fraudAlerts).values({
                alertId,
                transactionId: inv.linkedTransactionId,
                establishmentId: inv.establishmentId ?? undefined,
                severity: (input.riskLevel === "critical" ? "critical" :
                           input.riskLevel === "high" ? "high" :
                           input.riskLevel === "medium" ? "medium" : "low") as any,
                status: input.status === "flagged" ? "investigating" : "open",
                ruleTriggered: "BIS_INVESTIGATION_COMPLETE",
                description: `BIS investigation ${inv.referenceId} for ${inv.subjectFullName} completed with status ${input.status}. Risk score: ${input.riskScore ?? "N/A"}/100.`,
                amount: inv.pricePaid ?? undefined,
                currency: inv.currency ?? "USD",
                metadata: {
                  bisInvestigationId: inv.id,
                  bisReferenceId: inv.referenceId,
                  bisStatus: input.status,
                  bisRiskLevel: input.riskLevel,
                  bisRiskScore: input.riskScore,
                },
              }).catch(() => {});
            }
          }
        }
      }

      // ── Gap 2: Auto-activate PaymentSwitch kill switch for high/critical risk ───
      // Fire-and-forget: never block the status update on bridge errors.
      if (input.riskLevel === "high" || input.riskLevel === "critical") {
        getBisInvestigationById(input.id).then((invForBridge) => {
          if (invForBridge) {
            triggerKillSwitchFromBis({
              bisInvestigationId: invForBridge.id,
              bisReferenceId: invForBridge.referenceId,
              subjectFullName: invForBridge.subjectFullName,
              subjectCountry: invForBridge.subjectCountry,
              riskLevel: input.riskLevel!,
              riskScore: input.riskScore,
              bisStatus: input.status,
            }).catch(() => {});
          }
        }).catch(() => {});
      }
      // ── Gap 3: Dispatch BIS investigation status-change webhook ─────────────
      // Determine the most specific event type for this status change.
      const bisWebhookEvent =
        input.status === "flagged" && (input.riskLevel === "critical" || input.riskLevel === "high")
          ? "investigation.confirmed_fraud"
          : (input.riskLevel === "high" || input.riskLevel === "critical")
          ? "investigation.high_risk"
          : `investigation.${input.status}`;
      getBisInvestigationById(input.id).then((invForWebhook) => {
        dispatchWebhookEvent(bisWebhookEvent, {
          bisInvestigationId: input.id,
          bisReferenceId: invForWebhook?.referenceId ?? "",
          subjectFullName: invForWebhook?.subjectFullName ?? "",
          subjectCountry: invForWebhook?.subjectCountry ?? null,
          status: input.status,
          riskLevel: input.riskLevel ?? null,
          riskScore: input.riskScore ?? null,
          tier: invForWebhook?.tier ?? null,
          updatedAt: new Date().toISOString(),
        }).catch(() => {});
      }).catch(() => {});
      return result;
    }),

  // Get dashboard stats for BIS
  stats: protectedProcedure.query(async () => {
    const [all, pending, processing, completed, flagged] = await Promise.all([
      getBisInvestigations({ limit: 1000 }),
      getBisInvestigations({ status: "pending", limit: 1000 }),
      getBisInvestigations({ status: "processing", limit: 1000 }),
      getBisInvestigations({ status: "completed", limit: 1000 }),
      getBisInvestigations({ status: "flagged", limit: 1000 }),
    ]);

    const highRisk = (await getBisInvestigations({ riskLevel: "high", limit: 1000 })).length +
      (await getBisInvestigations({ riskLevel: "critical", limit: 1000 })).length;

    return {
      total: all.length,
      pending: pending.length,
      processing: processing.length,
      completed: completed.length,
      flagged: flagged.length,
      highRisk,
    };
  }),

  // Get tier pricing
  pricing: publicProcedure.query(() => tierPricing),

  // Bulk update status for multiple investigations (admin only)
  bulkUpdateStatus: adminProcedure
    .input(z.object({
      ids: z.array(z.number()).min(1).max(100),
      status: z.enum(["pending", "processing", "completed", "flagged"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const results: { id: number; success: boolean; error?: string }[] = [];
      for (const id of input.ids) {
        try {
          await updateBisInvestigationStatus(id, input.status);
          const { createAuditLog } = await import("../db");
          await createAuditLog({
            actorId: ctx.user.id,
            actorName: ctx.user.name || String(ctx.user.id),
            action: "bis.bulkUpdateStatus",
            entityType: "bis_investigation",
            entityId: String(id),
            after: { status: input.status },
          }).catch(() => {});
          results.push({ id, success: true });
        } catch (err) {
          results.push({ id, success: false, error: String(err) });
        }
      }
      const successCount = results.filter((r) => r.success).length;
      return { successCount, failCount: results.length - successCount, results };
    }),

  // Bulk export investigations as CSV (admin only)
  bulkExportCsv: adminProcedure
    .input(z.object({
      ids: z.array(z.number()).min(1).max(500),
    }))
    .mutation(async ({ input }) => {
      const rows: unknown[] = [];
      for (const id of input.ids) {
        const inv = await getBisInvestigationById(id);
        if (inv) rows.push(inv);
      }
      if (rows.length === 0) return { csv: "", filename: "bis-export.csv", rowCount: 0 };
      // Build CSV manually to avoid json2csv import complexity
      const fields = [
        "id", "referenceId", "tier", "status", "riskLevel", "riskScore",
        "subjectFullName", "subjectNationality", "subjectCountry",
        "consentObtained", "pricePaid", "currency",
        "completedAt", "createdAt",
      ] as const;
      const header = fields.join(",");
      const csvRows = (rows as Record<string, unknown>[]).map((row) =>
        fields.map((f) => {
          const val = row[f];
          if (val === null || val === undefined) return "";
          const str = String(val);
          return str.includes(",") || str.includes('"') || str.includes("\n")
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        }).join(",")
      );
      const csv = [header, ...csvRows].join("\n");
      const filename = `bis-bulk-export-${new Date().toISOString().slice(0, 10)}.csv`;
      return { csv, filename, rowCount: rows.length };
    }),

  // ── BIS Investigation Timeline ─────────────────────────────────────────────

  // Add a timeline event to an investigation
  addTimelineEvent: protectedProcedure
    .input(z.object({
      investigationId: z.number().int().positive(),
      eventType: z.enum(["status_change", "note", "document_uploaded", "ai_score", "osint_enrich", "risk_update", "assigned", "completed", "created", "flagged", "other"]),
      title: z.string().min(1).max(255),
      description: z.string().max(2000).optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
      severity: z.enum(["info", "warning", "critical", "success"]).default("info"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [inv] = await db.select({ id: bisInvestigations.id })
        .from(bisInvestigations)
        .where(eq(bisInvestigations.id, input.investigationId));
      if (!inv) throw new Error("Investigation not found");
      const event = {
        id: crypto.randomUUID(),
        investigationId: input.investigationId,
        actorId: String(ctx.user.id),
        actorName: ctx.user.name ?? String(ctx.user.id),
        eventType: input.eventType,
        title: input.title,
        description: input.description ?? null,
        metadata: input.metadata ?? null,
        severity: input.severity,
        createdAt: Date.now(),
      };
      await db.insert(bisTimeline).values(event);
      return { success: true, eventId: event.id };
    }),

  // Get the full timeline for an investigation (with optional filters)
  getTimeline: protectedProcedure
    .input(z.object({
      investigationId: z.number().int().positive(),
      limit: z.number().int().min(1).max(200).default(50),
      eventType: z.enum(["note", "status_change", "ai_score", "document_uploaded", "created", "system", "osint_enrich", "risk_update", "assigned", "completed", "flagged", "other"]).optional(),
      severity: z.enum(["info", "warning", "critical", "success"]).optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { events: [] };
      const [inv] = await db.select({ id: bisInvestigations.id })
        .from(bisInvestigations)
        .where(eq(bisInvestigations.id, input.investigationId));
      if (!inv) return { events: [] };
      // Build dynamic filter conditions
      const { and } = await import("drizzle-orm");
      const conditions: ReturnType<typeof eq>[] = [eq(bisTimeline.investigationId, input.investigationId)];
      if (input.eventType) conditions.push(eq(bisTimeline.eventType, input.eventType));
      if (input.severity) conditions.push(eq(bisTimeline.severity, input.severity));
      const events = await db
        .select()
        .from(bisTimeline)
        .where(and(...conditions))
        .orderBy(desc(bisTimeline.createdAt))
        .limit(input.limit);
      return { events };
    }),

  // Delete a timeline event (admin only)
  deleteTimelineEvent: adminProcedure
    .input(z.object({ eventId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.delete(bisTimeline).where(eq(bisTimeline.id, input.eventId));
      return { success: true };
    }),

  // Export timeline events for an investigation as CSV (admin only)
  exportTimeline: adminProcedure
    .input(z.object({
      investigationId: z.number().int().positive(),
      eventType: z.enum(["note", "status_change", "document_uploaded", "ai_score", "created", "system", "osint_enrich", "risk_update", "assigned", "completed", "flagged", "other"]).optional(),
      severity: z.enum(["info", "warning", "critical", "success"]).optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const conditions: ReturnType<typeof eq>[] = [eq(bisTimeline.investigationId, input.investigationId)];
      if (input.eventType) conditions.push(eq(bisTimeline.eventType, input.eventType));
      if (input.severity) conditions.push(eq(bisTimeline.severity, input.severity));
      const events = await db
        .select()
        .from(bisTimeline)
        .where(and(...conditions))
        .orderBy(desc(bisTimeline.createdAt));
      // Build CSV without external library to avoid ESM issues
      const headers = ["id", "investigationId", "eventType", "severity", "title", "description", "actorName", "actorId", "createdAt"];
      const escape = (v: unknown): string => {
        const s = v == null ? "" : String(v);
        return s.includes(",") || s.includes('"') || s.includes("\n")
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      };
      const rows = events.map(e =>
        [
          e.id,
          e.investigationId,
          e.eventType,
          e.severity ?? "",
          e.title ?? "",
          e.description ?? "",
          e.actorName ?? "",
          e.actorId ?? "",
          e.createdAt ? new Date(Number(e.createdAt)).toISOString() : "",
        ].map(escape).join(",")
      );
      const csv = [headers.join(","), ...rows].join("\n");
      const filename = `bis-timeline-${input.investigationId}-${new Date().toISOString().slice(0, 10)}.csv`;
      return { csv, filename, count: events.length };
    }),

  // ─── Investigation Assignment ─────────────────────────────────────────────

  assignInvestigation: adminProcedure
    .input(z.object({
      investigationId: z.number().int().positive(),
      assigneeId: z.number().int().positive().nullable(), // null = unassign
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      // Verify investigation exists
      const [inv] = await db.select({ id: bisInvestigations.id, referenceId: bisInvestigations.referenceId })
        .from(bisInvestigations).where(eq(bisInvestigations.id, input.investigationId)).limit(1);
      if (!inv) throw new TRPCError({ code: "NOT_FOUND", message: "Investigation not found" });
      let assigneeName: string | null = null;
      if (input.assigneeId !== null) {
        const [assignee] = await db.select({ id: users.id, name: users.name })
          .from(users).where(eq(users.id, input.assigneeId)).limit(1);
        if (!assignee) throw new TRPCError({ code: "NOT_FOUND", message: "Assignee user not found" });
        assigneeName = assignee.name ?? `User #${assignee.id}`;
      }
      await db.update(bisInvestigations).set({
        assignedToId: input.assigneeId,
        assignedToName: assigneeName,
        assignedAt: input.assigneeId ? new Date() : null,
        updatedAt: new Date(),
      }).where(eq(bisInvestigations.id, input.investigationId));
      // Auto-timeline entry
      const actorName = ctx.user.name ?? `Admin #${ctx.user.id}`;
      await autoTimeline({
        investigationId: input.investigationId,
        actorId: String(ctx.user.id),
        actorName,
        eventType: "note",
        severity: "info",
        title: input.assigneeId ? `Assigned to ${assigneeName}` : "Unassigned",
        description: input.assigneeId
          ? `Investigation assigned to ${assigneeName} by ${actorName}`
          : `Investigation unassigned by ${actorName}`,
      });
      return { success: true, assigneeName };
    }),

  getAdminUsers: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { users: [] };
    const admins = await db.select({ id: users.id, name: users.name, email: users.email })
      .from(users).where(eq(users.role, "admin"));
    return { users: admins };
  }),
  getSlaConfig: adminProcedure.query(() => {
    return { config: slaConfig, defaults: DEFAULT_SLA_HOURS };
  }),

  updateSlaConfig: adminProcedure
    .input(z.object({
      low: z.number().min(1).max(720).optional(),
      medium: z.number().min(1).max(720).optional(),
      high: z.number().min(1).max(720).optional(),
      critical: z.number().min(1).max(720).optional(),
    }))
    .mutation(({ input }) => {
      if (input.low !== undefined) slaConfig.low = input.low;
      if (input.medium !== undefined) slaConfig.medium = input.medium;
      if (input.high !== undefined) slaConfig.high = input.high;
      if (input.critical !== undefined) slaConfig.critical = input.critical;
      return { success: true, config: slaConfig };
    }),

  getSlaStats: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { total: 0, onTime: 0, overdue: 0, overdueRate: 0, byRiskLevel: {} };
    const nowMs = Date.now();
    const rows = await db
      .select({
        id: bisInvestigations.id,
        status: bisInvestigations.status,
        riskLevel: bisInvestigations.riskLevel,
        dueAt: bisInvestigations.dueAt,
      })
      .from(bisInvestigations);
    const active = rows.filter(r => r.status !== "completed" && r.status !== "failed");
    const overdue = active.filter(r => r.dueAt && r.dueAt < nowMs);
    const onTime = active.filter(r => !r.dueAt || r.dueAt >= nowMs);
    const byRiskLevel: Record<string, { total: number; overdue: number }> = {};
    for (const r of active) {
      const key = r.riskLevel ?? "unknown";
      if (!byRiskLevel[key]) byRiskLevel[key] = { total: 0, overdue: 0 };
      byRiskLevel[key].total++;
      if (r.dueAt && r.dueAt < nowMs) byRiskLevel[key].overdue++;
    }
    return {
      total: active.length,
      onTime: onTime.length,
      overdue: overdue.length,
      overdueRate: active.length > 0 ? Math.round((overdue.length / active.length) * 100) : 0,
      byRiskLevel,
    };
  }),

  // Get all active investigations that have breached their SLA deadline
  getSlaBreaches: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(200).default(50) }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { breaches: [], total: 0 };
      const nowMs = Date.now();
      const limit = input?.limit ?? 50;
      const rows = await db
        .select({
          id: bisInvestigations.id,
          referenceId: bisInvestigations.referenceId,
          subjectFullName: bisInvestigations.subjectFullName,
          status: bisInvestigations.status,
          riskLevel: bisInvestigations.riskLevel,
          dueAt: bisInvestigations.dueAt,
          slaHours: bisInvestigations.slaHours,
          assignedToId: bisInvestigations.assignedToId,
          assignedToName: bisInvestigations.assignedToName,
          createdAt: bisInvestigations.createdAt,
        })
        .from(bisInvestigations)
        .where(eq(bisInvestigations.status, "processing"))
        .orderBy(bisInvestigations.dueAt)
        .limit(limit * 3);
      const breaches = rows
        .filter(r => r.dueAt != null && Number(r.dueAt) < nowMs)
        .slice(0, limit)
        .map(r => ({
          id: r.id,
          referenceId: r.referenceId,
          subjectFullName: r.subjectFullName,
          status: r.status,
          riskLevel: r.riskLevel,
          dueAt: Number(r.dueAt),
          slaHours: r.slaHours,
          assignedToId: r.assignedToId,
          assignedToName: r.assignedToName,
          overdueByMs: nowMs - Number(r.dueAt),
          overdueByHours: Math.floor((nowMs - Number(r.dueAt)) / (60 * 60 * 1000)),
          createdAt: r.createdAt,
        }));
      return { breaches, total: breaches.length };
    }),

  // Admin: send SLA breach alerts to assigned analysts and owner
  sendSlaBreachAlerts: adminProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const nowMs = Date.now();
    const rows = await db
      .select({
        id: bisInvestigations.id,
        referenceId: bisInvestigations.referenceId,
        subjectFullName: bisInvestigations.subjectFullName,
        riskLevel: bisInvestigations.riskLevel,
        dueAt: bisInvestigations.dueAt,
        slaHours: bisInvestigations.slaHours,
        assignedToId: bisInvestigations.assignedToId,
        assignedToName: bisInvestigations.assignedToName,
      })
      .from(bisInvestigations)
      .where(eq(bisInvestigations.status, "processing"));
    const overdue = rows.filter(r => r.dueAt != null && Number(r.dueAt) < nowMs);
    if (overdue.length === 0) return { alerted: 0, ownerNotified: false };
    const { createUserNotification } = await import("../db");
    let alerted = 0;
    for (const inv of overdue) {
      if (inv.assignedToId) {
        const overdueHours = Math.floor((nowMs - Number(inv.dueAt)) / (60 * 60 * 1000));
        await createUserNotification({
          userId: inv.assignedToId,
          category: "bis",
          title: `⚠️ SLA Breach: ${inv.referenceId} is ${overdueHours}h overdue`,
          content: `Investigation ${inv.referenceId} for subject "${inv.subjectFullName}" has breached its ${inv.slaHours ?? "N/A"}h SLA deadline by ${overdueHours} hour(s). Risk level: ${inv.riskLevel ?? "unknown"}. Please complete this investigation immediately.`,
          actionUrl: `/bis/report/${inv.id}`,
          actionLabel: "View Investigation",
        }).catch(() => null);
        alerted++;
      }
    }
    const { notifyOwner } = await import("../_core/notification");
    const summary = overdue
      .slice(0, 10)
      .map(inv => {
        const hrs = Math.floor((nowMs - Number(inv.dueAt)) / (60 * 60 * 1000));
        return `• ${inv.referenceId} (${inv.riskLevel ?? "unknown"}) — ${hrs}h overdue, assigned to: ${inv.assignedToName ?? "Unassigned"}`;
      })
      .join("\n");
    const moreCount = overdue.length > 10 ? overdue.length - 10 : 0;
    await notifyOwner({
      title: `BIS SLA Breach Alert: ${overdue.length} investigation(s) overdue`,
      content: `${overdue.length} BIS investigation(s) have breached their SLA deadlines:\n\n${summary}${moreCount > 0 ? `\n... and ${moreCount} more` : ""}\n\nPlease review the BIS Dashboard immediately.`,
    }).catch(() => null);
    return { alerted, ownerNotified: true };
  }),

  // ─── My Assignments (for logged-in analyst) ──────────────────────────────
  getMyAssignments: protectedProcedure
    .input(z.object({
      status: z.enum(["pending", "processing", "completed", "failed", "all"]).default("all"),
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().default(0),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };
      const limit = input?.limit ?? 20;
      const offset = input?.offset ?? 0;
      const statusFilter = input?.status ?? "all";
      const nowMs = Date.now();

      const conditions: any[] = [eq(bisInvestigations.assignedToId, ctx.user.id)];
      if (statusFilter !== "all") {
        conditions.push(eq(bisInvestigations.status, statusFilter as any));
      }

      const rows = await db
        .select({
          id: bisInvestigations.id,
          referenceId: bisInvestigations.referenceId,
          subjectFullName: bisInvestigations.subjectFullName,
          status: bisInvestigations.status,
          riskLevel: bisInvestigations.riskLevel,
          riskScore: bisInvestigations.riskScore,
          tier: bisInvestigations.tier,
          dueAt: bisInvestigations.dueAt,
          assignedAt: bisInvestigations.assignedAt,
          assignedToName: bisInvestigations.assignedToName,
          createdAt: bisInvestigations.createdAt,
        })
        .from(bisInvestigations)
        .where(and(...conditions))
        .orderBy(desc(bisInvestigations.createdAt))
        .limit(limit)
        .offset(offset);

      const [countRow] = await db
        .select({ cnt: count() })
        .from(bisInvestigations)
        .where(and(...conditions));

      return {
        items: rows.map(r => ({
          ...r,
          dueAt: r.dueAt ? Number(r.dueAt) : null,
          assignedAt: r.assignedAt ? r.assignedAt.getTime() : null,
          createdAt: r.createdAt ? Number(r.createdAt) : null,
          isOverdue: r.dueAt != null && Number(r.dueAt) < nowMs && r.status !== "completed" && r.status !== "failed",
          overdueHours: r.dueAt != null && Number(r.dueAt) < nowMs
            ? Math.floor((nowMs - Number(r.dueAt)) / (60 * 60 * 1000))
            : null,
        })),
        total: Number(countRow?.cnt ?? 0),
      };
    }),

  // ── Risk Trend Analytics ──────────────────────────────────────────────────
  // Returns weekly risk score averages by risk level over the last N weeks
  getRiskTrend: protectedProcedure
    .input(z.object({ weeks: z.number().min(4).max(52).default(12) }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      const weeks = input?.weeks ?? 12;
      if (!db) {
        // Return deterministic fallback data seeded by week index (no random)
        const SEED_LOW =    [3,4,2,5,3,6,4,3,5,4,3,5];
        const SEED_MEDIUM = [2,1,3,2,1,2,3,2,1,2,3,2];
        const SEED_HIGH =   [1,0,1,1,2,1,0,1,2,1,0,1];
        const SEED_CRIT =   [0,0,0,1,0,0,0,0,1,0,0,0];
        const fallback = Array.from({ length: weeks }, (_, i) => {
          const weekStart = Date.now() - (weeks - 1 - i) * 7 * 24 * 60 * 60 * 1000;
          const si = i % 12;
          const low = SEED_LOW[si], medium = SEED_MEDIUM[si], high = SEED_HIGH[si], critical = SEED_CRIT[si];
          return {
            weekLabel: new Date(weekStart).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
            weekStart, low, medium, high, critical,
            total: low + medium + high + critical,
          };
        });
        return { trend: fallback, weeks };
      }
      // Build weekly buckets
      const nowMs = Date.now();
      const startMs = nowMs - weeks * 7 * 24 * 60 * 60 * 1000;
      // Query: count investigations per risk level per week
      const rows = await db.execute(
        sql`SELECT
              risk_level,
              FLOOR((created_at - ${startMs}) / (7 * 24 * 60 * 60 * 1000)) AS week_idx,
              COUNT(*) AS cnt
            FROM bis_investigations
            WHERE created_at >= ${startMs}
              AND risk_level IS NOT NULL
            GROUP BY risk_level, week_idx
            ORDER BY week_idx ASC`
      ) as any[];
      // Build a map: weekIdx -> { low, medium, high, critical }
      const weekMap: Record<number, { low: number; medium: number; high: number; critical: number }> = {};
      for (let i = 0; i < weeks; i++) weekMap[i] = { low: 0, medium: 0, high: 0, critical: 0 };
      for (const row of rows) {
        const idx = Math.min(Math.max(Number(row.week_idx), 0), weeks - 1);
        const level = String(row.risk_level) as "low" | "medium" | "high" | "critical";
        if (weekMap[idx] && level in weekMap[idx]) {
          weekMap[idx][level] += Number(row.cnt);
        }
      }
      const trend = Array.from({ length: weeks }, (_, i) => {
        const weekStart = startMs + i * 7 * 24 * 60 * 60 * 1000;
        const counts = weekMap[i];
        return {
          weekLabel: new Date(weekStart).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          weekStart,
          ...counts,
          total: counts.low + counts.medium + counts.high + counts.critical,
        };
      });
      return { trend, weeks };
    }),

  // ─── Investigation Notes ──────────────────────────────────────────────────
  addNote: protectedProcedure
    .input(z.object({
      investigationId: z.number().int().positive(),
      content: z.string().min(1).max(5000),
      isInternal: z.boolean().optional().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      // Verify investigation exists
      const [inv] = await db
        .select({ id: bisInvestigations.id })
        .from(bisInvestigations)
        .where(eq(bisInvestigations.id, input.investigationId))
        .limit(1);
      if (!inv) throw new TRPCError({ code: "NOT_FOUND", message: "Investigation not found" });
      // Non-admins cannot post internal notes
      if (input.isInternal && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can post internal notes" });
      }
      const [note] = await db
        .insert(bisInvestigationNotes)
        .values({
          investigationId: String(input.investigationId),
          authorId: String(ctx.user.id),
          authorName: ctx.user.name ?? ctx.user.email ?? "Unknown",
          content: input.content,
          isInternal: input.isInternal,
        })
        .returning();
      return note;
    }),

  getNotes: protectedProcedure
    .input(z.object({
      investigationId: z.number().int().positive(),
      includeInternal: z.boolean().optional().default(false),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions: ReturnType<typeof eq>[] = [
        eq(bisInvestigationNotes.investigationId, String(input.investigationId)),
      ];
      // Non-admins only see public notes
      if (ctx.user.role !== "admin" || !input.includeInternal) {
        conditions.push(eq(bisInvestigationNotes.isInternal, false));
      }
      const notes = await db
        .select()
        .from(bisInvestigationNotes)
        .where(and(...conditions))
        .orderBy(desc(bisInvestigationNotes.createdAt));
      return notes;
    }),

  deleteNote: adminProcedure
    .input(z.object({ noteId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [deleted] = await db
        .delete(bisInvestigationNotes)
        .where(eq(bisInvestigationNotes.id, input.noteId))
        .returning({ id: bisInvestigationNotes.id });
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
      return { success: true };
    }),

  // ─── Export Notes as formatted text (for client-side PDF download) ────────────
  exportNotes: protectedProcedure
    .input(z.object({
      investigationId: z.number().int().positive(),
      includeInternal: z.boolean().default(false),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      // Fetch investigation metadata
      const [inv] = await db
        .select({ referenceId: bisInvestigations.referenceId, subjectFullName: bisInvestigations.subjectFullName })
        .from(bisInvestigations)
        .where(eq(bisInvestigations.id, input.investigationId))
        .limit(1);
      if (!inv) throw new TRPCError({ code: "NOT_FOUND", message: "Investigation not found" });
      // Non-admins can only export public notes
      const isAdmin = ctx.user.role === "admin";
      const conditions = [eq(bisInvestigationNotes.investigationId, String(input.investigationId))];
      if (!isAdmin || !input.includeInternal) {
        conditions.push(eq(bisInvestigationNotes.isInternal, false));
      }
      const notes = await db
        .select()
        .from(bisInvestigationNotes)
        .where(and(...conditions))
        .orderBy(bisInvestigationNotes.createdAt);
      const exportedAt = new Date().toLocaleString();
      const lines: string[] = [
        "INVESTIGATION NOTES EXPORT",
        "===========================",
        `Investigation: ${inv.referenceId}`,
        `Subject:       ${inv.subjectFullName}`,
        `Exported:      ${exportedAt}`,
        `Total Notes:   ${notes.length}`,
        "",
      ];
      if (notes.length === 0) {
        lines.push("No notes found for this investigation.");
      } else {
        notes.forEach((note, idx) => {
          lines.push(`--- Note ${idx + 1}${note.isInternal ? " [INTERNAL — ADMIN ONLY]" : ""} ---`);
          lines.push(`Author: ${note.authorName}`);
          lines.push(`Date:   ${new Date(note.createdAt).toLocaleString()}`);
          lines.push("");
          lines.push(note.content);
          lines.push("");
        });
      }
      return {
        referenceId: inv.referenceId,
        subjectFullName: inv.subjectFullName,
        noteCount: notes.length,
        exportedAt,
        text: lines.join("\n"),
        filename: `notes-${inv.referenceId}-${new Date().toISOString().slice(0, 10)}.txt`,
      };
    }),

  // Bulk export notes for multiple investigations (admin: all; user: own public notes)
  bulkExportNotes: protectedProcedure
    .input(z.object({
      investigationIds: z.array(z.number().int().positive()).min(1).max(100),
      includeInternal: z.boolean().default(false),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const isAdmin = ctx.user.role === "admin";
      const exportedAt = new Date().toLocaleString();
      const dateStr = new Date().toISOString().slice(0, 10);
      const separator = "=".repeat(60);
      const sections: string[] = [
        "BULK INVESTIGATION NOTES EXPORT",
        "================================",
        `Exported:            ${exportedAt}`,
        `Investigations:      ${input.investigationIds.length}`,
        `Exported by:         ${ctx.user.name ?? ctx.user.email ?? `User #${ctx.user.id}`}`,
        `Internal notes:      ${isAdmin && input.includeInternal ? "Included" : "Excluded"}`,
        "",
      ];
      let totalNotes = 0;
      for (const invId of input.investigationIds) {
        const [inv] = await db
          .select({ referenceId: bisInvestigations.referenceId, subjectFullName: bisInvestigations.subjectFullName })
          .from(bisInvestigations)
          .where(eq(bisInvestigations.id, invId))
          .limit(1);
        if (!inv) continue;
        const conditions = [eq(bisInvestigationNotes.investigationId, String(invId))];
        if (!isAdmin || !input.includeInternal) {
          conditions.push(eq(bisInvestigationNotes.isInternal, false));
        }
        const notes = await db
          .select()
          .from(bisInvestigationNotes)
          .where(and(...conditions))
          .orderBy(bisInvestigationNotes.createdAt);
        sections.push(separator);
        sections.push(`Investigation: ${inv.referenceId}`);
        sections.push(`Subject:       ${inv.subjectFullName}`);
        sections.push(`Notes:         ${notes.length}`);
        sections.push("");
        if (notes.length === 0) {
          sections.push("  (No notes for this investigation)");
          sections.push("");
        } else {
          notes.forEach((note, idx) => {
            sections.push(`  --- Note ${idx + 1}${note.isInternal ? " [INTERNAL]" : ""} ---`);
            sections.push(`  Author: ${note.authorName}`);
            sections.push(`  Date:   ${new Date(note.createdAt).toLocaleString()}`);
            sections.push("");
            sections.push(`  ${note.content.replace(/\n/g, "\n  ")}`);
            sections.push("");
          });
          totalNotes += notes.length;
        }
      }
      sections.push(separator);
      sections.push(`END OF EXPORT — Total notes: ${totalNotes}`);
      return {
        totalInvestigations: input.investigationIds.length,
        totalNotes,
        exportedAt,
        text: sections.join("\n"),
        filename: `bulk-notes-export-${dateStr}.txt`,
      };
    }),
  // ─── Merchant: Submit employee background check ─────────────────────────
  // Merchants can submit BIS checks on their own staff (tied to their establishment)
  submitEmployeeCheck: protectedProcedure
    .input(
      z.object({
        establishmentId: z.number().int().positive(),
        subjectFullName: z.string().min(2),
        subjectRole: z.string().min(1).max(100),
        subjectEmail: z.string().email().optional(),
        subjectPhone: z.string().optional(),
        subjectNationality: z.string().optional(),
        subjectDob: z.string().optional(),
        subjectNin: z.string().optional(),
        subjectCountry: z.string().length(2).optional(),
        tier: z.enum(["basic", "standard", "comprehensive"]).default("basic"),
        consentObtained: z.boolean().default(false),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      // Verify the merchant owns this establishment
      const [est] = await db
        .select({ id: establishments.id, name: establishments.name })
        .from(establishments)
        .where(and(eq(establishments.id, input.establishmentId), eq(establishments.ownerId, ctx.user.id)))
        .limit(1);
      if (!est) throw new TRPCError({ code: "FORBIDDEN", message: "You do not own this establishment" });
      const inv = await createBisInvestigation({
        ...input,
        requestedBy: ctx.user.id,
        status: "pending",
        pricePaid: tierPricing[input.tier].toString(),
        currency: "USD",
      });
      if (inv?.id) {
        const slaH = slaConfig["medium"] ?? 48;
        const dueAtMs = Date.now() + slaH * 60 * 60 * 1000;
        await db.update(bisInvestigations)
          .set({ dueAt: dueAtMs, slaHours: slaH })
          .where(eq(bisInvestigations.id, inv.id))
          .catch(() => {});
        autoTimeline({
          investigationId: inv.id,
          actorId: String(ctx.user.id),
          actorName: ctx.user.name ?? String(ctx.user.id),
          eventType: "created",
          title: `Employee check submitted — ${input.tier.toUpperCase()} tier`,
          description: `Subject: ${input.subjectFullName}. Role: ${input.subjectRole}. Establishment: ${est.name}. Consent: ${input.consentObtained ? "Yes" : "No"}.`,
          severity: "info",
          metadata: { tier: input.tier, consentObtained: input.consentObtained, establishmentId: input.establishmentId },
        }).catch(() => {});
      }
      return inv;
    }),

  // Merchant: list all employee checks for their establishments
  listMyEmployeeChecks: protectedProcedure
    .input(z.object({
      establishmentId: z.number().int().positive().optional(),
      status: z.enum(["pending", "processing", "completed", "flagged", "failed", "all"]).default("all"),
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().default(0),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };
      const limit = input?.limit ?? 20;
      const offset = input?.offset ?? 0;
      const statusFilter = input?.status ?? "all";
      // Get all establishments owned by this merchant
      const ownedEsts = await db
        .select({ id: establishments.id })
        .from(establishments)
        .where(eq(establishments.ownerId, ctx.user.id));
      if (ownedEsts.length === 0) return { items: [], total: 0 };
      const estIds = ownedEsts.map((e) => e.id);
      const conditions: any[] = [inArray(bisInvestigations.establishmentId, estIds)];
      if (statusFilter !== "all") {
        conditions.push(eq(bisInvestigations.status, statusFilter as any));
      }
      if (input?.establishmentId) {
        conditions.push(eq(bisInvestigations.establishmentId, input.establishmentId));
      }
      const rows = await db
        .select({
          id: bisInvestigations.id,
          referenceId: bisInvestigations.referenceId,
          subjectFullName: bisInvestigations.subjectFullName,
          subjectRole: bisInvestigations.subjectRole,
          tier: bisInvestigations.tier,
          status: bisInvestigations.status,
          riskLevel: bisInvestigations.riskLevel,
          riskScore: bisInvestigations.riskScore,
          establishmentId: bisInvestigations.establishmentId,
          consentObtained: bisInvestigations.consentObtained,
          pricePaid: bisInvestigations.pricePaid,
          dueAt: bisInvestigations.dueAt,
          completedAt: bisInvestigations.completedAt,
          createdAt: bisInvestigations.createdAt,
        })
        .from(bisInvestigations)
        .where(and(...conditions))
        .orderBy(desc(bisInvestigations.createdAt))
        .limit(limit)
        .offset(offset);
      const [countRow] = await db
        .select({ cnt: count() })
        .from(bisInvestigations)
        .where(and(...conditions));
      return {
        items: rows.map((r) => ({
          ...r,
          dueAt: r.dueAt ? Number(r.dueAt) : null,
          completedAt: r.completedAt ? r.completedAt.getTime() : null,
          createdAt: r.createdAt ? r.createdAt.getTime() : null,
        })),
        total: Number(countRow?.cnt ?? 0),
      };
    }),

  // ─── Export Schedule (weekly/biweekly/monthly) ───────────────────────────
  getExportSchedule: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return null;
      const [row] = await db
        .select()
        .from(bisExportSchedules)
        .where(eq(bisExportSchedules.userId, ctx.user.id))
        .limit(1);
      if (!row) return null;
      return {
        id: row.id,
        frequency: row.frequency,
        enabled: row.enabled,
        includeInternal: row.includeInternal,
        filters: row.filters ?? {},
        nextRunAt: Number(row.nextRunAt),
        lastRunAt: row.lastRunAt != null ? Number(row.lastRunAt) : null,
        lastExportNoteCount: row.lastExportNoteCount ?? null,
        createdAt: Number(row.createdAt),
      };
    }),

  setExportSchedule: protectedProcedure
    .input(z.object({
      frequency: z.enum(["weekly", "biweekly", "monthly"]).default("weekly"),
      enabled: z.boolean().default(true),
      includeInternal: z.boolean().default(false),
      filters: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const now = new Date();
      const computeNextRun = (freq: string): number => {
        const d = new Date(now);
        if (freq === "weekly") {
          const daysUntilMonday = (8 - d.getUTCDay()) % 7 || 7;
          d.setUTCDate(d.getUTCDate() + daysUntilMonday);
        } else if (freq === "biweekly") {
          d.setUTCDate(d.getUTCDate() + 14);
        } else {
          d.setUTCMonth(d.getUTCMonth() + 1, 1);
        }
        d.setUTCHours(8, 0, 0, 0);
        return d.getTime();
      };
      const nextRunAt = computeNextRun(input.frequency);
      const nowMs = Date.now();
      const existing = await db
        .select({ id: bisExportSchedules.id })
        .from(bisExportSchedules)
        .where(eq(bisExportSchedules.userId, ctx.user.id))
        .limit(1);
      if (existing.length > 0) {
        await db
          .update(bisExportSchedules)
          .set({ frequency: input.frequency, enabled: input.enabled, includeInternal: input.includeInternal, filters: input.filters ?? {}, nextRunAt, updatedAt: nowMs })
          .where(eq(bisExportSchedules.userId, ctx.user.id));
      } else {
        await db.insert(bisExportSchedules).values({
          userId: ctx.user.id,
          frequency: input.frequency,
          enabled: input.enabled,
          includeInternal: input.includeInternal,
          filters: input.filters ?? {},
          nextRunAt,
          createdAt: nowMs,
          updatedAt: nowMs,
        });
      }
      return { success: true, nextRunAt, frequency: input.frequency, enabled: input.enabled };
    }),

  deleteExportSchedule: protectedProcedure
    .mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db.delete(bisExportSchedules).where(eq(bisExportSchedules.userId, ctx.user.id));
      return { success: true };
    }),


  // ─── Toggle export schedule pause/resume (without deleting) ───────────────
  toggleExportSchedule: protectedProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const existing = await db
        .select({ id: bisExportSchedules.id })
        .from(bisExportSchedules)
        .where(eq(bisExportSchedules.userId, ctx.user.id))
        .limit(1);
      if (existing.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No export schedule found. Create one first." });
      }
      await db
        .update(bisExportSchedules)
        .set({ enabled: input.enabled, updatedAt: Date.now() })
        .where(eq(bisExportSchedules.userId, ctx.user.id));
      return { success: true, enabled: input.enabled };
    }),
  // ─── Preview export summary (dry-run of the scheduled export) ───────────────
  previewExport: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return { investigationCount: 0, noteCount: 0, dateRange: null, filters: {} };
      // Get the user's schedule to know the filters
      const [schedule] = await db
        .select()
        .from(bisExportSchedules)
        .where(eq(bisExportSchedules.userId, ctx.user.id))
        .limit(1);
      if (!schedule) return { investigationCount: 0, noteCount: 0, dateRange: null, filters: {} };
      // Count investigations with notes
      const filters = (schedule.filters as Record<string, string>) ?? {};
      let investigationQuery = db
        .select({ id: bisInvestigations.id })
        .from(bisInvestigations)
        .$dynamic();
      if (filters.status) {
        investigationQuery = investigationQuery.where(eq(bisInvestigations.status, filters.status as any));
      }
      const investigations = await investigationQuery;
      const investigationIds = investigations.map((i: any) => String(i.id));
      let noteCount = 0;
      let oldestNote: number | null = null;
      let newestNote: number | null = null;
      if (investigationIds.length > 0) {
        const noteRows = await db.execute(
          sql`SELECT COUNT(*) as cnt, MIN(created_at) as oldest, MAX(created_at) as newest
              FROM bis_investigation_notes
              WHERE investigation_id = ANY(${investigationIds})
              ${schedule.includeInternal ? sql`` : sql`AND is_internal = false`}`
        ) as any[];
        if (noteRows[0]) {
          noteCount = Number(noteRows[0].cnt ?? 0);
          oldestNote = noteRows[0].oldest ? Number(noteRows[0].oldest) : null;
          newestNote = noteRows[0].newest ? Number(noteRows[0].newest) : null;
        }
      }
      // PaymentSwitch integration: pull settlement summary for the same date range
      let settlementSummary: { totalSettled: number; settlementCount: number; currencies: string[] } | null = null;
      try {
        const settlementRows = await db
          .select({
            totalAmount: psSettlements.totalAmount,
            currency: psSettlements.currency,
            status: psSettlements.status,
          })
          .from(psSettlements)
          .where(eq(psSettlements.status, "completed"))
          .limit(500);
        if (settlementRows.length > 0) {
          const totalSettled = settlementRows.reduce((sum: number, r: any) => sum + Number(r.totalAmount ?? 0), 0);
          const currencySet = new Set(settlementRows.map((r: any) => r.currency).filter(Boolean));
          const currencies = Array.from(currencySet);
          settlementSummary = { totalSettled, settlementCount: settlementRows.length, currencies };
        }
      } catch {
        // Non-blocking: settlement enrichment failure should not block BIS preview
      }
      return {
        investigationCount: investigationIds.length,
        noteCount,
        dateRange: oldestNote && newestNote ? {
          from: new Date(oldestNote * 1000).toISOString(),
          to: new Date(newestNote * 1000).toISOString(),
        } : null,
        filters,
        includeInternalNotes: schedule.includeInternal,
        frequency: schedule.frequency,
        nextRunAt: schedule.nextRunAt,
        settlementSummary,
      };
    }),

  // ─── Director Management (entity investigations only) ───────────────────────

  /** List directors for an entity investigation */
  listDirectors: protectedProcedure
    .input(z.object({ investigationId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      // Verify the investigation belongs to the user
      const [inv] = await db
        .select({ id: bisInvestigations.id, requestedBy: bisInvestigations.requestedBy })
        .from(bisInvestigations)
        .where(and(eq(bisInvestigations.id, input.investigationId), eq(bisInvestigations.requestedBy, ctx.user.id)))
        .limit(1);
      if (!inv) throw new TRPCError({ code: "FORBIDDEN" });
      return db.select().from(bisDirectors).where(eq(bisDirectors.entityInvestigationId, input.investigationId)).orderBy(bisDirectors.createdAt);
    }),

  /** Add a director to an entity investigation */
  addDirector: protectedProcedure
    .input(z.object({
      investigationId: z.number(),
      fullName: z.string().min(2).max(255),
      role: z.enum(["Director", "CEO", "CFO", "Secretary", "Shareholder", "Other"]).default("Director"),
      nationality: z.string().max(100).optional(),
      nin: z.string().max(50).optional(),
      email: z.string().email().max(320).optional(),
      phone: z.string().max(30).optional(),
      ownershipPercent: z.number().int().min(0).max(100).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [inv] = await db
        .select({ id: bisInvestigations.id, requestedBy: bisInvestigations.requestedBy })
        .from(bisInvestigations)
        .where(and(eq(bisInvestigations.id, input.investigationId), eq(bisInvestigations.requestedBy, ctx.user.id)))
        .limit(1);
      if (!inv) throw new TRPCError({ code: "FORBIDDEN" });
      const [director] = await db.insert(bisDirectors).values({
        entityInvestigationId: input.investigationId,
        fullName: input.fullName,
        role: input.role,
        nationality: input.nationality ?? null,
        nin: input.nin ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        ownershipPercent: input.ownershipPercent ?? null,
        bundleDiscountPercent: 20,
      }).returning();
      await autoTimeline({
        investigationId: input.investigationId,
        actorId: String(ctx.user.id),
        actorName: ctx.user.name ?? undefined,
        eventType: "director_added",
        title: `Director added: ${input.fullName}`,
        description: `Role: ${input.role}${input.ownershipPercent ? `, ${input.ownershipPercent}% ownership` : ""}`,
        severity: "info",
      });
      return director;
    }),

  /** Remove a director from an entity investigation */
  removeDirector: protectedProcedure
    .input(z.object({ directorId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [director] = await db
        .select({ id: bisDirectors.id, entityInvestigationId: bisDirectors.entityInvestigationId, fullName: bisDirectors.fullName })
        .from(bisDirectors)
        .where(eq(bisDirectors.id, input.directorId))
        .limit(1);
      if (!director) throw new TRPCError({ code: "NOT_FOUND" });
      // Verify ownership via parent investigation
      const [inv] = await db
        .select({ requestedBy: bisInvestigations.requestedBy })
        .from(bisInvestigations)
        .where(and(eq(bisInvestigations.id, director.entityInvestigationId), eq(bisInvestigations.requestedBy, ctx.user.id)))
        .limit(1);
      if (!inv) throw new TRPCError({ code: "FORBIDDEN" });
      await db.delete(bisDirectors).where(eq(bisDirectors.id, input.directorId));
      return { success: true };
    }),

  /**
   * bundleDirectorInvestigation — creates an individual BIS investigation for
   * a director at a 20% bundle discount and links it to the director record.
   */
  bundleDirectorInvestigation: protectedProcedure
    .input(z.object({
      directorId: z.number(),
      tier: z.enum(["basic", "standard", "comprehensive"]).default("standard"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [director] = await db
        .select()
        .from(bisDirectors)
        .where(eq(bisDirectors.id, input.directorId))
        .limit(1);
      if (!director) throw new TRPCError({ code: "NOT_FOUND" });

      // Verify ownership
      const [inv] = await db
        .select({ requestedBy: bisInvestigations.requestedBy, subjectFullName: bisInvestigations.subjectFullName })
        .from(bisInvestigations)
        .where(and(eq(bisInvestigations.id, director.entityInvestigationId), eq(bisInvestigations.requestedBy, ctx.user.id)))
        .limit(1);
      if (!inv) throw new TRPCError({ code: "FORBIDDEN" });

      // Base prices with 20% bundle discount
      const basePrices: Record<string, number> = { basic: 49, standard: 99, comprehensive: 199 };
      const basePrice = basePrices[input.tier] ?? 99;
      const discountedPrice = Math.round(basePrice * (1 - director.bundleDiscountPercent / 100) * 100) / 100;

      // Create the individual investigation
      const newInv = await createBisInvestigation({
        requestedBy: ctx.user.id,
        subjectFullName: director.fullName,
        subjectType: "individual",
        subjectNin: director.nin ?? null,
        subjectEmail: director.email ?? null,
        subjectPhone: director.phone ?? null,
        subjectNationality: director.nationality ?? null,
        tier: input.tier,
        pricePaid: discountedPrice.toString(),
        currency: "USD",
        status: "pending",
        linkedEntityInvestigationId: director.entityInvestigationId,
        consentObtained: false,
      });

      // Link the director record to the new investigation
      await db
        .update(bisDirectors)
        .set({ linkedInvestigationId: newInv.id })
        .where(eq(bisDirectors.id, input.directorId));

      await autoTimeline({
        investigationId: director.entityInvestigationId,
        actorId: String(ctx.user.id),
        actorName: ctx.user.name ?? undefined,
        eventType: "director_investigation_bundled",
        title: `Individual investigation created for ${director.fullName}`,
        description: `${input.tier} tier at $${discountedPrice} (${director.bundleDiscountPercent}% bundle discount)`,
        severity: "info",
        metadata: { linkedInvestigationId: newInv.id, tier: input.tier, price: discountedPrice },
      });

      return { investigationId: newInv.id, price: discountedPrice, discountPercent: director.bundleDiscountPercent };
    }),

  /**
   * bundleAllDirectors — calculates combined pricing for all un-investigated
   * directors in an entity investigation and creates a Stripe Checkout session.
   * After payment, the webhook queues all director investigations.
   */
  bundleAllDirectors: protectedProcedure
    .input(z.object({
      investigationId: z.number(),
      tier: z.enum(["basic", "standard", "comprehensive"]).default("standard"),
      origin: z.string().url(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Verify ownership of the entity investigation
      const [inv] = await db
        .select({ id: bisInvestigations.id, requestedBy: bisInvestigations.requestedBy, subjectFullName: bisInvestigations.subjectFullName })
        .from(bisInvestigations)
        .where(and(eq(bisInvestigations.id, input.investigationId), eq(bisInvestigations.requestedBy, ctx.user.id)))
        .limit(1);
      if (!inv) throw new TRPCError({ code: "FORBIDDEN" });

      // Get all directors without a linked investigation
      const allDirectors = await db
        .select()
        .from(bisDirectors)
        .where(and(
          eq(bisDirectors.entityInvestigationId, input.investigationId),
          sql`${bisDirectors.linkedInvestigationId} IS NULL`,
        ));

      if (allDirectors.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No uninvestigated directors found" });
      }

      const DISCOUNT_PERCENT = 20;
      const basePrices: Record<string, number> = { basic: 49, standard: 99, comprehensive: 199 };
      const basePrice = basePrices[input.tier] ?? 99;
      const discountedUnitPrice = Math.round(basePrice * (1 - DISCOUNT_PERCENT / 100) * 100) / 100;
      const totalPrice = Math.round(discountedUnitPrice * allDirectors.length * 100) / 100;

      // Create Stripe Checkout session for the bundled payment
      const { stripe } = await import("../_core/stripe");
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: Math.round(discountedUnitPrice * 100),
              product_data: {
                name: `BIS Director Investigation Bundle (${input.tier})`,
                description: `${allDirectors.length} director(s) — ${DISCOUNT_PERCENT}% bundle discount applied`,
              },
            },
            quantity: allDirectors.length,
          },
        ],
        customer_email: ctx.user.email ?? undefined,
        client_reference_id: String(ctx.user.id),
        metadata: {
          user_id: String(ctx.user.id),
          investigation_id: String(input.investigationId),
          director_ids: allDirectors.map((d) => d.id).join(","),
          tier: input.tier,
          bundle_type: "director_bundle",
        },
        success_url: `${input.origin}/bis/report/${input.investigationId}?bundle_checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${input.origin}/bis/report/${input.investigationId}?bundle_checkout=cancelled`,
      });

      return {
        checkoutUrl: session.url!,
        sessionId: session.id,
        directorCount: allDirectors.length,
        unitPrice: discountedUnitPrice,
        totalPrice,
        discountPercent: DISCOUNT_PERCENT,
        directors: allDirectors.map((d) => ({ id: d.id, fullName: d.fullName, role: d.role })),
      };
    }),
});