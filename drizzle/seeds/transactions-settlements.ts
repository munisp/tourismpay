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

export async function seedTransactionsAndSettlements(db: any, schema: any, users: any[], establishments: any[], agents: any[], wallets: any[]) {
  console.log("  Seeding Transactions, Ledger, and Settlements...");
  
  const txTypes = ["payment", "refund", "transfer", "withdrawal", "deposit"];
  const statuses = ["completed", "completed", "completed", "pending", "failed"];
  
  let txCount = 0;
  
  // Create transactions
  for (let i = 0; i < 200; i++) {
    const user = randomElement(users);
    const est = randomElement(establishments);
    const amount = randomInt(1000, 150000).toFixed(2);
    const type = randomElement(txTypes);
    const status = randomElement(statuses);
    const createdAt = randomDate(60);
    
    // Core transaction
    const [tx] = await db.insert(schema.transactions).values({
      userId: user.id,
      amount,
      currency: "NGN",
      type,
      status,
      reference: `TX-${Date.now()}-${randomInt(1000, 9999)}`,
      description: `Test ${type} transaction`,
      metadata: { source: "seed" },
      createdAt,
    }).returning();
    txCount++;
    
    // If it's a payment, link to establishment and POS
    if (type === "payment" && status === "completed") {
      await db.insert(schema.posTransactions).values({
        transactionId: tx.id,
        merchantId: est.merchantId,
        establishmentId: est.id,
        terminalId: `POS-${randomInt(10000000, 99999999)}`,
        amount,
        currency: "NGN",
        status: "approved",
        paymentMethod: randomElement(["card", "qr", "nfc", "transfer"]),
        createdAt,
      });
      
      // TigerBeetle ledger mock entries for double-entry
      const tbTransferId = uuid();
      await db.insert(schema.ledgerTransfers).values({
        id: tbTransferId,
        debitAccountId: uuid(), // Mock accounts for seed
        creditAccountId: uuid(),
        amount: BigInt(Math.floor(Number(amount) * 100)),
        ledgerCode: 1,
        transferCode: 2,
        status: "posted",
        idempotencyKey: tbTransferId,
        createdAt,
      });
    }
  }
  
  // Seed Settlements
  console.log("  Seeding Settlement Batches...");
  for (let i = 0; i < 10; i++) {
    const est = randomElement(establishments);
    const amount = randomInt(50000, 500000).toFixed(2);
    const fee = (Number(amount) * 0.015).toFixed(2);
    const net = (Number(amount) - Number(fee)).toFixed(2);
    
    const [batch] = await db.insert(schema.settlementBatches).values({
      merchantId: est.merchantId,
      establishmentId: est.id,
      amount,
      fee,
      netAmount: net,
      currency: "NGN",
      status: randomElement(["processed", "processed", "pending", "failed"]),
      bankAccountId: randomInt(1, 10),
      reference: `STL-${Date.now()}-${i}`,
      createdAt: randomDate(30),
    }).returning();
    
    // Settlement Items
    for (let j = 0; j < randomInt(5, 20); j++) {
      await db.insert(schema.settlementBatchItems).values({
        batchId: batch.id,
        transactionId: randomInt(1, txCount),
        amount: (Number(amount) / 10).toFixed(2),
        fee: (Number(fee) / 10).toFixed(2),
        netAmount: (Number(net) / 10).toFixed(2),
      });
    }
  }
  
  // Seed Reconciliations
  for (let i = 0; i < 5; i++) {
    await db.insert(schema.reconciliationBatches).values({
      provider: randomElement(["paystack", "flutterwave", "nibss"]),
      periodStart: randomDate(10),
      periodEnd: randomDate(5),
      totalTransactions: randomInt(100, 1000),
      totalVolume: randomInt(1000000, 5000000).toFixed(2),
      matchedCount: randomInt(90, 950),
      discrepancyCount: randomInt(0, 50),
      status: randomElement(["completed", "completed", "in_progress"]),
      createdAt: randomDate(2),
    });
  }

  console.log(`  ✓ Seeded ${txCount} transactions and related financial records`);
}
