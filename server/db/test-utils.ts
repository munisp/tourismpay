/**
 * server/db/test-utils.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Drizzle ORM test utilities for the TourismPay platform.
 *
 * Provides:
 *  1. createTestDb()       — in-memory PGlite database for unit tests
 *  2. Seed factories       — typed factory functions for every major table
 *  3. cleanDatabase()      — truncate all tables between tests
 *  4. withTestTransaction()— run test code in a rolled-back transaction
 *  5. assertRowCount()     — assertion helper for table row counts
 *  6. seedTestData()       — seed a complete realistic dataset for integration tests
 *
 * Usage:
 *   import { createTestDb, seedUser, seedEstablishment } from "./test-utils.js";
 *
 *   let db: TestDb;
 *   beforeEach(async () => { db = await createTestDb(); });
 *   afterEach(async () => { await cleanDatabase(db); });
 *
 *   it("creates a booking", async () => {
 *     const user = await seedUser(db);
 *     const est  = await seedEstablishment(db);
 *     // ... test code
 *   });
 */

import type { DrizzleDb as DB } from "../db.js";
import {
  users,
  establishments,
  walletBalances,
  walletTransactions,
  touristBookings,
  loyaltyAccounts,
  loyaltyTransactions,
  remittances,
  auditLogs,
  merchantProducts,
  kybApplications,
  paymentLinks,
  cashLoadOrders,
} from "../../drizzle/schema.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TestDb = DB;

export type SeedUser = typeof users.$inferSelect;
export type SeedEstablishment = typeof establishments.$inferSelect;
export type SeedWalletBalance = typeof walletBalances.$inferSelect;
export type SeedWalletTx = typeof walletTransactions.$inferSelect;
export type SeedBooking = typeof touristBookings.$inferSelect;
export type SeedLoyaltyAccount = typeof loyaltyAccounts.$inferSelect;
export type SeedRemittance = typeof remittances.$inferSelect;

// ─── Counter for unique IDs ───────────────────────────────────────────────────

