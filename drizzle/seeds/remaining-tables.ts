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

const NIGERIAN_NAMES = ["Emeka Okafor", "Ngozi Adeyemi", "Chukwudi Eze", "Amaka Nwosu", "Tunde Bakare", "Funmilayo Osei", "Babatunde Adewale", "Chioma Obi"];
const COUNTRIES = ["NG", "KE", "ZA", "GH", "TZ", "RW", "ET", "EG", "MA", "SN", "CI", "UG"];
const CURRENCIES = ["NGN", "KES", "ZAR", "GHS", "TZS", "RWF", "ETB", "EGP", "MAD", "XOF", "UGX"];

export async function seedRemainingTables(db: any, schema: any) {
  console.log("  Seeding remaining critical tables...");
  let seededCount = 0;

  async function tryInsert(tableName: string, fn: () => Promise<void>) {
    if (!schema[tableName]) return;
    try {
      const count = Number((await db.select({ c: sql`count(*)` }).from(schema[tableName]))[0]?.c || 0);
      if (count === 0) { await fn(); seededCount++; }
    } catch (e) { /* skip */ }
  }

  await tryInsert("walletTransactions", async () => {
    const types = ["send","receive","swap","deposit","withdraw","fee"];
    const currencies = ["USDC","CBDC-NG","XLM"];
    for (let i = 0; i < 25; i++) {
      await db.insert(schema.walletTransactions).values({ id: uuid(), userId: "demo_admin_001", type: randomElement(types), currency: randomElement(currencies), amount: (randomInt(100,50000)/100).toFixed(6), fee: (randomInt(1,100)/100).toFixed(6), status: randomElement(["completed","completed","completed","pending","failed"]), reference: `WT-${Date.now()}-${i}`, counterparty: randomElement(NIGERIAN_NAMES), note: randomElement(["Hotel payment","Safari booking","Restaurant tip","Transport","Tour guide"]), createdAt: randomDate(60), updatedAt: new Date() }).onConflictDoNothing();
    }
    console.log("    ✓ walletTransactions: 25 records");
  });

  await tryInsert("touristProfiles", async () => {
    const nationalities = ["GB","US","DE","FR","CN","JP","AU","CA","BR","IN"];
    for (let i = 0; i < 15; i++) {
      await db.insert(schema.touristProfiles).values({ id: uuid(), userId: i===0?"demo_tourist_001":uuid(), nationality: randomElement(nationalities), passportNumber: `P${randomInt(10000000,99999999)}`, visaStatus: randomElement(["approved","approved","pending","not_required"]), preferredCurrency: randomElement(CURRENCIES), travelInsurance: randomInt(0,1)===1, emergencyContact: `+44${randomInt(7000000000,7999999999)}`, dietaryPreferences: randomElement(["none","vegetarian","halal","kosher"]), accessibilityNeeds: null, createdAt: randomDate(90) }).onConflictDoNothing();
    }
    console.log("    ✓ touristProfiles: 15 records");
  });

  await tryInsert("touristReviews", async () => {
    const texts = ["Absolutely stunning experience! The staff were incredibly welcoming.","Great value for money. The local food was exceptional.","Beautiful location but the service could be improved.","One of the best trips I've ever taken. Highly recommend!","The safari was breathtaking. Will definitely return.","Excellent hospitality. The room was clean and comfortable.","Amazing cultural experience. Learned so much about local traditions.","The payment process was seamless with TourismPay."];
    const estNames = ["Lagos Hotel Central","Serengeti Safari Lodge","Nairobi Boutique Hotel","Cape Town Guesthouse","Accra Beach Resort"];
    for (let i = 0; i < 30; i++) {
      await db.insert(schema.touristReviews).values({ id: uuid(), userId: "demo_tourist_001", establishmentId: uuid(), establishmentName: randomElement(estNames), rating: randomInt(3,5), title: randomElement(["Great stay!","Wonderful experience","Highly recommended","Beautiful place"]), body: randomElement(texts), sentiment: randomElement(["positive","positive","positive","neutral","negative"]), sentimentScore: (randomInt(60,100)/100).toFixed(2), verifiedPurchase: true, createdAt: randomDate(90) }).onConflictDoNothing();
    }
    console.log("    ✓ touristReviews: 30 records");
  });

  await tryInsert("financeRequests", async () => {
    const types = ["withdrawal","float_topup","settlement_advance","credit_line"];
    for (let i = 0; i < 12; i++) {
      await db.insert(schema.financeRequests).values({ id: uuid(), requestedBy: "demo_merchant_001", type: randomElement(types), amount: randomInt(50000,5000000).toString(), currency: "NGN", status: randomElement(["pending","approved","approved","rejected","processing"]), reason: randomElement(["Business expansion","Float replenishment","Emergency liquidity","Seasonal demand"]), reviewedBy: i%3===0?"demo_admin_001":null, reviewNote: i%3===0?"Approved after review":null, createdAt: randomDate(30), updatedAt: new Date() }).onConflictDoNothing();
    }
    console.log("    ✓ financeRequests: 12 records");
  });

  await tryInsert("auditLog", async () => {
    const actions = ["user.login","user.logout","kyb.approve","kyb.reject","bis.create","fraud.flag","wallet.send","admin.update_settings","merchant.onboard","compliance.review"];
    for (let i = 0; i < 50; i++) {
      await db.insert(schema.auditLog).values({ id: uuid(), userId: randomElement(["demo_admin_001","demo_merchant_001","demo_tourist_001"]), action: randomElement(actions), resource: randomElement(["user","kyb_application","bis_investigation","wallet","merchant"]), resourceId: uuid(), ipAddress: `${randomInt(1,255)}.${randomInt(1,255)}.${randomInt(1,255)}.${randomInt(1,255)}`, userAgent: "Mozilla/5.0 (compatible; TourismPay/1.0)", metadata: JSON.stringify({ country: randomElement(COUNTRIES) }), createdAt: randomDate(30) }).onConflictDoNothing();
    }
    console.log("    ✓ auditLog: 50 records");
  });

  await tryInsert("qrCodes", async () => {
    for (let i = 0; i < 8; i++) {
      await db.insert(schema.qrCodes).values({ id: uuid(), merchantId: "demo_merchant_001", establishmentId: uuid(), label: randomElement(["Main Entrance","Restaurant","Bar","Reception","Poolside","Spa","Gift Shop","Parking"]), amount: i%2===0?null:randomInt(500,50000).toString(), currency: "NGN", isActive: true, scanCount: randomInt(0,200), totalRevenue: randomInt(0,5000000).toString(), createdAt: randomDate(60) }).onConflictDoNothing();
    }
    console.log("    ✓ qrCodes: 8 records");
  });

  await tryInsert("merchantPayouts", async () => {
    for (let i = 0; i < 10; i++) {
      await db.insert(schema.merchantPayouts).values({ id: uuid(), merchantId: "demo_merchant_001", amount: randomInt(100000,2000000).toString(), currency: "NGN", status: randomElement(["completed","completed","completed","pending","processing"]), bankAccount: `**** ${randomInt(1000,9999)}`, bankName: randomElement(["First Bank","GTBank","Zenith Bank","Access Bank","UBA"]), reference: `PAY-${Date.now()}-${i}`, processedAt: i<7?randomDate(30):null, createdAt: randomDate(60) }).onConflictDoNothing();
    }
    console.log("    ✓ merchantPayouts: 10 records");
  });

  await tryInsert("taxCollections", async () => {
    const taxTypes = ["VAT","tourism_levy","service_charge","withholding_tax"];
    for (let i = 0; i < 20; i++) {
      await db.insert(schema.taxCollections).values({ id: uuid(), transactionId: uuid(), merchantId: "demo_merchant_001", taxType: randomElement(taxTypes), taxRate: randomElement(["0.075","0.05","0.10","0.025"]), taxAmount: randomInt(500,50000).toString(), baseAmount: randomInt(5000,500000).toString(), currency: "NGN", country: randomElement(["NG","KE","GH","ZA"]), remitted: randomInt(0,1)===1, remittedAt: null, createdAt: randomDate(30) }).onConflictDoNothing();
    }
    console.log("    ✓ taxCollections: 20 records");
  });

  await tryInsert("commissionRules", async () => {
    for (const tier of ["BASIC","STANDARD","PREMIUM","ENTERPRISE"]) {
      await db.insert(schema.commissionRules).values({ id: uuid(), tier, transactionType: "payment", baseRate: randomElement(["0.015","0.020","0.025","0.030"]), minAmount: "100", maxAmount: "10000000", currency: "NGN", isActive: true, createdAt: new Date() }).onConflictDoNothing();
    }
    console.log("    ✓ commissionRules: 4 records");
  });

  await tryInsert("commissionPayouts", async () => {
    for (let i = 0; i < 15; i++) {
      await db.insert(schema.commissionPayouts).values({ id: uuid(), agentId: uuid(), amount: randomInt(1000,100000).toString(), currency: "NGN", status: randomElement(["paid","paid","pending","processing"]), period: `2026-${String(randomInt(1,7)).padStart(2,"0")}`, transactionCount: randomInt(5,200), createdAt: randomDate(60) }).onConflictDoNothing();
    }
    console.log("    ✓ commissionPayouts: 15 records");
  });

  await tryInsert("bisTimeline", async () => {
    const events = ["investigation_created","document_requested","document_received","ai_screening_started","ai_screening_complete","risk_score_assigned","investigation_completed","flag_raised"];
    for (let i = 0; i < 20; i++) {
      await db.insert(schema.bisTimeline).values({ id: uuid(), investigationId: uuid(), event: randomElement(events), actor: randomElement(["system","demo_admin_001","ai_engine"]), note: randomElement(["Automated check completed","Manual review required","Document verified","Risk threshold exceeded"]), metadata: JSON.stringify({ score: randomInt(0,100) }), createdAt: randomDate(30) }).onConflictDoNothing();
    }
    console.log("    ✓ bisTimeline: 20 records");
  });

  await tryInsert("serviceHealthHistory", async () => {
    const services = ["bis-core","bis-ai","kyb-service","registry","fraud-ml"];
    for (const svc of services) {
      for (let i = 0; i < 24; i++) {
        const checkedAt = new Date(); checkedAt.setHours(checkedAt.getHours() - i);
        await db.insert(schema.serviceHealthHistory).values({ id: uuid(), serviceKey: svc, status: randomElement(["healthy","healthy","healthy","unhealthy"]), responseMs: randomInt(20,500), httpStatus: randomElement([200,200,200,503]), checkedAt }).onConflictDoNothing();
      }
    }
    console.log("    ✓ serviceHealthHistory: 120 records");
  });

  await tryInsert("analyticsMetrics", async () => {
    const metrics = ["daily_transactions","daily_volume_ngn","active_merchants","active_tourists","fraud_rate","kyb_approval_rate"];
    for (const metric of metrics) {
      for (let day = 0; day < 30; day++) {
        const d = new Date(); d.setDate(d.getDate() - day);
        await db.insert(schema.analyticsMetrics).values({ id: uuid(), metric, value: randomInt(100,100000).toString(), dimensions: JSON.stringify({ country: "NG" }), period: d.toISOString().split("T")[0], createdAt: d }).onConflictDoNothing();
      }
    }
    console.log("    ✓ analyticsMetrics: 180 records");
  });

  await tryInsert("notificationDispatchLog", async () => {
    const channels = ["push","email","sms","in_app"];
    const types = ["payment_received","kyb_approved","fraud_alert","payout_processed","login_alert"];
    for (let i = 0; i < 30; i++) {
      await db.insert(schema.notificationDispatchLog).values({ id: uuid(), userId: randomElement(["demo_admin_001","demo_merchant_001","demo_tourist_001"]), channel: randomElement(channels), type: randomElement(types), title: randomElement(["Payment Received","KYB Approved","Fraud Alert","Payout Processed"]), body: "Your account has been updated.", status: randomElement(["delivered","delivered","delivered","failed","pending"]), sentAt: randomDate(7) }).onConflictDoNothing();
    }
    console.log("    ✓ notificationDispatchLog: 30 records");
  });

  await tryInsert("platformSettings", async () => {
    const settings = [
      { key: "max_transaction_amount_ngn", value: "10000000", category: "limits" },
      { key: "fraud_score_threshold", value: "0.75", category: "fraud" },
      { key: "kyb_auto_approve_threshold", value: "0.90", category: "kyb" },
      { key: "default_commission_rate", value: "0.02", category: "commission" },
      { key: "tipping_enabled", value: "true", category: "features" },
      { key: "stablecoin_swap_enabled", value: "true", category: "features" },
      { key: "bis_auto_flag_enabled", value: "true", category: "bis" },
      { key: "maintenance_mode", value: "false", category: "system" },
    ];
    for (const s of settings) {
      await db.insert(schema.platformSettings).values({ id: uuid(), key: s.key, value: s.value, category: s.category, description: `Platform setting for ${s.key}`, updatedBy: "demo_admin_001", updatedAt: new Date() }).onConflictDoNothing();
    }
    console.log("    ✓ platformSettings: 8 records");
  });

  await tryInsert("touristItineraries", async () => {
    const destinations = [
      { name: "Lagos Cultural Tour", country: "NG" },
      { name: "Nairobi Safari Adventure", country: "KE" },
      { name: "Cape Town Explorer", country: "ZA" },
      { name: "Accra Heritage Trail", country: "GH" },
      { name: "Zanzibar Beach Retreat", country: "TZ" },
    ];
    for (const dest of destinations) {
      await db.insert(schema.touristItineraries).values({ id: uuid(), userId: "demo_tourist_001", title: dest.name, destination: dest.country, startDate: randomDate(30), endDate: randomDate(7), totalBudget: randomInt(200000,2000000).toString(), currency: "NGN", status: randomElement(["draft","confirmed","completed"]), aiGenerated: randomInt(0,1)===1, createdAt: randomDate(60) }).onConflictDoNothing();
    }
    console.log("    ✓ touristItineraries: 5 records");
  });

  await tryInsert("creditApplications", async () => {
    for (let i = 0; i < 8; i++) {
      await db.insert(schema.creditApplications).values({ id: uuid(), applicantId: randomElement(["demo_merchant_001","demo_tourist_001"]), applicantType: randomElement(["merchant","tourist"]), requestedAmount: randomInt(50000,5000000).toString(), currency: "NGN", purpose: randomElement(["Working capital","Equipment purchase","Business expansion","Travel financing"]), status: randomElement(["pending","approved","rejected","under_review"]), creditScore: randomInt(400,850), approvedAmount: null, interestRate: randomElement(["0.18","0.22","0.25"]), createdAt: randomDate(30) }).onConflictDoNothing();
    }
    console.log("    ✓ creditApplications: 8 records");
  });

  await tryInsert("webhookDeliveries", async () => {
    const events = ["payment.completed","kyb.approved","payout.processed","fraud.flagged","bis.completed"];
    for (let i = 0; i < 20; i++) {
      await db.insert(schema.webhookDeliveries).values({ id: uuid(), webhookId: uuid(), event: randomElement(events), payload: JSON.stringify({ id: uuid(), amount: randomInt(1000,100000) }), statusCode: randomElement([200,200,200,404,500]), responseBody: randomElement(['{"ok":true}','{"error":"not found"}','{"error":"server error"}']), attempts: randomInt(1,3), nextRetryAt: null, deliveredAt: randomDate(7), createdAt: randomDate(14) }).onConflictDoNothing();
    }
    console.log("    ✓ webhookDeliveries: 20 records");
  });

  await tryInsert("biometricEnrollments", async () => {
    for (const userId of ["demo_admin_001","demo_merchant_001","demo_tourist_001"]) {
      await db.insert(schema.biometricEnrollments).values({ id: uuid(), userId, type: "face", status: "enrolled", deviceId: uuid(), enrolledAt: randomDate(30), lastUsedAt: randomDate(7) }).onConflictDoNothing();
    }
    console.log("    ✓ biometricEnrollments: 3 records");
  });

  await tryInsert("didDocuments", async () => {
    for (const userId of ["demo_admin_001","demo_merchant_001","demo_tourist_001"]) {
      const did = `did:tourismpay:${randomElement(COUNTRIES).toLowerCase()}:${uuid().replace(/-/g,"").substring(0,16)}`;
      await db.insert(schema.didDocuments).values({ id: uuid(), userId, did, document: JSON.stringify({ "@context": ["https://www.w3.org/ns/did/v1"], id: did, verificationMethod: [], authentication: [] }), status: "active", createdAt: randomDate(60) }).onConflictDoNothing();
    }
    console.log("    ✓ didDocuments: 3 records");
  });

  await tryInsert("carbonOffsets", async () => {
    const projects = ["Mangrove Restoration Kenya","Solar Energy Nigeria","Reforestation Rwanda","Clean Cookstoves Ghana"];
    for (let i = 0; i < 10; i++) {
      await db.insert(schema.carbonOffsets).values({ id: uuid(), userId: randomElement(["demo_tourist_001","demo_merchant_001"]), projectName: randomElement(projects), tonnes: (randomInt(1,50)/10).toFixed(1), costUsd: (randomInt(500,5000)/100).toFixed(2), certificateId: `CERT-${randomInt(100000,999999)}`, status: randomElement(["active","active","retired"]), purchasedAt: randomDate(90) }).onConflictDoNothing();
    }
    console.log("    ✓ carbonOffsets: 10 records");
  });

  await tryInsert("meshTransactions", async () => {
    for (let i = 0; i < 15; i++) {
      await db.insert(schema.meshTransactions).values({ id: uuid(), senderId: randomElement(["demo_tourist_001","demo_merchant_001"]), receiverId: uuid(), amount: randomInt(1000,100000).toString(), currency: randomElement(["NGN","KES","GHS"]), meshType: randomElement(["p2p","nfc","qr","bluetooth"]), status: randomElement(["completed","completed","pending"]), offlineToken: `MESH-${randomInt(100000,999999)}`, syncedAt: randomDate(7), createdAt: randomDate(14) }).onConflictDoNothing();
    }
    console.log("    ✓ meshTransactions: 15 records");
  });

  await tryInsert("complianceChecks", async () => {
    const checkTypes = ["aml_screening","pep_check","sanctions_check","kyb_review","transaction_monitoring"];
    for (let i = 0; i < 20; i++) {
      await db.insert(schema.complianceChecks).values({ id: uuid(), entityId: uuid(), entityType: randomElement(["merchant","tourist","agent"]), checkType: randomElement(checkTypes), result: randomElement(["pass","pass","pass","fail","manual_review"]), riskScore: (randomInt(0,100)/100).toFixed(2), details: JSON.stringify({ provider: "internal", timestamp: new Date().toISOString() }), checkedBy: randomElement(["system","demo_admin_001"]), createdAt: randomDate(30) }).onConflictDoNothing();
    }
    console.log("    ✓ complianceChecks: 20 records");
  });

  await tryInsert("glAccounts", async () => {
    const accounts = [
      { code: "1000", name: "Cash & Equivalents", type: "asset" },
      { code: "1100", name: "Accounts Receivable", type: "asset" },
      { code: "2000", name: "Accounts Payable", type: "liability" },
      { code: "3000", name: "Equity", type: "equity" },
      { code: "4000", name: "Revenue", type: "revenue" },
      { code: "5000", name: "Operating Expenses", type: "expense" },
      { code: "4100", name: "Transaction Fees", type: "revenue" },
      { code: "4200", name: "Commission Income", type: "revenue" },
    ];
    for (const acct of accounts) {
      await db.insert(schema.glAccounts).values({ id: uuid(), code: acct.code, name: acct.name, type: acct.type, currency: "NGN", balance: randomInt(0,10000000).toString(), isActive: true, createdAt: new Date() }).onConflictDoNothing();
    }
    console.log("    ✓ glAccounts: 8 records");
  });

  await tryInsert("ussdSessions", async () => {
    for (let i = 0; i < 15; i++) {
      await db.insert(schema.ussdSessions).values({ id: uuid(), sessionId: `USSD-${randomInt(100000,999999)}`, msisdn: `+234${randomInt(7000000000,9099999999)}`, serviceCode: "*555#", currentMenu: randomElement(["main","send_money","check_balance","pay_merchant"]), state: JSON.stringify({ step: randomInt(1,5) }), status: randomElement(["active","completed","timeout"]), createdAt: randomDate(7), updatedAt: new Date() }).onConflictDoNothing();
    }
    console.log("    ✓ ussdSessions: 15 records");
  });

  await tryInsert("billPayments", async () => {
    const billers = ["IKEDC","EKEDC","DSTV","Airtel","MTN","PHCN","Lagos Water","LAWMA"];
    for (let i = 0; i < 20; i++) {
      await db.insert(schema.billPayments).values({ id: uuid(), userId: randomElement(["demo_tourist_001","demo_merchant_001"]), biller: randomElement(billers), billType: randomElement(["electricity","cable_tv","airtime","water","internet"]), accountNumber: `${randomInt(1000000000,9999999999)}`, amount: randomInt(1000,50000).toString(), currency: "NGN", status: randomElement(["completed","completed","completed","pending","failed"]), reference: `BILL-${randomInt(100000,999999)}`, createdAt: randomDate(30) }).onConflictDoNothing();
    }
    console.log("    ✓ billPayments: 20 records");
  });

  console.log(`  ✓ Seeded ${seededCount} additional table groups`);
}
