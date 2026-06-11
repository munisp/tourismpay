import { eq, desc, and, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  InsertUser,
  users,
  establishments,
  kybApplications,
  bisInvestigations,
  fraudAlerts,
  socAlerts,
  tourismEvents,
  kybDocuments,
  bisReportExports,
  userNotifications,
  notificationPreferences,
  auditLogs,
  type AuditLog,
  type InsertAuditLog,
  type NotificationPreferences,
  type InsertEstablishment,
  type InsertKybApplication,
  type InsertBisInvestigation,
  type InsertFraudAlert,
  type InsertSocAlert,
  type InsertKybDocument,
  type InsertBisReportExport,
  type InsertUserNotification,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;
let _client: ReturnType<typeof postgres> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && ENV.databaseUrl) {
    try {
      const dbUrl = ENV.databaseUrl;
      const sslRequired = dbUrl.includes("sslmode=require") || dbUrl.includes("ssl=true") || (!dbUrl.includes("localhost") && !dbUrl.includes("127.0.0.1"));
      _client = postgres(dbUrl, {
        max: 10,
        idle_timeout: 30,
        connect_timeout: 10,
        ssl: sslRequired ? { rejectUnauthorized: false } : false,
      });
      _db = drizzle(_client);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    // PostgreSQL upsert via onConflictDoUpdate
    // loginCount increments on every login; starts at 1 for new users
    await db
      .insert(users)
      .values({ ...values, loginCount: 1 })
      .onConflictDoUpdate({
        target: users.openId,
        set: {
          ...updateSet,
          loginCount: sql`${users.loginCount} + 1`,
        },
      });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);
  return result[0] ?? undefined;
}

// ─── Establishments ───────────────────────────────────────────────────────────

export async function createEstablishment(data: InsertEstablishment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(establishments).values(data).returning();
  return result[0];
}

export async function getEstablishments(filters?: {
  country?: string;
  kybStatus?: string;
  type?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  let query = db.select().from(establishments);
  const conditions = [];
  if (filters?.country) conditions.push(eq(establishments.country, filters.country));
  if (filters?.kybStatus)
    conditions.push(eq(establishments.kybStatus, filters.kybStatus as any));
  if (filters?.type)
    conditions.push(eq(establishments.type, filters.type as any));
  if (conditions.length > 0) query = (query as any).where(and(...conditions));
  return (query as any)
    .orderBy(desc(establishments.createdAt))
    .limit(filters?.limit ?? 50)
    .offset(filters?.offset ?? 0);
}

export async function getEstablishmentById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(establishments)
    .where(eq(establishments.id, id))
    .limit(1);
  return result[0] ?? undefined;
}

export async function updateEstablishmentKybStatus(
  id: number,
  status: string,
  score?: number,
  notes?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db
    .update(establishments)
    .set({
      kybStatus: status as any,
      kybScore: score,
      kybNotes: notes,
      updatedAt: new Date(),
    })
    .where(eq(establishments.id, id))
    .returning();
}

// ─── KYB Applications ─────────────────────────────────────────────────────────

export async function createKybApplication(data: InsertKybApplication) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(kybApplications).values(data).returning();
  return result[0];
}

export async function getKybApplicationsByEstablishment(establishmentId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(kybApplications)
    .where(eq(kybApplications.establishmentId, establishmentId))
    .orderBy(desc(kybApplications.createdAt));
}

export async function updateKybApplicationStep(
  id: number,
  step: number,
  status?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db
    .update(kybApplications)
    .set({
      currentStep: step,
      ...(status ? { status: status as any } : {}),
      updatedAt: new Date(),
    })
    .where(eq(kybApplications.id, id))
    .returning();
}

// ─── BIS Investigations ───────────────────────────────────────────────────────

function generateBisRef(): string {
  const year = new Date().getFullYear();
  const seq = 1000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 9000);
  return `BIS-${year}-${seq}`;
}

