/**
 * Round 20 Tests — PIN Fallback, Spending Limit Usage Indicators, Biometric Audit Events
 * Tests for:
 *   - biometric.setPin (validates 6-digit PIN, throws when DB unavailable)
 *   - biometric.verifyPin (validates input, throws when DB unavailable)
 *   - wallet.getSpendingLimits (returns empty array when DB unavailable)
 *   - wallet.setSpendingLimit (validates period enum, throws when DB unavailable)
 *   - wallet.toggleSpendingLimit (throws when DB unavailable)
 *   - wallet.deleteSpendingLimit (throws when DB unavailable)
 *   - auditLogs.list (filters by biometric action types)
 *   - auditLogs.stats (returns correct shape)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import { _highValueTokens } from "./routers/biometric";
import type { TrpcContext } from "./_core/context";

// ─── Mock the database layer ──────────────────────────────────────────────────
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
  createUserNotification: vi.fn().mockResolvedValue(true),
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  getAuditLogs: vi.fn().mockResolvedValue([]),
  getAuditLogStats: vi.fn().mockResolvedValue({ total: 0, today: 0, byAction: [] }),
  getSidebarBadgeCounts: vi.fn().mockResolvedValue({ pendingKybApplications: 0, pendingBisInvestigations: 0 }),
  getBisInvestigations: vi.fn().mockResolvedValue([]),
  getBisInvestigationById: vi.fn().mockResolvedValue(null),
}));

vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

// ─── Context helpers ──────────────────────────────────────────────────────────
type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function makeCtx(role: "admin" | "user" = "user", id = 1): TrpcContext {
  const user: AuthenticatedUser = {
    id,
    openId: `${role}-user-${id}`,
    email: `${role}${id}@example.com`,
    name: `${role === "admin" ? "Admin" : "Test"} User`,
    loginMethod: "manus",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function makeUnauthCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── biometric.setPin ─────────────────────────────────────────────────────────
describe("biometric.setPin", () => {
  it("rejects unauthenticated requests", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(
      caller.biometric.setPin({ pin: "123456" })
    ).rejects.toThrow();
  });

  it("rejects PIN shorter than 6 digits", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.biometric.setPin({ pin: "12345" })
    ).rejects.toThrow();
  });

  it("rejects PIN longer than 6 digits", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.biometric.setPin({ pin: "1234567" })
    ).rejects.toThrow();
  });

  it("rejects non-numeric PIN", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.biometric.setPin({ pin: "abc123" })
    ).rejects.toThrow();
  });

  it("throws INTERNAL_SERVER_ERROR when DB unavailable", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.biometric.setPin({ pin: "123456" })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("allows admin users to set PIN", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    await expect(
      caller.biometric.setPin({ pin: "654321" })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" }); // DB unavailable, not auth error
  });
});

// ─── biometric.verifyPin ──────────────────────────────────────────────────────
describe("biometric.verifyPin", () => {
  beforeEach(() => {
    _highValueTokens.clear();
  });

  it("rejects unauthenticated requests", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(
      caller.biometric.verifyPin({ pin: "123456", amount: 1500, currency: "USDC" })
    ).rejects.toThrow();
  });

  it("rejects PIN shorter than 6 digits", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.biometric.verifyPin({ pin: "12345", amount: 1500, currency: "USDC" })
    ).rejects.toThrow();
  });

  it("rejects zero amount", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.biometric.verifyPin({ pin: "123456", amount: 0, currency: "USDC" })
    ).rejects.toThrow();
  });

  it("rejects negative amount", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.biometric.verifyPin({ pin: "123456", amount: -100, currency: "USDC" })
    ).rejects.toThrow();
  });

  it("rejects empty currency", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.biometric.verifyPin({ pin: "123456", amount: 1500, currency: "" })
    ).rejects.toThrow();
  });

  it("throws INTERNAL_SERVER_ERROR when DB unavailable", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.biometric.verifyPin({ pin: "123456", amount: 1500, currency: "USDC" })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});

// ─── wallet.getSpendingLimits ─────────────────────────────────────────────────
describe("wallet.getSpendingLimits", () => {
  it("rejects unauthenticated requests", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(caller.wallet.getSpendingLimits()).rejects.toThrow();
  });

  it("returns empty array when DB unavailable", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.wallet.getSpendingLimits();
    expect(result).toEqual([]);
  });
});

// ─── wallet.setSpendingLimit ──────────────────────────────────────────────────
describe("wallet.setSpendingLimit", () => {
  it("rejects unauthenticated requests", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(
      caller.wallet.setSpendingLimit({ currency: "USDC", period: "daily", limitAmount: 500 })
    ).rejects.toThrow();
  });

  it("rejects invalid period value", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.wallet.setSpendingLimit({ currency: "USDC", period: "weekly" as any, limitAmount: 500 })
    ).rejects.toThrow();
  });

  it("rejects zero limitAmount", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.wallet.setSpendingLimit({ currency: "USDC", period: "daily", limitAmount: 0 })
    ).rejects.toThrow();
  });

  it("rejects negative limitAmount", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.wallet.setSpendingLimit({ currency: "USDC", period: "daily", limitAmount: -100 })
    ).rejects.toThrow();
  });

  it("throws INTERNAL_SERVER_ERROR when DB unavailable", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.wallet.setSpendingLimit({ currency: "USDC", period: "daily", limitAmount: 500 })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("accepts monthly period", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.wallet.setSpendingLimit({ currency: "USDC", period: "monthly", limitAmount: 5000 })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" }); // DB unavailable, not validation error
  });
});

// ─── wallet.toggleSpendingLimit ───────────────────────────────────────────────
describe("wallet.toggleSpendingLimit", () => {
  it("rejects unauthenticated requests", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(
      caller.wallet.toggleSpendingLimit({ id: "limit-1", isActive: false })
    ).rejects.toThrow();
  });

  it("throws INTERNAL_SERVER_ERROR when DB unavailable", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.wallet.toggleSpendingLimit({ id: "limit-1", isActive: false })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});

// ─── wallet.deleteSpendingLimit ───────────────────────────────────────────────
describe("wallet.deleteSpendingLimit", () => {
  it("rejects unauthenticated requests", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(
      caller.wallet.deleteSpendingLimit({ id: "limit-1" })
    ).rejects.toThrow();
  });

  it("throws INTERNAL_SERVER_ERROR when DB unavailable", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.wallet.deleteSpendingLimit({ id: "limit-1" })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});

// ─── auditLogs.list — biometric action filter ─────────────────────────────────
describe("auditLogs.list — biometric action filter", () => {
  it("rejects unauthenticated requests", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(caller.auditLogs.list({ limit: 10, offset: 0 })).rejects.toThrow();
  });

  it("rejects non-admin users", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(caller.auditLogs.list({ limit: 10, offset: 0 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("allows filtering by biometric.highValueToken.issued action", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.auditLogs.list({
      action: "biometric.highValueToken.issued",
      limit: 10,
      offset: 0,
    });
    expect(Array.isArray(result)).toBe(true);
  });

  it("allows filtering by biometric.highValueToken.verified action", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.auditLogs.list({
      action: "biometric.highValueToken.verified",
      limit: 10,
      offset: 0,
    });
    expect(Array.isArray(result)).toBe(true);
  });

  it("allows filtering by biometric.enrolled action", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.auditLogs.list({
      action: "biometric.enrolled",
      limit: 10,
      offset: 0,
    });
    expect(Array.isArray(result)).toBe(true);
  });

  it("allows filtering by biometric.pinSet action", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.auditLogs.list({
      action: "biometric.pinSet",
      limit: 10,
      offset: 0,
    });
    expect(Array.isArray(result)).toBe(true);
  });

  it("allows filtering by biometric_token entity type", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.auditLogs.list({
      entityType: "biometric_token",
      limit: 10,
      offset: 0,
    });
    expect(Array.isArray(result)).toBe(true);
  });

  it("allows filtering by biometric_enrollment entity type", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.auditLogs.list({
      entityType: "biometric_enrollment",
      limit: 10,
      offset: 0,
    });
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── auditLogs.stats ──────────────────────────────────────────────────────────
describe("auditLogs.stats", () => {
  it("rejects unauthenticated requests", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(caller.auditLogs.stats()).rejects.toThrow();
  });

  it("rejects non-admin users", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(caller.auditLogs.stats()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns correct shape for admin", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.auditLogs.stats();
    expect(result).toHaveProperty("total");
    expect(result).toHaveProperty("today");
    expect(result).toHaveProperty("byAction");
    expect(Array.isArray(result.byAction)).toBe(true);
  });
});
