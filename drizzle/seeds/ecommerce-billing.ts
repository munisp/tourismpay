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

export async function seedEcommerceAndBilling(db: any, schema: any, users: any[], establishments: any[]) {
  console.log("  Seeding Ecommerce, Inventory, and Platform Billing...");
  
  // Seed Merchant Products & Inventory
  let productCount = 0;
  for (const est of establishments.slice(0, 15)) {
    for (let i = 0; i < randomInt(2, 8); i++) {
      const [product] = await db.insert(schema.merchantProducts).values({
        establishmentId: est.id,
        name: `Product ${i+1} for ${est.name}`,
        description: "A premium tourism product or service",
        price: randomInt(5000, 50000).toFixed(2),
        currency: "NGN",
        category: randomElement(["accommodation", "tour", "food", "souvenir"]),
        status: "active",
        createdAt: randomDate(120),
      }).returning();
      productCount++;
      
      // Inventory
      await db.insert(schema.merchantInventory).values({
        productId: product.id,
        establishmentId: est.id,
        quantity: randomInt(10, 100),
        lowStockThreshold: 5,
        status: "in_stock",
        lastUpdated: randomDate(10),
      });
    }
  }
  
  // Seed Platform Billing (SaaS)
  console.log("  Seeding SaaS Billing and Subscriptions...");
  const plans = ["growth", "scale", "enterprise"];
  for (const est of establishments) {
    // Tenant Subscriptions
    const [sub] = await db.insert(schema.tenantSubscriptions).values({
      tenantId: est.ownerId, // Using owner as tenant for simplicity
      plan: randomElement(plans),
      billingModel: "flat",
      status: "active",
      currency: "NGN",
      monthlyFee: randomInt(10000, 50000).toFixed(2),
      contractStartDate: randomDate(180),
      autoRenew: true,
      createdAt: randomDate(180),
    }).returning();
    
    // Platform Billing Ledger
    for (let i = 0; i < 3; i++) {
      await db.insert(schema.platformBillingLedger).values({
        tenantId: est.ownerId,
        subscriptionId: sub.id,
        amount: sub.monthlyFee,
        currency: "NGN",
        type: "subscription_fee",
        status: "paid",
        period: `2026-0${randomInt(1, 7)}`,
        createdAt: randomDate(180),
      });
    }
  }
  
  // Seed Flash Deals
  for (let i = 0; i < 5; i++) {
    const est = randomElement(establishments);
    await db.insert(schema.flashDeals).values({
      establishmentId: est.id,
      title: `Weekend Special at ${est.name}`,
      description: "50% off all bookings this weekend only!",
      discountType: "percentage",
      discountValue: "50.00",
      startTime: randomDate(2),
      endTime: new Date(Date.now() + 86400000 * 2), // 2 days from now
      status: "active",
      maxUses: 100,
      currentUses: randomInt(0, 50),
      createdAt: randomDate(5),
    });
  }

  console.log(`  ✓ Seeded ${productCount} products and SaaS billing records`);
}
