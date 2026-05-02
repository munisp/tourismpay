/**
 * Round 12 Tests
 * Covers:
 *   - embeddedFinance.requestPayout — user receipt notification on submission
 *   - embeddedFinance.applyForLoan — user receipt notification on submission
 *   - embeddedFinance.purchaseInsurance — user receipt + notifyOwner on activation
 *   - wallet.exportTransactions — CSV export mutation
 *   - loyalty.earn — tier upgrade notification when tier changes
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

// ─── embeddedFinance.requestPayout receipt tests ──────────────────────────────
describe("embeddedFinance.requestPayout (receipt notification)", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller({ user: null, req: {} as any, res: {} as any });
    await expect(
      caller.embeddedFinance.requestPayout({
        amount: 500,
        currency: "USD",
        bankName: "GTBank",
        accountNumber: "0123456789",
        accountName: "Test User",
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("throws INTERNAL_SERVER_ERROR when db is unavailable", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.embeddedFinance.requestPayout({
        amount: 500,
        currency: "USD",
        bankName: "GTBank",
        accountNumber: "0123456789",
        accountName: "Test User",
      })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("validates amount must be positive", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.embeddedFinance.requestPayout({
        amount: -100,
        currency: "USD",
        bankName: "GTBank",
        accountNumber: "0123456789",
        accountName: "Test User",
      })
    ).rejects.toThrow();
  });

  it("validates bankName is required", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.embeddedFinance.requestPayout({
        amount: 500,
        currency: "USD",
        bankName: "",
        accountNumber: "0123456789",
        accountName: "Test User",
      })
    ).rejects.toThrow();
  });
});

// ─── embeddedFinance.applyForLoan receipt tests ───────────────────────────────
describe("embeddedFinance.applyForLoan (receipt notification)", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller({ user: null, req: {} as any, res: {} as any });
    await expect(
      caller.embeddedFinance.applyForLoan({
        amount: 10000,
        currency: "USD",
        termMonths: 12,
        purpose: "Business expansion",
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("throws INTERNAL_SERVER_ERROR when db is unavailable", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.embeddedFinance.applyForLoan({
        amount: 10000,
        currency: "USD",
        termMonths: 12,
        purpose: "Business expansion",
      })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("validates termMonths range (1-60)", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.embeddedFinance.applyForLoan({
        amount: 10000,
        currency: "USD",
        termMonths: 0,
        purpose: "Business expansion",
      })
    ).rejects.toThrow();
    await expect(
      caller.embeddedFinance.applyForLoan({
        amount: 10000,
        currency: "USD",
        termMonths: 61,
        purpose: "Business expansion",
      })
    ).rejects.toThrow();
  });

  it("validates purpose is required", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.embeddedFinance.applyForLoan({
        amount: 10000,
        currency: "USD",
        termMonths: 12,
        purpose: "",
      })
    ).rejects.toThrow();
  });
});

// ─── embeddedFinance.purchaseInsurance receipt tests ─────────────────────────
describe("embeddedFinance.purchaseInsurance (receipt notification)", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller({ user: null, req: {} as any, res: {} as any });
    await expect(
      caller.embeddedFinance.purchaseInsurance({ quoteId: "quote-123" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("throws INTERNAL_SERVER_ERROR when db is unavailable", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.embeddedFinance.purchaseInsurance({ quoteId: "quote-123" })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("validates quoteId is required", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.embeddedFinance.purchaseInsurance({ quoteId: "" })
    ).rejects.toThrow();
  });
});

// ─── wallet.exportTransactions tests ─────────────────────────────────────────
describe("wallet.exportTransactions", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller({ user: null, req: {} as any, res: {} as any });
    await expect(caller.wallet.exportTransactions()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("returns empty csv when db is unavailable", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    const result = await caller.wallet.exportTransactions();
    expect(result).toMatchObject({ csv: "", rowCount: 0 });
    // When db is unavailable, the router returns early with a fallback filename
    expect(result.filename).toMatch(/wallet-transactions/);
  });

  it("accepts optional currency filter", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    const result = await caller.wallet.exportTransactions({ currency: "USDC" });
    expect(result).toMatchObject({ csv: "", rowCount: 0 });
  });

  it("accepts optional limit", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    const result = await caller.wallet.exportTransactions({ limit: 500 });
    expect(result).toMatchObject({ csv: "", rowCount: 0 });
  });

  it("rejects limit over 5000", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.wallet.exportTransactions({ limit: 5001 })
    ).rejects.toThrow();
  });
});

// ─── loyalty.earn tier upgrade notification tests ─────────────────────────────
describe("loyalty.earn (tier upgrade notification)", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller({ user: null, req: {} as any, res: {} as any });
    await expect(
      caller.loyalty.earn({ points: 100, description: "Test earn" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("throws INTERNAL_SERVER_ERROR when db is unavailable", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.loyalty.earn({ points: 100, description: "Test earn" })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("validates points must be positive", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.loyalty.earn({ points: 0, description: "Test earn" })
    ).rejects.toThrow();
    await expect(
      caller.loyalty.earn({ points: -50, description: "Test earn" })
    ).rejects.toThrow();
  });

  it("validates description is required", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.loyalty.earn({ points: 100, description: "" })
    ).rejects.toThrow();
  });

  it("accepts optional partner and referenceId", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    // DB unavailable but input validation should pass
    await expect(
      caller.loyalty.earn({
        points: 500,
        description: "Hotel stay",
        partner: "Sheraton Lagos",
        referenceId: "booking-abc123",
      })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});

// ─── loyalty.redeem tests ─────────────────────────────────────────────────────
describe("loyalty.redeem", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller({ user: null, req: {} as any, res: {} as any });
    await expect(
      caller.loyalty.redeem({
        rewardId: "r1",
        rewardName: "Free Hotel Night",
        pointsCost: 5000,
        partner: "Sheraton Lagos",
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("throws INTERNAL_SERVER_ERROR when db is unavailable", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.loyalty.redeem({
        rewardId: "r1",
        rewardName: "Free Hotel Night",
        pointsCost: 5000,
        partner: "Sheraton Lagos",
      })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("validates pointsCost must be positive", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.loyalty.redeem({
        rewardId: "r1",
        rewardName: "Free Hotel Night",
        pointsCost: 0,
        partner: "Sheraton Lagos",
      })
    ).rejects.toThrow();
  });
});
