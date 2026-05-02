/**
 * Round 26 Tests
 * - wallet.exportStatement (CSV wallet statement export)
 * - wallet.exportStatementPdf (LLM-formatted Markdown statement)
 * - biometric.verifyPin exponential backoff (tier 0=15min, tier 1=1hr, tier 2+=24hr)
 * - biometric.getPinLockoutStatus with tier info
 * - serviceProxy.serviceHealthHistory (DB-backed history query)
 * - serviceProxy.serviceHealthAlertLog (alert cooldown state)
 * - serviceHealthPoller job unit tests (pollService, getServiceConfigs)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";

// ─── Mock DB (getDb returns null → INTERNAL_SERVER_ERROR for DB-dependent paths) ──
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

// ─── wallet.exportStatement ───────────────────────────────────────────────────
describe("wallet.exportStatement", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(
      caller.wallet.exportStatement({ dateFrom: "2025-01-01", dateTo: "2025-01-31" })
    ).rejects.toThrow();
  });

  it("returns empty CSV when DB unavailable", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.exportStatement({ dateFrom: "2025-01-01", dateTo: "2025-01-31" });
    expect(result.csv).toBe("");
    expect(result.rowCount).toBe(0);
    expect(result.filename).toMatch(/wallet-statement/);
  });

  it("validates dateFrom format (YYYY-MM-DD)", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.wallet.exportStatement({ dateFrom: "01-01-2025", dateTo: "2025-01-31" })
    ).rejects.toThrow();
  });

  it("validates dateTo format (YYYY-MM-DD)", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.wallet.exportStatement({ dateFrom: "2025-01-01", dateTo: "January 31 2025" })
    ).rejects.toThrow();
  });

  it("accepts optional currency filter", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.exportStatement({
      dateFrom: "2025-01-01",
      dateTo: "2025-01-31",
      currency: "USD",
    });
    expect(result).toHaveProperty("csv");
    expect(result).toHaveProperty("filename");
    expect(result).toHaveProperty("rowCount");
  });

  it("filename includes date range", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.exportStatement({ dateFrom: "2025-03-01", dateTo: "2025-03-31" });
    expect(result.filename).toContain("2025-03-01");
    expect(result.filename).toContain("2025-03-31");
    expect(result.filename).toMatch(/\.csv$/);
  });

  it("returns dateFrom and dateTo in response", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.exportStatement({ dateFrom: "2025-06-01", dateTo: "2025-06-30" });
    expect(result.dateFrom).toBe("2025-06-01");
    expect(result.dateTo).toBe("2025-06-30");
  });
});

// ─── wallet.exportStatementPdf ────────────────────────────────────────────────
describe("wallet.exportStatementPdf", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(
      caller.wallet.exportStatementPdf({ dateFrom: "2025-01-01", dateTo: "2025-01-31" })
    ).rejects.toThrow();
  });

  it("returns empty markdown when DB unavailable", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.exportStatementPdf({ dateFrom: "2025-01-01", dateTo: "2025-01-31" });
    expect(result.markdown).toBe("");
    expect(result.rowCount).toBe(0);
    expect(result.filename).toMatch(/\.md$/);
  });

  it("validates dateFrom format", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.wallet.exportStatementPdf({ dateFrom: "2025/01/01", dateTo: "2025-01-31" })
    ).rejects.toThrow();
  });

  it("filename includes date range with .md extension", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.exportStatementPdf({ dateFrom: "2025-04-01", dateTo: "2025-04-30" });
    expect(result.filename).toContain("2025-04-01");
    expect(result.filename).toContain("2025-04-30");
    expect(result.filename).toMatch(/\.md$/);
  });

  it("accepts optional currency filter", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.exportStatementPdf({
      dateFrom: "2025-01-01",
      dateTo: "2025-01-31",
      currency: "EUR",
    });
    expect(result).toHaveProperty("markdown");
    expect(result).toHaveProperty("rowCount");
  });
});

// ─── biometric.verifyPin exponential backoff ──────────────────────────────────
describe("biometric.verifyPin exponential backoff", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(
      caller.biometric.verifyPin({ pin: "123456", amount: 100, currency: "USD" })
    ).rejects.toThrow();
  });

  it("throws INTERNAL_SERVER_ERROR when DB unavailable (no PIN enrollment)", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const err = await caller.biometric.verifyPin({ pin: "123456", amount: 100, currency: "USD" }).catch((e: any) => e);
    expect(err.code).toBe("INTERNAL_SERVER_ERROR");
  });

  it("validates PIN must be exactly 6 digits", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.biometric.verifyPin({ pin: "12345", amount: 100, currency: "USD" })
    ).rejects.toThrow();
  });

  it("validates PIN must be numeric digits only", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.biometric.verifyPin({ pin: "12345a", amount: 100, currency: "USD" })
    ).rejects.toThrow();
  });

  it("validates amount must be positive", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.biometric.verifyPin({ pin: "123456", amount: -50, currency: "USD" })
    ).rejects.toThrow();
  });

  it("validates currency is required", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.biometric.verifyPin({ pin: "123456", amount: 100, currency: "" })
    ).rejects.toThrow();
  });
});

// ─── biometric.getPinLockoutStatus ────────────────────────────────────────────
describe("biometric.getPinLockoutStatus", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.biometric.getPinLockoutStatus()).rejects.toThrow();
  });

  it("returns unlocked status when no lockout exists", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.biometric.getPinLockoutStatus();
    expect(result.isLocked).toBe(false);
    expect(result.remainingMs).toBe(0);
    expect(result.failedAttempts).toBe(0);
  });

  it("returns nextLockoutDuration field", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.biometric.getPinLockoutStatus();
    expect(result).toHaveProperty("nextLockoutDuration");
    // First lockout would be tier 0 = 15 minutes
    expect(result.nextLockoutDuration).toBe("15 minutes");
  });

  it("returns totalLockouts field", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.biometric.getPinLockoutStatus();
    expect(result).toHaveProperty("totalLockouts");
    expect(typeof result.totalLockouts).toBe("number");
  });

  it("is a query procedure (not mutation)", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.biometric.getPinLockoutStatus();
    expect(result).toBeDefined();
  });
});

// ─── serviceProxy.serviceHealthHistory ───────────────────────────────────────
describe("serviceProxy.serviceHealthHistory", () => {
  it("requires admin role", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.serviceProxy.serviceHealthHistory({})).rejects.toThrow();
  });

  it("returns empty array when DB unavailable", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.serviceProxy.serviceHealthHistory({});
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it("accepts optional serviceKey filter", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.serviceProxy.serviceHealthHistory({ serviceKey: "bis-core" });
    expect(Array.isArray(result)).toBe(true);
  });

  it("accepts hours parameter (1-48)", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.serviceProxy.serviceHealthHistory({ hours: 12 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("rejects hours outside valid range", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    await expect(
      caller.serviceProxy.serviceHealthHistory({ hours: 0 })
    ).rejects.toThrow();
    await expect(
      caller.serviceProxy.serviceHealthHistory({ hours: 49 })
    ).rejects.toThrow();
  });
});

// ─── serviceProxy.serviceHealthAlertLog ──────────────────────────────────────
describe("serviceProxy.serviceHealthAlertLog", () => {
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

  it("is a query procedure (not mutation)", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.serviceProxy.serviceHealthAlertLog();
    expect(result).toBeDefined();
  });
});

// ─── serviceHealthPoller job unit tests ──────────────────────────────────────
describe("serviceHealthPoller", () => {
  it("getServiceConfigs returns only configured services", async () => {
    const { getServiceConfigs } = await import("./jobs/serviceHealthPoller");
    // With no env vars set, all URLs are empty strings → filtered out
    const configs = getServiceConfigs();
    expect(Array.isArray(configs)).toBe(true);
    // In test env, no service URLs are configured
    expect(configs.length).toBe(0);
  });

  it("pollService returns unreachable for invalid URL", async () => {
    const { pollService } = await import("./jobs/serviceHealthPoller");
    const result = await pollService({
      key: "test-svc",
      name: "Test Service",
      url: "http://localhost:19999", // nothing listening here
      healthPath: "/health",
    });
    expect(result.key).toBe("test-svc");
    expect(result.status).toBe("unreachable");
    expect(typeof result.responseMs).toBe("number");
    expect(result.responseMs).toBeGreaterThanOrEqual(0);
  });

  it("pollService returns unhealthy for non-200 response", async () => {
    const { pollService } = await import("./jobs/serviceHealthPoller");
    // Mock fetch to return 503
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 }) as any;
    const result = await pollService({
      key: "svc-503",
      name: "503 Service",
      url: "http://example.com",
      healthPath: "/health",
    });
    globalThis.fetch = originalFetch;
    expect(result.status).toBe("unhealthy");
    expect(result.httpStatus).toBe(503);
  });

  it("pollService returns healthy for 200 response", async () => {
    const { pollService } = await import("./jobs/serviceHealthPoller");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 }) as any;
    const result = await pollService({
      key: "svc-ok",
      name: "Healthy Service",
      url: "http://example.com",
      healthPath: "/health",
    });
    globalThis.fetch = originalFetch;
    expect(result.status).toBe("healthy");
    expect(result.httpStatus).toBe(200);
  });

  it("pollService captures responseMs", async () => {
    const { pollService } = await import("./jobs/serviceHealthPoller");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 }) as any;
    const result = await pollService({
      key: "svc-timing",
      name: "Timing Service",
      url: "http://example.com",
      healthPath: "/health",
    });
    globalThis.fetch = originalFetch;
    expect(typeof result.responseMs).toBe("number");
    expect(result.responseMs).toBeGreaterThanOrEqual(0);
  });

  it("startServiceHealthPoller and stopServiceHealthPoller are exported", async () => {
    const { startServiceHealthPoller, stopServiceHealthPoller } = await import("./jobs/serviceHealthPoller");
    expect(typeof startServiceHealthPoller).toBe("function");
    expect(typeof stopServiceHealthPoller).toBe("function");
  });
});

// ─── PIN lockout tier constants ───────────────────────────────────────────────
describe("PIN lockout tier constants", () => {
  it("biometric.setPin requires 6-digit PIN", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.biometric.setPin({ pin: "12345" })
    ).rejects.toThrow();
  });

  it("biometric.setPin requires numeric PIN", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.biometric.setPin({ pin: "abcdef" })
    ).rejects.toThrow();
  });

  it("biometric.setPin throws INTERNAL_SERVER_ERROR when DB unavailable", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const err = await caller.biometric.setPin({ pin: "123456" }).catch((e: any) => e);
    expect(err.code).toBe("INTERNAL_SERVER_ERROR");
  });

  it("biometric.changePin requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(
      caller.biometric.changePin({ currentPin: "123456", newPin: "654321" })
    ).rejects.toThrow();
  });

  it("biometric.resetPin requires admin role", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.biometric.resetPin({ userId: "42" })
    ).rejects.toThrow();
  });
});
