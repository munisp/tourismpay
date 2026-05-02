/**
 * Africa Registry Seed Script — aligned to actual PostgreSQL schema
 * Run: DATABASE_URL=... node scripts/seed-africa.mjs
 */
import postgres from "postgres";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://tourismpay:tourismpay2026@localhost:5432/tourismpay";

const sql = postgres(DATABASE_URL, {
  ssl: DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
  max: 5,
});

// ─── Tourism Events ──────────────────────────────────────────────────────────
// Schema: id, name, country, city, category, expected_attendees,
//         start_date, end_date, description, is_active, created_at

const tourismEvents = [
  // Nigeria
  { name: "Calabar Carnival", country: "NG", city: "Calabar", category: "cultural_festival", startDate: new Date("2026-12-01"), endDate: new Date("2026-12-31"), expectedAttendees: 2000000, description: "Africa's biggest street party — month-long carnival with music, dance, and cultural displays." },
  { name: "Lagos International Jazz Festival", country: "NG", city: "Lagos", category: "music_festival", startDate: new Date("2026-03-15"), endDate: new Date("2026-03-17"), expectedAttendees: 50000, description: "Premier jazz festival bringing international and African jazz artists to Lagos." },
  { name: "Argungu Fishing Festival", country: "NG", city: "Argungu", category: "cultural_festival", startDate: new Date("2026-02-20"), endDate: new Date("2026-02-23"), expectedAttendees: 100000, description: "Ancient fishing festival on the Kebbi River, a UNESCO cultural heritage event." },
  { name: "Abuja Carnival", country: "NG", city: "Abuja", category: "cultural_festival", startDate: new Date("2026-11-20"), endDate: new Date("2026-11-22"), expectedAttendees: 500000, description: "Federal capital territory's annual cultural extravaganza showcasing Nigeria's diversity." },
  { name: "Lagos Fashion Week", country: "NG", city: "Lagos", category: "trade_show", startDate: new Date("2026-10-26"), endDate: new Date("2026-10-29"), expectedAttendees: 20000, description: "West Africa's premier fashion event showcasing African designers on the global stage." },
  // Kenya
  { name: "Lamu Cultural Festival", country: "KE", city: "Lamu", category: "cultural_festival", startDate: new Date("2026-11-01"), endDate: new Date("2026-11-03"), expectedAttendees: 30000, description: "Annual celebration of Swahili culture on the UNESCO-listed Lamu Island." },
  { name: "Nairobi International Trade Fair", country: "KE", city: "Nairobi", category: "trade_show", startDate: new Date("2026-09-28"), endDate: new Date("2026-10-06"), expectedAttendees: 400000, description: "East Africa's largest trade fair showcasing agriculture, industry, and innovation." },
  { name: "Maralal International Camel Derby", country: "KE", city: "Maralal", category: "sports_event", startDate: new Date("2026-08-14"), endDate: new Date("2026-08-16"), expectedAttendees: 15000, description: "World-famous camel racing event in the Samburu highlands of northern Kenya." },
  { name: "Koroga Festival", country: "KE", city: "Nairobi", category: "music_festival", startDate: new Date("2026-05-24"), endDate: new Date("2026-05-25"), expectedAttendees: 25000, description: "Nairobi's beloved outdoor music festival celebrating African sounds and food culture." },
  // Ghana
  { name: "Chale Wote Street Art Festival", country: "GH", city: "Accra", category: "cultural_festival", startDate: new Date("2026-08-20"), endDate: new Date("2026-08-21"), expectedAttendees: 80000, description: "Accra's annual street art festival transforming James Town into an open-air gallery." },
  { name: "PANAFEST", country: "GH", city: "Cape Coast", category: "cultural_festival", startDate: new Date("2026-07-23"), endDate: new Date("2026-08-01"), expectedAttendees: 50000, description: "Pan-African Historical Theatre Festival celebrating African heritage and diaspora connections." },
  { name: "Afrochella", country: "GH", city: "Accra", category: "music_festival", startDate: new Date("2026-12-28"), endDate: new Date("2026-12-29"), expectedAttendees: 30000, description: "Pan-African music and arts festival celebrating African excellence and culture." },
  // South Africa
  { name: "Cape Town Jazz Festival", country: "ZA", city: "Cape Town", category: "music_festival", startDate: new Date("2026-03-27"), endDate: new Date("2026-03-28"), expectedAttendees: 37000, description: "Africa's greatest jazz celebration — the 'Grandaddy of African Jazz Festivals'." },
  { name: "Hermanus Whale Festival", country: "ZA", city: "Hermanus", category: "cultural_festival", startDate: new Date("2026-09-25"), endDate: new Date("2026-09-27"), expectedAttendees: 100000, description: "Annual celebration of the Southern Right Whale migration along the Walker Bay coast." },
  { name: "AfrikaBurn", country: "ZA", city: "Tankwa Karoo", category: "cultural_festival", startDate: new Date("2026-04-27"), endDate: new Date("2026-05-03"), expectedAttendees: 15000, description: "South Africa's regional Burning Man event in the Tankwa Karoo desert." },
  // Tanzania
  { name: "Sauti za Busara", country: "TZ", city: "Stone Town", category: "music_festival", startDate: new Date("2026-02-12"), endDate: new Date("2026-02-15"), expectedAttendees: 20000, description: "East Africa's premier Swahili music festival held in Zanzibar's historic Stone Town." },
  { name: "Kilimanjaro Marathon", country: "TZ", city: "Moshi", category: "sports_event", startDate: new Date("2026-03-01"), endDate: new Date("2026-03-01"), expectedAttendees: 5000, description: "International marathon at the foot of Africa's highest peak." },
  // Rwanda
  { name: "Kwita Izina Gorilla Naming Ceremony", country: "RW", city: "Kinigi", category: "cultural_festival", startDate: new Date("2026-09-05"), endDate: new Date("2026-09-05"), expectedAttendees: 5000, description: "Rwanda's iconic annual ceremony naming newborn mountain gorillas in Volcanoes National Park." },
  { name: "Kigali Jazz Junction", country: "RW", city: "Kigali", category: "music_festival", startDate: new Date("2026-05-08"), endDate: new Date("2026-05-10"), expectedAttendees: 10000, description: "East Africa's growing jazz festival celebrating the genre's African roots." },
  // Ethiopia
  { name: "Timkat Festival", country: "ET", city: "Lalibela", category: "cultural_festival", startDate: new Date("2026-01-19"), endDate: new Date("2026-01-20"), expectedAttendees: 100000, description: "Ethiopian Orthodox Epiphany celebration — a UNESCO Intangible Cultural Heritage." },
  { name: "Addis Ababa International Film Festival", country: "ET", city: "Addis Ababa", category: "cultural_festival", startDate: new Date("2026-10-10"), endDate: new Date("2026-10-17"), expectedAttendees: 20000, description: "East Africa's premier film festival showcasing African cinema and international productions." },
  // Egypt
  { name: "Cairo International Film Festival", country: "EG", city: "Cairo", category: "cultural_festival", startDate: new Date("2026-11-13"), endDate: new Date("2026-11-22"), expectedAttendees: 150000, description: "Africa's oldest and most prestigious film festival, established in 1976." },
  { name: "Abu Simbel Sun Festival", country: "EG", city: "Abu Simbel", category: "cultural_festival", startDate: new Date("2026-10-22"), endDate: new Date("2026-10-22"), expectedAttendees: 30000, description: "Biannual astronomical event when sunlight illuminates the inner sanctuary of Ramesses II's temple." },
  // Morocco
  { name: "Gnaoua World Music Festival", country: "MA", city: "Essaouira", category: "music_festival", startDate: new Date("2026-06-25"), endDate: new Date("2026-06-28"), expectedAttendees: 500000, description: "World-renowned festival blending Gnaoua spiritual music with jazz, blues, and world music." },
  { name: "Fez Festival of World Sacred Music", country: "MA", city: "Fez", category: "music_festival", startDate: new Date("2026-06-05"), endDate: new Date("2026-06-14"), expectedAttendees: 50000, description: "International sacred music festival promoting dialogue between cultures and civilizations." },
  // Senegal
  { name: "FESMAN — World Festival of Black Arts", country: "SN", city: "Dakar", category: "cultural_festival", startDate: new Date("2026-12-01"), endDate: new Date("2026-12-21"), expectedAttendees: 200000, description: "Pan-African arts festival celebrating Black culture, arts, and intellectual heritage." },
  { name: "Dakar Biennale (Dak'Art)", country: "SN", city: "Dakar", category: "cultural_festival", startDate: new Date("2026-05-07"), endDate: new Date("2026-06-07"), expectedAttendees: 80000, description: "Africa's most prestigious contemporary art biennial, held every two years in Dakar." },
  // Côte d'Ivoire
  { name: "MASA — African Market of Performing Arts", country: "CI", city: "Abidjan", category: "cultural_festival", startDate: new Date("2026-03-07"), endDate: new Date("2026-03-14"), expectedAttendees: 40000, description: "Biennial showcase of African performing arts connecting artists with international promoters." },
];

