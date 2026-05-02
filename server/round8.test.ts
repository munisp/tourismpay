/**
 * Round 8 Tests
 * Covers: search.global, bisModuleEditor.updateModuleResults,
 *         bisModuleEditor.getModuleResults, kybCompliance.recalculateScore
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock db helpers ──────────────────────────────────────────────────────────

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    globalSearch: vi.fn().mockResolvedValue({
      establishments: [
        { id: 1, name: "Safari Lodge", type: "hotel", country: "KE", kybStatus: "approved", contactEmail: "info@safari.ke" },
      ],
      investigations: [
        { id: 10, referenceId: "BIS-001", subjectFullName: "John Doe", tier: "standard", status: "completed", subjectEmail: "john@example.com" },
      ],
      kybApplications: [
        { id: 5, currentStep: 3, status: "under_review", complianceScore: 72 },
      ],
    }),
    getBisInvestigationById: vi.fn().mockResolvedValue({
      id: 10,
      referenceId: "BIS-001",
      moduleResults: { identity: { score: 80, status: "clear" } },
      riskScore: 25,
      riskLevel: "low",
      recommendations: ["Monitor quarterly"],
    }),
    updateBisModuleResults: vi.fn().mockResolvedValue({
      id: 10,
      referenceId: "BIS-001",
      riskScore: 45,
      riskLevel: "medium",
      moduleResults: {
        identity: { score: 80, status: "clear" },
        criminal: { score: 55, status: "inconclusive" },
      },
    }),
    calculateAndStoreComplianceScore: vi.fn().mockResolvedValue({
      id: 5,
      complianceScore: 85,
      riskFlags: [],
      status: "approved",
    }),
    createAuditLog: vi.fn().mockResolvedValue({ id: 99 }),
    getAllKybDocuments: vi.fn().mockResolvedValue([]),
    getKybDocumentStats: vi.fn().mockResolvedValue({ total: 0, pending: 0, verified: 0, rejected: 0 }),
    getAllKybApplications: vi.fn().mockResolvedValue([]),
    getKybApplicationStats: vi.fn().mockResolvedValue({ total: 0, submitted: 0, underReview: 0, approved: 0, rejected: 0 }),
    getAuditLogs: vi.fn().mockResolvedValue([]),
    getAuditLogStats: vi.fn().mockResolvedValue({ total: 0, today: 0, byAction: [] }),
    getSidebarBadgeCounts: vi.fn().mockResolvedValue({ kybPending: 0, bisProcessing: 0, kybDocsPending: 0, notificationsUnread: 0 }),
    getUserNotifications: vi.fn().mockResolvedValue([]),
    getUnreadNotificationCount: vi.fn().mockResolvedValue(0),
    getNotificationPreferences: vi.fn().mockResolvedValue(null),
    getPendingBisInvestigations: vi.fn().mockResolvedValue([]),
    getProcessingBisInvestigations: vi.fn().mockResolvedValue([]),
  };
});

vi.mock("./jobs/bisAutoAdvance", () => ({
  getBisJobStatus: vi.fn().mockReturnValue({ running: false, lastRun: null, totalProcessed: 0, totalFailed: 0 }),
  triggerBisAutoAdvance: vi.fn().mockResolvedValue({ processed: 0, failed: 0 }),
}));

// ─── Context helpers ──────────────────────────────────────────────────────────

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function makeCtx(role: "admin" | "user" = "user"): TrpcContext {
  const user: AuthenticatedUser = {
    id: role === "admin" ? 99 : 1,
    openId: `${role}-user`,
    email: `${role}@example.com`,
    name: role === "admin" ? "Admin User" : "Regular User",
    loginMethod: "manus",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("search.global", () => {
  it("returns ranked results across all categories", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.search.global({ query: "safari" });

    expect(result.counts.total).toBe(3);
    expect(result.counts.establishments).toBe(1);
    expect(result.counts.investigations).toBe(1);
    expect(result.counts.kybApplications).toBe(1);
    expect(result.items[0]).toMatchObject({
      category: "establishment",
      title: "Safari Lodge",
      href: "/africa/registry",
      badge: "approved",
      badgeColor: "green",
    });
    expect(result.items[1]).toMatchObject({
      category: "investigation",
      title: "John Doe",
      href: "/bis/10",
      badge: "completed",
      badgeColor: "green",
    });
    expect(result.items[2]).toMatchObject({
      category: "kyb_application",
      href: "/admin/kyb-applications",
      badge: "under_review",
      badgeColor: "yellow",
    });
  });

  it("rejects queries shorter than 2 characters", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.search.global({ query: "a" })).rejects.toThrow();
  });

  it("rejects queries longer than 100 characters", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.search.global({ query: "a".repeat(101) })).rejects.toThrow();
  });
});

describe("bisModuleEditor.getModuleResults", () => {
  it("returns module results for a valid investigation", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.bisModuleEditor.getModuleResults({ investigationId: 10 });

    expect(result.investigationId).toBe(10);
    expect(result.referenceId).toBe("BIS-001");
    expect(result.riskScore).toBe(25);
    expect(result.riskLevel).toBe("low");
    expect(result.moduleResults).toHaveProperty("identity");
  });
});

describe("bisModuleEditor.updateModuleResults", () => {
  it("allows admin to update module results", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.bisModuleEditor.updateModuleResults({
      investigationId: 10,
      modules: {
        criminal: { score: 55, status: "inconclusive", summary: "Inconclusive criminal check", analystOverride: true },
      },
      analystNotes: "Analyst reviewed manually",
    });

    expect(result.success).toBe(true);
    expect(result.investigation?.riskScore).toBe(45);
    expect(result.investigation?.riskLevel).toBe("medium");
    expect(result.message).toContain("45/100");
  });

  it("rejects non-admin users", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.bisModuleEditor.updateModuleResults({
        investigationId: 10,
        modules: { criminal: { score: 55, status: "inconclusive" } },
      })
    ).rejects.toThrow("Admin access required");
  });

  it("validates module score range (0-100)", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    await expect(
      caller.bisModuleEditor.updateModuleResults({
        investigationId: 10,
        modules: { criminal: { score: 150, status: "clear" } },
      })
    ).rejects.toThrow();
  });

  it("validates module status enum", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    await expect(
      caller.bisModuleEditor.updateModuleResults({
        investigationId: 10,
        // @ts-expect-error intentional bad value
        modules: { criminal: { score: 50, status: "unknown_status" } },
      })
    ).rejects.toThrow();
  });
});

describe("kybCompliance.recalculateScore", () => {
  it("allows admin to recalculate compliance score", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.kybCompliance.recalculateScore({ applicationId: 5 });

    expect(result.success).toBe(true);
    expect(result.applicationId).toBe(5);
    expect(result.complianceScore).toBe(85);
    expect(result.riskFlags).toEqual([]);
    expect(result.status).toBe("approved");
  });

  it("rejects non-admin users", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.kybCompliance.recalculateScore({ applicationId: 5 })
    ).rejects.toThrow("Admin access required");
  });

  it("rejects invalid application IDs", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    await expect(
      caller.kybCompliance.recalculateScore({ applicationId: -1 })
    ).rejects.toThrow();
  });
});
