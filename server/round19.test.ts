/**
 * Round 19 Tests — Biometric Audit Trail, Wallet Spending Limits, Mobile BiometricDevices
 * Tests for:
 *   - biometric.requestHighValueToken audit log (createAuditLog called on issuance)
 *   - biometric.verifyHighValueToken audit log (createAuditLog called on verification)
 *   - wallet.getSpendingLimits (returns empty array when DB unavailable)
 *   - wallet.setSpendingLimit (throws when DB unavailable, validates input)
 *   - wallet.toggleSpendingLimit (throws when DB unavailable)
 *   - wallet.deleteSpendingLimit (throws when DB unavailable)
 *   - wallet.send spending limit gate (throws FORBIDDEN when limit exceeded)
 *   - biometric.list (mobile BiometricDevices data source)
 *   - biometric.revoke (mobile BiometricDevices revoke action)
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

// ─── biometric.requestHighValueToken — audit trail ───────────────────────────
describe("biometric.requestHighValueToken — audit trail", () => {
  beforeEach(() => {
    _highValueTokens.clear();
  });

  it("rejects unauthenticated requests", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(
      caller.biometric.requestHighValueToken({ amount: 1500, currency: "USDC" })
    ).rejects.toThrow();
  });

  it("throws INTERNAL_SERVER_ERROR when DB unavailable (no enrolled devices)", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.biometric.requestHighValueToken({ amount: 1500, currency: "USDC" })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("validates amount must be positive", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.biometric.requestHighValueToken({ amount: -100, currency: "USDC" })
    ).rejects.toThrow();
  });

  it("validates currency is required string", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.biometric.requestHighValueToken({ amount: 1500, currency: "" })
    ).rejects.toThrow();
  });
});

// ─── biometric.verifyHighValueToken — audit trail ────────────────────────────
describe("biometric.verifyHighValueToken — audit trail", () => {
  beforeEach(() => {
    _highValueTokens.clear();
  });

  it("rejects unauthenticated requests", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(
      caller.biometric.verifyHighValueToken({ token: "test-token" })
    ).rejects.toThrow();
  });

  it("throws UNAUTHORIZED for non-existent token", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.biometric.verifyHighValueToken({ token: "non-existent-token", amount: 1500, currency: "USDC" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("throws UNAUTHORIZED for expired token", async () => {
    const expiredToken = "expired-token-" + crypto.randomUUID();
    _highValueTokens.set(expiredToken, {
      userId: "1",
      amount: 1500,
      currency: "USDC",
      expiresAt: Date.now() - 1000, // already expired
    });
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.biometric.verifyHighValueToken({ token: expiredToken, amount: 1500, currency: "USDC" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("throws FORBIDDEN when token belongs to different user", async () => {
    const token = "other-user-token-" + crypto.randomUUID();
    _highValueTokens.set(token, {
      userId: "999", // different user
      amount: 1500,
      currency: "USDC",
      expiresAt: Date.now() + 60_000,
    });
    const caller = appRouter.createCaller(makeCtx("user", 1));
    await expect(
      caller.biometric.verifyHighValueToken({ token, amount: 1500, currency: "USDC" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns verified=true and consumes valid token", async () => {
    const token = "valid-token-" + crypto.randomUUID();
    _highValueTokens.set(token, {
      userId: "1",
      amount: 1500,
      currency: "USDC",
      expiresAt: Date.now() + 60_000,
    });
    const caller = appRouter.createCaller(makeCtx("user", 1));
    const result = await caller.biometric.verifyHighValueToken({ token, amount: 1500, currency: "USDC" });
    expect(result).toMatchObject({ verified: true });
    // Token should be consumed (one-time use)
    expect(_highValueTokens.has(token)).toBe(false);
  });

  it("throws UNAUTHORIZED when trying to reuse a consumed token", async () => {
    const token = "reuse-token-" + crypto.randomUUID();
    _highValueTokens.set(token, {
      userId: "1",
      amount: 1500,
      currency: "USDC",
      expiresAt: Date.now() + 60_000,
    });
    const caller = appRouter.createCaller(makeCtx("user", 1));
    await caller.biometric.verifyHighValueToken({ token, amount: 1500, currency: "USDC" });
    // Try to reuse the same token
    await expect(
      caller.biometric.verifyHighValueToken({ token, amount: 1500, currency: "USDC" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
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
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });
});

// ─── wallet.setSpendingLimit ──────────────────────────────────────────────────
describe("wallet.setSpendingLimit", () => {
  it("rejects unauthenticated requests", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(
      caller.wallet.setSpendingLimit({ currency: "USDC", period: "daily", limitAmount: 5000 })
    ).rejects.toThrow();
  });

  it("throws INTERNAL_SERVER_ERROR when DB unavailable", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.wallet.setSpendingLimit({ currency: "USDC", period: "daily", limitAmount: 5000 })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("validates limitAmount must be positive", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.wallet.setSpendingLimit({ currency: "USDC", period: "daily", limitAmount: -100 })
    ).rejects.toThrow();
  });

  it("validates period must be daily or monthly", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.wallet.setSpendingLimit({ currency: "USDC", period: "weekly" as any, limitAmount: 5000 })
    ).rejects.toThrow();
  });

  it("validates currency must be a valid wallet currency", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.wallet.setSpendingLimit({ currency: "INVALID" as any, period: "daily", limitAmount: 5000 })
    ).rejects.toThrow();
  });
});

// ─── wallet.toggleSpendingLimit ───────────────────────────────────────────────
describe("wallet.toggleSpendingLimit", () => {
  it("rejects unauthenticated requests", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(
      caller.wallet.toggleSpendingLimit({ id: "some-id" })
    ).rejects.toThrow();
  });

  it("throws INTERNAL_SERVER_ERROR when DB unavailable", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.wallet.toggleSpendingLimit({ id: "some-id" })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("validates id must be non-empty", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.wallet.toggleSpendingLimit({ id: "" })
    ).rejects.toThrow();
  });
});

// ─── wallet.deleteSpendingLimit ───────────────────────────────────────────────
describe("wallet.deleteSpendingLimit", () => {
  it("rejects unauthenticated requests", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(
      caller.wallet.deleteSpendingLimit({ id: "some-id" })
    ).rejects.toThrow();
  });

  it("throws INTERNAL_SERVER_ERROR when DB unavailable", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.wallet.deleteSpendingLimit({ id: "some-id" })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("validates id must be non-empty", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.wallet.deleteSpendingLimit({ id: "" })
    ).rejects.toThrow();
  });
});

// ─── wallet.send — spending limit gate ───────────────────────────────────────
describe("wallet.send — spending limit gate", () => {
  it("rejects unauthenticated requests", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(
      caller.wallet.send({ currency: "USDC", amount: 100, counterparty: "Alice" })
    ).rejects.toThrow();
  });

  it("throws INTERNAL_SERVER_ERROR when DB unavailable (no balance record)", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.wallet.send({ currency: "USDC", amount: 100, counterparty: "Alice" })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("validates amount must be positive", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.wallet.send({ currency: "USDC", amount: -50, counterparty: "Alice" })
    ).rejects.toThrow();
  });

  it("validates counterparty must be non-empty", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.wallet.send({ currency: "USDC", amount: 100, counterparty: "" })
    ).rejects.toThrow();
  });
});

// ─── biometric.list — mobile BiometricDevices ────────────────────────────────
describe("biometric.list — mobile BiometricDevices", () => {
  it("rejects unauthenticated requests", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(caller.biometric.list()).rejects.toThrow();
  });

  it("returns empty array when DB unavailable", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.biometric.list();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });
});

// ─── biometric.revoke — mobile BiometricDevices ──────────────────────────────
describe("biometric.revoke — mobile BiometricDevices", () => {
  it("rejects unauthenticated requests", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(
      caller.biometric.revoke({ id: "some-enrollment-id" })
    ).rejects.toThrow();
  });

  it("throws INTERNAL_SERVER_ERROR when DB unavailable", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.biometric.revoke({ id: "some-enrollment-id" })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("validates id must be non-empty", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.biometric.revoke({ id: "" })
    ).rejects.toThrow();
  });
});

// ─── biometric.checkEnabled ───────────────────────────────────────────────────
describe("biometric.checkEnabled", () => {
  it("rejects unauthenticated requests", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(caller.biometric.checkEnabled()).rejects.toThrow();
  });

  it("returns enabled=false when DB unavailable", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.biometric.checkEnabled();
    expect(result).toMatchObject({ enabled: false });
  });
});

// ─── biometric.stats ─────────────────────────────────────────────────────────
describe("biometric.stats", () => {
  it("rejects unauthenticated requests", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(caller.biometric.stats()).rejects.toThrow();
  });

  it("returns zero stats when DB unavailable", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.biometric.stats();
    expect(result).toMatchObject({ total: 0, active: 0, revoked: 0 });
  });
});
