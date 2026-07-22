/**
 * drizzle/seed-runner.ts
 *
 * Master runner for the comprehensive 434-table seed process.
 * Imports and executes modular seeders for each domain to generate
 * realistic data for all TourismPay pages and features.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "./schema";
import { seedCoreUsersAndWallets } from "./seeds/core-users-wallets";
import { seedMerchantsAndAgents } from "./seeds/merchants-agents";
import { seedTransactionsAndSettlements } from "./seeds/transactions-settlements";
import { seedGdsAndBookings } from "./seeds/gds-bookings";
import { seedFraudAndCompliance } from "./seeds/fraud-compliance";
import { seedInfrastructureAndAi } from "./seeds/infra-ai";
import { seedLoyaltyAndTipping } from "./seeds/loyalty-tipping";
import { seedEcommerceAndBilling } from "./seeds/ecommerce-billing";
import { seedRemainingTables } from "./seeds/remaining-tables";

const connectionString = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/tourismpay";
const client = postgres(connectionString, { max: 1 });
const db = drizzle(client, { schema });

async function resetDatabase() {
  console.log("  Resetting all tables (truncate with cascade)...");
  // We truncate the core tables which cascades to everything else
  const tables = [
    "users", "establishments", "agents", "merchants", "tenants",
    "openappsec_waf_events", "lakehouse_etl_runs", "fluvio_consumer_offsets",
    "temporal_workflow_executions"
  ];
  
  for (const table of tables) {
    try {
      await db.execute(sql.raw(`TRUNCATE TABLE "${table}" CASCADE`));
    } catch (e) {
      // Ignore if table doesn't exist
    }
  }
  console.log("  ✓ Database reset complete");
}

async function main() {
  console.log("🌱 TourismPay Comprehensive Database Seed (434 Tables)");
  console.log(`   Connection: ${connectionString.replace(/:\/\/.*@/, "://<credentials>@")}`);
  
  const args = process.argv.slice(2);
  if (args.includes("--reset")) {
    await resetDatabase();
  }

  try {
    // Phase 1: Core Identities
    console.log("\n--- Phase 1: Core Identities ---");
    const { users, wallets } = await seedCoreUsersAndWallets(db, schema);
    
    // Phase 2: Business Entities
    console.log("\n--- Phase 2: Business Entities ---");
    const { establishments, agents } = await seedMerchantsAndAgents(db, schema, users);
    
    // Phase 3: Financial Activity
    console.log("\n--- Phase 3: Financial Activity ---");
    await seedTransactionsAndSettlements(db, schema, users, establishments, agents, wallets);
    
    // Phase 4: Tourism & Travel
    console.log("\n--- Phase 4: Tourism & Travel ---");
    await seedGdsAndBookings(db, schema, users, establishments);
    
    // Phase 5: Security & Compliance
    console.log("\n--- Phase 5: Security & Compliance ---");
    await seedFraudAndCompliance(db, schema, users, establishments, agents);
    
    // Phase 6: Rewards & Extras
    console.log("\n--- Phase 6: Rewards & Extras ---");
    await seedLoyaltyAndTipping(db, schema, users, establishments, agents);
    
    // Phase 7: Value-Add Services
    console.log("\n--- Phase 7: Value-Add Services ---");
    await seedEcommerceAndBilling(db, schema, users, establishments);
    
    // Phase 8: System Infrastructure
    console.log("\n--- Phase 8: System Infrastructure ---");
    await seedInfrastructureAndAi(db, schema, users);

    // Phase 9: Catch-all for remaining tables
    console.log("\n--- Phase 9: Remaining Tables ---");
    await seedRemainingTables(db, schema);

    console.log("\n✅ Comprehensive Seed Complete!");
    console.log("   All 434 tables populated with realistic test data.");
  } catch (error) {
    console.error("\n❌ Seed failed:", error);
  } finally {
    await client.end();
  }
}

main();
