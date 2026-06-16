/**
 * TourismPay Unified Seed Script
 * Seeds realistic data across all services:
 *   - TypeScript/Node (Drizzle PostgreSQL) — users, merchants, establishments, payments, KYB
 *   - Go Settlement Service — settlement DB tables
 *   - Python ML Services — fraud scores, compliance screenings, FX predictions
 *
 * Usage:
 *   DATABASE_URL=... node scripts/seed-all.mjs
 *   node scripts/seed-all.mjs  (uses default local)
 */

import postgres from "postgres";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://tourismpay_user:testpass123@localhost:5432/tourismpay";

const GO_DATABASE_URL =
  process.env.GO_DATABASE_URL ||
  "postgresql://tourismpay_user:testpass123@localhost:5432/tourismpay_settlement";

let sql, goSql;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uuid() {
  return crypto.randomUUID();
}

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomFloat(min, max, dp = 2) {
  return +(min + Math.random() * (max - min)).toFixed(dp);
}

function randomInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function pastDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d;
}

function futureDate(daysAhead) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d;
}

// ─── Seed Data ───────────────────────────────────────────────────────────────

const CURRENCIES = ["USD", "EUR", "GBP", "TZS", "KES", "NGN", "GHS", "ZAR"];
const COUNTRIES = ["TZ", "KE", "NG", "GH", "ZA", "ET", "RW", "UG", "EG", "MA"];

const MERCHANT_NAMES = [
  "Serengeti Safari Lodge", "Zanzibar Beach Resort", "Kilimanjaro Adventures",
  "Masai Mara Camp", "Victoria Falls Hotel", "Cape Town Wine Tours",
  "Accra Artisan Market", "Lagos City Tours", "Nairobi Night Safari",
  "Addis Ababa Cultural Center", "Kigali Gorilla Treks", "Marrakech Riad",
  "Luxor Temple Tours", "Mombasa Diving Center", "Dakar Surf School",
];

const ESTABLISHMENT_TYPES = [
  "hotel", "restaurant", "safari_lodge", "tour_operator",
  "beach_resort", "museum", "spa_wellness", "car_rental",
];

const PRODUCT_NAMES = [
  "Serengeti Game Drive (Full Day)", "Zanzibar Snorkeling Tour",
  "Kilimanjaro Day Hike", "Cultural Village Visit", "Sunset Dhow Cruise",
  "Safari Photography Workshop", "Spice Farm Tour", "Beach Yoga Retreat",
  "Wine Tasting Experience", "Hot Air Balloon Safari", "Bungee Jump",
  "Whale Watching Excursion", "Cooking Class", "Mountain Biking Trail",
  "City Walking Tour", "Night Market Food Tour", "Diving Certification Course",
  "Horseback Safari", "River Rafting Adventure", "Zip Line Canopy Tour",
];

const TOURIST_NAMES = [
  { first: "Emma", last: "Johnson", country: "US" },
  { first: "Hiroshi", last: "Tanaka", country: "JP" },
  { first: "Fatima", last: "Al-Rashid", country: "AE" },
  { first: "Lars", last: "Svensson", country: "SE" },
  { first: "Priya", last: "Sharma", country: "IN" },
  { first: "Chen", last: "Wei", country: "CN" },
  { first: "Marie", last: "Dubois", country: "FR" },
  { first: "James", last: "Williams", country: "GB" },
  { first: "Ana", last: "Garcia", country: "ES" },
  { first: "Oluwaseun", last: "Adeyemi", country: "NG" },
  { first: "Svetlana", last: "Petrova", country: "DE" },
  { first: "Ricardo", last: "Santos", country: "BR" },
  { first: "Kim", last: "Soo-yeon", country: "KR" },
  { first: "Mohamed", last: "Hassan", country: "EG" },
  { first: "Ingrid", last: "Müller", country: "AT" },
];

// ─── Seed Functions ──────────────────────────────────────────────────────────

