/**
 * Vitest tests for auditLogs tRPC router
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock DB helpers ──────────────────────────────────────────────────────────

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getAuditLogs: vi.fn().mockResolvedValue([
      {
        id: 1,
        actorId: 10,
        actorName: "Admin User",
        actorEmail: "admin@tourismpay.io",
        action: "kyb.document.verified",
        entityType: "kyb_document",
        entityId: "42",
        description: "Document approved",
        before: { status: "pending" },
        after: { status: "verified" },
        createdAt: new Date("2026-01-15T10:00:00Z"),
      },
    ]),
    getAuditLogStats: vi.fn().mockResolvedValue({
      total: 150,
      today: 12,
      byAction: [
        { action: "kyb.document.verified", count: 80 },
        { action: "kyb.application.approve", count: 40 },
      ],
      byEntityType: [
        { entityType: "kyb_document", count: 100 },
        { entityType: "kyb_application", count: 50 },
      ],
    }),
    getSidebarBadgeCounts: vi.fn().mockResolvedValue({
      kybPending: 5,
      bisProcessing: 3,
    }),
    createAuditLog: vi.fn().mockResolvedValue({
      id: 99,
      actorId: 10,
      actorName: "Admin User",
      actorEmail: "admin@tourismpay.io",
      action: "test.action",
      entityType: "test_entity",
      entityId: "1",
      description: "Test audit log",
      before: null,
      after: null,
      createdAt: new Date(),
    }),
  };
});

// ─── Test contexts ────────────────────────────────────────────────────────────

const adminCtx: TrpcContext = {
  user: {
    id: 10,
    name: "Admin User",
    email: "admin@tourismpay.io",
    role: "admin",
    openId: "admin-open-id",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

const userCtx: TrpcContext = {
  user: {
    id: 20,
    name: "Regular User",
    email: "user@tourismpay.io",
    role: "user",
    openId: "user-open-id",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

const anonCtx: TrpcContext = { user: null };

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("auditLogs router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("list (admin only)", () => {
    it("returns audit log entries for admin", async () => {
      const caller = appRouter.createCaller(adminCtx);
      const result = await caller.auditLogs.list({});
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty("action", "kyb.document.verified");
    });

    it("rejects non-admin users", async () => {
      const caller = appRouter.createCaller(userCtx);
      await expect(caller.auditLogs.list({})).rejects.toThrow();
    });

    it("rejects unauthenticated users", async () => {
      const caller = appRouter.createCaller(anonCtx);
      await expect(caller.auditLogs.list({})).rejects.toThrow();
    });

    it("accepts optional filters", async () => {
      const caller = appRouter.createCaller(adminCtx);
      const result = await caller.auditLogs.list({
        action: "kyb.document.verified",
        entityType: "kyb_document",
        limit: 10,
        offset: 0,
      });
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("stats (admin only)", () => {
    it("returns audit log statistics for admin", async () => {
      const caller = appRouter.createCaller(adminCtx);
      const result = await caller.auditLogs.stats();
      expect(result).toHaveProperty("total", 150);
      expect(result).toHaveProperty("today", 12);
      expect(result).toHaveProperty("byAction");
      expect(Array.isArray(result.byAction)).toBe(true);
    });

    it("rejects non-admin users", async () => {
      const caller = appRouter.createCaller(userCtx);
      await expect(caller.auditLogs.stats()).rejects.toThrow();
    });
  });

  describe("sidebarBadges (protected)", () => {
    it("returns sidebar badge counts for authenticated users", async () => {
      const caller = appRouter.createCaller(adminCtx);
      const result = await caller.auditLogs.sidebarBadges();
      expect(result).toHaveProperty("kybPending", 5);
      expect(result).toHaveProperty("bisProcessing", 3);
    });

    it("returns sidebar badge counts for regular users", async () => {
      const caller = appRouter.createCaller(userCtx);
      const result = await caller.auditLogs.sidebarBadges();
      expect(result).toHaveProperty("kybPending");
      expect(result).toHaveProperty("bisProcessing");
    });

    it("rejects unauthenticated users", async () => {
      const caller = appRouter.createCaller(anonCtx);
      await expect(caller.auditLogs.sidebarBadges()).rejects.toThrow();
    });
  });

  describe("create (admin only)", () => {
    it("creates an audit log entry for admin", async () => {
      const caller = appRouter.createCaller(adminCtx);
      const result = await caller.auditLogs.create({
        action: "test.action",
        entityType: "test_entity",
        entityId: "1",
        description: "Test audit log",
      });
      expect(result).toHaveProperty("success", true);
      expect(result).toHaveProperty("log");
      expect(result.log).toHaveProperty("action", "test.action");
    });

    it("rejects non-admin users", async () => {
      const caller = appRouter.createCaller(userCtx);
      await expect(
        caller.auditLogs.create({
          action: "test.action",
          entityType: "test_entity",
          entityId: "1",
        })
      ).rejects.toThrow();
    });

    it("accepts optional before/after state", async () => {
      const caller = appRouter.createCaller(adminCtx);
      const result = await caller.auditLogs.create({
        action: "kyb.document.verified",
        entityType: "kyb_document",
        entityId: "42",
        description: "Document approved",
        before: { status: "pending" },
        after: { status: "verified" },
      });
      expect(result.success).toBe(true);
    });
  });
});