// ─── Establishments ───────────────────────────────────────────────────────────
// Schema: name, type (enum), country, city, address, contact_email,
//         contact_phone, website, kyb_status (enum), employee_count

const establishments = [
  // Nigeria — Lagos & Abuja
  { name: "Eko Hotel & Suites", type: "hotel", country: "NG", city: "Lagos", address: "Plot 1415, Adetokunbo Ademola Street, Victoria Island", contactEmail: "reservations@ekohotels.com", contactPhone: "+234-1-2770100", website: "https://ekohotels.com", kybStatus: "approved", employeeCount: 800 },
  { name: "Radisson Blu Anchorage Hotel Lagos", type: "hotel", country: "NG", city: "Lagos", address: "1A, Ozumba Mbadiwe Avenue, Victoria Island", contactEmail: "info.lagos@radissonblu.com", contactPhone: "+234-1-2800000", website: "https://radissonblu.com/hotel-lagos", kybStatus: "approved", employeeCount: 250 },
  { name: "Nok by Alara", type: "restaurant", country: "NG", city: "Lagos", address: "12A Akin Olugbade Street, Victoria Island", contactEmail: "nok@alaralagos.com", contactPhone: "+234-1-2714000", website: "https://alaralagos.com/nok", kybStatus: "approved", employeeCount: 80 },
  { name: "Terra Kulture", type: "concert_venue", country: "NG", city: "Lagos", address: "1376 Tiamiyu Savage Street, Victoria Island", contactEmail: "info@terrakulture.com", contactPhone: "+234-1-2702839", website: "https://terrakulture.com", kybStatus: "approved", employeeCount: 120 },
  { name: "Transcorp Hilton Abuja", type: "hotel", country: "NG", city: "Abuja", address: "1 Aguiyi Ironsi Street, Maitama", contactEmail: "info@transcorphilton.com", contactPhone: "+234-9-4612000", website: "https://transcorphilton.com", kybStatus: "approved", employeeCount: 900 },
  { name: "Calabar International Convention Centre", type: "conference_center", country: "NG", city: "Calabar", address: "Convention Centre Road, Calabar", contactEmail: "info@cicc.gov.ng", contactPhone: "+234-87-234567", website: "https://cicc.gov.ng", kybStatus: "under_review", employeeCount: 200 },
  // Kenya
  { name: "Nairobi Serena Hotel", type: "hotel", country: "KE", city: "Nairobi", address: "Processional Way, Nairobi", contactEmail: "reservations@serenahotels.com", contactPhone: "+254-20-2822000", website: "https://serenahotels.com/nairobi", kybStatus: "approved", employeeCount: 350 },
  { name: "Carnivore Restaurant Nairobi", type: "restaurant", country: "KE", city: "Nairobi", address: "Langata Road, Nairobi", contactEmail: "info@carnivore.co.ke", contactPhone: "+254-20-6002000", website: "https://carnivore.co.ke", kybStatus: "approved", employeeCount: 150 },
  { name: "KICC — Kenyatta International Convention Centre", type: "conference_center", country: "KE", city: "Nairobi", address: "City Square, Nairobi CBD", contactEmail: "info@kicc.co.ke", contactPhone: "+254-20-3200000", website: "https://kicc.co.ke", kybStatus: "approved", employeeCount: 400 },
  { name: "Diani Reef Beach Resort & Spa", type: "beach_resort", country: "KE", city: "Diani Beach", address: "Beach Road, Diani Beach, Kwale County", contactEmail: "info@dianireefspa.com", contactPhone: "+254-40-3202723", website: "https://dianireefspa.com", kybStatus: "approved", employeeCount: 180 },
  // Ghana
  { name: "Kempinski Hotel Gold Coast City", type: "hotel", country: "GH", city: "Accra", address: "Independence Avenue, Accra", contactEmail: "reservations.accra@kempinski.com", contactPhone: "+233-30-2711000", website: "https://kempinski.com/accra", kybStatus: "approved", employeeCount: 420 },
  { name: "Buka Restaurant Accra", type: "restaurant", country: "GH", city: "Accra", address: "Osu, Oxford Street, Accra", contactEmail: "info@bukarestaurant.com", contactPhone: "+233-30-2773611", website: "https://bukarestaurant.com", kybStatus: "approved", employeeCount: 60 },
  { name: "National Theatre of Ghana", type: "concert_venue", country: "GH", city: "Accra", address: "Liberation Road, Accra", contactEmail: "info@nationaltheatre.gov.gh", contactPhone: "+233-30-2681771", website: "https://nationaltheatre.gov.gh", kybStatus: "approved", employeeCount: 200 },
  // South Africa
  { name: "The Silo Hotel Cape Town", type: "hotel", country: "ZA", city: "Cape Town", address: "Silo Square, V&A Waterfront, Cape Town", contactEmail: "reservations@theroyalportfolio.com", contactPhone: "+27-21-6705000", website: "https://thesilohotel.com", kybStatus: "approved", employeeCount: 120 },
  { name: "The Test Kitchen", type: "restaurant", country: "ZA", city: "Cape Town", address: "The Old Biscuit Mill, 375 Albert Road, Woodstock", contactEmail: "info@thetestkitchen.co.za", contactPhone: "+27-21-4472337", website: "https://thetestkitchen.co.za", kybStatus: "approved", employeeCount: 45 },
  { name: "Cape Town International Convention Centre", type: "conference_center", country: "ZA", city: "Cape Town", address: "Convention Square, 1 Lower Long Street", contactEmail: "info@cticc.co.za", contactPhone: "+27-21-4100500", website: "https://cticc.co.za", kybStatus: "approved", employeeCount: 600 },
  { name: "Sandton Convention Centre", type: "conference_center", country: "ZA", city: "Johannesburg", address: "161 Maude Street, Sandton", contactEmail: "info@scc.co.za", contactPhone: "+27-11-7798000", website: "https://scc.co.za", kybStatus: "approved", employeeCount: 500 },
  // Tanzania
  { name: "Serena Hotel Dar es Salaam", type: "hotel", country: "TZ", city: "Dar es Salaam", address: "Kivukoni Front, Dar es Salaam", contactEmail: "dar@serenahotels.com", contactPhone: "+255-22-2112416", website: "https://serenahotels.com/dares", kybStatus: "approved", employeeCount: 300 },
  { name: "Zanzibar Serena Inn", type: "hotel", country: "TZ", city: "Stone Town", address: "Shangani Street, Stone Town, Zanzibar", contactEmail: "zanzibar@serenahotels.com", contactPhone: "+255-24-2233587", website: "https://serenahotels.com/zanzibar", kybStatus: "approved", employeeCount: 90 },
  // Rwanda
  { name: "Kigali Marriott Hotel", type: "hotel", country: "RW", city: "Kigali", address: "KN 3 Avenue, Kigali", contactEmail: "kigali.marriott@marriott.com", contactPhone: "+250-252-252000", website: "https://marriott.com/kigali", kybStatus: "approved", employeeCount: 380 },
  { name: "Repub Lounge Kigali", type: "restaurant", country: "RW", city: "Kigali", address: "KG 9 Avenue, Kiyovu, Kigali", contactEmail: "info@repub.rw", contactPhone: "+250-788-300000", website: "https://repub.rw", kybStatus: "approved", employeeCount: 80 },
  { name: "Kigali Convention Centre", type: "conference_center", country: "RW", city: "Kigali", address: "KG 2 Roundabout, Kigali", contactEmail: "info@kcc.rw", contactPhone: "+250-252-580000", website: "https://kcc.rw", kybStatus: "approved", employeeCount: 450 },
  // Ethiopia
  { name: "Sheraton Addis", type: "hotel", country: "ET", city: "Addis Ababa", address: "Taitu Street, Addis Ababa", contactEmail: "sheraton.addis@luxurycollection.com", contactPhone: "+251-11-5171717", website: "https://sheratonaddis.com", kybStatus: "approved", employeeCount: 700 },
  { name: "Yod Abyssinia Cultural Restaurant", type: "restaurant", country: "ET", city: "Addis Ababa", address: "Bole Road, Addis Ababa", contactEmail: "info@yodethiopia.com", contactPhone: "+251-11-6613366", website: "https://yodethiopia.com", kybStatus: "approved", employeeCount: 100 },
  // Egypt
  { name: "Marriott Mena House Cairo", type: "hotel", country: "EG", city: "Cairo", address: "6 Pyramids Road, Giza", contactEmail: "menahouse@marriott.com", contactPhone: "+20-2-33773222", website: "https://marriott.com/mena-house", kybStatus: "approved", employeeCount: 500 },
  { name: "Cairo International Conference Centre", type: "conference_center", country: "EG", city: "Cairo", address: "Nasr City, Cairo", contactEmail: "info@cicc.gov.eg", contactPhone: "+20-2-24019000", website: "https://cicc.gov.eg", kybStatus: "approved", employeeCount: 350 },
  // Morocco
  { name: "La Mamounia Marrakech", type: "hotel", country: "MA", city: "Marrakech", address: "Avenue Bab Jdid, Marrakech", contactEmail: "reservations@mamounia.com", contactPhone: "+212-524-388600", website: "https://mamounia.com", kybStatus: "approved", employeeCount: 600 },
  { name: "Dar Yacout Marrakech", type: "restaurant", country: "MA", city: "Marrakech", address: "79 Sidi Ahmed Soussi, Medina, Marrakech", contactEmail: "info@daryacout.com", contactPhone: "+212-524-382929", website: "https://daryacout.com", kybStatus: "approved", employeeCount: 50 },
  // Senegal
  { name: "Terrou-Bi Beach Resort Dakar", type: "beach_resort", country: "SN", city: "Dakar", address: "Corniche Est, Dakar", contactEmail: "info@terroubi.com", contactPhone: "+221-33-8590000", website: "https://terroubi.com", kybStatus: "approved", employeeCount: 250 },
  { name: "Dakar Arena", type: "sports_venue", country: "SN", city: "Dakar", address: "Diamniadio, Dakar", contactEmail: "info@dakar-arena.sn", contactPhone: "+221-33-8000000", website: "https://dakar-arena.sn", kybStatus: "under_review", employeeCount: 300 },
  // Côte d'Ivoire
  { name: "Sofitel Abidjan Hotel Ivoire", type: "hotel", country: "CI", city: "Abidjan", address: "Boulevard Hassan II, Cocody, Abidjan", contactEmail: "h1490@sofitel.com", contactPhone: "+225-27-20200000", website: "https://sofitel.com/abidjan", kybStatus: "approved", employeeCount: 650 },
  { name: "Palais de la Culture de Treichville", type: "concert_venue", country: "CI", city: "Abidjan", address: "Treichville, Abidjan", contactEmail: "info@palaisdelaculture.ci", contactPhone: "+225-27-21240000", website: "https://palaisdelaculture.ci", kybStatus: "submitted", employeeCount: 80 },
];