export async function createBisInvestigation(data: Omit<InsertBisInvestigation, "referenceId">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db
    .insert(bisInvestigations)
    .values({ ...data, referenceId: generateBisRef() })
    .returning();
  return result[0];
}

export async function getBisInvestigations(filters?: {
  status?: string;
  riskLevel?: string;
  establishmentId?: number;
  subjectType?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  let query = db.select().from(bisInvestigations);
  const conditions = [];
  if (filters?.status) conditions.push(eq(bisInvestigations.status, filters.status as any));
  if (filters?.riskLevel) conditions.push(eq(bisInvestigations.riskLevel, filters.riskLevel as any));
  if (filters?.establishmentId)
    conditions.push(eq(bisInvestigations.establishmentId, filters.establishmentId));
  if (filters?.subjectType)
    conditions.push(eq(bisInvestigations.subjectType, filters.subjectType));
  if (conditions.length > 0) query = (query as any).where(and(...conditions));
  return (query as any)
    .orderBy(desc(bisInvestigations.createdAt))
    .limit(filters?.limit ?? 50)
    .offset(filters?.offset ?? 0);
}

export async function getBisInvestigationById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(bisInvestigations)
    .where(eq(bisInvestigations.id, id))
    .limit(1);
  return result[0] ?? undefined;
}

export async function updateBisInvestigationStatus(
  id: number,
  status: string,
  riskLevel?: string,
  riskScore?: number,
  moduleResults?: Record<string, unknown>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db
    .update(bisInvestigations)
    .set({
      status: status as any,
      ...(riskLevel ? { riskLevel: riskLevel as any } : {}),
      ...(riskScore !== undefined ? { riskScore } : {}),
      ...(moduleResults ? { moduleResults } : {}),
      ...(status === "completed" ? { completedAt: new Date() } : {}),
      updatedAt: new Date(),
    })
    .where(eq(bisInvestigations.id, id))
    .returning();
}

// ─── Fraud Alerts ─────────────────────────────────────────────────────────────

function generateAlertId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

export async function createFraudAlert(data: InsertFraudAlert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const alertData = { ...data, alertId: data.alertId || generateAlertId("FRD") };
  const result = await db.insert(fraudAlerts).values(alertData).returning();
  return result[0];
}

export async function getFraudAlerts(filters?: {
  status?: string;
  severity?: string;
  limit?: number;
  since?: Date;
}) {
  const db = await getDb();
  if (!db) return [];
  let query = db.select().from(fraudAlerts);
  const conditions = [];
  if (filters?.status) conditions.push(eq(fraudAlerts.status, filters.status as any));
  if (filters?.severity) conditions.push(eq(fraudAlerts.severity, filters.severity as any));
  if (filters?.since) conditions.push(sql`${fraudAlerts.createdAt} >= ${filters.since}`);
  if (conditions.length > 0) query = (query as any).where(and(...conditions));
  return (query as any)
    .orderBy(desc(fraudAlerts.createdAt))
    .limit(filters?.limit ?? 100);
}

export async function resolveFraudAlert(id: number, resolvedBy: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db
    .update(fraudAlerts)
    .set({ status: "resolved", resolvedBy, resolvedAt: new Date(), updatedAt: new Date() })
    .where(eq(fraudAlerts.id, id))
    .returning();
}

// ─── SOC Alerts ───────────────────────────────────────────────────────────────

export async function createSocAlert(data: InsertSocAlert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const alertData = { ...data, alertId: data.alertId || generateAlertId("SOC") };
  const result = await db.insert(socAlerts).values(alertData).returning();
  return result[0];
}

