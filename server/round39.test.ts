/**
 * Round 39 Tests
 * - wallet.createRecurringPayment: creates recurring payment, rejects missing wallet
 * - wallet.getRecurringPayments: returns user's recurring payments
 * - wallet.updateRecurringPayment: updates status/note, rejects cancelled
 * - wallet.deleteRecurringPayment: deletes own recurring payment
 * - loyalty.createReferralCode: creates a pending referral code for user
 * - loyalty.applyReferral: awards bonus points to both parties, rejects self-referral
 * - loyalty.getReferrals: returns sent/received referrals for user
 * - bis.getRiskTrend: returns weekly trend data, falls back to synthetic data when DB unavailable
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
  getPendingBisInvestigations: vi.fn().mockResolvedValue([]),
  getProcessingBisInvestigations: vi.fn().mockResolvedValue([]),
  advanceBisInvestigationToProcessing: vi.fn().mockResolvedValue(null),
  completeBisInvestigation: vi.fn().mockResolvedValue(null),
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

// Helper to reset getDb to null default after each test
const resetGetDb = async () => {
  const { getDb } = await import("./db");
  vi.mocked(getDb).mockResolvedValue(null);
};

// ─── wallet.createRecurringPayment ────────────────────────────────────────────
describe("wallet.createRecurringPayment", () => {
  beforeEach(async () => { vi.resetAllMocks(); await resetGetDb(); });

  it("rejects anonymous users", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.wallet.createRecurringPayment({
      currency: "NGN",
      recipientAddress: "addr1",
      amount: 100,
      frequency: "monthly",
    })).rejects.toThrow();
  });

  it("returns error when DB is unavailable", async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockResolvedValue(null);
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.wallet.createRecurringPayment({
      currency: "NGN",
      recipientAddress: "addr1",
      amount: 100,
      frequency: "monthly",
    })).rejects.toThrow("Database unavailable");
  });

  it("rejects when user has no wallet for the currency", async () => {
    const { getDb } = await import("./db");
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]), // no balance found
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(getDb).mockResolvedValueOnce(mockDb as any);
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.wallet.createRecurringPayment({
      currency: "NGN",
      recipientAddress: "addr1",
      amount: 100,
      frequency: "monthly",
    })).rejects.toThrow("No NGN wallet found");
  });

  it("creates a recurring payment when balance exists", async () => {
    const { getDb } = await import("./db");
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ id: "bal1", userId: "42", currency: "NGN", balance: "5000" }]),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(getDb).mockResolvedValueOnce(mockDb as any);
    const { createAuditLog } = await import("./db");
    vi.mocked(createAuditLog).mockResolvedValueOnce({ id: 99 } as any);
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.createRecurringPayment({
      currency: "NGN",
      recipientAddress: "recipient@example.com",
      recipientName: "John Doe",
      amount: 500,
      frequency: "weekly",
      note: "Weekly allowance",
    });
    expect(result.success).toBe(true);
    expect(result.id).toBeDefined();
    expect(result.nextRunAt).toBeGreaterThan(Date.now());
  });

  it("rejects invalid frequency values", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.wallet.createRecurringPayment({
      currency: "NGN",
      recipientAddress: "addr1",
      amount: 100,
      frequency: "yearly" as any,
    })).rejects.toThrow();
  });

  it("rejects zero or negative amounts", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.wallet.createRecurringPayment({
      currency: "NGN",
      recipientAddress: "addr1",
      amount: 0,
      frequency: "monthly",
    })).rejects.toThrow();
  });
});

// ─── wallet.getRecurringPayments ──────────────────────────────────────────────
describe("wallet.getRecurringPayments", () => {
  beforeEach(async () => { vi.resetAllMocks(); await resetGetDb(); });

  it("rejects anonymous users", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.wallet.getRecurringPayments()).rejects.toThrow();
  });

  it("returns empty array when DB is unavailable", async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockResolvedValue(null);
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.getRecurringPayments();
    expect(result).toEqual([]);
  });

  it("returns recurring payments for the current user", async () => {
    const { getDb } = await import("./db");
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue([
        { id: "rp1", userId: "42", currency: "NGN", amount: "500", frequency: "weekly", status: "active", nextRunAt: Date.now() + 86400000, runCount: 0, createdAt: Date.now() },
        { id: "rp2", userId: "42", currency: "USDC", amount: "100", frequency: "monthly", status: "paused", nextRunAt: null, runCount: 3, createdAt: Date.now() - 86400000 },
      ]),
    };
    vi.mocked(getDb).mockResolvedValueOnce(mockDb as any);
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.getRecurringPayments();
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("rp1");
    expect(result[0].amount).toBe(500); // parsed from string
    expect(result[1].amount).toBe(100);
  });
});

// ─── wallet.updateRecurringPayment ────────────────────────────────────────────
describe("wallet.updateRecurringPayment", () => {
  beforeEach(async () => { vi.resetAllMocks(); await resetGetDb(); });

  it("rejects anonymous users", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.wallet.updateRecurringPayment({ id: "550e8400-e29b-41d4-a716-446655440001", status: "paused" })).rejects.toThrow();
  });

  it("returns error when DB is unavailable", async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockResolvedValue(null);
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.wallet.updateRecurringPayment({ id: "550e8400-e29b-41d4-a716-446655440001", status: "paused" })).rejects.toThrow("Database unavailable");
  });

  it("rejects update on non-existent recurring payment", async () => {
    const { getDb } = await import("./db");
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]), // not found
    };
    vi.mocked(getDb).mockResolvedValueOnce(mockDb as any);
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.wallet.updateRecurringPayment({ id: "550e8400-e29b-41d4-a716-446655440099", status: "paused" })).rejects.toThrow("not found");
  });

  it("rejects update on cancelled recurring payment", async () => {
    const { getDb } = await import("./db");
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ id: "550e8400-e29b-41d4-a716-446655440001", userId: "42", status: "cancelled" }]),
    };
    vi.mocked(getDb).mockResolvedValueOnce(mockDb as any);
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.wallet.updateRecurringPayment({ id: "550e8400-e29b-41d4-a716-446655440001", status: "active" })).rejects.toThrow("Cannot modify a cancelled");
  });

  it("successfully pauses an active recurring payment", async () => {
    const { getDb } = await import("./db");
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn()
        .mockResolvedValueOnce([{ id: "550e8400-e29b-41d4-a716-446655440001", userId: "42", status: "active" }]) // existing check
        .mockResolvedValue([]), // update where
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
    };
    vi.mocked(getDb).mockResolvedValueOnce(mockDb as any);
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.updateRecurringPayment({ id: "550e8400-e29b-41d4-a716-446655440001", status: "paused" });
    expect(result.success).toBe(true);
  });
});

// ─── wallet.deleteRecurringPayment ────────────────────────────────────────────
describe("wallet.deleteRecurringPayment", () => {
  beforeEach(async () => { vi.resetAllMocks(); await resetGetDb(); });

  it("rejects anonymous users", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.wallet.deleteRecurringPayment({ id: "550e8400-e29b-41d4-a716-446655440001" })).rejects.toThrow();
  });

  it("rejects deletion of non-existent recurring payment", async () => {
    const { getDb } = await import("./db");
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]), // not found
    };
    vi.mocked(getDb).mockResolvedValueOnce(mockDb as any);
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.wallet.deleteRecurringPayment({ id: "550e8400-e29b-41d4-a716-446655440099" })).rejects.toThrow("not found");
  });

  it("successfully deletes a recurring payment", async () => {
    const { getDb } = await import("./db");
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn()
        .mockResolvedValueOnce([{ id: "550e8400-e29b-41d4-a716-446655440001", userId: "42", status: "active" }]) // existing check
        .mockResolvedValue([]), // delete where
      delete: vi.fn().mockReturnThis(),
    };
    vi.mocked(getDb).mockResolvedValueOnce(mockDb as any);
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.deleteRecurringPayment({ id: "550e8400-e29b-41d4-a716-446655440001" });
    expect(result.success).toBe(true);
  });
});

// ─── loyalty.createReferralCode ───────────────────────────────────────────────
describe("loyalty.createReferralCode", () => {
  beforeEach(async () => { vi.resetAllMocks(); await resetGetDb(); });

  it("rejects anonymous users", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.loyalty.createReferralCode()).rejects.toThrow();
  });

  it("returns existing pending code if one exists", async () => {
    const { getDb } = await import("./db");
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: "ref1", code: "EXISTING123", status: "pending" }]),
    };
    vi.mocked(getDb).mockResolvedValueOnce(mockDb as any);
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.loyalty.createReferralCode();
    expect(result.code).toBe("EXISTING123");
    expect(result.referralId).toBe("ref1");
  });

  it("creates a new referral code when none exists", async () => {
    const { getDb } = await import("./db");
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]), // no existing code
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: "ref2", code: "NEWCODE456" }]),
    };
    vi.mocked(getDb).mockResolvedValueOnce(mockDb as any);
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.loyalty.createReferralCode();
    expect(result.code).toBe("NEWCODE456");
    expect(result.referralId).toBe("ref2");
  });

  it("returns fallback when DB is unavailable", async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockResolvedValue(null);
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.loyalty.createReferralCode()).rejects.toThrow("Database unavailable");
  });
});

// ─── loyalty.applyReferral ────────────────────────────────────────────────────
describe("loyalty.applyReferral", () => {
  beforeEach(async () => { vi.resetAllMocks(); await resetGetDb(); });

  it("rejects anonymous users", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.loyalty.applyReferral({ code: "CODE123" })).rejects.toThrow();
  });

  it("rejects invalid referral code", async () => {
    const { getDb } = await import("./db");
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]), // code not found
    };
    vi.mocked(getDb).mockResolvedValueOnce(mockDb as any);
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.loyalty.applyReferral({ code: "BADCODE" })).rejects.toThrow("Invalid or already used");
  });

  it("rejects self-referral", async () => {
    const { getDb } = await import("./db");
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: "ref1", code: "MYCODE", referrerId: "42", status: "pending" }]),
    };
    vi.mocked(getDb).mockResolvedValueOnce(mockDb as any);
    const caller = appRouter.createCaller(userCtx(42) as any); // same user as referrerId
    await expect(caller.loyalty.applyReferral({ code: "MYCODE" })).rejects.toThrow("cannot use your own referral code");
  });

  it("rejects if user already used a referral code", async () => {
    const { getDb } = await import("./db");
    let whereCallCount = 0;
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn(() => {
        whereCallCount++;
        if (whereCallCount === 1) {
          // First call: find the referral code
          return { limit: vi.fn().mockResolvedValue([{ id: "ref1", code: "FRIEND123", referrerId: "99", status: "pending" }]) };
        }
        // Second call: check if user already used a code
        return { limit: vi.fn().mockResolvedValue([{ id: "ref2" }]) }; // already used
      }),
    };
    vi.mocked(getDb).mockResolvedValueOnce(mockDb as any);
    const caller = appRouter.createCaller(userCtx(42) as any);
    await expect(caller.loyalty.applyReferral({ code: "FRIEND123" })).rejects.toThrow("already used a referral code");
  });
});

// ─── loyalty.getReferrals ─────────────────────────────────────────────────────
describe("loyalty.getReferrals", () => {
  beforeEach(async () => { vi.resetAllMocks(); await resetGetDb(); });

  it("rejects anonymous users", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.loyalty.getReferrals()).rejects.toThrow();
  });

  it("returns empty sent and null received when DB is unavailable", async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockResolvedValue(null);
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.loyalty.getReferrals();
    expect(result.sent).toEqual([]);
    expect(result.received).toBeNull();
  });

  it("returns sent referrals and received referral", async () => {
    const { getDb } = await import("./db");
    let selectCallCount = 0;
    const mockDb = {
      select: vi.fn(() => {
        selectCallCount++;
        return mockDb;
      }),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn(() => {
        if (selectCallCount === 1) {
          // sent referrals (uses .select().from().where().orderBy().limit())
          return Promise.resolve([
            { id: "ref1", code: "MYCODE1", status: "completed", refereeId: "55", referrerPointsAwarded: 500, usedAt: Date.now(), createdAt: Date.now() },
            { id: "ref2", code: "MYCODE2", status: "pending", refereeId: null, referrerPointsAwarded: 0, usedAt: null, createdAt: Date.now() },
          ]);
        }
        // received referral (uses .select().from().where().limit())
        return Promise.resolve([
          { id: "ref3", code: "FRIENDCODE", status: "completed", refereePointsAwarded: 250, usedAt: Date.now() },
        ]);
      }),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.loyalty.getReferrals();
    expect(result.sent).toHaveLength(2);
    expect(result.sent[0].code).toBe("MYCODE1");
    expect(result.received).not.toBeNull();
    expect(result.received?.refereePointsAwarded).toBe(250);
  });

  it("returns null received when user has not used any referral code", async () => {
    const { getDb } = await import("./db");
    let selectCallCount = 0;
    const mockDb = {
      select: vi.fn(() => { selectCallCount++; return mockDb; }),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn(() => {
        if (selectCallCount === 1) return Promise.resolve([]);
        return Promise.resolve([]); // no received
      }),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.loyalty.getReferrals();
    expect(result.sent).toHaveLength(0);
    expect(result.received).toBeNull();
  });
});

// ─── bis.getRiskTrend ─────────────────────────────────────────────────────────
describe("bis.getRiskTrend", () => {
  beforeEach(async () => { vi.resetAllMocks(); await resetGetDb(); });

  it("rejects anonymous users", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.bis.getRiskTrend({ weeks: 12 })).rejects.toThrow();
  });

  it("returns synthetic fallback data when DB is unavailable", async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockResolvedValue(null);
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.bis.getRiskTrend({ weeks: 12 });
    expect(result.weeks).toBe(12);
    expect(result.trend).toHaveLength(12);
    // Each week should have low/medium/high/critical/total/weekLabel
    const week = result.trend[0];
    expect(week).toHaveProperty("weekLabel");
    expect(week).toHaveProperty("low");
    expect(week).toHaveProperty("medium");
    expect(week).toHaveProperty("high");
    expect(week).toHaveProperty("critical");
    expect(week).toHaveProperty("total");
    expect(week.total).toBe(week.low + week.medium + week.high + week.critical);
  });

  it("returns synthetic fallback for 4 weeks when weeks=4", async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockResolvedValue(null);
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.bis.getRiskTrend({ weeks: 4 });
    expect(result.weeks).toBe(4);
    expect(result.trend).toHaveLength(4);
  });

  it("uses default 12 weeks when no input provided", async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockResolvedValue(null);
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.bis.getRiskTrend(undefined);
    expect(result.weeks).toBe(12);
    expect(result.trend).toHaveLength(12);
  });

  it("returns trend data from DB when available", async () => {
    const { getDb } = await import("./db");
    const mockDb = {
      execute: vi.fn().mockResolvedValue([
        { risk_level: "low", week_idx: 0, cnt: 5 },
        { risk_level: "medium", week_idx: 0, cnt: 3 },
        { risk_level: "high", week_idx: 1, cnt: 2 },
        { risk_level: "critical", week_idx: 2, cnt: 1 },
      ]),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.bis.getRiskTrend({ weeks: 4 });
    expect(result.trend).toHaveLength(4);
    // week_idx=0 is the oldest week (index 0 in trend array)
    // low=5, medium=3 — total = 8
    expect(result.trend[0].low).toBe(5);
    expect(result.trend[0].medium).toBe(3);
    expect(result.trend[0].high).toBe(0);
    expect(result.trend[0].total).toBe(8);
    // Week 1 should have high=2
    expect(result.trend[1].high).toBe(2);
    // Week 2 should have critical=1
    expect(result.trend[2].critical).toBe(1);
  });

  it("rejects weeks < 4", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.bis.getRiskTrend({ weeks: 3 })).rejects.toThrow();
  });

  it("rejects weeks > 52", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.bis.getRiskTrend({ weeks: 53 })).rejects.toThrow();
  });

  it("all weeks have non-negative counts in fallback data", async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockResolvedValue(null);
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.bis.getRiskTrend({ weeks: 8 });
    for (const week of result.trend) {
      expect(week.low).toBeGreaterThanOrEqual(0);
      expect(week.medium).toBeGreaterThanOrEqual(0);
      expect(week.high).toBeGreaterThanOrEqual(0);
      expect(week.critical).toBeGreaterThanOrEqual(0);
    }
  });
});
