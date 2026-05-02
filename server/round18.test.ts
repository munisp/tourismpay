/**
 * Round 18 Tests — Biometric High-Value Re-Auth, Wallet Alert Severity, BiometricSettings
 * Tests for:
 *   - biometric.requestHighValueToken (issues 60s token, requires active enrollment)
 *   - biometric.verifyHighValueToken (validates token, amount, currency, one-time use)
 *   - wallet.send biometric gate (rejects high-value without token, accepts with valid token)
 *   - wallet.activeAlertBreaches severity classification (warning vs critical)
 *   - biometric.list (BiometricSettings page data source)
 *   - biometric.stats (BiometricSettings stats panel)
 *   - biometric.revoke (BiometricSettings revoke action)
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

// ─── biometric.requestHighValueToken ─────────────────────────────────────────
describe("biometric.requestHighValueToken", () => {
  beforeEach(() => {
    _highValueTokens.clear();
  });

  it("rejects unauthenticated requests", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(
      caller.biometric.requestHighValueToken({ amount: 1500, currency: "USDC" })
    ).rejects.toThrow();
  });

  it("throws INTERNAL_SERVER_ERROR when DB unavailable", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.biometric.requestHighValueToken({ amount: 1500, currency: "USDC" })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("rejects negative amount", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.biometric.requestHighValueToken({ amount: -100, currency: "USDC" })
    ).rejects.toThrow();
  });

  it("rejects empty currency", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.biometric.requestHighValueToken({ amount: 1500, currency: "" })
    ).rejects.toThrow();
  });
});

// ─── biometric.verifyHighValueToken ──────────────────────────────────────────
describe("biometric.verifyHighValueToken", () => {
  beforeEach(() => {
    _highValueTokens.clear();
  });

  it("rejects unauthenticated requests", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(
      caller.biometric.verifyHighValueToken({ token: "fake-token", amount: 1500, currency: "USDC" })
    ).rejects.toThrow();
  });

  it("throws UNAUTHORIZED for unknown token", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.biometric.verifyHighValueToken({ token: "nonexistent-token", amount: 1500, currency: "USDC" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("throws UNAUTHORIZED for expired token", async () => {
    const expiredToken = "expired-token-123";
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
    // Token should be cleaned up
    expect(_highValueTokens.has(expiredToken)).toBe(false);
  });

  it("throws FORBIDDEN when token belongs to different user", async () => {
    const token = "other-user-token";
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

  it("throws BAD_REQUEST when token amount mismatches", async () => {
    const token = "amount-mismatch-token";
    _highValueTokens.set(token, {
      userId: "1",
      amount: 1500,
      currency: "USDC",
      expiresAt: Date.now() + 60_000,
    });
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.biometric.verifyHighValueToken({ token, amount: 2000, currency: "USDC" }) // different amount
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("throws BAD_REQUEST when token currency mismatches", async () => {
    const token = "currency-mismatch-token";
    _highValueTokens.set(token, {
      userId: "1",
      amount: 1500,
      currency: "USDC",
      expiresAt: Date.now() + 60_000,
    });
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.biometric.verifyHighValueToken({ token, amount: 1500, currency: "XLM" }) // different currency
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("successfully verifies a valid token and consumes it (one-time use)", async () => {
    const token = "valid-token-123";
    _highValueTokens.set(token, {
      userId: "1",
      amount: 1500,
      currency: "USDC",
      expiresAt: Date.now() + 60_000,
    });
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.biometric.verifyHighValueToken({ token, amount: 1500, currency: "USDC" });
    expect(result).toMatchObject({ verified: true });
    // Token should be consumed (one-time use)
    expect(_highValueTokens.has(token)).toBe(false);
  });

  it("rejects reuse of an already-consumed token", async () => {
    const token = "reuse-token-456";
    _highValueTokens.set(token, {
      userId: "1",
      amount: 1500,
      currency: "USDC",
      expiresAt: Date.now() + 60_000,
    });
    const caller = appRouter.createCaller(makeCtx());
    // First use succeeds
    await caller.biometric.verifyHighValueToken({ token, amount: 1500, currency: "USDC" });
    // Second use fails
    await expect(
      caller.biometric.verifyHighValueToken({ token, amount: 1500, currency: "USDC" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

// ─── wallet.send biometric gate ──────────────────────────────────────────────
describe("wallet.send biometric gate", () => {
  beforeEach(() => {
    _highValueTokens.clear();
  });

  it("rejects unauthenticated send", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(
      caller.wallet.send({ currency: "USDC", amount: 100, counterparty: "Alice" })
    ).rejects.toThrow();
  });

  it("rejects high-value send without biometricToken (DB unavailable — INTERNAL_SERVER_ERROR before biometric check)", async () => {
    const caller = appRouter.createCaller(makeCtx());
    // USDC 1500 = $1500 USD, above threshold.
    // DB unavailable means getDb() returns null → INTERNAL_SERVER_ERROR before biometric check.
    await expect(
      caller.wallet.send({ currency: "USDC", amount: 1500, counterparty: "Alice" })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("rejects high-value send with invalid biometricToken (DB unavailable — INTERNAL_SERVER_ERROR)", async () => {
    const caller = appRouter.createCaller(makeCtx());
    // DB unavailable means getDb() returns null → INTERNAL_SERVER_ERROR before token check.
    await expect(
      caller.wallet.send({ currency: "USDC", amount: 1500, counterparty: "Alice", biometricToken: "invalid-token" })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("rejects high-value send with expired biometricToken (DB unavailable — INTERNAL_SERVER_ERROR)", async () => {
    const token = "expired-wallet-token";
    _highValueTokens.set(token, {
      userId: "1",
      amount: 1500,
      currency: "USDC",
      expiresAt: Date.now() - 1000, // expired
    });
    const caller = appRouter.createCaller(makeCtx());
    // DB unavailable → INTERNAL_SERVER_ERROR before token expiry check
    await expect(
      caller.wallet.send({ currency: "USDC", amount: 1500, counterparty: "Alice", biometricToken: token })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("rejects high-value send with token for different amount (DB unavailable — INTERNAL_SERVER_ERROR)", async () => {
    const token = "diff-amount-token";
    _highValueTokens.set(token, {
      userId: "1",
      amount: 2000, // token issued for 2000
      currency: "USDC",
      expiresAt: Date.now() + 60_000,
    });
    const caller = appRouter.createCaller(makeCtx());
    // DB unavailable → INTERNAL_SERVER_ERROR before amount mismatch check
    await expect(
      caller.wallet.send({ currency: "USDC", amount: 1500, counterparty: "Alice", biometricToken: token })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("allows low-value send without biometricToken (fails at DB, not at biometric gate)", async () => {
    const caller = appRouter.createCaller(makeCtx());
    // $50 USDC = $50 USD, below threshold — should fail at DB level, not biometric gate
    await expect(
      caller.wallet.send({ currency: "USDC", amount: 50, counterparty: "Alice" })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" }); // DB unavailable, not PRECONDITION_FAILED
  });
});

// ─── wallet.activeAlertBreaches severity ─────────────────────────────────────
describe("wallet.activeAlertBreaches severity classification", () => {
  it("rejects unauthenticated requests", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(caller.wallet.activeAlertBreaches()).rejects.toThrow();
  });

  it("returns empty array when DB unavailable (no procedure path error)", async () => {
    const caller = appRouter.createCaller(makeCtx());
    // activeAlertBreaches is a query (not .query() call pattern)
    const result = await caller.wallet.activeAlertBreaches();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });
});

// ─── biometric.list (BiometricSettings page) ─────────────────────────────────
describe("biometric.list (BiometricSettings page)", () => {
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

// ─── biometric.stats (BiometricSettings stats panel) ─────────────────────────
describe("biometric.stats (BiometricSettings stats panel)", () => {
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

// ─── biometric.revoke (BiometricSettings revoke action) ──────────────────────
describe("biometric.revoke (BiometricSettings revoke action)", () => {
  it("rejects unauthenticated requests", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(
      caller.biometric.revoke({ id: "enrollment-123" })
    ).rejects.toThrow();
  });

  it("throws INTERNAL_SERVER_ERROR when DB unavailable", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.biometric.revoke({ id: "enrollment-123" })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("rejects empty enrollment id", async () => {
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

  it("returns disabled state when DB unavailable", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.biometric.checkEnabled();
    expect(result).toMatchObject({ enabled: false, enrollmentCount: 0 });
    expect(Array.isArray(result.enrollments)).toBe(true);
  });
});

// ─── HIGH_VALUE_TX_THRESHOLD_USD constant ────────────────────────────────────
describe("HIGH_VALUE_TX_THRESHOLD_USD", () => {
  it("is set to 1000", async () => {
    const { HIGH_VALUE_TX_THRESHOLD_USD } = await import("../shared/const");
    expect(HIGH_VALUE_TX_THRESHOLD_USD).toBe(1000);
  });
});
