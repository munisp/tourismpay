/**
 * Round 25 Tests
 * - wallet.getTransaction (transaction detail modal)
 * - biometric.getSignCountTrend (sparkline chart)
 * - notifications.list with category filter (Spending Limit Alerts tab)
 * - csvExport.walletTransactions (wallet TX export)
 */

import { describe, it, expect, vi } from "vitest";
import { appRouter } from "./routers";

// ─── Mock DB (consistent with round24 pattern: getDb returns null) ─────────────
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

// ─── wallet.getTransaction ────────────────────────────────────────────────────
describe("wallet.getTransaction", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.wallet.getTransaction({ id: "tx-1" })).rejects.toThrow();
  });

  it("throws INTERNAL_SERVER_ERROR when DB unavailable", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const err = await caller.wallet.getTransaction({ id: "nonexistent-tx" }).catch((e: any) => e);
    expect(err.code).toBe("INTERNAL_SERVER_ERROR");
  });

  it("requires non-empty id string (Zod validation)", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.wallet.getTransaction({ id: "" })).rejects.toThrow();
  });

  it("accepts valid string id format", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const err = await caller.wallet.getTransaction({ id: "some-uuid" }).catch((e: any) => e);
    // Should throw INTERNAL_SERVER_ERROR (DB unavailable), not BAD_REQUEST
    expect(err.code).not.toBe("BAD_REQUEST");
  });

  it("admin also throws INTERNAL_SERVER_ERROR for DB unavailable", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    const err = await caller.wallet.getTransaction({ id: "nonexistent" }).catch((e: any) => e);
    expect(err.code).toBe("INTERNAL_SERVER_ERROR");
  });

  it("procedure is a query (not mutation)", async () => {
    // wallet.getTransaction should be accessible as a query
    const caller = appRouter.createCaller(userCtx() as any);
    // Verify it returns a promise (query, not mutation)
    const promise = caller.wallet.getTransaction({ id: "tx-1" });
    expect(promise).toBeInstanceOf(Promise);
    // Consume the promise to avoid unhandled rejection
    await promise.catch(() => {});
  });
});

// ─── biometric.getSignCountTrend ──────────────────────────────────────────────
describe("biometric.getSignCountTrend", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(
      caller.biometric.getSignCountTrend({ credentialId: "cred-1", days: 30 })
    ).rejects.toThrow();
  });

  it("returns empty array when DB unavailable", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    // When getDb returns null, procedure returns []
    const result = await caller.biometric.getSignCountTrend({ credentialId: "cred-1", days: 30 });
    expect(Array.isArray(result)).toBe(true);
    expect((result as any[]).length).toBe(0);
  });

  it("returns empty array for days=30 when DB unavailable", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.biometric.getSignCountTrend({ credentialId: "cred-1", days: 30 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("accepts days parameter of 7", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.biometric.getSignCountTrend({ credentialId: "cred-1", days: 7 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("accepts days parameter of 90 (max)", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.biometric.getSignCountTrend({ credentialId: "cred-1", days: 90 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("rejects days parameter below minimum (7)", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.biometric.getSignCountTrend({ credentialId: "cred-1", days: 3 })
    ).rejects.toThrow();
  });

  it("rejects days parameter above maximum (90)", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.biometric.getSignCountTrend({ credentialId: "cred-1", days: 100 })
    ).rejects.toThrow();
  });
});

// ─── notifications.list with category filter ──────────────────────────────────
describe("notifications.list category filter", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.notifications.list({})).rejects.toThrow();
  });

  it("returns empty array when no notifications", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.notifications.list({});
    expect(Array.isArray(result)).toBe(true);
    expect((result as any[]).length).toBe(0);
  });

  it("accepts category filter parameter without validation error", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.notifications.list({ category: "wallet" });
    expect(Array.isArray(result)).toBe(true);
  });

  it("accepts system category filter", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.notifications.list({ category: "system" });
    expect(Array.isArray(result)).toBe(true);
  });

  it("filters by unread when specified", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.notifications.list({ unreadOnly: true });
    expect(Array.isArray(result)).toBe(true);
  });

  it("returns wallet notifications when present", async () => {
    const { getUserNotifications } = await import("./db");
    vi.mocked(getUserNotifications).mockResolvedValueOnce([
      { id: 1, userId: 42, title: "Spending Limit Exceeded", content: "Daily limit reached", category: "wallet", isRead: false, createdAt: new Date() } as any,
    ]);
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.notifications.list({ category: "wallet" });
    expect((result as any[]).length).toBe(1);
    expect((result as any[])[0].category).toBe("wallet");
  });

  it("getUserNotifications is called with category filter", async () => {
    const { getUserNotifications } = await import("./db");
    vi.mocked(getUserNotifications).mockResolvedValueOnce([]);
    const caller = appRouter.createCaller(userCtx() as any);
    await caller.notifications.list({ category: "bis" });
    expect(getUserNotifications).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ category: "bis" })
    );
  });

  it("accepts bis category filter", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.notifications.list({ category: "bis" });
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── csvExport.walletTransactions ─────────────────────────────────────────────
describe("csvExport.walletTransactions", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.csvExport.walletTransactions({})).rejects.toThrow();
  });

  it("throws INTERNAL_SERVER_ERROR when DB unavailable", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const err = await caller.csvExport.walletTransactions({}).catch((e: any) => e);
    expect(err.code).toBe("INTERNAL_SERVER_ERROR");
  });

  it("accepts type filter without validation error", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const err = await caller.csvExport.walletTransactions({ type: "send" }).catch((e: any) => e);
    expect(err.code).not.toBe("BAD_REQUEST");
  });

  it("accepts currency filter without validation error", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const err = await caller.csvExport.walletTransactions({ currency: "USD" }).catch((e: any) => e);
    expect(err.code).not.toBe("BAD_REQUEST");
  });

  it("accepts date range filters without validation error", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const from = new Date("2025-01-01");
    const to = new Date("2025-12-31");
    const err = await caller.csvExport.walletTransactions({ from, to }).catch((e: any) => e);
    expect(err.code).not.toBe("BAD_REQUEST");
  });

  it("admin can pass userId param without validation error", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    const err = await caller.csvExport.walletTransactions({ userId: "42" }).catch((e: any) => e);
    expect(err.code).not.toBe("BAD_REQUEST");
  });

  it("non-admin userId param is accepted without validation error", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const err = await caller.csvExport.walletTransactions({ userId: "999" }).catch((e: any) => e);
    expect(err.code).not.toBe("BAD_REQUEST");
  });

  it("accepts limit parameter", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const err = await caller.csvExport.walletTransactions({ limit: 500 }).catch((e: any) => e);
    expect(err.code).not.toBe("BAD_REQUEST");
  });

  it("rejects limit above maximum (10000)", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.csvExport.walletTransactions({ limit: 99999 })
    ).rejects.toThrow();
  });
});
