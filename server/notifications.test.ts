/**
 * Tests for notifications, kybApplications, and bisJobs tRPC routers,
 * plus the bisAutoAdvance job utility functions.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock DB helpers ──────────────────────────────────────────────────────────

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
  getUserNotifications: vi.fn().mockResolvedValue([
    {
      id: 1,
      userId: 1,
      category: "bis",
      title: "Investigation Completed",
      content: "BIS-001 completed. Risk: 25/100 (low).",
      actionUrl: "/bis/report/1",
      actionLabel: "View Report",
      isRead: false,
      readAt: null,
      metadata: null,
      createdAt: new Date("2026-02-23T08:00:00Z"),
    },
    {
      id: 2,
      userId: 1,
      category: "kyb",
      title: "KYB Application Approved",
      content: "Your KYB application has been approved.",
      actionUrl: "/kyb",
      actionLabel: "View KYB Status",
      isRead: true,
      readAt: new Date("2026-02-23T08:05:00Z"),
      metadata: null,
      createdAt: new Date("2026-02-23T07:00:00Z"),
    },
  ]),
  getUnreadNotificationCount: vi.fn().mockResolvedValue(1),
  markNotificationRead: vi.fn().mockImplementation((id: number, userId: number) => {
    if (id === 1 && userId === 1) {
      return Promise.resolve({ id: 1, isRead: true, readAt: new Date() });
    }
    return Promise.resolve(null);
  }),
  markAllNotificationsRead: vi.fn().mockResolvedValue(1),
  deleteNotification: vi.fn().mockResolvedValue(true),
  createUserNotification: vi.fn().mockResolvedValue({
    id: 3,
    userId: 2,
    category: "system",
    title: "Test",
    content: "Test notification",
    isRead: false,
    createdAt: new Date(),
  }),
  getAllKybApplications: vi.fn().mockResolvedValue([
    {
      id: 10,
      establishmentId: 5,
      submittedBy: 2,
      status: "submitted",
      currentStep: 3,
      totalSteps: 5,
      documentsUploaded: 3,
      reviewNotes: null,
      reviewedBy: null,
      reviewedAt: null,
      complianceScore: null,
      riskFlags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      establishmentName: "Serengeti Lodge",
      establishmentCountry: "TZ",
      establishmentType: "hotel",
    },
  ]),
  getKybDocumentsByApplication: vi.fn().mockResolvedValue([
    { documentType: "certificate_of_incorporation", status: "verified" },
    { documentType: "business_license", status: "pending" },
    { documentType: "tax_certificate", status: "pending" },
  ]),
  getKybApplicationStats: vi.fn().mockResolvedValue({
    total: 42,
    draft: 10,
    submitted: 15,
    under_review: 8,
    approved: 7,
    rejected: 2,
  }),
  approveKybApplication: vi.fn().mockResolvedValue({
    id: 10,
    establishmentId: 5,
    submittedBy: 2,
    status: "approved",
    reviewedBy: 1,
    reviewedAt: new Date(),
    reviewNotes: "All documents verified",
  }),
  rejectKybApplication: vi.fn().mockResolvedValue({
    id: 10,
    establishmentId: 5,
    submittedBy: 2,
    status: "rejected",
    reviewedBy: 1,
    reviewedAt: new Date(),
    reviewNotes: "Documents expired",
  }),
  getPendingBisInvestigations: vi.fn().mockResolvedValue([]),
  getProcessingBisInvestigations: vi.fn().mockResolvedValue([]),
  advanceBisInvestigationToProcessing: vi.fn().mockResolvedValue(null),
  completeBisInvestigation: vi.fn().mockResolvedValue(null),
  upsertUser: vi.fn().mockResolvedValue(undefined),
  getEstablishmentsByUser: vi.fn().mockResolvedValue([]),
  getKybApplicationByEstablishment: vi.fn().mockResolvedValue(null),
  getBisInvestigationsByEstablishment: vi.fn().mockResolvedValue([]),
  getBisInvestigationById: vi.fn().mockResolvedValue(null),
  getFraudAlerts: vi.fn().mockResolvedValue([]),
  getSocAlerts: vi.fn().mockResolvedValue([]),
  getDashboardStats: vi.fn().mockResolvedValue({
    totalEstablishments: 0,
    pendingKyb: 0,
    activeBisInvestigations: 0,
    openFraudAlerts: 0,
    openSocAlerts: 0,
    criticalAlerts: 0,
  }),
  getAllKybDocuments: vi.fn().mockResolvedValue([]),
  getKybDocumentStats: vi.fn().mockResolvedValue({ total: 0, pending: 0, verified: 0, rejected: 0 }),
  createKybDocument: vi.fn().mockResolvedValue({ id: 1 }),
  getKybDocumentsByApplication: vi.fn().mockResolvedValue([]),
  getKybDocumentsByEstablishment: vi.fn().mockResolvedValue([]),
  updateKybDocumentStatus: vi.fn().mockResolvedValue({ id: 1 }),
  deleteKybDocument: vi.fn().mockResolvedValue([]),
  createBisReportExport: vi.fn().mockResolvedValue({ id: 1 }),
  getBisReportExportsByInvestigation: vi.fn().mockResolvedValue([]),
  createAuditLog: vi.fn().mockResolvedValue({ id: 1, action: "test", entityType: "test", entityId: "1", createdAt: new Date() }),
  getAuditLogs: vi.fn().mockResolvedValue([]),
  getAuditLogStats: vi.fn().mockResolvedValue({ total: 0, today: 0, byAction: [], byEntityType: [] }),
  getSidebarBadgeCounts: vi.fn().mockResolvedValue({ kybPending: 0, bisProcessing: 0 }),
  getNotificationPreferences: vi.fn().mockResolvedValue(null),
  upsertNotificationPreferences: vi.fn().mockResolvedValue({ userId: 1 }),
}));

vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: "Executive summary content" } }],
  }),
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ url: "https://s3.example.com/report.html", key: "report.html" }),
}));

// ─── Context helpers ──────────────────────────────────────────────────────────

type AuthUser = NonNullable<TrpcContext["user"]>;

function makeCtx(overrides: Partial<AuthUser> = {}): TrpcContext {
  const user: AuthUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function makeAdminCtx(): TrpcContext {
  return makeCtx({ id: 1, role: "admin", email: "admin@tourismpay.io", name: "Admin User" });
}

function makeUnauthCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── Notifications tests ──────────────────────────────────────────────────────

describe("notifications.list", () => {
  it("returns notifications for the authenticated user", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.notifications.list({ limit: 50, offset: 0, unreadOnly: false });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty("title");
    expect(result[0]).toHaveProperty("category");
  });

  it("throws UNAUTHORIZED when not authenticated", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(caller.notifications.list()).rejects.toThrow();
  });
});

describe("notifications.unreadCount", () => {
  it("returns the unread notification count", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.notifications.unreadCount();
    expect(result).toHaveProperty("count");
    expect(typeof result.count).toBe("number");
  });
});

describe("notifications.markRead", () => {
  it("marks a notification as read", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.notifications.markRead({ notificationId: 1 });
    expect(result).toHaveProperty("isRead", true);
  });

  it("throws NOT_FOUND for a notification that does not belong to the user", async () => {
    const caller = appRouter.createCaller(makeCtx({ id: 99 }));
    await expect(caller.notifications.markRead({ notificationId: 1 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("notifications.markAllRead", () => {
  it("marks all notifications as read and returns count", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.notifications.markAllRead();
    expect(result).toHaveProperty("updated");
    expect(typeof result.updated).toBe("number");
  });
});

describe("notifications.delete", () => {
  it("deletes a notification for the authenticated user", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.notifications.delete({ notificationId: 1 });
    expect(result).toHaveProperty("success", true);
  });
});

describe("notifications.createForUser", () => {
  it("allows admin to create a notification for another user", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.notifications.createForUser({
      userId: 2,
      category: "system",
      title: "Test Notification",
      content: "This is a test notification",
    });
    expect(result).toBeDefined();
  });

  it("throws FORBIDDEN when non-admin tries to create for another user", async () => {
    const caller = appRouter.createCaller(makeCtx({ id: 1, role: "user" }));
    await expect(
      caller.notifications.createForUser({
        userId: 2,
        category: "system",
        title: "Hack",
        content: "Unauthorized notification",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

// ─── KYB Applications tests ───────────────────────────────────────────────────

describe("kybApplications.listAll", () => {
  it("returns all applications with document completeness for admin", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.kybApplications.listAll();
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toHaveProperty("docCompleteness");
    expect(typeof result[0].docCompleteness).toBe("number");
    expect(result[0].docCompleteness).toBeGreaterThanOrEqual(0);
    expect(result[0].docCompleteness).toBeLessThanOrEqual(100);
  });

  it("throws FORBIDDEN for non-admin users", async () => {
    const caller = appRouter.createCaller(makeCtx({ role: "user" }));
    await expect(caller.kybApplications.listAll()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("kybApplications.stats", () => {
  it("returns application stats for admin", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.kybApplications.stats();
    expect(result).toHaveProperty("total");
    expect(result).toHaveProperty("submitted");
    expect(result).toHaveProperty("approved");
    expect(result).toHaveProperty("rejected");
    expect(result.total).toBe(42);
  });
});

describe("kybApplications.approve", () => {
  it("approves a KYB application and returns the updated record", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.kybApplications.approve({
      applicationId: 10,
      reviewNotes: "All documents verified",
    });
    expect(result).toHaveProperty("status", "approved");
    expect(result).toHaveProperty("reviewedBy", 1);
  });

  it("throws FORBIDDEN when non-admin tries to approve", async () => {
    const caller = appRouter.createCaller(makeCtx({ role: "user" }));
    await expect(
      caller.kybApplications.approve({ applicationId: 10 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("kybApplications.reject", () => {
  it("rejects a KYB application with a reason", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.kybApplications.reject({
      applicationId: 10,
      reviewNotes: "Documents expired",
    });
    expect(result).toHaveProperty("status", "rejected");
    expect(result).toHaveProperty("reviewNotes", "Documents expired");
  });

  it("requires reviewNotes when rejecting", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    await expect(
      caller.kybApplications.reject({ applicationId: 10, reviewNotes: "" })
    ).rejects.toThrow();
  });
});

// ─── BIS Jobs tests ───────────────────────────────────────────────────────────

describe("bisJobs.queueStatus", () => {
  it("returns queue status with pending and processing counts for admin", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.bisJobs.queueStatus();
    expect(result).toHaveProperty("pendingCount");
    expect(result).toHaveProperty("processingCount");
    expect(Array.isArray(result.pending)).toBe(true);
    expect(Array.isArray(result.processing)).toBe(true);
  });

  it("throws FORBIDDEN for non-admin users", async () => {
    const caller = appRouter.createCaller(makeCtx({ role: "user" }));
    await expect(caller.bisJobs.queueStatus()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("bisJobs.triggerAutoAdvance", () => {
  it("runs a cycle and returns advance/complete counts for admin", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.bisJobs.triggerAutoAdvance();
    expect(result).toHaveProperty("success", true);
    expect(result).toHaveProperty("advanced");
    expect(result).toHaveProperty("completed");
    expect(result).toHaveProperty("errors");
    expect(result).toHaveProperty("message");
  });
});

// ─── BIS Auto-Advance job utility tests ──────────────────────────────────────

describe("bisAutoAdvance job utilities", () => {
  it("runBisAutoAdvanceCycle returns structured result", async () => {
    const { runBisAutoAdvanceCycle } = await import("./jobs/bisAutoAdvance");
    const result = await runBisAutoAdvanceCycle();
    expect(result).toHaveProperty("advanced");
    expect(result).toHaveProperty("completed");
    expect(result).toHaveProperty("errors");
    expect(typeof result.advanced).toBe("number");
    expect(typeof result.completed).toBe("number");
    expect(typeof result.errors).toBe("number");
  });

  it("startBisAutoAdvanceJob and stopBisAutoAdvanceJob do not throw", async () => {
    const { startBisAutoAdvanceJob, stopBisAutoAdvanceJob } = await import("./jobs/bisAutoAdvance");
    expect(() => startBisAutoAdvanceJob(999_999)).not.toThrow();
    expect(() => stopBisAutoAdvanceJob()).not.toThrow();
  });
});