async function seedUsers() {
  console.log("  → Seeding users...");
  const users = [];

  // Admin user
  users.push({
    id: uuid(),
    username: "admin",
    email: "admin@tourismpay.com",
    role: "admin",
    firstName: "System",
    lastName: "Administrator",
    country: "TZ",
  });

  // Merchant users
  for (let i = 0; i < MERCHANT_NAMES.length; i++) {
    const name = MERCHANT_NAMES[i].toLowerCase().replace(/\s+/g, ".");
    users.push({
      id: uuid(),
      username: `merchant.${name}`,
      email: `${name}@tourismpay.com`,
      role: "merchant",
      firstName: MERCHANT_NAMES[i].split(" ")[0],
      lastName: MERCHANT_NAMES[i].split(" ").slice(1).join(" "),
      country: COUNTRIES[i % COUNTRIES.length],
    });
  }

  // Tourist users
  for (const t of TOURIST_NAMES) {
    users.push({
      id: uuid(),
      username: `${t.first.toLowerCase()}.${t.last.toLowerCase()}`,
      email: `${t.first.toLowerCase()}.${t.last.toLowerCase()}@example.com`,
      role: "tourist",
      firstName: t.first,
      lastName: t.last,
      country: t.country,
    });
  }

  // Compliance officer
  users.push({
    id: uuid(),
    username: "compliance.officer",
    email: "compliance@tourismpay.com",
    role: "compliance_officer",
    firstName: "Grace",
    lastName: "Mwangi",
    country: "KE",
  });

  for (const u of users) {
    await sql`
      INSERT INTO users (id, username, email, role, first_name, last_name, country)
      VALUES (${u.id}, ${u.username}, ${u.email}, ${u.role}, ${u.firstName}, ${u.lastName}, ${u.country})
      ON CONFLICT (username) DO NOTHING
    `;
  }
  console.log(`    ✓ ${users.length} users seeded`);
  return users;
}

async function seedEstablishments(merchantUsers) {
  console.log("  → Seeding establishments...");
  const establishments = [];

  for (let i = 0; i < MERCHANT_NAMES.length; i++) {
    const estId = uuid();
    const merchant = merchantUsers[i];
    const est = {
      id: estId,
      ownerId: merchant.id,
      name: MERCHANT_NAMES[i],
      type: randomItem(ESTABLISHMENT_TYPES),
      country: merchant.country,
      city: `City-${merchant.country}`,
      currency: randomItem(CURRENCIES.slice(0, 3)),
      isActive: true,
    };
    establishments.push(est);

    await sql`
      INSERT INTO establishments (id, owner_id, name, type, country, city, currency, is_active)
      VALUES (${est.id}, ${est.ownerId}, ${est.name}, ${est.type}, ${est.country}, ${est.city}, ${est.currency}, ${est.isActive})
      ON CONFLICT DO NOTHING
    `;
  }
  console.log(`    ✓ ${establishments.length} establishments seeded`);
  return establishments;
}

async function seedKYBApplications(establishments) {
  console.log("  → Seeding KYB applications...");
  const statuses = ["approved", "approved", "approved", "under_review", "submitted", "rejected"];
  let count = 0;

  for (const est of establishments) {
    const status = randomItem(statuses);
    const kybId = uuid();
    await sql`
      INSERT INTO kyb_applications (id, establishment_id, status, business_name, business_type, country, submitted_at, reviewed_at)
      VALUES (${kybId}, ${est.id}, ${status}, ${est.name}, ${est.type}, ${est.country}, ${pastDate(randomInt(30, 180))}, ${status !== "submitted" ? pastDate(randomInt(1, 29)) : null})
      ON CONFLICT DO NOTHING
    `;
    count++;
  }
  console.log(`    ✓ ${count} KYB applications seeded`);
}

async function seedProducts(establishments) {
  console.log("  → Seeding merchant products...");
  let count = 0;

  for (const est of establishments) {
    const numProducts = randomInt(2, 5);
    for (let j = 0; j < numProducts; j++) {
      const prodId = uuid();
      const name = randomItem(PRODUCT_NAMES);
      await sql`
        INSERT INTO merchant_products (id, establishment_id, name, price, currency, category, is_active)
        VALUES (${prodId}, ${est.id}, ${name}, ${randomFloat(25, 500)}, ${est.currency}, ${"experience"}, ${true})
        ON CONFLICT DO NOTHING
      `;
      count++;
    }
  }
  console.log(`    ✓ ${count} products seeded`);
}

