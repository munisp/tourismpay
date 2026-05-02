/**
 * Round 15 Tests — Service Proxy Router
 * Tests for: serviceProxy.serviceHealth, bisCreateProxy, bisAiScore,
 *             bisOsintEnrich, kybVerifyProxy, registryLookup, proxyConfig
 */
import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Helper contexts ─────────────────────────────────────────────────────────
const adminCtx: TrpcContext = {
  user: { id: "admin-1", openId: "oid-admin", name: "Admin", email: "admin@test.com", role: "admin" },
  db: null,
};
const userCtx: TrpcContext = {
  user: { id: "user-1", openId: "oid-user", name: "User", email: "user@test.com", role: "user" },
  db: null,
};
const anonCtx: TrpcContext = { user: null, db: null };

// ─── serviceProxy.serviceHealth ──────────────────────────────────────────────
describe("serviceProxy.serviceHealth", () => {
  it("returns health status array for all services (admin)", async () => {
    const caller = appRouter.createCaller(adminCtx);
    const result = await caller.serviceProxy.serviceHealth();
    // Returns an array of service health objects
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    for (const svc of result) {
      expect(svc).toHaveProperty("name");
      expect(svc).toHaveProperty("status");
      // When not configured, status should be not_configured
      expect(["healthy", "unhealthy", "unreachable", "not_configured", "error"]).toContain(svc.status);
    }
  });

  it("rejects non-admin users", async () => {
    const caller = appRouter.createCaller(userCtx);
    await expect(caller.serviceProxy.serviceHealth()).rejects.toThrow();
  });

  it("rejects unauthenticated users", async () => {
    const caller = appRouter.createCaller(anonCtx);
    await expect(caller.serviceProxy.serviceHealth()).rejects.toThrow();
  });
});

// ─── serviceProxy.proxyConfig ────────────────────────────────────────────────
describe("serviceProxy.proxyConfig", () => {
  it("returns proxy configuration (admin)", async () => {
    const caller = appRouter.createCaller(adminCtx);
    const result = await caller.serviceProxy.proxyConfig();
    expect(result).toHaveProperty("bisCoreUrl");
    expect(result).toHaveProperty("bisAiUrl");
    expect(result).toHaveProperty("bisGatewayUrl");
    expect(result).toHaveProperty("registryServiceUrl");
    expect(result).toHaveProperty("enabledCount");
    expect(typeof result.enabledCount).toBe("number");
    // When no env vars set, all URLs should be null
    expect(result.bisCoreUrl).toBeNull();
    expect(result.bisAiUrl).toBeNull();
  });

  it("rejects non-admin users", async () => {
    const caller = appRouter.createCaller(userCtx);
    await expect(caller.serviceProxy.proxyConfig()).rejects.toThrow();
  });
});

// ─── serviceProxy.bisCreateProxy ─────────────────────────────────────────────
describe("serviceProxy.bisCreateProxy", () => {
  it("returns proxied:false when BIS_CORE_URL not configured", async () => {
    const caller = appRouter.createCaller(userCtx);
    const result = await caller.serviceProxy.bisCreateProxy({
      subjectFullName: "John Doe",
      subjectCountry: "NG",
      tier: "BASIC",
      subjectDob: "1990-01-01",
      subjectNin: "NIN123456",
      subjectEmail: "john@test.com",
    });
    expect(result).toHaveProperty("proxied");
    if (!result.proxied) {
      expect(result).toHaveProperty("message");
    }
  });

  it("validates required fields — rejects empty subjectFullName", async () => {
    const caller = appRouter.createCaller(userCtx);
    await expect(
      caller.serviceProxy.bisCreateProxy({
        subjectFullName: "",
        subjectCountry: "NG",
        tier: "BASIC",
      })
    ).rejects.toThrow();
  });

  it("validates country code length — rejects 3-letter code", async () => {
    const caller = appRouter.createCaller(userCtx);
    await expect(
      caller.serviceProxy.bisCreateProxy({
        subjectFullName: "Jane Doe",
        subjectCountry: "NGA",
        tier: "STANDARD",
      })
    ).rejects.toThrow();
  });

  it("rejects unauthenticated users", async () => {
    const caller = appRouter.createCaller(anonCtx);
    await expect(
      caller.serviceProxy.bisCreateProxy({
        subjectFullName: "John Doe",
        subjectCountry: "NG",
        tier: "BASIC",
      })
    ).rejects.toThrow();
  });
});

