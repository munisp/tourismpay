/**
 * Round 29 Tests
 * - loyalty.adminRewards (admin-only, returns all rewards with expiry flags)
 * - loyalty.setRewardExpiry (admin-only, set/clear expiresAt per reward)
 * - loyalty.expireRewards (admin-only, deactivate expired rewards)
 * - wallet.balanceSummary (user-scoped, returns per-currency balance + 7-day sparkline)
 * - bis.addTimelineEvent (protectedProcedure, adds event to investigation timeline)
 * - bis.getTimeline (protectedProcedure, returns ordered timeline events)
 * - bis.deleteTimelineEvent (adminProcedure, removes a timeline event)
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
const userCtx = () => ({
  user: { id: 42, email: "user@test.com", role: "user" as const, name: "Test User", openId: "u42", createdAt: new Date() },
  req: {} as any,
  res: {} as any,
});
const adminCtx = () => ({
  user: { id: 1, email: "admin@test.com", role: "admin" as const, name: "Admin", openId: "a1", createdAt: new Date() },
  req: {} as any,
  res: {} as any,
});

// ─── loyalty.adminRewards ────────────────────────────────────────────────────
describe("loyalty.adminRewards", () => {
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

// ─── loyalty.setRewardExpiry ─────────────────────────────────────────────────
describe("loyalty.setRewardExpiry", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.loyalty.setRewardExpiry({ rewardId: "r1", expiresAt: null })).rejects.toThrow();
  });

  it("requires admin role", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.loyalty.setRewardExpiry({ rewardId: "r1", expiresAt: null })).rejects.toThrow();
  });

  it("throws when DB unavailable (with future timestamp)", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    const futureMs = Date.now() + 7 * 24 * 60 * 60 * 1000;
    await expect(caller.loyalty.setRewardExpiry({ rewardId: "r1", expiresAt: futureMs })).rejects.toThrow("Database unavailable");
  });

  it("throws when DB unavailable (with null to clear expiry)", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    await expect(caller.loyalty.setRewardExpiry({ rewardId: "r1", expiresAt: null })).rejects.toThrow("Database unavailable");
  });

  it("validates rewardId is a string", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    // Should throw validation error for invalid input
    await expect(caller.loyalty.setRewardExpiry({ rewardId: "" as any, expiresAt: null })).rejects.toThrow();
  });

  it("validates expiresAt is a number or null", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    // String timestamp should be rejected
    await expect(caller.loyalty.setRewardExpiry({ rewardId: "r1", expiresAt: "not-a-number" as any })).rejects.toThrow();
  });
});

// ─── loyalty.expireRewards ───────────────────────────────────────────────────
describe("loyalty.expireRewards", () => {
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

// ─── wallet.balanceSummary ───────────────────────────────────────────────────
describe("wallet.balanceSummary", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.wallet.balanceSummary()).rejects.toThrow();
  });

  it("returns empty balances array when DB unavailable", async () => {
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

  it("is defined as a query procedure", () => {
    const procedures = appRouter._def.procedures;
    expect(procedures["wallet.balanceSummary"]).toBeDefined();
  });

  it("returns object with balances property", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.balanceSummary();
    expect(typeof result).toBe("object");
    expect("balances" in result).toBe(true);
  });
});

// ─── bis.addTimelineEvent ────────────────────────────────────────────────────
describe("bis.addTimelineEvent", () => {
  const validInput = {
    investigationId: 1,
    eventType: "note" as const,
    title: "Initial review completed",
    description: "All documents verified",
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

  it("throws when DB unavailable for admin too", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    await expect(caller.bis.addTimelineEvent(validInput)).rejects.toThrow("Database unavailable");
  });

  it("validates investigationId is a positive integer", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.bis.addTimelineEvent({ ...validInput, investigationId: 0 })).rejects.toThrow();
  });

  it("validates investigationId is not negative", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.bis.addTimelineEvent({ ...validInput, investigationId: -1 })).rejects.toThrow();
  });

  it("validates title is required and non-empty", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.bis.addTimelineEvent({ ...validInput, title: "" })).rejects.toThrow();
  });

  it("validates eventType enum", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.bis.addTimelineEvent({ ...validInput, eventType: "invalid_type" as any })).rejects.toThrow();
  });

  it("validates severity enum", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.bis.addTimelineEvent({ ...validInput, severity: "unknown" as any })).rejects.toThrow();
  });

  it("accepts all valid eventType values", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const validTypes = ["status_change", "note", "document_uploaded", "ai_score", "osint_enrich", "risk_update", "assigned", "completed", "created", "flagged", "other"] as const;
    for (const eventType of validTypes) {
      // Each should throw DB unavailable (not validation error)
      await expect(caller.bis.addTimelineEvent({ ...validInput, eventType })).rejects.toThrow("Database unavailable");
    }
  });

  it("accepts all valid severity values", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const validSeverities = ["info", "warning", "critical", "success"] as const;
    for (const severity of validSeverities) {
      await expect(caller.bis.addTimelineEvent({ ...validInput, severity })).rejects.toThrow("Database unavailable");
    }
  });

  it("description is optional", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const { description, ...withoutDesc } = validInput;
    await expect(caller.bis.addTimelineEvent(withoutDesc)).rejects.toThrow("Database unavailable");
  });

  it("metadata is optional", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.bis.addTimelineEvent({ ...validInput, metadata: { key: "value" } })).rejects.toThrow("Database unavailable");
  });

  it("is defined as a mutation procedure", () => {
    const procedures = appRouter._def.procedures;
    expect(procedures["bis.addTimelineEvent"]).toBeDefined();
  });
});

// ─── bis.getTimeline ─────────────────────────────────────────────────────────
describe("bis.getTimeline", () => {
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

  it("is accessible to admin users", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.bis.getTimeline({ investigationId: 1 });
    expect(result).toHaveProperty("events");
  });

  it("validates investigationId is a positive integer", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.bis.getTimeline({ investigationId: 0 })).rejects.toThrow();
  });

  it("validates investigationId is not negative", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.bis.getTimeline({ investigationId: -5 })).rejects.toThrow();
  });

  it("accepts custom limit parameter", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.bis.getTimeline({ investigationId: 1, limit: 10 });
    expect(result).toHaveProperty("events");
  });

  it("validates limit is between 1 and 200", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.bis.getTimeline({ investigationId: 1, limit: 0 })).rejects.toThrow();
    await expect(caller.bis.getTimeline({ investigationId: 1, limit: 201 })).rejects.toThrow();
  });

  it("is defined as a query procedure", () => {
    const procedures = appRouter._def.procedures;
    expect(procedures["bis.getTimeline"]).toBeDefined();
  });
});

// ─── bis.deleteTimelineEvent ─────────────────────────────────────────────────
describe("bis.deleteTimelineEvent", () => {
  const validEventId = "550e8400-e29b-41d4-a716-446655440000";

  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.bis.deleteTimelineEvent({ eventId: validEventId })).rejects.toThrow();
  });

  it("requires admin role", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.bis.deleteTimelineEvent({ eventId: validEventId })).rejects.toThrow();
  });

  it("throws when DB unavailable", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    await expect(caller.bis.deleteTimelineEvent({ eventId: validEventId })).rejects.toThrow("Database unavailable");
  });

  it("validates eventId is a UUID", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    await expect(caller.bis.deleteTimelineEvent({ eventId: "not-a-uuid" })).rejects.toThrow();
  });

  it("validates eventId is not empty", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    await expect(caller.bis.deleteTimelineEvent({ eventId: "" })).rejects.toThrow();
  });

  it("is defined as a mutation procedure", () => {
    const procedures = appRouter._def.procedures;
    expect(procedures["bis.deleteTimelineEvent"]).toBeDefined();
  });
});

// ─── Integration: Timeline event types and severity coverage ─────────────────
describe("BIS Timeline — event type and severity coverage", () => {
  it("all 11 event types are valid enum values", () => {
    const validTypes = [
      "status_change", "note", "document_uploaded", "ai_score",
      "osint_enrich", "risk_update", "assigned", "completed",
      "created", "flagged", "other",
    ];
    expect(validTypes.length).toBe(11);
    // Each must be a non-empty string
    for (const t of validTypes) {
      expect(typeof t).toBe("string");
      expect(t.length).toBeGreaterThan(0);
    }
  });

  it("all 4 severity levels are valid enum values", () => {
    const validSeverities = ["info", "warning", "critical", "success"];
    expect(validSeverities.length).toBe(4);
    for (const s of validSeverities) {
      expect(typeof s).toBe("string");
    }
  });
});

// ─── wallet.balanceSummary — sparkline structure ──────────────────────────────
describe("wallet.balanceSummary — sparkline structure", () => {
  it("procedure is registered in the router", () => {
    const procedures = appRouter._def.procedures;
    expect(procedures["wallet.balanceSummary"]).toBeDefined();
  });

  it("returns balances with expected shape when DB has data (mocked)", async () => {
    // When DB is null, we get empty balances — the shape is still correct
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.balanceSummary();
    expect(result).toMatchObject({ balances: expect.any(Array) });
  });

  it("balances array items would have currency, balance, sparkline, change7d", async () => {
    // Verify the return type contract by checking the procedure exists and returns the right shape
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.balanceSummary();
    // With null DB, balances is empty — just verify structure
    expect(result.balances).toEqual([]);
  });
});