// ─── Seed Functions ───────────────────────────────────────────────────────────

async function seedTourismEvents() {
  console.log(`\n📅 Seeding ${tourismEvents.length} tourism events...`);
  let inserted = 0;
  for (const event of tourismEvents) {
    try {
      await sql`
        INSERT INTO tourism_events (name, country, city, category, expected_attendees,
          start_date, end_date, description, is_active, created_at)
        VALUES (${event.name}, ${event.country}, ${event.city}, ${event.category},
          ${event.expectedAttendees}, ${event.startDate}, ${event.endDate},
          ${event.description}, true, NOW())
        ON CONFLICT DO NOTHING
      `;
      inserted++;
    } catch (err) {
      console.warn(`  ⚠ Skipped event "${event.name}": ${err.message}`);
    }
  }
  console.log(`  ✓ ${inserted}/${tourismEvents.length} events inserted`);
}

async function seedEstablishments() {
  console.log(`\n🏨 Seeding ${establishments.length} establishments...`);
  let inserted = 0;
  for (const est of establishments) {
    try {
      await sql`
        INSERT INTO establishments (name, type, country, city, address,
          contact_email, contact_phone, website, kyb_status, employee_count, created_at, updated_at)
        VALUES (${est.name}, ${est.type}::establishment_type, ${est.country}, ${est.city},
          ${est.address}, ${est.contactEmail}, ${est.contactPhone}, ${est.website},
          ${est.kybStatus}::kyb_status, ${est.employeeCount}, NOW(), NOW())
        ON CONFLICT DO NOTHING
      `;
      inserted++;
    } catch (err) {
      console.warn(`  ⚠ Skipped "${est.name}": ${err.message}`);
    }
  }
  console.log(`  ✓ ${inserted}/${establishments.length} establishments inserted`);
}

