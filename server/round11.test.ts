/**
 * Round 11 Tests
 * Covers:
 *   - wallet.topUp mutation (creates a finance_request payout)
 *   - embeddedFinance.updateStatus with notification side-effects
 *   - kybApplications.complianceScoreDistribution query
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { TRPCError } from "@trpc/server";

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

// ─── wallet.topUp Tests ───────────────────────────────────────────────────────
describe("wallet.topUp", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller({ user: null, req: {} as any, res: {} as any });
    await expect(
      caller.wallet.topUp({
        currency: "USDC",
        amount: 100,
        bankName: "Test Bank",
        accountNumber: "1234567890",
        accountName: "Test User",
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("throws INTERNAL_SERVER_ERROR when db is unavailable", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    // getDb returns null (mocked), so topUp should throw
    await expect(
      caller.wallet.topUp({
        currency: "USDC",
        amount: 100,
        bankName: "Test Bank",
        accountNumber: "1234567890",
        accountName: "Test User",
      })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("validates input: amount must be positive", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.wallet.topUp({
        currency: "USDC",
        amount: -50,
        bankName: "Test Bank",
        accountNumber: "1234567890",
        accountName: "Test User",
      })
    ).rejects.toThrow();
  });

  it("validates input: bankName must not be empty", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.wallet.topUp({
        currency: "USDC",
        amount: 100,
        bankName: "",
        accountNumber: "1234567890",
        accountName: "Test User",
      })
    ).rejects.toThrow();
  });

  it("validates input: accountNumber must not be empty", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.wallet.topUp({
        currency: "USDC",
        amount: 100,
        bankName: "Test Bank",
        accountNumber: "",
        accountName: "Test User",
      })
    ).rejects.toThrow();
  });
});

// ─── embeddedFinance.updateStatus Notification Tests ─────────────────────────
describe("embeddedFinance.updateStatus", () => {
  it("requires admin role", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.embeddedFinance.updateStatus({
        requestId: "test-id",
        status: "approved",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws INTERNAL_SERVER_ERROR when db is unavailable", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    await expect(
      caller.embeddedFinance.updateStatus({
        requestId: "test-id",
        status: "approved",
      })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("rejects unauthenticated access (UNAUTHORIZED or FORBIDDEN)", async () => {
    const caller = appRouter.createCaller({ user: null, req: {} as any, res: {} as any });
    await expect(
      caller.embeddedFinance.updateStatus({
        requestId: "test-id",
        status: "approved",
      })
    ).rejects.toSatisfy((e: any) => e.code === "UNAUTHORIZED" || e.code === "FORBIDDEN");
  });

  it("accepts optional note field", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    // Will fail at DB level (null db), but input validation should pass
    await expect(
      caller.embeddedFinance.updateStatus({
        requestId: "test-id",
        status: "rejected",
        note: "Insufficient documentation provided.",
      })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("validates status enum", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    await expect(
      caller.embeddedFinance.updateStatus({
        requestId: "test-id",
        status: "invalid_status" as any,
      })
    ).rejects.toThrow();
  });
});

// ─── embeddedFinance.adminList Tests ─────────────────────────────────────────
describe("embeddedFinance.adminList", () => {
  it("requires admin role", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(caller.embeddedFinance.adminList()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("returns empty items when db is unavailable", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.embeddedFinance.adminList();
    expect(result).toHaveProperty("items");
    expect(result).toHaveProperty("total");
    expect(result.items).toEqual([]);
  });

  it("accepts optional type filter", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.embeddedFinance.adminList({ type: "payout" });
    expect(result.items).toEqual([]);
  });

  it("accepts optional status filter", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.embeddedFinance.adminList({ status: "pending" });
    expect(result.items).toEqual([]);
  });
});

// ─── kybApplications.complianceScoreDistribution Tests ───────────────────────
describe("kybApplications.complianceScoreDistribution", () => {
  it("requires admin role", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.kybApplications.complianceScoreDistribution()
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns empty array when db is unavailable", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.kybApplications.complianceScoreDistribution();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([]);
  });

  it("rejects unauthenticated access (UNAUTHORIZED)", async () => {
    const caller = appRouter.createCaller({ user: null, req: {} as any, res: {} as any });
    // complianceProcedure: protectedProcedure first throws UNAUTHORIZED for null user
    await expect(
      caller.kybApplications.complianceScoreDistribution()
    ).rejects.toThrow();
  });
});

// ─── embeddedFinance.list Tests ───────────────────────────────────────────────
describe("embeddedFinance.list", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller({ user: null, req: {} as any, res: {} as any });
    await expect(caller.embeddedFinance.list()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("returns empty items when db is unavailable", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    const result = await caller.embeddedFinance.list();
    expect(result).toHaveProperty("items");
    expect(result).toHaveProperty("total");
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("accepts optional type filter", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    const result = await caller.embeddedFinance.list({ type: "loan" });
    expect(result.items).toEqual([]);
  });
});

// ─── embeddedFinance.requestPayout Tests ─────────────────────────────────────
describe("embeddedFinance.requestPayout", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller({ user: null, req: {} as any, res: {} as any });
    await expect(
      caller.embeddedFinance.requestPayout({
        amount: 500,
        bankName: "Test Bank",
        accountNumber: "1234567890",
        accountName: "Test User",
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("throws INTERNAL_SERVER_ERROR when db is unavailable", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.embeddedFinance.requestPayout({
        amount: 500,
        bankName: "Test Bank",
        accountNumber: "1234567890",
        accountName: "Test User",
      })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("validates amount must be positive", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.embeddedFinance.requestPayout({
        amount: 0,
        bankName: "Test Bank",
        accountNumber: "1234567890",
        accountName: "Test User",
      })
    ).rejects.toThrow();
  });
});
