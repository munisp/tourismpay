/**
 * server/smoke/helpers.ts
 *
 * Shared test helpers, context factories, and mock setup for the
 * TourismPay master smoke test suite.
 *
 * Stakeholders:
 *   1. Tourist          – foreign visitor using the platform
 *   2. Merchant         – hotel/restaurant/tour operator
 *   3. Agent            – cash-in/cash-out agent
 *   4. Admin            – platform super-admin
 *   5. Compliance Officer – KYB/KYC reviewer
 *   6. NOC Operator     – network operations center
 *   7. Settlement Officer – handles payouts and reconciliation
 *   8. BIS Analyst      – background investigation specialist
 */

import { vi, expect } from "vitest";
import type { TrpcContext } from "../_core/context";
import type { User } from "../../drizzle/schema";

// ─── Base User Factory ────────────────────────────────────────────────────────

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    openId: "sub_test_0001",
    email: "test@tourismpay.dev",
    name: "Test User",
    role: "user",
    kycStatus: "approved",
    country: "NG",
    phone: "+2348012345678",
    loginCount: 5,
    loginMethod: "oauth",
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  } as User;
}

// ─── Stakeholder Context Factories ───────────────────────────────────────────

export function touristCtx(overrides: Partial<User> = {}): TrpcContext {
  return {
    user: makeUser({ id: 10, role: "tourist", email: "tourist@tourismpay.dev", name: "Alice Tourist", ...overrides }),
    req: { protocol: "https", headers: { "x-forwarded-for": "1.2.3.4" } } as unknown as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

export function merchantCtx(overrides: Partial<User> = {}): TrpcContext {
  return {
    user: makeUser({ id: 20, role: "merchant", email: "merchant@tourismpay.dev", name: "Bob Merchant", ...overrides }),
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

export function agentCtx(overrides: Partial<User> = {}): TrpcContext {
  return {
    user: makeUser({ id: 30, role: "user", email: "agent@tourismpay.dev", name: "Carol Agent", ...overrides }),
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

export function adminCtx(overrides: Partial<User> = {}): TrpcContext {
  return {
    user: makeUser({ id: 40, role: "admin", email: "admin@tourismpay.dev", name: "Dave Admin", ...overrides }),
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

export function complianceCtx(overrides: Partial<User> = {}): TrpcContext {
  return {
    user: makeUser({ id: 50, role: "compliance_officer", email: "compliance@tourismpay.dev", name: "Eve Compliance", ...overrides }),
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

export function nocCtx(overrides: Partial<User> = {}): TrpcContext {
  return {
    user: makeUser({ id: 60, role: "noc_operator", email: "noc@tourismpay.dev", name: "Frank NOC", ...overrides }),
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

export function settlementCtx(overrides: Partial<User> = {}): TrpcContext {
  return {
    user: makeUser({ id: 70, role: "settlement_officer", email: "settlement@tourismpay.dev", name: "Grace Settlement", ...overrides }),
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

export function bisAnalystCtx(overrides: Partial<User> = {}): TrpcContext {
  return {
    user: makeUser({ id: 80, role: "bis_analyst", email: "bis@tourismpay.dev", name: "Henry BIS", ...overrides }),
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

export function anonCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── All Stakeholder Contexts ─────────────────────────────────────────────────

export const ALL_STAKEHOLDERS = {
  tourist: touristCtx(),
  merchant: merchantCtx(),
  agent: agentCtx(),
  admin: adminCtx(),
  compliance: complianceCtx(),
  noc: nocCtx(),
  settlement: settlementCtx(),
  bisAnalyst: bisAnalystCtx(),
  anon: anonCtx(),
};

// ─── DB Mock Factory ──────────────────────────────────────────────────────────

export function makeDbMock() {
  return {
    // Users
    getDb: vi.fn().mockResolvedValue(null),
    upsertUser: vi.fn().mockResolvedValue(undefined),
    getUserByOpenId: vi.fn().mockResolvedValue(null),
    getUserById: vi.fn().mockResolvedValue(null),
    // Wallets
    getWalletBalance: vi.fn().mockResolvedValue({ balance: "10000.00", currency: "NGN" }),
    getWalletTransactions: vi.fn().mockResolvedValue([]),
    createWalletTransaction: vi.fn().mockResolvedValue({ id: 1, transactionRef: "TXN-001" }),
    // KYB
    getKybApplications: vi.fn().mockResolvedValue([]),
    getKybApplicationById: vi.fn().mockResolvedValue(null),
    createKybApplication: vi.fn().mockResolvedValue({ id: 1, applicationId: "KYB-001", status: "draft" }),
    updateKybApplicationStatus: vi.fn().mockResolvedValue(undefined),
    // KYC
    getKycRecords: vi.fn().mockResolvedValue([]),
    // BIS
    getBisInvestigations: vi.fn().mockResolvedValue([]),
    getBisInvestigationById: vi.fn().mockResolvedValue(null),
    createBisInvestigation: vi.fn().mockResolvedValue({ id: 1, investigationId: "BIS-001", status: "pending", riskLevel: "low" }),
    updateBisInvestigationStatus: vi.fn().mockResolvedValue(undefined),
    // Establishments
    getEstablishments: vi.fn().mockResolvedValue([]),
    createEstablishment: vi.fn().mockResolvedValue({ id: 1, name: "Test Hotel", type: "hotel", country: "NG" }),
    // Fraud
    getFraudAlerts: vi.fn().mockResolvedValue([]),
    createFraudAlert: vi.fn().mockResolvedValue({ id: 1, alertId: "FRD-001", severity: "high", status: "open" }),
    updateFraudAlertStatus: vi.fn().mockResolvedValue(undefined),
    // SOC
    getSocAlerts: vi.fn().mockResolvedValue([]),
    createSocAlert: vi.fn().mockResolvedValue({ id: 1, alertId: "SOC-001", type: "intrusion", severity: "critical" }),
    updateSocAlertStatus: vi.fn().mockResolvedValue(undefined),
    // Audit
    getAuditLogs: vi.fn().mockResolvedValue([]),
    createAuditLog: vi.fn().mockResolvedValue({ id: 1 }),
    // Dashboard
    getDashboardStats: vi.fn().mockResolvedValue({ totalEstablishments: 10, totalInvestigations: 5, totalCountries: 12 }),
    getTourismEvents: vi.fn().mockResolvedValue([]),
    // Search
    globalSearch: vi.fn().mockResolvedValue([]),
  };
}

// ─── Middleware Mocks ─────────────────────────────────────────────────────────

export function setupMiddlewareMocks() {
  vi.mock("../_core/keycloak", () => ({
    keycloak: { protect: vi.fn(() => (req: unknown, res: unknown, next: () => void) => next()) },
    getKeycloakToken: vi.fn().mockResolvedValue({ access_token: "mock-token", expires_in: 3600 }),
    verifyKeycloakToken: vi.fn().mockResolvedValue({ sub: "sub_test_0001", email: "test@tourismpay.dev" }),
  }));

  vi.mock("../_core/tigerbeetle", () => ({
    tbCreateAccounts: vi.fn().mockResolvedValue([]),
    tbCreateTransfers: vi.fn().mockResolvedValue([]),
    tbGetAccountBalances: vi.fn().mockResolvedValue([{ debits_posted: BigInt(0), credits_posted: BigInt(100000) }]),
    tbLookupAccounts: vi.fn().mockResolvedValue([{ id: BigInt(1), debits_posted: BigInt(0), credits_posted: BigInt(100000) }]),
    LEDGER_CODES: { NGN: 566, USD: 840, EUR: 978, ENAIRA: 999, ENAIRA_FLOAT: 9990, ENAIRA_MERCHANT_FLOAT: 9991 },
  }));

  vi.mock("../_core/temporal", () => ({
    getTemporalClient: vi.fn().mockResolvedValue({
      workflow: {
        start: vi.fn().mockResolvedValue({ workflowId: "wf-mock-001", firstExecutionRunId: "run-001" }),
        execute: vi.fn().mockResolvedValue({ status: "completed" }),
        getHandle: vi.fn().mockReturnValue({ result: vi.fn().mockResolvedValue({ status: "completed" }) }),
      },
    }),
    startKybOnboardingWorkflow: vi.fn().mockResolvedValue({ workflowId: "wf-kyb-001" }),
    startFraudInvestigationWorkflow: vi.fn().mockResolvedValue({ workflowId: "wf-fraud-001" }),
    startRemittanceWorkflow: vi.fn().mockResolvedValue({ workflowId: "wf-remit-001" }),
    startSettlementWorkflow: vi.fn().mockResolvedValue({ workflowId: "wf-settle-001" }),
    startTaxRemittanceWorkflow: vi.fn().mockResolvedValue({ workflowId: "wf-tax-001" }),
  }));

  vi.mock("../_core/permify", () => ({
    checkPermission: vi.fn().mockResolvedValue(true),
    requirePermission: vi.fn().mockResolvedValue(undefined),
    createRelationship: vi.fn().mockResolvedValue(undefined),
    deleteRelationship: vi.fn().mockResolvedValue(undefined),
    RESOURCES: { WALLET: "wallet", PAYMENT: "payment", KYB: "kyb", BIS: "bis", SETTLEMENT: "settlement" },
    RESOURCES_V2: {
      WALLET: "wallet", PAYMENT: "payment", KYB: "kyb", BIS: "bis", SETTLEMENT: "settlement",
      ENAIRA_WALLET: "enaira_wallet", TAX_REMITTANCE: "tax_remittance", TRIP_PLAN: "trip_plan",
      GDS_BOOKING: "gds_booking", MERCHANT_REVENUE: "merchant_revenue",
    },
    ACTIONS: { READ: "read", WRITE: "write", DELETE: "delete", APPROVE: "approve", REJECT: "reject" },
    ACTIONS_V2: {
      READ: "read", WRITE: "write", DELETE: "delete", APPROVE: "approve", REJECT: "reject",
      LOAD: "load", PAY: "pay", FREEZE: "freeze", INVESTIGATE: "investigate",
    },
  }));

  vi.mock("../_core/dapr", () => ({
    daprClient: {
      invoker: { invoke: vi.fn().mockResolvedValue({ status: "ok" }) },
      pubsub: { publish: vi.fn().mockResolvedValue(undefined) },
      state: { get: vi.fn().mockResolvedValue(null), save: vi.fn().mockResolvedValue(undefined) },
    },
    invokeSettlementService: vi.fn().mockResolvedValue({ status: "ok", settlementId: "settle-001" }),
    invokeEnairaGateway: vi.fn().mockResolvedValue({ status: "ok" }),
  }));

  vi.mock("../_core/fluvio", () => ({
    fluvioProducer: {
      send: vi.fn().mockResolvedValue(undefined),
      sendRecord: vi.fn().mockResolvedValue(undefined),
    },
    streamPaymentEvent: vi.fn().mockResolvedValue(undefined),
    streamFxEvent: vi.fn().mockResolvedValue(undefined),
    streamNocEvent: vi.fn().mockResolvedValue(undefined),
    streamTaxEvent: vi.fn().mockResolvedValue(undefined),
    streamTipEvent: vi.fn().mockResolvedValue(undefined),
    FLUVIO_TOPICS: {
      PAYMENT_EVENTS: "payment-events",
      FX_RATE_UPDATES: "fx-rate-updates",
      FRAUD_ALERTS: "fraud-alerts",
      NOC_EVENTS: "noc-events",
    },
  }));

  vi.mock("../_core/kafka", () => ({
    publishEvent: vi.fn().mockResolvedValue(undefined),
    TOPICS: {
      PAYMENT_CREATED: "payment.created",
      PAYMENT_COMPLETED: "payment.completed",
      KYB_SUBMITTED: "kyb.submitted",
      KYB_APPROVED: "kyb.approved",
      FRAUD_DETECTED: "fraud.detected",
      SETTLEMENT_INITIATED: "settlement.initiated",
      TAX_COLLECTED: "tax.collected",
    },
  }));

  vi.mock("../_core/redis", () => ({
    getCache: vi.fn().mockResolvedValue(null),
    setCache: vi.fn().mockResolvedValue(undefined),
    deleteCache: vi.fn().mockResolvedValue(undefined),
    cacheGet: vi.fn().mockResolvedValue(null),
    cacheSet: vi.fn().mockResolvedValue(undefined),
    redisClient: {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue("OK"),
      del: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
    },
  }));

  vi.mock("../_core/lakehouse", () => ({
    lakehouseClient: {
      ingest: vi.fn().mockResolvedValue({ success: true }),
      query: vi.fn().mockResolvedValue([]),
    },
    ingestToLakehouse: vi.fn().mockResolvedValue(undefined),
    queryLakehouse: vi.fn().mockResolvedValue([]),
  }));

  vi.mock("../_core/apisix", () => ({
    apisixAdmin: {
      createRoute: vi.fn().mockResolvedValue({ id: "route-001" }),
      updateRoute: vi.fn().mockResolvedValue(undefined),
      deleteRoute: vi.fn().mockResolvedValue(undefined),
    },
    syncApisixRoutes: vi.fn().mockResolvedValue(undefined),
    registerOpenAppSecPolicy: vi.fn().mockResolvedValue(undefined),
  }));

  vi.mock("../_core/llm", () => ({
    invokeLLM: vi.fn().mockResolvedValue({
      choices: [{ message: { content: "AI response for testing" } }],
    }),
  }));

  vi.mock("../_core/settlementClient", () => ({
    settlementClient: {
      createSettlement: vi.fn().mockResolvedValue({ id: "settle-001", status: "pending" }),
      getSettlement: vi.fn().mockResolvedValue({ id: "settle-001", status: "completed" }),
    },
  }));
}

// ─── Assertion Helpers ────────────────────────────────────────────────────────

export function expectUnauthorized(fn: () => Promise<unknown>) {
  return expect(fn()).rejects.toThrow(/unauthorized|not authenticated|UNAUTHORIZED/i);
}

export function expectForbidden(fn: () => Promise<unknown>) {
  return expect(fn()).rejects.toThrow(/forbidden|not authorized|FORBIDDEN|admin/i);
}

export function expectNotFound(fn: () => Promise<unknown>) {
  return expect(fn()).rejects.toThrow(/not found|NOT_FOUND/i);
}
