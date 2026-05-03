/**
 * Comprehensive Seed Data for TourismPay Platform
 *
 * Seeds ALL major tables with realistic demo data for testing and demo.
 * Run: npx tsx scripts/seed-comprehensive.ts
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../drizzle/schema";
import crypto from "crypto";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://ndsep_user:ndsep_secure_2026@localhost:5432/ndsep_db";

async function seed() {
  console.log("[seed] Connecting to database...");
  const client = postgres(DATABASE_URL);
  const db = drizzle(client, { schema });

  // ─── 1. Users (11 across all roles) ─────────────────────────
  console.log("[seed] 1/30 Users...");
  const userRows = [
    { openId: "admin_001", name: "Patrick Munis", email: "admin@tourismpay.com", role: "admin" as const, loginMethod: "email", onboardingCompleted: true },
    { openId: "tourist_001", name: "Amara Diallo", email: "amara@tourist.com", role: "tourist" as const, loginMethod: "google", onboardingCompleted: true },
    { openId: "tourist_002", name: "James Mitchell", email: "james@tourist.com", role: "tourist" as const, loginMethod: "google", onboardingCompleted: true },
    { openId: "tourist_003", name: "Yuki Tanaka", email: "yuki@tourist.com", role: "tourist" as const, loginMethod: "email", onboardingCompleted: false },
    { openId: "merchant_001", name: "Kofi Mensah", email: "kofi@serengeti.tz", role: "merchant" as const, loginMethod: "email", onboardingCompleted: true },
    { openId: "merchant_002", name: "Ama Owusu", email: "ama@goldcoast.gh", role: "merchant" as const, loginMethod: "email", onboardingCompleted: true },
    { openId: "merchant_003", name: "Ibrahim Hassan", email: "ibrahim@medina.ke", role: "merchant" as const, loginMethod: "email", onboardingCompleted: false },
    { openId: "compliance_001", name: "Grace Okafor", email: "grace@tourismpay.com", role: "compliance_officer" as const, loginMethod: "email", onboardingCompleted: true },
    { openId: "settlement_001", name: "David Kamau", email: "david@tourismpay.com", role: "settlement_officer" as const, loginMethod: "email", onboardingCompleted: true },
    { openId: "noc_001", name: "Fatima Al-Rashid", email: "fatima@tourismpay.com", role: "noc_operator" as const, loginMethod: "email", onboardingCompleted: true },
    { openId: "bis_001", name: "Samuel Osei", email: "samuel@tourismpay.com", role: "bis_analyst" as const, loginMethod: "email", onboardingCompleted: true },
  ];
  for (const u of userRows) await db.insert(schema.users).values(u).onConflictDoNothing();
  const users = await db.select().from(schema.users);
  const byRole = (r: string) => users.filter(u => u.role === r);
  const tourists = byRole("tourist");
  const merchants = byRole("merchant");
  const admin = byRole("admin")[0];

  // ─── 2. Establishments ──────────────────────────────────────
  console.log("[seed] 2/30 Establishments...");
  const estRows = [
    { name: "Serengeti Safari Experience", type: "tour_operator" as const, country: "TZ", city: "Arusha", address: "123 Safari Rd", latitude: "-3.3869", longitude: "36.6830", currency: "TZS", kybStatus: "approved" as const, ownerId: merchants[0]?.id, contactPhone: "+255271234567", contactEmail: "info@serengeti.tz" },
    { name: "Gold Coast Beach Resort", type: "hotel" as const, country: "GH", city: "Accra", address: "45 Beach Ave", latitude: "5.6037", longitude: "-0.1870", currency: "GHS", kybStatus: "approved" as const, ownerId: merchants[1]?.id, contactPhone: "+233201234567", contactEmail: "info@goldcoast.gh" },
    { name: "Medina Rooftop Restaurant", type: "restaurant" as const, country: "KE", city: "Nairobi", address: "78 Uhuru Hwy", latitude: "-1.2921", longitude: "36.8219", currency: "KES", kybStatus: "under_review" as const, ownerId: merchants[2]?.id, contactPhone: "+254201234567", contactEmail: "info@medina.ke" },
    { name: "Victoria Falls Adventure Co", type: "tour_operator" as const, country: "ZW", city: "Victoria Falls", address: "12 Zambezi Dr", latitude: "-17.9243", longitude: "25.8572", currency: "USD", kybStatus: "approved" as const, ownerId: merchants[0]?.id, contactPhone: "+263123456789", contactEmail: "info@vicfalls.co.zw" },
    { name: "Lagos Art House Hotel", type: "hotel" as const, country: "NG", city: "Lagos", address: "200 Victoria Island", latitude: "6.4281", longitude: "3.4219", currency: "NGN", kybStatus: "approved" as const, ownerId: merchants[1]?.id, contactPhone: "+234801234567", contactEmail: "info@arthouselg.ng" },
  ];
  for (const e of estRows) {
    if (e.ownerId) await db.insert(schema.establishments).values(e).onConflictDoNothing();
  }
  const establishments = await db.select().from(schema.establishments);

  // ─── 3. KYB Applications ────────────────────────────────────
  console.log("[seed] 3/30 KYB Applications...");
  for (const est of establishments) {
    await db.insert(schema.kybApplications).values({
      establishmentId: est.id,
      status: est.kybStatus as any,
      country: est.country,
      businessName: est.name,
      registrationNumber: `REG-${est.country}-${crypto.randomUUID().slice(0, 8)}`,
      taxId: `TAX-${est.country}-${crypto.randomUUID().slice(0, 8)}`,
    }).onConflictDoNothing();
  }

  // ─── 4. Wallet Balances ─────────────────────────────────────
  console.log("[seed] 4/30 Wallet Balances...");
  const currencies = ["USD", "NGN", "KES", "GHS", "TZS", "ZAR", "XOF", "UGX"];
  for (const user of tourists) {
    for (const c of currencies.slice(0, 4)) {
      await db.insert(schema.walletBalances).values({
        userId: user.id,
        currency: c,
        balance: String(Math.floor(Math.random() * 5000) + 100),
      }).onConflictDoNothing();
    }
  }

  // ─── 5. Wallet Transactions ─────────────────────────────────
  console.log("[seed] 5/30 Wallet Transactions...");
  for (const user of tourists.slice(0, 2)) {
    const txTypes = ["deposit", "withdrawal", "transfer", "payment", "refund"] as const;
    for (let i = 0; i < 10; i++) {
      await db.insert(schema.walletTransactions).values({
        userId: user.id,
        type: txTypes[i % txTypes.length],
        amount: String(Math.floor(Math.random() * 500) + 10),
        currency: currencies[i % currencies.length],
        status: "completed",
        description: `Demo transaction #${i + 1}`,
        referenceId: crypto.randomUUID(),
      }).onConflictDoNothing();
    }
  }

  // ─── 6. Loyalty Accounts ────────────────────────────────────
  console.log("[seed] 6/30 Loyalty Accounts...");
  const tiers = ["bronze", "silver", "gold", "platinum"] as const;
  for (let i = 0; i < tourists.length; i++) {
    await db.insert(schema.loyaltyAccounts).values({
      userId: tourists[i].id,
      points: Math.floor(Math.random() * 10000),
      tier: tiers[i % tiers.length],
      lifetimePoints: Math.floor(Math.random() * 50000),
    }).onConflictDoNothing();
  }

  // ─── 7. Loyalty Transactions ────────────────────────────────
  console.log("[seed] 7/30 Loyalty Transactions...");
  for (const user of tourists.slice(0, 2)) {
    for (let i = 0; i < 5; i++) {
      await db.insert(schema.loyaltyTransactions).values({
        userId: user.id,
        type: i % 2 === 0 ? "earn" : "redeem",
        points: Math.floor(Math.random() * 500) + 10,
        description: i % 2 === 0 ? "Purchase reward" : "Reward redemption",
        referenceType: "transaction",
      }).onConflictDoNothing();
    }
  }

  // ─── 8. Fraud Alerts ────────────────────────────────────────
  console.log("[seed] 8/30 Fraud Alerts...");
  const fraudTypes = ["suspicious_transaction", "account_takeover", "identity_fraud", "velocity_check"] as const;
  for (let i = 0; i < 5; i++) {
    await db.insert(schema.fraudAlerts).values({
      userId: tourists[i % tourists.length].id,
      alertType: fraudTypes[i % fraudTypes.length],
      severity: (["low", "medium", "high", "critical"] as const)[i % 4],
      description: `Automated fraud detection alert #${i + 1}`,
      status: (["open", "investigating", "resolved", "dismissed"] as const)[i % 4],
    }).onConflictDoNothing();
  }

  // ─── 9. Audit Logs ─────────────────────────────────────────
  console.log("[seed] 9/30 Audit Logs...");
  const actions = ["user.login", "kyb.submit", "payment.send", "admin.user_update", "settlement.process"];
  for (let i = 0; i < 20; i++) {
    await db.insert(schema.auditLogs).values({
      userId: users[i % users.length].id,
      action: actions[i % actions.length],
      details: JSON.stringify({ ip: `192.168.1.${i + 1}`, userAgent: "TourismPay/1.0" }),
      ipAddress: `192.168.1.${i + 1}`,
    }).onConflictDoNothing();
  }

  // ─── 10. BIS Investigations ─────────────────────────────────
  console.log("[seed] 10/30 BIS Investigations...");
  const kybApps = await db.select().from(schema.kybApplications);
  for (const app of kybApps) {
    await db.insert(schema.bisInvestigations).values({
      kybApplicationId: app.id,
      status: "completed",
      riskScore: Math.floor(Math.random() * 30),
      riskLevel: "low",
      modules: JSON.stringify(["identity", "criminal", "financial", "sanctions", "aml"]),
    }).onConflictDoNothing();
  }

  // ─── 11. Notification Preferences ──────────────────────────
  console.log("[seed] 11/30 Notification Preferences...");
  for (const user of users) {
    await db.insert(schema.notificationPreferences).values({
      userId: user.id,
      emailEnabled: true,
      pushEnabled: true,
      smsEnabled: user.role === "merchant",
    }).onConflictDoNothing();
  }

  // ─── 12. User Notifications ─────────────────────────────────
  console.log("[seed] 12/30 User Notifications...");
  const notifTypes = ["payment_received", "kyb_update", "security_alert", "promotion", "system"] as const;
  for (const user of users.slice(0, 5)) {
    for (let i = 0; i < 3; i++) {
      await db.insert(schema.userNotifications).values({
        userId: user.id,
        type: notifTypes[i % notifTypes.length],
        title: `Notification ${i + 1}`,
        message: `Demo notification for ${user.name}`,
        read: i === 0,
      }).onConflictDoNothing();
    }
  }

  // ─── 13. Merchant Products ──────────────────────────────────
  console.log("[seed] 13/30 Merchant Products...");
  const productCategories = ["food", "tour", "accommodation", "transport", "experience"];
  for (const est of establishments.slice(0, 3)) {
    for (let i = 0; i < 5; i++) {
      await db.insert(schema.merchantProducts).values({
        establishmentId: est.id,
        name: `${est.name} - ${productCategories[i]} Package`,
        description: `Premium ${productCategories[i]} offering from ${est.name}`,
        price: String(Math.floor(Math.random() * 200) + 20),
        currency: est.currency,
        category: productCategories[i],
        available: true,
      }).onConflictDoNothing();
    }
  }

  // ─── 14. QR Payment Tokens ──────────────────────────────────
  console.log("[seed] 14/30 QR Payment Tokens...");
  for (const est of establishments.slice(0, 2)) {
    for (let i = 0; i < 3; i++) {
      await db.insert(schema.qrPaymentTokens).values({
        establishmentId: est.id,
        token: crypto.randomUUID(),
        amount: String(Math.floor(Math.random() * 100) + 5),
        currency: est.currency,
        active: true,
      }).onConflictDoNothing();
    }
  }

  // ─── 15. Staff Invites ──────────────────────────────────────
  console.log("[seed] 15/30 Staff Invites...");
  for (const est of establishments.slice(0, 2)) {
    await db.insert(schema.staffInvites).values({
      establishmentId: est.id,
      email: `staff@${est.contactEmail?.split("@")[1] ?? "example.com"}`,
      role: "cashier",
      status: "accepted",
      invitedBy: est.ownerId!,
    }).onConflictDoNothing();
  }

  // ─── 16. Exchange Rate Overrides ────────────────────────────
  console.log("[seed] 16/30 Exchange Rate Overrides...");
  const pairs = [["USD", "NGN", "1550.00"], ["USD", "KES", "153.50"], ["USD", "GHS", "15.20"], ["EUR", "NGN", "1680.00"], ["GBP", "KES", "195.00"]];
  for (const [from, to, rate] of pairs) {
    await db.insert(schema.exchangeRateOverrides).values({
      fromCurrency: from, toCurrency: to, overrideRate: rate, reason: "Market adjustment", createdBy: admin?.id ?? 1,
    }).onConflictDoNothing();
  }

  // ─── 17. Remittances ────────────────────────────────────────
  console.log("[seed] 17/30 Remittances...");
  for (let i = 0; i < 8; i++) {
    await db.insert(schema.remittances).values({
      senderId: tourists[i % tourists.length].id,
      senderCurrency: "USD",
      senderAmount: String(Math.floor(Math.random() * 500) + 50),
      recipientCurrency: currencies[(i + 1) % currencies.length],
      recipientAmount: String(Math.floor(Math.random() * 50000) + 5000),
      exchangeRate: String(Math.random() * 1000 + 100),
      fee: String(Math.floor(Math.random() * 10) + 1),
      status: (["pending", "processing", "completed", "completed"] as const)[i % 4],
      recipientPhone: `+254${700000000 + i}`,
      recipientName: `Recipient ${i + 1}`,
      corridor: `USD-${currencies[(i + 1) % currencies.length]}`,
    }).onConflictDoNothing();
  }

  // ─── 18. Payment Switch (PS) data ──────────────────────────
  console.log("[seed] 18/30 PaymentSwitch Participants...");
  const participants = ["Central Bank of Kenya", "Safaricom M-Pesa", "Equity Bank", "KCB Bank", "Co-op Bank"];
  for (const p of participants) {
    await db.insert(schema.psParticipants).values({
      name: p,
      type: "bank",
      status: "active",
      fspId: `fsp-${p.toLowerCase().replace(/\s/g, "-")}`,
    }).onConflictDoNothing();
  }

  // ─── 19. PS Settlements ─────────────────────────────────────
  console.log("[seed] 19/30 PS Settlements...");
  for (let i = 0; i < 5; i++) {
    await db.insert(schema.psSettlements).values({
      participantId: i + 1,
      amount: String(Math.floor(Math.random() * 100000) + 10000),
      currency: "KES",
      status: (["pending", "settled", "settled", "failed"] as const)[i % 4],
      settlementWindowId: `SW-2026-${String(i + 1).padStart(3, "0")}`,
    }).onConflictDoNothing();
  }

  // ─── 20. PS Webhooks ────────────────────────────────────────
  console.log("[seed] 20/30 PS Webhooks...");
  await db.insert(schema.psWebhooks).values({
    url: "https://merchant.example.com/webhooks/payments",
    events: JSON.stringify(["payment.completed", "settlement.completed", "refund.initiated"]),
    active: true,
    secret: crypto.randomUUID(),
  }).onConflictDoNothing();

  // ─── 21. Tourist Profiles ───────────────────────────────────
  console.log("[seed] 21/30 Tourist Profiles...");
  for (const t of tourists) {
    await db.insert(schema.touristProfiles).values({
      userId: t.id,
      homeCountry: ["US", "JP", "GB"][tourists.indexOf(t) % 3],
      preferredCurrency: ["USD", "JPY", "GBP"][tourists.indexOf(t) % 3],
      preferredLanguage: ["en", "ja", "en"][tourists.indexOf(t) % 3],
    }).onConflictDoNothing();
  }

  // ─── 22. Tourist Itineraries ────────────────────────────────
  console.log("[seed] 22/30 Tourist Itineraries...");
  const itineraries = [
    { userId: tourists[0]?.id, name: "East Africa Safari", destination: "Kenya/Tanzania", startDate: "2026-06-01", endDate: "2026-06-14" },
    { userId: tourists[1]?.id, name: "West Africa Culture Tour", destination: "Ghana/Nigeria", startDate: "2026-07-15", endDate: "2026-07-28" },
    { userId: tourists[0]?.id, name: "Cape Town Weekend", destination: "South Africa", startDate: "2026-08-01", endDate: "2026-08-04" },
  ];
  for (const it of itineraries) {
    if (it.userId) await db.insert(schema.touristItineraries).values(it).onConflictDoNothing();
  }

  // ─── 23. Tourist Bookings ───────────────────────────────────
  console.log("[seed] 23/30 Tourist Bookings...");
  for (let i = 0; i < 6; i++) {
    await db.insert(schema.touristBookings).values({
      touristId: tourists[i % tourists.length].id,
      establishmentId: establishments[i % establishments.length].id,
      status: (["confirmed", "pending", "completed", "cancelled"] as const)[i % 4],
      totalAmount: String(Math.floor(Math.random() * 300) + 50),
      currency: establishments[i % establishments.length].currency,
      bookingDate: `2026-0${(i % 9) + 1}-${String(10 + i).padStart(2, "0")}`,
    }).onConflictDoNothing();
  }

  // ─── 24. Tourist Reviews ────────────────────────────────────
  console.log("[seed] 24/30 Tourist Reviews...");
  for (let i = 0; i < 4; i++) {
    await db.insert(schema.touristReviews).values({
      touristId: tourists[i % tourists.length].id,
      establishmentId: establishments[i % establishments.length].id,
      rating: Math.floor(Math.random() * 2) + 4,
      title: `Great experience at ${establishments[i % establishments.length].name}`,
      body: "The service was exceptional. Would highly recommend to other travelers.",
    }).onConflictDoNothing();
  }

  // ─── 25. Merchant Payout Schedules ──────────────────────────
  console.log("[seed] 25/30 Merchant Payout Schedules...");
  for (const est of establishments.slice(0, 3)) {
    await db.insert(schema.merchantPayoutSchedules).values({
      establishmentId: est.id,
      frequency: "weekly",
      nextPayoutDate: "2026-05-09",
      minimumAmount: "50.00",
      currency: est.currency,
      bankAccountLast4: String(1000 + Math.floor(Math.random() * 9000)),
    }).onConflictDoNothing();
  }

  // ─── 26. NOC Events ─────────────────────────────────────────
  console.log("[seed] 26/30 NOC Events...");
  const nocTypes = ["service_degradation", "high_latency", "error_spike", "capacity_warning"] as const;
  for (let i = 0; i < 8; i++) {
    await db.insert(schema.nocEvents).values({
      type: nocTypes[i % nocTypes.length],
      severity: (["low", "medium", "high", "critical"] as const)[i % 4],
      service: ["payment-gateway", "settlement", "kyb-service", "fraud-ml"][i % 4],
      message: `NOC event: ${nocTypes[i % nocTypes.length]} detected`,
      resolved: i < 4,
    }).onConflictDoNothing();
  }

  // ─── 27. Carbon Offsets ─────────────────────────────────────
  console.log("[seed] 27/30 Carbon Offsets...");
  for (const t of tourists.slice(0, 2)) {
    await db.insert(schema.carbonOffsets).values({
      userId: t.id,
      offsetKg: String(Math.floor(Math.random() * 500) + 50),
      source: "flight",
      cost: String(Math.floor(Math.random() * 50) + 5),
      currency: "USD",
      provider: "TourismPay Green",
      certificateId: crypto.randomUUID(),
    }).onConflictDoNothing();
  }

  // ─── 28. Trusted Devices ────────────────────────────────────
  console.log("[seed] 28/30 Trusted Devices...");
  for (const u of users.slice(0, 5)) {
    await db.insert(schema.trustedDevices).values({
      userId: u.id,
      deviceFingerprint: crypto.randomUUID(),
      deviceName: "iPhone 15 Pro",
      browser: "Safari",
      os: "iOS 18",
      trusted: true,
      lastUsed: new Date(),
    }).onConflictDoNothing();
  }

  // ─── 29. Rate Alerts ────────────────────────────────────────
  console.log("[seed] 29/30 Rate Alerts...");
  for (const t of tourists.slice(0, 2)) {
    await db.insert(schema.rateAlerts).values({
      userId: t.id,
      fromCurrency: "USD",
      toCurrency: "NGN",
      targetRate: "1600.00",
      direction: "above",
      active: true,
    }).onConflictDoNothing();
  }

  // ─── 30. Role Permissions ───────────────────────────────────
  console.log("[seed] 30/30 Role Permissions...");
  const perms = [
    { role: "admin", resource: "*", action: "*" },
    { role: "tourist", resource: "wallet", action: "read,write" },
    { role: "tourist", resource: "itinerary", action: "read,write" },
    { role: "tourist", resource: "loyalty", action: "read" },
    { role: "merchant", resource: "products", action: "read,write,delete" },
    { role: "merchant", resource: "bookings", action: "read,write" },
    { role: "merchant", resource: "revenue", action: "read" },
    { role: "compliance_officer", resource: "kyb", action: "read,write" },
    { role: "compliance_officer", resource: "bis", action: "read,write" },
    { role: "settlement_officer", resource: "settlement", action: "read,write" },
    { role: "noc_operator", resource: "noc", action: "read,write" },
    { role: "bis_analyst", resource: "bis", action: "read" },
  ];
  for (const p of perms) {
    await db.insert(schema.rolePermissions).values(p).onConflictDoNothing();
  }

  console.log("[seed] Complete! Seeded 30 categories of data.");
  await client.end();
}

seed().catch((err) => {
  console.error("[seed] Error:", err);
  process.exit(1);
});