export async function getSocAlerts(filters?: {
  status?: string;
  severity?: string;
  type?: string;
  limit?: number;
  since?: Date;
}) {
  const db = await getDb();
  if (!db) return [];
  let query = db.select().from(socAlerts);
  const conditions = [];
  if (filters?.status) conditions.push(eq(socAlerts.status, filters.status as any));
  if (filters?.severity) conditions.push(eq(socAlerts.severity, filters.severity as any));
  if (filters?.type) conditions.push(eq(socAlerts.type, filters.type as any));
  if (filters?.since) conditions.push(sql`${socAlerts.createdAt} >= ${filters.since}`);
  if (conditions.length > 0) query = (query as any).where(and(...conditions));
  return (query as any)
    .orderBy(desc(socAlerts.createdAt))
    .limit(filters?.limit ?? 100);
}

export async function resolveSocAlert(id: number, resolvedBy: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db
    .update(socAlerts)
    .set({ status: "resolved", resolvedBy, resolvedAt: new Date(), updatedAt: new Date() })
    .where(eq(socAlerts.id, id))
    .returning();
}

// ─── Tourism Events ───────────────────────────────────────────────────────────

export async function getTourismEvents(country?: string) {
  const db = await getDb();
  if (!db) return [];
  let query = db.select().from(tourismEvents);
  if (country) query = (query as any).where(eq(tourismEvents.country, country));
  return (query as any).orderBy(desc(tourismEvents.startDate)).limit(50);
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export async function getDashboardStats() {
  const db = await getDb();
  if (!db) {
    return {
      totalEstablishments: 0,
      pendingKyb: 0,
      activeBisInvestigations: 0,
      openFraudAlerts: 0,
      openSocAlerts: 0,
      criticalAlerts: 0,
    };
  }

  const [estCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(establishments);
  const [pendingKyb] = await db
    .select({ count: sql<number>`count(*)` })
    .from(establishments)
    .where(eq(establishments.kybStatus, "under_review"));
  const [activeBis] = await db
    .select({ count: sql<number>`count(*)` })
    .from(bisInvestigations)
    .where(eq(bisInvestigations.status, "processing"));
  const [openFraud] = await db
    .select({ count: sql<number>`count(*)` })
    .from(fraudAlerts)
    .where(eq(fraudAlerts.status, "open"));
  const [openSoc] = await db
    .select({ count: sql<number>`count(*)` })
    .from(socAlerts)
    .where(eq(socAlerts.status, "open"));
  const [criticalFraud] = await db
    .select({ count: sql<number>`count(*)` })
    .from(fraudAlerts)
    .where(and(eq(fraudAlerts.severity, "critical"), eq(fraudAlerts.status, "open")));

  return {
    totalEstablishments: Number(estCount?.count ?? 0),
    pendingKyb: Number(pendingKyb?.count ?? 0),
    activeBisInvestigations: Number(activeBis?.count ?? 0),
    openFraudAlerts: Number(openFraud?.count ?? 0),
    openSocAlerts: Number(openSoc?.count ?? 0),
    criticalAlerts: Number(criticalFraud?.count ?? 0),
  };
}

// ─── KYB Documents ──────────────────────────────────────────────────────────

export async function createKybDocument(data: InsertKybDocument) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(kybDocuments).values(data).returning();
  return result[0];
}

export async function getKybDocumentsByApplication(applicationId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(kybDocuments)
    .where(eq(kybDocuments.applicationId, applicationId))
    .orderBy(desc(kybDocuments.createdAt));
}

export async function getKybDocumentsByEstablishment(establishmentId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(kybDocuments)
    .where(eq(kybDocuments.establishmentId, establishmentId))
    .orderBy(desc(kybDocuments.createdAt));
}

export async function updateKybDocumentStatus(
  id: number,
  status: "pending" | "verified" | "rejected" | "expired",
  reviewedBy?: number,
  reviewNotes?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db
    .update(kybDocuments)
    .set({
      status,
      ...(reviewedBy !== undefined ? { reviewedBy } : {}),
      ...(reviewNotes !== undefined ? { reviewNotes } : {}),
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(kybDocuments.id, id))
    .returning();
}

export async function deleteKybDocument(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.delete(kybDocuments).where(eq(kybDocuments.id, id)).returning();
}

// ─── BIS Report Exports ───────────────────────────────────────────────────────

export async function createBisReportExport(data: InsertBisReportExport) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(bisReportExports).values(data).returning();
  return result[0];
}

export async function getBisReportExportsByInvestigation(investigationId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(bisReportExports)
    .where(eq(bisReportExports.investigationId, investigationId))
    .orderBy(desc(bisReportExports.createdAt));
}

export async function getLatestBisReportExport(investigationId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(bisReportExports)
    .where(eq(bisReportExports.investigationId, investigationId))
    .orderBy(desc(bisReportExports.createdAt))
    .limit(1);
  return result[0] ?? undefined;
}

export async function getAllKybDocuments(filters?: {
  status?: string;
  documentType?: string;
  establishmentId?: number;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  let query = db
    .select({
      id: kybDocuments.id,
      applicationId: kybDocuments.applicationId,
      establishmentId: kybDocuments.establishmentId,
      uploadedBy: kybDocuments.uploadedBy,
      documentType: kybDocuments.documentType,
      status: kybDocuments.status,
      fileName: kybDocuments.fileName,
      fileKey: kybDocuments.fileKey,
      fileUrl: kybDocuments.fileUrl,
      mimeType: kybDocuments.mimeType,
      fileSizeBytes: kybDocuments.fileSizeBytes,
      reviewNotes: kybDocuments.reviewNotes,
      reviewedBy: kybDocuments.reviewedBy,
      reviewedAt: kybDocuments.reviewedAt,
      createdAt: kybDocuments.createdAt,
      updatedAt: kybDocuments.updatedAt,
      // Join establishment name
      establishmentName: establishments.name,
      establishmentCountry: establishments.country,
    })
    .from(kybDocuments)
    .leftJoin(establishments, eq(kybDocuments.establishmentId, establishments.id));

  const conditions = [];
  if (filters?.status) conditions.push(eq(kybDocuments.status, filters.status as any));
  if (filters?.documentType) conditions.push(eq(kybDocuments.documentType, filters.documentType as any));
  if (filters?.establishmentId) conditions.push(eq(kybDocuments.establishmentId, filters.establishmentId));
  if (conditions.length > 0) query = (query as any).where(and(...conditions));

  return (query as any)
    .orderBy(desc(kybDocuments.createdAt))
    .limit(filters?.limit ?? 100)
    .offset(filters?.offset ?? 0);
}

export async function getKybDocumentStats() {
  const db = await getDb();
  if (!db) return { total: 0, pending: 0, verified: 0, rejected: 0 };

  const [total] = await db.select({ count: sql<number>`count(*)` }).from(kybDocuments);
  const [pending] = await db.select({ count: sql<number>`count(*)` }).from(kybDocuments).where(eq(kybDocuments.status, "pending"));
  const [verified] = await db.select({ count: sql<number>`count(*)` }).from(kybDocuments).where(eq(kybDocuments.status, "verified"));
  const [rejected] = await db.select({ count: sql<number>`count(*)` }).from(kybDocuments).where(eq(kybDocuments.status, "rejected"));

  return {
    total: Number(total?.count ?? 0),
    pending: Number(pending?.count ?? 0),
    verified: Number(verified?.count ?? 0),
    rejected: Number(rejected?.count ?? 0),
  };
}

// ─── User Notifications ───────────────────────────────────────────────────────

export async function createUserNotification(data: InsertUserNotification) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.insert(userNotifications).values(data).returning();
  return row;
}

export async function getUserNotifications(
  userId: number,
  opts?: { limit?: number; offset?: number; unreadOnly?: boolean; category?: string }
) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(userNotifications.userId, userId)];
  if (opts?.unreadOnly) conditions.push(eq(userNotifications.isRead, false));
  if (opts?.category) conditions.push(eq(userNotifications.category, opts.category as any));
  return db
    .select()
    .from(userNotifications)
    .where(and(...conditions))
    .orderBy(desc(userNotifications.createdAt))
    .limit(opts?.limit ?? 50)
    .offset(opts?.offset ?? 0);
}

