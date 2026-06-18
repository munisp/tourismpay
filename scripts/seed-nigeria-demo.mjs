/**
 * TourismPay — Nigeria Demo Seed Script
 * Seeds ALL database tables with realistic Nigerian data for stakeholder demo.
 *
 * Usage:
 *   DATABASE_URL=... node scripts/seed-nigeria-demo.mjs
 *   node scripts/seed-nigeria-demo.mjs  (uses default local)
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

function uuid() { return crypto.randomUUID(); }
function randomItem(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randomFloat(min, max, dp = 2) { return +(min + Math.random() * (max - min)).toFixed(dp); }
function randomInt(min, max) { return Math.floor(min + Math.random() * (max - min + 1)); }
function pastDate(daysAgo) { const d = new Date(); d.setDate(d.getDate() - daysAgo); return d; }
function futureDate(daysAhead) { const d = new Date(); d.setDate(d.getDate() + daysAhead); return d; }
function nowEpoch() { return Math.floor(Date.now() / 1000); }
function pastEpoch(daysAgo) { return Math.floor(pastDate(daysAgo).getTime() / 1000); }

const NGN_USD = 1550;
const NGN_EUR = 1700;
const NGN_GBP = 1950;

// ─── Reference Data ─────────────────────────────────────────────────────────

const NIGERIAN_BANKS = [
  "GTBank", "Access Bank", "Zenith Bank", "First Bank", "UBA",
  "Stanbic IBTC", "Fidelity Bank", "Sterling Bank", "Wema Bank", "FCMB",
];

// Stores integer IDs returned from DB inserts
const userDbIds = {};    // openId -> integer DB id
const estDbIds = {};     // estName -> integer DB id
const kybAppIds = {};    // estName -> integer kyb app id

// ─── Users ──────────────────────────────────────────────────────────────────

const ALL_USERS = [
  // Admin / Operations
  { openId: "ng-admin-001", name: "Adaeze Okonkwo", email: "admin@tourismpay.ng", role: "admin" },
  { openId: "ng-compliance-001", name: "Nneka Eze", email: "nneka@tourismpay.ng", role: "compliance_officer" },
  { openId: "ng-settlement-001", name: "Emeka Nwosu", email: "emeka@tourismpay.ng", role: "settlement_officer" },
  { openId: "ng-noc-001", name: "Tunde Bakare", email: "tunde@tourismpay.ng", role: "noc_operator" },
  { openId: "ng-bis-001", name: "Ngozi Adeyemi", email: "ngozi@tourismpay.ng", role: "bis_analyst" },
  // Merchants (Lagos)
  { openId: "ng-merch-mamacass", name: "Chidi Okafor", email: "chidi.okafor@mamacass.ng", role: "merchant" },
  { openId: "ng-merch-ekohotel", name: "Funke Adeyinka", email: "funke@ekohotel.ng", role: "merchant" },
  { openId: "ng-merch-nikeart", name: "Nike Okundaye", email: "contact@nikeartgallery.ng", role: "merchant" },
  { openId: "ng-merch-lekki", name: "Babajide Sanwo", email: "tours@lekkiconservation.ng", role: "merchant" },
  { openId: "ng-merch-terra", name: "Bolanle Austen-Peters", email: "info@terrakulture.ng", role: "merchant" },
  { openId: "ng-merch-jazzhole", name: "Kunle Tejuoso", email: "books@jazzhole.ng", role: "merchant" },
  // Merchants (Abuja)
  { openId: "ng-merch-transcorp", name: "Ahmed Musa", email: "gm@transcorphilton.ng", role: "merchant" },
  { openId: "ng-merch-mosque", name: "Ibrahim Yusuf", email: "tours@nationalmosque.ng", role: "merchant" },
  { openId: "ng-merch-millennium", name: "Amina Bello", email: "cafe@millenniumpark.ng", role: "merchant" },
  // Merchants (Calabar, PH, Enugu, Kano)
  { openId: "ng-merch-tinapa", name: "Effiong Duke", email: "reservations@tinapa.ng", role: "merchant" },
  { openId: "ng-merch-carnival", name: "Bassey Eyo", email: "info@calabarfestival.ng", role: "merchant" },
  { openId: "ng-merch-obudu", name: "Obi Effiom", email: "booking@obuduranch.ng", role: "merchant" },
  { openId: "ng-merch-genesis", name: "Tamuno Hart", email: "reservations@genesisph.ng", role: "merchant" },
  { openId: "ng-merch-rivers", name: "Deinma Briggs", email: "info@riverstours.ng", role: "merchant" },
  { openId: "ng-merch-nikelake", name: "Chibuzo Nnamdi", email: "info@nikelake.ng", role: "merchant" },
  { openId: "ng-merch-gidan", name: "Abdullahi Ganduje", email: "curator@gidanmakama.ng", role: "merchant" },
  // Tourists
  { openId: "ng-tourist-sarah", name: "Sarah Chen", email: "sarah.chen@tourist.com", role: "tourist" },
  { openId: "ng-tourist-james", name: "James Wilson", email: "james.wilson@tourist.com", role: "tourist" },
  { openId: "ng-tourist-anna", name: "Anna Mueller", email: "anna.mueller@tourist.com", role: "tourist" },
  { openId: "ng-tourist-pierre", name: "Pierre Dubois", email: "pierre.dubois@tourist.com", role: "tourist" },
  { openId: "ng-tourist-yuki", name: "Yuki Tanaka", email: "yuki.tanaka@tourist.com", role: "tourist" },
  { openId: "ng-tourist-fatima", name: "Fatima Al-Rashid", email: "fatima@tourist.com", role: "tourist" },
  { openId: "ng-tourist-carlos", name: "Carlos Silva", email: "carlos.silva@tourist.com", role: "tourist" },
  { openId: "ng-tourist-minji", name: "Min-Ji Soo", email: "minji.soo@tourist.com", role: "tourist" },
  { openId: "ng-tourist-priya", name: "Priya Sharma", email: "priya.sharma@tourist.com", role: "tourist" },
  { openId: "ng-tourist-wei", name: "Wei Zhang", email: "wei.zhang@tourist.com", role: "tourist" },
];

const TOURIST_PROFILES = [
  { openId: "ng-tourist-sarah", homeCurrency: "USD", homeCountry: "US", lang: "en" },
  { openId: "ng-tourist-james", homeCurrency: "USD", homeCountry: "GB", lang: "en" },
  { openId: "ng-tourist-anna", homeCurrency: "USD", homeCountry: "DE", lang: "de" },
  { openId: "ng-tourist-pierre", homeCurrency: "USD", homeCountry: "FR", lang: "fr" },
  { openId: "ng-tourist-yuki", homeCurrency: "USD", homeCountry: "JP", lang: "ja" },
  { openId: "ng-tourist-fatima", homeCurrency: "USD", homeCountry: "AE", lang: "en" },
  { openId: "ng-tourist-carlos", homeCurrency: "USD", homeCountry: "BR", lang: "pt" },
  { openId: "ng-tourist-minji", homeCurrency: "USD", homeCountry: "KR", lang: "ko" },
  { openId: "ng-tourist-priya", homeCurrency: "USD", homeCountry: "IN", lang: "en" },
  { openId: "ng-tourist-wei", homeCurrency: "USD", homeCountry: "CN", lang: "zh" },
];

// ─── Establishments ─────────────────────────────────────────────────────────

const ESTABLISHMENTS = [
  { ownerOpenId: "ng-merch-mamacass", name: "Mama Cass Restaurant", type: "restaurant", country: "NG", city: "Lagos", lat: 6.4310, lng: 3.4197, phone: "+2348012345001", email: "chidi.okafor@mamacass.ng", regNum: "RC1234567" },
  { ownerOpenId: "ng-merch-ekohotel", name: "Eko Hotel & Suites", type: "hotel", country: "NG", city: "Lagos", lat: 6.4280, lng: 3.4150, phone: "+2348012345002", email: "funke@ekohotel.ng", regNum: "RC2345678" },
  { ownerOpenId: "ng-merch-nikeart", name: "Nike Art Gallery", type: "museum", country: "NG", city: "Lagos", lat: 6.4350, lng: 3.4230, phone: "+2348012345003", email: "contact@nikeartgallery.ng", regNum: "RC3456789" },
  { ownerOpenId: "ng-merch-lekki", name: "Lekki Conservation Centre", type: "tour_operator", country: "NG", city: "Lagos", lat: 6.4430, lng: 3.5370, phone: "+2348012345004", email: "tours@lekkiconservation.ng", regNum: "RC4567890" },
  { ownerOpenId: "ng-merch-terra", name: "Terra Kulture", type: "museum", country: "NG", city: "Lagos", lat: 6.4500, lng: 3.4120, phone: "+2348012345005", email: "info@terrakulture.ng", regNum: "RC5678901" },
  { ownerOpenId: "ng-merch-jazzhole", name: "The Jazz Hole", type: "restaurant", country: "NG", city: "Lagos", lat: 6.4410, lng: 3.4090, phone: "+2348012345006", email: "books@jazzhole.ng", regNum: "RC6789012" },
  { ownerOpenId: "ng-merch-transcorp", name: "Transcorp Hilton Abuja", type: "hotel", country: "NG", city: "Abuja", lat: 9.0650, lng: 7.4880, phone: "+2348012345007", email: "gm@transcorphilton.ng", regNum: "RC7890123" },
  { ownerOpenId: "ng-merch-mosque", name: "National Mosque Cultural Tours", type: "tour_operator", country: "NG", city: "Abuja", lat: 9.0580, lng: 7.4950, phone: "+2348012345008", email: "tours@nationalmosque.ng", regNum: "RC8901234" },
  { ownerOpenId: "ng-merch-millennium", name: "Millennium Park Cafe", type: "restaurant", country: "NG", city: "Abuja", lat: 9.0600, lng: 7.4700, phone: "+2348012345009", email: "cafe@millenniumpark.ng", regNum: "RC9012345" },
  { ownerOpenId: "ng-merch-tinapa", name: "Tinapa Lakeside Resort", type: "beach_resort", country: "NG", city: "Calabar", lat: 4.9700, lng: 8.3400, phone: "+2348012345010", email: "reservations@tinapa.ng", regNum: "RC1012345" },
  { ownerOpenId: "ng-merch-carnival", name: "Calabar Carnival Festival Tours", type: "tour_operator", country: "NG", city: "Calabar", lat: 4.9550, lng: 8.3200, phone: "+2348012345011", email: "info@calabarfestival.ng", regNum: "RC1112345" },
  { ownerOpenId: "ng-merch-obudu", name: "Obudu Mountain Resort", type: "spa_wellness", country: "NG", city: "Calabar", lat: 6.3800, lng: 9.3600, phone: "+2348012345012", email: "booking@obuduranch.ng", regNum: "RC1212345" },
  { ownerOpenId: "ng-merch-genesis", name: "Genesis Cinemas & Restaurant", type: "restaurant", country: "NG", city: "Port Harcourt", lat: 4.8150, lng: 7.0500, phone: "+2348012345013", email: "reservations@genesisph.ng", regNum: "RC1312345" },
  { ownerOpenId: "ng-merch-rivers", name: "Rivers State Cultural Tours", type: "tour_operator", country: "NG", city: "Port Harcourt", lat: 4.8200, lng: 7.0400, phone: "+2348012345014", email: "info@riverstours.ng", regNum: "RC1412345" },
  { ownerOpenId: "ng-merch-nikelake", name: "Nike Lake Resort", type: "hotel", country: "NG", city: "Enugu", lat: 6.4600, lng: 7.5500, phone: "+2348012345015", email: "info@nikelake.ng", regNum: "RC1512345" },
  { ownerOpenId: "ng-merch-gidan", name: "Gidan Makama Museum", type: "museum", country: "NG", city: "Kano", lat: 12.0000, lng: 8.5200, phone: "+2348012345016", email: "curator@gidanmakama.ng", regNum: "RC1612345" },
];

// ─── Products ───────────────────────────────────────────────────────────────

const PRODUCTS_MAP = {
  "Mama Cass Restaurant": [
    { name: "Jollof Rice & Chicken", price: 3500, category: "food" },
    { name: "Pepper Soup (Goat)", price: 4500, category: "food" },
    { name: "Suya Platter", price: 2500, category: "food" },
    { name: "Pounded Yam & Egusi", price: 4000, category: "food" },
    { name: "Chapman Cocktail", price: 1500, category: "beverage" },
  ],
  "Eko Hotel & Suites": [
    { name: "Deluxe Room (per night)", price: 95000, category: "accommodation" },
    { name: "Victoria Island Suite", price: 250000, category: "accommodation" },
    { name: "Spa Treatment Package", price: 45000, category: "wellness" },
  ],
  "Nike Art Gallery": [
    { name: "Gallery Guided Tour", price: 5000, category: "experience" },
    { name: "Adire Dyeing Workshop", price: 15000, category: "experience" },
    { name: "Art Print (Small)", price: 25000, category: "souvenir" },
  ],
  "Lekki Conservation Centre": [
    { name: "Canopy Walk Ticket", price: 1500, category: "experience" },
    { name: "Nature Photography Tour", price: 8000, category: "experience" },
    { name: "Guided Mangrove Tour", price: 5000, category: "experience" },
  ],
  "Terra Kulture": [
    { name: "Theatre Show Ticket", price: 10000, category: "experience" },
    { name: "Art Exhibition Pass", price: 3000, category: "experience" },
  ],
  "The Jazz Hole": [
    { name: "Live Jazz Night", price: 8000, category: "experience" },
    { name: "Vinyl Record (Nigerian Artist)", price: 5000, category: "souvenir" },
  ],
  "Transcorp Hilton Abuja": [
    { name: "Executive Suite (per night)", price: 180000, category: "accommodation" },
    { name: "Bukka Restaurant Dinner", price: 25000, category: "food" },
    { name: "Pool & Gym Day Pass", price: 15000, category: "wellness" },
  ],
  "National Mosque Cultural Tours": [
    { name: "Guided Mosque Tour", price: 3000, category: "experience" },
    { name: "Islamic Calligraphy Class", price: 7000, category: "experience" },
  ],
  "Millennium Park Cafe": [
    { name: "Nigerian Breakfast Set", price: 3000, category: "food" },
    { name: "Zobo Hibiscus Drink", price: 800, category: "beverage" },
  ],
  "Tinapa Lakeside Resort": [
    { name: "Lakeside Chalet (per night)", price: 55000, category: "accommodation" },
    { name: "Water Sports Package", price: 20000, category: "experience" },
  ],
  "Calabar Carnival Festival Tours": [
    { name: "Carnival VIP Pass", price: 50000, category: "experience" },
    { name: "Drum Circle Workshop", price: 6000, category: "experience" },
  ],
  "Obudu Mountain Resort": [
    { name: "Mountain Chalet (per night)", price: 75000, category: "accommodation" },
    { name: "Cable Car Ride", price: 5000, category: "experience" },
    { name: "Hiking Trail (Half Day)", price: 10000, category: "experience" },
  ],
  "Genesis Cinemas & Restaurant": [
    { name: "VIP Dinner & Movie Combo", price: 15000, category: "experience" },
    { name: "Grilled Fish Platter", price: 6000, category: "food" },
  ],
  "Rivers State Cultural Tours": [
    { name: "Port Harcourt City Tour", price: 12000, category: "experience" },
    { name: "Bonny Island Day Trip", price: 35000, category: "experience" },
  ],
  "Nike Lake Resort": [
    { name: "Lakeside Room (per night)", price: 40000, category: "accommodation" },
    { name: "Coal City Heritage Tour", price: 8000, category: "experience" },
  ],
  "Gidan Makama Museum": [
    { name: "Museum Guided Tour", price: 2000, category: "experience" },
    { name: "Kano Dyeing Pit Tour", price: 5000, category: "experience" },
  ],
};

// ─── Seed Functions ─────────────────────────────────────────────────────────

async function seedUsers() {
  console.log("  -> Seeding users...");
  for (const u of ALL_USERS) {
    const rows = await sql`
      INSERT INTO users (open_id, name, email, role, preferred_currency, onboarding_completed)
      VALUES (${u.openId}, ${u.name}, ${u.email}, ${u.role}, ${"NGN"}, ${true})
      ON CONFLICT (open_id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, role = EXCLUDED.role
      RETURNING id
    `;
    userDbIds[u.openId] = rows[0].id;
  }
  console.log(`    OK ${ALL_USERS.length} users seeded`);
}

async function seedEstablishments() {
  console.log("  -> Seeding establishments...");
  for (const e of ESTABLISHMENTS) {
    const ownerId = userDbIds[e.ownerOpenId];
    const rows = await sql`
      INSERT INTO establishments (name, type, country, city, address, registration_number, contact_email, contact_phone, owner_id, currency, kyb_status, latitude, longitude, employee_count, annual_revenue)
      VALUES (${e.name}, ${e.type}, ${e.country}, ${e.city}, ${`${randomInt(1, 200)} ${e.city} Main Road, Nigeria`},
              ${e.regNum}, ${e.email}, ${e.phone}, ${ownerId}, ${"NGN"}, ${"approved"},
              ${e.lat}, ${e.lng}, ${randomInt(5, 50)}, ${randomFloat(5000000, 500000000, 0)})
      ON CONFLICT DO NOTHING
      RETURNING id
    `;
    if (rows.length > 0) estDbIds[e.name] = rows[0].id;
  }
  console.log(`    OK ${ESTABLISHMENTS.length} establishments seeded`);
}

async function seedTourismEvents() {
  console.log("  -> Seeding tourism events...");
  const events = [
    { name: "Destination Nigeria 2026", country: "NG", city: "Lagos", category: "festival", attendees: 50000, start: "2026-08-15", end: "2026-08-22", desc: "Africa's premier tourism festival showcasing Nigerian culture, cuisine, and natural beauty." },
    { name: "Calabar Carnival 2026", country: "NG", city: "Calabar", category: "carnival", attendees: 200000, start: "2026-12-01", end: "2026-12-31", desc: "Africa's biggest street party with cultural floats and music." },
    { name: "Abuja International Food Festival", country: "NG", city: "Abuja", category: "food", attendees: 30000, start: "2026-10-10", end: "2026-10-15", desc: "Celebrating Nigerian and African cuisine with 200+ vendors." },
    { name: "FESTAC Lagos Arts & Culture Week", country: "NG", city: "Lagos", category: "arts", attendees: 25000, start: "2026-09-05", end: "2026-09-12", desc: "Festival of Arts and Culture celebrating Nigeria's creative industries." },
    { name: "Osun-Osogbo Sacred Grove Festival", country: "NG", city: "Osogbo", category: "heritage", attendees: 15000, start: "2026-08-01", end: "2026-08-03", desc: "UNESCO World Heritage festival honoring Yoruba traditions." },
  ];
  for (const ev of events) {
    await sql`
      INSERT INTO tourism_events (name, country, city, category, expected_attendees, start_date, end_date, description)
      VALUES (${ev.name}, ${ev.country}, ${ev.city}, ${ev.category}, ${ev.attendees}, ${ev.start}, ${ev.end}, ${ev.desc})
      ON CONFLICT DO NOTHING
    `;
  }
  console.log(`    OK ${events.length} tourism events seeded`);
}

async function seedKYBApplications() {
  console.log("  -> Seeding KYB applications + documents...");
  const statuses = ["approved", "approved", "approved", "approved", "under_review", "submitted", "under_review"];
  let count = 0;
  for (const e of ESTABLISHMENTS) {
    const estId = estDbIds[e.name];
    if (!estId) continue;
    const ownerId = userDbIds[e.ownerOpenId];
    const status = statuses[count % statuses.length];
    const rows = await sql`
      INSERT INTO kyb_applications (establishment_id, submitted_by, status, current_step, total_steps, compliance_score)
      VALUES (${estId}, ${ownerId}, ${status}, ${status === "approved" ? 5 : randomInt(2, 4)}, ${5}, ${status === "approved" ? randomInt(85, 100) : null})
      ON CONFLICT DO NOTHING
      RETURNING id
    `;
    if (rows.length > 0) {
      kybAppIds[e.name] = rows[0].id;
      // KYB documents
      const docTypes = ["certificate_of_incorporation", "tax_certificate", "bank_statement"];
      for (const dt of docTypes) {
        await sql`
          INSERT INTO kyb_documents (application_id, establishment_id, uploaded_by, document_type, status, file_name, file_key, file_url)
          VALUES (${rows[0].id}, ${estId}, ${ownerId}, ${dt}, ${status === "approved" ? "verified" : "pending"},
                  ${`${e.name.replace(/\s+/g, "_")}_${dt}.pdf`}, ${`kyb/${uuid()}.pdf`}, ${`https://storage.tourismpay.ng/kyb/${uuid()}.pdf`})
          ON CONFLICT DO NOTHING
        `;
      }
    }
    count++;
  }
  console.log(`    OK ${count} KYB applications + ${count * 3} documents seeded`);
}

async function seedProducts() {
  console.log("  -> Seeding merchant products...");
  let count = 0;
  for (const [estName, products] of Object.entries(PRODUCTS_MAP)) {
    const estId = estDbIds[estName];
    if (!estId) continue;
    for (const p of products) {
      await sql`
        INSERT INTO merchant_products (establishment_id, name, description, price, currency, category, available, featured)
        VALUES (${estId}, ${p.name}, ${`Authentic Nigerian ${p.category} experience`}, ${p.price}, ${"NGN"}, ${p.category}, ${true}, ${Math.random() > 0.6})
        ON CONFLICT DO NOTHING
      `;
      count++;
    }
  }
  console.log(`    OK ${count} products seeded`);
}

async function seedWallets() {
  console.log("  -> Seeding wallet balances & transactions...");
  let balCount = 0, txCount = 0;
  const now = nowEpoch();

  // Tourist wallets
  for (const tp of TOURIST_PROFILES) {
    const uId = String(userDbIds[tp.openId]);
    const ngnBal = randomFloat(50000, 500000, 0);
    const usdBal = randomFloat(200, 5000, 2);

    await sql`
      INSERT INTO wallet_balances (id, user_id, currency, balance, locked_balance, created_at, updated_at)
      VALUES (${uuid()}, ${uId}, ${"NGN"}, ${ngnBal}, ${randomFloat(0, 10000, 0)}, ${pastEpoch(randomInt(5, 30))}, ${now})
      ON CONFLICT DO NOTHING
    `;
    await sql`
      INSERT INTO wallet_balances (id, user_id, currency, balance, locked_balance, created_at, updated_at)
      VALUES (${uuid()}, ${uId}, ${"USD"}, ${usdBal}, ${randomFloat(0, 100, 2)}, ${pastEpoch(randomInt(5, 30))}, ${now})
      ON CONFLICT DO NOTHING
    `;
    balCount += 2;

    // Transactions
    const estNames = Object.keys(estDbIds);
    const txs = [
      { type: "load", from: "NGN", amt: randomFloat(50000, 200000, 0), cpty: randomItem(NIGERIAN_BANKS), note: "Bank transfer load" },
      { type: "load", from: "USD", amt: randomFloat(100, 2000, 2), cpty: "Paystack", note: "Card load" },
      { type: "swap", from: "USD", to: "NGN", amt: randomFloat(100, 1000, 2), toAmt: randomFloat(155000, 1550000, 0), cpty: "FX Engine", note: "USD to NGN conversion" },
      { type: "send", from: "NGN", amt: randomFloat(2000, 25000, 0), cpty: randomItem(estNames), note: "QR payment" },
      { type: "send", from: "NGN", amt: randomFloat(1500, 50000, 0), cpty: randomItem(estNames), note: "Payment at merchant" },
      { type: "send", from: "NGN", amt: randomFloat(500, 5000, 0), cpty: randomItem(estNames), note: "Tip" },
      { type: "send", from: "NGN", amt: randomFloat(3000, 95000, 0), cpty: randomItem(estNames), note: "Booking payment" },
      { type: "load", from: "NGN", amt: randomFloat(30000, 150000, 0), cpty: "Flutterwave", note: "Mobile money load" },
    ];

    for (const tx of txs) {
      await sql`
        INSERT INTO wallet_transactions (id, user_id, type, status, from_currency, to_currency, amount, to_amount, fee, counterparty, note, created_at, completed_at)
        VALUES (${uuid()}, ${uId}, ${tx.type}, ${"completed"}, ${tx.from}, ${tx.to || tx.from}, ${tx.amt},
                ${tx.toAmt || null}, ${randomFloat(0, 50, 2)}, ${tx.cpty}, ${tx.note},
                ${pastEpoch(randomInt(1, 60))}, ${pastEpoch(randomInt(0, 1))})
        ON CONFLICT DO NOTHING
      `;
      txCount++;
    }
  }

  // Merchant wallets
  for (const e of ESTABLISHMENTS) {
    const uId = String(userDbIds[e.ownerOpenId]);
    const ngnBal = randomFloat(200000, 5000000, 0);
    await sql`
      INSERT INTO wallet_balances (id, user_id, currency, balance, locked_balance, created_at, updated_at)
      VALUES (${uuid()}, ${uId}, ${"NGN"}, ${ngnBal}, ${randomFloat(10000, 100000, 0)}, ${pastEpoch(randomInt(30, 90))}, ${now})
      ON CONFLICT DO NOTHING
    `;
    balCount++;

    for (let i = 0; i < randomInt(5, 12); i++) {
      const tourist = randomItem(TOURIST_PROFILES);
      const tName = ALL_USERS.find(u => u.openId === tourist.openId)?.name || "Tourist";
      await sql`
        INSERT INTO wallet_transactions (id, user_id, type, status, from_currency, to_currency, amount, fee, counterparty, note, created_at, completed_at)
        VALUES (${uuid()}, ${uId}, ${"receive"}, ${"completed"}, ${"NGN"}, ${"NGN"}, ${randomFloat(1500, 95000, 0)},
                ${0}, ${tName}, ${"Payment received"}, ${pastEpoch(randomInt(1, 45))}, ${pastEpoch(randomInt(0, 1))})
        ON CONFLICT DO NOTHING
      `;
      txCount++;
    }
  }

  console.log(`    OK ${balCount} wallet balances + ${txCount} transactions seeded`);
}

async function seedTouristProfiles() {
  console.log("  -> Seeding tourist profiles...");
  for (const tp of TOURIST_PROFILES) {
    const userId = userDbIds[tp.openId];
    await sql`
      INSERT INTO tourist_profiles (user_id, home_currency, home_country, preferred_language, onboarding_completed, linked_card_last4, linked_card_brand)
      VALUES (${userId}, ${tp.homeCurrency}, ${tp.homeCountry}, ${tp.lang}, ${true}, ${String(randomInt(1000, 9999))}, ${randomItem(["visa", "mastercard"])})
      ON CONFLICT DO NOTHING
    `;
  }
  console.log(`    OK ${TOURIST_PROFILES.length} tourist profiles seeded`);
}

async function seedBookingsAndReviews() {
  console.log("  -> Seeding bookings and reviews...");
  let bookCount = 0, reviewCount = 0;
  const estNames = Object.keys(estDbIds);

  for (const tp of TOURIST_PROFILES) {
    const userId = userDbIds[tp.openId];
    for (let i = 0; i < randomInt(2, 5); i++) {
      const estName = randomItem(estNames);
      const estId = estDbIds[estName];
      const status = randomItem(["confirmed", "confirmed", "confirmed", "pending", "completed"]);
      const price = randomFloat(5000, 250000, 0);
      const products = PRODUCTS_MAP[estName] || [];
      const product = products.length > 0 ? randomItem(products) : { name: "General Service", category: "general" };

      await sql`
        INSERT INTO tourist_bookings (user_id, establishment_id, service_type, service_name, booking_date, party_size, price_usd, currency, status, notes, confirmation_code)
        VALUES (${userId}, ${estId}, ${product.category}, ${product.name}, ${futureDate(randomInt(1, 60))},
                ${randomInt(1, 4)}, ${price}, ${"NGN"}, ${status}, ${`Booking at ${estName}`}, ${`BK-${uuid().slice(0, 8).toUpperCase()}`})
        ON CONFLICT DO NOTHING
      `;
      bookCount++;

      if (status === "completed" || Math.random() > 0.5) {
        const rating = randomInt(3, 5);
        const reviews = [
          "Amazing Nigerian hospitality! The staff were incredibly welcoming.",
          "Loved the authentic Jollof rice. Will definitely come back!",
          "Beautiful location with stunning views of Lagos.",
          "Great value for money. The experience was unforgettable.",
          "The tour guide was very knowledgeable about Nigerian history.",
          "Fantastic atmosphere and live music. A must-visit!",
          "Clean, comfortable, and well-managed. Exceeded expectations.",
          "Perfect for tourists wanting to experience real Nigerian culture.",
        ];
        await sql`
          INSERT INTO tourist_reviews (user_id, establishment_id, rating, title, body, is_verified_purchase)
          VALUES (${userId}, ${estId}, ${rating}, ${randomItem(["Great Experience!", "Loved It", "Must Visit", "Highly Recommend", "Amazing Place"])},
                  ${randomItem(reviews)}, ${true})
          ON CONFLICT DO NOTHING
        `;
        reviewCount++;
      }
    }
  }
  console.log(`    OK ${bookCount} bookings + ${reviewCount} reviews seeded`);
}

async function seedDeals() {
  console.log("  -> Seeding tourist deals...");
  const estNames = Object.keys(estDbIds);
  const deals = [
    { title: "Festival Special: 20% Off All Tours", discount: 20 },
    { title: "Early Bird: Lagos City Tour Bundle", discount: 15 },
    { title: "Calabar Carnival VIP Package", discount: 10 },
    { title: "First-Timer Welcome Bonus", discount: 10 },
    { title: "Weekend Getaway: Obudu Ranch", discount: 25 },
    { title: "Abuja Heritage Tour Combo", discount: 20 },
    { title: "Loyalty Gold Member Exclusive", discount: 30 },
    { title: "Group Booking Discount (4+)", discount: 15 },
  ];

  for (const d of deals) {
    const estId = estDbIds[randomItem(estNames)];
    await sql`
      INSERT INTO tourist_deals (establishment_id, title, description, discount_percent, category, valid_from, valid_to, max_redemptions, is_active, promo_code)
      VALUES (${estId}, ${d.title}, ${`Limited time offer for Destination Nigeria 2026`}, ${d.discount}, ${"experience"},
              ${pastDate(5)}, ${futureDate(90)}, ${randomInt(50, 500)}, ${true}, ${`NIGERIA${randomInt(100, 999)}`})
      ON CONFLICT DO NOTHING
    `;
  }
  console.log(`    OK ${deals.length} deals seeded`);
}

async function seedItineraries() {
  console.log("  -> Seeding tourist itineraries...");
  const templates = [
    { title: "3 Days in Lagos — Culture & Cuisine", dest: "Lagos, Nigeria", days: 3 },
    { title: "Abuja Heritage Weekend", dest: "Abuja, Nigeria", days: 2 },
    { title: "Calabar Festival Experience", dest: "Calabar, Nigeria", days: 4 },
    { title: "Lagos to Calabar Road Trip", dest: "Nigeria", days: 7 },
    { title: "Nigerian Food Tour", dest: "Lagos, Nigeria", days: 3 },
  ];

  for (const t of templates) {
    const tp = randomItem(TOURIST_PROFILES);
    const userId = userDbIds[tp.openId];
    const items = [];
    const estNames = Object.keys(estDbIds);
    for (let day = 1; day <= t.days; day++) {
      for (let a = 0; a < randomInt(2, 4); a++) {
        const estName = randomItem(estNames);
        items.push({ day, order: a + 1, title: `Visit ${estName}`, time: `${8 + a * 3}:00`, estName });
      }
    }

    const rows = await sql`
      INSERT INTO tourist_itineraries (user_id, title, destination, start_date, end_date, items, budget_usd, currency, is_public, status, description)
      VALUES (${userId}, ${t.title}, ${t.dest}, ${futureDate(randomInt(10, 60))}, ${futureDate(randomInt(10, 60) + t.days)},
              ${JSON.stringify(items)}, ${randomFloat(100000, 500000, 0)}, ${"NGN"}, ${true}, ${"published"}, ${`Exploring the best of ${t.dest}`})
      ON CONFLICT DO NOTHING
      RETURNING id
    `;

    if (rows.length > 0) {
      for (const item of items) {
        const estId = estDbIds[item.estName];
        if (!estId) continue;
        await sql`
          INSERT INTO tourist_itinerary_items (itinerary_id, day_number, order_in_day, establishment_id, title, start_time, end_time, item_type, status)
          VALUES (${rows[0].id}, ${item.day}, ${item.order}, ${estId}, ${item.title}, ${item.time}, ${`${parseInt(item.time) + 2}:00`}, ${"activity"}, ${"planned"})
          ON CONFLICT DO NOTHING
        `;
      }
    }
  }
  console.log(`    OK ${templates.length} itineraries seeded`);
}

async function seedLoyalty() {
  console.log("  -> Seeding loyalty...");
  let acctCount = 0, txCount = 0;
  const now = nowEpoch();

  for (const tp of TOURIST_PROFILES) {
    const uId = String(userDbIds[tp.openId]);
    const tier = randomItem(["BRONZE", "SILVER", "GOLD", "PLATINUM"]);
    const pts = tier === "PLATINUM" ? randomInt(5000, 20000) : tier === "GOLD" ? randomInt(2000, 5000) : tier === "SILVER" ? randomInt(500, 2000) : randomInt(50, 500);
    const acctId = uuid();

    await sql`
      INSERT INTO loyalty_accounts (id, user_id, tier, points_balance, lifetime_points, created_at, updated_at)
      VALUES (${acctId}, ${uId}, ${tier}, ${pts}, ${pts + randomInt(100, 5000)}, ${pastEpoch(30)}, ${now})
      ON CONFLICT (user_id) DO NOTHING
    `;
    acctCount++;

    for (let i = 0; i < randomInt(3, 8); i++) {
      await sql`
        INSERT INTO loyalty_transactions (id, user_id, type, points, description, created_at)
        VALUES (${uuid()}, ${uId}, ${randomItem(["earn", "earn", "earn", "redeem"])}, ${randomInt(10, 500)},
                ${randomItem(["Payment at merchant", "Referral bonus", "First visit", "Review reward", "Redeemed for discount"])},
                ${pastEpoch(randomInt(1, 60))})
        ON CONFLICT DO NOTHING
      `;
      txCount++;
    }
  }

  // Loyalty rewards
  const rewards = [
    { name: "Free Lekki Canopy Walk", cost: 500, desc: "Complimentary canopy walk ticket" },
    { name: "50% Off Eko Hotel Spa", cost: 1000, desc: "Half-price spa treatment" },
    { name: "Airport Lounge Access", cost: 2000, desc: "Lagos airport premium lounge" },
    { name: "Free City Tour", cost: 800, desc: "Complimentary Lagos city tour" },
    { name: "Cultural Dinner for 2", cost: 1500, desc: "Traditional Nigerian dinner" },
    { name: "VIP Festival Pass Upgrade", cost: 3000, desc: "Upgrade to VIP at any festival event" },
  ];
  for (const r of rewards) {
    await sql`
      INSERT INTO loyalty_rewards (id, name, description, points_cost, category, is_active, created_at)
      VALUES (${uuid()}, ${r.name}, ${r.desc}, ${r.cost}, ${"experience"}, ${true}, ${now})
      ON CONFLICT DO NOTHING
    `;
  }

  console.log(`    OK ${acctCount} loyalty accounts + ${txCount} txns + ${rewards.length} rewards seeded`);
}

async function seedFraudAndSecurity() {
  console.log("  -> Seeding fraud alerts, SOC alerts, BIS investigations...");

  // Fraud alerts
  const estNames = Object.keys(estDbIds);
  for (let i = 0; i < 20; i++) {
    const estId = estDbIds[randomItem(estNames)];
    await sql`
      INSERT INTO fraud_alerts (alert_id, establishment_id, country, severity, status, rule_triggered, description, amount, currency, gnn_score)
      VALUES (${`FRD-NG-${uuid().slice(0, 8)}`}, ${estId}, ${"NG"},
              ${randomItem(["info", "low", "medium", "high", "critical"])},
              ${randomItem(["open", "investigating", "resolved", "false_positive"])},
              ${randomItem(["velocity_spike", "geo_anomaly", "device_mismatch", "amount_outlier"])},
              ${randomItem([
                "Unusual transaction velocity: 8 payments in 5 minutes in Lagos",
                "Geo-anomaly: payment in Kano 30 min after Lagos",
                "Device fingerprint mismatch detected",
                "Transaction amount 5x higher than average",
                "Cross-border: rapid USD->NGN conversions",
                "Multiple failed PIN attempts",
                "Suspicious QR code scan pattern in Victoria Island",
              ])},
              ${randomFloat(5000, 500000, 0)}, ${"NGN"}, ${randomFloat(0.1, 0.95, 2)})
      ON CONFLICT DO NOTHING
    `;
  }
  console.log("    OK 20 fraud alerts seeded");

  // SOC alerts
  for (let i = 0; i < 10; i++) {
    await sql`
      INSERT INTO soc_alerts (alert_id, type, severity, status, source, title, description, affected_system, source_ip)
      VALUES (${`SOC-NG-${uuid().slice(0, 8)}`},
              ${randomItem(["intrusion", "anomaly", "policy_violation", "threat_intel", "compliance"])},
              ${randomItem(["info", "low", "medium", "high", "critical"])},
              ${randomItem(["open", "investigating", "resolved"])},
              ${randomItem(["WAF", "IDS", "rate_limiter", "api_gateway"])},
              ${randomItem(["Brute Force Attempt", "Rate Limit Exceeded", "SQL Injection Blocked", "Suspicious API Usage", "XSS Payload Blocked"])},
              ${randomItem([
                "Brute force login attempt from Nigerian IP range",
                "SQL injection attempt on merchant search endpoint",
                "Rate limit exceeded: 500 req/min from single IP",
                "Suspicious API key usage pattern detected",
              ])},
              ${randomItem(["payment-gateway", "auth-service", "merchant-api", "wallet-service"])},
              ${`${randomInt(41, 197)}.${randomInt(1, 254)}.${randomInt(1, 254)}.${randomInt(1, 254)}`})
      ON CONFLICT DO NOTHING
    `;
  }
  console.log("    OK 10 SOC alerts seeded");

  // BIS investigations
  const bisSubjects = [
    { name: "Lagos Express Trading Ltd", risk: "high", status: "pending" },
    { name: "Abuja Gold Imports", risk: "critical", status: "processing" },
    { name: "Victoria Island FX Bureau", risk: "medium", status: "pending" },
    { name: "Kano Textile Exports", risk: "low", status: "completed" },
    { name: "Port Harcourt Oil Services", risk: "high", status: "processing" },
    { name: "Calabar Shipping Consortium", risk: "medium", status: "completed" },
    { name: "Enugu Mining Corp", risk: "low", status: "completed" },
    { name: "Lagos Island Currency Exchange", risk: "critical", status: "pending" },
    { name: "Apapa Port Logistics", risk: "high", status: "processing" },
    { name: "Lekki Free Zone Trading", risk: "medium", status: "pending" },
  ];

  const bisAnalystId = userDbIds["ng-bis-001"];
  for (const subj of bisSubjects) {
    const refId = `BIS-NG-${uuid().slice(0, 6).toUpperCase()}`;
    const rows = await sql`
      INSERT INTO bis_investigations (reference_id, subject_full_name, subject_country, subject_nationality, tier, status, risk_level, risk_score,
                                       assigned_to_id, assigned_to_name, consent_obtained, subject_type)
      VALUES (${refId}, ${subj.name}, ${"NG"}, ${"Nigerian"}, ${"standard"}, ${subj.status}, ${subj.risk}, ${randomInt(20, 95)},
              ${bisAnalystId}, ${"Ngozi Adeyemi"}, ${true}, ${"entity"})
      ON CONFLICT DO NOTHING
      RETURNING id
    `;
    if (rows.length > 0) {
      await sql`
        INSERT INTO bis_timeline (id, investigation_id, actor_name, event_type, title, description, severity, created_at)
        VALUES (${uuid()}, ${rows[0].id}, ${"Ngozi Adeyemi"}, ${"created"}, ${"Investigation opened"}, ${`AML investigation opened for ${subj.name}`}, ${"info"}, ${pastEpoch(randomInt(5, 90))})
        ON CONFLICT DO NOTHING
      `;
    }
  }
  console.log(`    OK ${bisSubjects.length} BIS investigations seeded`);
}

async function seedAuditLogs() {
  console.log("  -> Seeding audit logs...");
  const actions = [
    { action: "kyb.approve", entity: "kyb_application", desc: "KYB application approved for Nigerian merchant" },
    { action: "user.login", entity: "user", desc: "User logged in from Lagos, Nigeria" },
    { action: "wallet.load", entity: "wallet", desc: "Wallet loaded via bank transfer (NGN)" },
    { action: "payment.process", entity: "payment", desc: "QR payment processed at merchant" },
    { action: "fx.swap", entity: "wallet", desc: "Currency swap USD to NGN" },
    { action: "bis.create", entity: "investigation", desc: "New BIS investigation opened" },
    { action: "settlement.process", entity: "settlement", desc: "Settlement batch processed (NGN)" },
    { action: "merchant.onboard", entity: "establishment", desc: "New merchant onboarded" },
  ];

  for (let i = 0; i < 50; i++) {
    const a = randomItem(actions);
    const user = randomItem(ALL_USERS);
    await sql`
      INSERT INTO audit_logs (actor_id, actor_name, actor_email, action, entity_type, entity_id, description, ip_address)
      VALUES (${userDbIds[user.openId]}, ${user.name}, ${user.email}, ${a.action}, ${a.entity}, ${String(randomInt(1, 100))},
              ${a.desc}, ${`${randomInt(41, 197)}.${randomInt(1, 254)}.${randomInt(1, 254)}.${randomInt(1, 254)}`})
      ON CONFLICT DO NOTHING
    `;
  }
  console.log("    OK 50 audit logs seeded");
}

async function seedPaymentSwitch() {
  console.log("  -> Seeding payment switch...");
  const now = nowEpoch();

  // PS Participants (Nigerian PSSPs)
  const participants = [
    { id: "ps-flutterwave", name: "Flutterwave", type: "psp" },
    { id: "ps-paystack", name: "Paystack", type: "psp" },
    { id: "ps-interswitch", name: "Interswitch", type: "psp" },
    { id: "ps-nibss", name: "NIBSS", type: "bank" },
    { id: "ps-gtbank", name: "GTBank", type: "bank" },
    { id: "ps-access", name: "Access Bank", type: "bank" },
    { id: "ps-zenith", name: "Zenith Bank", type: "bank" },
    { id: "ps-opay", name: "Opay", type: "fintech" },
    { id: "ps-kuda", name: "Kuda Bank", type: "fintech" },
    { id: "ps-moniepoint", name: "Moniepoint", type: "agent_network" },
  ];

  for (const p of participants) {
    await sql`
      INSERT INTO ps_participants (id, name, type, status, country, currency, health_score, created_at, updated_at)
      VALUES (${p.id}, ${p.name}, ${p.type}, ${"active"}, ${"NG"}, ${"NGN"}, ${randomInt(90, 100)}, ${pastEpoch(randomInt(30, 365))}, ${now})
      ON CONFLICT DO NOTHING
    `;
  }
  console.log(`    OK ${participants.length} PS participants seeded`);

  // PS Settlements
  for (let i = 0; i < 30; i++) {
    const p = randomItem(participants);
    const amount = randomFloat(500000, 50000000, 0);
    await sql`
      INSERT INTO ps_settlements (id, batch_id, participant_id, currency, total_amount, transaction_count, status, created_at, updated_at)
      VALUES (${uuid()}, ${`BATCH-NG-${uuid().slice(0, 8)}`}, ${p.id}, ${"NGN"}, ${amount}, ${randomInt(50, 500)},
              ${randomItem(["completed", "completed", "completed", "pending", "processing"])},
              ${pastEpoch(randomInt(0, 30))}, ${now})
      ON CONFLICT DO NOTHING
    `;
  }
  console.log("    OK 30 PS settlements seeded");

  // NOC Events
  const nocTypes = ["system_alert", "settlement_completed", "fraud_alert", "participant_suspended", "rate_limit_breach"];
  for (let i = 0; i < 15; i++) {
    await sql`
      INSERT INTO noc_events (type, severity, title, description, created_at)
      VALUES (${randomItem(nocTypes)}, ${randomItem(["info", "low", "medium", "high"])},
              ${randomItem(["Payment Gateway Latency Spike", "Settlement Batch Processed", "Auto-Scaling Triggered", "Scheduled Maintenance", "Flutterwave API 503"])},
              ${randomItem([
                "Payment gateway P95 latency > 2s",
                "Settlement batch STL-NG processed successfully",
                "Auto-scaling triggered: 3 -> 5 pods",
                "Scheduled database backup completed",
                "Flutterwave API intermittent 503 responses",
              ])},
              ${pastEpoch(randomInt(0, 14))})
      ON CONFLICT DO NOTHING
    `;
  }
  console.log("    OK 15 NOC events seeded");

  // Remittances (cross-border into Nigeria)
  const corridors = [
    { from: "USD", to: "NGN", rate: NGN_USD },
    { from: "USD", to: "NGN", rate: NGN_USD },
    { from: "USD", to: "NGN", rate: NGN_USD },
    { from: "GHS", to: "NGN", rate: 100 },
    { from: "KES", to: "NGN", rate: 12 },
  ];

  for (let i = 0; i < 25; i++) {
    const c = randomItem(corridors);
    const sendAmt = randomFloat(100, 5000, 2);
    const recvAmt = +(sendAmt * c.rate).toFixed(0);
    const touristId = userDbIds[randomItem(TOURIST_PROFILES).openId];
    await sql`
      INSERT INTO remittances (id, user_id, sender_currency, sender_amount, recipient_currency, recipient_amount, exchange_rate, fee, status, delivery_option,
                                recipient_name, recipient_bank, recipient_account, created_at, updated_at)
      VALUES (${uuid()}, ${touristId}, ${c.from}, ${sendAmt}, ${c.to}, ${recvAmt}, ${c.rate}, ${randomFloat(2, 25, 2)},
              ${randomItem(["completed", "completed", "pending", "processing"])},
              ${randomItem(["bank_transfer", "mobile_money", "wallet"])},
              ${randomItem(["Oluwaseun Afolabi", "Chioma Obi", "Tayo Falade", "Bukola Ogundimu"])},
              ${randomItem(NIGERIAN_BANKS)}, ${String(randomInt(1000000000, 9999999999))},
              ${pastEpoch(randomInt(0, 30))}, ${nowEpoch()})
      ON CONFLICT DO NOTHING
    `;
  }
  console.log("    OK 25 remittances seeded");

  // Rate alerts
  for (let i = 0; i < 8; i++) {
    const touristUid = String(userDbIds[randomItem(TOURIST_PROFILES).openId]);
    await sql`
      INSERT INTO rate_alerts (user_id, base_currency, target_currency, target_rate, condition, status, created_at, updated_at)
      VALUES (${touristUid}, ${"USD"}, ${"NGN"}, ${NGN_USD + randomInt(-50, 50)},
              ${randomItem(["above", "below"])}, ${randomItem(["active", "triggered"])},
              ${pastEpoch(randomInt(0, 14))}, ${nowEpoch()})
      ON CONFLICT DO NOTHING
    `;
  }
  console.log("    OK 8 rate alerts seeded");
}

async function seedExchangeRateOverrides() {
  console.log("  -> Seeding FX rate overrides...");
  const adminId = userDbIds["ng-admin-001"];
  const now = nowEpoch();
  const overrides = [
    { base: "USD", target: "NGN", rate: NGN_USD },
    { base: "USD", target: "GHS", rate: 15.5 },
    { base: "USD", target: "KES", rate: 129 },
  ];
  for (const o of overrides) {
    await sql`
      INSERT INTO exchange_rate_overrides (base_currency, target_currency, rate, reason, is_active, created_by_user_id, created_at, updated_at)
      VALUES (${o.base}, ${o.target}, ${o.rate}, ${"Nigeria demo rate"}, ${true}, ${adminId}, ${now}, ${now})
      ON CONFLICT DO NOTHING
    `;
  }
  console.log(`    OK ${overrides.length} FX overrides seeded`);
}

async function seedStaffAndSchedules() {
  console.log("  -> Seeding staff invites & payout schedules...");

  // Staff invites
  for (const e of ESTABLISHMENTS.slice(0, 8)) {
    const estId = estDbIds[e.name];
    const inviterId = userDbIds[e.ownerOpenId];
    if (!estId) continue;
    const staffNames = ["Adesola Adebayo", "Chioma Obi", "Oluwaseun Afolabi", "Bukola Ogundimu"];
    for (const sn of staffNames.slice(0, randomInt(2, 4))) {
      const emailLocal = sn.toLowerCase().replace(/\s+/g, ".") + "@staff.ng";
      await sql`
        INSERT INTO staff_invites (token, establishment_id, inviter_user_id, email, role, status, expires_at)
        VALUES (${uuid()}, ${estId}, ${inviterId}, ${emailLocal}, ${randomItem(["cashier", "manager"])},
                ${randomItem(["accepted", "accepted", "pending"])}, ${futureDate(30)})
        ON CONFLICT DO NOTHING
      `;
    }
  }
  console.log("    OK staff invites seeded");

  // Merchant payout schedules
  for (const e of ESTABLISHMENTS) {
    const merchantId = userDbIds[e.ownerOpenId];
    await sql`
      INSERT INTO merchant_payout_schedules (merchant_id, frequency, preferred_day, is_active)
      VALUES (${merchantId}, ${randomItem(["daily", "weekly", "monthly"])}, ${randomInt(1, 5)}, ${true})
      ON CONFLICT DO NOTHING
    `;
  }
  console.log("    OK payout schedules seeded");
}

async function seedServiceAvailability() {
  console.log("  -> Seeding service availability...");
  // Get product IDs from merchant_products for each establishment
  for (const e of ESTABLISHMENTS.slice(0, 8)) {
    const estId = estDbIds[e.name];
    if (!estId) continue;
    const products = await sql`SELECT id FROM merchant_products WHERE establishment_id = ${estId} LIMIT 3`;
    for (const prod of products) {
      for (let day = 0; day < 7; day++) {
        const dateStr = futureDate(day).toISOString().split("T")[0];
        await sql`
          INSERT INTO service_availability (product_id, establishment_id, date, total_slots, booked_slots, is_blocked)
          VALUES (${prod.id}, ${estId}, ${dateStr}, ${randomInt(10, 50)}, ${randomInt(0, 10)}, ${false})
          ON CONFLICT DO NOTHING
        `;
      }
    }
  }
  console.log("    OK service availability seeded");
}

async function seedQRTokens() {
  console.log("  -> Seeding QR payment tokens...");
  let count = 0;
  for (const e of ESTABLISHMENTS.slice(0, 10)) {
    const estId = estDbIds[e.name];
    if (!estId) continue;
    for (let i = 1; i <= randomInt(2, 4); i++) {
      await sql`
        INSERT INTO qr_payment_tokens (token, establishment_id, amount_usd, currency, description, status, expires_at)
        VALUES (${uuid()}, ${estId}, ${null}, ${"NGN"}, ${`${e.name} - Table ${i}`}, ${"pending"}, ${futureDate(30)})
        ON CONFLICT DO NOTHING
      `;
      count++;
    }
  }
  console.log(`    OK ${count} QR tokens seeded`);
}

async function seedCarbonOffsets() {
  console.log("  -> Seeding carbon offsets...");
  for (const tp of TOURIST_PROFILES.slice(0, 5)) {
    const uId = String(userDbIds[tp.openId]);
    await sql`
      INSERT INTO carbon_offsets (id, user_id, amount, project_name, project_country, cost_usd, vintage_year, created_at)
      VALUES (${uuid()}, ${uId}, ${randomFloat(50, 500, 1)},
              ${randomItem(["Lagos Mangrove Restoration", "Cross River Rainforest Protection", "Niger Delta Cleanup", "Sahel Reforestation"])},
              ${"NG"}, ${randomFloat(5, 50, 2)}, ${2026}, ${pastEpoch(randomInt(1, 30))})
      ON CONFLICT DO NOTHING
    `;
  }
  console.log("    OK 5 carbon offsets seeded");
}

async function seedNotifications() {
  console.log("  -> Seeding notifications...");
  let count = 0;
  for (const u of ALL_USERS.slice(0, 15)) {
    const userId = userDbIds[u.openId];
    const notifs = [
      { cat: "wallet", title: "Payment Received", content: `NGN ${randomInt(5000, 50000).toLocaleString()} received` },
      { cat: "system", title: "Destination Nigeria 2026", content: "Event registration is now open!" },
      { cat: "kyb", title: "KYB Status Updated", content: "Your KYB application has been approved" },
    ];
    for (const n of notifs.slice(0, randomInt(1, 3))) {
      await sql`
        INSERT INTO user_notifications (user_id, category, title, content, is_read)
        VALUES (${userId}, ${n.cat}, ${n.title}, ${n.content}, ${Math.random() > 0.4})
        ON CONFLICT DO NOTHING
      `;
      count++;
    }
  }
  console.log(`    OK ${count} notifications seeded`);
}

// ─── Go Settlement Service Seeds ────────────────────────────────────────────

async function seedGoSettlement() {
  console.log("  -> Seeding Go settlement service tables...");

  // Inventory items
  const items = [
    { item_id: "NGN-LAGOS-001", provider_id: "mama_cass", name: "Mama Cass Dinner Experience", item_type: "restaurant", price: 15000, currency: "NGN", available_quantity: 50, reserved_quantity: 8 },
    { item_id: "NGN-LAGOS-002", provider_id: "eko_hotel", name: "Eko Hotel Deluxe Room", item_type: "hotel", price: 95000, currency: "NGN", available_quantity: 20, reserved_quantity: 5 },
    { item_id: "NGN-LAGOS-003", provider_id: "lekki_tours", name: "Lekki Canopy Walk", item_type: "experience", price: 1500, currency: "NGN", available_quantity: 100, reserved_quantity: 22 },
    { item_id: "NGN-ABUJA-001", provider_id: "transcorp", name: "Transcorp Hilton Suite", item_type: "hotel", price: 180000, currency: "NGN", available_quantity: 10, reserved_quantity: 2 },
    { item_id: "NGN-CALABAR-001", provider_id: "obudu_ranch", name: "Obudu Mountain Chalet", item_type: "hotel", price: 75000, currency: "NGN", available_quantity: 12, reserved_quantity: 4 },
    { item_id: "NGN-CALABAR-002", provider_id: "calabar_carnival", name: "Carnival VIP Pass", item_type: "event", price: 50000, currency: "NGN", available_quantity: 500, reserved_quantity: 180 },
    { item_id: "NGN-PH-001", provider_id: "rivers_tours", name: "Niger Delta Boat Tour", item_type: "experience", price: 25000, currency: "NGN", available_quantity: 20, reserved_quantity: 6 },
  ];

  for (const item of items) {
    await goSql`
      INSERT INTO inventory_items (item_id, provider_id, name, item_type, price, currency, available_quantity, reserved_quantity)
      VALUES (${item.item_id}, ${item.provider_id}, ${item.name}, ${item.item_type}, ${item.price}, ${item.currency}, ${item.available_quantity}, ${item.reserved_quantity})
      ON CONFLICT (item_id) DO NOTHING
    `;
  }
  console.log(`    OK ${items.length} inventory items seeded`);

  // Ledger accounts
  const accounts = [
    { account_id: 10001, entity_type: "PLATFORM", entity_id: "tourismpay_ng", currency: "NGN", debits_posted: 0, credits_posted: 847000000 },
    { account_id: 20001, entity_type: "MERCHANT", entity_id: "mama_cass", currency: "NGN", debits_posted: 0, credits_posted: 12500000 },
    { account_id: 20002, entity_type: "MERCHANT", entity_id: "eko_hotel", currency: "NGN", debits_posted: 0, credits_posted: 45000000 },
    { account_id: 20003, entity_type: "MERCHANT", entity_id: "lekki_tours", currency: "NGN", debits_posted: 0, credits_posted: 3200000 },
    { account_id: 30001, entity_type: "TOURIST_WALLET", entity_id: "sarah_chen", currency: "NGN", debits_posted: 380000, credits_posted: 0 },
    { account_id: 30002, entity_type: "TOURIST_WALLET", entity_id: "james_wilson", currency: "NGN", debits_posted: 520000, credits_posted: 0 },
  ];

  for (const a of accounts) {
    await goSql`
      INSERT INTO ledger_accounts (id, entity_type, entity_id, currency, debits_posted, credits_posted, debits_pending, credits_pending)
      VALUES (${a.account_id}, ${a.entity_type}, ${a.entity_id}, ${a.currency}, ${a.debits_posted}, ${a.credits_posted}, ${0}, ${0})
      ON CONFLICT (id) DO UPDATE SET credits_posted = EXCLUDED.credits_posted
    `;
  }
  console.log(`    OK ${accounts.length} ledger accounts seeded`);

  // Settlement batches
  const batches = [
    { id: "STL-NG-20260601", provider_id: "flutterwave", total_amount: 25000000, net_amount: 24625000, fee_amount: 375000, currency: "NGN", transaction_count: 342, status: "completed", settlement_date: "2026-06-01" },
    { id: "STL-NG-20260608", provider_id: "paystack", total_amount: 18500000, net_amount: 18222500, fee_amount: 277500, currency: "NGN", transaction_count: 256, status: "completed", settlement_date: "2026-06-08" },
    { id: "STL-NG-20260615", provider_id: "flutterwave", total_amount: 32000000, net_amount: 31520000, fee_amount: 480000, currency: "NGN", transaction_count: 428, status: "pending", settlement_date: "2026-06-15" },
  ];

  for (const b of batches) {
    await goSql`
      INSERT INTO settlement_batches (id, provider_id, total_amount, net_amount, fee_amount, currency, transaction_count, status, settlement_date)
      VALUES (${b.id}, ${b.provider_id}, ${b.total_amount}, ${b.net_amount}, ${b.fee_amount}, ${b.currency}, ${b.transaction_count}, ${b.status}, ${b.settlement_date})
      ON CONFLICT (id) DO NOTHING
    `;
  }
  console.log(`    OK ${batches.length} settlement batches seeded`);

  // Mojaloop participants
  const mojalParticipants = [
    { fsp_id: "tourismpay_ng", name: "TourismPay Nigeria", currency: "NGN", account_id: "TP-NG-001", is_active: true },
    { fsp_id: "gtbank", name: "GTBank", currency: "NGN", account_id: "GTB-001", is_active: true },
    { fsp_id: "access_bank", name: "Access Bank", currency: "NGN", account_id: "ACB-001", is_active: true },
    { fsp_id: "flutterwave_ng", name: "Flutterwave", currency: "NGN", account_id: "FLW-001", is_active: true },
  ];

  for (const p of mojalParticipants) {
    await goSql`
      INSERT INTO mojaloop_participants (fsp_id, name, currency, account_id, is_active)
      VALUES (${p.fsp_id}, ${p.name}, ${p.currency}, ${p.account_id}, ${p.is_active})
      ON CONFLICT (fsp_id) DO NOTHING
    `;
  }
  console.log(`    OK ${mojalParticipants.length} Mojaloop participants seeded`);
}

// ─── Python ML Service Seeds ────────────────────────────────────────────────

async function seedPythonMLTables() {
  console.log("  -> Seeding Python ML service tables...");

  for (let i = 0; i < 20; i++) {
    const score = randomFloat(0, 1, 4);
    const level = score >= 0.75 ? "critical" : score >= 0.55 ? "high" : score >= 0.30 ? "medium" : "low";
    await goSql`
      INSERT INTO fraud_scores (transaction_id, user_id, score, risk_level, factors)
      VALUES (${`TXN-NG-${uuid().slice(0, 8)}`}, ${randomItem(ALL_USERS).openId}, ${score}, ${level},
              ${JSON.stringify({ velocity: randomFloat(0, 1, 3), amount: randomFloat(0, 1, 3), geo_ng: randomFloat(0, 0.5, 3) })})
    `;
  }
  console.log("    OK 20 fraud scores seeded");

  const fxPairs = [["USD", "NGN"], ["GHS", "NGN"], ["KES", "NGN"]];
  for (const [base, quote] of fxPairs) {
    const baseRate = base === "USD" ? NGN_USD : base === "GHS" ? 100 : 12;
    for (const h of [1, 6, 24]) {
      await goSql`
        INSERT INTO fx_rate_predictions (base_currency, quote_currency, predicted_rate, confidence, horizon_hours)
        VALUES (${base}, ${quote}, ${baseRate + randomFloat(-20, 20, 4)}, ${randomFloat(0.75, 0.98, 4)}, ${h})
      `;
    }
  }
  console.log("    OK 9 FX rate predictions seeded");

  const bisSubjects = ["Lagos Express Trading", "Abuja Gold Imports", "Victoria Island FX", "Kano Textile Exports", "PH Oil Services"];
  for (const subj of bisSubjects) {
    const score = randomFloat(0.1, 0.9, 4);
    const level = score >= 0.75 ? "critical" : score >= 0.55 ? "high" : score >= 0.35 ? "medium" : "low";
    await goSql`
      INSERT INTO bis_ai_scores (investigation_id, subject_name, risk_score, risk_level, factors)
      VALUES (${`INV-NG-${uuid().slice(0, 8)}`}, ${subj}, ${score}, ${level},
              ${JSON.stringify({ country_risk: 0.45, keywords: randomFloat(0, 1, 3) })})
    `;
  }
  console.log("    OK 5 BIS AI scores seeded");
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("========================================================");
  console.log("  TourismPay Nigeria Demo Seed Script");
  console.log("========================================================\n");

  sql = postgres(DATABASE_URL, { ssl: DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false }, max: 5 });
  goSql = postgres(GO_DATABASE_URL, { ssl: GO_DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false }, max: 5 });

  try {
    console.log("[Phase 1] Core users & establishments...");
    await seedUsers();
    await seedEstablishments();
    await seedTourismEvents();
    console.log("");

    console.log("[Phase 2] Merchant data...");
    await seedKYBApplications();
    await seedProducts();
    await seedStaffAndSchedules();
    await seedQRTokens();
    await seedServiceAvailability();
    console.log("");

    console.log("[Phase 3] Tourist data...");
    await seedWallets();
    await seedTouristProfiles();
    await seedBookingsAndReviews();
    await seedDeals();
    await seedItineraries();
    await seedLoyalty();
    await seedCarbonOffsets();
    console.log("");

    console.log("[Phase 4] Compliance & security...");
    await seedFraudAndSecurity();
    await seedAuditLogs();
    console.log("");

    console.log("[Phase 5] Payment switch & infrastructure...");
    await seedPaymentSwitch();
    await seedExchangeRateOverrides();
    await seedNotifications();
    console.log("");

    console.log("[Phase 6] Go settlement service...");
    await seedGoSettlement();
    console.log("");

    console.log("[Phase 7] Python ML service...");
    await seedPythonMLTables();
    console.log("");

    console.log("========================================================");
    console.log("  Nigeria Demo Seed COMPLETE!");
    console.log("========================================================");
    console.log("\nDemo login credentials:");
    console.log("  Tourism Board:  admin@tourismpay.ng (admin)");
    console.log("  Tourist:        sarah.chen@tourist.com (tourist)");
    console.log("  Merchant:       chidi.okafor@mamacass.ng (merchant)");
    console.log("  Fintech/PSSP:   admin@tourismpay.ng (Payment Switch section)");
  } catch (err) {
    console.error("\nSeed error:", err.message);
    if (err.query) console.error("Query:", err.query?.slice?.(0, 200));
    if (err.message.includes("does not exist")) {
      console.error("\nRun migrations first:");
      console.error("  pnpm drizzle-kit push");
    }
    process.exit(1);
  } finally {
    await sql.end();
    await goSql.end();
  }
}

main();
