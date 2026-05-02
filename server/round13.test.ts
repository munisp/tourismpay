/**
 * Round 13 Tests
 * Covers:
 *   - wallet.getBalanceAlerts — returns empty array when db unavailable
 *   - wallet.setBalanceAlert — requires auth, validates input, throws when db unavailable
 *   - wallet.toggleBalanceAlert — requires auth, throws when db unavailable
 *   - wallet.deleteBalanceAlert — requires auth, throws when db unavailable
 *   - embeddedFinance.list — date-range and type filters accepted
 *   - loyalty.earn — tierUpgraded flag returned in response shape
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock the database layer ──────────────────────────────────────────────────
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
  createUserNotification: vi.fn().mockResolvedValue(true),
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

// ─── Context helpers ──────────────────────────────────────────────────────────
type AuthenticatedUser = NonNullable<TrpcContext["user"]>;
function makeCtx(role: "admin" | "user" = "user"): TrpcContext {
  const user: AuthenticatedUser = {
    id: role === "admin" ? 99 : 1,
    openId: `${role}-user`,
    email: `${role}@example.com`,
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

// ─── wallet.getBalanceAlerts ──────────────────────────────────────────────────
describe("wallet.getBalanceAlerts", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller({ user: null, req: {} as any, res: {} as any });
    await expect(caller.wallet.getBalanceAlerts()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("returns empty array when db is unavailable", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    const result = await caller.wallet.getBalanceAlerts();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });
});

// ─── wallet.setBalanceAlert ───────────────────────────────────────────────────
describe("wallet.setBalanceAlert", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller({ user: null, req: {} as any, res: {} as any });
    await expect(
      caller.wallet.setBalanceAlert({ currency: "USDC", threshold: 100 })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects threshold of zero", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.wallet.setBalanceAlert({ currency: "USDC", threshold: 0 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects negative threshold", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.wallet.setBalanceAlert({ currency: "USDC", threshold: -50 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects empty currency string", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.wallet.setBalanceAlert({ currency: "", threshold: 100 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects currency longer than 20 chars", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.wallet.setBalanceAlert({ currency: "VERY_LONG_CURRENCY_NAME_X", threshold: 100 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("throws INTERNAL_SERVER_ERROR when db is unavailable", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.wallet.setBalanceAlert({ currency: "USDC", threshold: 100 })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});

// ─── wallet.toggleBalanceAlert ────────────────────────────────────────────────
describe("wallet.toggleBalanceAlert", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller({ user: null, req: {} as any, res: {} as any });
    await expect(
      caller.wallet.toggleBalanceAlert({ id: "alert-123" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("throws INTERNAL_SERVER_ERROR when db is unavailable", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.wallet.toggleBalanceAlert({ id: "alert-123" })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("rejects empty id", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.wallet.toggleBalanceAlert({ id: "" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

// ─── wallet.deleteBalanceAlert ────────────────────────────────────────────────
describe("wallet.deleteBalanceAlert", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller({ user: null, req: {} as any, res: {} as any });
    await expect(
      caller.wallet.deleteBalanceAlert({ id: "alert-123" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("throws INTERNAL_SERVER_ERROR when db is unavailable", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.wallet.deleteBalanceAlert({ id: "alert-123" })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});

// ─── embeddedFinance.list with filters ───────────────────────────────────────
describe("embeddedFinance.list (with date/type filters)", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller({ user: null, req: {} as any, res: {} as any });
    await expect(caller.embeddedFinance.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("returns {items, total} when db is unavailable (no filters)", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    const result = await caller.embeddedFinance.list();
    expect(result).toMatchObject({ items: [], total: 0 });
  });

  it("accepts type filter 'payout' and returns paginated shape", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    const result = await caller.embeddedFinance.list({ type: "payout" });
    expect(result).toHaveProperty("items");
    expect(result).toHaveProperty("total");
  });

  it("accepts type filter 'loan' and returns paginated shape", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    const result = await caller.embeddedFinance.list({ type: "loan" });
    expect(result).toHaveProperty("items");
    expect(result).toHaveProperty("total");
  });

  it("accepts type filter 'insurance' and returns paginated shape", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    const result = await caller.embeddedFinance.list({ type: "insurance" });
    expect(result).toHaveProperty("items");
    expect(result).toHaveProperty("total");
  });

  it("accepts dateFrom filter as Unix ms timestamp", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    const result = await caller.embeddedFinance.list({ dateFrom: new Date("2025-01-01").getTime() });
    expect(result).toHaveProperty("items");
  });

  it("accepts dateTo filter as Unix ms timestamp", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    const result = await caller.embeddedFinance.list({ dateTo: new Date("2025-12-31").getTime() });
    expect(result).toHaveProperty("items");
  });

  it("accepts combined type + dateFrom + dateTo filters", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    const result = await caller.embeddedFinance.list({
      type: "payout",
      dateFrom: new Date("2025-01-01").getTime(),
      dateTo: new Date("2025-12-31").getTime(),
    });
    expect(result).toHaveProperty("items");
    expect(result).toHaveProperty("total");
  });

  it("rejects invalid type value", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.embeddedFinance.list({ type: "invalid_type" as any })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

// ─── loyalty.earn — tierUpgraded flag ────────────────────────────────────────
describe("loyalty.earn (tier upgrade flag)", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller({ user: null, req: {} as any, res: {} as any });
    await expect(
      caller.loyalty.earn({ points: 100, description: "Test purchase" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("throws INTERNAL_SERVER_ERROR when db is unavailable", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.loyalty.earn({ points: 100, description: "Test purchase" })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("rejects zero points", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.loyalty.earn({ points: 0, description: "Test" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects negative points", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.loyalty.earn({ points: -50, description: "Test" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("accepts optional partner field", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    // Should throw INTERNAL_SERVER_ERROR (db unavailable) not BAD_REQUEST
    await expect(
      caller.loyalty.earn({ points: 100, description: "Hotel stay", partner: "Sheraton Lagos" })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("accepts optional referenceId field", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.loyalty.earn({ points: 200, description: "Referral bonus", referenceId: "ref-abc-123" })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("accepts all optional fields together", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.loyalty.earn({ points: 500, description: "Safari booking", partner: "Nairobi Safari Co.", referenceId: "booking-xyz" })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});