export async function getUnreadNotificationCount(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(userNotifications)
    .where(and(eq(userNotifications.userId, userId), eq(userNotifications.isRead, false)));
  return Number(row?.count ?? 0);
}

export async function markNotificationRead(notificationId: number, userId: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .update(userNotifications)
    .set({ isRead: true, readAt: new Date() })
    .where(and(eq(userNotifications.id, notificationId), eq(userNotifications.userId, userId)))
    .returning();
  return row;
}

export async function markAllNotificationsRead(userId: number) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db
    .update(userNotifications)
    .set({ isRead: true, readAt: new Date() })
    .where(and(eq(userNotifications.userId, userId), eq(userNotifications.isRead, false)));
  return (result as any).rowCount ?? 0;
}

export async function deleteNotification(notificationId: number, userId: number) {
  const db = await getDb();
  if (!db) return false;
  await db
    .delete(userNotifications)
    .where(and(eq(userNotifications.id, notificationId), eq(userNotifications.userId, userId)));
  return true;
}

// ─── KYB Applications (Admin) ─────────────────────────────────────────────────

export async function getAllKybApplications(filters?: {
  status?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  let query = db
    .select({
      id: kybApplications.id,
      establishmentId: kybApplications.establishmentId,
      submittedBy: kybApplications.submittedBy,
      status: kybApplications.status,
      currentStep: kybApplications.currentStep,
      totalSteps: kybApplications.totalSteps,
      documentsUploaded: kybApplications.documentsUploaded,
      reviewNotes: kybApplications.reviewNotes,
      reviewedBy: kybApplications.reviewedBy,
      reviewedAt: kybApplications.reviewedAt,
      complianceScore: kybApplications.complianceScore,
      riskFlags: kybApplications.riskFlags,
      createdAt: kybApplications.createdAt,
      updatedAt: kybApplications.updatedAt,
      // Join establishment info
      establishmentName: establishments.name,
      establishmentCountry: establishments.country,
      establishmentType: establishments.type,
    })
    .from(kybApplications)
    .leftJoin(establishments, eq(kybApplications.establishmentId, establishments.id));

  if (filters?.status) {
    query = (query as any).where(eq(kybApplications.status, filters.status as any));
  }

  return (query as any)
    .orderBy(desc(kybApplications.createdAt))
    .limit(filters?.limit ?? 100)
    .offset(filters?.offset ?? 0);
}

export async function approveKybApplication(
  applicationId: number,
  reviewedBy: number,
  reviewNotes?: string
) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .update(kybApplications)
    .set({
      status: "approved",
      reviewedBy,
      reviewedAt: new Date(),
      reviewNotes: reviewNotes ?? "Application approved",
      updatedAt: new Date(),
    })
    .where(eq(kybApplications.id, applicationId))
    .returning();
  // Also update the linked establishment kybStatus
  if (row) {
    await db
      .update(establishments)
      .set({ kybStatus: "approved", updatedAt: new Date() })
      .where(eq(establishments.id, row.establishmentId));
  }
  return row;
}

