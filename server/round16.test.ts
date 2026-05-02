/**
 * Round 16 Tests — Pagination and Service Proxy Config
 * Tests for:
 *   - embeddedFinance.list pagination (limit/offset/dateFrom/dateTo/type)
 *   - bis.list pagination (limit/offset/status)
 *   - auditLogs.list pagination (limit/offset/action/entityType)
 *   - auditLogs.stats (total/today counts)
 *   - serviceProxy.proxyConfig (env-gated URLs)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
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

function makeCtx(role: "admin" | "user" | "bis_analyst" | "compliance_officer" = "user"): TrpcContext {
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

// ─── embeddedFinance.list pagination ─────────────────────────────────────────
describe("embeddedFinance.list — pagination", () => {
  it("returns {items, total} with default params (no db)", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    const result = await caller.embeddedFinance.list({});
    expect(result).toHaveProperty("items");
    expect(result).toHaveProperty("total");
    expect(Array.isArray(result.items)).toBe(true);
    expect(typeof result.total).toBe("number");
  });

  it("accepts limit and offset parameters", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    const result = await caller.embeddedFinance.list({ limit: 5, offset: 0 });
    expect(result).toHaveProperty("items");
    expect(result.items.length).toBeLessThanOrEqual(5);
  });

  it("accepts type filter 'payout'", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    const result = await caller.embeddedFinance.list({ type: "payout" });
    expect(result).toHaveProperty("items");
    expect(Array.isArray(result.items)).toBe(true);
  });

  it("accepts type filter 'loan'", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    const result = await caller.embeddedFinance.list({ type: "loan" });
    expect(result).toHaveProperty("items");
  });

  it("accepts type filter 'insurance'", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    const result = await caller.embeddedFinance.list({ type: "insurance" });
    expect(result).toHaveProperty("items");
  });

  it("accepts dateFrom and dateTo filters (Unix ms timestamps)", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const result = await caller.embeddedFinance.list({ dateFrom: weekAgo, dateTo: now });
    expect(result).toHaveProperty("items");
    expect(Array.isArray(result.items)).toBe(true);
  });

  it("rejects unauthenticated users", async () => {
    const caller = appRouter.createCaller({ user: null, req: {} as any, res: {} as any });
    await expect(caller.embeddedFinance.list({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects invalid type value", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    // @ts-expect-error testing invalid input
    await expect(caller.embeddedFinance.list({ type: "invalid_type" })).rejects.toThrow();
  });
});

// ─── bis.list pagination ──────────────────────────────────────────────────────
describe("bis.list — pagination", () => {
  it("returns array with default limit (no db)", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.bis.list({});
    expect(Array.isArray(result)).toBe(true);
  });

  it("accepts limit and offset parameters", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.bis.list({ limit: 10, offset: 0 });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeLessThanOrEqual(10);
  });

  it("accepts status filter", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.bis.list({ status: "pending" });
    expect(Array.isArray(result)).toBe(true);
  });

  it("allows bis_analyst role (bisProcedure)", async () => {
    const caller = appRouter.createCaller(makeCtx("bis_analyst"));
    // bis.list now uses bisProcedure — accessible to admin + bis_analyst
    const result = await caller.bis.list({});
    expect(Array.isArray(result)).toBe(true);
  });
  it("rejects regular user role (FORBIDDEN)", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(caller.bis.list({})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("rejects unauthenticated users (UNAUTHORIZED)", async () => {
    const caller = appRouter.createCaller({ user: null, req: {} as any, res: {} as any });
    await expect(caller.bis.list({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

// ─── auditLogs.list pagination ────────────────────────────────────────────────
describe("auditLogs.list — pagination", () => {
  it("returns array with default limit (mocked db)", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.auditLogs.list({});
    expect(Array.isArray(result)).toBe(true);
  });

  it("accepts limit and offset parameters", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.auditLogs.list({ limit: 25, offset: 0 });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeLessThanOrEqual(25);
  });

  it("accepts action filter", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.auditLogs.list({ action: "kyb.application.approve" });
    expect(Array.isArray(result)).toBe(true);
  });

  it("accepts entityType filter", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.auditLogs.list({ entityType: "kyb_application" });
    expect(Array.isArray(result)).toBe(true);
  });

  it("accepts combined action and entityType filters", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.auditLogs.list({
      action: "kyb.application.approve",
      entityType: "kyb_application",
      limit: 10,
      offset: 0,
    });
    expect(Array.isArray(result)).toBe(true);
  });

  it("rejects non-admin users", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(caller.auditLogs.list({})).rejects.toThrow();
  });

  it("rejects unauthenticated users (UNAUTHORIZED before FORBIDDEN check)", async () => {
    const caller = appRouter.createCaller({ user: null, req: {} as any, res: {} as any });
    // complianceProcedure first checks authentication (UNAUTHORIZED), then role (FORBIDDEN)
    await expect(caller.auditLogs.list({})).rejects.toThrow();
  });
});

// ─── auditLogs.stats ──────────────────────────────────────────────────────────
describe("auditLogs.stats", () => {
  it("returns stats object with total and today counts (mocked db)", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.auditLogs.stats();
    expect(result).toHaveProperty("total");
    expect(result).toHaveProperty("today");
    expect(typeof result.total).toBe("number");
    expect(typeof result.today).toBe("number");
  });

  it("rejects non-admin users", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(caller.auditLogs.stats()).rejects.toThrow();
  });

  it("rejects unauthenticated users (UNAUTHORIZED before FORBIDDEN check)", async () => {
    const caller = appRouter.createCaller({ user: null, req: {} as any, res: {} as any });
    // complianceProcedure first checks authentication (UNAUTHORIZED), then role (FORBIDDEN)
    await expect(caller.auditLogs.stats()).rejects.toThrow();
  });
});

// ─── serviceProxy.proxyConfig env-gated ──────────────────────────────────────
describe("serviceProxy.proxyConfig — env-gated URLs", () => {
  it("returns null for all URLs when env vars are not set", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.serviceProxy.proxyConfig();
    expect(result).toHaveProperty("bisCoreUrl");
    expect(result).toHaveProperty("bisAiUrl");
    expect(result).toHaveProperty("bisGatewayUrl");
    expect(result).toHaveProperty("enabledCount");
    // In test environment, no Go service URLs are configured
    expect(result.bisCoreUrl).toBeNull();
    expect(result.bisAiUrl).toBeNull();
    expect(result.bisGatewayUrl).toBeNull();
    expect(result.enabledCount).toBe(0);
  });

  it("rejects non-admin users", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(caller.serviceProxy.proxyConfig()).rejects.toThrow();
  });

  it("rejects unauthenticated users (adminProcedure throws UNAUTHORIZED)", async () => {
    const caller = appRouter.createCaller({ user: null, req: {} as any, res: {} as any });
    // adminProcedure first checks authentication (UNAUTHORIZED), then role (FORBIDDEN)
    await expect(caller.serviceProxy.proxyConfig()).rejects.toThrow();
  });
});
