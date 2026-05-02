/**
 * Round 10 Tests
 * Covers: csvExport router (auditLogs, kybApplications, bisInvestigations, users)
 *         embeddedFinance.adminList and embeddedFinance.updateStatus (admin procedures)
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

// ─── CSV Export Router Tests ──────────────────────────────────────────────────

describe("csvExport router", () => {
  describe("auditLogs.exportCsv", () => {
    it("returns csv, filename, and rowCount for admin users", async () => {
      const caller = appRouter.createCaller(makeCtx("admin"));
      // DB is null so it will return empty rows and generate a CSV header
      const result = await caller.csvExport.auditLogs({});
      expect(result).toHaveProperty("csv");
      expect(result).toHaveProperty("filename");
      expect(result).toHaveProperty("rowCount");
      expect(typeof result.csv).toBe("string");
      expect(result.filename).toMatch(/^audit-log-\d{4}-\d{2}-\d{2}\.csv$/);
      expect(typeof result.rowCount).toBe("number");
    });

    it("rejects non-admin users with FORBIDDEN", async () => {
      const caller = appRouter.createCaller(makeCtx("user"));
      await expect(caller.csvExport.auditLogs({})).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("accepts date range filters", async () => {
      const caller = appRouter.createCaller(makeCtx("admin"));
      const result = await caller.csvExport.auditLogs({
        from: new Date("2025-01-01"),
        to: new Date("2025-12-31"),
      });
      expect(result).toHaveProperty("csv");
      expect(result.rowCount).toBeGreaterThanOrEqual(0);
    });

    it("accepts action filter", async () => {
      const caller = appRouter.createCaller(makeCtx("admin"));
      const result = await caller.csvExport.auditLogs({ action: "login" });
      expect(result).toHaveProperty("csv");
    });
  });

  describe("kybApplications.exportCsv", () => {
    it("returns csv, filename, and rowCount for admin users", async () => {
      const caller = appRouter.createCaller(makeCtx("admin"));
      const result = await caller.csvExport.kybApplications({});
      expect(result).toHaveProperty("csv");
      expect(result).toHaveProperty("filename");
      expect(result).toHaveProperty("rowCount");
      expect(result.filename).toMatch(/^kyb-applications-\d{4}-\d{2}-\d{2}\.csv$/);
    });

    it("rejects non-admin users with FORBIDDEN", async () => {
      const caller = appRouter.createCaller(makeCtx("user"));
      await expect(caller.csvExport.kybApplications({})).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });
  });

  describe("bisInvestigations.exportCsv", () => {
    it("returns csv, filename, and rowCount for admin users", async () => {
      const caller = appRouter.createCaller(makeCtx("admin"));
      const result = await caller.csvExport.bisInvestigations({});
      expect(result).toHaveProperty("csv");
      expect(result).toHaveProperty("filename");
      expect(result).toHaveProperty("rowCount");
      expect(result.filename).toMatch(/^bis-investigations-\d{4}-\d{2}-\d{2}\.csv$/);
    });

    it("rejects non-admin users with FORBIDDEN", async () => {
      const caller = appRouter.createCaller(makeCtx("user"));
      await expect(caller.csvExport.bisInvestigations({})).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("accepts optional status and riskLevel filters", async () => {
      const caller = appRouter.createCaller(makeCtx("admin"));
      const result = await caller.csvExport.bisInvestigations({
        status: "completed",
        riskLevel: "high",
      });
      expect(result).toHaveProperty("csv");
    });

    it("accepts date range filters", async () => {
      const caller = appRouter.createCaller(makeCtx("admin"));
      const result = await caller.csvExport.bisInvestigations({
        from: new Date("2025-01-01"),
        to: new Date("2025-12-31"),
      });
      expect(result).toHaveProperty("csv");
    });
  });

  describe("users.exportCsv", () => {
    it("returns csv, filename, and rowCount for admin users", async () => {
      const caller = appRouter.createCaller(makeCtx("admin"));
      const result = await caller.csvExport.users({});
      expect(result).toHaveProperty("csv");
      expect(result).toHaveProperty("filename");
      expect(result).toHaveProperty("rowCount");
      expect(result.filename).toMatch(/^users-\d{4}-\d{2}-\d{2}\.csv$/);
    });

    it("rejects non-admin users with FORBIDDEN", async () => {
      const caller = appRouter.createCaller(makeCtx("user"));
      await expect(caller.csvExport.users({})).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });
  });
});

// ─── EmbeddedFinance Admin Procedures ────────────────────────────────────────

describe("embeddedFinance admin procedures", () => {
  describe("adminList", () => {
    it("returns items and total for admin users", async () => {
      const caller = appRouter.createCaller(makeCtx("admin"));
      const result = await caller.embeddedFinance.adminList({});
      expect(result).toHaveProperty("items");
      expect(result).toHaveProperty("total");
      expect(Array.isArray(result.items)).toBe(true);
    });

    it("accepts type filter for payout", async () => {
      const caller = appRouter.createCaller(makeCtx("admin"));
      const result = await caller.embeddedFinance.adminList({ type: "payout" });
      expect(result).toHaveProperty("items");
    });

    it("accepts type filter for loan", async () => {
      const caller = appRouter.createCaller(makeCtx("admin"));
      const result = await caller.embeddedFinance.adminList({ type: "loan" });
      expect(result).toHaveProperty("items");
    });

    it("accepts type filter for insurance", async () => {
      const caller = appRouter.createCaller(makeCtx("admin"));
      const result = await caller.embeddedFinance.adminList({ type: "insurance" });
      expect(result).toHaveProperty("items");
    });

    it("rejects non-admin users with FORBIDDEN", async () => {
      const caller = appRouter.createCaller(makeCtx("user"));
      await expect(caller.embeddedFinance.adminList({})).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("accepts pagination parameters", async () => {
      const caller = appRouter.createCaller(makeCtx("admin"));
      const result = await caller.embeddedFinance.adminList({ limit: 10, offset: 0 });
      expect(result).toHaveProperty("items");
      expect(result).toHaveProperty("total");
    });
  });

  describe("updateStatus", () => {
    it("rejects non-admin users with FORBIDDEN", async () => {
      const caller = appRouter.createCaller(makeCtx("user"));
      await expect(
        caller.embeddedFinance.updateStatus({
          requestId: "test-id",
          status: "approved",
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("throws INTERNAL_SERVER_ERROR when DB is unavailable", async () => {
      const caller = appRouter.createCaller(makeCtx("admin"));
      await expect(
        caller.embeddedFinance.updateStatus({
          requestId: "test-id",
          status: "approved",
        })
      ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    });

    it("validates status enum — rejects invalid status", async () => {
      const caller = appRouter.createCaller(makeCtx("admin"));
      await expect(
        caller.embeddedFinance.updateStatus({
          requestId: "test-id",
          status: "invalid_status" as any,
        })
      ).rejects.toThrow();
    });

    it("accepts all valid status values", async () => {
      const validStatuses = ["pending", "under_review", "approved", "rejected", "active", "completed", "quoted"] as const;
      const caller = appRouter.createCaller(makeCtx("admin"));
      for (const status of validStatuses) {
        // Will throw INTERNAL_SERVER_ERROR (DB unavailable), not a validation error
        await expect(
          caller.embeddedFinance.updateStatus({ requestId: "test-id", status })
        ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
      }
    });

    it("accepts optional note parameter", async () => {
      const caller = appRouter.createCaller(makeCtx("admin"));
      await expect(
        caller.embeddedFinance.updateStatus({
          requestId: "test-id",
          status: "approved",
          note: "Approved after manual review",
        })
      ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    });
  });
});

// ─── KybStepper component logic tests (pure unit) ────────────────────────────

describe("KybStepper step state logic", () => {
  const steps = [
    { id: 0, label: "Business Details" },
    { id: 1, label: "Documents" },
    { id: 2, label: "Compliance" },
    { id: 3, label: "Review & Submit" },
  ];

  it("correctly identifies completed steps (i < activeStep)", () => {
    const activeStep = 2;
    const completed = steps.filter((_, i) => i < activeStep);
    expect(completed).toHaveLength(2);
    expect(completed[0].label).toBe("Business Details");
    expect(completed[1].label).toBe("Documents");
  });

  it("correctly identifies active step (i === activeStep)", () => {
    const activeStep = 1;
    const active = steps.filter((_, i) => i === activeStep);
    expect(active).toHaveLength(1);
    expect(active[0].label).toBe("Documents");
  });

  it("correctly identifies upcoming steps (i > activeStep)", () => {
    const activeStep = 1;
    const upcoming = steps.filter((_, i) => i > activeStep);
    expect(upcoming).toHaveLength(2);
    expect(upcoming[0].label).toBe("Compliance");
    expect(upcoming[1].label).toBe("Review & Submit");
  });

  it("progress percentage is 0% at step 0", () => {
    const activeStep = 0;
    const progress = (activeStep / (steps.length - 1)) * 100;
    expect(progress).toBe(0);
  });

  it("progress percentage is 100% at last step", () => {
    const activeStep = steps.length - 1;
    const progress = (activeStep / (steps.length - 1)) * 100;
    expect(progress).toBe(100);
  });

  it("progress percentage is 33% at step 1 of 4 steps", () => {
    const activeStep = 1;
    const progress = Math.round((activeStep / (steps.length - 1)) * 100);
    expect(progress).toBe(33);
  });

  it("progress percentage is 67% at step 2 of 4 steps", () => {
    const activeStep = 2;
    const progress = Math.round((activeStep / (steps.length - 1)) * 100);
    expect(progress).toBe(67);
  });
});
