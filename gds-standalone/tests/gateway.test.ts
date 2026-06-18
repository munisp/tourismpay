/**
 * GDS Gateway — Unit Tests
 * Tests route responses, middleware behavior, and database integration.
 * Uses the Express app directly (no HTTP server needed).
 */
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../src/index";

describe("Health Endpoints", () => {
  it("GET /health returns 200 with status healthy", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("healthy");
    expect(res.body.service).toBeDefined();
    expect(res.body.uptime).toBeGreaterThan(0);
  });

  it("GET /health/ready returns status", async () => {
    const res = await request(app).get("/health/ready");
    expect([200, 503]).toContain(res.status);
    expect(res.body.status).toBeDefined();
  });

  it("GET /metrics returns prometheus format", async () => {
    const res = await request(app).get("/metrics");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
  });
});

describe("API Versioning", () => {
  it("API responses include version headers", async () => {
    const res = await request(app)
      .get("/api/v1/gds/health")
      .set("X-API-Key", "dev-mode");
    expect(res.headers["x-api-version"]).toBe("v1");
  });
});

describe("CORS", () => {
  it("reflects allowed origins", async () => {
    const res = await request(app)
      .get("/health")
      .set("Origin", "http://localhost:4100");
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:4100");
  });

  it("blocks disallowed origins", async () => {
    const res = await request(app)
      .get("/health")
      .set("Origin", "http://evil-site.com");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("404 Handler", () => {
  it("returns 404 with traceId for unknown routes", async () => {
    const res = await request(app).get("/api/v1/gds/nonexistent");
    expect(res.status).toBe(404);
    expect(res.body.traceId).toBeDefined();
    expect(res.body.traceId).toMatch(/^gds-/);
  });
});

describe("Security Headers", () => {
  it("includes helmet security headers", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBeDefined();
  });
});

describe("PNR Routes (via gateway seed data)", () => {
  it("GET /api/v1/gds/pnr returns PNR list", async () => {
    const res = await request(app)
      .get("/api/v1/gds/pnr")
      .set("X-API-Key", "dev-mode");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.pnrs || res.body)).toBe(true);
  });
});

describe("Commission Routes (via gateway seed data)", () => {
  it("GET /api/v1/gds/commission/rate-card returns rate card", async () => {
    const res = await request(app)
      .get("/api/v1/gds/commission/rate-card")
      .set("X-API-Key", "dev-mode");
    expect(res.status).toBe(200);
  });

  it("POST /api/v1/gds/commission/split calculates split correctly", async () => {
    const res = await request(app)
      .post("/api/v1/gds/commission/split")
      .set("X-API-Key", "dev-mode")
      .send({
        gross_amount: 500,
        country_code: "KE",
        agent_tier: "gold",
        property_tier: "full",
      });
    expect(res.status).toBe(200);
    // Funds conservation: all parts sum to gross_amount
    const body = res.body;
    if (body.splits) {
      const total = body.splits.reduce((sum: number, s: { amount: number }) => sum + s.amount, 0);
      expect(total).toBeCloseTo(500, 0);
    }
  });
});

describe("Discount Routes (via gateway seed data)", () => {
  it("GET /api/v1/gds/discount/promos returns promos", async () => {
    const res = await request(app)
      .get("/api/v1/gds/discount/promos")
      .set("X-API-Key", "dev-mode");
    expect(res.status).toBe(200);
  });
});

describe("Cancellation Routes", () => {
  it("GET /api/v1/gds/cancellation/policies returns policy presets", async () => {
    const res = await request(app)
      .get("/api/v1/gds/cancellation/policies")
      .set("X-API-Key", "dev-mode");
    expect(res.status).toBe(200);
  });
});

describe("Search Routes", () => {
  it("GET /api/v1/gds/search returns results", async () => {
    const res = await request(app)
      .get("/api/v1/gds/search")
      .set("X-API-Key", "dev-mode");
    expect(res.status).toBe(200);
  });
});
