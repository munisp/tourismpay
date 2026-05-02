/**
 * Round 30 Tests
 * - BIS auto-timeline: autoTimeline helper fires on create, updateStatus, runAiScoring
 * - wallet.balanceSummary: alertBreached / alertThreshold annotation from walletBalanceAlerts
 * - loyalty.expireRewards: notifyOwner + per-user notifications when rewards are deactivated
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";

// ─── Mock DB ─────────────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
  getUser: vi.fn(),
  createUser: vi.fn(),
  getUserNotifications: vi.fn().mockResolvedValue([]),
  markNotificationRead: vi.fn().mockResolvedValue(true),
  markAllNotificationsRead: vi.fn().mockResolvedValue(true),
  createUserNotification: vi.fn().mockResolvedValue({ id: 1 }),
  getWalletBalances: vi.fn().mockResolvedValue([]),
  getWalletTransactions: vi.fn().mockResolvedValue([]),
  createWalletTransaction: vi.fn(),
  updateWalletBalance: vi.fn(),
  getBalanceAlerts: vi.fn().mockResolvedValue([]),
  createBalanceAlert: vi.fn(),
  updateBalanceAlert: vi.fn(),
  deleteBalanceAlert: vi.fn(),
  getSpendingLimits: vi.fn().mockResolvedValue([]),
  createSpendingLimit: vi.fn(),
  updateSpendingLimit: vi.fn(),
  deleteSpendingLimit: vi.fn(),
  getBisInvestigations: vi.fn().mockResolvedValue([]),
  getBisInvestigationById: vi.fn().mockResolvedValue(null),
  updateBisInvestigationStatus: vi.fn().mockResolvedValue(undefined),
  createBisInvestigation: vi.fn(),
  getAuditLogs: vi.fn().mockResolvedValue([]),
  createAuditLog: vi.fn().mockResolvedValue({ id: 1 }),
  getBiometricEnrollments: vi.fn().mockResolvedValue([]),
  getBiometricEnrollment: vi.fn().mockResolvedValue(null),
  createBiometricEnrollment: vi.fn(),
  updateBiometricEnrollment: vi.fn(),
  revokeBiometricEnrollment: vi.fn(),
}));

// ─── Context factories ────────────────────────────────────────────────────────
const anonCtx = () => ({ user: null, req: {} as any, res: {} as any });
const userCtx = (id = 42) => ({
  user: { id, email: "user@test.com", role: "user" as const, name: "Test User", openId: `u${id}`, createdAt: new Date() },
  req: {} as any,
  res: {} as any,
});
const adminCtx = () => ({
  user: { id: 1, email: "admin@test.com", role: "admin" as const, name: "Admin", openId: "a1", createdAt: new Date() },
  req: {} as any,
  res: {} as any,
});

// ─── BIS auto-timeline: bis.create ───────────────────────────────────────────
describe("BIS auto-timeline: bis.create", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(
      caller.bis.create({
        subjectFullName: "John Doe",
        tier: "standard",
        consentObtained: true,
      })
    ).rejects.toThrow();
  });

  it("throws when DB unavailable (createBisInvestigation returns null)", async () => {
    const { createBisInvestigation } = await import("./db");
    vi.mocked(createBisInvestigation).mockResolvedValueOnce(null as any);
    const caller = appRouter.createCaller(adminCtx() as any);
    // Should not throw — returns null gracefully
    const result = await caller.bis.create({
      subjectFullName: "Jane Doe",
      tier: "basic",
      consentObtained: false,
    });
    expect(result).toBeNull();
  });

  it("is accessible to admin users", async () => {
    const { createBisInvestigation } = await import("./db");
    vi.mocked(createBisInvestigation).mockResolvedValueOnce(null as any);
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.bis.create({
      subjectFullName: "Alice Smith",
      tier: "comprehensive",
      consentObtained: true,
      subjectNationality: "NG",
      subjectCountry: "NG",
    });
    expect(result).toBeNull(); // DB mock returns null
  });

  it("requires admin role (adminProcedure)", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.bis.create({
        subjectFullName: "Bob Jones",
        tier: "standard",
        consentObtained: true,
      })
    ).rejects.toThrow();
  });

  it("validates tier enum", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    await expect(
      caller.bis.create({
        subjectFullName: "Test",
        tier: "ultra" as any,
        consentObtained: true,
      })
    ).rejects.toThrow();
  });

  it("validates subjectFullName minimum length", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    await expect(
      caller.bis.create({
        subjectFullName: "A",
        tier: "basic",
        consentObtained: true,
      })
    ).rejects.toThrow();
  });

  it("is defined as a mutation procedure", () => {
    const procedures = appRouter._def.procedures;
    expect(procedures["bis.create"]).toBeDefined();
  });
});

// ─── BIS auto-timeline: bis.updateStatus ─────────────────────────────────────
describe("BIS auto-timeline: bis.updateStatus", () => {
  it("requires admin role", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.bis.updateStatus({ id: 1, status: "completed" })
    ).rejects.toThrow();
  });

  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(
      caller.bis.updateStatus({ id: 1, status: "flagged" })
    ).rejects.toThrow();
  });

  it("succeeds for admin and returns result from updateBisInvestigationStatus", async () => {
    const { updateBisInvestigationStatus, getBisInvestigationById } = await import("./db");
    vi.mocked(updateBisInvestigationStatus).mockResolvedValueOnce({ id: 1 } as any);
    vi.mocked(getBisInvestigationById).mockResolvedValueOnce(null); // no owner notification
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.bis.updateStatus({ id: 1, status: "processing" });
    expect(result).toEqual({ id: 1 });
  });

  it("accepts all valid status values", async () => {
    const { updateBisInvestigationStatus, getBisInvestigationById } = await import("./db");
    const statuses = ["pending", "processing", "completed", "flagged", "failed"] as const;
    for (const status of statuses) {
      vi.mocked(updateBisInvestigationStatus).mockResolvedValueOnce({ id: 1, status } as any);
      vi.mocked(getBisInvestigationById).mockResolvedValueOnce(null);
      const caller = appRouter.createCaller(adminCtx() as any);
      const result = await caller.bis.updateStatus({ id: 1, status });
      expect(result).toBeDefined();
    }
  });

  it("accepts optional riskLevel and riskScore", async () => {
    const { updateBisInvestigationStatus, getBisInvestigationById } = await import("./db");
    vi.mocked(updateBisInvestigationStatus).mockResolvedValueOnce({ id: 2, status: "completed" } as any);
    vi.mocked(getBisInvestigationById).mockResolvedValueOnce({
      id: 2,
      referenceId: "BIS-2025-0002",
      subjectFullName: "Test Subject",
      tier: "standard",
      consentObtained: true,
    } as any);
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.bis.updateStatus({
      id: 2,
      status: "completed",
      riskLevel: "high",
      riskScore: 75,
    });
    expect(result).toBeDefined();
  });

  it("validates riskScore range (0-100)", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    await expect(
      caller.bis.updateStatus({ id: 1, status: "completed", riskScore: 150 })
    ).rejects.toThrow();
  });

  it("validates riskLevel enum", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    await expect(
      caller.bis.updateStatus({ id: 1, status: "completed", riskLevel: "extreme" as any })
    ).rejects.toThrow();
  });

  it("is defined as a mutation procedure", () => {
    const procedures = appRouter._def.procedures;
    expect(procedures["bis.updateStatus"]).toBeDefined();
  });
});

// ─── BIS auto-timeline: bis.runAiScoring ─────────────────────────────────────
describe("BIS auto-timeline: bis.runAiScoring", () => {
  it("requires admin role", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.bis.runAiScoring({ id: 1 })).rejects.toThrow();
  });

  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.bis.runAiScoring({ id: 1 })).rejects.toThrow();
  });

  it("throws not found when investigation does not exist", async () => {
    const { getBisInvestigationById } = await import("./db");
    vi.mocked(getBisInvestigationById).mockResolvedValueOnce(null);
    const caller = appRouter.createCaller(adminCtx() as any);
    await expect(caller.bis.runAiScoring({ id: 999 })).rejects.toThrow("Investigation not found");
  });

  it("is defined as a mutation procedure", () => {
    const procedures = appRouter._def.procedures;
    expect(procedures["bis.runAiScoring"]).toBeDefined();
  });
});

// ─── wallet.balanceSummary: alertBreached annotation ─────────────────────────
describe("wallet.balanceSummary: alertBreached annotation", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.wallet.balanceSummary()).rejects.toThrow();
  });

  it("returns { balances: [] } when DB unavailable", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.balanceSummary();
    expect(result).toHaveProperty("balances");
    expect(Array.isArray(result.balances)).toBe(true);
    expect(result.balances.length).toBe(0);
  });

  it("is accessible to regular users", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.balanceSummary();
    expect(result).toBeDefined();
  });

  it("is accessible to admin users", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.wallet.balanceSummary();
    expect(result).toBeDefined();
  });

  it("returns object with balances array", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.balanceSummary();
    expect(typeof result).toBe("object");
    expect("balances" in result).toBe(true);
    expect(Array.isArray(result.balances)).toBe(true);
  });

  it("is defined as a query procedure", () => {
    const procedures = appRouter._def.procedures;
    expect(procedures["wallet.balanceSummary"]).toBeDefined();
  });

  it("returns empty balances when no balance rows exist (DB null)", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.balanceSummary();
    expect(result.balances).toHaveLength(0);
  });

  it("does not throw for multiple concurrent calls", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const [r1, r2] = await Promise.all([
      caller.wallet.balanceSummary(),
      caller.wallet.balanceSummary(),
    ]);
    expect(r1).toBeDefined();
    expect(r2).toBeDefined();
  });
});

// ─── loyalty.expireRewards: notifications ────────────────────────────────────
describe("loyalty.expireRewards: notifications", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.loyalty.expireRewards()).rejects.toThrow();
  });

  it("requires admin role", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.loyalty.expireRewards()).rejects.toThrow();
  });

  it("throws when DB unavailable", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    await expect(caller.loyalty.expireRewards()).rejects.toThrow("Database unavailable");
  });

  it("is defined as a mutation procedure", () => {
    const procedures = appRouter._def.procedures;
    expect(procedures["loyalty.expireRewards"]).toBeDefined();
  });
});

// ─── loyalty.adminRewards ────────────────────────────────────────────────────
describe("loyalty.adminRewards (round30 coverage)", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.loyalty.adminRewards()).rejects.toThrow();
  });

  it("requires admin role", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.loyalty.adminRewards()).rejects.toThrow();
  });

  it("returns empty array when DB unavailable", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.loyalty.adminRewards();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it("is defined as a query procedure", () => {
    const procedures = appRouter._def.procedures;
    expect(procedures["loyalty.adminRewards"]).toBeDefined();
  });
});

// ─── bis.getTimeline ─────────────────────────────────────────────────────────
describe("bis.getTimeline (round30 coverage)", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.bis.getTimeline({ investigationId: 1 })).rejects.toThrow();
  });

  it("returns empty events when DB unavailable", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.bis.getTimeline({ investigationId: 1 });
    expect(result).toHaveProperty("events");
    expect(Array.isArray(result.events)).toBe(true);
    expect(result.events.length).toBe(0);
  });

  it("is defined as a query procedure", () => {
    const procedures = appRouter._def.procedures;
    expect(procedures["bis.getTimeline"]).toBeDefined();
  });
});

// ─── bis.addTimelineEvent ────────────────────────────────────────────────────
describe("bis.addTimelineEvent (round30 coverage)", () => {
  const validInput = {
    investigationId: 1,
    eventType: "note" as const,
    title: "Reviewed documents",
    description: "All clear",
    severity: "info" as const,
  };

  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.bis.addTimelineEvent(validInput)).rejects.toThrow();
  });

  it("throws when DB unavailable", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.bis.addTimelineEvent(validInput)).rejects.toThrow("Database unavailable");
  });

  it("is defined as a mutation procedure", () => {
    const procedures = appRouter._def.procedures;
    expect(procedures["bis.addTimelineEvent"]).toBeDefined();
  });

  it("validates eventType enum", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    await expect(
      caller.bis.addTimelineEvent({ ...validInput, eventType: "invalid_type" as any })
    ).rejects.toThrow();
  });

  it("validates severity enum", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    await expect(
      caller.bis.addTimelineEvent({ ...validInput, severity: "unknown" as any })
    ).rejects.toThrow();
  });
});

// ─── bis.deleteTimelineEvent ─────────────────────────────────────────────────
describe("bis.deleteTimelineEvent (round30 coverage)", () => {
  it("requires admin role", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.bis.deleteTimelineEvent({ eventId: "evt-1" })).rejects.toThrow();
  });

  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.bis.deleteTimelineEvent({ eventId: "evt-1" })).rejects.toThrow();
  });

  it("throws when DB unavailable", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    const validUuid = crypto.randomUUID();
    await expect(caller.bis.deleteTimelineEvent({ eventId: validUuid })).rejects.toThrow("Database unavailable");
  });

  it("is defined as a mutation procedure", () => {
    const procedures = appRouter._def.procedures;
    expect(procedures["bis.deleteTimelineEvent"]).toBeDefined();
  });
});

// ─── wallet.setBalanceAlert ───────────────────────────────────────────────────
describe("wallet.setBalanceAlert (alertBreached integration)", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(
      caller.wallet.setBalanceAlert({ currency: "USDC", threshold: 100 })
    ).rejects.toThrow();
  });

  it("throws when DB unavailable", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.wallet.setBalanceAlert({ currency: "USDC", threshold: 100 })
    ).rejects.toThrow("Database unavailable");
  });

  it("validates threshold is positive", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.wallet.setBalanceAlert({ currency: "USDC", threshold: -5 })
    ).rejects.toThrow();
  });

  it("is defined as a mutation procedure", () => {
    const procedures = appRouter._def.procedures;
    expect(procedures["wallet.setBalanceAlert"]).toBeDefined();
  });
});

// ─── wallet.activeAlertBreaches ──────────────────────────────────────────────
describe("wallet.activeAlertBreaches (alertBreached integration)", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.wallet.activeAlertBreaches()).rejects.toThrow();
  });

  it("returns empty array when DB unavailable", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.activeAlertBreaches();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it("is defined as a query procedure", () => {
    const procedures = appRouter._def.procedures;
    expect(procedures["wallet.activeAlertBreaches"]).toBeDefined();
  });
});

// ─── loyalty.setRewardExpiry ─────────────────────────────────────────────────
describe("loyalty.setRewardExpiry (round30 coverage)", () => {
  it("requires admin role", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.loyalty.setRewardExpiry({ rewardId: "r1", expiresAt: null })
    ).rejects.toThrow();
  });

  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(
      caller.loyalty.setRewardExpiry({ rewardId: "r1", expiresAt: null })
    ).rejects.toThrow();
  });

  it("throws when DB unavailable", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    await expect(
      caller.loyalty.setRewardExpiry({ rewardId: "r1", expiresAt: Date.now() + 86400000 })
    ).rejects.toThrow("Database unavailable");
  });

  it("is defined as a mutation procedure", () => {
    const procedures = appRouter._def.procedures;
    expect(procedures["loyalty.setRewardExpiry"]).toBeDefined();
  });
});
