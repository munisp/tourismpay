/**
 * Tests for kybDocuments tRPC procedures
 *
 * These tests verify:
 * 1. documentTypes returns the expected list of document types
 * 2. upload rejects invalid MIME types
 * 3. upload rejects files exceeding the 10 MB limit
 * 4. listByApplication returns an array (mocked DB)
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock S3 storage ──────────────────────────────────────────────────────────

vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({
    key: "kyb-documents/est-1/app-1/certificate_of_incorporation-abc123-test.pdf",
    url: "https://s3.example.com/kyb-documents/test.pdf",
  }),
}));

// ─── Mock notification helper ────────────────────────────────────────────────

vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

// ─── Mock DB helpers ──────────────────────────────────────────────────────────

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    createKybDocument: vi.fn().mockResolvedValue({
      id: 42,
      applicationId: 1,
      establishmentId: 1,
      uploadedBy: 1,
      documentType: "certificate_of_incorporation",
      status: "pending",
      fileName: "test.pdf",
      fileKey: "kyb-documents/est-1/app-1/certificate_of_incorporation-abc123-test.pdf",
      fileUrl: "https://s3.example.com/kyb-documents/test.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 1024,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    getKybDocumentsByApplication: vi.fn().mockResolvedValue([]),
    getKybDocumentsByEstablishment: vi.fn().mockResolvedValue([]),
    getKybApplicationsByEstablishment: vi.fn().mockResolvedValue([]),
    updateKybApplicationStep: vi.fn().mockResolvedValue([]),
    getAllKybDocuments: vi.fn().mockResolvedValue([
      {
        id: 1,
        applicationId: 1,
        establishmentId: 1,
        documentType: "certificate_of_incorporation",
        status: "pending",
        fileName: "cert.pdf",
        fileKey: "kyb-documents/cert.pdf",
        fileUrl: "https://s3.example.com/cert.pdf",
        mimeType: "application/pdf",
        fileSizeBytes: 2048,
        reviewNotes: null,
        reviewedBy: null,
        reviewedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        establishmentName: "Safari Lodge Ltd",
        establishmentCountry: "KE",
      },
    ]),
    getKybDocumentStats: vi.fn().mockResolvedValue({ total: 5, pending: 2, verified: 2, rejected: 1 }),
    updateKybDocumentStatus: vi.fn().mockResolvedValue([
      {
        id: 1,
        applicationId: 1,
        establishmentId: 1,
        documentType: "certificate_of_incorporation",
        status: "verified",
        fileName: "cert.pdf",
        fileKey: "kyb-documents/cert.pdf",
        fileUrl: "https://s3.example.com/cert.pdf",
        mimeType: "application/pdf",
        fileSizeBytes: 2048,
        reviewNotes: "Looks good",
        reviewedBy: 99,
        reviewedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]),
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
    loginMethod: "manus",
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

function createAdminContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 99,
    openId: "admin-open-id",
    email: "admin@tourismpay.com",
    name: "Admin User",
    loginMethod: "manus",
    role: "admin",
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

describe("kybDocuments.documentTypes", () => {
  it("returns all 10 document types", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const types = await caller.kybDocuments.documentTypes();

    expect(types).toHaveLength(10);
    expect(types.map((t) => t.value)).toContain("certificate_of_incorporation");
    expect(types.map((t) => t.value)).toContain("director_id");
    expect(types.map((t) => t.value)).toContain("other");
  });

  it("marks 5 document types as required", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const types = await caller.kybDocuments.documentTypes();
    const required = types.filter((t) => t.required);
    expect(required).toHaveLength(5);
  });

  it("marks 5 document types as optional", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const types = await caller.kybDocuments.documentTypes();
    const optional = types.filter((t) => !t.required);
    expect(optional).toHaveLength(5);
  });
});

describe("kybDocuments.upload — input validation", () => {
  it("rejects an invalid MIME type", async () => {
    const caller = appRouter.createCaller(createAuthContext());

    await expect(
      caller.kybDocuments.upload({
        applicationId: 1,
        establishmentId: 1,
        documentType: "certificate_of_incorporation",
        fileName: "test.exe",
        mimeType: "application/x-msdownload",
        fileSizeBytes: 1024,
        fileDataBase64: Buffer.from("fake").toString("base64"),
      })
    ).rejects.toThrow(/not allowed/i);
  });

  it("rejects a file exceeding 10 MB", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const oversizeBytes = 11 * 1024 * 1024; // 11 MB

    await expect(
      caller.kybDocuments.upload({
        applicationId: 1,
        establishmentId: 1,
        documentType: "certificate_of_incorporation",
        fileName: "huge.pdf",
        mimeType: "application/pdf",
        fileSizeBytes: oversizeBytes,
        fileDataBase64: Buffer.from("fake").toString("base64"),
      })
    ).rejects.toThrow();
  });

  it("successfully uploads a valid PDF and returns a document record", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const pdfContent = Buffer.from("%PDF-1.4 fake pdf content").toString("base64");

    const result = await caller.kybDocuments.upload({
      applicationId: 1,
      establishmentId: 1,
      documentType: "certificate_of_incorporation",
      fileName: "certificate.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 1024,
      fileDataBase64: pdfContent,
    });

    expect(result).toBeDefined();
    expect(result?.id).toBe(42);
    expect(result?.documentType).toBe("certificate_of_incorporation");
    expect(result?.status).toBe("pending");
    expect(result?.fileUrl).toContain("s3.example.com");
  });
});

describe("kybDocuments.listByApplication", () => {
  it("returns an array for a valid applicationId", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const docs = await caller.kybDocuments.listByApplication({ applicationId: 1 });
    expect(Array.isArray(docs)).toBe(true);
  });
});

describe("kybDocuments.review — admin only", () => {
  it("throws FORBIDDEN for non-admin users", async () => {
    const caller = appRouter.createCaller(createAuthContext());

    await expect(
      caller.kybDocuments.review({
        documentId: 1,
        status: "verified",
      })
    ).rejects.toThrow(/permission/i);
  });
});

describe("kybDocuments.listAll — admin only", () => {
  it("throws FORBIDDEN for non-admin users", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(caller.kybDocuments.listAll()).rejects.toThrow(/permission/i);
  });

  it("returns document list for admin users", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const docs = await caller.kybDocuments.listAll();
    expect(Array.isArray(docs)).toBe(true);
    expect(docs.length).toBeGreaterThan(0);
    expect(docs[0]).toHaveProperty("establishmentName");
    expect(docs[0]).toHaveProperty("documentType");
  });

  it("accepts optional filters without error", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const docs = await caller.kybDocuments.listAll({ status: "pending", limit: 10, offset: 0 });
    expect(Array.isArray(docs)).toBe(true);
  });
});

describe("kybDocuments.stats — admin only", () => {
  it("throws FORBIDDEN for non-admin users", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(caller.kybDocuments.stats()).rejects.toThrow(/permission/i);
  });

  it("returns stats object with total, pending, verified, rejected counts", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const stats = await caller.kybDocuments.stats();
    expect(stats).toHaveProperty("total");
    expect(stats).toHaveProperty("pending");
    expect(stats).toHaveProperty("verified");
    expect(stats).toHaveProperty("rejected");
    expect(stats.total).toBe(5);
    expect(stats.pending).toBe(2);
  });
});

describe("kybDocuments.bulkReview — admin only", () => {
  it("throws FORBIDDEN for non-admin users", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(
      caller.kybDocuments.bulkReview({ documentIds: [1, 2], status: "verified" })
    ).rejects.toThrow(/permission/i);
  });

  it("approves multiple documents and returns updated count", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.kybDocuments.bulkReview({
      documentIds: [1, 2],
      status: "verified",
      reviewNotes: "Batch approved after compliance check",
    });
    expect(result).toHaveProperty("updated");
    expect(result).toHaveProperty("status", "verified");
    expect(result.updated).toBeGreaterThanOrEqual(1);
  });

  it("rejects multiple documents and returns updated count", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.kybDocuments.bulkReview({
      documentIds: [3],
      status: "rejected",
      reviewNotes: "Documents expired",
    });
    expect(result.status).toBe("rejected");
    expect(result.updated).toBeGreaterThanOrEqual(1);
  });

  it("rejects empty documentIds array", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    await expect(
      caller.kybDocuments.bulkReview({ documentIds: [], status: "verified" })
    ).rejects.toThrow();
  });
});
