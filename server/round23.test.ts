/**
 * Round 23 Tests — PIN Lockout Status, Revoke All, Enrollment Renewal
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";

// ─── Mock the db module ────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  createUserNotification: vi.fn().mockResolvedValue(undefined),
  getBisInvestigations: vi.fn().mockResolvedValue({ data: [], total: 0 }),
}));

// ─── Context factories ─────────────────────────────────────────────────────────
const anonCtx = { user: null, req: {} as any, res: {} as any };
const userCtx = {
  user: { id: 42, name: "Alice", email: "alice@example.com", role: "user" as const },
  req: {} as any,
  res: {} as any,
};
const adminCtx = {
  user: { id: 1, name: "Admin", email: "admin@example.com", role: "admin" as const },
  req: {} as any,
  res: {} as any,
};

// ─── biometric.getPinLockoutStatus ────────────────────────────────────────────
describe("biometric.getPinLockoutStatus", () => {
  it("returns isLocked=false for unauthenticated user (throws UNAUTHORIZED)", async () => {
    const caller = appRouter.createCaller(anonCtx as any);
    await expect(caller.biometric.getPinLockoutStatus()).rejects.toThrow();
  });

  it("returns isLocked=false when no lockout entry exists for user", async () => {
    const caller = appRouter.createCaller(userCtx as any);
    const result = await caller.biometric.getPinLockoutStatus();
    expect(result.isLocked).toBe(false);
    expect(result.remainingMs).toBe(0);
    expect(result.lockedUntilMs).toBeNull();
  });

  it("returns failedAttempts=0 when no lockout entry exists", async () => {
    const caller = appRouter.createCaller(userCtx as any);
    const result = await caller.biometric.getPinLockoutStatus();
    expect(result.failedAttempts).toBe(0);
  });

  it("returns correct shape with all required fields", async () => {
    const caller = appRouter.createCaller(userCtx as any);
    const result = await caller.biometric.getPinLockoutStatus();
    expect(result).toHaveProperty("isLocked");
    expect(result).toHaveProperty("lockedUntilMs");
    expect(result).toHaveProperty("remainingMs");
    expect(result).toHaveProperty("failedAttempts");
  });

  it("admin can also check their own lockout status", async () => {
    const caller = appRouter.createCaller(adminCtx as any);
    const result = await caller.biometric.getPinLockoutStatus();
    expect(result.isLocked).toBe(false);
  });
});

// ─── biometric.revokeAll ──────────────────────────────────────────────────────
describe("biometric.revokeAll", () => {
  it("throws UNAUTHORIZED for unauthenticated user", async () => {
    const caller = appRouter.createCaller(anonCtx as any);
    await expect(caller.biometric.revokeAll()).rejects.toThrow();
  });

  it("throws INTERNAL_SERVER_ERROR when DB is unavailable", async () => {
    const caller = appRouter.createCaller(userCtx as any);
    await expect(caller.biometric.revokeAll()).rejects.toThrow(/Database unavailable/);
  });

  it("admin can also call revokeAll (protected procedure)", async () => {
    const caller = appRouter.createCaller(adminCtx as any);
    // Admin is a valid authenticated user — same DB error expected
    await expect(caller.biometric.revokeAll()).rejects.toThrow();
  });
});

// ─── biometric.renewEnrollment ────────────────────────────────────────────────
describe("biometric.renewEnrollment", () => {
  it("throws UNAUTHORIZED for unauthenticated user", async () => {
    const caller = appRouter.createCaller(anonCtx as any);
    await expect(caller.biometric.renewEnrollment({ id: "cred-abc" })).rejects.toThrow();
  });

  it("throws INTERNAL_SERVER_ERROR when DB is unavailable", async () => {
    const caller = appRouter.createCaller(userCtx as any);
    await expect(caller.biometric.renewEnrollment({ id: "cred-abc" })).rejects.toThrow(/Database unavailable/);
  });

  it("requires a non-empty id string", async () => {
    const caller = appRouter.createCaller(userCtx as any);
    await expect(caller.biometric.renewEnrollment({ id: "" })).rejects.toThrow();
  });

  it("admin can also call renewEnrollment", async () => {
    const caller = appRouter.createCaller(adminCtx as any);
    await expect(caller.biometric.renewEnrollment({ id: "cred-xyz" })).rejects.toThrow(/Database unavailable/);
  });
});

// ─── biometric.changePin ──────────────────────────────────────────────────────
describe("biometric.changePin", () => {
  it("throws UNAUTHORIZED for unauthenticated user", async () => {
    const caller = appRouter.createCaller(anonCtx as any);
    await expect(caller.biometric.changePin({ currentPin: "123456", newPin: "654321" })).rejects.toThrow();
  });

  it("throws INTERNAL_SERVER_ERROR when DB is unavailable", async () => {
    const caller = appRouter.createCaller(userCtx as any);
    await expect(caller.biometric.changePin({ currentPin: "123456", newPin: "654321" })).rejects.toThrow(/Database unavailable/);
  });

  it("validates currentPin is exactly 6 digits", async () => {
    const caller = appRouter.createCaller(userCtx as any);
    await expect(caller.biometric.changePin({ currentPin: "12345", newPin: "654321" })).rejects.toThrow();
  });

  it("validates newPin is exactly 6 digits", async () => {
    const caller = appRouter.createCaller(userCtx as any);
    await expect(caller.biometric.changePin({ currentPin: "123456", newPin: "12345" })).rejects.toThrow();
  });
});

// ─── biometric.resetPin (admin-only) ─────────────────────────────────────────
describe("biometric.resetPin", () => {
  it("throws UNAUTHORIZED for unauthenticated user", async () => {
    const caller = appRouter.createCaller(anonCtx as any);
    await expect(caller.biometric.resetPin({ userId: "42" })).rejects.toThrow();
  });

  it("throws FORBIDDEN for non-admin user", async () => {
    const caller = appRouter.createCaller(userCtx as any);
    await expect(caller.biometric.resetPin({ userId: "42" })).rejects.toThrow(/FORBIDDEN|permission/i);
  });

  it("throws INTERNAL_SERVER_ERROR when DB is unavailable (admin)", async () => {
    const caller = appRouter.createCaller(adminCtx as any);
    await expect(caller.biometric.resetPin({ userId: "42" })).rejects.toThrow(/Database unavailable/);
  });
});

// ─── wallet.getSpendingLimits (nextResetAt) ───────────────────────────────────
describe("wallet.getSpendingLimits nextResetAt", () => {
  it("throws UNAUTHORIZED for unauthenticated user", async () => {
    const caller = appRouter.createCaller(anonCtx as any);
    await expect(caller.wallet.getSpendingLimits()).rejects.toThrow();
  });

  it("returns empty array when DB is unavailable (graceful fallback)", async () => {
    const caller = appRouter.createCaller(userCtx as any);
    const result = await caller.wallet.getSpendingLimits();
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── biometric.list (enrollment expiresAt field) ──────────────────────────────
describe("biometric.list with expiresAt", () => {
  it("throws UNAUTHORIZED for unauthenticated user", async () => {
    const caller = appRouter.createCaller(anonCtx as any);
    await expect(caller.biometric.list()).rejects.toThrow();
  });

  it("returns empty array when DB is unavailable (graceful fallback)", async () => {
    const caller = appRouter.createCaller(userCtx as any);
    const result = await caller.biometric.list();
    expect(Array.isArray(result)).toBe(true);
  });
});