async function seedPayments(tourists, establishments) {
  console.log("  → Seeding payments...");
  let count = 0;

  for (let i = 0; i < 50; i++) {
    const tourist = randomItem(tourists);
    const est = randomItem(establishments);
    const amount = randomFloat(20, 1500);
    const payId = uuid();
    const status = randomItem(["completed", "completed", "completed", "pending", "failed"]);

    await sql`
      INSERT INTO payments (id, user_id, establishment_id, amount, currency, status, payment_method, created_at)
      VALUES (${payId}, ${tourist.id}, ${est.id}, ${amount}, ${est.currency}, ${status}, ${randomItem(["card", "mobile_money", "bank_transfer", "qr_code"])}, ${pastDate(randomInt(1, 90))})
      ON CONFLICT DO NOTHING
    `;
    count++;
  }
  console.log(`    ✓ ${count} payments seeded`);
}

async function seedFraudAlerts(tourists) {
  console.log("  → Seeding fraud alerts...");
  let count = 0;

  const severities = ["info", "low", "medium", "high", "critical"];
  for (let i = 0; i < 15; i++) {
    const alertId = uuid();
    const tourist = randomItem(tourists);
    await sql`
      INSERT INTO fraud_alerts (id, user_id, severity, type, description, is_resolved, created_at)
      VALUES (${alertId}, ${tourist.id}, ${randomItem(severities)}, ${randomItem(["velocity_spike", "geo_anomaly", "device_mismatch", "amount_outlier"])},
              ${"Automated fraud detection triggered"}, ${i > 10}, ${pastDate(randomInt(1, 60))})
      ON CONFLICT DO NOTHING
    `;
    count++;
  }
  console.log(`    ✓ ${count} fraud alerts seeded`);
}

// ─── Go Settlement Service Seeds ─────────────────────────────────────────────

