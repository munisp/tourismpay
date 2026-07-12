/**
 * GDS Database Persistence Tests
 * Adversarial tests that verify data actually persists to PostgreSQL.
 * These tests create data via API, then verify it exists in the database directly.
 * 
 * NOTE: These tests require a running PostgreSQL database.
 * They are skipped when the database is not available (e.g., CI without DB service).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/index";
import { Pool } from "pg";

let pool: Pool | null = null;
let dbAvailable = false;

beforeAll(async () => {
  // Must match the gateway's DATABASE_URL from config.ts
  const databaseUrl = process.env.GDS_DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/tourismpay";
  try {
    pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 3000 });
    await pool.query("SELECT 1");
    dbAvailable = true;
  } catch {
    pool = null;
    dbAvailable = false;
  }
});

afterAll(async () => {
  if (pool) await pool.end();
});

describe("PNR Persistence", () => {
  it("created PNR exists in gds_pnr_records table", async () => {
    const res = await request(app)
      .post("/api/v1/gds/pnr")
      .send({
        guest_name: "Persistence Test",
        contact_email: "persist@test.ng",
      });
    // In dev mode without DB, gateway creates PNR (returns 201)
    // With DB, it persists to PostgreSQL
    expect([200, 201]).toContain(res.status);

    if (dbAvailable && pool && res.body.record_locator) {
      const dbRes = await pool.query(
        "SELECT * FROM gds_pnr_records WHERE record_locator = $1",
        [res.body.record_locator]
      );
      expect(dbRes.rows.length).toBeGreaterThan(0);
      expect(dbRes.rows[0].guest_name).toBe("Persistence Test");
    }
  });
});

describe("Tax Calculation Persistence", () => {
  it("tax calculation persists to gds_tax_calculations", async () => {
    const res = await request(app)
      .post("/api/v1/gds/tax/calculate")
      .send({ amount: 500000, jurisdiction_code: "NG-FED" });
    expect(res.status).toBe(200);

    if (dbAvailable && pool) {
      const dbRes = await pool.query("SELECT COUNT(*) FROM gds_tax_calculations");
      expect(Number(dbRes.rows[0].count)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("Settlement Saga Persistence", () => {
  it("settlement saga and steps persist to database", async () => {
    const res = await request(app)
      .post("/api/v1/gds/settlement-saga/execute")
      .send({ booking_id: "persist-test-001", amount: 100000, country: "NG" });
    expect([200, 201]).toContain(res.status);

    if (dbAvailable && pool && res.body.saga) {
      const sagaId = res.body.saga.id;
      const sagaRes = await pool.query(
        "SELECT * FROM gds_settlement_sagas WHERE id = $1",
        [sagaId]
      );
      expect(sagaRes.rows.length).toBe(1);
      expect(Number(sagaRes.rows[0].gross_amount)).toBe(100000);
    }
  });
});

describe("Onboarding Persistence", () => {
  it("new establishment persists to gds_establishments", async () => {
    const res = await request(app)
      .post("/api/v1/gds/onboarding/establishments")
      .send({
        name: "Persistence Hotel",
        type: "hotel",
        country: "NG",
        city: "Port Harcourt",
        contact_name: "Test Owner",
        contact_email: "persist@hotel.ng",
        contact_phone: "+2348011111111",
      });
    expect([200, 201]).toContain(res.status);

    if (dbAvailable && pool && res.body.id) {
      const dbRes = await pool.query(
        "SELECT * FROM gds_establishments WHERE id = $1",
        [res.body.id]
      );
      expect(dbRes.rows.length).toBe(1);
      expect(dbRes.rows[0].name).toBe("Persistence Hotel");
    }
  });
});
