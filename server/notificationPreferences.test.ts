/**
 * Tests for notificationPreferences and bisJobs tRPC routers.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock DB helpers ──────────────────────────────────────────────────────────

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getNotificationPreferences: vi.fn(),
    upsertNotificationPreferences: vi.fn(),
    getBisInvestigations: vi.fn(),
    getPendingBisInvestigations: vi.fn().mockResolvedValue([]),
    getProcessingBisInvestigations: vi.fn().mockResolvedValue([]),
  };
});

import {
  getNotificationPreferences,
  upsertNotificationPreferences,
  getBisInvestigations,
  getPendingBisInvestigations,
  getProcessingBisInvestigations,
} from "./db";

// ─── Mock BIS auto-advance job ────────────────────────────────────────────────

vi.mock("./jobs/bisAutoAdvance", () => ({
  runBisAutoAdvanceCycle: vi.fn().mockResolvedValue({ advanced: 0, completed: 0, failed: 0 }),
  startBisAutoAdvanceJob: vi.fn(),
  stopBisAutoAdvanceJob: vi.fn(),
}));

// ─── Context helpers ──────────────────────────────────────────────────────────

type AuthUser = NonNullable<TrpcContext["user"]>;

function makeCtx(overrides: Partial<AuthUser> = {}): TrpcContext {
  const user: AuthUser = {
    id: 42,
    openId: "test-user-42",
    email: "user@test.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function makeAdminCtx(): TrpcContext {
  return makeCtx({ id: 1, role: "admin", openId: "admin-1" });
}

function makeAnonCtx(): TrpcContext {
  return {
    user: undefined,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── Default prefs fixture ────────────────────────────────────────────────────

const DEFAULT_PREFS = {
  id: 10,
  userId: 42,
  bisEnabled: true,
  kybEnabled: true,
  fraudEnabled: true,
  socEnabled: true,
  systemEnabled: true,
  reportEnabled: true,
  inAppEnabled: true,
  emailEnabled: false,
  quietHoursStart: null,
  quietHoursEnd: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ─── notifPrefs.get ───────────────────────────────────────────────────────────

describe("notifPrefs.get", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns saved preferences for authenticated user", async () => {
    vi.mocked(getNotificationPreferences).mockResolvedValue(DEFAULT_PREFS);
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.notifPrefs.get();
    expect(result.userId).toBe(42);
    expect(result.bisEnabled).toBe(true);
    expect(result.emailEnabled).toBe(false);
    expect(getNotificationPreferences).toHaveBeenCalledWith(42);
  });

  it("returns defaults when no preferences exist yet", async () => {
    vi.mocked(getNotificationPreferences).mockResolvedValue(null);
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.notifPrefs.get();
    // Should return default values
    expect(result.bisEnabled).toBe(true);
    expect(result.kybEnabled).toBe(true);
    expect(result.inAppEnabled).toBe(true);
    expect(result.emailEnabled).toBe(false);
  });

  it("throws UNAUTHORIZED for unauthenticated user", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(caller.notifPrefs.get()).rejects.toThrow();
  });
});

// ─── notifPrefs.update ────────────────────────────────────────────────────────

describe("notifPrefs.update", () => {
  beforeEach(() => vi.clearAllMocks());

  it("saves updated preferences", async () => {
    const updated = { ...DEFAULT_PREFS, bisEnabled: false, emailEnabled: true };
    vi.mocked(upsertNotificationPreferences).mockResolvedValue(updated);
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.notifPrefs.update({
      bisEnabled: false,
      emailEnabled: true,
    });
    expect(result.bisEnabled).toBe(false);
    expect(result.emailEnabled).toBe(true);
    expect(upsertNotificationPreferences).toHaveBeenCalledWith(42, {
      bisEnabled: false,
      emailEnabled: true,
    });
  });

  it("validates quiet hours format", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.notifPrefs.update({ quietHoursStart: "25:00" })
    ).rejects.toThrow();
  });

  it("rejects mismatched quiet hours (start without end)", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.notifPrefs.update({ quietHoursStart: "22:00", quietHoursEnd: null })
    ).rejects.toThrow(TRPCError);
  });

  it("accepts valid quiet hours pair", async () => {
    const updated = { ...DEFAULT_PREFS, quietHoursStart: "22:00", quietHoursEnd: "07:00" };
    vi.mocked(upsertNotificationPreferences).mockResolvedValue(updated);
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.notifPrefs.update({
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
    });
    expect(result.quietHoursStart).toBe("22:00");
    expect(result.quietHoursEnd).toBe("07:00");
  });

  it("throws UNAUTHORIZED for unauthenticated user", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(caller.notifPrefs.update({ bisEnabled: false })).rejects.toThrow();
  });
});

// ─── notifPrefs.reset ─────────────────────────────────────────────────────────

describe("notifPrefs.reset", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resets preferences to defaults", async () => {
    vi.mocked(upsertNotificationPreferences).mockResolvedValue(DEFAULT_PREFS);
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.notifPrefs.reset();
    expect(result.bisEnabled).toBe(true);
    expect(result.emailEnabled).toBe(false);
    // Should call upsert with all default values
    expect(upsertNotificationPreferences).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        bisEnabled: true,
        kybEnabled: true,
        fraudEnabled: true,
        socEnabled: true,
        systemEnabled: true,
        reportEnabled: true,
        inAppEnabled: true,
        emailEnabled: false,
        quietHoursStart: null,
        quietHoursEnd: null,
      })
    );
  });
});

// ─── bisJobs.queueStatus ──────────────────────────────────────────────────────

describe("bisJobs.queueStatus", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns queue status for admin", async () => {
    vi.mocked(getPendingBisInvestigations).mockResolvedValue([
      { id: 1, referenceId: "BIS-2025-0001", subjectFullName: "Alice", tier: "standard", createdAt: new Date() } as any,
    ]);
    vi.mocked(getProcessingBisInvestigations).mockResolvedValue([
      { id: 2, referenceId: "BIS-2025-0002", subjectFullName: "Bob", tier: "enhanced", updatedAt: new Date() } as any,
    ]);
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.bisJobs.queueStatus();
    expect(result.pendingCount).toBe(1);
    expect(result.processingCount).toBe(1);
    expect(result).toHaveProperty("pending");
    expect(result).toHaveProperty("processing");
  });

  it("throws FORBIDDEN for non-admin user", async () => {
    const caller = appRouter.createCaller(makeCtx({ role: "user" }));
    await expect(caller.bisJobs.queueStatus()).rejects.toThrow(TRPCError);
  });

  it("throws UNAUTHORIZED for unauthenticated user", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(caller.bisJobs.queueStatus()).rejects.toThrow();
  });
});

// ─── bisJobs.triggerAutoAdvance ───────────────────────────────────────────────

describe("bisJobs.triggerAutoAdvance", () => {
  beforeEach(() => vi.clearAllMocks());

  it("triggers auto-advance cycle for admin", async () => {
    vi.mocked(getBisInvestigations).mockResolvedValue([]);
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.bisJobs.triggerAutoAdvance();
    expect(result).toHaveProperty("success");
    expect(result.success).toBe(true);
  });

  it("throws FORBIDDEN for non-admin user", async () => {
    const caller = appRouter.createCaller(makeCtx({ role: "user" }));
    await expect(caller.bisJobs.triggerAutoAdvance()).rejects.toThrow(TRPCError);
  });
});