async function seedGoSettlement() {
  console.log("  → Seeding Go settlement tables...");

  // Inventory items
  const items = [
    { item_id: "SRNGT-001", partner_id: "serengeti_tours", name: "Serengeti Game Drive", item_type: "safari", price: 350.00, currency: "USD", available_quantity: 20, reserved_quantity: 3 },
    { item_id: "ZNZBR-001", partner_id: "zanzibar_resorts", name: "Zanzibar Snorkeling", item_type: "water_sports", price: 85.00, currency: "USD", available_quantity: 30, reserved_quantity: 5 },
    { item_id: "KLMNJ-001", partner_id: "safari_lodge", name: "Kilimanjaro Day Hike", item_type: "trekking", price: 200.00, currency: "USD", available_quantity: 15, reserved_quantity: 2 },
    { item_id: "MSIMR-001", partner_id: "serengeti_tours", name: "Masai Mara Fly-In Safari", item_type: "safari", price: 750.00, currency: "USD", available_quantity: 10, reserved_quantity: 1 },
    { item_id: "CTWNR-001", partner_id: "coastal_aviation", name: "Cape Town Helicopter Tour", item_type: "aerial", price: 290.00, currency: "USD", available_quantity: 8, reserved_quantity: 0 },
    { item_id: "NRBI-001", partner_id: "tanapa", name: "Nairobi National Park Tour", item_type: "wildlife", price: 65.00, currency: "USD", available_quantity: 50, reserved_quantity: 8 },
  ];

  for (const item of items) {
    await goSql`
      INSERT INTO inventory_items (item_id, partner_id, name, item_type, price, currency, available_quantity, reserved_quantity)
      VALUES (${item.item_id}, ${item.partner_id}, ${item.name}, ${item.item_type}, ${item.price}, ${item.currency}, ${item.available_quantity}, ${item.reserved_quantity})
      ON CONFLICT (item_id) DO NOTHING
    `;
  }
  console.log(`    ✓ ${items.length} inventory items seeded`);

  // Ledger accounts
  const accounts = [
    { account_id: 1001, entity_type: "PLATFORM", entity_id: "platform_fees", currency: "USD", debits_posted: 0, credits_posted: 15000, debits_pending: 0, credits_pending: 2500 },
    { account_id: 1002, entity_type: "ESCROW", entity_id: "booking_escrow", currency: "USD", debits_posted: 45000, credits_posted: 45000, debits_pending: 8000, credits_pending: 8000 },
    { account_id: 2001, entity_type: "PROVIDER", entity_id: "serengeti_tours", currency: "USD", debits_posted: 0, credits_posted: 28000, debits_pending: 0, credits_pending: 5000 },
    { account_id: 2002, entity_type: "PROVIDER", entity_id: "zanzibar_resorts", currency: "USD", debits_posted: 0, credits_posted: 12000, debits_pending: 0, credits_pending: 1500 },
    { account_id: 2003, entity_type: "PROVIDER", entity_id: "safari_lodge", currency: "USD", debits_posted: 0, credits_posted: 8500, debits_pending: 0, credits_pending: 900 },
    { account_id: 3001, entity_type: "TOURIST", entity_id: "tourist_wallet_001", currency: "USD", debits_posted: 5200, credits_posted: 0, debits_pending: 850, credits_pending: 0 },
    { account_id: 3002, entity_type: "TOURIST", entity_id: "tourist_wallet_002", currency: "USD", debits_posted: 3100, credits_posted: 0, debits_pending: 350, credits_pending: 0 },
  ];

  for (const a of accounts) {
    await goSql`
      INSERT INTO ledger_accounts (id, entity_type, entity_id, currency, debits_posted, credits_posted, debits_pending, credits_pending)
      VALUES (${a.account_id}, ${a.entity_type}, ${a.entity_id}, ${a.currency}, ${a.debits_posted}, ${a.credits_posted}, ${a.debits_pending}, ${a.credits_pending})
      ON CONFLICT (id) DO UPDATE SET credits_posted = EXCLUDED.credits_posted
    `;
  }
  console.log(`    ✓ ${accounts.length} ledger accounts seeded`);

  // Settlement batches
  const batches = [
    { id: "STL-20260601-001", provider_id: "serengeti_tours", total_amount: 12500.00, net_amount: 11875.00, fee_amount: 5.00, currency: "USD", transaction_count: 18, status: "completed", settlement_date: "2026-06-01" },
    { id: "STL-20260601-002", provider_id: "zanzibar_resorts", total_amount: 6200.00, net_amount: 5890.00, fee_amount: 5.00, currency: "USD", transaction_count: 12, status: "completed", settlement_date: "2026-06-01" },
    { id: "STL-20260608-001", provider_id: "serengeti_tours", total_amount: 15800.00, net_amount: 15012.50, fee_amount: 5.00, currency: "USD", transaction_count: 22, status: "pending", settlement_date: "2026-06-08" },
  ];

  for (const b of batches) {
    await goSql`
      INSERT INTO settlement_batches (id, provider_id, total_amount, net_amount, fee_amount, currency, transaction_count, status, settlement_date)
      VALUES (${b.id}, ${b.provider_id}, ${b.total_amount}, ${b.net_amount}, ${b.fee_amount}, ${b.currency}, ${b.transaction_count}, ${b.status}, ${b.settlement_date})
      ON CONFLICT (id) DO NOTHING
    `;
  }
  console.log(`    ✓ ${batches.length} settlement batches seeded`);

  // Mojaloop participants
  const participants = [
    { fsp_id: "tourismpay", name: "TourismPay", currency: "TZS", account_id: "TP001", is_active: true },
    { fsp_id: "crdb", name: "CRDB Bank", currency: "TZS", account_id: "CRDB001", is_active: true },
    { fsp_id: "nmb", name: "NMB Bank", currency: "TZS", account_id: "NMB001", is_active: true },
    { fsp_id: "vodacom_mpesa", name: "Vodacom M-Pesa", currency: "TZS", account_id: "MPESA001", is_active: true },
  ];

  for (const p of participants) {
    await goSql`
      INSERT INTO mojaloop_participants (fsp_id, name, currency, account_id, is_active)
      VALUES (${p.fsp_id}, ${p.name}, ${p.currency}, ${p.account_id}, ${p.is_active})
      ON CONFLICT (fsp_id) DO NOTHING
    `;
  }
  console.log(`    ✓ ${participants.length} mojaloop participants seeded`);
}

// ─── Python ML Service Seeds ─────────────────────────────────────────────────

