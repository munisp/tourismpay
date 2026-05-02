/**
 * Round 37 Tests
 * - wallet.getExchangeRates: returns { base, rates, source } for a base currency
 * - wallet.getFxRate: returns rate/effectiveRate/spread between two currencies
 * - wallet.convertCurrency: converts balance, rejects insufficient balance, rejects same-currency
 * - loyalty.getExpiringPoints: returns earn transactions expiring within 30 days
 * - loyalty.processExpiredPoints: admin-only, deducts expired points, notifies users
 * - loyalty.sendExpiryWarnings: admin-only, sends 30-day expiry warnings
 * - bis.getSlaBreaches: admin-only, returns overdue processing investigations
 * - bis.sendSlaBreachAlerts: admin-only, notifies assigned analysts and owner
 * - bisAutoAdvance job: SLA breach detection fires alerts for overdue investigations
 * - loyaltyPointsExpiry job: exports expected functions
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

// ─── wallet.getExchangeRates ──────────────────────────────────────────────────
describe("wallet.getExchangeRates", () => {
  it("rejects anonymous users", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.wallet.getExchangeRates({})).rejects.toThrow();
  });

  it("returns { base, rates, source } shape for authenticated user", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.getExchangeRates({});
    expect(result).toHaveProperty("base");
    expect(result).toHaveProperty("rates");
    expect(result).toHaveProperty("source");
    expect(typeof result.rates).toBe("object");
  });

  it("defaults base to USDC when not specified", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.getExchangeRates({});
    expect(result.base).toBe("USDC");
  });

  it("uses specified base currency", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.getExchangeRates({ base: "USD" });
    expect(result.base).toBe("USD");
  });

  it("returns static source when live API is unavailable", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.getExchangeRates({ base: "USD" });
    // In test environment, live API will fail, so source should be 'static'
    expect(result.source).toBe("static");
  });

  it("rates object contains multiple currencies", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.getExchangeRates({ base: "USD" });
    expect(Object.keys(result.rates).length).toBeGreaterThan(1);
  });

  it("rate for same currency as base is 1", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.getExchangeRates({ base: "USD" });
    expect(result.rates["USD"]).toBe(1);
  });

  it("NGN rate relative to USD is greater than 1 (NGN is weaker)", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.getExchangeRates({ base: "USD" });
    // 1 USD buys many NGN, so USD→NGN rate > 1
    expect(result.rates["NGN"]).toBeGreaterThan(1);
  });
});

// ─── wallet.getFxRate ─────────────────────────────────────────────────────────
describe("wallet.getFxRate", () => {
  it("rejects anonymous users", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.wallet.getFxRate({ fromCurrency: "USD", toCurrency: "NGN" })).rejects.toThrow();
  });

  it("returns rate, effectiveRate, spread for valid currency pair", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.getFxRate({ fromCurrency: "USD", toCurrency: "NGN" });
    expect(result).toHaveProperty("rate");
    expect(result).toHaveProperty("effectiveRate");
    expect(result).toHaveProperty("spread");
    expect(result).toHaveProperty("fromCurrency", "USD");
    expect(result).toHaveProperty("toCurrency", "NGN");
    expect(typeof result.rate).toBe("number");
    expect(result.rate).toBeGreaterThan(0);
  });

  it("effectiveRate is less than rate due to spread", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.getFxRate({ fromCurrency: "USD", toCurrency: "NGN" });
    expect(result.effectiveRate).toBeLessThan(result.rate);
  });

  it("returns rate of 1 for same currency (USD→USD)", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.getFxRate({ fromCurrency: "USD", toCurrency: "USD" });
    expect(result.rate).toBe(1);
  });

  it("returns convertedAmount when amount is provided", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.getFxRate({ fromCurrency: "USD", toCurrency: "USD", amount: 100 });
    expect(result.convertedAmount).toBeDefined();
    expect(result.convertedAmount).toBeCloseTo(100, 0);
  });

  it("NGN rate relative to USD is greater than 1 (NGN is weaker)", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.getFxRate({ fromCurrency: "USD", toCurrency: "NGN" });
    expect(result.rate).toBeGreaterThan(1);
  });

  it("USD/USDC pair uses lower spread (0.3%) than cross-family pairs (0.5%)", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const sameFamilyResult = await caller.wallet.getFxRate({ fromCurrency: "USD", toCurrency: "USDC" });
    const crossFamilyResult = await caller.wallet.getFxRate({ fromCurrency: "USD", toCurrency: "NGN" });
    expect(sameFamilyResult.spread).toBeLessThan(crossFamilyResult.spread);
  });

  it("returns symmetric rates (USD→NGN vs NGN→USD are reciprocals)", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const r1 = await caller.wallet.getFxRate({ fromCurrency: "USD", toCurrency: "NGN" });
    const r2 = await caller.wallet.getFxRate({ fromCurrency: "NGN", toCurrency: "USD" });
    expect(r1.rate * r2.rate).toBeCloseTo(1, 3);
  });
});
// ─── wallet.convertCurrency ───────────────────────────────────────────────────
describe("wallet.convertCurrency", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockReset();
    vi.mocked(getDb).mockResolvedValue(null);
  });

  it("rejects anonymous users", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.wallet.convertCurrency({ fromCurrency: "USD", toCurrency: "NGN", fromAmount: 100 })).rejects.toThrow();
  });

  it("rejects same-currency conversion", async () => {
    const { getDb } = await import("./db");
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ balance: "1000" }]),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.wallet.convertCurrency({ fromCurrency: "USD", toCurrency: "USD", fromAmount: 100 })).rejects.toThrow("Source and target currencies must be different.");
  });

  it("rejects when database is unavailable", async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockResolvedValue(null);
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.wallet.convertCurrency({ fromCurrency: "USD", toCurrency: "NGN", fromAmount: 100 })).rejects.toThrow("Database unavailable");
  });

  it("rejects when source balance is insufficient", async () => {
    const { getDb } = await import("./db");
    const mockLimit = vi.fn().mockResolvedValue([{ balance: "50" }]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
    const mockDb = {
      select: mockSelect,
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.wallet.convertCurrency({ fromCurrency: "USD", toCurrency: "NGN", fromAmount: 100 })).rejects.toThrow("Insufficient USD balance");
  });

  it("validates fromAmount must be positive", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.wallet.convertCurrency({ fromCurrency: "USD", toCurrency: "NGN", fromAmount: -10 })).rejects.toThrow();
  });

  it("validates fromAmount cannot be zero", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.wallet.convertCurrency({ fromCurrency: "USD", toCurrency: "NGN", fromAmount: 0 })).rejects.toThrow();
  });

  it("accepts valid cross-currency conversion with sufficient balance", async () => {
    const { getDb } = await import("./db");
    const mockLimit = vi.fn().mockResolvedValue([{ balance: "500" }]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
    const mockInsert = vi.fn().mockReturnThis();
    const mockValues = vi.fn().mockReturnThis();
    const mockOnConflict = vi.fn().mockResolvedValue(undefined);
    const mockDb = {
      select: mockSelect,
      insert: mockInsert,
      values: mockValues,
      onConflictDoUpdate: mockOnConflict,
      execute: vi.fn().mockResolvedValue(undefined),
    };
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockReturnValue({ onConflictDoUpdate: mockOnConflict });
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.convertCurrency({ fromCurrency: "USD", toCurrency: "NGN", fromAmount: 100 });
    expect(result).toHaveProperty("fromCurrency", "USD");
    expect(result).toHaveProperty("toCurrency", "NGN");
    expect(result).toHaveProperty("fromAmount", 100);
    expect(result).toHaveProperty("toAmount");
    expect(result).toHaveProperty("rate");
     expect(result.toAmount).toBeGreaterThan(0);
  });
});
// ─── loyalty.getExpiringPoints ────────────────────────────────────────────────
describe("loyalty.getExpiringPoints", () => {
  beforeEach(async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockReset();
    vi.mocked(getDb).mockResolvedValue(null);
  });

  it("rejects anonymous users", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.loyalty.getExpiringPoints()).rejects.toThrow();
  });

  it("returns empty result when database is unavailable", async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockResolvedValue(null);
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.loyalty.getExpiringPoints();
    expect(result.expiringSoon).toEqual([]);
    expect(result.totalExpiringSoon).toBe(0);
  });

  it("returns expiring points items when DB has data", async () => {
    const { getDb } = await import("./db");
    const nowSec = Math.floor(Date.now() / 1000);
    const expiresIn15Days = nowSec + 15 * 24 * 60 * 60;
    const mockRows = [
      { id: "tx1", points: 500, description: "Hotel stay bonus", partner: "Sheraton", expires_at: expiresIn15Days, created_at: nowSec - 300 * 24 * 60 * 60 },
      { id: "tx2", points: 200, description: "Transport bonus", partner: "Lagos Rides", expires_at: nowSec + 5 * 24 * 60 * 60, created_at: nowSec - 350 * 24 * 60 * 60 },
    ];
    const mockDb = { execute: vi.fn().mockResolvedValue(mockRows) };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.loyalty.getExpiringPoints();
    expect(result.expiringSoon).toHaveLength(2);
    expect(result.totalExpiringSoon).toBe(700);
    expect(result.expiringSoon[0]).toHaveProperty("daysLeft");
    expect(result.expiringSoon[0].daysLeft).toBeGreaterThan(0);
    expect(result.expiringSoon[0].daysLeft).toBeLessThanOrEqual(30);
  });

  it("returns correct daysLeft for each item", async () => {
    const { getDb } = await import("./db");
    const nowSec = Math.floor(Date.now() / 1000);
    const expiresIn10Days = nowSec + 10 * 24 * 60 * 60;
    const mockRows = [{ id: "tx1", points: 300, description: "Bonus", partner: "Test", expires_at: expiresIn10Days, created_at: nowSec - 355 * 24 * 60 * 60 }];
    const mockDb = { execute: vi.fn().mockResolvedValue(mockRows) };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.loyalty.getExpiringPoints();
    expect(result.expiringSoon[0].daysLeft).toBe(10);
  });

  it("returns expiresAt as Unix timestamp in seconds", async () => {
    const { getDb } = await import("./db");
    const nowSec = Math.floor(Date.now() / 1000);
    const expiresAt = nowSec + 20 * 24 * 60 * 60;
    const mockRows = [{ id: "tx1", points: 100, description: "Test", partner: "Test", expires_at: expiresAt, created_at: nowSec - 345 * 24 * 60 * 60 }];
    const mockDb = { execute: vi.fn().mockResolvedValue(mockRows) };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.loyalty.getExpiringPoints();
    expect(result.expiringSoon[0].expiresAt).toBe(expiresAt);
  });

  it("totalExpiringSoon is the sum of all expiring points", async () => {
    const { getDb } = await import("./db");
    const nowSec = Math.floor(Date.now() / 1000);
    const mockRows = [
      { id: "tx1", points: 100, description: "A", partner: "P1", expires_at: nowSec + 5 * 86400, created_at: nowSec - 360 * 86400 },
      { id: "tx2", points: 250, description: "B", partner: "P2", expires_at: nowSec + 10 * 86400, created_at: nowSec - 355 * 86400 },
      { id: "tx3", points: 75, description: "C", partner: "P3", expires_at: nowSec + 28 * 86400, created_at: nowSec - 337 * 86400 },
    ];
    const mockDb = { execute: vi.fn().mockResolvedValue(mockRows) };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.loyalty.getExpiringPoints();
    expect(result.totalExpiringSoon).toBe(425);
  });
});

// ─── loyalty.processExpiredPoints ────────────────────────────────────────────
describe("loyalty.processExpiredPoints", () => {
  beforeEach(async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockReset();
    vi.mocked(getDb).mockResolvedValue(null);
  });

  it("rejects non-admin users", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.loyalty.processExpiredPoints()).rejects.toThrow();
  });

  it("rejects anonymous users", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.loyalty.processExpiredPoints()).rejects.toThrow();
  });

  it("rejects when database is unavailable", async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockResolvedValue(null);
    const caller = appRouter.createCaller(adminCtx() as any);
    await expect(caller.loyalty.processExpiredPoints()).rejects.toThrow("Database unavailable");
  });

  it("returns processed=0 when no expired transactions exist", async () => {
    const { getDb } = await import("./db");
    const mockDb = { execute: vi.fn().mockResolvedValue([]) };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.loyalty.processExpiredPoints();
    expect(result.processed).toBe(0);
    expect(result.usersAffected).toBe(0);
  });

  it("processes expired transactions and returns correct counts", async () => {
    const { getDb } = await import("./db");
    const expiredRows = [
      { id: "tx1", user_id: "10", points: 500 },
      { id: "tx2", user_id: "10", points: 200 },
      { id: "tx3", user_id: "20", points: 300 },
    ];
    const mockDb = {
      execute: vi.fn()
        .mockResolvedValueOnce(expiredRows)  // SELECT expired
        .mockResolvedValue(undefined),       // all subsequent UPDATE/INSERT calls
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.loyalty.processExpiredPoints();
    expect(result.processed).toBe(3);
    expect(result.usersAffected).toBe(2);
  });

  it("notifies each affected user when points expire", async () => {
    const { getDb, createUserNotification } = await import("./db");
    const expiredRows = [{ id: "tx1", user_id: "42", points: 800 }];
    const mockDb = {
      execute: vi.fn()
        .mockResolvedValueOnce(expiredRows)
        .mockResolvedValue(undefined),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const caller = appRouter.createCaller(adminCtx() as any);
    await caller.loyalty.processExpiredPoints();
    expect(vi.mocked(createUserNotification)).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 42,
        category: "system",
        title: expect.stringContaining("800"),
      })
    );
  });

  it("notifies owner with summary after processing", async () => {
    const { getDb } = await import("./db");
    const { notifyOwner } = await import("./_core/notification");
    const expiredRows = [{ id: "tx1", user_id: "42", points: 600 }];
    const mockDb = {
      execute: vi.fn()
        .mockResolvedValueOnce(expiredRows)
        .mockResolvedValue(undefined),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const caller = appRouter.createCaller(adminCtx() as any);
    await caller.loyalty.processExpiredPoints();
    expect(vi.mocked(notifyOwner)).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining("Loyalty Points Expiry"),
      })
    );
  });
});

// ─── loyalty.sendExpiryWarnings ───────────────────────────────────────────────
describe("loyalty.sendExpiryWarnings", () => {
  beforeEach(async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockReset();
    vi.mocked(getDb).mockResolvedValue(null);
  });

  it("rejects non-admin users", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.loyalty.sendExpiryWarnings()).rejects.toThrow();
  });

  it("rejects anonymous users", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.loyalty.sendExpiryWarnings()).rejects.toThrow();
  });

  it("rejects when database is unavailable", async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockResolvedValue(null);
    const caller = appRouter.createCaller(adminCtx() as any);
    await expect(caller.loyalty.sendExpiryWarnings()).rejects.toThrow("Database unavailable");
  });

  it("returns warned=0 when no transactions are expiring soon", async () => {
    const { getDb } = await import("./db");
    const mockDb = { execute: vi.fn().mockResolvedValue([]) };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.loyalty.sendExpiryWarnings();
    expect(result.warned).toBe(0);
  });

  it("notifies users with expiring points and returns warned count", async () => {
    vi.clearAllMocks();
    const { getDb, createUserNotification } = await import("./db");
    const soonRows = [
      { user_id: "10", total_expiring: 400 },
      { user_id: "20", total_expiring: 150 },
    ];
    const mockDb = { execute: vi.fn().mockResolvedValue(soonRows) };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.loyalty.sendExpiryWarnings();
    expect(result.warned).toBe(2);
    expect(vi.mocked(createUserNotification)).toHaveBeenCalledTimes(2);
  });

  it("sends notification with correct content to each user", async () => {
    const { getDb, createUserNotification } = await import("./db");
    const soonRows = [{ user_id: "55", total_expiring: 750 }];
    const mockDb = { execute: vi.fn().mockResolvedValue(soonRows) };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const caller = appRouter.createCaller(adminCtx() as any);
    await caller.loyalty.sendExpiryWarnings();
    expect(vi.mocked(createUserNotification)).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 55,
        category: "system",
        title: expect.stringContaining("750"),
        actionUrl: "/loyalty",
      })
    );
  });
});

// ─── bis.getSlaBreaches ───────────────────────────────────────────────────────
describe("bis.getSlaBreaches", () => {
  beforeEach(async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockReset();
    vi.mocked(getDb).mockResolvedValue(null);
  });

  it("rejects non-admin users", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.bis.getSlaBreaches()).rejects.toThrow();
  });

  it("rejects anonymous users", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.bis.getSlaBreaches()).rejects.toThrow();
  });

  it("returns empty list when database is unavailable", async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockResolvedValue(null);
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.bis.getSlaBreaches();
    expect(result.breaches).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("returns empty list when no investigations are overdue", async () => {
    const { getDb } = await import("./db");
    const futureMs = Date.now() + 2 * 60 * 60 * 1000;
    const mockRows = [
      { id: 1, referenceId: "BIS-001", subjectFullName: "John Doe", status: "processing", riskLevel: "medium", dueAt: futureMs, slaHours: 48, assignedToId: "u1", assignedToName: "Alice", createdAt: Date.now() - 10000 },
    ];
    const mockLimit = vi.fn().mockResolvedValue(mockRows);
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
    vi.mocked(getDb).mockResolvedValue({ select: mockSelect } as any);
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.bis.getSlaBreaches();
    expect(result.breaches).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("returns overdue investigations with overdueByHours computed", async () => {
    const { getDb } = await import("./db");
    const overdueMs = Date.now() - 5 * 60 * 60 * 1000;
    const mockRows = [
      { id: 1, referenceId: "BIS-001", subjectFullName: "John Doe", status: "processing", riskLevel: "high", dueAt: overdueMs, slaHours: 24, assignedToId: "u1", assignedToName: "Alice", createdAt: Date.now() - 30 * 60 * 60 * 1000 },
    ];
    const mockLimit = vi.fn().mockResolvedValue(mockRows);
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
    vi.mocked(getDb).mockResolvedValue({ select: mockSelect } as any);
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.bis.getSlaBreaches();
    expect(result.breaches).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.breaches[0].referenceId).toBe("BIS-001");
    expect(result.breaches[0].overdueByHours).toBe(5);
    expect(result.breaches[0].overdueByMs).toBeGreaterThan(0);
  });

  it("filters out non-overdue investigations from the list", async () => {
    const { getDb } = await import("./db");
    const overdueMs = Date.now() - 3 * 60 * 60 * 1000;
    const futureMs = Date.now() + 1 * 60 * 60 * 1000;
    const mockRows = [
      { id: 1, referenceId: "BIS-001", subjectFullName: "Overdue Person", status: "processing", riskLevel: "high", dueAt: overdueMs, slaHours: 24, assignedToId: "u1", assignedToName: "Alice", createdAt: Date.now() - 30 * 60 * 60 * 1000 },
      { id: 2, referenceId: "BIS-002", subjectFullName: "On Time Person", status: "processing", riskLevel: "low", dueAt: futureMs, slaHours: 72, assignedToId: "u2", assignedToName: "Bob", createdAt: Date.now() - 5 * 60 * 60 * 1000 },
    ];
    const mockLimit = vi.fn().mockResolvedValue(mockRows);
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
    vi.mocked(getDb).mockResolvedValue({ select: mockSelect } as any);
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.bis.getSlaBreaches();
    expect(result.breaches).toHaveLength(1);
    expect(result.breaches[0].referenceId).toBe("BIS-001");
  });

  it("respects custom limit parameter — limit * 3 is passed to DB query", async () => {
    const { getDb } = await import("./db");
    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
    vi.mocked(getDb).mockResolvedValue({ select: mockSelect } as any);
    const caller = appRouter.createCaller(adminCtx() as any);
    await caller.bis.getSlaBreaches({ limit: 10 });
    // The procedure calls .limit(limit * 3) for over-fetch
    expect(mockLimit).toHaveBeenCalledWith(30);
  });
});

// ─── bis.sendSlaBreachAlerts ──────────────────────────────────────────────────
describe("bis.sendSlaBreachAlerts", () => {
  beforeEach(async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockReset();
    vi.mocked(getDb).mockResolvedValue(null);
  });

  it("rejects non-admin users", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.bis.sendSlaBreachAlerts()).rejects.toThrow();
  });

  it("rejects anonymous users", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.bis.sendSlaBreachAlerts()).rejects.toThrow();
  });

  it("rejects when database is unavailable", async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockResolvedValue(null);
    const caller = appRouter.createCaller(adminCtx() as any);
    await expect(caller.bis.sendSlaBreachAlerts()).rejects.toThrow("Database unavailable");
  });

  it("returns alerted=0 when no investigations are overdue", async () => {
    const { getDb } = await import("./db");
    const futureMs = Date.now() + 2 * 60 * 60 * 1000;
    const mockRows = [
      { id: 1, referenceId: "BIS-001", subjectFullName: "John Doe", riskLevel: "medium", dueAt: futureMs, slaHours: 48, assignedToId: "u1", assignedToName: "Alice" },
    ];
    const mockWhere = vi.fn().mockResolvedValue(mockRows);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
    vi.mocked(getDb).mockResolvedValue({ select: mockSelect } as any);
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.bis.sendSlaBreachAlerts();
    expect(result.alerted).toBe(0);
    expect(result.ownerNotified).toBe(false);
  });

  it("notifies assigned analysts for overdue investigations", async () => {
    vi.clearAllMocks();
    const { getDb } = await import("./db");
    const overdueMs = Date.now() - 6 * 60 * 60 * 1000;
    const mockRows = [
      { id: 1, referenceId: "BIS-001", subjectFullName: "Jane Smith", riskLevel: "high", dueAt: overdueMs, slaHours: 24, assignedToId: "u5", assignedToName: "Bob" },
      { id: 2, referenceId: "BIS-002", subjectFullName: "Mark Jones", riskLevel: "critical", dueAt: overdueMs - 3600000, slaHours: 8, assignedToId: "u6", assignedToName: "Carol" },
    ];
    const mockWhere = vi.fn().mockResolvedValue(mockRows);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
    vi.mocked(getDb).mockResolvedValue({ select: mockSelect } as any);
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.bis.sendSlaBreachAlerts();
    expect(result.alerted).toBe(2);
    expect(result.ownerNotified).toBe(true);
    // createUserNotification is called via dynamic import inside sendSlaBreachAlerts
    // We verify indirectly through alerted count
  });

  it("sends owner summary notification with breach count", async () => {
    const { getDb } = await import("./db");
    const { notifyOwner } = await import("./_core/notification");
    const overdueMs = Date.now() - 4 * 60 * 60 * 1000;
    const mockRows = [
      { id: 1, referenceId: "BIS-001", subjectFullName: "Test Person", riskLevel: "medium", dueAt: overdueMs, slaHours: 48, assignedToId: "u1", assignedToName: "Alice" },
    ];
    const mockWhere = vi.fn().mockResolvedValue(mockRows);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
    vi.mocked(getDb).mockResolvedValue({ select: mockSelect } as any);
    const caller = appRouter.createCaller(adminCtx() as any);
    await caller.bis.sendSlaBreachAlerts();
    expect(vi.mocked(notifyOwner)).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining("BIS SLA Breach Alert"),
      })
    );
  });

  it("skips analyst notification when investigation has no assignedToId", async () => {
    vi.clearAllMocks();
    const { getDb } = await import("./db");
    const overdueMs = Date.now() - 2 * 60 * 60 * 1000;
    const mockRows = [
      { id: 1, referenceId: "BIS-001", subjectFullName: "Unassigned Person", riskLevel: "low", dueAt: overdueMs, slaHours: 72, assignedToId: null, assignedToName: null },
    ];
    const mockWhere = vi.fn().mockResolvedValue(mockRows);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
    vi.mocked(getDb).mockResolvedValue({ select: mockSelect } as any);
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.bis.sendSlaBreachAlerts();
    // alerted=0 because no assignedToId
    expect(result.alerted).toBe(0);
    // owner is still notified even when no analysts are assigned
    expect(result.ownerNotified).toBe(true);
  });
});

// ─── bisAutoAdvance job: SLA breach detection ─────────────────────────────────
describe("bisAutoAdvance job: SLA breach detection", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockResolvedValue(null);
  });

  it("exports runBisAutoAdvanceCycle function", async () => {
    const { runBisAutoAdvanceCycle } = await import("./jobs/bisAutoAdvance");
    expect(typeof runBisAutoAdvanceCycle).toBe("function");
  });

  it("exports startBisAutoAdvanceJob and stopBisAutoAdvanceJob functions", async () => {
    const { startBisAutoAdvanceJob, stopBisAutoAdvanceJob } = await import("./jobs/bisAutoAdvance");
    expect(typeof startBisAutoAdvanceJob).toBe("function");
    expect(typeof stopBisAutoAdvanceJob).toBe("function");
  });

  it("runBisAutoAdvanceCycle returns { advanced, completed, errors } shape", async () => {
    const { getPendingBisInvestigations, getProcessingBisInvestigations } = await import("./db");
    vi.mocked(getPendingBisInvestigations).mockResolvedValue([]);
    vi.mocked(getProcessingBisInvestigations).mockResolvedValue([]);
    const { runBisAutoAdvanceCycle } = await import("./jobs/bisAutoAdvance");
    const result = await runBisAutoAdvanceCycle();
    expect(result).toHaveProperty("advanced");
    expect(result).toHaveProperty("completed");
    expect(result).toHaveProperty("errors");
    expect(typeof result.advanced).toBe("number");
    expect(typeof result.completed).toBe("number");
    expect(typeof result.errors).toBe("number");
  });

  it("SLA breach detection fires notifyOwner when overdue investigations exist", async () => {
    const { getDb, getPendingBisInvestigations, getProcessingBisInvestigations } = await import("./db");
    const { notifyOwner } = await import("./_core/notification");
    const overdueMs = Date.now() - 5 * 60 * 60 * 1000;
    const mockWhere = vi.fn().mockResolvedValue([
      { id: 1, referenceId: "BIS-001", subjectFullName: "Test", riskLevel: "high", dueAt: overdueMs, slaHours: 24, assignedToId: null, assignedToName: null },
    ]);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
    vi.mocked(getDb).mockResolvedValue({ select: mockSelect } as any);
    vi.mocked(getPendingBisInvestigations).mockResolvedValue([]);
    vi.mocked(getProcessingBisInvestigations).mockResolvedValue([]);
    const { runBisAutoAdvanceCycle } = await import("./jobs/bisAutoAdvance");
    await runBisAutoAdvanceCycle();
    const slaCalls = vi.mocked(notifyOwner).mock.calls.filter(
      (call) => call[0]?.title?.includes("SLA Breach")
    );
    expect(slaCalls.length).toBeGreaterThan(0);
  });

  it("SLA breach detection does NOT fire notifyOwner for SLA when no overdue investigations", async () => {
    const { getDb, getPendingBisInvestigations, getProcessingBisInvestigations } = await import("./db");
    const { notifyOwner } = await import("./_core/notification");
    const futureMs = Date.now() + 2 * 60 * 60 * 1000;
    const mockWhere = vi.fn().mockResolvedValue([
      { id: 1, referenceId: "BIS-001", subjectFullName: "Test", riskLevel: "low", dueAt: futureMs, slaHours: 72, assignedToId: null, assignedToName: null },
    ]);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
    vi.mocked(getDb).mockResolvedValue({ select: mockSelect } as any);
    vi.mocked(getPendingBisInvestigations).mockResolvedValue([]);
    vi.mocked(getProcessingBisInvestigations).mockResolvedValue([]);
    const { runBisAutoAdvanceCycle } = await import("./jobs/bisAutoAdvance");
    await runBisAutoAdvanceCycle();
    const slaCalls = vi.mocked(notifyOwner).mock.calls.filter(
      (call) => call[0]?.title?.includes("SLA Breach")
    );
    expect(slaCalls).toHaveLength(0);
  });
});

// ─── loyaltyPointsExpiry job ──────────────────────────────────────────────────
describe("loyaltyPointsExpiry job", () => {
  it("exports runLoyaltyPointsExpiryJob function", async () => {
    const mod = await import("./jobs/loyaltyPointsExpiry");
    expect(typeof mod.runLoyaltyPointsExpiryJob).toBe("function");
  });

  it("exports startLoyaltyPointsExpiryJob and stopLoyaltyPointsExpiryJob functions", async () => {
    const mod = await import("./jobs/loyaltyPointsExpiry");
    expect(typeof mod.startLoyaltyPointsExpiryJob).toBe("function");
    expect(typeof mod.stopLoyaltyPointsExpiryJob).toBe("function");
  });

  it("runLoyaltyPointsExpiryJob handles DB unavailable gracefully", async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockResolvedValue(null);
    const { runLoyaltyPointsExpiryJob } = await import("./jobs/loyaltyPointsExpiry");
    await expect(runLoyaltyPointsExpiryJob()).resolves.not.toThrow();
  });
});
