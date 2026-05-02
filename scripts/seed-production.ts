/**
 * Production Seed Data
 *
 * Seeds the database with realistic demo data for all platform features.
 * Run with: npx tsx scripts/seed-production.ts
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../drizzle/schema";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://ndsep_user:ndsep_secure_2026@localhost:5432/ndsep_db";

async function seed() {
  console.log("Connecting to database...");
  const client = postgres(DATABASE_URL);
  const db = drizzle(client, { schema });

  console.log("Seeding users...");
  const userValues = [
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

  for (const u of userValues) {
    await db.insert(schema.users).values(u).onConflictDoNothing();
  }

  console.log("Seeding establishments...");
  const users = await db.select().from(schema.users);
  const merchantIds = users.filter(u => u.role === "merchant").map(u => u.id);

  const establishments = [
    { name: "Serengeti Safari Experience", type: "tour_operator" as const, country: "TZ", city: "Arusha", address: "123 Safari Rd", latitude: "-3.3869", longitude: "36.6830", currency: "TZS", kybStatus: "approved" as const, ownerId: merchantIds[0], contactPhone: "+255271234567", contactEmail: "info@serengeti.tz" },
    { name: "Gold Coast Beach Resort", type: "hotel" as const, country: "GH", city: "Accra", address: "45 Beach Ave", latitude: "5.6037", longitude: "-0.1870", currency: "GHS", kybStatus: "approved" as const, ownerId: merchantIds[1], contactPhone: "+233201234567", contactEmail: "info@goldcoast.gh" },
    { name: "Medina Rooftop Restaurant", type: "restaurant" as const, country: "KE", city: "Nairobi", address: "78 Uhuru Hwy", latitude: "-1.2921", longitude: "36.8219", currency: "KES", kybStatus: "under_review" as const, ownerId: merchantIds[2], contactPhone: "+254201234567", contactEmail: "info@medina.ke" },
  ];

  for (const e of establishments) {
    if (e.ownerId) {
      await db.insert(schema.establishments).values(e).onConflictDoNothing();
    }
  }

  console.log("Seed complete!");
  await client.end();
}

seed().catch(console.error);
