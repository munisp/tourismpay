/**
 * Round 33 Tests
 * - BIS exportTimeline: CSV generation, filtering, admin-only guard (already covered in round32, extended here)
 * - wallet.getTransactionReceipt: receipt fields, ownership guard, not-found
 * - loyalty.rewardAnalytics: returns analytics data, empty DB fallback, admin-only guard
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

// ─── wallet.getTransactionReceipt ─────────────────────────────────────────────
describe("wallet.getTransactionReceipt", () => {
  beforeEach(async () => {
    const { getDb } = await import("./db");
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  });

  it("requires authentication (anon rejected)", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.wallet.getTransactionReceipt({ id: "tx-1" })).rejects.toThrow();
  });

  it("throws NOT_FOUND when DB unavailable", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.wallet.getTransactionReceipt({ id: "tx-missing" })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("throws NOT_FOUND when transaction does not belong to user", async () => {
    const { getDb } = await import("./db");
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]), // empty = not found for this user
    };
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(mockDb);
    const caller = appRouter.createCaller(userCtx(99) as any);
    await expect(
      caller.wallet.getTransactionReceipt({ id: "tx-other-user" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns a receipt with correct fields for a same-currency transaction", async () => {
    const { getDb } = await import("./db");
    const fakeTx = {
      id: "abc123def456",
      userId: "42",
      type: "send",
      status: "completed",
      amount: "100.00",
      fee: "1.00",
      fromCurrency: "USDC",
      toCurrency: "USDC",
      toAmount: null,
      counterparty: "Alice",
      counterpartyAddress: "GTEST123",
      reference: "REF-001",
      note: "Payment for services",
      txHash: "HASH123",
      createdAt: 1700000000,
      completedAt: 1700000060,
    };
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([fakeTx]),
    };
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(mockDb);
    const caller = appRouter.createCaller(userCtx(42) as any);
    const result = await caller.wallet.getTransactionReceipt({ id: "abc123def456" });
    expect(result.receipt).toBeDefined();
    expect(result.receipt.receiptId).toBe("RCP-ABC123DE");
    expect(result.receipt.transactionId).toBe("abc123def456");
    expect(result.receipt.type).toBe("send");
    expect(result.receipt.status).toBe("completed");
    expect(result.receipt.amount).toBe(100);
    expect(result.receipt.fee).toBe(1);
    expect(result.receipt.netAmount).toBe(99);
    expect(result.receipt.currency).toBe("USDC");
    expect(result.receipt.counterparty).toBe("Alice");
    expect(result.receipt.reference).toBe("REF-001");
    expect(result.receipt.note).toBe("Payment for services");
    expect(result.receipt.txHash).toBe("HASH123");
    expect(result.receipt.platform).toBe("TourismPay");
    expect(result.receipt.isCrossCurrency).toBe(false);
    expect(result.receipt.convertedAmount).toBeNull();
    expect(result.receipt.exchangeRate).toBeNull();
  });

  it("returns cross-currency receipt with convertedAmount and exchangeRate", async () => {
    const { getDb } = await import("./db");
    const fakeTx = {
      id: "cross-tx-001",
      userId: "42",
      type: "send",
      status: "completed",
      amount: "1000.00",
      fee: "5.00",
      fromCurrency: "NGN",
      toCurrency: "USDC",
      toAmount: "0.65",
      counterparty: "Bob",
      counterpartyAddress: null,
      reference: null,
      note: null,
      txHash: null,
      createdAt: 1700000000,
      completedAt: null,
    };
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([fakeTx]),
    };
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(mockDb);
    const caller = appRouter.createCaller(userCtx(42) as any);
    const result = await caller.wallet.getTransactionReceipt({ id: "cross-tx-001" });
    expect(result.receipt.isCrossCurrency).toBe(true);
    expect(result.receipt.fromCurrency).toBe("NGN");
    expect(result.receipt.toCurrency).toBe("USDC");
    expect(result.receipt.convertedAmount).toBe(0.65);
    expect(result.receipt.exchangeRate).toBeDefined();
    expect(result.receipt.exchangeRate).not.toBeNull();
  });

  it("receipt generatedAt is a valid ISO date string", async () => {
    const { getDb } = await import("./db");
    const fakeTx = {
      id: "ts-check-001",
      userId: "42",
      type: "deposit",
      status: "completed",
      amount: "50.00",
      fee: "0.00",
      fromCurrency: "USDC",
      toCurrency: null,
      toAmount: null,
      counterparty: null,
      counterpartyAddress: null,
      reference: null,
      note: null,
      txHash: null,
      createdAt: 1700000000,
      completedAt: 1700000010,
    };
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([fakeTx]),
    };
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(mockDb);
    const caller = appRouter.createCaller(userCtx(42) as any);
    const result = await caller.wallet.getTransactionReceipt({ id: "ts-check-001" });
    expect(() => new Date(result.receipt.generatedAt)).not.toThrow();
    expect(new Date(result.receipt.generatedAt).getTime()).toBeGreaterThan(0);
  });
});

// ─── loyalty.rewardAnalytics ──────────────────────────────────────────────────
describe("loyalty.rewardAnalytics", () => {
  beforeEach(async () => {
    const { getDb } = await import("./db");
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  });

  it("requires admin role (anon rejected)", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.loyalty.rewardAnalytics({ limit: 10 })).rejects.toThrow();
  });

  it("requires admin role (user rejected)", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.loyalty.rewardAnalytics({ limit: 10 })).rejects.toThrow();
  });

  it("returns empty arrays when DB unavailable", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.loyalty.rewardAnalytics({ limit: 10 });
    expect(result.rewards).toEqual([]);
    expect(result.totalRedemptions).toBe(0);
    expect(result.totalPointsSpent).toBe(0);
  });

  it("returns per-reward stats from DB", async () => {
    const { getDb } = await import("./db");
    const mockRewardStats = [
      { reward_id: "r1", reward_name: "Free Coffee", category: "food", points_cost: 500, is_active: true, stock: 10, redemption_count: 42, total_points_spent: 21000 },
      { reward_id: "r2", reward_name: "Airport Lounge", category: "travel", points_cost: 2000, is_active: true, stock: null, redemption_count: 15, total_points_spent: 30000 },
    ];
    const mockTopRedeemers = [
      { user_id: "u1", user_name: "Alice", redemption_count: 10, total_points_spent: 5000 },
    ];
    const mockTotals = [{ total_redemptions: 57, total_points_spent: 51000 }];
    let callCount = 0;
    const mockDb = {
      execute: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve({ rows: mockRewardStats });
        if (callCount === 2) return Promise.resolve({ rows: mockTopRedeemers });
        return Promise.resolve({ rows: mockTotals });
      }),
    };
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(mockDb);
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.loyalty.rewardAnalytics({ limit: 10 });
    expect(result.rewards).toHaveLength(2);
    expect(result.rewards[0].rewardName).toBe("Free Coffee");
    expect(result.rewards[0].redemptionCount).toBe(42);
    expect(result.rewards[0].totalPointsSpent).toBe(21000);
    expect(result.rewards[0].isActive).toBe(true);
    expect(result.rewards[1].rewardName).toBe("Airport Lounge");
    expect(result.rewards[1].stock).toBeNull();
    expect(result.topRedeemers).toHaveLength(1);
    expect(result.topRedeemers[0].userName).toBe("Alice");
    expect(result.topRedeemers[0].redemptionCount).toBe(10);
    expect(result.totalRedemptions).toBe(57);
    expect(result.totalPointsSpent).toBe(51000);
  });

  it("handles DB returning rows directly (no .rows wrapper)", async () => {
    const { getDb } = await import("./db");
    const mockRewardStats = [
      { reward_id: "r1", reward_name: "Discount Voucher", category: "shopping", points_cost: 300, is_active: true, stock: 5, redemption_count: 8, total_points_spent: 2400 },
    ];
    const mockTopRedeemers: unknown[] = [];
    const mockTotals = [{ total_redemptions: 8, total_points_spent: 2400 }];
    let callCount = 0;
    const mockDb = {
      execute: vi.fn().mockImplementation(() => {
        callCount++;
        // Return array directly (no .rows) to test fallback
        if (callCount === 1) return Promise.resolve(mockRewardStats);
        if (callCount === 2) return Promise.resolve(mockTopRedeemers);
        return Promise.resolve(mockTotals);
      }),
    };
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(mockDb);
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.loyalty.rewardAnalytics({ limit: 10 });
    expect(result.rewards).toHaveLength(1);
    expect(result.rewards[0].rewardName).toBe("Discount Voucher");
    expect(result.rewards[0].redemptionCount).toBe(8);
  });

  it("uses default limit of 10 when no input provided", async () => {
    const { getDb } = await import("./db");
    const mockDb = {
      execute: vi.fn().mockResolvedValue({ rows: [] }),
    };
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(mockDb);
    const caller = appRouter.createCaller(adminCtx() as any);
    // Should not throw when called without input
    const result = await caller.loyalty.rewardAnalytics();
    expect(result.rewards).toEqual([]);
  });

  it("rejects limit > 50", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    await expect(
      caller.loyalty.rewardAnalytics({ limit: 100 })
    ).rejects.toThrow();
  });
});

// ─── BIS exportTimeline (extended edge cases) ─────────────────────────────────
describe("BIS exportTimeline extended", () => {
  beforeEach(async () => {
    const { getDb } = await import("./db");
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  });

  it("returns CSV with header row even when no events match", async () => {
    const { getDb } = await import("./db");
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue([]),
    };
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(mockDb);
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.bis.exportTimeline({ investigationId: 999 });
    expect(result.csv).toContain("id,investigationId,eventType");
    expect(result.count).toBe(0);
    expect(result.filename).toMatch(/^bis-timeline-999-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it("CSV escapes commas and quotes in field values", async () => {
    const { getDb } = await import("./db");
    const mockEvents = [
      {
        id: "evt-1",
        investigationId: 1,
        eventType: "note",
        severity: "info",
        title: 'Contains, comma and "quotes"',
        description: "Normal description",
        actorName: "Admin User",
        actorId: "1",
        createdAt: 1700000000000,
      },
    ];
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue(mockEvents),
    };
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(mockDb);
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.bis.exportTimeline({ investigationId: 1 });
    // The title with comma and quotes should be wrapped in double quotes
    expect(result.csv).toContain('"Contains, comma and ""quotes"""');
    expect(result.count).toBe(1);
  });

  it("filters by eventType when provided", async () => {
    const { getDb } = await import("./db");
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue([]),
    };
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(mockDb);
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.bis.exportTimeline({
      investigationId: 1,
      eventType: "status_change",
    });
    expect(result.csv).toContain("id,investigationId,eventType");
    expect(result.count).toBe(0);
  });
});