let _counter = 0;
function nextId(): number {
  return ++_counter;
}
function nextStr(prefix = "test"): string {
  return `${prefix}-${++_counter}-${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Seed Factories ───────────────────────────────────────────────────────────

/**
 * Seed a user record with sensible defaults.
 */
export async function seedUser(
  db: TestDb,
  overrides: Partial<typeof users.$inferInsert> = {},
): Promise<SeedUser> {
  const n = nextId();
  const [user] = await db
    .insert(users)
    .values({
      openId: `test-openid-${n}`,
      email: `user${n}@test.example`,
      name: `Test User ${n}`,
      role: "tourist",
      ...overrides,
    })
    .returning();
  return user;
}

/**
 * Seed an establishment record.
 */
export async function seedEstablishment(
  db: TestDb,
  overrides: Partial<typeof establishments.$inferInsert> = {},
): Promise<SeedEstablishment> {
  const n = nextId();
  const [est] = await db
    .insert(establishments)
    .values({
      name: `Test Establishment ${n}`,
      type: "hotel",
      country: "NG",
      city: "Lagos",
      kybStatus: "approved",
      currency: "USD",
      ...overrides,
    })
    .returning();
  return est;
}

/**
 * Seed a wallet balance record.
 */
export async function seedWalletBalance(
  db: TestDb,
  userId: string,
  overrides: Partial<typeof walletBalances.$inferInsert> = {},
): Promise<SeedWalletBalance> {
  const nowSec = Math.floor(Date.now() / 1000);
  const [balance] = await db
    .insert(walletBalances)
    .values({
      userId,
      currency: "USDC",
      balance: "1000.000000",
      lockedBalance: "0.000000",
      createdAt: nowSec,
      updatedAt: nowSec,
      ...overrides,
    })
    .returning();
  return balance;
}

/**
 * Seed a wallet transaction record.
 */
export async function seedWalletTransaction(
  db: TestDb,
  userId: string,
  overrides: Partial<typeof walletTransactions.$inferInsert> = {},
): Promise<SeedWalletTx> {
  const nowSec = Math.floor(Date.now() / 1000);
  const [tx] = await db
    .insert(walletTransactions)
    .values({
      userId,
      type: "credit",
      status: "completed",
      fromCurrency: "USDC",
      toCurrency: "USDC",
      amount: "100.000000",
      fee: "0.000000",
      reference: nextStr("REF"),
      createdAt: nowSec,
      ...overrides,
    })
    .returning();
  return tx;
}

/**
 * Seed a tourist booking record.
 */
export async function seedBooking(
  db: TestDb,
  userId: number,
  establishmentId: number,
  overrides: Partial<typeof touristBookings.$inferInsert> = {},
): Promise<SeedBooking> {
  const [booking] = await db
    .insert(touristBookings)
    .values({
      userId,
      establishmentId,
      serviceName: "Standard Room",
      serviceType: "accommodation",
      bookingDate: new Date(),
      partySize: 2,
      priceUsd: "150.000000",
      currency: "USDC",
      status: "confirmed",
      confirmationCode: nextStr("CONF"),
      ...overrides,
    })
    .returning();
  return booking;
}

/**
 * Seed a loyalty account record.
 */
export async function seedLoyaltyAccount(
  db: TestDb,
  userId: string,
  overrides: Partial<typeof loyaltyAccounts.$inferInsert> = {},
): Promise<SeedLoyaltyAccount> {
  const nowSec = Math.floor(Date.now() / 1000);
  const [account] = await db
    .insert(loyaltyAccounts)
    .values({
      userId,
      tier: "BRONZE",
      pointsBalance: 500,
      lifetimePoints: 500,
      leaderboardOptOut: false,
      hideTransactionHistory: false,
      createdAt: nowSec,
      updatedAt: nowSec,
      ...overrides,
    })
    .returning();
  return account;
}

/**
 * Seed a loyalty transaction record.
 */
export async function seedLoyaltyTransaction(
  db: TestDb,
  userId: string,
  overrides: Partial<typeof loyaltyTransactions.$inferInsert> = {},
): Promise<typeof loyaltyTransactions.$inferSelect> {
  const nowSec = Math.floor(Date.now() / 1000);
  const [tx] = await db
    .insert(loyaltyTransactions)
    .values({
      userId,
      type: "earn",
      points: 100,
      description: "Test loyalty earn",
      createdAt: nowSec,
      ...overrides,
    })
    .returning();
  return tx;
}

/**
 * Seed a remittance record.
 */
export async function seedRemittance(
  db: TestDb,
  userId: number,
  overrides: Partial<typeof remittances.$inferInsert> = {},
): Promise<SeedRemittance> {
  const now = Date.now();
  const [rem] = await db
    .insert(remittances)
    .values({
      id: nextStr("REM"),
      userId,
      senderCurrency: "USD" as any,
      recipientCurrency: "NGN" as any,
      senderAmount: "100.00000000",
      recipientAmount: "150000.00000000",
      exchangeRate: "1500.00000000",
      fee: "5.00000000",
      status: "pending",
      createdAt: now,
      updatedAt: now,
      ...overrides,
    })
    .returning();
  return rem;
}

/**
 * Seed a merchant product record.
 */
export async function seedMerchantProduct(
  db: TestDb,
  establishmentId: number,
  overrides: Partial<typeof merchantProducts.$inferInsert> = {},
): Promise<typeof merchantProducts.$inferSelect> {
  const [product] = await db
    .insert(merchantProducts)
    .values({
      establishmentId,
      name: `Test Product ${nextId()}`,
      category: "accommodation",
      price: "99.99",
      currency: "USD",
      available: true,
      featured: false,
      sortOrder: 0,
      ...overrides,
    })
    .returning();
  return product;
}

/**
 * Seed an audit log entry.
 */
export async function seedAuditLog(
  db: TestDb,
  overrides: Partial<typeof auditLogs.$inferInsert> = {},
): Promise<typeof auditLogs.$inferSelect> {
  const [log] = await db
    .insert(auditLogs)
    .values({
      action: "test.action",
      entityType: "test",
      entityId: String(nextId()),
      ...overrides,
    })
    .returning();
  return log;
}

// ─── Complete Dataset Seed ────────────────────────────────────────────────────

export interface TestDataset {
  users: SeedUser[];
  establishments: SeedEstablishment[];
  walletBalances: SeedWalletBalance[];
  bookings: SeedBooking[];
  loyaltyAccounts: SeedLoyaltyAccount[];
  remittances: SeedRemittance[];
}

/**
 * Seed a complete realistic dataset for integration tests.
 * Creates 3 users, 2 establishments, wallets, bookings, loyalty, and remittances.
 */
export async function seedTestData(db: TestDb): Promise<TestDataset> {
  // Create users
  const tourist = await seedUser(db, { role: "tourist" });
  const merchant = await seedUser(db, { role: "merchant" });
  const agent = await seedUser(db, { role: "user" });

  // Create establishments
  const hotel = await seedEstablishment(db, {
    ownerId: merchant.id,
    name: "Grand Lagos Hotel",
    type: "hotel",
    country: "NG",
  });
  const restaurant = await seedEstablishment(db, {
    ownerId: merchant.id,
    name: "Eko Atlantic Restaurant",
    type: "restaurant",
    country: "NG",
  });

  // Create wallet balances
  const touristWallet = await seedWalletBalance(db, String(tourist.id), {
    currency: "USDC",
    balance: "5000.000000",
  });
  const merchantWallet = await seedWalletBalance(db, String(merchant.id), {
    currency: "USDC",
    balance: "25000.000000",
  });
  const agentWallet = await seedWalletBalance(db, String(agent.id), {
    currency: "NGN",
    balance: "500000.000000",
  });

  // Create bookings
  const booking1 = await seedBooking(db, tourist.id, hotel.id, {
    serviceName: "Deluxe Suite",
    priceUsd: "250.000000",
    status: "confirmed",
  });
  const booking2 = await seedBooking(db, tourist.id, restaurant.id, {
    serviceName: "Private Dining",
    priceUsd: "80.000000",
    status: "completed",
  });

  // Create loyalty accounts
  const touristLoyalty = await seedLoyaltyAccount(db, String(tourist.id), {
    pointsBalance: 1250,
    lifetimePoints: 2500,
    tier: "SILVER" as any,
  });

  // Create remittances
  const remittance1 = await seedRemittance(db, tourist.id, {
    senderCurrency: "USD" as any,
    recipientCurrency: "NGN" as any,
    senderAmount: "200.00000000",
    recipientAmount: "300000.00000000",
    status: "completed",
  });

  return {
    users: [tourist, merchant, agent],
    establishments: [hotel, restaurant],
    walletBalances: [touristWallet, merchantWallet, agentWallet],
    bookings: [booking1, booking2],
    loyaltyAccounts: [touristLoyalty],
    remittances: [remittance1],
  };
}

// ─── Database Cleanup ─────────────────────────────────────────────────────────

/**
 * Truncate all major tables in dependency order (FK-safe).
 * Call this in afterEach() to reset state between tests.
 */
export async function cleanDatabase(db: TestDb): Promise<void> {
  // Truncate in reverse FK dependency order
  const tables = [
    "audit_logs",
    "loyalty_transactions",
    "loyalty_accounts",
    "wallet_transactions",
    "wallet_balances",
    "tourist_bookings",
    "merchant_products",
    "kyb_applications",
    "payment_links",
    "cash_load_orders",
    "remittances",
    "establishments",
    "users",
  ];

  for (const table of tables) {
    await db.execute(`TRUNCATE TABLE ${table} CASCADE` as any);
  }

  // Reset counter to avoid ID collisions across test suites
  _counter = 0;
}

// ─── Test Transaction Helper ──────────────────────────────────────────────────

/**
 * Run test code inside a transaction that is always rolled back.
 * Useful for testing transaction logic without persisting data.
 *
 * @example
 * await withTestTransaction(db, async (tx) => {
 *   const user = await seedUser(tx);
 *   // assertions...
 *   // transaction is rolled back after this block
 * });
 */
export async function withTestTransaction<T>(
  db: TestDb,
  fn: (tx: TestDb) => Promise<T>,
): Promise<void> {
  try {
    await db.transaction(async (tx: any) => {
      await fn(tx as TestDb);
      // Force rollback by throwing after the test code runs
      throw new Error("__ROLLBACK__");
    });
  } catch (err) {
    if (err instanceof Error && err.message === "__ROLLBACK__") {
      // Expected rollback — swallow
      return;
    }
    throw err;
  }
}

// ─── Assertion Helpers ────────────────────────────────────────────────────────

/**
 * Assert that a table contains exactly `expectedCount` rows.
 */
export async function assertRowCount(
  db: TestDb,
  tableName: string,
  expectedCount: number,
): Promise<void> {
  const result = await db.execute(
    `SELECT COUNT(*)::int AS cnt FROM ${tableName}` as any,
  );
  const rows = Array.isArray(result) ? result : (result as any).rows ?? [];
  const actual = Number((rows[0] as any)?.cnt ?? 0);
  if (actual !== expectedCount) {
    throw new Error(
      `assertRowCount failed for table "${tableName}": expected ${expectedCount}, got ${actual}`,
    );
  }
}

/**
 * Assert that a specific row exists in a table by its ID.
 */
export async function assertRowExists(
  db: TestDb,
  tableName: string,
  id: string | number,
): Promise<void> {
  const result = await db.execute(
    `SELECT 1 FROM ${tableName} WHERE id = '${id}' LIMIT 1` as any,
  );
  const rows = Array.isArray(result) ? result : (result as any).rows ?? [];
  if (rows.length === 0) {
    throw new Error(`assertRowExists failed: no row with id=${id} in table "${tableName}"`);
  }
}

/**
 * Assert that a specific row does NOT exist in a table by its ID.
 */
export async function assertRowNotExists(
  db: TestDb,
  tableName: string,
  id: string | number,
): Promise<void> {
  const result = await db.execute(
    `SELECT 1 FROM ${tableName} WHERE id = '${id}' LIMIT 1` as any,
  );
  const rows = Array.isArray(result) ? result : (result as any).rows ?? [];
  if (rows.length > 0) {
    throw new Error(`assertRowNotExists failed: row with id=${id} exists in table "${tableName}"`);
  }
}
