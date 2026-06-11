#!/usr/bin/env npx tsx
/**
 * TourismPay Unified Seed Script
 *
 * Single entry point for seeding all platform data.
 * Runs the comprehensive seed (32 categories) + Africa corridor data.
 *
 * Usage:
 *   npx tsx scripts/seed.ts              # Seed all data
 *   npx tsx scripts/seed.ts --reset      # Drop and re-seed (dev only)
 *
 * Categories seeded:
 *   Users (11), Establishments (5), KYB Applications (3), Wallet Balances,
 *   Wallet Transactions, Loyalty Accounts, Loyalty Transactions, Fraud Alerts,
 *   Audit Logs, BIS Investigations, Notification Preferences, User Notifications,
 *   Merchant Products, QR Payment Tokens, Staff Invites, Exchange Rate Overrides,
 *   Remittances, PS Participants, PS Settlements, PS Webhooks, Tourist Profiles,
 *   Tourist Itineraries, Tourist Bookings, Tourist Reviews, Merchant Payout Schedules,
 *   NOC Events, Tourism Events, Biometric Enrollments, DID Documents,
 *   Role Permissions, Liveness Checks, Verification Codes
 */
import "dotenv/config";
import { execSync } from "child_process";
import path from "path";

const root = path.resolve(__dirname, "..");

async function main() {
  const reset = process.argv.includes("--reset");

  if (reset) {
    console.log("[seed] Pushing schema migrations...");
    execSync("npx drizzle-kit push", { cwd: root, stdio: "inherit" });
  }

  console.log("[seed] Running comprehensive seed (32 categories)...");
  execSync("npx tsx scripts/seed-comprehensive.ts", { cwd: root, stdio: "inherit" });

  console.log("[seed] Running Africa corridor data...");
  execSync("node scripts/seed-africa.mjs", { cwd: root, stdio: "inherit" });

  console.log("[seed] All data seeded successfully.");
}

main().catch((err) => {
  console.error("[seed] Fatal error:", err);
  process.exit(1);
});