export async function rejectKybApplication(
  applicationId: number,
  reviewedBy: number,
  reviewNotes: string
) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .update(kybApplications)
    .set({
      status: "rejected",
      reviewedBy,
      reviewedAt: new Date(),
      reviewNotes,
      updatedAt: new Date(),
    })
    .where(eq(kybApplications.id, applicationId))
    .returning();
  if (row) {
    await db
      .update(establishments)
      .set({ kybStatus: "rejected", updatedAt: new Date() })
      .where(eq(establishments.id, row.establishmentId));
  }
  return row;
}

export async function getKybApplicationStats() {
  const db = await getDb();
  if (!db) return { total: 0, draft: 0, submitted: 0, under_review: 0, approved: 0, rejected: 0 };

  const [total] = await db.select({ count: sql<number>`count(*)` }).from(kybApplications);
  const [draft] = await db.select({ count: sql<number>`count(*)` }).from(kybApplications).where(eq(kybApplications.status, "draft"));
  const [submitted] = await db.select({ count: sql<number>`count(*)` }).from(kybApplications).where(eq(kybApplications.status, "submitted"));
  const [under_review] = await db.select({ count: sql<number>`count(*)` }).from(kybApplications).where(eq(kybApplications.status, "under_review"));
  const [approved] = await db.select({ count: sql<number>`count(*)` }).from(kybApplications).where(eq(kybApplications.status, "approved"));
  const [rejected] = await db.select({ count: sql<number>`count(*)` }).from(kybApplications).where(eq(kybApplications.status, "rejected"));

  return {
    total: Number(total?.count ?? 0),
    draft: Number(draft?.count ?? 0),
    submitted: Number(submitted?.count ?? 0),
    under_review: Number(under_review?.count ?? 0),
    approved: Number(approved?.count ?? 0),
    rejected: Number(rejected?.count ?? 0),
  };
}

