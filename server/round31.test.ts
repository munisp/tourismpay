/**
 * Round 31 Tests
 * - BIS timeline event filtering: getTimeline accepts eventType and severity filters (numeric investigationId)
 * - wallet.updateBalanceAlert: inline threshold editing
 * - loyalty.redeem: stock depletion guard, out-of-stock error, inactive reward error
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

// ─── BIS timeline filtering: getTimeline ─────────────────────────────────────
describe("BIS timeline filtering: bis.getTimeline", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(
      caller.bis.getTimeline({ investigationId: 1 })
    ).rejects.toThrow();
  });

  it("returns empty events object when DB unavailable", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.bis.getTimeline({ investigationId: 1 });
    expect(result).toHaveProperty("events");
    expect(Array.isArray((result as any).events)).toBe(true);
    expect((result as any).events.length).toBe(0);
  });

  it("accepts optional eventType=note filter without error", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.bis.getTimeline({
      investigationId: 1,
      eventType: "note",
    });
    expect(result).toHaveProperty("events");
    expect(Array.isArray((result as any).events)).toBe(true);
  });

  it("accepts optional eventType=status_change filter without error", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.bis.getTimeline({
      investigationId: 1,
      eventType: "status_change",
    });
    expect(result).toHaveProperty("events");
  });

  it("accepts optional severity=info filter without error", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.bis.getTimeline({
      investigationId: 1,
      severity: "info",
    });
    expect(result).toHaveProperty("events");
    expect(Array.isArray((result as any).events)).toBe(true);
  });

  it("accepts optional severity=critical filter without error", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.bis.getTimeline({
      investigationId: 1,
      severity: "critical",
    });
    expect(result).toHaveProperty("events");
  });

  it("accepts both eventType and severity filters together", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.bis.getTimeline({
      investigationId: 1,
      eventType: "status_change",
      severity: "critical",
    });
    expect(result).toHaveProperty("events");
    expect(Array.isArray((result as any).events)).toBe(true);
  });

  it("rejects invalid eventType", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.bis.getTimeline({
        investigationId: 1,
        eventType: "invalid_type" as any,
      })
    ).rejects.toThrow();
  });

  it("rejects invalid severity", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.bis.getTimeline({
        investigationId: 1,
        severity: "extreme" as any,
      })
    ).rejects.toThrow();
  });

  it("rejects non-positive investigationId", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.bis.getTimeline({ investigationId: 0 })
    ).rejects.toThrow();
  });

  it("rejects negative investigationId", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.bis.getTimeline({ investigationId: -5 })
    ).rejects.toThrow();
  });
});

// ─── wallet.updateBalanceAlert ────────────────────────────────────────────────
describe("wallet.updateBalanceAlert", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(
      caller.wallet.updateBalanceAlert({ id: "alert-1", threshold: 100 })
    ).rejects.toThrow();
  });

  it("throws when DB unavailable", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.wallet.updateBalanceAlert({ id: "alert-1", threshold: 100 })
    ).rejects.toThrow(/unavailable/i);
  });

  it("rejects non-positive threshold", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.wallet.updateBalanceAlert({ id: "alert-1", threshold: -50 })
    ).rejects.toThrow();
  });

  it("rejects zero threshold", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.wallet.updateBalanceAlert({ id: "alert-1", threshold: 0 })
    ).rejects.toThrow();
  });

  it("rejects empty id", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.wallet.updateBalanceAlert({ id: "", threshold: 100 })
    ).rejects.toThrow();
  });

  it("returns { updated: true } when DB is available", async () => {
    const { getDb } = await import("./db");
    const mockUpdate = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({ rowCount: 1 }),
      }),
    });
    vi.mocked(getDb).mockResolvedValueOnce({
      update: mockUpdate,
    } as any);
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.updateBalanceAlert({ id: "alert-uuid-123", threshold: 250 });
    expect(result).toEqual({ updated: true });
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("accepts decimal threshold values", async () => {
    const { getDb } = await import("./db");
    const mockUpdate = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({ rowCount: 1 }),
      }),
    });
    vi.mocked(getDb).mockResolvedValueOnce({
      update: mockUpdate,
    } as any);
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.updateBalanceAlert({ id: "alert-uuid-456", threshold: 0.001 });
    expect(result).toEqual({ updated: true });
  });
});

// ─── loyalty.redeem: stock depletion ─────────────────────────────────────────
describe("loyalty.redeem: stock depletion", () => {
  beforeEach(async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockReset();
    vi.mocked(getDb).mockResolvedValue(null);
  });

  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(
      caller.loyalty.redeem({
        rewardId: "r1",
        rewardName: "Free Hotel Night",
        pointsCost: 5000,
        partner: "Sheraton Lagos",
      })
    ).rejects.toThrow();
  });

  it("throws when DB unavailable", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.loyalty.redeem({
        rewardId: "r1",
        rewardName: "Free Hotel Night",
        pointsCost: 5000,
        partner: "Sheraton Lagos",
      })
    ).rejects.toThrow(/unavailable/i);
  });

  it("rejects non-positive pointsCost", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.loyalty.redeem({
        rewardId: "r1",
        rewardName: "Free Hotel Night",
        pointsCost: -100,
        partner: "Sheraton Lagos",
      })
    ).rejects.toThrow();
  });

  it("throws BAD_REQUEST when insufficient points", async () => {
    const { getDb } = await import("./db");
    // redeem calls getDb() once, then ensureAccount calls getDb() again
    // Both calls must return a db with execute that returns low balance
    const mockDb = {
      execute: vi.fn().mockResolvedValue([{ points_balance: 1000, tier: "BRONZE", lifetime_points: 1000 }]),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.loyalty.redeem({
        rewardId: "r1",
        rewardName: "Free Hotel Night",
        pointsCost: 5000,
        partner: "Sheraton Lagos",
      })
    ).rejects.toThrow(/insufficient points/i);
  });

  it("throws BAD_REQUEST when reward is out of stock (stock = 0)", async () => {
    const { getDb } = await import("./db");
    // Both getDb calls (redeem + ensureAccount) return the same db instance
    const mockDb = {
      execute: vi.fn().mockResolvedValue([{ points_balance: 10000, tier: "GOLD", lifetime_points: 25000 }]),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: "r1", stock: 0, isActive: true }]),
          }),
        }),
      }),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.loyalty.redeem({
        rewardId: "r1",
        rewardName: "Free Hotel Night",
        pointsCost: 5000,
        partner: "Sheraton Lagos",
      })
    ).rejects.toThrow(/out of stock/i);
  });

  it("throws BAD_REQUEST when reward is inactive", async () => {
    const { getDb } = await import("./db");
    const mockDb = {
      execute: vi.fn().mockResolvedValue([{ points_balance: 10000, tier: "GOLD", lifetime_points: 25000 }]),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: "r1", stock: 10, isActive: false }]),
          }),
        }),
      }),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.loyalty.redeem({
        rewardId: "r1",
        rewardName: "Free Hotel Night",
        pointsCost: 5000,
        partner: "Sheraton Lagos",
      })
    ).rejects.toThrow(/no longer available/i);
  });
});

// ─── BIS addTimelineEvent: input validation ───────────────────────────────────
describe("BIS addTimelineEvent: input validation", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(
      caller.bis.addTimelineEvent({
        investigationId: 1,
        eventType: "note",
        title: "Test note",
      })
    ).rejects.toThrow();
  });

  it("rejects non-positive investigationId", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.bis.addTimelineEvent({
        investigationId: 0,
        eventType: "note",
        title: "Test note",
      })
    ).rejects.toThrow();
  });

  it("rejects invalid eventType", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.bis.addTimelineEvent({
        investigationId: 1,
        eventType: "invalid" as any,
        title: "Test note",
      })
    ).rejects.toThrow();
  });

  it("rejects empty title", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.bis.addTimelineEvent({
        investigationId: 1,
        eventType: "note",
        title: "",
      })
    ).rejects.toThrow();
  });

  it("throws when investigation not found (DB returns empty)", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.bis.addTimelineEvent({
        investigationId: 999,
        eventType: "note",
        title: "Test note",
      })
    ).rejects.toThrow();
  });
});

// ─── wallet.deleteBalanceAlert ────────────────────────────────────────────────
describe("wallet.deleteBalanceAlert", () => {
  beforeEach(async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockReset();
    vi.mocked(getDb).mockResolvedValue(null);
  });

  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(
      caller.wallet.deleteBalanceAlert({ id: "alert-1" })
    ).rejects.toThrow();
  });

  it("throws when DB unavailable", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.wallet.deleteBalanceAlert({ id: "alert-1" })
    ).rejects.toThrow(/unavailable/i);
  });

  it("rejects empty id", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.wallet.deleteBalanceAlert({ id: "" })
    ).rejects.toThrow();
  });

  it("returns { deleted: true } when DB is available", async () => {
    const { getDb } = await import("./db");
    const mockDelete = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue({ rowCount: 1 }),
    });
    vi.mocked(getDb).mockResolvedValueOnce({
      delete: mockDelete,
    } as any);
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.deleteBalanceAlert({ id: "alert-uuid-456" });
    expect(result).toEqual({ deleted: true });
    expect(mockDelete).toHaveBeenCalled();
  });
});
