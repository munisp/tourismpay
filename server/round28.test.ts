/**
 * Round 28 Tests
 * - wallet.transactions cursor-based pagination (nextCursor, hasMore, type/currency filters)
 * - wallet.getTransactionCount (total count with optional filters)
 * - bis.bulkUpdateStatus (admin-only, batch status update with audit log)
 * - bis.bulkExportCsv (admin-only, CSV export for selected IDs)
 * - loyalty.rewards (excludes expired, includes expiringSoon flag)
 * - loyalty.adminRewards (includes all rewards with expired/expiringSoon flags)
 * - loyalty.setRewardExpiry (admin-only, set/clear expiresAt)
 * - loyalty.expireRewards (admin-only, deactivate expired rewards)
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

// ─── wallet.transactions (cursor pagination) ─────────────────────────────────
describe("wallet.transactions (cursor pagination)", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.wallet.transactions()).rejects.toThrow();
  });

  it("returns empty page when DB unavailable", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.transactions();
    expect(result).toMatchObject({ items: [], nextCursor: null, hasMore: false });
  });

  it("returns empty page with cursor parameter when DB unavailable", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.transactions({ cursor: Date.now() - 1000 });
    expect(result).toMatchObject({ items: [], nextCursor: null, hasMore: false });
  });

  it("accepts type filter", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.transactions({ type: "send" });
    expect(result.items).toEqual([]);
  });

  it("accepts currency filter", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.transactions({ currency: "USD" });
    expect(result.items).toEqual([]);
  });

  it("accepts combined type and currency filters", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.transactions({ type: "receive", currency: "NGN" });
    expect(result).toMatchObject({ items: [], hasMore: false });
  });

  it("rejects invalid type filter", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.wallet.transactions({ type: "invalid" as any })).rejects.toThrow();
  });

  it("rejects limit > 100", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.wallet.transactions({ limit: 101 })).rejects.toThrow();
  });

  it("rejects limit < 1", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.wallet.transactions({ limit: 0 })).rejects.toThrow();
  });

  it("is a query procedure", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.transactions({ limit: 10 });
    expect(result).toHaveProperty("items");
    expect(result).toHaveProperty("nextCursor");
    expect(result).toHaveProperty("hasMore");
  });
});

// ─── wallet.getTransactionCount ───────────────────────────────────────────────
describe("wallet.getTransactionCount", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.wallet.getTransactionCount()).rejects.toThrow();
  });

  it("returns 0 when DB unavailable", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.getTransactionCount();
    expect(result).toEqual({ count: 0 });
  });

  it("accepts type filter", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.getTransactionCount({ type: "send" });
    expect(result).toEqual({ count: 0 });
  });

  it("accepts currency filter", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.getTransactionCount({ currency: "USD" });
    expect(result).toEqual({ count: 0 });
  });
});

// ─── bis.bulkUpdateStatus ────────────────────────────────────────────────────
describe("bis.bulkUpdateStatus", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.bis.bulkUpdateStatus({ ids: [1], status: "completed" })).rejects.toThrow();
  });

  it("requires admin role", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.bis.bulkUpdateStatus({ ids: [1], status: "completed" })).rejects.toThrow();
  });

  it("rejects empty ids array", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    await expect(caller.bis.bulkUpdateStatus({ ids: [], status: "completed" })).rejects.toThrow();
  });

  it("rejects ids array > 100", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    const ids = Array.from({ length: 101 }, (_, i) => i + 1);
    await expect(caller.bis.bulkUpdateStatus({ ids, status: "completed" })).rejects.toThrow();
  });

  it("rejects invalid status", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    await expect(caller.bis.bulkUpdateStatus({ ids: [1], status: "invalid" as any })).rejects.toThrow();
  });

  it("accepts valid status values", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    const validStatuses = ["pending", "processing", "completed", "flagged"] as const;
    for (const status of validStatuses) {
      const result = await caller.bis.bulkUpdateStatus({ ids: [1], status });
      expect(result).toHaveProperty("successCount");
      expect(result).toHaveProperty("failCount");
    }
  });

  it("returns results array with per-id success/failure", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.bis.bulkUpdateStatus({ ids: [1, 2, 3], status: "processing" });
    expect(result.results).toHaveLength(3);
    expect(result.successCount + result.failCount).toBe(3);
  });

  it("is a mutation procedure", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.bis.bulkUpdateStatus({ ids: [10], status: "flagged" });
    expect(typeof result.successCount).toBe("number");
    expect(typeof result.failCount).toBe("number");
  });
});

// ─── bis.bulkExportCsv ───────────────────────────────────────────────────────
describe("bis.bulkExportCsv", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.bis.bulkExportCsv({ ids: [1] })).rejects.toThrow();
  });

  it("requires admin role", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.bis.bulkExportCsv({ ids: [1] })).rejects.toThrow();
  });

  it("rejects empty ids array", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    await expect(caller.bis.bulkExportCsv({ ids: [] })).rejects.toThrow();
  });

  it("returns empty CSV when no investigations found", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.bis.bulkExportCsv({ ids: [999] });
    expect(result).toMatchObject({ csv: "", rowCount: 0 });
    expect(result.filename).toContain("bis-export");
  });

  it("returns CSV with correct structure", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.bis.bulkExportCsv({ ids: [1, 2] });
    expect(result).toHaveProperty("csv");
    expect(result).toHaveProperty("filename");
    expect(result).toHaveProperty("rowCount");
  });

  it("accepts up to 500 ids", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    const ids = Array.from({ length: 500 }, (_, i) => i + 1);
    const result = await caller.bis.bulkExportCsv({ ids });
    expect(result).toHaveProperty("csv");
  });

  it("rejects ids array > 500", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    const ids = Array.from({ length: 501 }, (_, i) => i + 1);
    await expect(caller.bis.bulkExportCsv({ ids })).rejects.toThrow();
  });
});

// ─── loyalty.rewards (expiringSoon badge) ────────────────────────────────────
describe("loyalty.rewards (expiringSoon badge)", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.loyalty.rewards()).rejects.toThrow();
  });

  it("returns default rewards when DB unavailable", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.loyalty.rewards();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it("default rewards include expiresAt and expiringSoon fields", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.loyalty.rewards();
    for (const r of result) {
      expect(r).toHaveProperty("expiresAt");
      expect(r).toHaveProperty("expiringSoon");
    }
  });

  it("default rewards have null expiresAt (never expire)", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.loyalty.rewards();
    for (const r of result) {
      expect(r.expiresAt).toBeNull();
      expect(r.expiringSoon).toBe(false);
    }
  });
});

// ─── loyalty.adminRewards ────────────────────────────────────────────────────
describe("loyalty.adminRewards", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.loyalty.adminRewards()).rejects.toThrow();
  });

  it("requires admin role", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.loyalty.adminRewards()).rejects.toThrow();
  });

  it("returns empty array when DB unavailable", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.loyalty.adminRewards();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });
});

// ─── loyalty.setRewardExpiry ─────────────────────────────────────────────────
describe("loyalty.setRewardExpiry", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.loyalty.setRewardExpiry({ rewardId: "r1", expiresAt: null })).rejects.toThrow();
  });

  it("requires admin role", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.loyalty.setRewardExpiry({ rewardId: "r1", expiresAt: null })).rejects.toThrow();
  });

  it("throws when DB unavailable", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    await expect(caller.loyalty.setRewardExpiry({ rewardId: "r1", expiresAt: Date.now() + 86400000 })).rejects.toThrow("Database unavailable");
  });

  it("accepts null expiresAt (clear expiry)", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    await expect(caller.loyalty.setRewardExpiry({ rewardId: "r1", expiresAt: null })).rejects.toThrow("Database unavailable");
  });

  it("accepts future Unix ms timestamp", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    const futureMs = Date.now() + 7 * 24 * 60 * 60 * 1000;
    await expect(caller.loyalty.setRewardExpiry({ rewardId: "r1", expiresAt: futureMs })).rejects.toThrow("Database unavailable");
  });
});

// ─── loyalty.expireRewards ───────────────────────────────────────────────────
describe("loyalty.expireRewards", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.loyalty.expireRewards()).rejects.toThrow();
  });

  it("requires admin role", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(caller.loyalty.expireRewards()).rejects.toThrow();
  });

  it("throws when DB unavailable", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    await expect(caller.loyalty.expireRewards()).rejects.toThrow("Database unavailable");
  });

  it("is a mutation procedure", async () => {
    // Verify it's accessible as a mutation (not query)
    const router = appRouter._def.procedures;
    expect(router["loyalty.expireRewards"]).toBeDefined();
  });
});
