/**
 * Round 32 Tests
 * - BIS exportTimeline: CSV generation, filtering, admin-only guard
 * - wallet.getFxRate: rate calculation, spread, same-currency guard
 * - wallet.sendCrossCurrency: balance check, FX conversion, same-currency guard
 * - loyalty.restockReward: restock + reactivate, not-found error, admin-only guard
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

// ─── BIS exportTimeline ───────────────────────────────────────────────────────
describe("BIS exportTimeline: bis.exportTimeline", () => {
  it("requires admin role (anon rejected)", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(
      caller.bis.exportTimeline({ investigationId: 1 })
    ).rejects.toThrow();
  });

  it("requires admin role (user rejected)", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.bis.exportTimeline({ investigationId: 1 })
    ).rejects.toThrow();
  });

  it("returns csv, filename, and count when DB unavailable (empty result)", async () => {
    const { getDb } = await import("./db");
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue([]),
    };
    (getDb as any).mockResolvedValue(mockDb);
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.bis.exportTimeline({ investigationId: 5 });
    expect(result).toHaveProperty("csv");
    expect(result).toHaveProperty("filename");
    expect(result).toHaveProperty("count");
    expect(result.count).toBe(0);
    // CSV should have header row
    expect(result.csv).toContain("id,investigationId,eventType");
    expect(result.filename).toContain("bis-timeline-5");
    (getDb as any).mockResolvedValue(null);
  });

  it("generates CSV rows for timeline events", async () => {
    const { getDb } = await import("./db");
    const mockEvents = [
      {
        id: "uuid-1",
        investigationId: 7,
        eventType: "note",
        severity: "info",
        title: "Initial note",
        description: "Started review",
        actorName: "Admin",
        actorId: "1",
        createdAt: 1700000000000,
      },
      {
        id: "uuid-2",
        investigationId: 7,
        eventType: "status_change",
        severity: "warning",
        title: "Status changed",
        description: "Moved to processing",
        actorName: "System",
        actorId: null,
        createdAt: 1700000001000,
      },
    ];
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue(mockEvents),
    };
    (getDb as any).mockResolvedValue(mockDb);
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.bis.exportTimeline({ investigationId: 7 });
    expect(result.count).toBe(2);
    expect(result.csv).toContain("uuid-1");
    expect(result.csv).toContain("Initial note");
    expect(result.csv).toContain("status_change");
    const lines = result.csv.split("\n");
    expect(lines.length).toBe(3); // header + 2 rows
    (getDb as any).mockResolvedValue(null);
  });

  it("accepts optional eventType filter without error", async () => {
    const { getDb } = await import("./db");
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue([]),
    };
    (getDb as any).mockResolvedValue(mockDb);
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.bis.exportTimeline({ investigationId: 3, eventType: "note" });
    expect(result).toHaveProperty("csv");
    (getDb as any).mockResolvedValue(null);
  });

  it("CSV escapes commas and quotes in field values", async () => {
    const { getDb } = await import("./db");
    const mockEvents = [
      {
        id: "uuid-escape",
        investigationId: 9,
        eventType: "note",
        severity: "info",
        title: 'Title with, comma and "quotes"',
        description: "Normal description",
        actorName: "Admin",
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
    (getDb as any).mockResolvedValue(mockDb);
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.bis.exportTimeline({ investigationId: 9 });
    // The title with comma should be quoted in CSV
    expect(result.csv).toContain('"Title with, comma and ""quotes"""');
    (getDb as any).mockResolvedValue(null);
  });
});

// ─── wallet.getFxRate ─────────────────────────────────────────────────────────
describe("wallet.getFxRate", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(
      caller.wallet.getFxRate({ fromCurrency: "USDC", toCurrency: "XLM" })
    ).rejects.toThrow();
  });

  it("returns rate, effectiveRate, spread, spreadPct for valid currency pair", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.getFxRate({ fromCurrency: "USDC", toCurrency: "XLM" });
    expect(result).toHaveProperty("rate");
    expect(result).toHaveProperty("effectiveRate");
    expect(result).toHaveProperty("spread");
    expect(result).toHaveProperty("spreadPct");
    expect(result.fromCurrency).toBe("USDC");
    expect(result.toCurrency).toBe("XLM");
    expect(typeof result.rate).toBe("number");
    expect(result.rate).toBeGreaterThan(0);
  });

  it("effectiveRate is lower than raw rate (spread applied)", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.getFxRate({ fromCurrency: "USDC", toCurrency: "XLM" });
    expect(result.effectiveRate).toBeLessThan(result.rate);
  });

  it("spreadPct is approximately 0.5%", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.getFxRate({ fromCurrency: "USDC", toCurrency: "XLM" });
    expect(result.spreadPct).toBeCloseTo(0.5, 1);
  });

  it("returns effectiveAmount when amount is provided", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.getFxRate({ fromCurrency: "USDC", toCurrency: "XLM", amount: 100 });
    expect(result).toHaveProperty("effectiveAmount");
    expect(result.effectiveAmount).toBeGreaterThan(0);
  });

  it("same-currency pair returns rate of 1", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.getFxRate({ fromCurrency: "USDC", toCurrency: "USDC" });
    expect(result.rate).toBe(1);
  });

  it("includes rateSource and timestamp fields", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.getFxRate({ fromCurrency: "NGN", toCurrency: "KES" });
    expect(result).toHaveProperty("rateSource");
    expect(result).toHaveProperty("timestamp");
    expect(typeof result.timestamp).toBe("number");
  });
});

// ─── wallet.sendCrossCurrency ─────────────────────────────────────────────────
describe("wallet.sendCrossCurrency", () => {
  beforeEach(async () => {
    const { getDb } = await import("./db");
    (getDb as any).mockResolvedValue(null);
  });

  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(
      caller.wallet.sendCrossCurrency({
        fromCurrency: "USDC",
        toCurrency: "XLM",
        amount: 10,
        counterparty: "alice",
      })
    ).rejects.toThrow();
  });

  it("rejects same-currency cross-currency send", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.wallet.sendCrossCurrency({
        fromCurrency: "USDC",
        toCurrency: "USDC",
        amount: 10,
        counterparty: "alice",
      })
    ).rejects.toThrow(/same-currency/i);
  });

  it("throws INTERNAL_SERVER_ERROR when DB unavailable", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.wallet.sendCrossCurrency({
        fromCurrency: "USDC",
        toCurrency: "XLM",
        amount: 10,
        counterparty: "alice",
      })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("throws BAD_REQUEST when insufficient balance", async () => {
    const { getDb } = await import("./db");
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      and: vi.fn().mockReturnThis(),
      // Returns a balance of 5 USDC when 10 is requested
      then: undefined,
    };
    // Simulate select returning low balance
    const mockSelect = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ id: "b1", balance: "5.0", currency: "USDC", userId: "42" }]),
      }),
    });
    (getDb as any).mockResolvedValue({ select: mockSelect });
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.wallet.sendCrossCurrency({
        fromCurrency: "USDC",
        toCurrency: "XLM",
        amount: 10,
        counterparty: "alice",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    (getDb as any).mockResolvedValue(null);
  });
});

// ─── loyalty.restockReward ────────────────────────────────────────────────────
describe("loyalty.restockReward", () => {
  beforeEach(async () => {
    const { getDb } = await import("./db");
    (getDb as any).mockResolvedValue(null);
  });

  it("requires admin role (anon rejected)", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(
      caller.loyalty.restockReward({ rewardId: "r1", newStock: 50 })
    ).rejects.toThrow();
  });

  it("requires admin role (user rejected)", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.loyalty.restockReward({ rewardId: "r1", newStock: 50 })
    ).rejects.toThrow();
  });

  it("throws INTERNAL_SERVER_ERROR when DB unavailable", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    await expect(
      caller.loyalty.restockReward({ rewardId: "r1", newStock: 50 })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("throws NOT_FOUND when reward does not exist", async () => {
    const { getDb } = await import("./db");
    const mockDb = {
      execute: vi.fn().mockResolvedValue([]), // empty result = not found
    };
    (getDb as any).mockResolvedValue(mockDb);
    const caller = appRouter.createCaller(adminCtx() as any);
    await expect(
      caller.loyalty.restockReward({ rewardId: "nonexistent", newStock: 50 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    (getDb as any).mockResolvedValue(null);
  });

  it("restocks an active reward and returns correct fields", async () => {
    const { getDb } = await import("./db");
    const mockDb = {
      execute: vi.fn()
        .mockResolvedValueOnce([{ id: "r1", name: "Hotel Night", stock: 5, is_active: true }]) // SELECT
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE stock
        .mockResolvedValueOnce(true), // notifyOwner (mocked via vi.mock)
    };
    (getDb as any).mockResolvedValue(mockDb);
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.loyalty.restockReward({ rewardId: "r1", newStock: 100 });
    expect(result.success).toBe(true);
    expect(result.rewardId).toBe("r1");
    expect(result.rewardName).toBe("Hotel Night");
    expect(result.previousStock).toBe(5);
    expect(result.newStock).toBe(100);
    expect(result.reactivated).toBe(false);
    (getDb as any).mockResolvedValue(null);
  });

  it("restocks and reactivates an inactive (out-of-stock) reward", async () => {
    const { getDb } = await import("./db");
    const mockDb = {
      execute: vi.fn()
        .mockResolvedValueOnce([{ id: "r2", name: "Safari Discount", stock: 0, is_active: false }]) // SELECT
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE
        .mockResolvedValueOnce(true), // notifyOwner
    };
    (getDb as any).mockResolvedValue(mockDb);
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.loyalty.restockReward({ rewardId: "r2", newStock: 30 });
    expect(result.success).toBe(true);
    expect(result.reactivated).toBe(true);
    expect(result.newStock).toBe(30);
    (getDb as any).mockResolvedValue(null);
  });

  it("rejects newStock of 0 (min is 1)", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    await expect(
      caller.loyalty.restockReward({ rewardId: "r1", newStock: 0 })
    ).rejects.toThrow();
  });

  it("rejects newStock above 100000 (max)", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    await expect(
      caller.loyalty.restockReward({ rewardId: "r1", newStock: 100001 })
    ).rejects.toThrow();
  });
});
