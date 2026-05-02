/**
 * Round 36 Tests
 * - bis.getSlaConfig: admin-only, returns config with defaults
 * - bis.updateSlaConfig: validates ranges, updates in-memory config
 * - bis.getSlaStats: admin-only, returns compliance stats
 * - wallet.pauseScheduledPayment: pauses active payment, rejects non-active, guards auth
 * - wallet.resumeScheduledPayment: resumes paused payment, rejects non-paused, guards auth
 * - loyalty.account: includes isInGracePeriod, gracePeriodDaysLeft, naturalTier fields
 * - loyalty.getTierDowngradeStatus: returns grace period status for current user
 * - loyalty.processExpiredGracePeriods: admin-only, processes expired grace periods
 * - loyalty.redeem: triggers grace period when balance drops below tier threshold
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

vi.mock("./_core/notification", () => ({
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

  it("returns SLA config with defaults for admin", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.bis.getSlaConfig();
    expect(result).toHaveProperty("config");
    expect(result).toHaveProperty("defaults");
    expect(result.config).toHaveProperty("low");
    expect(result.config).toHaveProperty("medium");
    expect(result.config).toHaveProperty("high");
    expect(result.config).toHaveProperty("critical");
    expect(typeof result.config.low).toBe("number");
    expect(typeof result.config.medium).toBe("number");
    expect(typeof result.config.high).toBe("number");
    expect(typeof result.config.critical).toBe("number");
  });

  it("defaults are positive integers", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.bis.getSlaConfig();
    expect(result.defaults.low).toBeGreaterThan(0);
    expect(result.defaults.medium).toBeGreaterThan(0);
    expect(result.defaults.high).toBeGreaterThan(0);
    expect(result.defaults.critical).toBeGreaterThan(0);
  });

  it("low SLA is greater than critical SLA (lower risk = more time)", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.bis.getSlaConfig();
    expect(result.config.low).toBeGreaterThan(result.config.critical);
  });
});

// ─── bis.updateSlaConfig ─────────────────────────────────────────────────────
describe("bis.updateSlaConfig", () => {
  beforeEach(async () => {
    // Reset SLA config to defaults between tests
    const caller = appRouter.createCaller(adminCtx() as any);
    await caller.bis.updateSlaConfig({ low: 72, medium: 48, high: 24, critical: 12 });
  });

  it("rejects non-admin users", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.bis.updateSlaConfig({ low: 100 })).rejects.toThrow();
  });

  it("rejects anonymous users", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.bis.updateSlaConfig({ low: 100 })).rejects.toThrow();
  });

  it("updates low SLA hours", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.bis.updateSlaConfig({ low: 96 });
    expect(result.success).toBe(true);
    expect(result.config.low).toBe(96);
  });

  it("updates multiple SLA hours at once", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.bis.updateSlaConfig({ low: 80, medium: 40, high: 20, critical: 8 });
    expect(result.config.low).toBe(80);
    expect(result.config.medium).toBe(40);
    expect(result.config.high).toBe(20);
    expect(result.config.critical).toBe(8);
  });

  it("rejects hours below minimum (1)", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    await expect(caller.bis.updateSlaConfig({ low: 0 })).rejects.toThrow();
  });

  it("rejects hours above maximum (720)", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    await expect(caller.bis.updateSlaConfig({ low: 721 })).rejects.toThrow();
  });

  it("partial update only changes specified fields", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    const before = await caller.bis.getSlaConfig();
    await caller.bis.updateSlaConfig({ critical: 6 });
    const after = await caller.bis.getSlaConfig();
    expect(after.config.critical).toBe(6);
    expect(after.config.low).toBe(before.config.low);
    expect(after.config.medium).toBe(before.config.medium);
    expect(after.config.high).toBe(before.config.high);
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

  it("returns stats when DB unavailable (graceful fallback)", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.bis.getSlaStats();
    expect(result).toHaveProperty("total");
    expect(result).toHaveProperty("onTime");
    expect(result).toHaveProperty("overdue");
    expect(result).toHaveProperty("overdueRate");
  });

  it("returns stats with DB data", async () => {
    const { getDb } = await import("./db");
    const mockRows = [
      { id: 1, status: "completed", riskLevel: "high", dueAt: Date.now() - 10000 },
      { id: 2, status: "pending", riskLevel: "medium", dueAt: Date.now() - 5000 },
      { id: 3, status: "pending", riskLevel: "low", dueAt: Date.now() + 100000 },
    ];
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockResolvedValue(mockRows),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.bis.getSlaStats();
    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(result.overdue).toBeGreaterThanOrEqual(0);
    expect(result.onTime).toBeGreaterThanOrEqual(0);
    expect(result.overdueRate).toBeGreaterThanOrEqual(0);
    expect(result.overdueRate).toBeLessThanOrEqual(100);
  });
});

// ─── wallet.pauseScheduledPayment ────────────────────────────────────────────
describe("wallet.pauseScheduledPayment", () => {
  beforeEach(async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockReset();
    vi.mocked(getDb).mockResolvedValue(null);
  });

  it("rejects anonymous users", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.wallet.pauseScheduledPayment({ id: "sp1" })).rejects.toThrow();
  });

  it("throws when DB unavailable", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.wallet.pauseScheduledPayment({ id: "sp1" })).rejects.toThrow(/unavailable/i);
  });

  it("throws NOT_FOUND when payment does not exist", async () => {
    const { getDb } = await import("./db");
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const caller = appRouter.createCaller(userCtx(42) as any);
    await expect(caller.wallet.pauseScheduledPayment({ id: "nonexistent" })).rejects.toThrow(/not found/i);
  });

  it("throws BAD_REQUEST when payment is not active", async () => {
    const { getDb } = await import("./db");
    const existingPayment = { id: "sp1", userId: "42", status: "paused", amount: "100", currency: "USDC" };
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([existingPayment]),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const caller = appRouter.createCaller(userCtx(42) as any);
    await expect(caller.wallet.pauseScheduledPayment({ id: "sp1" })).rejects.toThrow(/cannot pause/i);
  });

  it("successfully pauses an active payment", async () => {
    const { getDb } = await import("./db");
    const existingPayment = { id: "sp1", userId: "42", status: "active", amount: "100", currency: "USDC" };
    const mockUpdate = vi.fn().mockReturnThis();
    const mockSet = vi.fn().mockReturnThis();
    const mockWhere = vi.fn().mockResolvedValue({ rowCount: 1 });
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([existingPayment]),
      update: mockUpdate,
      set: mockSet,
    };
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockWhere });
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const caller = appRouter.createCaller(userCtx(42) as any);
    const result = await caller.wallet.pauseScheduledPayment({ id: "sp1" });
    expect(result.success).toBe(true);
    expect(result.id).toBe("sp1");
  });

  it("rejects empty id", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.wallet.pauseScheduledPayment({ id: "" })).rejects.toThrow();
  });
});

// ─── wallet.resumeScheduledPayment ───────────────────────────────────────────
describe("wallet.resumeScheduledPayment", () => {
  beforeEach(async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockReset();
    vi.mocked(getDb).mockResolvedValue(null);
  });

  it("rejects anonymous users", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.wallet.resumeScheduledPayment({ id: "sp1" })).rejects.toThrow();
  });

  it("throws when DB unavailable", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.wallet.resumeScheduledPayment({ id: "sp1" })).rejects.toThrow(/unavailable/i);
  });

  it("throws NOT_FOUND when payment does not exist", async () => {
    const { getDb } = await import("./db");
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const caller = appRouter.createCaller(userCtx(42) as any);
    await expect(caller.wallet.resumeScheduledPayment({ id: "nonexistent" })).rejects.toThrow(/not found/i);
  });

  it("throws BAD_REQUEST when payment is not paused", async () => {
    const { getDb } = await import("./db");
    const existingPayment = { id: "sp1", userId: "42", status: "active", amount: "100", currency: "USDC" };
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([existingPayment]),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const caller = appRouter.createCaller(userCtx(42) as any);
    await expect(caller.wallet.resumeScheduledPayment({ id: "sp1" })).rejects.toThrow(/cannot resume/i);
  });

  it("successfully resumes a paused payment", async () => {
    const { getDb } = await import("./db");
    const existingPayment = { id: "sp1", userId: "42", status: "paused", amount: "100", currency: "USDC" };
    const mockUpdate = vi.fn().mockReturnThis();
    const mockSet = vi.fn().mockReturnThis();
    const mockWhere = vi.fn().mockResolvedValue({ rowCount: 1 });
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([existingPayment]),
      update: mockUpdate,
      set: mockSet,
    };
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockWhere });
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const caller = appRouter.createCaller(userCtx(42) as any);
    const result = await caller.wallet.resumeScheduledPayment({ id: "sp1" });
    expect(result.success).toBe(true);
    expect(result.id).toBe("sp1");
  });

  it("rejects cancelled payment for resume", async () => {
    const { getDb } = await import("./db");
    const existingPayment = { id: "sp1", userId: "42", status: "cancelled", amount: "100", currency: "USDC" };
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([existingPayment]),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const caller = appRouter.createCaller(userCtx(42) as any);
    await expect(caller.wallet.resumeScheduledPayment({ id: "sp1" })).rejects.toThrow(/cannot resume/i);
  });
});

// ─── loyalty.account (grace period fields) ───────────────────────────────────
describe("loyalty.account (grace period fields)", () => {
  beforeEach(async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockReset();
    vi.mocked(getDb).mockResolvedValue(null);
  });

  it("rejects anonymous users", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.loyalty.account()).rejects.toThrow();
  });

  it("throws when DB unavailable", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.loyalty.account()).rejects.toThrow(/unavailable/i);
  });

  it("returns isInGracePeriod=false when no tierProtectedUntil", async () => {
    const { getDb } = await import("./db");
    const mockRow = { points_balance: 5000, tier: "SILVER", lifetime_points: 5000, tier_protected_until: null };
    const mockDb = {
      execute: vi.fn().mockResolvedValue([mockRow]),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const caller = appRouter.createCaller(userCtx(42) as any);
    const result = await caller.loyalty.account();
    expect(result.isInGracePeriod).toBe(false);
    expect(result.gracePeriodDaysLeft).toBeNull();
  });

  it("returns isInGracePeriod=true when tierProtectedUntil is in the future", async () => {
    const { getDb } = await import("./db");
    const futureMs = Date.now() + 45 * 24 * 60 * 60 * 1000; // 45 days from now
    const mockRow = { points_balance: 1000, tier: "SILVER", lifetime_points: 5000, tier_protected_until: futureMs };
    const mockDb = {
      execute: vi.fn().mockResolvedValue([mockRow]),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const caller = appRouter.createCaller(userCtx(42) as any);
    const result = await caller.loyalty.account();
    expect(result.isInGracePeriod).toBe(true);
    expect(result.gracePeriodDaysLeft).toBeGreaterThan(0);
    expect(result.gracePeriodDaysLeft).toBeLessThanOrEqual(45);
  });

  it("returns isInGracePeriod=false when tierProtectedUntil is in the past", async () => {
    const { getDb } = await import("./db");
    const pastMs = Date.now() - 1000; // 1 second ago
    const mockRow = { points_balance: 1000, tier: "SILVER", lifetime_points: 5000, tier_protected_until: pastMs };
    const mockDb = {
      execute: vi.fn().mockResolvedValue([mockRow]),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const caller = appRouter.createCaller(userCtx(42) as any);
    const result = await caller.loyalty.account();
    expect(result.isInGracePeriod).toBe(false);
    expect(result.gracePeriodDaysLeft).toBeNull();
  });

  it("returns naturalTier based on lifetime points", async () => {
    const { getDb } = await import("./db");
    // User has GOLD tier but only 3000 lifetime points (should be BRONZE naturally)
    const mockRow = { points_balance: 3000, tier: "GOLD", lifetime_points: 3000, tier_protected_until: Date.now() + 86400000 };
    const mockDb = {
      execute: vi.fn().mockResolvedValue([mockRow]),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const caller = appRouter.createCaller(userCtx(42) as any);
    const result = await caller.loyalty.account();
    expect(result.naturalTier).toBe("BRONZE");
    expect(result.tier).toBe("GOLD");
  });
});

// ─── loyalty.getTierDowngradeStatus ──────────────────────────────────────────
describe("loyalty.getTierDowngradeStatus", () => {
  beforeEach(async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockReset();
    vi.mocked(getDb).mockResolvedValue(null);
  });

  it("rejects anonymous users", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.loyalty.getTierDowngradeStatus()).rejects.toThrow();
  });

  it("throws when DB unavailable", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.loyalty.getTierDowngradeStatus()).rejects.toThrow(/unavailable/i);
  });

  it("returns not in grace period for a healthy account", async () => {
    const { getDb } = await import("./db");
    const mockRow = { points_balance: 10000, tier: "GOLD", lifetime_points: 25000, tier_protected_until: null };
    const mockDb = {
      execute: vi.fn().mockResolvedValue([mockRow]),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const caller = appRouter.createCaller(userCtx(42) as any);
    const result = await caller.loyalty.getTierDowngradeStatus();
    expect(result.isInGracePeriod).toBe(false);
    expect(result.gracePeriodDaysLeft).toBeNull();
    expect(result.wouldDowngradeTo).toBeNull();
    expect(result.currentTier).toBe("GOLD");
    expect(result.naturalTier).toBe("GOLD");
  });

  it("returns grace period info when in protection", async () => {
    const { getDb } = await import("./db");
    const graceEndsAt = Date.now() + 60 * 24 * 60 * 60 * 1000; // 60 days
    // User has GOLD tier but only 3000 lifetime points (BRONZE naturally)
    const mockRow = { points_balance: 3000, tier: "GOLD", lifetime_points: 3000, tier_protected_until: graceEndsAt };
    const mockDb = {
      execute: vi.fn().mockResolvedValue([mockRow]),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const caller = appRouter.createCaller(userCtx(42) as any);
    const result = await caller.loyalty.getTierDowngradeStatus();
    expect(result.isInGracePeriod).toBe(true);
    expect(result.gracePeriodDaysLeft).toBeGreaterThan(0);
    expect(result.gracePeriodEndsAt).toBe(graceEndsAt);
    expect(result.wouldDowngradeTo).toBe("BRONZE");
    expect(result.currentTier).toBe("GOLD");
    expect(result.naturalTier).toBe("BRONZE");
  });

  it("returns wouldDowngradeTo=null when natural tier equals current tier", async () => {
    const { getDb } = await import("./db");
    const graceEndsAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
    // User has SILVER tier with 6000 lifetime points (SILVER naturally — no actual downgrade)
    const mockRow = { points_balance: 1000, tier: "SILVER", lifetime_points: 6000, tier_protected_until: graceEndsAt };
    const mockDb = {
      execute: vi.fn().mockResolvedValue([mockRow]),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const caller = appRouter.createCaller(userCtx(42) as any);
    const result = await caller.loyalty.getTierDowngradeStatus();
    expect(result.wouldDowngradeTo).toBeNull();
    expect(result.naturalTier).toBe("SILVER");
    expect(result.currentTier).toBe("SILVER");
  });
});

// ─── loyalty.processExpiredGracePeriods ──────────────────────────────────────
describe("loyalty.processExpiredGracePeriods", () => {
  beforeEach(async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockReset();
    vi.mocked(getDb).mockResolvedValue(null);
  });

  it("rejects non-admin users", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.loyalty.processExpiredGracePeriods()).rejects.toThrow();
  });

  it("rejects anonymous users", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.loyalty.processExpiredGracePeriods()).rejects.toThrow();
  });

  it("throws when DB unavailable", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    await expect(caller.loyalty.processExpiredGracePeriods()).rejects.toThrow(/unavailable/i);
  });

  it("returns zero processed when no expired grace periods", async () => {
    const { getDb } = await import("./db");
    const mockDb = {
      execute: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.loyalty.processExpiredGracePeriods();
    expect(result.processed).toBe(0);
    expect(result.downgradedCount).toBe(0);
    expect(result.downgrades).toEqual([]);
  });

  it("downgrades tier when grace period expired and natural tier is lower", async () => {
    const { getDb } = await import("./db");
    const { createUserNotification } = await import("./db");
    const pastMs = Date.now() - 1000;
    // User was GOLD but has only 3000 lifetime points (BRONZE naturally)
    const expiredRow = { user_id: "42", tier: "GOLD", lifetime_points: 3000, tier_protected_until: pastMs };
    let executeCallCount = 0;
    const mockDb = {
      execute: vi.fn().mockImplementation(() => {
        executeCallCount++;
        if (executeCallCount === 1) return Promise.resolve([expiredRow]); // SELECT expired
        return Promise.resolve([]); // UPDATE calls
      }),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.loyalty.processExpiredGracePeriods();
    expect(result.processed).toBe(1);
    expect(result.downgradedCount).toBe(1);
    expect(result.downgrades[0].from).toBe("GOLD");
    expect(result.downgrades[0].to).toBe("BRONZE");
    expect(createUserNotification).toHaveBeenCalled();
  });

  it("clears grace period without downgrade when natural tier matches current tier", async () => {
    const { getDb } = await import("./db");
    const pastMs = Date.now() - 1000;
    // User has SILVER tier and 6000 lifetime points (SILVER naturally — no downgrade needed)
    const expiredRow = { user_id: "42", tier: "SILVER", lifetime_points: 6000, tier_protected_until: pastMs };
    let executeCallCount = 0;
    const mockDb = {
      execute: vi.fn().mockImplementation(() => {
        executeCallCount++;
        if (executeCallCount === 1) return Promise.resolve([expiredRow]);
        return Promise.resolve([]);
      }),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.loyalty.processExpiredGracePeriods();
    expect(result.processed).toBe(1);
    expect(result.downgradedCount).toBe(0);
    expect(result.downgrades).toEqual([]);
  });

  it("notifies owner when downgrades occur", async () => {
    const { getDb } = await import("./db");
    // Re-import notifyOwner after vi.mock to get the mocked version
    const notificationModule = await import("./_core/notification");
    const notifyOwnerSpy = vi.mocked(notificationModule.notifyOwner);
    notifyOwnerSpy.mockClear();
    notifyOwnerSpy.mockResolvedValue(true);
    const pastMs = Date.now() - 1000;
    const expiredRow = { user_id: "99", tier: "PLATINUM", lifetime_points: 1000, tier_protected_until: pastMs };
    let executeCallCount = 0;
    const mockDb = {
      execute: vi.fn().mockImplementation(() => {
        executeCallCount++;
        if (executeCallCount === 1) return Promise.resolve([expiredRow]);
        return Promise.resolve([]);
      }),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const caller = appRouter.createCaller(adminCtx() as any);
    await caller.loyalty.processExpiredGracePeriods();
    expect(notifyOwnerSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining("Tier Downgrades") })
    );
  });
});

// ─── loyalty.redeem (grace period trigger) ───────────────────────────────────
describe("loyalty.redeem (grace period trigger)", () => {
  beforeEach(async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockReset();
    vi.mocked(getDb).mockResolvedValue(null);
  });

  it("rejects anonymous users", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.loyalty.redeem({ rewardId: "r1", rewardName: "Test", pointsCost: 100, partner: "Test" })).rejects.toThrow();
  });

  it("throws when DB unavailable", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.loyalty.redeem({ rewardId: "r1", rewardName: "Test", pointsCost: 100, partner: "Test" })).rejects.toThrow(/unavailable/i);
  });

  it("throws BAD_REQUEST when insufficient points", async () => {
    const { getDb } = await import("./db");
    const mockRow = { points_balance: 50, tier: "BRONZE", lifetime_points: 50, tier_protected_until: null };
    const mockDb = {
      execute: vi.fn().mockResolvedValue([mockRow]),
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const caller = appRouter.createCaller(userCtx(42) as any);
    await expect(caller.loyalty.redeem({ rewardId: "r1", rewardName: "Test", pointsCost: 100, partner: "Test" })).rejects.toThrow(/insufficient/i);
  });

  it("triggers grace period when balance drops below tier threshold", async () => {
    const { getDb } = await import("./db");
    const { createUserNotification } = await import("./db");
    // User has SILVER tier (requires 5000 pts) with 5100 balance, redeeming 200 pts drops to 4900
    const mockAccount = { points_balance: 5100, tier: "SILVER", lifetime_points: 5100, tier_protected_until: null };
    let executeCallCount = 0;
    const mockDb = {
      execute: vi.fn().mockImplementation(() => {
        executeCallCount++;
        if (executeCallCount === 1) return Promise.resolve([mockAccount]); // ensureAccount
        return Promise.resolve([]); // UPDATE, INSERT calls
      }),
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]), // no DB reward found (uses default)
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const caller = appRouter.createCaller(userCtx(42) as any);
    const result = await caller.loyalty.redeem({ rewardId: "r1", rewardName: "Test Reward", pointsCost: 200, partner: "TestCo" });
    expect(result.success).toBe(true);
    expect(result.remainingBalance).toBe(4900);
    // Grace period should have been triggered (balance 4900 < SILVER threshold 5000)
    expect(result.graceStarted).toBe(true);
    expect(createUserNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining("protected for 90 days") })
    );
  });

  it("does not trigger grace period when balance stays above tier threshold", async () => {
    const { getDb } = await import("./db");
    const { createUserNotification } = await import("./db");
    vi.mocked(createUserNotification).mockClear();
    // User has SILVER tier with 10000 balance, redeeming 100 pts stays at 9900 (above 5000 threshold)
    const mockAccount = { points_balance: 10000, tier: "SILVER", lifetime_points: 10000, tier_protected_until: null };
    let executeCallCount = 0;
    const mockDb = {
      execute: vi.fn().mockImplementation(() => {
        executeCallCount++;
        if (executeCallCount === 1) return Promise.resolve([mockAccount]);
        return Promise.resolve([]);
      }),
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const caller = appRouter.createCaller(userCtx(42) as any);
    const result = await caller.loyalty.redeem({ rewardId: "r1", rewardName: "Test Reward", pointsCost: 100, partner: "TestCo" });
    expect(result.success).toBe(true);
    expect(result.remainingBalance).toBe(9900);
    expect(result.graceStarted).toBe(false);
  });

  it("does not trigger grace period again if already in grace period", async () => {
    const { getDb } = await import("./db");
    const { createUserNotification } = await import("./db");
    vi.mocked(createUserNotification).mockClear();
    const futureMs = Date.now() + 45 * 24 * 60 * 60 * 1000;
    // User is already in grace period (tierProtectedUntil is in the future)
    const mockAccount = { points_balance: 5100, tier: "SILVER", lifetime_points: 5100, tier_protected_until: futureMs };
    let executeCallCount = 0;
    const mockDb = {
      execute: vi.fn().mockImplementation(() => {
        executeCallCount++;
        if (executeCallCount === 1) return Promise.resolve([mockAccount]);
        return Promise.resolve([]);
      }),
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const caller = appRouter.createCaller(userCtx(42) as any);
    const result = await caller.loyalty.redeem({ rewardId: "r1", rewardName: "Test Reward", pointsCost: 200, partner: "TestCo" });
    expect(result.success).toBe(true);
    // Already protected, so graceStarted should be false (no new grace period needed)
    expect(result.graceStarted).toBe(false);
    // createUserNotification should NOT have been called for grace period
    const graceCalls = vi.mocked(createUserNotification).mock.calls.filter(
      call => call[0]?.title?.includes("protected for 90 days")
    );
    expect(graceCalls).toHaveLength(0);
  });
});
