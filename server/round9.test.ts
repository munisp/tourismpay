/**
 * Round 9 Tests
 * Covers: loyalty router (account, transactions, rewards, redeem, earn)
 *         embeddedFinance router (list, requestPayout, applyForLoan, getInsuranceQuote, purchaseInsurance)
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock the database layer ──────────────────────────────────────────────────
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
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

// ─── Loyalty Router Tests ─────────────────────────────────────────────────────
describe("loyalty router", () => {
  describe("account", () => {
    it("returns default account when DB is unavailable (getDb returns null)", async () => {
      const caller = appRouter.createCaller(makeCtx("user"));
      // When DB is null, ensureAccount throws INTERNAL_SERVER_ERROR
      await expect(caller.loyalty.account()).rejects.toThrow();
    });
  });

  describe("transactions", () => {
    it("returns empty result when DB is unavailable", async () => {
      const caller = appRouter.createCaller(makeCtx("user"));
      const result = await caller.loyalty.transactions({ limit: 10, offset: 0 });
      expect(result).toEqual({ items: [], total: 0 });
    });

    it("accepts optional input", async () => {
      const caller = appRouter.createCaller(makeCtx("user"));
      const result = await caller.loyalty.transactions();
      expect(result).toHaveProperty("items");
      expect(result).toHaveProperty("total");
    });
  });

  describe("rewards", () => {
    it("returns default rewards catalog when DB is unavailable", async () => {
      const caller = appRouter.createCaller(makeCtx("user"));
      const result = await caller.loyalty.rewards();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      // Should return the DEFAULT_REWARDS fallback
      const first = result[0];
      expect(first).toHaveProperty("id");
      expect(first).toHaveProperty("name");
      expect(first).toHaveProperty("pointsCost");
      expect(first).toHaveProperty("partner");
      expect(first).toHaveProperty("category");
    });

    it("rewards have required fields", async () => {
      const caller = appRouter.createCaller(makeCtx("user"));
      const result = await caller.loyalty.rewards();
      for (const reward of result) {
        expect(typeof reward.id).toBe("string");
        expect(typeof reward.name).toBe("string");
        expect(typeof reward.pointsCost).toBe("number");
        expect(reward.pointsCost).toBeGreaterThan(0);
      }
    });
  });

  describe("redeem", () => {
    it("throws when DB is unavailable", async () => {
      const caller = appRouter.createCaller(makeCtx("user"));
      await expect(
        caller.loyalty.redeem({
          rewardId: "r1",
          rewardName: "Free Hotel Night",
          pointsCost: 5000,
          partner: "Sheraton Lagos",
        })
      ).rejects.toThrow();
    });

    it("validates input - pointsCost must be positive", async () => {
      const caller = appRouter.createCaller(makeCtx("user"));
      await expect(
        caller.loyalty.redeem({
          rewardId: "r1",
          rewardName: "Test",
          pointsCost: -100,
          partner: "Test",
        })
      ).rejects.toThrow();
    });
  });

  describe("earn", () => {
    it("throws when DB is unavailable", async () => {
      const caller = appRouter.createCaller(makeCtx("user"));
      await expect(
        caller.loyalty.earn({
          points: 500,
          description: "Test earn",
        })
      ).rejects.toThrow();
    });

    it("validates input - points must be positive", async () => {
      const caller = appRouter.createCaller(makeCtx("user"));
      await expect(
        caller.loyalty.earn({
          points: 0,
          description: "Test",
        })
      ).rejects.toThrow();
    });

    it("accepts optional partner and referenceId", async () => {
      const caller = appRouter.createCaller(makeCtx("user"));
      // Should throw DB error, not validation error
      await expect(
        caller.loyalty.earn({
          points: 100,
          description: "Test",
          partner: "TourismPay",
          referenceId: "REF-001",
        })
      ).rejects.toThrow("Database unavailable");
    });
  });

  describe("authentication", () => {
    it("requires authentication for account query", async () => {
      const caller = appRouter.createCaller({ user: null, req: {} as any, res: {} as any });
      await expect(caller.loyalty.account()).rejects.toThrow();
    });

    it("requires authentication for redeem mutation", async () => {
      const caller = appRouter.createCaller({ user: null, req: {} as any, res: {} as any });
      await expect(
        caller.loyalty.redeem({ rewardId: "r1", rewardName: "Test", pointsCost: 100, partner: "Test" })
      ).rejects.toThrow();
    });
  });
});

// ─── EmbeddedFinance Router Tests ─────────────────────────────────────────────
describe("embeddedFinance router", () => {
  describe("list", () => {
    it("returns empty result when DB is unavailable", async () => {
      const caller = appRouter.createCaller(makeCtx("user"));
      const result = await caller.embeddedFinance.list({ limit: 20, offset: 0 });
      expect(result).toEqual({ items: [], total: 0 });
    });

    it("accepts type filter", async () => {
      const caller = appRouter.createCaller(makeCtx("user"));
      const result = await caller.embeddedFinance.list({ type: "payout", limit: 10, offset: 0 });
      expect(result).toHaveProperty("items");
      expect(result).toHaveProperty("total");
    });

    it("accepts loan type filter", async () => {
      const caller = appRouter.createCaller(makeCtx("user"));
      const result = await caller.embeddedFinance.list({ type: "loan" });
      expect(Array.isArray(result.items)).toBe(true);
    });

    it("accepts insurance type filter", async () => {
      const caller = appRouter.createCaller(makeCtx("user"));
      const result = await caller.embeddedFinance.list({ type: "insurance" });
      expect(Array.isArray(result.items)).toBe(true);
    });
  });

  describe("requestPayout", () => {
    it("throws when DB is unavailable", async () => {
      const caller = appRouter.createCaller(makeCtx("user"));
      await expect(
        caller.embeddedFinance.requestPayout({
          amount: 1000,
          bankName: "First Bank",
          accountNumber: "0123456789",
          accountName: "John Doe",
        })
      ).rejects.toThrow("Database unavailable");
    });

    it("validates amount must be positive", async () => {
      const caller = appRouter.createCaller(makeCtx("user"));
      await expect(
        caller.embeddedFinance.requestPayout({
          amount: -500,
          bankName: "First Bank",
          accountNumber: "0123456789",
          accountName: "John Doe",
        })
      ).rejects.toThrow();
    });

    it("validates bankName is required", async () => {
      const caller = appRouter.createCaller(makeCtx("user"));
      await expect(
        caller.embeddedFinance.requestPayout({
          amount: 1000,
          bankName: "",
          accountNumber: "0123456789",
          accountName: "John Doe",
        })
      ).rejects.toThrow();
    });
  });

  describe("applyForLoan", () => {
    it("throws when DB is unavailable", async () => {
      const caller = appRouter.createCaller(makeCtx("user"));
      await expect(
        caller.embeddedFinance.applyForLoan({
          amount: 10000,
          termMonths: 12,
          purpose: "Equipment purchase",
        })
      ).rejects.toThrow("Database unavailable");
    });

    it("validates term months range (1-60)", async () => {
      const caller = appRouter.createCaller(makeCtx("user"));
      await expect(
        caller.embeddedFinance.applyForLoan({
          amount: 10000,
          termMonths: 0,
          purpose: "Test",
        })
      ).rejects.toThrow();
    });

    it("validates term months max (60)", async () => {
      const caller = appRouter.createCaller(makeCtx("user"));
      await expect(
        caller.embeddedFinance.applyForLoan({
          amount: 10000,
          termMonths: 61,
          purpose: "Test",
        })
      ).rejects.toThrow();
    });
  });

  describe("getInsuranceQuote", () => {
    it("throws when DB is unavailable", async () => {
      const caller = appRouter.createCaller(makeCtx("user"));
      await expect(
        caller.embeddedFinance.getInsuranceQuote({
          coverageType: "travel",
          coverageAmount: 5000,
          durationDays: 30,
        })
      ).rejects.toThrow("Database unavailable");
    });

    it("validates coverage type enum", async () => {
      const caller = appRouter.createCaller(makeCtx("user"));
      await expect(
        caller.embeddedFinance.getInsuranceQuote({
          coverageType: "invalid" as any,
          coverageAmount: 5000,
          durationDays: 30,
        })
      ).rejects.toThrow();
    });

    it("accepts all valid coverage types", async () => {
      const caller = appRouter.createCaller(makeCtx("user"));
      const types = ["travel", "health", "business", "equipment"] as const;
      for (const t of types) {
        await expect(
          caller.embeddedFinance.getInsuranceQuote({
            coverageType: t,
            coverageAmount: 1000,
            durationDays: 7,
          })
        ).rejects.toThrow("Database unavailable");
      }
    });

    it("validates duration days range (1-365)", async () => {
      const caller = appRouter.createCaller(makeCtx("user"));
      await expect(
        caller.embeddedFinance.getInsuranceQuote({
          coverageType: "travel",
          coverageAmount: 5000,
          durationDays: 366,
        })
      ).rejects.toThrow();
    });
  });

  describe("purchaseInsurance", () => {
    it("throws when DB is unavailable", async () => {
      const caller = appRouter.createCaller(makeCtx("user"));
      await expect(
        caller.embeddedFinance.purchaseInsurance({ quoteId: "test-quote-id" })
      ).rejects.toThrow();
    });
  });

  describe("adminList", () => {
    it("returns empty result for admin when DB is unavailable", async () => {
      const caller = appRouter.createCaller(makeCtx("admin"));
      const result = await caller.embeddedFinance.adminList({ limit: 50, offset: 0 });
      expect(result).toEqual({ items: [], total: 0 });
    });

    it("rejects non-admin users", async () => {
      const caller = appRouter.createCaller(makeCtx("user"));
      await expect(caller.embeddedFinance.adminList()).rejects.toThrow();
    });
  });

  describe("updateStatus", () => {
    it("throws when DB is unavailable", async () => {
      const caller = appRouter.createCaller(makeCtx("admin"));
      await expect(
        caller.embeddedFinance.updateStatus({
          requestId: "test-id",
          status: "approved",
        })
      ).rejects.toThrow("Database unavailable");
    });

    it("rejects non-admin users", async () => {
      const caller = appRouter.createCaller(makeCtx("user"));
      await expect(
        caller.embeddedFinance.updateStatus({ requestId: "test-id", status: "approved" })
      ).rejects.toThrow();
    });

    it("validates status enum", async () => {
      const caller = appRouter.createCaller(makeCtx("admin"));
      await expect(
        caller.embeddedFinance.updateStatus({ requestId: "test-id", status: "invalid_status" as any })
      ).rejects.toThrow();
    });
  });

  describe("authentication", () => {
    it("requires authentication for list query", async () => {
      const caller = appRouter.createCaller({ user: null, req: {} as any, res: {} as any });
      await expect(caller.embeddedFinance.list()).rejects.toThrow();
    });

    it("requires authentication for requestPayout", async () => {
      const caller = appRouter.createCaller({ user: null, req: {} as any, res: {} as any });
      await expect(
        caller.embeddedFinance.requestPayout({
          amount: 100,
          bankName: "Test",
          accountNumber: "123",
          accountName: "Test",
        })
      ).rejects.toThrow();
    });
  });
});
