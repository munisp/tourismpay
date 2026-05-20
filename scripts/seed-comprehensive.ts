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
      const fromCur = currencies[i % currencies.length];
      const toCur = currencies[(i + 1) % currencies.length];
      await db.insert(schema.walletTransactions).values({
        userId: user.id,
        type: txTypes[i % txTypes.length],
        amount: String(Math.floor(Math.random() * 500) + 10),
        fromCurrency: fromCur,
        toCurrency: toCur,
        status: "completed",
        reference: `demo-tx-${crypto.randomUUID().slice(0, 8)}`,
        note: `Demo transaction #${i + 1}`,
      }).onConflictDoNothing();
    }
  }

  // ─── 6. Loyalty Accounts ────────────────────────────────────
  console.log("[seed] 6/30 Loyalty Accounts...");
  const tiers = ["BRONZE", "SILVER", "GOLD", "PLATINUM"] as const;
  for (let i = 0; i < tourists.length; i++) {
    await db.insert(schema.loyaltyAccounts).values({
      userId: String(tourists[i].id),
      pointsBalance: Math.floor(Math.random() * 10000),
      tier: tiers[i % tiers.length],
      lifetimePoints: Math.floor(Math.random() * 50000),
    }).onConflictDoNothing();
  }

  // ─── 7. Loyalty Transactions ────────────────────────────────
  console.log("[seed] 7/30 Loyalty Transactions...");
  for (const user of tourists.slice(0, 2)) {
    for (let i = 0; i < 5; i++) {
      await db.insert(schema.loyaltyTransactions).values({
        userId: String(user.id),
        type: i % 2 === 0 ? "earn" : "redeem",
        points: Math.floor(Math.random() * 500) + 10,
        description: i % 2 === 0 ? "Purchase reward" : "Reward redemption",
        referenceId: `ref-${crypto.randomUUID().slice(0, 8)}`,
      }).onConflictDoNothing();
    }
  }

  // ─── 8. Fraud Alerts ────────────────────────────────────────
  console.log("[seed] 8/30 Fraud Alerts...");
  for (let i = 0; i < 5; i++) {
    await db.insert(schema.fraudAlerts).values({
      alertId: `FA-2026-${String(i + 1).padStart(5, "0")}`,
      severity: (["low", "medium", "high", "critical", "info"] as const)[i % 5],
      description: `Automated fraud detection alert #${i + 1}`,
      status: (["open", "investigating", "resolved", "false_positive"] as const)[i % 4],
      ruleTriggered: ["velocity_check", "geo_anomaly", "amount_threshold", "account_takeover", "identity_mismatch"][i % 5],
      amount: String(Math.floor(Math.random() * 5000) + 100),
      currency: currencies[i % currencies.length],
    }).onConflictDoNothing();
  }

  // ─── 9. Audit Logs ─────────────────────────────────────────
  console.log("[seed] 9/30 Audit Logs...");
  const actions = ["user.login", "kyb.submit", "payment.send", "admin.user_update", "settlement.process"];
  for (let i = 0; i < 20; i++) {
    await db.insert(schema.auditLogs).values({
      actorId: users[i % users.length].id,
      actorName: users[i % users.length].name ?? "System",
      action: actions[i % actions.length],
      entityType: ["user", "kyb_application", "wallet_transaction", "user", "settlement"][i % 5],
      entityId: String(i + 1),
      description: `Audit: ${actions[i % actions.length]}`,
      ipAddress: `192.168.1.${i + 1}`,
    }).onConflictDoNothing();
  }

  // ─── 10. BIS Investigations ─────────────────────────────────
  console.log("[seed] 10/30 BIS Investigations...");
  for (let i = 0; i < establishments.length; i++) {
    const est = establishments[i];
    await db.insert(schema.bisInvestigations).values({
      referenceId: `BIS-2026-${String(i + 1).padStart(4, "0")}`,
      establishmentId: est.id,
      requestedBy: admin?.id,
      subjectType: "entity",
      subjectFullName: est.name,
      subjectCountry: est.country,
      tier: "standard",
      status: "completed",
      riskScore: Math.floor(Math.random() * 30),
      riskLevel: "low",
      moduleResults: { identity: "pass", criminal: "pass", financial: "pass", sanctions: "pass", aml: "pass" },
      consentObtained: true,
    }).onConflictDoNothing();
  }

  // ─── 11. Notification Preferences ──────────────────────────
  console.log("[seed] 11/30 Notification Preferences...");
  for (const user of users) {
    await db.insert(schema.notificationPreferences).values({
      userId: user.id,
      bisEnabled: true,
      kybEnabled: true,
      fraudEnabled: true,
      socEnabled: true,
      systemEnabled: true,
      reportEnabled: true,
    }).onConflictDoNothing();
  }

  // ─── 12. User Notifications ─────────────────────────────────
  console.log("[seed] 12/30 User Notifications...");
  const notifCategories = ["kyb", "bis", "fraud", "soc", "system"] as const;
  for (const user of users.slice(0, 5)) {
    for (let i = 0; i < 3; i++) {
      await db.insert(schema.userNotifications).values({
        userId: user.id,
        category: notifCategories[i % notifCategories.length],
        title: `Notification ${i + 1}`,
        content: `Demo notification for ${user.name}`,
        isRead: i === 0,
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
        amountUsd: String(Math.floor(Math.random() * 100) + 5),
        currency: est.currency,
        status: "pending",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      }).onConflictDoNothing();
    }
  }

  // ─── 15. Staff Invites ──────────────────────────────────────
  console.log("[seed] 15/30 Staff Invites...");
  for (const est of establishments.slice(0, 2)) {
    await db.insert(schema.staffInvites).values({
      token: crypto.randomUUID(),
      establishmentId: est.id,
      inviterUserId: est.ownerId!,
      email: `staff@${est.contactEmail?.split("@")[1] ?? "example.com"}`,
      role: "cashier",
      status: "accepted",
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    }).onConflictDoNothing();
  }

  // ─── 16. Exchange Rate Overrides ────────────────────────────
  console.log("[seed] 16/30 Exchange Rate Overrides...");
  const pairs = [["USD", "NGN", "1550.00"], ["USD", "KES", "153.50"], ["USD", "GHS", "15.20"], ["EUR", "NGN", "1680.00"], ["GBP", "KES", "195.00"]];
  for (const [from, to, rate] of pairs) {
    await db.insert(schema.exchangeRateOverrides).values({
      baseCurrency: from, targetCurrency: to, rate, reason: "Market adjustment", createdByUserId: admin?.id ?? 1,
    }).onConflictDoNothing();
  }

  // ─── 17. Remittances ────────────────────────────────────────
  console.log("[seed] 17/30 Remittances...");
  const remitCurrencies = ["USD", "NGN", "KES", "GHS", "TZS", "UGX", "ZAR", "USDC"] as const;
  for (let i = 0; i < 8; i++) {
    await db.insert(schema.remittances).values({
      id: `RMT-2026-${String(i + 1).padStart(6, "0")}`,
      userId: tourists[i % tourists.length].id,
      senderCurrency: "USD",
      senderAmount: String(Math.floor(Math.random() * 500) + 50),
      recipientCurrency: remitCurrencies[(i + 1) % remitCurrencies.length],
      recipientAmount: String(Math.floor(Math.random() * 50000) + 5000),
      exchangeRate: String(Math.random() * 1000 + 100),
      fee: String(Math.floor(Math.random() * 10) + 1),
      status: (["pending", "processing", "completed", "completed"] as const)[i % 4],
      deliveryOption: (["bank_transfer", "mobile_money", "agent_cash", "wallet"] as const)[i % 4],
      recipientPhone: `+254${700000000 + i}`,
      recipientName: `Recipient ${i + 1}`,
    }).onConflictDoNothing();
  }

  // ─── 18. Payment Switch (PS) data ──────────────────────────
  console.log("[seed] 18/30 PaymentSwitch Participants...");
  const participantData = [
    { name: "Central Bank of Kenya", type: "bank" as const },
    { name: "Safaricom M-Pesa", type: "mobile_money" as const },
    { name: "Equity Bank", type: "bank" as const },
    { name: "KCB Bank", type: "bank" as const },
    { name: "Co-op Bank", type: "bank" as const },
  ];
  for (const p of participantData) {
    await db.insert(schema.psParticipants).values({
      id: `psp-${p.name.toLowerCase().replace(/\s/g, "-")}`,
      name: p.name,
      type: p.type,
      status: "active",
      mojaloopFspId: `fsp-${p.name.toLowerCase().replace(/\s/g, "-")}`,
    }).onConflictDoNothing();
  }

  // ─── 19. PS Settlements ─────────────────────────────────────
  console.log("[seed] 19/30 PS Settlements...");
  const psParticipantIds = participantData.map(p => `psp-${p.name.toLowerCase().replace(/\s/g, "-")}`);
  for (let i = 0; i < 5; i++) {
    await db.insert(schema.psSettlements).values({
      id: `STL-2026-${String(i + 1).padStart(6, "0")}`,
      batchId: `BATCH-2026-${String(i + 1).padStart(3, "0")}`,
      participantId: psParticipantIds[i % psParticipantIds.length],
      totalAmount: String(Math.floor(Math.random() * 100000) + 10000),
      currency: "KES",
      transactionCount: Math.floor(Math.random() * 100) + 10,
      status: (["pending", "completed", "completed", "failed"] as const)[i % 4],
      mojaloopWindowId: `SW-2026-${String(i + 1).padStart(3, "0")}`,
    }).onConflictDoNothing();
  }

  // ─── 20. PS Webhooks ────────────────────────────────────────
  console.log("[seed] 20/30 PS Webhooks...");
  await db.insert(schema.psWebhooks).values({
    webhookId: `WH-${crypto.randomUUID().slice(0, 8)}`,
    name: "Merchant Payment Notifications",
    endpoint: "https://merchant.example.com/webhooks/payments",
    events: "remittance.completed,settlement.completed,refund.initiated",
    isActive: true,
    secret: crypto.randomUUID(),
  }).onConflictDoNothing();

  // ─── 21. Tourist Profiles ───────────────────────────────────
  console.log("[seed] 21/30 Tourist Profiles...");
  for (const t of tourists) {
    await db.insert(schema.touristProfiles).values({
      userId: t.id,
      homeCountry: ["US", "JP", "GB"][tourists.indexOf(t) % 3],
      homeCurrency: ["USD", "JPY", "GBP"][tourists.indexOf(t) % 3],
      preferredLanguage: ["en", "ja", "en"][tourists.indexOf(t) % 3],
    }).onConflictDoNothing();
  }

  // ─── 22. Tourist Itineraries ────────────────────────────────
  console.log("[seed] 22/30 Tourist Itineraries...");
  const itineraries = [
    { userId: tourists[0]?.id, title: "East Africa Safari", destination: "Kenya/Tanzania", startDate: new Date("2026-06-01"), endDate: new Date("2026-06-14") },
    { userId: tourists[1]?.id, title: "West Africa Culture Tour", destination: "Ghana/Nigeria", startDate: new Date("2026-07-15"), endDate: new Date("2026-07-28") },
    { userId: tourists[0]?.id, title: "Cape Town Weekend", destination: "South Africa", startDate: new Date("2026-08-01"), endDate: new Date("2026-08-04") },
  ];
  for (const it of itineraries) {
    if (it.userId) await db.insert(schema.touristItineraries).values(it).onConflictDoNothing();
  }

  // ─── 23. Tourist Bookings ───────────────────────────────────
  console.log("[seed] 23/30 Tourist Bookings...");
  for (let i = 0; i < 6; i++) {
    const est = establishments[i % establishments.length];
    await db.insert(schema.touristBookings).values({
      userId: tourists[i % tourists.length].id,
      establishmentId: est.id,
      serviceName: `${est.name} Experience Package`,
      serviceType: ["tour", "dining", "accommodation", "activity"][i % 4],
      status: (["confirmed", "pending", "completed", "cancelled"] as const)[i % 4],
      priceUsd: String(Math.floor(Math.random() * 300) + 50),
      currency: est.currency,
      bookingDate: new Date(`2026-0${(i % 9) + 1}-${String(10 + i).padStart(2, "0")}`),
      bookingDateStr: `2026-0${(i % 9) + 1}-${String(10 + i).padStart(2, "0")}`,
    }).onConflictDoNothing();
  }

  // ─── 24. Tourist Reviews ────────────────────────────────────
  console.log("[seed] 24/30 Tourist Reviews...");
  for (let i = 0; i < 4; i++) {
    await db.insert(schema.touristReviews).values({
      userId: tourists[i % tourists.length].id,
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
      merchantId: est.ownerId!,
      frequency: "weekly",
      preferredDay: 1,
      isActive: true,
      nextRunAt: new Date("2026-05-09"),
    }).onConflictDoNothing();
  }

  // ─── 26. NOC Events ─────────────────────────────────────────
  console.log("[seed] 26/30 NOC Events...");
  const nocTypes = ["kill_switch_activated", "kill_switch_deactivated", "participant_suspended", "participant_restored", "rate_limit_breach", "fraud_alert", "system_alert", "settlement_failed"] as const;
  for (let i = 0; i < 8; i++) {
    await db.insert(schema.nocEvents).values({
      type: nocTypes[i % nocTypes.length],
      severity: (["low", "medium", "high", "critical"] as const)[i % 4],
      title: `NOC: ${nocTypes[i % nocTypes.length].replace(/_/g, " ")}`,
      description: `NOC event: ${nocTypes[i % nocTypes.length]} detected in ${["payment-gateway", "settlement", "kyb-service", "fraud-ml"][i % 4]}`,
      resolvedAt: i < 4 ? Date.now() : undefined,
    }).onConflictDoNothing();
  }

  // ─── 27. Carbon Offsets ─────────────────────────────────────
  console.log("[seed] 27/30 Carbon Offsets...");
  for (const t of tourists.slice(0, 2)) {
    await db.insert(schema.carbonOffsets).values({
      userId: String(t.id),
      amount: String(Math.floor(Math.random() * 500) + 50),
      projectName: "TourismPay Green Reforestation",
      projectCountry: "KE",
      costUsd: String(Math.floor(Math.random() * 50) + 5),
      certificateUrl: `https://certs.tourismpay.com/${crypto.randomUUID()}`,
    }).onConflictDoNothing();
  }

  // ─── 28. Trusted Devices ────────────────────────────────────
  console.log("[seed] 28/30 Trusted Devices...");
  for (const u of users.slice(0, 5)) {
    await db.insert(schema.trustedDevices).values({
      userId: String(u.id),
      deviceFingerprint: crypto.randomUUID(),
      deviceName: "iPhone 15 Pro",
      deviceType: "mobile",
    }).onConflictDoNothing();
  }

  // ─── 29. Rate Alerts ────────────────────────────────────────
  console.log("[seed] 29/30 Rate Alerts...");
  for (const t of tourists.slice(0, 2)) {
    await db.insert(schema.rateAlerts).values({
      userId: String(t.id),
      baseCurrency: "USD",
      targetCurrency: "NGN",
      targetRate: "1600.00",
      condition: "above",
      status: "active",
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