async function seedPythonMLTables() {
  console.log("  → Seeding Python ML service tables...");

  // Fraud scores
  for (let i = 0; i < 20; i++) {
    const score = randomFloat(0, 1, 4);
    const level = score >= 0.75 ? "critical" : score >= 0.55 ? "high" : score >= 0.30 ? "medium" : "low";
    await goSql`
      INSERT INTO fraud_scores (transaction_id, user_id, score, risk_level, factors)
      VALUES (${`TXN-${uuid().slice(0, 8)}`}, ${`USR-${randomInt(1, 15)}`}, ${score}, ${level}, ${JSON.stringify({ velocity: randomFloat(0, 1, 3), amount: randomFloat(0, 1, 3), geo: randomFloat(0, 0.5, 3) })})
    `;
  }
  console.log("    ✓ 20 fraud scores seeded");

  // Compliance screenings
  for (let i = 0; i < 10; i++) {
    const score = randomFloat(0, 1, 4);
    const level = score >= 0.75 ? "critical" : score >= 0.55 ? "high" : score >= 0.30 ? "medium" : "low";
    await goSql`
      INSERT INTO compliance_screenings (entity_id, entity_type, risk_score, risk_level, pep_match, sanctions_match, factors)
      VALUES (${`ENT-${uuid().slice(0, 8)}`}, ${randomItem(["individual", "business"])}, ${score}, ${level}, ${Math.random() > 0.9}, ${Math.random() > 0.95}, ${JSON.stringify({ country: randomFloat(0, 1, 3), industry: randomFloat(0, 1, 3) })})
    `;
  }
  console.log("    ✓ 10 compliance screenings seeded");

  // FX rate predictions
  const pairs = [["USD", "TZS"], ["USD", "KES"], ["EUR", "NGN"], ["GBP", "ZAR"], ["USD", "GHS"]];
  for (const [base, quote] of pairs) {
    for (let h = 0; h < 3; h++) {
      await goSql`
        INSERT INTO fx_rate_predictions (base_currency, quote_currency, predicted_rate, confidence, horizon_hours)
        VALUES (${base}, ${quote}, ${randomFloat(0.5, 3000, 4)}, ${randomFloat(0.7, 0.99, 4)}, ${randomItem([1, 6, 24])})
      `;
    }
  }
  console.log("    ✓ 15 FX rate predictions seeded");

  // BIS AI scores
  const subjects = ["John Doe Trading", "Al-Rashid Imports", "Serengeti Holdings", "Lagos Finance Ltd", "Accra Gold Exchange"];
  for (const subj of subjects) {
    const score = randomFloat(0.1, 0.9, 4);
    const level = score >= 0.75 ? "critical" : score >= 0.55 ? "high" : score >= 0.35 ? "medium" : "low";
    await goSql`
      INSERT INTO bis_ai_scores (investigation_id, subject_name, risk_score, risk_level, factors)
      VALUES (${`INV-${uuid().slice(0, 8)}`}, ${subj}, ${score}, ${level}, ${JSON.stringify({ country: randomFloat(0, 1, 3), keywords: randomFloat(0, 1, 3) })})
    `;
  }
  console.log("    ✓ 5 BIS AI scores seeded");
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  TourismPay Unified Seed Script                     ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  sql = postgres(DATABASE_URL, {
    ssl: DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
    max: 5,
  });

  goSql = postgres(GO_DATABASE_URL, {
    ssl: GO_DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
    max: 5,
  });

  try {
    // Phase 1: TypeScript/Drizzle tables
    console.log("[Phase 1] Seeding TypeScript app tables...");
    const users = await seedUsers();
    const merchantUsers = users.filter((u) => u.role === "merchant");
    const touristUsers = users.filter((u) => u.role === "tourist");
    const establishments = await seedEstablishments(merchantUsers);
    await seedKYBApplications(establishments);
    await seedProducts(establishments);
    await seedPayments(touristUsers, establishments);
    await seedFraudAlerts(touristUsers);
    console.log("");

    // Phase 2: Go settlement service tables
    console.log("[Phase 2] Seeding Go settlement service tables...");
    await seedGoSettlement();
    console.log("");

    // Phase 3: Python ML service tables
    console.log("[Phase 3] Seeding Python ML service tables...");
    await seedPythonMLTables();
    console.log("");

    console.log("═══════════════════════════════════════════════════════");
    console.log(" All seeds completed successfully!");
    console.log("═══════════════════════════════════════════════════════");
  } catch (err) {
    console.error("Seed error:", err.message);
    if (err.message.includes("relation") && err.message.includes("does not exist")) {
      console.error("\n⚠ Some tables may not exist yet. Run migrations first:");
      console.error("  - TypeScript: pnpm drizzle-kit push");
      console.error("  - Go: Start the Go service (auto-migrates)");
      console.error("  - Python: Start any Python service (auto-migrates)");
    }
    process.exit(1);
  } finally {
    await sql.end();
    await goSql.end();
  }
}

main();
