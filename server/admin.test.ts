import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock the database layer ──────────────────────────────────────────────────
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null), // DB not available in unit tests
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
}));

// ─── Context factories ────────────────────────────────────────────────────────

function makeAdminCtx(overrides: Partial<TrpcContext["user"]> = {}): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "admin-open-id",
      name: "Admin User",
      email: "admin@tourismpay.io",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      ...overrides,
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function makeUserCtx(overrides: Partial<TrpcContext["user"]> = {}): TrpcContext {
  return {
    user: {
      id: 2,
      openId: "user-open-id",
      name: "Regular User",
      email: "user@tourismpay.io",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      ...overrides,
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function makeAnonCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── RBAC Tests ───────────────────────────────────────────────────────────────

describe("RBAC — Admin Panel", () => {
  it("admin.platformStats: allows admin users", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    // DB returns null (not available), so we get default zeros
    const result = await caller.admin.platformStats();
    expect(result).toMatchObject({
      totalUsers: 0,
      adminUsers: 0,
      regularUsers: 0,
      recentSignups: 0,
    });
  });

  it("admin.platformStats: rejects regular users with FORBIDDEN", async () => {
    const caller = appRouter.createCaller(makeUserCtx());
    await expect(caller.admin.platformStats()).rejects.toThrow(/FORBIDDEN|permission/i);
  });

  it("admin.platformStats: rejects unauthenticated requests", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    // adminProcedure now throws UNAUTHORIZED for null user (auth check before role check)
    await expect(caller.admin.platformStats()).rejects.toThrow();
  });

  it("admin.listUsers: allows admin users", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.admin.listUsers({ limit: 10, offset: 0 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("admin.listUsers: rejects regular users with FORBIDDEN", async () => {
    const caller = appRouter.createCaller(makeUserCtx());
    await expect(caller.admin.listUsers()).rejects.toThrow(/FORBIDDEN|permission/i);
  });

  it("admin.setUserRole: rejects regular users with FORBIDDEN", async () => {
    const caller = appRouter.createCaller(makeUserCtx());
    await expect(
      caller.admin.setUserRole({ userId: 99, role: "admin" })
    ).rejects.toThrow(/FORBIDDEN|permission/i);
  });

  it("admin.setUserRole: prevents admin from changing their own role", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    // Admin user has id: 1, trying to change their own role
    await expect(
      caller.admin.setUserRole({ userId: 1, role: "user" })
    ).rejects.toThrow(/own role/i);
  });

  it("admin.myProfile: allows any authenticated user", async () => {
    const caller = appRouter.createCaller(makeUserCtx());
    // DB not available, falls back to ctx.user
    const result = await caller.admin.myProfile();
    expect(result).toMatchObject({ role: "user", openId: "user-open-id" });
  });

  it("admin.myProfile: rejects unauthenticated requests", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    // protectedProcedure throws UNAUTHORIZED for anon users
    await expect(caller.admin.myProfile()).rejects.toThrow();
  });
});

// ─── RBAC Tests — BIS adminProcedure guards ───────────────────────────────────

describe("RBAC — BIS Investigation Guards", () => {
  it("bis.create: rejects regular users with FORBIDDEN", async () => {
    const caller = appRouter.createCaller(makeUserCtx());
    await expect(
      caller.bis.create({
        subjectName: "John Doe",
        subjectDob: "1990-01-01",
        subjectNationality: "NG",
        subjectIdNumber: "12345678901",
        establishmentId: 1,
        requestedChecks: ["identity"],
        priority: "standard",
      })
    ).rejects.toThrow(/FORBIDDEN|permission/i);
  });

  it("bis.updateStatus: rejects regular users with FORBIDDEN", async () => {
    const caller = appRouter.createCaller(makeUserCtx());
    await expect(
      caller.bis.updateStatus({ id: 1, status: "completed" })
    ).rejects.toThrow(/FORBIDDEN|permission/i);
  });
});

// ─── RBAC Tests — KYB adminProcedure guards ───────────────────────────────────

describe("RBAC — KYB Review Guards", () => {
  it("kyb.reviewKybApplication: rejects regular users with FORBIDDEN", async () => {
    const caller = appRouter.createCaller(makeUserCtx());
    await expect(
      caller.kyb.reviewKybApplication({
        id: 1,
        decision: "approved",
        reviewNotes: "Looks good",
      })
    ).rejects.toThrow(/FORBIDDEN|permission/i);
  });

  it("kyb.reviewKybApplication: rejects unauthenticated requests (UNAUTHORIZED)", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    // adminProcedure now throws UNAUTHORIZED for null user (auth check before role check)
    await expect(
      caller.kyb.reviewKybApplication({
        id: 1,
        decision: "approved",
        reviewNotes: "Looks good",
      })
    ).rejects.toThrow();
  });
});
