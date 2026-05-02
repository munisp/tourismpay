/**
 * Round 35 Tests
 * - wallet.executeScheduledPayments: dry-run returns due count, admin-only guard
 * - wallet.getScheduledPayments: returns payments, status filter works
 * - bis.getSlaConfig: returns default SLA config
 * - bis.updateSlaConfig: updates in-memory SLA config, validates ranges
 * - bis.getSlaStats: returns SLA compliance stats, admin-only guard
 * - loyalty.getExpiringRewards: returns rewards expiring within 30 days, empty when none
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

vi.mock("../_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
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

// ─── wallet.executeScheduledPayments ─────────────────────────────────────────
describe("wallet.executeScheduledPayments", () => {
  beforeEach(async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockReset();
    vi.mocked(getDb).mockResolvedValue(null);
  });

  it("rejects non-admin users", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.wallet.executeScheduledPayments()).rejects.toThrow();
  });

  it("rejects anonymous users", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.wallet.executeScheduledPayments()).rejects.toThrow();
  });

  it("throws when DB unavailable", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    await expect(caller.wallet.executeScheduledPayments()).rejects.toThrow(/unavailable/i);
  });

  it("dry-run returns due count without processing", async () => {
    const { getDb } = await import("./db");
    const now = Date.now();
    const mockDuePayments = [
      { id: "sp1", userId: "42", toAddress: "addr1", amount: "100", currency: "USDC", recurrence: "once", status: "active", nextRunAt: now - 1000 },
      { id: "sp2", userId: "43", toAddress: "addr2", amount: "200", currency: "NGN", recurrence: "weekly", status: "active", nextRunAt: now - 5000 },
    ];
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      and: vi.fn().mockReturnThis(),
      mockResolvedValue: vi.fn(),
    };
    // Make the select chain return due payments
    mockDb.where = vi.fn().mockResolvedValue(mockDuePayments);
    vi.mocked(getDb).mockResolvedValue(mockDb as any);

    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.wallet.executeScheduledPayments({ dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.due).toBe(2);
    expect(result.processed).toBe(0);
  });

  it("dry-run with no due payments returns zero", async () => {
    const { getDb } = await import("./db");
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);

    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.wallet.executeScheduledPayments({ dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.due).toBe(0);
    expect(result.processed).toBe(0);
  });
});

// ─── wallet.getScheduledPayments ─────────────────────────────────────────────
describe("wallet.getScheduledPayments", () => {
  beforeEach(async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockReset();
    vi.mocked(getDb).mockResolvedValue(null);
  });

  it("rejects anonymous users", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.wallet.getScheduledPayments()).rejects.toThrow();
  });

  it("returns empty array when DB unavailable", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.getScheduledPayments();
    expect(result.payments).toEqual([]);
  });

  it("returns user payments from DB", async () => {
    const { getDb } = await import("./db");
    const mockPayments = [
      { id: "sp1", userId: "42", toAddress: "addr1", amount: "100", currency: "USDC", recurrence: "once", status: "active", scheduledAt: Date.now() + 86400000 },
    ];
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue(mockPayments),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);

    const caller = appRouter.createCaller(userCtx(42) as any);
    const result = await caller.wallet.getScheduledPayments();
    expect(result.payments).toHaveLength(1);
    expect(result.payments[0].id).toBe("sp1");
  });

  it("filters by status when provided", async () => {
    const { getDb } = await import("./db");
    const mockPayments = [
      { id: "sp2", userId: "42", status: "cancelled", recurrence: "once", amount: "50", currency: "NGN" },
    ];
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue(mockPayments),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);

    const caller = appRouter.createCaller(userCtx(42) as any);
    const result = await caller.wallet.getScheduledPayments({ status: "cancelled" });
    expect(result.payments).toHaveLength(1);
    expect(result.payments[0].status).toBe("cancelled");
  });
});

// ─── bis.getSlaConfig ─────────────────────────────────────────────────────────
describe("bis.getSlaConfig", () => {
  it("rejects non-admin users", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.bis.getSlaConfig()).rejects.toThrow();
  });

  it("rejects anonymous users", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.bis.getSlaConfig()).rejects.toThrow();
  });

  it("returns SLA config with defaults", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.bis.getSlaConfig();
    expect(result.config).toBeDefined();
    expect(result.defaults).toBeDefined();
    expect(typeof result.config.low).toBe("number");
    expect(typeof result.config.medium).toBe("number");
    expect(typeof result.config.high).toBe("number");
    expect(typeof result.config.critical).toBe("number");
  });

  it("config values are positive numbers", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.bis.getSlaConfig();
    expect(result.config.low).toBeGreaterThan(0);
    expect(result.config.medium).toBeGreaterThan(0);
    expect(result.config.high).toBeGreaterThan(0);
    expect(result.config.critical).toBeGreaterThan(0);
  });
});

// ─── bis.updateSlaConfig ─────────────────────────────────────────────────────
describe("bis.updateSlaConfig", () => {
  // Save original config values to restore after tests
  let originalConfig: { low: number; medium: number; high: number; critical: number };

  beforeEach(async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    const { config } = await caller.bis.getSlaConfig();
    originalConfig = { ...config };
  });

  afterEach(async () => {
    // Restore original config
    const caller = appRouter.createCaller(adminCtx() as any);
    await caller.bis.updateSlaConfig(originalConfig);
  });

  it("rejects non-admin users", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.bis.updateSlaConfig({ low: 48 })).rejects.toThrow();
  });

  it("updates low SLA hours", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.bis.updateSlaConfig({ low: 96 });
    expect(result.success).toBe(true);
    expect(result.config.low).toBe(96);
  });

  it("updates multiple SLA hours at once", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.bis.updateSlaConfig({ high: 12, critical: 4 });
    expect(result.success).toBe(true);
    expect(result.config.high).toBe(12);
    expect(result.config.critical).toBe(4);
  });

  it("rejects out-of-range values (too low)", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    await expect(caller.bis.updateSlaConfig({ low: 0 })).rejects.toThrow();
  });

  it("rejects out-of-range values (too high)", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    await expect(caller.bis.updateSlaConfig({ medium: 721 })).rejects.toThrow();
  });
});

// ─── bis.getSlaStats ─────────────────────────────────────────────────────────
describe("bis.getSlaStats", () => {
  beforeEach(async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockReset();
    vi.mocked(getDb).mockResolvedValue(null);
  });

  it("rejects non-admin users", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.bis.getSlaStats()).rejects.toThrow();
  });

  it("rejects anonymous users", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.bis.getSlaStats()).rejects.toThrow();
  });

  it("returns zero stats when DB unavailable", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.bis.getSlaStats();
    expect(result.total).toBe(0);
    expect(result.onTime).toBe(0);
    expect(result.overdue).toBe(0);
    expect(result.overdueRate).toBe(0);
  });

  it("returns correct SLA stats with overdue investigations", async () => {
    const { getDb } = await import("./db");
    const nowMs = Date.now();
    const mockRows = [
      { id: 1, status: "pending", riskLevel: "high", dueAt: nowMs - 3600000 },   // overdue
      { id: 2, status: "processing", riskLevel: "medium", dueAt: nowMs + 3600000 }, // on time
      { id: 3, status: "pending", riskLevel: "high", dueAt: nowMs - 7200000 },   // overdue
      { id: 4, status: "completed", riskLevel: "low", dueAt: nowMs - 1000 },     // completed - excluded
    ];
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      mockResolvedValue: vi.fn().mockResolvedValue(mockRows),
    };
    // The query is: db.select({...}).from(bisInvestigations) — no where clause
    mockDb.from = vi.fn().mockResolvedValue(mockRows);
    vi.mocked(getDb).mockResolvedValue(mockDb as any);

    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.bis.getSlaStats();
    // 4 rows, 1 completed → 3 active
    expect(result.total).toBe(3);
    // 2 overdue (id 1 and 3)
    expect(result.overdue).toBe(2);
    // 1 on time (id 2)
    expect(result.onTime).toBe(1);
    // overdueRate = 2/3 * 100 = 67
    expect(result.overdueRate).toBe(67);
  });

  it("returns 0 overdueRate when no active investigations", async () => {
    const { getDb } = await import("./db");
    const mockRows = [
      { id: 1, status: "completed", riskLevel: "low", dueAt: Date.now() - 1000 },
    ];
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockResolvedValue(mockRows),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);

    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.bis.getSlaStats();
    expect(result.total).toBe(0);
    expect(result.overdueRate).toBe(0);
  });
});

// ─── loyalty.getExpiringRewards ───────────────────────────────────────────────
describe("loyalty.getExpiringRewards", () => {
  beforeEach(async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockReset();
    vi.mocked(getDb).mockResolvedValue(null);
  });

  it("rejects anonymous users", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.loyalty.getExpiringRewards()).rejects.toThrow();
  });

  it("returns empty when DB unavailable", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.loyalty.getExpiringRewards();
    expect(result.rewards).toEqual([]);
    expect(result.count).toBe(0);
  });

  it("returns rewards expiring within 30 days", async () => {
    const { getDb } = await import("./db");
    const nowMs = Date.now();
    const mockRows = [
      { id: "r1", name: "Hotel Night", description: "1 night stay", points_cost: "5000", partner: "Sheraton", category: "accommodation", stock: "10", expires_at: String(nowMs + 5 * 24 * 60 * 60 * 1000), is_active: true },
      { id: "r2", name: "Airport Transfer", description: "Transfer", points_cost: "1200", partner: "Lagos Rides", category: "transport", stock: "50", expires_at: String(nowMs + 20 * 24 * 60 * 60 * 1000), is_active: true },
    ];
    const mockDb = {
      execute: vi.fn().mockResolvedValue(mockRows),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);

    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.loyalty.getExpiringRewards();
    expect(result.count).toBe(2);
    expect(result.rewards).toHaveLength(2);
    expect(result.rewards[0].id).toBe("r1");
    expect(result.rewards[0].daysLeft).toBeLessThanOrEqual(5);
    expect(result.rewards[0].isUrgent).toBe(true); // 5 days ≤ 7
    expect(result.rewards[1].isUrgent).toBe(false); // 20 days > 7
  });

  it("marks rewards with ≤7 days as urgent", async () => {
    const { getDb } = await import("./db");
    const nowMs = Date.now();
    const mockRows = [
      { id: "r3", name: "Spa Day", description: "Spa", points_cost: "2500", partner: "Wellness", category: "wellness", stock: "5", expires_at: String(nowMs + 3 * 24 * 60 * 60 * 1000), is_active: true },
    ];
    const mockDb = {
      execute: vi.fn().mockResolvedValue(mockRows),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);

    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.loyalty.getExpiringRewards();
    expect(result.rewards[0].isUrgent).toBe(true);
    expect(result.rewards[0].daysLeft).toBeLessThanOrEqual(7);
  });

  it("returns empty array when no rewards expiring soon", async () => {
    const { getDb } = await import("./db");
    const mockDb = {
      execute: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);

    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.loyalty.getExpiringRewards();
    expect(result.rewards).toEqual([]);
    expect(result.count).toBe(0);
  });

  it("handles DB errors gracefully", async () => {
    const { getDb } = await import("./db");
    const mockDb = {
      execute: vi.fn().mockRejectedValue(new Error("DB error")),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);

    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.loyalty.getExpiringRewards();
    expect(result.rewards).toEqual([]);
    expect(result.count).toBe(0);
  });
});
