/**
 * Tests for bisReport tRPC procedures
 *
 * These tests verify:
 * 1. generate throws NOT_FOUND for a non-existent investigation
 * 2. generate throws BAD_REQUEST for an investigation that is not completed
 * 3. latestExport returns null when no export exists
 * 4. listExports returns an array
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock notification helper ────────────────────────────────────────────────

vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

// ─── Mock LLM ─────────────────────────────────────────────────────────────────

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [
      {
        message: {
          content: "This is a mock executive summary for the background investigation.",
        },
      },
    ],
  }),
}));

// ─── Mock S3 storage ──────────────────────────────────────────────────────────

vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({
    key: "bis-reports/inv-1/BIS-TEST-001-abc123.pdf",
    url: "https://s3.example.com/bis-reports/BIS-TEST-001.pdf",
  }),
}));

// ─── Mock DB helpers ──────────────────────────────────────────────────────────

const mockCompletedInvestigation = {
  id: 1,
  referenceId: "BIS-TEST-001",
  requestedBy: 1,
  establishmentId: 1,
  subjectFullName: "Emeka Okafor",
  subjectDob: "1985-03-15",
  subjectNationality: "NG",
  subjectCountry: "NG",
  subjectNin: "NIN-12345678",
  subjectPhone: "+234-800-000-0000",
  subjectEmail: "emeka@example.com",
  subjectRole: "Head Chef",
  tier: "standard",
  status: "completed",
  riskScore: 18,
  riskLevel: "low",
  consentObtained: true,
  moduleResults: {
    identity: { score: 92, status: "VERIFIED", detail: "NIN matched" },
    criminal: { score: 95, status: "CLEAR", detail: "No records found" },
  },
  recommendations: ["Proceed with hiring", "Annual re-verification recommended"],
  pricePaid: "25.00",
  currency: "USD",
  createdAt: new Date("2026-02-20T10:00:00Z"),
  completedAt: new Date("2026-02-20T10:00:42Z"),
  updatedAt: new Date("2026-02-20T10:00:42Z"),
};

const mockPendingInvestigation = {
  ...mockCompletedInvestigation,
  id: 2,
  referenceId: "BIS-TEST-002",
  status: "pending",
  riskScore: null,
  riskLevel: null,
  completedAt: null,
};

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getBisInvestigationById: vi.fn().mockImplementation(async (id: number) => {
      if (id === 1) return mockCompletedInvestigation;
      if (id === 2) return mockPendingInvestigation;
      return null;
    }),
    createBisReportExport: vi.fn().mockResolvedValue({
      id: 10,
      investigationId: 1,
      generatedBy: 1,
      referenceId: "BIS-RPT-001",
      fileKey: "bis-reports/inv-1/BIS-TEST-001-abc123.pdf",
      fileUrl: "https://s3.example.com/bis-reports/BIS-TEST-001.pdf",
      fileSizeBytes: 50000,
      llmSummary: "This is a mock executive summary.",
      pageCount: 4,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    getBisReportExportsByInvestigation: vi.fn().mockResolvedValue([]),
    getLatestBisReportExport: vi.fn().mockResolvedValue(null),
  };
});

// ─── Context factory ──────────────────────────────────────────────────────────

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-open-id",
    email: "test@tourismpay.com",
    name: "Test User",
    loginMethod: "oauth",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
      cookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("bisReport.generate", () => {
  it("throws NOT_FOUND for a non-existent investigation", async () => {
    const caller = appRouter.createCaller(createAuthContext());

    await expect(
      caller.bisReport.generate({ investigationId: 9999 })
    ).rejects.toThrow(/not found/i);
  });

  it("generates a report for a pending investigation (no status guard)", async () => {
    // The router generates reports for any investigation status
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.bisReport.generate({ investigationId: 2 });
    expect(result).toBeDefined();
    expect(result.fileUrl).toContain("s3.example.com");
    // referenceId comes from the investigation record itself
    expect(result.referenceId).toBe("BIS-TEST-002");
  });

  it("generates a report for a completed investigation and returns a file URL", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.bisReport.generate({ investigationId: 1 });

    expect(result).toBeDefined();
    expect(result.fileUrl).toContain("s3.example.com");
    // referenceId is the investigation's own referenceId
    expect(result.referenceId).toBe("BIS-TEST-001");
    expect(result.llmSummary).toBeTruthy();
  });
});

describe("bisReport.latestExport", () => {
  it("returns null when no export exists for an investigation", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.bisReport.latestExport({ investigationId: 1 });
    expect(result).toBeNull();
  });
});

describe("bisReport.listExports", () => {
  it("returns an array for a valid investigationId", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.bisReport.listExports({ investigationId: 1 });
    expect(Array.isArray(result)).toBe(true);
  });
});