// ─── BIS Auto-Advance ─────────────────────────────────────────────────────────

export async function getPendingBisInvestigations(limit = 10) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(bisInvestigations)
    .where(eq(bisInvestigations.status, "pending"))
    .orderBy(bisInvestigations.createdAt)
    .limit(limit);
}

export async function getProcessingBisInvestigations(limit = 10) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(bisInvestigations)
    .where(eq(bisInvestigations.status, "processing"))
    .orderBy(bisInvestigations.createdAt)
    .limit(limit);
}

export async function advanceBisInvestigationToProcessing(investigationId: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .update(bisInvestigations)
    .set({ status: "processing", updatedAt: new Date() })
    .where(and(eq(bisInvestigations.id, investigationId), eq(bisInvestigations.status, "pending")))
    .returning();
  return row;
}

export async function completeBisInvestigation(
  investigationId: number,
  results: {
    riskScore: number;
    riskLevel: "low" | "medium" | "high" | "critical";
    moduleResults: Record<string, unknown>;
    recommendations: string[];
    status?: "completed" | "flagged";
  }
) {
  const db = await getDb();
  if (!db) return null;
  const finalStatus = results.status ?? (results.riskScore >= 70 ? "flagged" : "completed");
  const [row] = await db
    .update(bisInvestigations)
    .set({
      status: finalStatus,
      riskScore: results.riskScore,
      riskLevel: results.riskLevel,
      moduleResults: results.moduleResults,
      recommendations: results.recommendations,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(bisInvestigations.id, investigationId), eq(bisInvestigations.status, "processing")))
    .returning();
  return row;
}

// ─── Notification Preferences ─────────────────────────────────────────────────

export async function getNotificationPreferences(userId: number): Promise<NotificationPreferences | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);
  return result[0] ?? null;
}

export async function upsertNotificationPreferences(
  userId: number,
  prefs: Partial<Omit<NotificationPreferences, "id" | "userId" | "createdAt" | "updatedAt">>
): Promise<NotificationPreferences> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [row] = await db
    .insert(notificationPreferences)
    .values({ userId, ...prefs })
    .onConflictDoUpdate({
      target: notificationPreferences.userId,
      set: { ...prefs, updatedAt: new Date() },
    })
    .returning();
  return row;
}

// ─── Audit Logs ───────────────────────────────────────────────────────────────

export async function createAuditLog(data: InsertAuditLog): Promise<AuditLog | undefined> {
  const db = await getDb();
  if (!db) {
    console.warn("[AuditLog] Database not available, skipping audit log");
    return undefined;
  }
  try {
    const result = await db.insert(auditLogs).values(data).returning();
    return result[0];
  } catch (err) {
    console.warn("[AuditLog] Failed to write audit log:", err);
    return undefined;
  }
}

