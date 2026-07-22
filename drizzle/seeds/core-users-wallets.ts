import { sql } from "drizzle-orm";
import crypto from "crypto";

function uuid() { return crypto.randomUUID(); }
function randomInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randomDate(daysBack: number) {
  const d = new Date();
  d.setDate(d.getDate() - randomInt(0, daysBack));
  return d;
}
function randomElement<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

export async function seedCoreUsersAndWallets(db: any, schema: any) {
  console.log("  Seeding Users, Tenants, and Wallets...");
  
  const roles = ["tourist", "merchant", "agent", "admin", "compliance_officer", "noc_operator", "settlement_officer", "bis_analyst"];
  const countries = ["NG", "GH", "KE", "ZA", "US", "GB", "DE", "FR", "JP", "CN"];
  const currencies = ["NGN", "USD", "EUR", "GBP", "KES", "GHS", "ZAR"];
  
  const users = [];
  const wallets = [];
  
  // Create 100 realistic users across all roles
  for (let i = 1; i <= 100; i++) {
    let role = "tourist";
    if (i <= 5) role = "admin";
    else if (i <= 10) role = "compliance_officer";
    else if (i <= 15) role = "noc_operator";
    else if (i <= 20) role = "settlement_officer";
    else if (i <= 25) role = "bis_analyst";
    else if (i <= 50) role = "merchant";
    else if (i <= 75) role = "agent";

    const [user] = await db.insert(schema.users).values({
      openId: `sub_seed_${i.toString().padStart(4, "0")}`,
      name: `Test ${role.charAt(0).toUpperCase() + role.slice(1)} ${i}`,
      email: `${role}${i}@tourismpay.local`,
      phone: `+234${randomInt(7000000000, 9999999999)}`,
      role,
      country: randomElement(countries),
      kycStatus: randomElement(["pending", "approved", "rejected", "verified"]),
      isActive: true,
      lastLoginAt: randomDate(5),
      createdAt: randomDate(365),
    }).returning();
    users.push(user);

    // Create wallet balances for each user in multiple currencies
    for (const currency of ["NGN", "USD", randomElement(currencies)]) {
      const [wallet] = await db.insert(schema.walletBalances).values({
        userId: user.id,
        currency,
        balance: (randomInt(1000, 500000) + Math.random()).toFixed(2),
        ledgerBalance: (randomInt(1000, 500000) + Math.random()).toFixed(2),
        status: "active",
        createdAt: randomDate(365),
      }).returning();
      wallets.push(wallet);
    }
    
    // Create eNaira wallets for Nigerian users
    if (user.country === "NG" && randomInt(1, 10) > 3) {
      await db.insert(schema.enairaWallets).values({
        userId: user.id,
        alias: `${user.name.split(" ")[0].toLowerCase()}_enaira`,
        balance: (randomInt(5000, 100000) + Math.random()).toFixed(2),
        status: "active",
        tier: randomInt(1, 3),
        dailyLimit: "500000.00",
        createdAt: randomDate(100),
      });
    }
    
    // Create user preferences and settings
    await db.insert(schema.notificationPreferences).values({
      userId: user.id,
      emailEnabled: true,
      pushEnabled: randomElement([true, false]),
      smsEnabled: randomElement([true, false]),
      types: { payments: true, security: true, marketing: false },
    });
    
    // Create login history
    for (let j = 0; j < randomInt(1, 10); j++) {
      await db.insert(schema.loginHistory).values({
        userId: user.id,
        ipAddress: `192.168.${randomInt(1, 255)}.${randomInt(1, 255)}`,
        userAgent: "Mozilla/5.0 TourismPay App/1.0",
        status: "success",
        createdAt: randomDate(30),
      });
    }
  }

  // Create Tenants (for B2B / SaaS multi-tenancy)
  const tenants = [];
  for (let i = 1; i <= 5; i++) {
    const [tenant] = await db.insert(schema.tenants).values({
      name: `Enterprise Client ${i}`,
      slug: `enterprise-${i}`,
      domain: `client${i}.tourismpay.com`,
      status: "active",
      plan: randomElement(["growth", "scale", "enterprise"]),
      createdAt: randomDate(365),
    }).returning();
    tenants.push(tenant);
    
    // Link some users to tenants
    for (let j = 0; j < 5; j++) {
      const u = randomElement(users);
      await db.insert(schema.tenantUsers).values({
        tenantId: tenant.id,
        userId: u.id,
        role: j === 0 ? "owner" : "member",
      });
    }
  }

  console.log(`  ✓ Seeded ${users.length} users, ${wallets.length} wallets, ${tenants.length} tenants`);
  return { users, wallets, tenants };
}
