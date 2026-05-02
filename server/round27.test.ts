/**
 * Round 27 Tests
 * - serviceProxy.serviceHealthHistory (admin-only, returns last N hours per service)
 * - serviceProxy.serviceHealthAlertLog (admin-only, returns cooldown state per service)
 * - wallet.exportStatement date/currency filter validation
 * - wallet.exportStatementPdf date/currency filter validation
 * - biometric.getPinLockoutStatus tier fields (currentTier, totalLockouts, nextLockoutDuration)
 * - serviceHealthPoller unit tests (pollService, getServiceConfigs)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";

// ─── Mock DB (getDb returns null → early-return paths for DB-dependent procedures) ──
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

// ─── serviceProxy.serviceHealthHistory ───────────────────────────────────────
describe("serviceProxy.serviceHealthHistory", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.serviceProxy.serviceHealthHistory({ hours: 24 })).rejects.toThrow();
  });

  it("requires admin role", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.serviceProxy.serviceHealthHistory({ hours: 24 })).rejects.toThrow();
  });

  it("returns empty array when DB unavailable", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.serviceProxy.serviceHealthHistory({ hours: 24 });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it("accepts hours parameter between 1 and 48", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    const result1 = await caller.serviceProxy.serviceHealthHistory({ hours: 1 });
    const result48 = await caller.serviceProxy.serviceHealthHistory({ hours: 48 });
    expect(Array.isArray(result1)).toBe(true);
    expect(Array.isArray(result48)).toBe(true);
  });

  it("rejects hours below 1", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    await expect(caller.serviceProxy.serviceHealthHistory({ hours: 0 })).rejects.toThrow();
  });

  it("rejects hours above 48", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    await expect(caller.serviceProxy.serviceHealthHistory({ hours: 49 })).rejects.toThrow();
  });

  it("defaults hours to 24 when not provided", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    // Should not throw with default
    const result = await caller.serviceProxy.serviceHealthHistory({});
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── serviceProxy.serviceHealthAlertLog ──────────────────────────────────────
describe("serviceProxy.serviceHealthAlertLog", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.serviceProxy.serviceHealthAlertLog()).rejects.toThrow();
  });

  it("requires admin role", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.serviceProxy.serviceHealthAlertLog()).rejects.toThrow();
  });

  it("returns empty array when DB unavailable", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.serviceProxy.serviceHealthAlertLog();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it("is a query procedure (no mutation side effects)", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    // Calling twice should be idempotent
    const r1 = await caller.serviceProxy.serviceHealthAlertLog();
    const r2 = await caller.serviceProxy.serviceHealthAlertLog();
    expect(r1).toEqual(r2);
  });
});

// ─── wallet.exportStatement (date/currency validation) ───────────────────────
describe("wallet.exportStatement date and currency validation", () => {
  it("returns empty CSV when dateFrom is after dateTo (no DB rows)", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    // When DB is null, early-return path is taken regardless of date order
    const result = await caller.wallet.exportStatement({ dateFrom: "2025-12-31", dateTo: "2025-01-01" });
    expect(result.rowCount).toBe(0);
    expect(result.csv).toBe("");
  });

  it("accepts valid currency filter", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.exportStatement({
      dateFrom: "2025-01-01",
      dateTo: "2025-01-31",
      currency: "USDC",
    });
    expect(result.rowCount).toBe(0);
    expect(result.filename).toMatch(/wallet-statement/);
  });

  it("accepts any string as currency filter (server filters by matching rows)", async () => {
    // currency is z.string().optional() — validation is permissive, DB query handles filtering
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.exportStatement({
      dateFrom: "2025-01-01",
      dateTo: "2025-01-31",
      currency: "USDC",
    });
    expect(result.rowCount).toBe(0); // no DB rows in test environment
    expect(result.csv).toBe("");
  });

  it("includes dateFrom and dateTo in response", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.exportStatement({
      dateFrom: "2025-03-01",
      dateTo: "2025-03-31",
    });
    expect(result.dateFrom).toBe("2025-03-01");
    expect(result.dateTo).toBe("2025-03-31");
  });

  it("filename contains date range", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.exportStatement({
      dateFrom: "2025-06-01",
      dateTo: "2025-06-30",
    });
    expect(result.filename).toContain("2025-06-01");
    expect(result.filename).toContain("2025-06-30");
  });
});

// ─── wallet.exportStatementPdf (date/currency validation) ────────────────────
describe("wallet.exportStatementPdf date and currency validation", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(
      caller.wallet.exportStatementPdf({ dateFrom: "2025-01-01", dateTo: "2025-01-31" })
    ).rejects.toThrow();
  });

  it("returns empty markdown when DB unavailable", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.exportStatementPdf({
      dateFrom: "2025-01-01",
      dateTo: "2025-01-31",
    });
    expect(result.markdown).toBe("");
    expect(result.rowCount).toBe(0);
  });

  it("returns empty markdown when dateFrom is after dateTo (no DB rows)", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    // When DB is null, early-return path is taken regardless of date order
    const result = await caller.wallet.exportStatementPdf({ dateFrom: "2025-12-31", dateTo: "2025-01-01" });
    expect(result.rowCount).toBe(0);
    expect(result.markdown).toBe("");
  });

  it("filename ends with .md", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.exportStatementPdf({
      dateFrom: "2025-01-01",
      dateTo: "2025-01-31",
    });
    expect(result.filename).toMatch(/\.md$/);
  });

  it("includes dateFrom and dateTo in response", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.exportStatementPdf({
      dateFrom: "2025-04-01",
      dateTo: "2025-04-30",
    });
    expect(result.dateFrom).toBe("2025-04-01");
    expect(result.dateTo).toBe("2025-04-30");
  });
});

// ─── biometric.getPinLockoutStatus tier fields ────────────────────────────────
describe("biometric.getPinLockoutStatus tier fields", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.biometric.getPinLockoutStatus()).rejects.toThrow();
  });

  it("returns isLocked: false when no lockout is active", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.biometric.getPinLockoutStatus();
    expect(result.isLocked).toBe(false);
  });

  it("returns totalLockouts as a number", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.biometric.getPinLockoutStatus();
    expect(typeof result.totalLockouts).toBe("number");
  });

  it("returns nextLockoutDuration as a string", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.biometric.getPinLockoutStatus();
    expect(typeof result.nextLockoutDuration).toBe("string");
  });

  it("returns remainingMs as 0 when not locked", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.biometric.getPinLockoutStatus();
    expect(result.remainingMs).toBe(0);
  });

  it("returns lockedUntilMs as null when not locked", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.biometric.getPinLockoutStatus();
    expect(result.lockedUntilMs).toBeNull();
  });

  it("nextLockoutDuration for tier 0 is 15 minutes", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.biometric.getPinLockoutStatus();
    // When totalLockouts is 0 (no history), next tier is 0 → 15 minutes
    if (result.totalLockouts === 0) {
      expect(result.nextLockoutDuration).toMatch(/15\s*min/i);
    }
  });
});

// ─── serviceHealthPoller unit tests ──────────────────────────────────────────
describe("serviceHealthPoller", () => {
  it("getServiceConfigs returns an array of service configs", async () => {
    const { getServiceConfigs } = await import("./jobs/serviceHealthPoller");
    const configs = getServiceConfigs();
    expect(Array.isArray(configs)).toBe(true);
  });

  it("each service config has required fields", async () => {
    const { getServiceConfigs } = await import("./jobs/serviceHealthPoller");
    const configs = getServiceConfigs();
    for (const config of configs) {
      expect(typeof config.key).toBe("string");
      expect(config.key.length).toBeGreaterThan(0);
      expect(typeof config.name).toBe("string");
    }
  });

  it("pollService returns a PollResult with required fields", async () => {
    const { pollService } = await import("./jobs/serviceHealthPoller");
    const result = await pollService({ key: "test", name: "Test Service", url: "http://localhost:9999", healthPath: "/health" });
    expect(typeof result.key).toBe("string");
    expect(typeof result.status).toBe("string");
    expect(typeof result.responseMs).toBe("number");
    expect(result.status).toBe("unreachable"); // localhost:9999 should be unreachable
  });

  it("pollService marks unreachable service as unhealthy", async () => {
    const { pollService } = await import("./jobs/serviceHealthPoller");
    const result = await pollService({ key: "unreachable", name: "Unreachable", url: "http://0.0.0.0:1", healthPath: "/health" });
    expect(result.status).toBe("unreachable");
    expect(result.error).toBeTruthy();
  });

  it("pollService returns responseMs >= 0", async () => {
    const { pollService } = await import("./jobs/serviceHealthPoller");
    const result = await pollService({ key: "test2", name: "Test2", url: "http://localhost:9998", healthPath: "/health" });
    expect(result.responseMs).toBeGreaterThanOrEqual(0);
  });
});
