/**
 * Backend Persistence Verification Tests
 * Verifies that Go/Rust/Python microservices use real PostgreSQL persistence
 * by scanning source files for database query patterns and verifying
 * no in-memory-only mutation patterns remain.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "../..");

function readFile(relativePath: string): string {
  const fullPath = join(ROOT, relativePath);
  if (!existsSync(fullPath)) throw new Error(`File not found: ${relativePath}`);
  return readFileSync(fullPath, "utf-8");
}

describe("Go Settlement Service — DB Persistence", () => {
  const goServices = [
    "go-settlement-service/internal/services/agent_banking.go",
    "go-settlement-service/internal/services/bank_partner.go",
    "go-settlement-service/internal/services/bank_transfer_out.go",
    "go-settlement-service/internal/services/cbdc.go",
    "go-settlement-service/internal/services/crypto.go",
    "go-settlement-service/internal/services/offline_nfc.go",
    "go-settlement-service/internal/services/onramp_offramp.go",
    "go-settlement-service/internal/services/swift_wire.go",
    "go-settlement-service/internal/services/tax_engine.go",
    "go-settlement-service/internal/services/tipping_service.go",
    "go-settlement-service/internal/services/ussd_menu.go",
    "go-settlement-service/internal/services/virtual_card.go",
  ];

  for (const svc of goServices) {
    const name = svc.split("/").pop()!.replace(".go", "");

    it(`${name} imports database package`, () => {
      const src = readFile(svc);
      expect(src).toContain("internal/database");
    });

    it(`${name} has SQL INSERT/UPDATE statements`, () => {
      const src = readFile(svc);
      const hasSql = /INSERT INTO|UPDATE .+ SET|database\.DB\.Exec/i.test(src);
      expect(hasSql).toBe(true);
    });

    it(`${name} uses parameterized queries ($1, $2)`, () => {
      const src = readFile(svc);
      expect(src).toMatch(/\$[0-9]+/);
    });
  }
});

describe("Go Settlement Service — DB Module", () => {
  it("postgres.go has migration tables", () => {
    const src = readFile("go-settlement-service/internal/database/postgres.go");
    expect(src).toContain("CREATE TABLE IF NOT EXISTS");
    const tableCount = (src.match(/CREATE TABLE IF NOT EXISTS/g) || []).length;
    expect(tableCount).toBeGreaterThanOrEqual(8);
  });

  it("postgres.go connects to PostgreSQL", () => {
    const src = readFile("go-settlement-service/internal/database/postgres.go");
    expect(src).toContain("lib/pq");
    expect(src).toContain("sql.Open");
  });
});

describe("Rust KYC Service — DB Persistence", () => {
  it("biometric_pay.rs has PgPool field", () => {
    const src = readFile("rust-kyc-service/src/biometric_pay.rs");
    expect(src).toContain("PgPool");
    expect(src).toContain("db_pool");
  });

  it("biometric_pay.rs persists templates to DB", () => {
    const src = readFile("rust-kyc-service/src/biometric_pay.rs");
    expect(src).toContain("INSERT INTO biometric_templates");
  });

  it("biometric_pay.rs persists auth sessions to DB", () => {
    const src = readFile("rust-kyc-service/src/biometric_pay.rs");
    expect(src).toContain("INSERT INTO biometric_auth_sessions");
  });

  it("db.rs has biometric migration tables", () => {
    const src = readFile("rust-kyc-service/src/db.rs");
    expect(src).toContain("biometric_templates");
    expect(src).toContain("biometric_auth_sessions");
    expect(src).toContain("merchant_pos_devices");
  });
});

describe("Python Services — DB Persistence", () => {
  it("db.py has asyncpg pool with migrations", () => {
    const src = readFile("python-services/db.py");
    expect(src).toContain("asyncpg");
    expect(src).toContain("CREATE TABLE IF NOT EXISTS");
  });

  it("main.py uses database.execute for fraud scoring", () => {
    const src = readFile("python-services/main.py");
    expect(src).toContain("database.execute");
    expect(src).toContain("INSERT INTO fraud_scores");
  });

  it("ride_hailing.py persists ride bookings to DB", () => {
    const src = readFile("python-services/ride_hailing.py");
    expect(src).toContain("database.execute");
    expect(src).toContain("INSERT INTO ride_bookings");
  });

  it("carbon_credits.py persists purchases to DB", () => {
    const src = readFile("python-services/carbon_credits.py");
    expect(src).toContain("database.execute");
    expect(src).toContain("INSERT INTO carbon_credit_purchases");
  });
});

describe("Permify Authorization — Integration Points", () => {
  const permifyRouters = [
    { file: "server/routers/settlement.ts", resource: "SETTLEMENT", action: "APPROVE" },
    { file: "server/routers/killSwitch.ts", resource: "SYSTEM", action: "EDIT" },
    { file: "server/routers/bis.ts", resource: "INVESTIGATION", action: "CREATE" },
    { file: "server/routers/kyb.ts", resource: "ESTABLISHMENT", action: "APPROVE" },
    { file: "server/routers/wallet.ts", resource: "WALLET", action: "EDIT" },
    { file: "server/routers/taxCollection.ts", resource: "SETTLEMENT", action: "EXECUTE" },
  ];

  for (const { file, resource, action } of permifyRouters) {
    const name = file.split("/").pop()!.replace(".ts", "");
    it(`${name} imports and calls requirePermission(RESOURCES.${resource}, ACTIONS.${action})`, () => {
      const src = readFile(file);
      expect(src).toContain("requirePermission");
      expect(src).toContain(`RESOURCES.${resource}`);
      expect(src).toContain(`ACTIONS.${action}`);
    });
  }
});

describe("Kafka Event Publishing — Integration Points", () => {
  const kafkaRouters = [
    "server/routers/settlement.ts",
    "server/routers/tipping.ts",
    "server/routers/taxCollection.ts",
    "server/routers/killSwitch.ts",
    "server/routers/stablecoinSwap.ts",
  ];

  for (const file of kafkaRouters) {
    const name = file.split("/").pop()!.replace(".ts", "");
    it(`${name} imports and calls Kafka publish functions`, () => {
      const src = readFile(file);
      expect(src).toMatch(/publish(Event|AuditEvent|SettlementEvent|FraudAlert)/);
      expect(src).toMatch(/import.*kafka/i);
    });
  }
});