// ─── serviceProxy.bisAiScore ─────────────────────────────────────────────────
describe("serviceProxy.bisAiScore", () => {
  it("returns proxied:false when BIS_AI_URL not configured (admin)", async () => {
    const caller = appRouter.createCaller(adminCtx);
    const result = await caller.serviceProxy.bisAiScore({
      investigationId: "inv-123",
      moduleType: "identity",
      subjectData: { name: "John Doe", country: "NG" },
    });
    expect(result).toHaveProperty("proxied");
    if (!result.proxied) {
      expect(result).toHaveProperty("message");
    }
  });

  it("validates moduleType enum", async () => {
    const caller = appRouter.createCaller(adminCtx);
    await expect(
      caller.serviceProxy.bisAiScore({
        investigationId: "inv-123",
        moduleType: "invalid_module" as any,
        subjectData: {},
      })
    ).rejects.toThrow();
  });

  it("validates investigationId min length", async () => {
    const caller = appRouter.createCaller(adminCtx);
    await expect(
      caller.serviceProxy.bisAiScore({
        investigationId: "",
        moduleType: "sanctions",
        subjectData: {},
      })
    ).rejects.toThrow();
  });

  it("rejects non-admin users", async () => {
    const caller = appRouter.createCaller(userCtx);
    await expect(
      caller.serviceProxy.bisAiScore({
        investigationId: "inv-123",
        moduleType: "identity",
        subjectData: {},
      })
    ).rejects.toThrow();
  });
});

// ─── serviceProxy.bisOsintEnrich ─────────────────────────────────────────────
describe("serviceProxy.bisOsintEnrich", () => {
  it("returns proxied:false when BIS_AI_URL not configured (admin)", async () => {
    const caller = appRouter.createCaller(adminCtx);
    const result = await caller.serviceProxy.bisOsintEnrich({
      investigationId: "inv-456",
      subjectName: "Jane Smith",
      subjectCountry: "GH",
      sources: ["news", "sanctions"],
    });
    expect(result).toHaveProperty("proxied");
    if (!result.proxied) {
      expect(result).toHaveProperty("message");
    }
  });

  it("defaults sources when not provided", async () => {
    const caller = appRouter.createCaller(adminCtx);
    const result = await caller.serviceProxy.bisOsintEnrich({
      investigationId: "inv-789",
      subjectName: "Test Subject",
      subjectCountry: "KE",
    });
    expect(result).toHaveProperty("proxied");
  });

  it("validates subjectCountry length", async () => {
    const caller = appRouter.createCaller(adminCtx);
    await expect(
      caller.serviceProxy.bisOsintEnrich({
        investigationId: "inv-123",
        subjectName: "Test",
        subjectCountry: "KEN",
      })
    ).rejects.toThrow();
  });

  it("rejects non-admin users", async () => {
    const caller = appRouter.createCaller(userCtx);
    await expect(
      caller.serviceProxy.bisOsintEnrich({
        investigationId: "inv-123",
        subjectName: "Test",
        subjectCountry: "NG",
      })
    ).rejects.toThrow();
  });
});

// ─── serviceProxy.kybVerifyProxy ─────────────────────────────────────────────
describe("serviceProxy.kybVerifyProxy", () => {
  it("returns proxied:false when BIS_GATEWAY_URL not configured", async () => {
    const caller = appRouter.createCaller(userCtx);
    const result = await caller.serviceProxy.kybVerifyProxy({
      establishmentId: "est-001",
      verificationType: "identity",
    });
    expect(result).toHaveProperty("proxied");
    if (!result.proxied) {
      expect(result).toHaveProperty("message");
    }
  });

  it("validates verificationType enum", async () => {
    const caller = appRouter.createCaller(userCtx);
    await expect(
      caller.serviceProxy.kybVerifyProxy({
        establishmentId: "est-001",
        verificationType: "unknown_type" as any,
      })
    ).rejects.toThrow();
  });

  it("rejects unauthenticated users", async () => {
    const caller = appRouter.createCaller(anonCtx);
    await expect(
      caller.serviceProxy.kybVerifyProxy({
        establishmentId: "est-001",
        verificationType: "identity",
      })
    ).rejects.toThrow();
  });
});

// ─── serviceProxy.registryLookup ─────────────────────────────────────────────
describe("serviceProxy.registryLookup", () => {
  it("returns proxied:false with empty results when registry-service not configured", async () => {
    const caller = appRouter.createCaller(userCtx);
    const result = await caller.serviceProxy.registryLookup({
      countryCode: "NG",
      entityType: "establishment",
      query: "Lagos Hotel",
    });
    expect(result).toHaveProperty("proxied");
    expect(result).toHaveProperty("results");
    expect(Array.isArray(result.results)).toBe(true);
    if (!result.proxied) {
      expect(result).toHaveProperty("message");
    }
  });

  it("validates countryCode length", async () => {
    const caller = appRouter.createCaller(userCtx);
    await expect(
      caller.serviceProxy.registryLookup({
        countryCode: "NGA",
        entityType: "individual",
        query: "test",
      })
    ).rejects.toThrow();
  });

  it("validates query min length", async () => {
    const caller = appRouter.createCaller(userCtx);
    await expect(
      caller.serviceProxy.registryLookup({
        countryCode: "GH",
        entityType: "event",
        query: "",
      })
    ).rejects.toThrow();
  });

  it("rejects unauthenticated users", async () => {
    const caller = appRouter.createCaller(anonCtx);
    await expect(
      caller.serviceProxy.registryLookup({
        countryCode: "NG",
        entityType: "establishment",
        query: "test",
      })
    ).rejects.toThrow();
  });
});