async function seedFraudAlerts() {
  console.log(`\n🚨 Seeding sample fraud alerts...`);
  const alerts = [
    { alertId: "FRD-NG-001", severity: "high", status: "open", description: "Velocity anomaly: 47 transactions in 3 minutes from single device", amount: "2847500", currency: "NGN", country: "NG", ruleTriggered: "velocity_check", gnnScore: "0.94" },
    { alertId: "FRD-KE-001", severity: "critical", status: "investigating", description: "Card-not-present fraud pattern detected across 3 establishments", amount: "185000", currency: "KES", country: "KE", ruleTriggered: "cnp_pattern", gnnScore: "0.97" },
    { alertId: "FRD-GH-001", severity: "medium", status: "open", description: "Unusual cross-border transaction pattern: NG→GH→SN in 2 hours", amount: "45000", currency: "GHS", country: "GH", ruleTriggered: "cross_border_velocity", gnnScore: "0.71" },
    { alertId: "FRD-ZA-001", severity: "low", status: "resolved", description: "Duplicate transaction detected — likely double-tap on POS terminal", amount: "1250", currency: "ZAR", country: "ZA", ruleTriggered: "duplicate_detection", gnnScore: "0.42" },
    { alertId: "FRD-TZ-001", severity: "high", status: "open", description: "Account takeover indicators: new device, new location, high-value transfer", amount: "3200000", currency: "TZS", country: "TZ", ruleTriggered: "account_takeover", gnnScore: "0.89" },
  ];
  let inserted = 0;
  for (const a of alerts) {
    try {
      await sql`
        INSERT INTO fraud_alerts (alert_id, severity, status, description, amount, currency,
          country, rule_triggered, gnn_score, metadata, created_at, updated_at)
        VALUES (${a.alertId}, ${a.severity}::fraud_alert_severity, ${a.status}::fraud_alert_status,
          ${a.description}, ${a.amount}, ${a.currency}, ${a.country}, ${a.ruleTriggered},
          ${a.gnnScore}, '{}', NOW(), NOW())
        ON CONFLICT (alert_id) DO NOTHING
      `;
      inserted++;
    } catch (err) {
      console.warn(`  ⚠ Skipped fraud alert ${a.alertId}: ${err.message}`);
    }
  }
  console.log(`  ✓ ${inserted}/${alerts.length} fraud alerts inserted`);
}

