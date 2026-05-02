/**
 * Round 38 Tests
 * - wallet.searchTransactions: full-text search, currency/type/date/amount filters, pagination
 * - loyalty.getPartners: returns active partners, optional category filter
 * - loyalty.earnWithPartner: applies bonus multiplier, rejects inactive/missing partner
 * - loyalty.createPartner: admin-only, creates partner with multiplier
 * - bis.getMyAssignments: returns investigations assigned to current user, filters by status
 * - bis.assignInvestigation: admin-only, assigns/unassigns investigation
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";

// ─── Mock DB ─────────────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
  getUser: vi.fn(),
  createUser: vi.fn(),
  getUserNotifications: vi.fn().mockResolvedValue([]),
  markNotificationRead: vi.fn().mockResolvedValue(true),
  markAllNotificationsRead: vi.fn().mockResolvedValue(true),
  createUserNotification: vi.fn().mockResolvedValue({ id: 1 }),
  getWalletBalances: vi.fn().mockResolvedValue([]),
  getWalletTransactions: vi.fn().mockResolvedValue([]),
  createWalletTransaction: vi.fn(),
  updateWalletBalance: vi.fn(),
  getBalanceAlerts: vi.fn().mockResolvedValue([]),
  createBalanceAlert: vi.fn(),
  updateBalanceAlert: vi.fn(),
  deleteBalanceAlert: vi.fn(),
  getSpendingLimits: vi.fn().mockResolvedValue([]),
  createSpendingLimit: vi.fn(),
  updateSpendingLimit: vi.fn(),
  deleteSpendingLimit: vi.fn(),
  getBisInvestigations: vi.fn().mockResolvedValue([]),
  getBisInvestigationById: vi.fn().mockResolvedValue(null),
  updateBisInvestigationStatus: vi.fn().mockResolvedValue(undefined),
  createBisInvestigation: vi.fn(),
  getAuditLogs: vi.fn().mockResolvedValue([]),
  createAuditLog: vi.fn().mockResolvedValue({ id: 1 }),
  getBiometricEnrollments: vi.fn().mockResolvedValue([]),
  getBiometricEnrollment: vi.fn().mockResolvedValue(null),
  createBiometricEnrollment: vi.fn(),
  updateBiometricEnrollment: vi.fn(),
  revokeBiometricEnrollment: vi.fn(),
  getPendingBisInvestigations: vi.fn().mockResolvedValue([]),
  getProcessingBisInvestigations: vi.fn().mockResolvedValue([]),
  advanceBisInvestigationToProcessing: vi.fn().mockResolvedValue(null),
  completeBisInvestigation: vi.fn().mockResolvedValue(null),
}));

vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

// ─── Context factories ────────────────────────────────────────────────────────
const anonCtx = () => ({ user: null, req: {} as any, res: {} as any });
const userCtx = (id = 42) => ({
  user: { id, email: "user@test.com", role: "user" as const, name: "Test User", openId: `u${id}`, createdAt: new Date() },
  req: {} as any,
  res: {} as any,
});
const adminCtx = () => ({
  user: { id: 1, email: "admin@test.com", role: "admin" as const, name: "Admin", openId: "a1", createdAt: new Date() },
  req: {} as any,
  res: {} as any,
});

// ─── wallet.searchTransactions ────────────────────────────────────────────────
describe("wallet.searchTransactions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects anonymous users", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.wallet.searchTransactions({})).rejects.toThrow();
  });

  it("returns empty result when DB is unavailable", async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockResolvedValueOnce(null);
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.searchTransactions({});
    expect(result.transactions).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("returns paginated transactions with default limit", async () => {
    const { getDb } = await import("./db");
    const mockTx = {
      id: 1, userId: "42", fromCurrency: "USDC", toCurrency: null, amount: "100.00",
      toAmount: null, type: "deposit", status: "completed", note: "Test deposit",
      reference: "REF-001", counterparty: null, fee: "0.00", createdAt: 1700000000,
      completedAt: 1700000001,
    };
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockResolvedValueOnce([mockTx]).mockResolvedValueOnce([{ count: 1 }]),
    };
    vi.mocked(getDb).mockResolvedValueOnce(mockDb as any);
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.searchTransactions({ limit: 50, offset: 0 });
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(0);
  });

  it("accepts all valid filter combinations", async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockResolvedValueOnce(null);
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.searchTransactions({
      query: "hotel",
      currency: "USDC",
      type: "send",
      dateFrom: Date.now() - 7 * 24 * 60 * 60 * 1000,
      dateTo: Date.now(),
      amountMin: 10,
      amountMax: 500,
      limit: 20,
      offset: 0,
    });
    expect(result).toHaveProperty("transactions");
    expect(result).toHaveProperty("total");
  });

  it("rejects invalid currency filter", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.wallet.searchTransactions({ currency: "INVALID" as any })
    ).rejects.toThrow();
  });

  it("rejects invalid transaction type filter", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.wallet.searchTransactions({ type: "unknown" as any })
    ).rejects.toThrow();
  });

  it("rejects limit exceeding 200", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.wallet.searchTransactions({ limit: 201 })
    ).rejects.toThrow();
  });

  it("returns correct shape when DB has data", async () => {
    const { getDb } = await import("./db");
    const mockTx = {
      id: 5, userId: "42", fromCurrency: "NGN", toCurrency: null, amount: "5000.00",
      toAmount: null, type: "receive", status: "completed", note: "Payment received",
      reference: "PAY-123", counterparty: "Alice", fee: "0.00", createdAt: 1700000000,
      completedAt: 1700000001,
    };
    let whereCallCount = 0;
    const mockDb: any = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation(() => {
        whereCallCount++;
        // First where call chains to orderBy/limit/offset (rows query)
        // Second where call is the count query (resolves directly)
        if (whereCallCount === 2) return Promise.resolve([{ count: 1 }]);
        return mockDb;
      }),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockResolvedValue([mockTx]),
    };
    vi.mocked(getDb).mockResolvedValueOnce(mockDb as any);
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.searchTransactions({ query: "Payment" });
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].amount).toBe(5000);
    expect(result.total).toBe(1);
  });

  it("parses amount and fee as numbers", async () => {
    const { getDb } = await import("./db");
    const mockTx = {
      id: 10, userId: "42", fromCurrency: "USDC", toCurrency: "NGN", amount: "250.50",
      toAmount: "375750.00", type: "swap", status: "completed", note: null,
      reference: "SWAP-1", counterparty: null, fee: "1.25", createdAt: 1700000000,
      completedAt: 1700000001,
    };
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn()
        .mockResolvedValueOnce([mockTx])
        .mockResolvedValueOnce([{ count: 1 }]),
    };
    vi.mocked(getDb).mockResolvedValueOnce(mockDb as any);
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.wallet.searchTransactions({});
    expect(typeof result.transactions[0].amount).toBe("number");
    expect(typeof result.transactions[0].fee).toBe("number");
    expect(result.transactions[0].amount).toBe(250.5);
    expect(result.transactions[0].fee).toBe(1.25);
    expect(result.transactions[0].toAmount).toBe(375750);
  });
});

// ─── loyalty.getPartners ──────────────────────────────────────────────────────
describe("loyalty.getPartners", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects anonymous users", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.loyalty.getPartners()).rejects.toThrow();
  });

  it("returns empty list when DB is unavailable", async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockResolvedValueOnce(null);
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.loyalty.getPartners();
    expect(result.partners).toEqual([]);
  });

  it("returns active partners sorted by bonus multiplier descending", async () => {
    const { getDb } = await import("./db");
    const partners = [
      { id: "p1", name: "Hotel Chain A", logoUrl: null, description: null, bonusMultiplier: "2.50", category: "hotel", isActive: true, createdAt: 1700000000, updatedAt: 1700000000 },
      { id: "p2", name: "Airline B", logoUrl: null, description: null, bonusMultiplier: "1.50", category: "airline", isActive: true, createdAt: 1700000000, updatedAt: 1700000000 },
    ];
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValueOnce(partners),
    };
    vi.mocked(getDb).mockResolvedValueOnce(mockDb as any);
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.loyalty.getPartners();
    expect(result.partners).toHaveLength(2);
    expect(result.partners[0].bonusMultiplier).toBe(2.5);
    expect(result.partners[1].bonusMultiplier).toBe(1.5);
  });

  it("accepts optional category filter", async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockResolvedValueOnce(null);
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.loyalty.getPartners({ category: "hotel" });
    expect(result.partners).toEqual([]);
  });

  it("parses bonusMultiplier as a number", async () => {
    const { getDb } = await import("./db");
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValueOnce([
        { id: "p1", name: "Partner X", logoUrl: null, description: null, bonusMultiplier: "3.00", category: "retail", isActive: true, createdAt: 1700000000, updatedAt: 1700000000 },
      ]),
    };
    vi.mocked(getDb).mockResolvedValueOnce(mockDb as any);
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.loyalty.getPartners();
    expect(typeof result.partners[0].bonusMultiplier).toBe("number");
    expect(result.partners[0].bonusMultiplier).toBe(3.0);
  });
});

// ─── loyalty.earnWithPartner ──────────────────────────────────────────────────
describe("loyalty.earnWithPartner", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects anonymous users", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(
      caller.loyalty.earnWithPartner({ partnerId: "p1", basePoints: 100 })
    ).rejects.toThrow();
  });

  it("throws NOT_FOUND when DB is unavailable", async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockResolvedValueOnce(null);
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.loyalty.earnWithPartner({ partnerId: "p1", basePoints: 100 })
    ).rejects.toThrow();
  });

  it("throws NOT_FOUND for inactive partner", async () => {
    const { getDb } = await import("./db");
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      // First select returns empty (partner not found/inactive)
      execute: vi.fn().mockResolvedValue([]),
    };
    // Partner query returns empty array
    mockDb.where.mockResolvedValueOnce([]);
    vi.mocked(getDb).mockResolvedValueOnce(mockDb as any);
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.loyalty.earnWithPartner({ partnerId: "nonexistent", basePoints: 100 })
    ).rejects.toThrow("Partner not found or inactive");
  });

  it("rejects basePoints below 1", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.loyalty.earnWithPartner({ partnerId: "p1", basePoints: 0 })
    ).rejects.toThrow();
  });

  it("applies bonus multiplier correctly", async () => {
    const { getDb } = await import("./db");
    const partner = {
      id: "p1", name: "Hotel Chain A", logoUrl: null, description: null,
      bonusMultiplier: "2.00", category: "hotel", isActive: true,
      createdAt: 1700000000, updatedAt: 1700000000,
    };
    const account = {
      userId: "42", tier: "BRONZE", pointsBalance: 1000, lifetimePoints: 1000,
      tierProtectedUntil: null, updatedAt: 1700000000,
    };
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue([]),
    };
    // Sequence: partner query → empty account check → insert tx → update balance → get account
    mockDb.where
      .mockResolvedValueOnce([partner])   // partner lookup
      .mockResolvedValueOnce([])          // existing account check (empty → create)
      .mockResolvedValueOnce([account]);  // get account after update
    vi.mocked(getDb).mockResolvedValueOnce(mockDb as any);
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.loyalty.earnWithPartner({ partnerId: "p1", basePoints: 100 });
    expect(result.basePoints).toBe(100);
    expect(result.finalPoints).toBe(200);
    expect(result.bonusPoints).toBe(100);
    expect(result.multiplier).toBe(2.0);
    expect(result.partnerName).toBe("Hotel Chain A");
  });

  it("returns referenceId with PARTNER- prefix", async () => {
    const { getDb } = await import("./db");
    const partner = {
      id: "p2", name: "Airline B", logoUrl: null, description: null,
      bonusMultiplier: "1.50", category: "airline", isActive: true,
      createdAt: 1700000000, updatedAt: 1700000000,
    };
    const account = {
      userId: "42", tier: "BRONZE", pointsBalance: 500, lifetimePoints: 500,
      tierProtectedUntil: null, updatedAt: 1700000000,
    };
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue([]),
    };
    mockDb.where
      .mockResolvedValueOnce([partner])
      .mockResolvedValueOnce([account]) // account exists
      .mockResolvedValueOnce([account]);
    vi.mocked(getDb).mockResolvedValueOnce(mockDb as any);
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.loyalty.earnWithPartner({ partnerId: "p2", basePoints: 200 });
    expect(result.referenceId).toMatch(/^PARTNER-AIRLINE-B-/);
  });
});

// ─── loyalty.createPartner ────────────────────────────────────────────────────
describe("loyalty.createPartner", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects non-admin users", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.loyalty.createPartner({ name: "Test Partner", bonusMultiplier: 1.5, category: "retail" })
    ).rejects.toThrow();
  });

  it("rejects anonymous users", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(
      caller.loyalty.createPartner({ name: "Test Partner", bonusMultiplier: 1.5, category: "retail" })
    ).rejects.toThrow();
  });

  it("throws when DB is unavailable", async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockResolvedValueOnce(null);
    const caller = appRouter.createCaller(adminCtx() as any);
    await expect(
      caller.loyalty.createPartner({ name: "Test Partner", bonusMultiplier: 1.5, category: "retail" })
    ).rejects.toThrow("Database unavailable");
  });

  it("creates partner and returns the new partner", async () => {
    const { getDb } = await import("./db");
    const newPartner = {
      id: "new-uuid", name: "Luxury Hotels", logoUrl: "https://example.com/logo.png",
      description: "Premium hotel chain", bonusMultiplier: "3.00", category: "hotel",
      isActive: true, createdAt: Date.now(), updatedAt: Date.now(),
    };
    const mockDb = {
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValueOnce([newPartner]),
    };
    vi.mocked(getDb).mockResolvedValueOnce(mockDb as any);
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.loyalty.createPartner({
      name: "Luxury Hotels",
      logoUrl: "https://example.com/logo.png",
      description: "Premium hotel chain",
      bonusMultiplier: 3.0,
      category: "hotel",
    });
    expect(result.partner).toBeDefined();
    expect(result.partner.name).toBe("Luxury Hotels");
  });

  it("rejects bonusMultiplier below 0.1", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    await expect(
      caller.loyalty.createPartner({ name: "Test", bonusMultiplier: 0.05, category: "retail" })
    ).rejects.toThrow();
  });

  it("rejects bonusMultiplier above 10", async () => {
    const caller = appRouter.createCaller(adminCtx() as any);
    await expect(
      caller.loyalty.createPartner({ name: "Test", bonusMultiplier: 11, category: "retail" })
    ).rejects.toThrow();
  });
});

// ─── bis.getMyAssignments ─────────────────────────────────────────────────────
describe("bis.getMyAssignments", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects anonymous users", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(caller.bis.getMyAssignments()).rejects.toThrow();
  });

  it("returns empty list when DB is unavailable", async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockResolvedValueOnce(null);
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.bis.getMyAssignments();
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("returns investigations assigned to the current user", async () => {
    const { getDb } = await import("./db");
    const nowMs = Date.now();
    const futureMs = nowMs + 24 * 60 * 60 * 1000;
    const inv = {
      id: 1, referenceId: "BIS-2024-0001", subjectFullName: "John Doe",
      status: "processing", riskLevel: "medium", riskScore: 55,
      tier: "standard", dueAt: futureMs, assignedAt: new Date(),
      assignedToName: "Test User", createdAt: nowMs,
    };
    let whereCallCount = 0;
    const mockDb: any = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation(() => {
        whereCallCount++;
        // First where call is for the rows query (chains to orderBy)
        // Second where call is for the count query (resolves directly)
        if (whereCallCount === 2) return Promise.resolve([{ cnt: 1 }]);
        return mockDb;
      }),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockResolvedValue([inv]),
    };
    vi.mocked(getDb).mockResolvedValueOnce(mockDb as any);
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.bis.getMyAssignments();
    expect(result.items).toHaveLength(1);
    expect(result.items[0].referenceId).toBe("BIS-2024-0001");
    expect(result.total).toBe(1);
  });

  it("marks overdue investigations correctly", async () => {
    const { getDb } = await import("./db");
    const nowMs = Date.now();
    const pastMs = nowMs - 5 * 60 * 60 * 1000; // 5 hours ago
    const inv = {
      id: 2, referenceId: "BIS-2024-0002", subjectFullName: "Jane Smith",
      status: "processing", riskLevel: "high", riskScore: 75,
      tier: "comprehensive", dueAt: pastMs, assignedAt: new Date(),
      assignedToName: "Test User", createdAt: nowMs - 10 * 60 * 60 * 1000,
    };
    let whereCallCount = 0;
    const mockDb: any = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation(() => {
        whereCallCount++;
        if (whereCallCount === 2) return Promise.resolve([{ cnt: 1 }]);
        return mockDb;
      }),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockResolvedValue([inv]),
    };
    vi.mocked(getDb).mockResolvedValueOnce(mockDb as any);
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.bis.getMyAssignments();
    expect(result.items[0].isOverdue).toBe(true);
    expect(result.items[0].overdueHours).toBeGreaterThanOrEqual(4);
  });

  it("does not mark completed investigations as overdue", async () => {
    const { getDb } = await import("./db");
    const nowMs = Date.now();
    const pastMs = nowMs - 5 * 60 * 60 * 1000;
    const inv = {
      id: 3, referenceId: "BIS-2024-0003", subjectFullName: "Bob Brown",
      status: "completed", riskLevel: "low", riskScore: 20,
      tier: "basic", dueAt: pastMs, assignedAt: new Date(),
      assignedToName: "Test User", createdAt: nowMs - 24 * 60 * 60 * 1000,
    };
    let whereCallCount = 0;
    const mockDb: any = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation(() => {
        whereCallCount++;
        if (whereCallCount === 2) return Promise.resolve([{ cnt: 1 }]);
        return mockDb;
      }),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockResolvedValue([inv]),
    };
    vi.mocked(getDb).mockResolvedValueOnce(mockDb as any);
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.bis.getMyAssignments();
    expect(result.items[0].isOverdue).toBe(false);
  });

  it("accepts status filter", async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockResolvedValueOnce(null);
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.bis.getMyAssignments({ status: "processing", limit: 10, offset: 0 });
    expect(result.items).toEqual([]);
  });

  it("rejects invalid status filter", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.bis.getMyAssignments({ status: "unknown" as any, limit: 10, offset: 0 })
    ).rejects.toThrow();
  });

  it("converts dueAt and assignedAt to numbers", async () => {
    const { getDb } = await import("./db");
    const nowMs = Date.now();
    const futureMs = nowMs + 24 * 60 * 60 * 1000;
    const assignedAtDate = new Date(nowMs - 3600000);
    const inv = {
      id: 4, referenceId: "BIS-2024-0004", subjectFullName: "Alice Green",
      status: "pending", riskLevel: null, riskScore: null,
      tier: "standard", dueAt: futureMs, assignedAt: assignedAtDate,
      assignedToName: "Test User", createdAt: nowMs - 7200000,
    };
    let whereCallCount = 0;
    const mockDb: any = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation(() => {
        whereCallCount++;
        if (whereCallCount === 2) return Promise.resolve([{ cnt: 1 }]);
        return mockDb;
      }),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockResolvedValue([inv]),
    };
    vi.mocked(getDb).mockResolvedValueOnce(mockDb as any);
    const caller = appRouter.createCaller(userCtx() as any);
    const result = await caller.bis.getMyAssignments();
    expect(typeof result.items[0].dueAt).toBe("number");
    expect(typeof result.items[0].assignedAt).toBe("number");
  });
});

// ─── bis.assignInvestigation ──────────────────────────────────────────────────
describe("bis.assignInvestigation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects non-admin users", async () => {
    const caller = appRouter.createCaller(userCtx() as any);
    await expect(
      caller.bis.assignInvestigation({ investigationId: 1, assigneeId: 2 })
    ).rejects.toThrow();
  });

  it("rejects anonymous users", async () => {
    const caller = appRouter.createCaller(anonCtx() as any);
    await expect(
      caller.bis.assignInvestigation({ investigationId: 1, assigneeId: 2 })
    ).rejects.toThrow();
  });

  it("throws when DB is unavailable", async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockResolvedValueOnce(null);
    const caller = appRouter.createCaller(adminCtx() as any);
    await expect(
      caller.bis.assignInvestigation({ investigationId: 1, assigneeId: 2 })
    ).rejects.toThrow("Database unavailable");
  });

  it("throws NOT_FOUND when investigation does not exist", async () => {
    const { getDb } = await import("./db");
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValueOnce([]), // investigation not found
    };
    vi.mocked(getDb).mockResolvedValueOnce(mockDb as any);
    const caller = appRouter.createCaller(adminCtx() as any);
    await expect(
      caller.bis.assignInvestigation({ investigationId: 999, assigneeId: 2 })
    ).rejects.toThrow("Investigation not found");
  });

  it("assigns investigation to a user and returns success", async () => {
    const { getDb } = await import("./db");
    const inv = { id: 1, referenceId: "BIS-2024-0001" };
    const assignee = { id: 2, name: "Analyst Alice" };
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn()
        .mockResolvedValueOnce([inv])    // investigation lookup
        .mockResolvedValueOnce([assignee]), // assignee lookup
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockResolvedValueOnce([]),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.bis.assignInvestigation({ investigationId: 1, assigneeId: 2 });
    expect(result.success).toBe(true);
    expect(result.assigneeName).toBe("Analyst Alice");
  });

  it("unassigns investigation when assigneeId is null", async () => {
    const { getDb } = await import("./db");
    const inv = { id: 1, referenceId: "BIS-2024-0001" };
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValueOnce([inv]),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockResolvedValueOnce([]),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const caller = appRouter.createCaller(adminCtx() as any);
    const result = await caller.bis.assignInvestigation({ investigationId: 1, assigneeId: null });
    expect(result.success).toBe(true);
    expect(result.assigneeName).toBeNull();
  });
});

// ─── Module exports ───────────────────────────────────────────────────────────
describe("loyaltyPartners schema", () => {
  it("exports loyaltyPartners table from schema", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.loyaltyPartners).toBeDefined();
  });
});