export async function getAuditLogs(filters?: {
  actorId?: number;
  action?: string;
  entityType?: string;
  entityId?: string;
  since?: Date;
  until?: Date;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  let query = db.select().from(auditLogs);
  const conditions = [];
  if (filters?.actorId) conditions.push(eq(auditLogs.actorId, filters.actorId));
  if (filters?.action) conditions.push(eq(auditLogs.action, filters.action));
  if (filters?.entityType) conditions.push(eq(auditLogs.entityType, filters.entityType));
  if (filters?.entityId) conditions.push(eq(auditLogs.entityId, filters.entityId));
  if (filters?.since) conditions.push(sql`${auditLogs.createdAt} >= ${filters.since}`);
  if (filters?.until) conditions.push(sql`${auditLogs.createdAt} <= ${filters.until}`);
  if (conditions.length > 0) query = (query as any).where(and(...conditions));
  return (query as any)
    .orderBy(desc(auditLogs.createdAt))
    .limit(filters?.limit ?? 100)
    .offset(filters?.offset ?? 0);
}

export async function getAuditLogStats() {
  const db = await getDb();
  if (!db) return { total: 0, today: 0, byAction: [] };
  const [total] = await db.select({ count: sql<number>`count(*)` }).from(auditLogs);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [todayCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(auditLogs)
    .where(sql`${auditLogs.createdAt} >= ${today}`);
  const byAction = await db
    .select({ action: auditLogs.action, count: sql<number>`count(*)` })
    .from(auditLogs)
    .groupBy(auditLogs.action)
    .orderBy(desc(sql`count(*)`))
    .limit(10);
  return {
    total: Number(total?.count ?? 0),
    today: Number(todayCount?.count ?? 0),
    byAction: byAction.map((r) => ({ action: r.action, count: Number(r.count) })),
  };
}

// ─── Live Sidebar Badge Counts ────────────────────────────────────────────────

export async function getSidebarBadgeCounts() {
  const db = await getDb();
  if (!db) return { pendingKybApplications: 0, pendingBisInvestigations: 0 };
  const [pendingKyb] = await db
    .select({ count: sql<number>`count(*)` })
    .from(kybApplications)
    .where(eq(kybApplications.status, "submitted"));
  const [pendingBis] = await db
    .select({ count: sql<number>`count(*)` })
    .from(bisInvestigations)
    .where(eq(bisInvestigations.status, "pending"));
  return {
    pendingKybApplications: Number(pendingKyb?.count ?? 0),
    pendingBisInvestigations: Number(pendingBis?.count ?? 0),
  };
}

// ─── Global Search ────────────────────────────────────────────────────────────
export async function globalSearch(query: string) {
  const db = await getDb();
  if (!db) return { establishments: [], investigations: [], kybApplications: [] };

  const q = `%${query.toLowerCase()}%`;

  const [estResults, bisResults, kybResults] = await Promise.all([
    db
      .select({
        id: establishments.id,
        name: establishments.name,
        type: establishments.type,
        country: establishments.country,
        kybStatus: establishments.kybStatus,
        contactEmail: establishments.contactEmail,
      })
      .from(establishments)
      .where(sql`lower(${establishments.name}) like ${q} or lower(coalesce(${establishments.contactEmail}, '')) like ${q}`)
      .limit(5),

    db
      .select({
        id: bisInvestigations.id,
        referenceId: bisInvestigations.referenceId,
        subjectFullName: bisInvestigations.subjectFullName,
        subjectEmail: bisInvestigations.subjectEmail,
        status: bisInvestigations.status,
        riskLevel: bisInvestigations.riskLevel,
        tier: bisInvestigations.tier,
        createdAt: bisInvestigations.createdAt,
      })
      .from(bisInvestigations)
      .where(
        sql`lower(${bisInvestigations.subjectFullName}) like ${q} or lower(${bisInvestigations.referenceId}) like ${q} or lower(coalesce(${bisInvestigations.subjectEmail}, '')) like ${q}`
      )
      .limit(5),

    db
      .select({
        id: kybApplications.id,
        establishmentId: kybApplications.establishmentId,
        status: kybApplications.status,
        currentStep: kybApplications.currentStep,
        complianceScore: kybApplications.complianceScore,
        createdAt: kybApplications.createdAt,
      })
      .from(kybApplications)
      .where(
        sql`lower(${kybApplications.status}) like ${q}`
      )
      .limit(5),
  ]);

  return {
    establishments: estResults,
    investigations: bisResults,
    kybApplications: kybResults,
  };
}

// ─── KYB Compliance Score Calculator ─────────────────────────────────────────
export async function calculateAndStoreComplianceScore(applicationId: number) {
  const db = await getDb();
  if (!db) return null;

  const [app] = await db
    .select()
    .from(kybApplications)
    .where(eq(kybApplications.id, applicationId))
    .limit(1);

  if (!app) return null;

  const docs = await db
    .select()
    .from(kybDocuments)
    .where(eq(kybDocuments.applicationId, applicationId));

  const REQUIRED_DOCS = [
    "certificate_of_incorporation",
    "business_license",
    "tax_certificate",
    "proof_of_address",
  ];
  const OPTIONAL_DOCS = [
    "bank_statement",
    "director_id",
    "shareholder_register",
    "aml_policy",
  ];

  const verifiedRequired = docs.filter(
    (d) => REQUIRED_DOCS.includes(d.documentType) && d.status === "verified"
  ).length;
  const verifiedOptional = docs.filter(
    (d) => OPTIONAL_DOCS.includes(d.documentType) && d.status === "verified"
  ).length;
  const rejectedDocs = docs.filter((d) => d.status === "rejected").length;

  const requiredScore = (verifiedRequired / REQUIRED_DOCS.length) * 60;
  const optionalScore = Math.min((verifiedOptional / OPTIONAL_DOCS.length) * 30, 30);
  const penaltyScore = Math.min(rejectedDocs * 10, 30);
  const stepBonus = app.totalSteps > 0 ? (app.currentStep / app.totalSteps) * 10 : 0;

  const rawScore = requiredScore + optionalScore + stepBonus - penaltyScore;
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  const riskFlags: string[] = [];
  if (verifiedRequired < REQUIRED_DOCS.length) riskFlags.push("incomplete_required_docs");
  if (rejectedDocs > 0) riskFlags.push("rejected_documents");
  if (score < 40) riskFlags.push("high_risk_score");

  const [updated] = await db
    .update(kybApplications)
    .set({ complianceScore: score, riskFlags, updatedAt: new Date() })
    .where(eq(kybApplications.id, applicationId))
    .returning();

  return updated;
}

// ─── BIS Module Results Update ────────────────────────────────────────────────
export async function updateBisModuleResults(
  id: number,
  moduleResults: Record<string, unknown>,
  analystNotes?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Recalculate overall risk score from module scores
  const modules = Object.values(moduleResults) as Array<{ score?: number }>;
  const scores = modules.map((m) => m?.score ?? 0).filter((s) => s > 0);
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  const riskLevel =
    avgScore >= 75 ? "critical" :
    avgScore >= 50 ? "high" :
    avgScore >= 25 ? "medium" : "low";

  const [updated] = await db
    .update(bisInvestigations)
    .set({
      moduleResults,
      riskScore: avgScore,
      riskLevel: riskLevel as any,
      recommendations: analystNotes ? [analystNotes] : undefined,
      updatedAt: new Date(),
    })
    .where(eq(bisInvestigations.id, id))
    .returning();

  return updated;
}