async function seedSocAlerts() {
  console.log(`\n🛡 Seeding sample SOC alerts...`);
  const alerts = [
    { alertId: "SOC-001", type: "intrusion", severity: "critical", status: "open", source: "wazuh-ids", title: "Brute force attack on BIS API endpoint", description: "1,247 failed authentication attempts from IP range 185.220.x.x in 10 minutes", sourceIp: "185.220.101.47" },
    { alertId: "SOC-002", type: "threat_intel", severity: "high", status: "investigating", source: "opencti", title: "Known malicious IP accessing KYB document upload", description: "IP 94.102.49.190 flagged by OpenCTI threat intelligence feed — associated with document fraud ring", sourceIp: "94.102.49.190" },
    { alertId: "SOC-003", type: "policy_violation", severity: "medium", status: "open", source: "opa-engine", title: "OPA policy violation: unauthorized cross-tenant data access attempt", description: "Service account attempted to query BIS investigation records outside its authorized tenant scope", sourceIp: null },
    { alertId: "SOC-004", type: "anomaly", severity: "low", status: "resolved", source: "api-gateway", title: "Unusual API call volume from mobile client", description: "Single mobile device ID made 890 API calls in 1 hour — likely automated scraping attempt", sourceIp: null },
  ];
  let inserted = 0;
  for (const a of alerts) {
    try {
      await sql`
        INSERT INTO soc_alerts (alert_id, type, severity, status, source, title, description,
          source_ip, raw_payload, created_at, updated_at)
        VALUES (${a.alertId}, ${a.type}::soc_alert_type, ${a.severity}::fraud_alert_severity,
          ${a.status}::fraud_alert_status, ${a.source}, ${a.title}, ${a.description},
          ${a.sourceIp}, '{}', NOW(), NOW())
        ON CONFLICT (alert_id) DO NOTHING
      `;
      inserted++;
    } catch (err) {
      console.warn(`  ⚠ Skipped SOC alert ${a.alertId}: ${err.message}`);
    }
  }
  console.log(`  ✓ ${inserted}/${alerts.length} SOC alerts inserted`);
}

