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

export async function seedLoyaltyAndTipping(db: any, schema: any, users: any[], establishments: any[], agents: any[]) {
  console.log("  Seeding Loyalty, Tipping, and Rewards...");
  
  // Seed Loyalty Accounts
  const loyaltyAccounts = [];
  for (const user of users.filter(u => u.role === "tourist").slice(0, 30)) {
    const [acc] = await db.insert(schema.loyaltyAccounts).values({
      userId: user.id,
      tier: randomElement(["bronze", "silver", "gold", "platinum"]),
      pointsBalance: randomInt(500, 50000),
      lifetimePoints: randomInt(1000, 100000),
      status: "active",
      createdAt: randomDate(180),
    }).returning();
    loyaltyAccounts.push(acc);
    
    // Loyalty Transactions
    for (let j = 0; j < randomInt(3, 10); j++) {
      const type = randomElement(["earn", "redeem", "expire"]);
      await db.insert(schema.loyaltyTransactions).values({
        accountId: acc.id,
        type,
        points: type === "redeem" ? -randomInt(100, 1000) : randomInt(50, 500),
        description: `${type === "earn" ? "Earned from" : "Redeemed for"} booking`,
        reference: `LY-${Date.now()}-${randomInt(1000, 9999)}`,
        createdAt: randomDate(60),
      });
    }
  }
  
  // Seed Tipping
  let tipCount = 0;
  for (let i = 0; i < 40; i++) {
    const user = randomElement(users);
    const est = randomElement(establishments);
    
    const [tip] = await db.insert(schema.tipTransactions).values({
      senderId: user.id,
      establishmentId: est.id,
      amount: randomInt(500, 10000).toFixed(2),
      currency: "NGN",
      status: "completed",
      splitMode: randomElement(["equal", "custom_percent", "custom_amount"]),
      message: randomElement(["Great service!", "Thank you!", "Excellent tour guide", null]),
      createdAt: randomDate(30),
    }).returning();
    tipCount++;
    
    // Tip Distribution
    const staffCount = randomInt(1, 4);
    const splitAmount = (Number(tip.amount) / staffCount).toFixed(2);
    
    for (let j = 0; j < staffCount; j++) {
      await db.insert(schema.tipDistributionLog).values({
        tipId: tip.id,
        recipientId: randomElement(users.filter(u => u.role === "merchant" || u.role === "agent")).id,
        amount: splitAmount,
        status: "distributed",
        distributedAt: tip.createdAt,
      });
    }
  }
  
  // Seed Referral Rewards
  for (let i = 0; i < 20; i++) {
    const referrer = randomElement(users);
    const referee = randomElement(users);
    if (referrer.id === referee.id) continue;
    
    await db.insert(schema.referralRewards).values({
      referrerId: referrer.id,
      refereeId: referee.id,
      rewardType: "fixed_amount",
      rewardAmount: "1000.00",
      status: randomElement(["pending", "paid"]),
      createdAt: randomDate(90),
    });
  }

  console.log(`  ✓ Seeded ${loyaltyAccounts.length} loyalty accounts and ${tipCount} tip transactions`);
}
