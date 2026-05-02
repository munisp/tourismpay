/**
 * CSV Export Router
 * Provides admin-only CSV export for audit logs, KYB applications, and BIS investigations.
 * Uses json2csv for server-side CSV generation.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  auditLogs,
  kybApplications,
  bisInvestigations,
  users,
  establishments,
  walletTransactions,
} from "../../drizzle/schema";
import { desc, gte, lte, and, eq } from "drizzle-orm";
import { Parser } from "json2csv";

// ─── Audit Logs Export ────────────────────────────────────────────────────────

async function fetchAuditLogsForExport(filters: {
  from?: Date;
  to?: Date;
  action?: string;
  entityType?: string;
  limit?: number;
}) {
  const conditions = [];
  if (filters.from) conditions.push(gte(auditLogs.createdAt, filters.from));
  if (filters.to) conditions.push(lte(auditLogs.createdAt, filters.to));
  if (filters.action) conditions.push(eq(auditLogs.action, filters.action));
  if (filters.entityType) conditions.push(eq(auditLogs.entityType, filters.entityType));

  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(auditLogs)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(filters.limit ?? 5000);
}

async function fetchKybApplicationsForExport() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: kybApplications.id,
      establishmentId: kybApplications.establishmentId,
      status: kybApplications.status,
      currentStep: kybApplications.currentStep,
      totalSteps: kybApplications.totalSteps,
      complianceScore: kybApplications.complianceScore,
      submittedBy: kybApplications.submittedBy,
      reviewedBy: kybApplications.reviewedBy,
      reviewedAt: kybApplications.reviewedAt,
      createdAt: kybApplications.createdAt,
      updatedAt: kybApplications.updatedAt,
      establishmentName: establishments.name,
      establishmentCountry: establishments.country,
      establishmentType: establishments.type,
    })
    .from(kybApplications)
    .leftJoin(establishments, eq(kybApplications.establishmentId, establishments.id))
    .orderBy(desc(kybApplications.createdAt))
    .limit(5000);
}

async function fetchBisInvestigationsForExport(filters: {
  status?: string;
  riskLevel?: string;
  from?: Date;
  to?: Date;
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters.status) conditions.push(eq(bisInvestigations.status, filters.status as any));
  if (filters.riskLevel) conditions.push(eq(bisInvestigations.riskLevel, filters.riskLevel as any));
  if (filters.from) conditions.push(gte(bisInvestigations.createdAt, filters.from));
  if (filters.to) conditions.push(lte(bisInvestigations.createdAt, filters.to));

  return db
    .select({
      id: bisInvestigations.id,
      referenceId: bisInvestigations.referenceId,
      subjectFullName: bisInvestigations.subjectFullName,
      subjectNationality: bisInvestigations.subjectNationality,
      subjectCountry: bisInvestigations.subjectCountry,
      subjectRole: bisInvestigations.subjectRole,
      tier: bisInvestigations.tier,
      status: bisInvestigations.status,
      riskLevel: bisInvestigations.riskLevel,
      riskScore: bisInvestigations.riskScore,
      pricePaid: bisInvestigations.pricePaid,
      currency: bisInvestigations.currency,
      completedAt: bisInvestigations.completedAt,
      createdAt: bisInvestigations.createdAt,
      establishmentName: establishments.name,
    })
    .from(bisInvestigations)
    .leftJoin(establishments, eq(bisInvestigations.establishmentId, establishments.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(bisInvestigations.createdAt))
    .limit(5000);
}

async function fetchUsersForExport() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      loginMethod: users.loginMethod,
      createdAt: users.createdAt,
      lastSignedIn: users.lastSignedIn,
    })
    .from(users)
    .orderBy(desc(users.createdAt))
    .limit(5000);
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const csvExportRouter = router({
  /**
   * Export audit logs as CSV (admin only).
   */
  auditLogs: protectedProcedure
    .input(
      z.object({
        from: z.date().optional(),
        to: z.date().optional(),
        action: z.string().optional(),
        entityType: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      }

      const rows = await fetchAuditLogsForExport(input);

      // Enrich rows with bypass_reason extracted from the after JSON field
      const enrichedRows = rows.map((row: any) => {
        let bypassReason = "";
        if (row.action === "kyb_bis_bypass" && row.after) {
          try {
            const after = typeof row.after === "string" ? JSON.parse(row.after) : row.after;
            bypassReason = after?.bypassReason ?? "";
          } catch { /* ignore */ }
        }
        return { ...row, bypassReason };
      });

      const fields = [
        { label: "ID", value: "id" },
        { label: "Actor Name", value: "actorName" },
        { label: "Actor Email", value: "actorEmail" },
        { label: "Action", value: "action" },
        { label: "Entity Type", value: "entityType" },
        { label: "Entity ID", value: "entityId" },
        { label: "Description", value: "description" },
        { label: "Bypass Reason", value: "bypassReason" },
        { label: "IP Address", value: "ipAddress" },
        { label: "Created At", value: (row: any) => row.createdAt ? new Date(row.createdAt).toISOString() : "" },
      ];

      const parser = new Parser({ fields: fields as any });
      const csv = parser.parse(enrichedRows);

      return {
        csv,
        filename: `audit-log-${new Date().toISOString().slice(0, 10)}.csv`,
        rowCount: enrichedRows.length,
      };
    }),

  /**
   * Export KYB applications as CSV (admin only).
   */
  kybApplications: protectedProcedure
    .input(z.object({}))
    .mutation(async ({ ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      }

      const rows = await fetchKybApplicationsForExport();

      const fields = [
        { label: "ID", value: "id" },
        { label: "Establishment Name", value: "establishmentName" },
        { label: "Establishment Country", value: "establishmentCountry" },
        { label: "Establishment Type", value: "establishmentType" },
        { label: "Status", value: "status" },
        { label: "Current Step", value: "currentStep" },
        { label: "Total Steps", value: "totalSteps" },
        { label: "Compliance Score", value: "complianceScore" },
        { label: "Submitted By", value: "submittedBy" },
        { label: "Reviewed By", value: "reviewedBy" },
        { label: "Reviewed At", value: (row: any) => row.reviewedAt ? new Date(row.reviewedAt).toISOString() : "" },
        { label: "Created At", value: (row: any) => row.createdAt ? new Date(row.createdAt).toISOString() : "" },
      ];

      const parser = new Parser({ fields: fields as any });
      const csv = parser.parse(rows);

      return {
        csv,
        filename: `kyb-applications-${new Date().toISOString().slice(0, 10)}.csv`,
        rowCount: rows.length,
      };
    }),

  /**
   * Export BIS investigations as CSV (admin only).
   */
  bisInvestigations: protectedProcedure
    .input(
      z.object({
        status: z.string().optional(),
        riskLevel: z.string().optional(),
        from: z.date().optional(),
        to: z.date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      }

      const rows = await fetchBisInvestigationsForExport(input);

      const fields = [
        { label: "ID", value: "id" },
        { label: "Reference ID", value: "referenceId" },
        { label: "Subject Name", value: "subjectFullName" },
        { label: "Nationality", value: "subjectNationality" },
        { label: "Country", value: "subjectCountry" },
        { label: "Role", value: "subjectRole" },
        { label: "Tier", value: "tier" },
        { label: "Status", value: "status" },
        { label: "Risk Level", value: "riskLevel" },
        { label: "Risk Score", value: "riskScore" },
        { label: "Price Paid", value: "pricePaid" },
        { label: "Currency", value: "currency" },
        { label: "Establishment", value: "establishmentName" },
        { label: "Completed At", value: (row: any) => row.completedAt ? new Date(row.completedAt).toISOString() : "" },
        { label: "Created At", value: (row: any) => row.createdAt ? new Date(row.createdAt).toISOString() : "" },
      ];

      const parser = new Parser({ fields: fields as any });
      const csv = parser.parse(rows);

      return {
        csv,
        filename: `bis-investigations-${new Date().toISOString().slice(0, 10)}.csv`,
        rowCount: rows.length,
      };
    }),

  /**
   * Export biometric events (enrollments, token issuances, verifications, PIN events) as CSV.
   * Designed for regulatory compliance submissions.
   */
  biometricEvents: protectedProcedure
    .input(z.object({
      userId: z.string().optional(),
      action: z.string().optional(),
      from: z.date().optional(),
      to: z.date().optional(),
      limit: z.number().min(1).max(10000).default(1000),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const biometricActions = [
        "biometric.enroll",
        "biometric.revoke",
        "biometric.login",
        "biometric.pinSet",
        "biometric.pinVerified",
        "biometric.highValueTokenIssued",
        "biometric.highValueAuth",
      ];

      const { or } = await import("drizzle-orm");
      const conditions: any[] = [];
      if (input.userId) conditions.push(eq(auditLogs.actorId, parseInt(input.userId, 10)));
      if (input.action) {
        conditions.push(eq(auditLogs.action, input.action));
      } else {
        conditions.push(or(...biometricActions.map((a) => eq(auditLogs.action, a))));
      }
      if (input.from) conditions.push(gte(auditLogs.createdAt, input.from));
      if (input.to) conditions.push(lte(auditLogs.createdAt, input.to));

      const rows = await db
        .select()
        .from(auditLogs)
        .where(and(...conditions))
        .orderBy(desc(auditLogs.createdAt))
        .limit(input.limit);

      const fields = [
        { label: "Event ID", value: "id" },
        { label: "Timestamp", value: (row: any) => row.createdAt ? new Date(row.createdAt).toISOString() : "" },
        { label: "Actor ID", value: "actorId" },
        { label: "Actor Name", value: "actorName" },
        { label: "Actor Email", value: "actorEmail" },
        { label: "Action", value: "action" },
        { label: "Entity Type", value: "entityType" },
        { label: "Entity ID", value: "entityId" },
        { label: "Description", value: "description" },
        { label: "IP Address", value: "ipAddress" },
        { label: "Details", value: (row: any) => row.after ? JSON.stringify(row.after) : "" },
      ];

      const parser = new Parser({ fields: fields as any });
      const csv = rows.length > 0 ? parser.parse(rows) : "";

      return {
        csv,
        filename: `biometric-events-${new Date().toISOString().slice(0, 10)}.csv`,
        rowCount: rows.length,
      };
    }),

  /**
   * Export wallet transactions as CSV.
   * Regular users can export their own; admins can export any user's transactions.
   */
  walletTransactions: protectedProcedure
    .input(z.object({
      userId: z.string().optional(),
      type: z.string().optional(),
      currency: z.string().optional(),
      from: z.date().optional(),
      to: z.date().optional(),
      limit: z.number().min(1).max(10000).default(1000),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      // Users can only export their own transactions; admins can export any
      const targetUserId = (ctx.user.role === "admin" && input.userId)
        ? input.userId
        : String(ctx.user.id);
      const conditions: any[] = [eq(walletTransactions.userId, targetUserId)];
      if (input.type) conditions.push(eq(walletTransactions.type, input.type));
      if (input.currency) conditions.push(eq(walletTransactions.fromCurrency, input.currency));
      if (input.from) conditions.push(gte(walletTransactions.createdAt, Math.floor(input.from.getTime() / 1000)));
      if (input.to) conditions.push(lte(walletTransactions.createdAt, Math.floor(input.to.getTime() / 1000)));
      const rows = await db
        .select()
        .from(walletTransactions)
        .where(and(...conditions))
        .orderBy(desc(walletTransactions.createdAt))
        .limit(input.limit);
      const fields = [
        { label: "Transaction ID", value: "id" },
        { label: "Type", value: "type" },
        { label: "Status", value: "status" },
        { label: "From Currency", value: "fromCurrency" },
        { label: "To Currency", value: "toCurrency" },
        { label: "Amount", value: "amount" },
        { label: "To Amount", value: "toAmount" },
        { label: "Fee", value: "fee" },
        { label: "Counterparty", value: "counterparty" },
        { label: "Reference", value: "reference" },
        { label: "Note", value: "note" },
        { label: "TX Hash", value: "txHash" },
        { label: "Completed At", value: (row: any) => row.completedAt ? new Date(row.completedAt * 1000).toISOString() : "" },
        { label: "Created At", value: (row: any) => row.createdAt ? new Date(row.createdAt * 1000).toISOString() : "" },
      ];
      const parser = new Parser({ fields: fields as any });
      const csv = rows.length > 0 ? parser.parse(rows) : "";
      return {
        csv,
        filename: `wallet-transactions-${new Date().toISOString().slice(0, 10)}.csv`,
        rowCount: rows.length,
      };
    }),

  /**
   * Export users as CSV (admin only).
   */
  users: protectedProcedure
    .input(z.object({}))
    .mutation(async ({ ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      }

      const rows = await fetchUsersForExport();

      const fields = [
        { label: "ID", value: "id" },
        { label: "Name", value: "name" },
        { label: "Email", value: "email" },
        { label: "Role", value: "role" },
        { label: "Login Method", value: "loginMethod" },
        { label: "Last Signed In", value: (row: any) => row.lastSignedIn ? new Date(row.lastSignedIn).toISOString() : "" },
        { label: "Created At", value: (row: any) => row.createdAt ? new Date(row.createdAt).toISOString() : "" },
      ];

      const parser = new Parser({ fields: fields as any });
      const csv = parser.parse(rows);

      return {
        csv,
        filename: `users-${new Date().toISOString().slice(0, 10)}.csv`,
        rowCount: rows.length,
      };
    }),
});
