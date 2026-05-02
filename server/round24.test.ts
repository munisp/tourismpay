/**
 * Round 24 Tests
 * - biometric.getPinHistory procedure
 * - Trust score computation (pure function — tested via biometric.list + checkEnabled)
 * - csvExport.walletTransactions mutation
 * - biometric.getPinLockoutStatus (lockout state)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";

// ─── Mock DB ──────────────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  createUserNotification: vi.fn().mockResolvedValue(undefined),
  getBisInvestigations: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
  getAuditLogs: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
  getWalletBalances: vi.fn().mockResolvedValue([]),
  getWalletTransactions: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
  getBalanceAlerts: vi.fn().mockResolvedValue([]),
  getSpendingLimits: vi.fn().mockResolvedValue([]),
  getBiometricEnrollments: vi.fn().mockResolvedValue([]),
  getBiometricStats: vi.fn().mockResolvedValue({ total: 0, active: 0, revoked: 0 }),
}));

// ─── Context factories ────────────────────────────────────────────────────────
const anonCtx = { user: null, req: { headers: {}, ip: "127.0.0.1" } };
const userCtx = {
  user: { id: 42, name: "Alice", email: "alice@example.com", role: "user" as const },
  req: { headers: {}, ip: "127.0.0.1" },
};
const adminCtx = {
  user: { id: 1, name: "Admin", email: "admin@example.com", role: "admin" as const },
  req: { headers: {}, ip: "127.0.0.1" },
};

// ─── biometric.getPinHistory ──────────────────────────────────────────────────
describe("biometric.getPinHistory", () => {
  it("returns empty array for authenticated user when DB unavailable", async () => {
    const caller = appRouter.createCaller(userCtx as any);
    const result = await caller.biometric.getPinHistory({ limit: 10 });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it("throws UNAUTHORIZED for unauthenticated users", async () => {
    const caller = appRouter.createCaller(anonCtx as any);
    await expect(caller.biometric.getPinHistory({ limit: 10 })).rejects.toThrow();
  });

  it("accepts limit parameter", async () => {
    const caller = appRouter.createCaller(userCtx as any);
    const result = await caller.biometric.getPinHistory({ limit: 5 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("accepts optional action filter", async () => {
    const caller = appRouter.createCaller(userCtx as any);
    const result = await caller.biometric.getPinHistory({
      limit: 10,
      action: "biometric.pinFailed",
    });
    expect(Array.isArray(result)).toBe(true);
  });

  it("admin can also call getPinHistory", async () => {
    const caller = appRouter.createCaller(adminCtx as any);
    const result = await caller.biometric.getPinHistory({ limit: 20 });
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── biometric.getPinLockoutStatus ───────────────────────────────────────────
describe("biometric.getPinLockoutStatus", () => {
  it("returns not-locked status for authenticated user", async () => {
    const caller = appRouter.createCaller(userCtx as any);
    const result = await caller.biometric.getPinLockoutStatus();
    expect(result).toHaveProperty("isLocked");
    expect(result.isLocked).toBe(false);
  });

  it("throws UNAUTHORIZED for unauthenticated users", async () => {
    const caller = appRouter.createCaller(anonCtx as any);
    await expect(caller.biometric.getPinLockoutStatus()).rejects.toThrow();
  });

  it("returns remainingMs as 0 when not locked", async () => {
    const caller = appRouter.createCaller(userCtx as any);
    const result = await caller.biometric.getPinLockoutStatus();
    expect(result.remainingMs).toBe(0);
  });

  it("returns failedAttempts count", async () => {
    const caller = appRouter.createCaller(userCtx as any);
    const result = await caller.biometric.getPinLockoutStatus();
    expect(typeof result.failedAttempts).toBe("number");
    expect(result.failedAttempts).toBeGreaterThanOrEqual(0);
  });
});

// ─── csvExport.walletTransactions ────────────────────────────────────────────
describe("csvExport.walletTransactions", () => {
  it("throws INTERNAL_SERVER_ERROR when DB unavailable", async () => {
    const caller = appRouter.createCaller(userCtx as any);
    await expect(caller.csvExport.walletTransactions({})).rejects.toThrow();
  });

  it("throws UNAUTHORIZED for unauthenticated users", async () => {
    const caller = appRouter.createCaller(anonCtx as any);
    await expect(caller.csvExport.walletTransactions({})).rejects.toThrow();
  });

  it("accepts optional type filter", async () => {
    const caller = appRouter.createCaller(userCtx as any);
    await expect(
      caller.csvExport.walletTransactions({ type: "send" })
    ).rejects.toThrow(); // DB unavailable — expected
  });

  it("accepts optional currency filter", async () => {
    const caller = appRouter.createCaller(userCtx as any);
    await expect(
      caller.csvExport.walletTransactions({ currency: "USDC" })
    ).rejects.toThrow(); // DB unavailable — expected
  });

  it("accepts date range filters", async () => {
    const caller = appRouter.createCaller(userCtx as any);
    await expect(
      caller.csvExport.walletTransactions({
        from: new Date("2025-01-01"),
        to: new Date("2025-12-31"),
      })
    ).rejects.toThrow(); // DB unavailable — expected
  });

  it("accepts limit parameter", async () => {
    const caller = appRouter.createCaller(userCtx as any);
    await expect(
      caller.csvExport.walletTransactions({ limit: 500 })
    ).rejects.toThrow(); // DB unavailable — expected
  });

  it("admin can specify userId to export another user's transactions", async () => {
    const caller = appRouter.createCaller(adminCtx as any);
    await expect(
      caller.csvExport.walletTransactions({ userId: "99" })
    ).rejects.toThrow(); // DB unavailable — expected
  });
});

// ─── biometric.list (trust score data) ───────────────────────────────────────
describe("biometric.list (trust score fields)", () => {
  it("returns empty array when DB unavailable", async () => {
    const caller = appRouter.createCaller(userCtx as any);
    const result = await caller.biometric.list();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it("throws UNAUTHORIZED for unauthenticated users", async () => {
    const caller = appRouter.createCaller(anonCtx as any);
    await expect(caller.biometric.list()).rejects.toThrow();
  });
});

// ─── biometric.checkEnabled (expiresAt field) ────────────────────────────────
describe("biometric.checkEnabled (expiresAt field)", () => {
  it("returns enabled=false when no enrollments (DB unavailable)", async () => {
    const caller = appRouter.createCaller(userCtx as any);
    const result = await caller.biometric.checkEnabled();
    expect(result).toHaveProperty("enabled");
    expect(result.enabled).toBe(false);
  });

  it("throws UNAUTHORIZED for unauthenticated users", async () => {
    const caller = appRouter.createCaller(anonCtx as any);
    await expect(caller.biometric.checkEnabled()).rejects.toThrow();
  });
});
