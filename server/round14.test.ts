/**
 * Round 14 Tests — Comprehensive Audit
 * Covers:
 *   - biometric.list, enroll, revoke, stats
 *   - identity.getDid, createDid, listCredentials, issueCredential, revokeCredential, stats
 *   - sustainability.listProjects, myOffsets, purchaseOffset, stats
 *   - mesh.listCorridors, getQuote, history, send, stats
 *   - usersAdmin.listAll, stats, setRole
 *   - system.health, notifyOwner
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
const anonCtx: TrpcContext = { user: null, req: {} as any, res: {} as any };

// ─── biometric ────────────────────────────────────────────────────────────────
describe("biometric.list", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx);
    await expect(caller.biometric.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("returns empty array when db unavailable", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.biometric.list();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("biometric.enroll", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx);
    await expect(caller.biometric.enroll({ credentialId: "cred-1", publicKey: "pk-1" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("validates credentialId is non-empty", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.biometric.enroll({ credentialId: "", publicKey: "pk-1" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("throws when db unavailable", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.biometric.enroll({ credentialId: "cred-1", publicKey: "pk-1", deviceName: "Test Device" })).rejects.toThrow();
  });
});

describe("biometric.revoke", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx);
    await expect(caller.biometric.revoke({ id: "id-1" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("validates id is non-empty", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.biometric.revoke({ id: "" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("biometric.stats", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx);
    await expect(caller.biometric.stats()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("returns zero stats when db unavailable", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.biometric.stats();
    expect(result).toMatchObject({ total: 0, active: 0, revoked: 0 });
  });
});

// ─── identity ─────────────────────────────────────────────────────────────────
describe("identity.getDid", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx);
    await expect(caller.identity.getDid()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("returns null when db unavailable", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.identity.getDid();
    expect(result).toBeNull();
  });
});

describe("identity.createDid", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx);
    await expect(caller.identity.createDid()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("throws when db unavailable", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.identity.createDid()).rejects.toThrow();
  });
});

describe("identity.listCredentials", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx);
    await expect(caller.identity.listCredentials()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("returns empty array when db unavailable", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.identity.listCredentials();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("identity.issueCredential", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx);
    await expect(caller.identity.issueCredential({ type: "T", issuer: "I", subject: "S", credentialData: {} })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("validates required fields", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.identity.issueCredential({ type: "", issuer: "I", subject: "S", credentialData: {} })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("throws when db unavailable", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.identity.issueCredential({ type: "IdentityCredential", issuer: "TourismPay", subject: "User", credentialData: { issuedAt: Date.now() } })).rejects.toThrow();
  });
});

describe("identity.stats", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx);
    await expect(caller.identity.stats()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("returns zero stats when db unavailable", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.identity.stats();
    expect(result).toMatchObject({ hasDid: false, totalCredentials: 0, activeCredentials: 0, revokedCredentials: 0 });
  });
});

// ─── sustainability ───────────────────────────────────────────────────────────
describe("sustainability.listProjects", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx);
    await expect(caller.sustainability.listProjects()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("returns non-empty static project list", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.sustainability.listProjects();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty("id");
    expect(result[0]).toHaveProperty("pricePerTon");
  });
});

describe("sustainability.myOffsets", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx);
    await expect(caller.sustainability.myOffsets()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("returns empty array when db unavailable", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.sustainability.myOffsets();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("sustainability.purchaseOffset", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx);
    await expect(caller.sustainability.purchaseOffset({ projectId: "p1", amountTons: 1 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("throws when db unavailable (checked before project lookup)", async () => {
    const caller = appRouter.createCaller(makeCtx());
    // db is mocked to null, so INTERNAL_SERVER_ERROR is thrown before project lookup
    await expect(caller.sustainability.purchaseOffset({ projectId: "nonexistent", amountTons: 1 })).rejects.toThrow();
  });
  it("validates amountTons is positive", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.sustainability.purchaseOffset({ projectId: "p1", amountTons: -1 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("sustainability.stats", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx);
    await expect(caller.sustainability.stats()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("returns zero stats when db unavailable", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.sustainability.stats();
    // totalSpentUsd is a number (not a string) from the router
    expect(result).toMatchObject({ totalOffsetTons: 0, totalSpentUsd: 0, purchaseCount: 0 });
  });
});

// ─── mesh ─────────────────────────────────────────────────────────────────────
describe("mesh.listCorridors", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx);
    await expect(caller.mesh.listCorridors()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("returns non-empty static corridors list", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.mesh.listCorridors();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty("id");
    expect(result[0]).toHaveProperty("rate");
  });
});

describe("mesh.getQuote", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx);
    await expect(caller.mesh.getQuote({ corridorId: "ng-ke", amount: 100 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("throws for invalid corridor", async () => {
    const caller = appRouter.createCaller(makeCtx());
    // mesh.getQuote throws a plain Error (not TRPCError) when corridor not found
    await expect(caller.mesh.getQuote({ corridorId: "invalid", amount: 100 })).rejects.toThrow();
  });
  it("returns quote for valid corridor", async () => {
    const caller = appRouter.createCaller(makeCtx());
    // Get the first corridor id
    const corridors = await caller.mesh.listCorridors();
    const firstId = corridors[0].id;
    const quote = await caller.mesh.getQuote({ corridorId: firstId, amount: 100 });
    expect(quote).toHaveProperty("sendAmount");
    expect(quote).toHaveProperty("receivedAmount");
    expect(quote).toHaveProperty("fee");
  });
});

describe("mesh.history", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx);
    await expect(caller.mesh.history({ limit: 10 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("returns empty array when db unavailable", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.mesh.history({ limit: 10 });
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("mesh.send", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx);
    await expect(caller.mesh.send({ corridorId: "ng-ke", amount: 100, recipientAddress: "addr" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("throws when db unavailable before corridor lookup", async () => {
    const caller = appRouter.createCaller(makeCtx());
    // db is null, so INTERNAL_SERVER_ERROR is thrown before corridor lookup
    await expect(caller.mesh.send({ corridorId: "ng-ke", amount: 100, recipientAddress: "addr" })).rejects.toThrow();
  });
  it("validates amount is positive", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.mesh.send({ corridorId: "ng-ke", amount: -1, recipientAddress: "addr" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("mesh.stats", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx);
    await expect(caller.mesh.stats()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("returns zero stats when db unavailable", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.mesh.stats();
    expect(result).toMatchObject({ totalTransactions: 0, activeCorridors: expect.any(Number) });
  });
});

// ─── usersAdmin ───────────────────────────────────────────────────────────────
describe("usersAdmin.listAll", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx);
    await expect(caller.usersAdmin.listAll({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("requires admin role", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(caller.usersAdmin.listAll({})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("throws INTERNAL_SERVER_ERROR when db unavailable", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    await expect(caller.usersAdmin.listAll({})).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});

describe("usersAdmin.stats", () => {
  it("requires admin role", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(caller.usersAdmin.stats()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("throws INTERNAL_SERVER_ERROR when db unavailable", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    await expect(caller.usersAdmin.stats()).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});

describe("usersAdmin.setRole", () => {
  it("requires admin role", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(caller.usersAdmin.setRole({ userId: 2, role: "admin" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("prevents self-role change", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    await expect(caller.usersAdmin.setRole({ userId: 99, role: "user" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("throws when db unavailable", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    await expect(caller.usersAdmin.setRole({ userId: 2, role: "admin" })).rejects.toThrow();
  });
});

// ─── system ───────────────────────────────────────────────────────────────────
describe("system.health", () => {
  it("is publicly accessible with a timestamp", async () => {
    const caller = appRouter.createCaller(anonCtx);
    const result = await caller.system.health({ timestamp: Date.now() });
    // health returns { ok: true }
    expect(result).toHaveProperty("ok", true);
  });
});

describe("system.notifyOwner", () => {
  it("requires admin role (adminProcedure)", async () => {
    const caller = appRouter.createCaller(anonCtx);
    await expect(caller.system.notifyOwner({ title: "Test", content: "Content" })).rejects.toThrow();
  });
  it("non-admin user is also rejected", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(caller.system.notifyOwner({ title: "Test", content: "Content" })).rejects.toThrow();
  });
  it("admin can send notification", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.system.notifyOwner({ title: "Test Notification", content: "Test content" });
    expect(result).toMatchObject({ success: expect.any(Boolean) });
  });
});
