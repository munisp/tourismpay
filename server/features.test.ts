/**
 * TourismPay Feature Procedures — Vitest Test Suite
 * Tests for BIS, KYB, Africa Registry, AI Copilot, Fraud Monitor, and SOC Dashboard routers.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock DB helpers ──────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
  upsertUser: vi.fn().mockResolvedValue(undefined),
  getUserByOpenId: vi.fn().mockResolvedValue(undefined),
  getBisInvestigations: vi.fn().mockResolvedValue([]),
  getBisInvestigationById: vi.fn().mockResolvedValue(null),
  createBisInvestigation: vi.fn().mockResolvedValue({ id: 1, investigationId: "BIS-001", status: "pending", riskLevel: "low", subjectFullName: "Test Subject", subjectDateOfBirth: null, subjectNationality: null, subjectCountry: "NG", establishmentId: null, requestedBy: 1, metadata: null, createdAt: new Date(), updatedAt: new Date() }),
  updateBisInvestigationStatus: vi.fn().mockResolvedValue(undefined),
  getKybApplications: vi.fn().mockResolvedValue([]),
  getKybApplicationById: vi.fn().mockResolvedValue(null),
  createKybApplication: vi.fn().mockResolvedValue({ id: 1, applicationId: "KYB-001", status: "draft", establishmentName: "Test Hotel", establishmentType: "hotel", country: "NG", submittedBy: 1, metadata: null, createdAt: new Date(), updatedAt: new Date() }),
  updateKybApplicationStatus: vi.fn().mockResolvedValue(undefined),
  getEstablishments: vi.fn().mockResolvedValue([]),
  createEstablishment: vi.fn().mockResolvedValue({ id: 1, name: "Lagos Hilton", type: "hotel", country: "NG", kybStatus: "pending", ownerId: 1, metadata: null, createdAt: new Date(), updatedAt: new Date() }),
  getTourismEvents: vi.fn().mockResolvedValue([]),
  getDashboardStats: vi.fn().mockResolvedValue({ totalEstablishments: 0, totalInvestigations: 0, totalCountries: 12 }),
  getFraudAlerts: vi.fn().mockResolvedValue([]),
  createFraudAlert: vi.fn().mockResolvedValue({ id: 1, alertId: "FRD-001", severity: "high", status: "open", description: "Test alert", amount: "1000", currency: "NGN", country: "NG", ruleTriggered: "velocity", gnnScore: "0.85", metadata: null, createdAt: new Date(), updatedAt: new Date() }),
  updateFraudAlertStatus: vi.fn().mockResolvedValue(undefined),
  getSocAlerts: vi.fn().mockResolvedValue([]),
  createSocAlert: vi.fn().mockResolvedValue({ id: 1, alertId: "SOC-001", type: "intrusion", severity: "critical", status: "open", title: "Test Intrusion", description: "Test", source: "wazuh", affectedSystem: "payment-api", country: "NG", metadata: null, createdAt: new Date(), updatedAt: new Date() }),
  updateSocAlertStatus: vi.fn().mockResolvedValue(undefined),
}));

// ─── Mock LLM ─────────────────────────────────────────────────────────────────
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: "Here is a suggested itinerary for Lagos, Nigeria..." } }],
  }),
}));

// ─── Context Helpers ──────────────────────────────────────────────────────────
function makeAuthContext(role: "user" | "admin" = "user"): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user-001",
      email: "test@tourismpay.io",
      name: "Test User",
      loginMethod: "manus",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function makeAnonContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── BIS Router Tests ─────────────────────────────────────────────────────────
describe("bis router", () => {
  it("list returns empty array when no investigations exist", async () => {
    // bis.list uses bisProcedure — requires admin or bis_analyst role
    const caller = appRouter.createCaller(makeAuthContext("admin"));
    const result = await caller.bis.list({ limit: 10 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("create returns a new investigation with correct fields", async () => {
    // bis.create requires admin role (adminProcedure)
    const caller = appRouter.createCaller(makeAuthContext("admin"));
    const result = await caller.bis.create({
      subjectFullName: "Chidi Okeke",
      subjectCountry: "NG",
    });
    expect(result).toMatchObject({
      investigationId: expect.stringContaining("BIS-"),
      status: "pending",
    });
  });

  it("stats returns numeric counts", async () => {
    // bis.stats uses bisProcedure — requires admin or bis_analyst role
    const caller = appRouter.createCaller(makeAuthContext("admin"));
    const stats = await caller.bis.stats();
    expect(typeof stats.total).toBe("number");
    expect(typeof stats.pending).toBe("number");
    expect(typeof stats.completed).toBe("number");
  });

  it("requires authentication for create", async () => {
    const caller = appRouter.createCaller(makeAnonContext());
    await expect(caller.bis.create({ subjectFullName: "Test", subjectCountry: "NG" }))
      .rejects.toThrow();
  });
});

// ─── KYB Router Tests ─────────────────────────────────────────────────────────
describe("kyb router", () => {
  it("listEstablishments returns empty array when no establishments exist", async () => {
    const caller = appRouter.createCaller(makeAuthContext());
    const result = await caller.kyb.listEstablishments({ limit: 10 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("createEstablishment returns a new establishment with correct fields", async () => {
    const caller = appRouter.createCaller(makeAuthContext());
    const result = await caller.kyb.createEstablishment({
      name: "Lagos Hilton",
      type: "hotel",
      country: "NG",
    });
    expect(result).toMatchObject({
      name: "Lagos Hilton",
      type: "hotel",
      country: "NG",
    });
  });

  it("stats returns numeric counts", async () => {
    const caller = appRouter.createCaller(makeAuthContext());
    const stats = await caller.kyb.stats();
    expect(stats).toBeDefined();
    expect(typeof stats.total).toBe("number");
  });

  it("supportedCountries returns a non-empty list", async () => {
    const caller = appRouter.createCaller(makeAnonContext());
    const result = await caller.kyb.supportedCountries();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it("requires authentication for createEstablishment", async () => {
    const caller = appRouter.createCaller(makeAnonContext());
    await expect(caller.kyb.createEstablishment({ name: "Test", type: "hotel", country: "NG" }))
      .rejects.toThrow();
  });
});

// ─── Africa Registry Router Tests ─────────────────────────────────────────────
describe("africa router", () => {
  it("countries returns a non-empty list of African countries", async () => {
    const caller = appRouter.createCaller(makeAnonContext());
    const result = await caller.africa.countries();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    // Should include Nigeria
    const ng = result.find((c: { code: string }) => c.code === "NG");
    expect(ng).toBeDefined();
    expect((ng as { name: string })?.name).toBe("Nigeria");
  });

  it("country returns correct data for NG", async () => {
    const caller = appRouter.createCaller(makeAnonContext());
    const result = await caller.africa.country({ code: "NG" });
    expect(result).not.toBeNull();
    expect(result?.currency).toBe("NGN");
    expect(result?.capital).toBe("Abuja");
  });

  it("country throws for unknown code", async () => {
    const caller = appRouter.createCaller(makeAnonContext());
    await expect(caller.africa.country({ code: "XX" })).rejects.toThrow();
  });

  it("events returns tourism events list", async () => {
    const caller = appRouter.createCaller(makeAnonContext());
    const result = await caller.africa.events({ country: "NG" });
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── AI Copilot Router Tests ───────────────────────────────────────────────────
describe("copilot router", () => {
  it("generateItinerary returns a response with content", async () => {
    const caller = appRouter.createCaller(makeAuthContext());
    const result = await caller.copilot.generateItinerary({
      destination: "Lagos",
      country: "NG",
      duration: 3,
      interests: ["culture", "food"],
      budget: "mid-range",
    });
    expect(result).toHaveProperty("itinerary");
    expect(typeof result.itinerary).toBe("string");
    expect(result.itinerary.length).toBeGreaterThan(0);
  });

  it("requires authentication", async () => {
    const caller = appRouter.createCaller(makeAnonContext());
    await expect(caller.copilot.generateItinerary({
      destination: "Nairobi",
      country: "KE",
      duration: 2,
      interests: [],
      budget: "budget",
    })).rejects.toThrow();
  });
});

// ─── Fraud Router Tests ────────────────────────────────────────────────────────
describe("fraud router", () => {
  it("list returns empty array when no alerts exist", async () => {
    const caller = appRouter.createCaller(makeAuthContext());
    const result = await caller.fraud.list({ limit: 10 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("create returns a new fraud alert", async () => {
    const caller = appRouter.createCaller(makeAuthContext());
    const result = await caller.fraud.create({
      severity: "high",
      description: "Velocity anomaly detected",
      amount: "1000",
      currency: "NGN",
      country: "NG",
      ruleTriggered: "velocity_check",
      gnnScore: "0.85",
    });
    expect(result).toMatchObject({
      alertId: expect.stringContaining("FRD-"),
      severity: "high",
      status: "open",
    });
  });

  it("stats returns numeric breakdown", async () => {
    const caller = appRouter.createCaller(makeAuthContext());
    const stats = await caller.fraud.stats();
    expect(typeof stats.total).toBe("number");
    expect(typeof stats.open).toBe("number");
    expect(typeof stats.critical).toBe("number");
  });
});

// ─── SOC Router Tests ─────────────────────────────────────────────────────────
describe("soc router", () => {
  it("list returns empty array when no alerts exist", async () => {
    const caller = appRouter.createCaller(makeAuthContext());
    const result = await caller.soc.list({ limit: 10 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("create returns a new SOC alert", async () => {
    const caller = appRouter.createCaller(makeAuthContext());
    const result = await caller.soc.create({
      type: "intrusion",
      severity: "critical",
      title: "Unauthorized access attempt",
      source: "wazuh",
      affectedSystem: "payment-api",
      country: "NG",
    });
    expect(result).toMatchObject({
      alertId: expect.stringContaining("SOC-"),
      type: "intrusion",
      severity: "critical",
      status: "open",
    });
  });

  it("stats returns numeric breakdown", async () => {
    const caller = appRouter.createCaller(makeAuthContext());
    const stats = await caller.soc.stats();
    expect(typeof stats.total).toBe("number");
    expect(typeof stats.open).toBe("number");
    expect(typeof stats.critical).toBe("number");
  });
});

// ─── Auth Router Tests ────────────────────────────────────────────────────────
describe("auth router", () => {
  it("me returns user when authenticated", async () => {
    const caller = appRouter.createCaller(makeAuthContext());
    const user = await caller.auth.me();
    expect(user).not.toBeNull();
    expect(user?.email).toBe("test@tourismpay.io");
  });

  it("me returns null when unauthenticated", async () => {
    const caller = appRouter.createCaller(makeAnonContext());
    const user = await caller.auth.me();
    expect(user).toBeNull();
  });

  it("logout clears session cookie and returns success", async () => {
    const ctx = makeAuthContext();
    const clearedCookies: string[] = [];
    (ctx.res as any).clearCookie = (name: string) => clearedCookies.push(name);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(clearedCookies.length).toBe(1);
  });
});