async function printSummary() {
  const [eventsCount] = await sql`SELECT COUNT(*) as count FROM tourism_events`;
  const [estCount] = await sql`SELECT COUNT(*) as count FROM establishments`;
  const [fraudCount] = await sql`SELECT COUNT(*) as count FROM fraud_alerts`;
  const [socCount] = await sql`SELECT COUNT(*) as count FROM soc_alerts`;
  const byCountry = await sql`SELECT country, COUNT(*) as count FROM establishments GROUP BY country ORDER BY count DESC`;

  const flags = { NG: "🇳🇬", KE: "🇰🇪", GH: "🇬🇭", ZA: "🇿🇦", TZ: "🇹🇿", RW: "🇷🇼", ET: "🇪🇹", EG: "🇪🇬", MA: "🇲🇦", SN: "🇸🇳", CI: "🇨🇮" };
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  TOURISMPAY AFRICA REGISTRY — SEED SUMMARY");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Tourism Events:    ${eventsCount.count}`);
  console.log(`  Establishments:    ${estCount.count}`);
  console.log(`  Fraud Alerts:      ${fraudCount.count}`);
  console.log(`  SOC Alerts:        ${socCount.count}`);
  console.log("\n  Establishments by Country:");
  for (const row of byCountry) {
    console.log(`    ${flags[row.country] || "🌍"}  ${row.country}: ${row.count}`);
  }
  console.log("═══════════════════════════════════════════════════════\n");
}

async function main() {
  console.log("🌍 TourismPay Africa Registry — Seeding PostgreSQL...");
  try {
    await seedTourismEvents();
    await seedEstablishments();
    await seedFraudAlerts();
    await seedSocAlerts();
    await printSummary();
    console.log("✅ Seed complete!\n");
  } catch (err) {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
