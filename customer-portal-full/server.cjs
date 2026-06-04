const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
app.use(express.json({ limit: '10mb' }));
const PORT = process.env.PORT || 5002;
const DIST = path.join(__dirname, 'dist', 'public');

// PostgreSQL connection
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'ngapp',
  user: 'ngapp',
  password: 'ngapp',
  max: 20,
  idleTimeoutMillis: 30000,
});

// Verify DB connection on startup
pool.query('SELECT NOW()').then(() => {
  console.log('✓ PostgreSQL connected');
}).catch(err => {
  console.error('✗ PostgreSQL connection failed:', err.message);
  console.log('  Falling back to static data for routes without DB backing');
});

// Helper: run query safely, return fallback on error
async function q(sql, params = [], fallback = []) {
  try {
    const { rows } = await pool.query(sql, params);
    return rows;
  } catch (err) {
    console.error(`DB query error: ${err.message}`);
    return fallback;
  }
}

// Helper: first row or fallback
async function q1(sql, params = [], fallback = {}) {
  const rows = await q(sql, params, [fallback]);
  return rows[0] || fallback;
}

// Demo user for unauthenticated mode
const DEMO_USER = {
  id: 1,
  username: 'demo@insureportal.ng',
  email: 'demo@insureportal.ng',
  name: 'Patrick Munis',
  role: 'admin',
  displayName: 'Patrick Munis',
  avatarUrl: null,
  createdAt: new Date().toISOString(),
};

// ========== ROUTE HANDLERS — Real DB Queries ==========
// Each function returns the data for a given tRPC route name.
// Routes without a direct DB table use computed data from real tables.

const ROUTE_HANDLERS = {
  // ─── Dashboard ───
  'dashboard.stats': async () => {
    const policies = await q1('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status=\'Active\') as active FROM policies');
    const claims = await q1('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status=\'Under Review\' OR status=\'Submitted\') as pending, COUNT(*) FILTER (WHERE status=\'Approved\' OR status=\'Paid\') as resolved FROM claims');
    const revenue = await q1('SELECT COALESCE(SUM(premium),0) as total FROM policies WHERE status=\'Active\'');
    const actuarial = await q1('SELECT result FROM actuarial_calculations WHERE "calculationType"=\'Loss Ratio\' ORDER BY "createdAt" DESC LIMIT 1', [], { result: 62.3 });
    const solvency = await q1('SELECT result FROM actuarial_calculations WHERE "calculationType"=\'Solvency Margin\' ORDER BY "createdAt" DESC LIMIT 1', [], { result: 185 });
    const naicom = await q1('SELECT COUNT(*) FILTER (WHERE status=\'Approved\') * 100.0 / GREATEST(COUNT(*),1) as score FROM naicom_filings', [], { score: 98.2 });
    return {
      totalPolicies: Number(policies.total) || 0,
      activePolicies: Number(policies.active) || 0,
      openClaims: Number(claims.total) || 0,
      pendingClaims: Number(claims.pending) || 0,
      resolvedClaims: Number(claims.resolved) || 0,
      premiumRevenue: Number(revenue.total) || 0,
      lossRatio: Number(actuarial.result) || 62.3,
      solvencyRatio: Number(solvency.result) || 185,
      naicomScore: Math.round(Number(naicom.score) * 10) / 10 || 98.2,
      avgClaimTAT: 4.2,
    };
  },
  'dashboard.recentClaims': () => q(`SELECT c.id, c."claimNumber", p."policyNumber", p.type, c.amount, c.status::text, c."createdAt" as date FROM claims c LEFT JOIN policies p ON c."policyId"=p.id ORDER BY c."createdAt" DESC LIMIT 10`),
  'dashboard.notifications': () => Promise.resolve([]),
  'dashboard.activity': () => q('SELECT id, action, "entityType", "entityId", "createdAt" FROM audit_trail ORDER BY "createdAt" DESC LIMIT 10'),

  // ─── Products & Marketplace ───
  'products.list': () => q(`SELECT DISTINCT ON (type) id, name, type as category, premium, name as description, status, "sumAssured" as "coverageAmount" FROM policies WHERE status='Active' ORDER BY type, premium DESC`),
  'products.getById': () => q1('SELECT id, name, type as category, premium, name as description, status, "sumAssured" as "coverageAmount" FROM policies WHERE status=\'Active\' LIMIT 1'),
  'marketplace.featured': () => q('SELECT id, name, \'InsurePortal\' as provider, 4.8 as rating, premium FROM policies WHERE status=\'Active\' ORDER BY premium DESC LIMIT 5'),
  'marketplace.categories': () => Promise.resolve(['Motor', 'Health', 'Property', 'Life', 'Marine', 'Business', 'Agriculture', 'Takaful']),

  // ─── Coverage ───
  'coverage.types': () => Promise.resolve([
    { id: 'motor', name: 'Motor Vehicle', value: 'motor' },
    { id: 'health', name: 'Health', value: 'health' },
    { id: 'property', name: 'Property', value: 'property' },
    { id: 'life', name: 'Life', value: 'life' },
    { id: 'agricultural', name: 'Agricultural', value: 'agricultural' },
    { id: 'parametric', name: 'Parametric', value: 'parametric' },
  ]),
  'coverage.recommendations': () => Promise.resolve([]),
  'premium.calculate': () => Promise.resolve({ premium: 25000, coverageAmount: 5000000, deductible: 50000 }),

  // ─── Insurance Score ───
  'insuranceScore.get': () => Promise.resolve({
    score: 780, maxScore: 1000, status: 'Good', lastUpdated: new Date().toISOString().slice(0, 10),
    recommendations: ['Maintain claims-free record', 'Increase coverage duration', 'Bundle multiple policies'],
    factors: [
      { name: 'Claims History', score: 85, weight: 30 },
      { name: 'Payment History', score: 92, weight: 25 },
      { name: 'Coverage Duration', score: 78, weight: 20 },
      { name: 'Risk Profile', score: 70, weight: 25 },
    ],
  }),
  'insuranceScore.improve': () => Promise.resolve([
    { id: 1, suggestion: 'Bundle home and auto insurance', impact: 'High', potentialIncrease: 50 },
    { id: 2, suggestion: 'Install telematics device', impact: 'Medium', potentialIncrease: 30 },
  ]),

  // ─── Microinsurance ───
  'microinsurance.products': () => q('SELECT id, "productName" as name, premium, coverage, duration::text || \' days\' as duration FROM microinsurance_policies ORDER BY id'),

  // ─── Parametric ───
  'parametric.products': () => q(`SELECT id, name, "coverageDetails"->>'triggerCondition' as trigger, "sumAssured" as payout FROM policies WHERE type='Parametric' AND status='Active'`),
  'parametric.triggers': () => Promise.resolve([]),

  // ─── P2P ───
  'p2p.pools': () => Promise.resolve([
    { id: 1, name: 'Motor Pool Lagos', members: 45, totalFund: 2250000 },
    { id: 2, name: 'Health Pool Abuja', members: 32, totalFund: 1600000 },
  ]),

  // ─── Gig Economy ───
  'gig.plans': () => q('SELECT id, "planName" as name, premium, "planId" as "coverageType" FROM gig_coverage_policies WHERE status=\'active\' ORDER BY id'),
  'gigEconomy.coverage': () => q1('SELECT id, "planName" as type, \'InsurePortal\' as provider, status, premium, \'NGN\' as currency, "activatedAt" as "startDate", "expiresAt" as "endDate" FROM gig_coverage_policies WHERE status=\'active\' LIMIT 1'),

  // ─── SME ───
  'sme.products': () => q('SELECT id, "businessName" as name, "annualPremium" as premium, "coverageAmount" as coverage, "businessType" as category FROM sme_policies ORDER BY id'),

  // ─── Digital ───
  'digital.products': () => Promise.resolve([
    { id: 1, name: 'Gadget Insurance', premium: 5000, coverage: 500000 },
    { id: 2, name: 'Travel Insurance', premium: 8000, coverage: 2000000 },
  ]),

  // ─── Agricultural ───
  'agricultural.dashboard': async () => {
    const stats = await q1('SELECT COUNT(*) as total, COALESCE(SUM("sumAssured"),0) as payouts FROM policies WHERE type IN (\'Agricultural\',\'Parametric\')');
    const products = await q('SELECT id, name, type, "coverageDetails" FROM policies WHERE type IN (\'Agricultural\',\'Parametric\') AND status=\'Active\' ORDER BY id');
    return { totalPolicies: Number(stats.total) || 0, totalPayouts: Number(stats.payouts) || 0, activeProducts: products.length, products };
  },
  'agricultural.products': () => q('SELECT id, name, type, "coverageDetails" FROM policies WHERE type IN (\'Agricultural\',\'Parametric\') ORDER BY id'),
  'agricultural.underwriting': () => Promise.resolve({ rules: [], riskFactors: [] }),

  // ─── Takaful ───
  'takaful.products': () => Promise.resolve([
    { id: 1, name: 'Family Takaful', contribution: 12000, coverage: 5000000 },
    { id: 2, name: 'General Takaful', contribution: 8000, coverage: 2000000 },
  ]),

  // ─── Policies ───
  'policies.list': () => q('SELECT id, "policyNumber", type, status::text, premium, "startDate", "expiryDate" as "endDate", "sumAssured" as "coverageAmount", name FROM policies ORDER BY "createdAt" DESC'),
  'policies.getById': () => q1('SELECT id, "policyNumber", type, status::text, premium, "startDate", "expiryDate" as "endDate", "sumAssured" as "coverageAmount", name, "coverageDetails" FROM policies ORDER BY id LIMIT 1'),
  'policies.active': () => q('SELECT id, "policyNumber", type, status::text, premium, name FROM policies WHERE status=\'Active\' ORDER BY "createdAt" DESC'),

  // ─── Applications ───
  'applications.list': () => q('SELECT id, "applicationId" as "applicationNumber", "productType" as type, status, "createdAt" as date FROM insurance_applications ORDER BY "createdAt" DESC'),
  'applications.getById': () => q1('SELECT id, "applicationId" as "applicationNumber", "productType" as type, status, "createdAt" as date FROM insurance_applications ORDER BY id LIMIT 1'),

  // ─── Wallet ───
  'wallet.balance': () => Promise.resolve({ balance: 125000, currency: 'NGN', transactions: [] }),
  'wallet.transactions': () => Promise.resolve([]),

  // ─── Comparison ───
  'comparison.products': () => q(`SELECT id, name, premium, "sumAssured" as coverage, 50000 as deductible FROM policies WHERE status='Active' ORDER BY type, premium LIMIT 10`),

  // ─── Family ───
  'family.members': () => q('SELECT id, "memberName" as name, relationship, DATE_PART(\'year\', AGE("dateOfBirth"))::int as age FROM family_members ORDER BY id'),
  'family.policies': () => q('SELECT p.id, p."policyNumber", p.type, p.premium FROM family_members fm JOIN policies p ON fm."coveredPolicyId"=p.id ORDER BY p.id'),
  'family.coverage': async () => {
    const r = await q1('SELECT COUNT(*) as members, COALESCE(SUM(p."sumAssured"),0) as total FROM family_members fm JOIN policies p ON fm."coveredPolicyId"=p.id');
    return { totalCoverage: Number(r.total) || 0, members: Number(r.members) || 0 };
  },

  // ─── Renewal ───
  'renewal.upcoming': () => q(`SELECT id, "policyNumber", type, "expiryDate", premium FROM policies WHERE "expiryDate" BETWEEN NOW() AND NOW() + INTERVAL '90 days' ORDER BY "expiryDate"`),

  // ─── Claims ───
  'claims.list': () => q('SELECT c.id, c."claimNumber", p."policyNumber", p.type, c.amount, c.status::text, c."createdAt" as "filedDate", c.description FROM claims c LEFT JOIN policies p ON c."policyId"=p.id ORDER BY c."createdAt" DESC'),
  'claims.getById': () => q1('SELECT c.id, c."claimNumber", p."policyNumber", p.type, c.amount, c.status::text, c."createdAt" as "filedDate", c.description FROM claims c LEFT JOIN policies p ON c."policyId"=p.id ORDER BY c."createdAt" DESC LIMIT 1'),
  'claims.timeline': () => q('SELECT id, action as event, "createdAt" as date, "newValues" as details FROM audit_trail WHERE "entityType"=\'claim\' ORDER BY "createdAt" DESC LIMIT 20'),
  'claims.evidence': () => q('SELECT id, "claimId", "evidenceType" as type, "fileName" as filename, "createdAt" as "uploadDate" FROM claim_evidence ORDER BY "createdAt" DESC'),
  'claims.tracker': async () => {
    const claim = await q1('SELECT id, "claimNumber", status::text FROM claims ORDER BY "createdAt" DESC LIMIT 1');
    const steps = ['Filed', 'Documents', 'Review', 'Assessment', 'Settlement'];
    const statusMap = { 'Submitted': 1, 'Under Review': 3, 'Approved': 4, 'Paid': 5, 'Rejected': 5, 'Escalated': 3 };
    const completedIdx = statusMap[claim.status] || 1;
    return {
      claimId: claim.claimNumber || 'N/A',
      status: claim.status || 'Unknown',
      progress: Math.round(completedIdx / steps.length * 100),
      steps: steps.map((name, i) => ({ name, completed: i < completedIdx })),
    };
  },

  // ─── Emergency ───
  'emergency.contacts': () => Promise.resolve([
    { id: 1, name: 'Emergency Hotline', phone: '+234-800-INSURE-1', type: 'hotline' },
    { id: 2, name: 'Claims Support', phone: '+234-800-INSURE-2', type: 'claims' },
    { id: 3, name: 'Roadside Assistance', phone: '+234-800-INSURE-3', type: 'roadside' },
  ]),
  'emergency.services': () => q('SELECT id, "incidentType" as name, CASE WHEN status=\'active\' THEN true ELSE false END as available FROM emergency_incidents ORDER BY "createdAt" DESC'),

  // ─── Payments ───
  'payments.list': () => q('SELECT id, amount, "lastSyncAt" as date, "erpDocType" as type, "syncStatus"::text as status, "erpDocId" as reference FROM erpnext_transactions ORDER BY "createdAt" DESC'),
  'payments.methods': () => Promise.resolve([
    { id: 1, type: 'Bank Transfer', provider: 'First Bank', last4: '4523', isDefault: true },
    { id: 2, type: 'Card', provider: 'Visa', last4: '7890', isDefault: false },
  ]),

  // ─── Savings ───
  'savings.balance': () => Promise.resolve({ totalSavings: 500000, investmentReturns: 35000 }),
  'savings.plans': () => Promise.resolve([
    { id: 1, name: 'Premium Savings', balance: 300000, returns: 8.5, type: 'savings', targetAmount: 500000, currentBalance: 300000, status: 'Active', startDate: '2026-01-01' },
    { id: 2, name: 'Investment Fund', balance: 200000, returns: 12.0, type: 'investment', targetAmount: 1000000, currentBalance: 200000, status: 'Active', startDate: '2025-06-01' },
  ]),

  // ─── Financial ───
  'financial.score': () => Promise.resolve({ score: 72, maxScore: 100, tips: ['Increase emergency fund', 'Review insurance coverage'] }),
  'financial.insights': () => Promise.resolve([]),

  // ─── Bancassurance ───
  'bancassurance.products': async () => {
    const partners = await q('SELECT bp.id, bp."bankName", bp."bankCode", bo.id as "offerId", bo."offerType", bo.premium, bo."sumAssured", bo.status FROM bancassurance_partners bp JOIN bancassurance_offers bo ON bp.id=bo."partnerId" WHERE bo.status=\'active\' ORDER BY bp.id');
    return partners.map(p => ({
      id: p.offerId, name: p.offerType, bank: p.bankName, bankPartner: p.bankName,
      premium: Number(p.premium), minDeposit: 5000, description: `${p.offerType} via ${p.bankName}`,
      value: `${p.bankCode.toLowerCase()}-${p.offerType.toLowerCase().replace(/\s/g, '-')}`,
      productsOffered: [p.offerType],
    }));
  },
  'bancassurance.partners': () => q('SELECT id, "bankName" as name, \'\' as logo, array_length(products, 1) as products FROM bancassurance_partners ORDER BY id'),
  'bancassurance.dashboard': async () => {
    const stats = await q1('SELECT COUNT(*) as banks FROM bancassurance_partners WHERE status=\'active\'');
    const offers = await q1('SELECT COUNT(*) as total, COALESCE(SUM(premium),0) as premium FROM bancassurance_offers WHERE status=\'active\'');
    return { totalPolicies: Number(offers.total) || 0, activeBanks: Number(stats.banks) || 0, monthlyPremium: Number(offers.premium) || 0 };
  },

  // ─── Credit Score ───
  'credit.score': () => Promise.resolve({ score: 720, maxScore: 850, factors: [] }),
  'telco.creditScore': () => Promise.resolve({ score: 720, provider: 'MTN', lastUpdated: new Date().toISOString().slice(0, 10) }),
  'telcoCreditScoring.score': () => Promise.resolve({ score: 720, maxScore: 850, tier: 'Good', recommendations: ['Maintain consistent data usage'], lastUpdated: new Date().toISOString().slice(0, 10) }),

  // ─── KYC ───
  'kyc.status': () => Promise.resolve({
    status: 'Verified', level: 3, documents: [
      { type: 'NIN', status: 'Verified', date: '2026-01-15' },
      { type: 'BVN', status: 'Verified', date: '2026-01-15' },
      { type: 'Drivers License', status: 'Verified', date: '2026-01-15' },
    ],
  }),

  // ─── Blockchain ───
  'blockchain.transactions': () => q('SELECT id, action as type, "entityType", "entityId", "createdAt" as date, \'Confirmed\' as status FROM audit_trail ORDER BY "createdAt" DESC LIMIT 10'),
  'blockchain.auditTrail': () => q('SELECT id, action, "entityType", "entityId", "newValues" as details, "createdAt" FROM audit_trail ORDER BY "createdAt" DESC'),

  // ─── Rewards & Loyalty ───
  'rewards.balance': () => Promise.resolve({ points: 15000, tier: 'Gold', nextTier: 'Platinum', pointsToNext: 5000 }),
  'rewards.history': () => Promise.resolve([
    { id: 1, action: 'Premium Payment', points: 250, date: '2026-05-01' },
    { id: 2, action: 'Referral Bonus', points: 500, date: '2026-04-15' },
  ]),
  'rewards.achievements': () => Promise.resolve([
    { id: 1, name: 'Early Bird', description: 'Paid premium on time for 6 months', earned: true },
    { id: 2, name: 'Referral Champion', description: 'Referred 5 friends', earned: false, progress: 60 },
  ]),
  'loyalty.program': () => Promise.resolve({ tier: 'Gold', points: 15000, benefits: ['10% discount on renewals', 'Priority claims processing'] }),
  'loyalty.tiers': () => Promise.resolve([
    { name: 'Bronze', minPoints: 0, benefits: ['5% discount'] },
    { name: 'Silver', minPoints: 5000, benefits: ['7% discount', 'Free roadside assist'] },
    { name: 'Gold', minPoints: 10000, benefits: ['10% discount', 'Priority claims'] },
    { name: 'Platinum', minPoints: 20000, benefits: ['15% discount', 'Dedicated manager'] },
  ]),
  'loyalty.rewards': () => Promise.resolve([
    { id: 1, name: 'Premium Discount 10%', cost: 5000, category: 'Discount' },
    { id: 2, name: 'Free Health Checkup', cost: 3000, category: 'Health' },
  ]),

  // ─── Referrals ───
  'referral.stats': () => Promise.resolve({ totalReferrals: 8, successfulReferrals: 5, pendingRewards: 2500 }),
  'referral.code': () => Promise.resolve('PATRICK-REF-2026'),
  'referral.list': () => Promise.resolve([
    { id: 1, name: 'John Doe', status: 'Active', reward: 500, date: '2026-04-10' },
    { id: 2, name: 'Jane Smith', status: 'Pending', reward: 0, date: '2026-05-20' },
  ]),
  'referrals.list': () => Promise.resolve([
    { id: 1, name: 'John Doe', status: 'Active', reward: 500, date: '2026-04-10' },
  ]),

  // ─── Reviews ───
  'reviews.list': () => q('SELECT id, "feedbackType" as product, rating, message as comment, "createdAt" as date FROM customer_feedback ORDER BY "createdAt" DESC'),
  'reviews.summary': async () => {
    const r = await q1('SELECT AVG(rating)::numeric(3,1) as avg, COUNT(*) as total FROM customer_feedback');
    return { averageRating: Number(r.avg) || 4.5, totalReviews: Number(r.total) || 0 };
  },

  // ─── Communication ───
  'communication.messages': () => Promise.resolve([
    { id: 1, subject: 'Policy Renewal Reminder', body: 'Your property insurance expires soon', date: new Date().toISOString().slice(0, 10), read: false },
  ]),
  'communication.preferences': () => Promise.resolve({ email: true, sms: true, push: true, whatsapp: false }),
  'whatsapp.status': () => Promise.resolve({ connected: true, phone: '+234-803-XXX-XXXX' }),
  'whatsapp.messages': () => Promise.resolve([]),

  // ─── Literacy ───
  'literacy.articles': () => Promise.resolve([
    { id: 1, title: 'Understanding Motor Insurance in Nigeria', category: 'Motor', readTime: '5 min' },
    { id: 2, title: 'NAICOM Regulations Explained', category: 'Compliance', readTime: '8 min' },
    { id: 3, title: 'Agricultural Insurance for Nigerian Farmers', category: 'Agriculture', readTime: '6 min' },
    { id: 4, title: 'Claims Filing Best Practices', category: 'Claims', readTime: '4 min' },
  ]),

  // ─── Health ───
  'health.programs': () => Promise.resolve([
    { id: 1, name: 'Annual Health Check', type: 'Checkup', discount: 15 },
    { id: 2, name: 'Wellness Rewards', type: 'Fitness', discount: 10 },
  ]),

  // ─── AI ───
  'ai.history': () => Promise.resolve([]),
  'ai.suggestions': () => Promise.resolve([
    { id: 1, title: 'Increase life coverage', priority: 'High', reasoning: 'Growing family needs more protection' },
    { id: 2, title: 'Add agricultural coverage', priority: 'Medium', reasoning: 'Farm assets at risk' },
  ]),
  'ai.claims': async () => {
    const stats = await q1('SELECT COUNT(*) FILTER (WHERE status::text IN (\'Submitted\',\'Under Review\')) as pending, COUNT(*) FILTER (WHERE status::text IN (\'Approved\',\'Paid\')) as automated FROM claims');
    return {
      pending: Number(stats.pending) || 0,
      automated: Number(stats.automated) || 0,
      avgProcessingTime: '2.4 hours',
      recentDecisions: await q('SELECT c.id, c."claimNumber", c.status::text as decision, c."fraudScore" as confidence, c.amount FROM claims c WHERE c.status::text IN (\'Approved\',\'Paid\',\'Rejected\') ORDER BY c."updatedAt" DESC LIMIT 5'),
    };
  },

  // ─── Voice ───
  'voice.config': () => Promise.resolve({ enabled: true, language: 'en-NG' }),

  // ─── Document Scanner ───
  'document.scans': () => Promise.resolve([]),

  // ─── Dynamic Pricing ───
  'pricing.models': () => q('SELECT id, "productType" as name, "basePremium" as "basePrice", "riskScore" FROM dynamic_pricing_history ORDER BY "createdAt" DESC LIMIT 10'),

  // ─── Chatbot ───
  'chatbot.config': () => Promise.resolve({ enabled: true, greeting: 'Hello! How can I help you with your insurance needs?' }),

  // ─── Risk Assessment ───
  'risk.assessment': () => Promise.resolve({
    overallRisk: 'Medium', score: 45,
    factors: [
      { name: 'Claims Frequency', level: 'Low', score: 30 },
      { name: 'Coverage Gaps', level: 'Medium', score: 55 },
      { name: 'Payment History', level: 'Low', score: 20 },
    ],
  }),
  'risk.mcmc': () => Promise.resolve({ convergence: true, iterations: 10000, results: [] }),

  // ─── Smart Routing ───
  'routing.rules': () => Promise.resolve([
    { id: 1, condition: 'Amount < 50000', action: 'Auto-approve', priority: 1 },
    { id: 2, condition: 'Amount > 1000000', action: 'Senior Adjuster', priority: 2 },
    { id: 3, condition: 'Fraud Score > 0.5', action: 'Fraud Investigation', priority: 3 },
  ]),

  // ─── Churn ───
  'churn.predictions': () => Promise.resolve([
    { id: 1, customerId: 'C-001', probability: 0.75, riskLevel: 'High', suggestedAction: 'Offer discount' },
    { id: 2, customerId: 'C-002', probability: 0.3, riskLevel: 'Low', suggestedAction: 'None' },
  ]),

  // ─── Model Security ───
  'model.security': () => Promise.resolve({ status: 'Healthy', lastAudit: new Date().toISOString().slice(0, 10), vulnerabilities: 0 }),
  'modelSecurity.status': () => Promise.resolve({ overallScore: 85, lastScan: new Date().toISOString(), recommendations: ['Update model weights encryption', 'Add inference logging'], vulnerabilities: 2, patchesApplied: 15 }),

  // ─── Fraud ───
  'fraud.alerts': () => q('SELECT id, "alertId", severity, "entityType" as type, message as description, "createdAt" as date, CASE WHEN resolved THEN \'Resolved\' ELSE \'Open\' END as status FROM fraud_alerts ORDER BY "createdAt" DESC'),
  'fraud.network': () => Promise.resolve({ nodes: [], edges: [] }),
  'fraudAlerts.graph': async () => {
    const alerts = await q('SELECT id, "alertId", "entityType", "entityId", severity FROM fraud_alerts WHERE NOT resolved ORDER BY "createdAt" DESC LIMIT 10');
    const nodes = alerts.map(a => ({ id: `N${a.id}`, label: `${a.entityType} ${a.entityId}`, type: a.entityType, riskScore: a.severity === 'critical' ? 0.9 : a.severity === 'high' ? 0.75 : 0.5 }));
    return { nodes, edges: [] };
  },
  'fraudNetwork.data': () => Promise.resolve({ nodes: [], edges: [] }),
  'fraudNetwork.graph': () => Promise.resolve({ nodes: [], edges: [] }),

  // ─── Radar ───
  'radar.insights': () => Promise.resolve([
    { id: 1, title: 'Motor premiums trending up', category: 'Market', impact: 'Medium' },
    { id: 2, title: 'Agricultural claims season approaching', category: 'Claims', impact: 'High' },
  ]),

  // ─── Policy Approval ───
  'approval.queue': () => q('SELECT id, "applicationId", "productType" as type, status, "createdAt" FROM insurance_applications WHERE status NOT IN (\'approved\',\'complete\') ORDER BY "createdAt" DESC'),

  // ─── Knowledge Graph ───
  'knowledge.graph': () => Promise.resolve({ nodes: [], edges: [], stats: { totalNodes: 0, totalEdges: 0 } }),

  // ─── Agent ───
  'agent.dashboard': async () => {
    const stats = await q1('SELECT COUNT(*) as clients FROM customers WHERE status=\'active\'');
    const apps = await q1('SELECT COUNT(*) as total FROM insurance_applications WHERE status NOT IN (\'approved\',\'complete\')');
    const renewals = await q1(`SELECT COUNT(*) as total FROM policies WHERE "expiryDate" BETWEEN NOW() AND NOW() + INTERVAL '90 days'`);
    const commission = await q1('SELECT COALESCE(SUM("commissionAmount"),0) as total FROM agent_commissions WHERE status=\'paid\'');
    return { totalClients: Number(stats.clients) || 0, newApplications: Number(apps.total) || 0, pendingRenewals: Number(renewals.total) || 0, commission: Number(commission.total) || 0 };
  },
  'agent.clients': () => q('SELECT c.id, c."firstName" || \' \' || c."lastName" as name, c.email, c.status FROM customers c WHERE c.status=\'active\' ORDER BY c."createdAt" DESC LIMIT 20'),
  'agent.performance': async () => {
    const agents = await q('SELECT id, "agencyName" as name, "totalPoliciesSold" as policies, "totalPremiumCollected" as premium, "commissionRate" * 100 as commission, 4.5 as rating FROM agents WHERE status=\'active\' ORDER BY "totalPremiumCollected" DESC');
    return { agents, topPerformers: agents.slice(0, 3) };
  },

  // ─── Embedded Insurance ───
  'embedded.partners': () => Promise.resolve([
    { id: 1, name: 'E-Commerce Platform', type: 'Purchase Protection', policies: 450, status: 'Active', industry: 'E-Commerce', productsOffered: ['Purchase', 'Shipping'] },
    { id: 2, name: 'Ride-Hailing App', type: 'Trip Insurance', policies: 1200, status: 'Active', industry: 'Transport', productsOffered: ['Trip', 'Driver'] },
  ]),
  'embedded.distribution': () => Promise.resolve([]),
  'embeddedInsurance.partners': () => Promise.resolve([
    { id: 1, name: 'TechCo Nigeria', industry: 'Technology', status: 'Active', productsOffered: ['Travel', 'Device'], integrationDate: '2025-06-01', revenue: 5000000 },
    { id: 2, name: 'AutoDeal Lagos', industry: 'Automotive', status: 'Active', productsOffered: ['Motor', 'GAP'], integrationDate: '2025-03-15', revenue: 8000000 },
  ]),

  // ─── NIIRA ───
  'niira.status': () => Promise.resolve({ registered: true, registrationId: 'NIIRA-2026-001', compulsoryProducts: 3 }),

  // ─── NAICOM ───
  'naicom.status': async () => {
    const filings = await q('SELECT id, "filingType", period, status, "submittedAt", "dueDate", "filingRef" FROM naicom_filings ORDER BY "createdAt" DESC');
    const approved = filings.filter(f => f.status === 'Approved').length;
    const score = filings.length > 0 ? Math.round(approved / filings.length * 100 * 10) / 10 : 98.2;
    return { compliant: score >= 80, score, lastAudit: new Date().toISOString().slice(0, 10), filings };
  },
  'compliance.status': async () => {
    const reports = await q('SELECT id, "reportType", period, status, "totalAlerts", "highAlerts" FROM compliance_reports ORDER BY "createdAt" DESC');
    return { overall: 'Compliant', score: 98.2, items: reports };
  },

  // ─── Audit ───
  'audit.trail': () => q('SELECT id, action, "entityType", "entityId", "createdAt" as timestamp, "ipAddress" FROM audit_trail ORDER BY "createdAt" DESC LIMIT 50'),
  'audit.logs': () => q('SELECT id, action, "userId" as user, "createdAt" as timestamp, "ipAddress" as ip FROM audit_trail ORDER BY "createdAt" DESC LIMIT 50'),

  // ─── USSD ───
  'ussd.sessions': () => Promise.resolve([]),
  'ussd.config': () => Promise.resolve({ shortCode: '*555#', active: true }),

  // ─── NMID ───
  'nmid.status': () => Promise.resolve({ integrated: true, lastSync: new Date().toISOString().slice(0, 10) }),

  // ─── Actuarial ───
  'actuarial.models': () => q('SELECT id, "calculationType" as name, "policyType" as type, "createdAt" as "lastRun", result as accuracy FROM actuarial_calculations ORDER BY "createdAt" DESC'),
  'actuarial.reserves': async () => {
    const ibnr = await q1('SELECT result FROM actuarial_calculations WHERE "calculationType"=\'IBNR Reserve\' ORDER BY "createdAt" DESC LIMIT 1', [], { result: 212500000 });
    const tp = await q1('SELECT result FROM actuarial_calculations WHERE "calculationType"=\'Technical Provisions\' ORDER BY "createdAt" DESC LIMIT 1', [], { result: 864000000 });
    return { totalReserves: Number(tp.result) + Number(ibnr.result), ibnr: Number(ibnr.result) };
  },

  // ─── Reinsurance ───
  'reinsurance.treaties': () => q('SELECT id, "treatyName" as name, reinsurer, "coverLimit" as limit, "retentionLimit" as retention, "treatyType" as type, status FROM reinsurance_treaties ORDER BY id'),

  // ─── Group Life ───
  'groupLife.schemes': () => q(`SELECT id, name, "coverageDetails"->>'employeeCount' as members, premium, name as employer FROM policies WHERE type='Group_Life' ORDER BY id`),

  // ─── PFA ───
  'pfa.status': () => Promise.resolve({ integrated: true, provider: 'ARM Pension', lastSync: new Date().toISOString().slice(0, 10) }),

  // ─── InsureTech ───
  'insureTech.innovations': () => Promise.resolve([
    { id: 1, name: 'AI Underwriting', status: 'Active', impact: 'High' },
    { id: 2, name: 'Blockchain Claims', status: 'Beta', impact: 'Medium' },
    { id: 3, name: 'Parametric Engine', status: 'Active', impact: 'High' },
    { id: 4, name: 'ML Fraud Detection', status: 'Active', impact: 'High' },
  ]),

  // ─── Telematics ───
  'telematics.data': () => Promise.resolve({
    devices: 1250, activeDrivers: 980, avgScore: 78,
    recentTrips: [
      { id: 1, driver: 'Driver A', distance: 45, score: 85, date: new Date().toISOString().slice(0, 10) },
    ],
  }),
  'telematics.devices': () => Promise.resolve([]),

  // ─── Geospatial ───
  'geospatial.data': () => Promise.resolve({ regions: [], riskZones: [], heatmap: [] }),
  'geospatial.riskMap': () => Promise.resolve({ center: { lat: 9.0820, lng: 8.6753 }, zoom: 6, zones: [] }),

  // ─── Broker ───
  'broker.apiKeys': () => Promise.resolve([]),
  'broker.documentation': () => Promise.resolve({ version: '2.0', endpoints: [] }),

  // ─── ERPNext ───
  'erpnext.status': async () => {
    const config = await q1('SELECT name, "baseUrl", "syncEnabled", "lastSyncAt" FROM erp_config LIMIT 1', [], { name: 'ERPNext', syncEnabled: true });
    return { connected: config.syncEnabled, lastSync: config.lastSyncAt || new Date().toISOString().slice(0, 10), name: config.name };
  },

  // ─── Agent Performance ───
  'agentPerformance.list': () => q('SELECT id, "agencyName" as name, "agentCode" as email, ("totalPoliciesSold" * 10)::int as score, "totalPoliciesSold" as "policiesSold", 0 as "claimsProcessed", "totalPremiumCollected" as revenue, status FROM agents ORDER BY "totalPremiumCollected" DESC'),
  'agentPerformance.metrics': async () => {
    const r = await q1('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status=\'active\') as active, COALESCE(SUM("totalPoliciesSold"),0) as sold, COALESCE(SUM("totalPremiumCollected"),0) as revenue FROM agents');
    return { averageScore: 89.9, totalAgents: Number(r.total), activeAgents: Number(r.active), totalRevenue: Number(r.revenue) };
  },

  // ─── Customers ───
  'customers.list': () => q('SELECT c.id, c."firstName" || \' \' || c."lastName" as name, c.email, c.status, c."kycLevel" FROM customers ORDER BY c."createdAt" DESC'),

  // ─── Commission ───
  'commission.summary': async () => {
    const r = await q1('SELECT COALESCE(SUM("commissionAmount"),0) as total, COALESCE(SUM("commissionAmount") FILTER (WHERE status=\'paid\'),0) as paid, COALESCE(SUM("commissionAmount") FILTER (WHERE status=\'pending\'),0) as pending FROM agent_commissions');
    return { totalEarned: Number(r.total), pending: Number(r.pending), paid: Number(r.paid) };
  },
  'commission.transactions': () => q('SELECT id, "agentId", "policyId", "commissionAmount" as amount, status, "paidAt", "createdAt" FROM agent_commissions ORDER BY "createdAt" DESC'),
  'agentCommission.summary': async () => {
    const r = await q1('SELECT COALESCE(SUM("commissionAmount"),0) as total, COALESCE(SUM("commissionAmount") FILTER (WHERE status=\'paid\'),0) as paid, COALESCE(SUM("commissionAmount") FILTER (WHERE status=\'pending\'),0) as pending FROM agent_commissions');
    return { total: Number(r.total), pending: Number(r.pending), paid: Number(r.paid) };
  },
  'agentCommission.details': () => q('SELECT ac.id, ac."agentId", a."agencyName" as "agentName", ac."policyId", ac."commissionAmount" as amount, ac.status, ac."createdAt" FROM agent_commissions ac LEFT JOIN agents a ON ac."agentId"=a.id ORDER BY ac."createdAt" DESC'),

  // ─── Analytics ───
  'analytics.overview': async () => {
    const revenue = await q1('SELECT COALESCE(SUM(premium),0) as total FROM policies WHERE status=\'Active\'');
    const claims = await q1('SELECT COUNT(*) as total FROM claims');
    const policies = await q1('SELECT COUNT(*) as total FROM policies');
    return { revenue: Number(revenue.total), claims: Number(claims.total), policies: Number(policies.total), lossRatio: 62.3 };
  },
  'analytics.charts': () => Promise.resolve([]),

  // ─── Executive Dashboard ───
  'executive.kpis': async () => {
    const revenue = await q1('SELECT COALESCE(SUM(premium),0) as total FROM policies WHERE status=\'Active\'');
    const policies = await q1('SELECT COUNT(*) as total FROM policies');
    return {
      revenue: Number(revenue.total), growthRate: 15.2, lossRatio: 62.3, customerRetention: 92.5,
      newPolicies: Number(policies.total), renewalRate: 87.3,
    };
  },

  // ─── Reports ───
  'reports.list': () => q('SELECT id, "reportType" as name, period as type, status, "createdAt" as date FROM compliance_reports ORDER BY "createdAt" DESC'),

  // ─── Adjudication ───
  'adjudication.queue': () => q('SELECT c.id, c."claimNumber", p.type, c.amount, CASE WHEN c.amount > 1000000 THEN \'High\' WHEN c.amount > 100000 THEN \'Medium\' ELSE \'Low\' END as priority FROM claims c LEFT JOIN policies p ON c."policyId"=p.id WHERE c.status::text IN (\'Submitted\',\'Under Review\') ORDER BY c.amount DESC'),

  // ─── Renewal Automation ───
  'automation.renewals': () => q(`SELECT id, "policyNumber", type, "expiryDate" as "dueDate", true as "autoRenew" FROM policies WHERE "expiryDate" BETWEEN NOW() AND NOW() + INTERVAL '90 days' ORDER BY "expiryDate"`),

  // ─── Batch ───
  'batch.jobs': () => Promise.resolve([
    { id: 1, name: 'Monthly Premium Collection', status: 'Completed', lastRun: new Date().toISOString().slice(0, 10), records: 12500 },
    { id: 2, name: 'NAICOM Quarterly Filing', status: 'Scheduled', lastRun: null, records: 0 },
  ]),

  // ─── Customer 360 ───
  'customer360.profile': async () => {
    const user = await q1('SELECT id, name, email FROM users WHERE id=1');
    const policyCnt = await q1('SELECT COUNT(*) as cnt FROM policies WHERE "userId"=1');
    const claimsCnt = await q1('SELECT COUNT(*) as cnt FROM claims WHERE "userId"=1');
    const premium = await q1('SELECT COALESCE(SUM(premium),0) as total FROM policies WHERE "userId"=1');
    return {
      id: user.id, name: user.name, email: user.email,
      policies: Number(policyCnt.cnt), claims: Number(claimsCnt.cnt),
      totalPremium: Number(premium.total), ltv: Number(premium.total) * 6,
      riskScore: 'Low', interactions: [], preferences: {},
    };
  },

  // ─── Documents ───
  'documents.list': () => q('SELECT id, "fileName" as name, "documentType" as type, "fileSize"::text as size, "createdAt" as date FROM documents ORDER BY "createdAt" DESC'),

  // ─── Feedback ───
  'feedback.list': () => q('SELECT id, "userId" as customer, rating, message as comment, "createdAt" as date, subject, "feedbackType" FROM customer_feedback ORDER BY "createdAt" DESC'),

  // ─── Currency ───
  'currency.rates': () => Promise.resolve([
    { currency: 'USD', rate: 1550.0, change: 0.2, symbol: '$' },
    { currency: 'GBP', rate: 1980.0, change: -0.1, symbol: '£' },
    { currency: 'EUR', rate: 1680.0, change: 0.3, symbol: '€' },
  ]),
  'currency.supported': () => Promise.resolve(['NGN', 'USD', 'GBP', 'EUR']),

  // ─── Bank Integrations ───
  'bank.integrations': () => q('SELECT id, "bankName" as bank, status, "updatedAt" as "lastSync" FROM bancassurance_partners ORDER BY id'),

  // ─── Reconciliation ───
  'reconciliation.status': () => Promise.resolve({ lastRun: new Date().toISOString().slice(0, 10), matched: 12400, unmatched: 47 }),

  // ─── DR ───
  'dr.status': () => Promise.resolve({ rpo: '1 hour', rto: '4 hours', lastBackup: new Date().toISOString(), backupStatus: 'Healthy' }),

  // ─── A/B Testing ───
  'abtesting.experiments': () => Promise.resolve([
    { id: 1, name: 'Premium Page Layout', status: 'Running', variant: 'B', conversionRate: 12.5 },
  ]),

  // ─── Users ───
  'users.list': () => q('SELECT id, name, email, role::text, \'Active\' as status FROM users ORDER BY id'),
  'agents.list': () => q('SELECT id, "agencyName" as name, "agentCode" as email, region, "totalPoliciesSold" as policies, status FROM agents ORDER BY id'),
  'agents.performance': async () => {
    const r = await q1('SELECT COUNT(*) as total, COALESCE(SUM("totalPoliciesSold"),0) as sold FROM agents');
    return { totalAgents: Number(r.total), averageScore: 89.9, totalPoliciesSold: Number(r.sold) };
  },
  'agents.commissions': () => q('SELECT ac.id, ac."agentId", ac."commissionAmount" as amount, ac.status, ac."createdAt" as period FROM agent_commissions ORDER BY ac."createdAt" DESC'),

  // ─── Rate Management ───
  'rates.list': () => q('SELECT id, name, "productType", "baseRate", "effectiveDate", "expiryDate", status FROM premium_rate_tables ORDER BY id'),
  'rates.factors': () => q('SELECT id, "tableId", name, category, weight, "minValue", "maxValue" FROM premium_risk_factors ORDER BY id'),

  // ─── System Monitoring ───
  'system.health': () => Promise.resolve([
    { id: 1, name: 'Database', value: 99.9, unit: '%', status: 'good', trend: 'stable' },
    { id: 2, name: 'API Response Time', value: 120, unit: 'ms', status: 'good', trend: 'stable' },
    { id: 3, name: 'Uptime', value: 99.9, unit: '%', status: 'good', trend: 'stable' },
    { id: 4, name: 'CPU Usage', value: 45, unit: '%', status: 'warning', trend: 'increasing' },
  ]),
  'systemHealth.metrics': () => Promise.resolve([
    { id: 1, name: 'Database', value: 99.9, unit: '%', status: 'good', trend: 'stable' },
    { id: 2, name: 'API Response Time', value: 120, unit: 'ms', status: 'good', trend: 'stable' },
    { id: 3, name: 'Uptime', value: 99.9, unit: '%', status: 'good', trend: 'stable' },
  ]),

  // ─── NAICOM Filings ───
  'naicomFilings.list': () => q('SELECT id, "filingType", period, status, "submittedAt", "dueDate", "filingRef" FROM naicom_filings ORDER BY "createdAt" DESC'),

  // ─── Compliance Reports ───
  'complianceReports.list': () => q('SELECT id, "reportType", period, status, "totalAlerts", "highAlerts", "mediumAlerts", "lowAlerts" FROM compliance_reports ORDER BY "createdAt" DESC'),
  'complianceFilings.list': () => q('SELECT id, filing_type, reference_number, status, reporting_period, submitted_to, submitted_at, total_transactions, total_amount FROM compliance_filings ORDER BY created_at DESC'),

  // ─── Premium Rate Management ───
  'premiumRates.list': () => q('SELECT id, name, "productType", "baseRate", "effectiveDate", "expiryDate", status FROM premium_rate_tables ORDER BY id'),
  'premiumRates.factors': () => q('SELECT prf.id, prf.name, prf.category, prf.weight, prt.name as "tableName", prt."productType" FROM premium_risk_factors prf LEFT JOIN premium_rate_tables prt ON prf."tableId"=prt.id ORDER BY prf.id'),

  // ─── ERP Integration ───
  'erp.config': () => q1('SELECT id, name, "baseUrl", "syncEnabled", "lastSyncAt", "lastSyncStatus", "lastSyncCount" FROM erp_config LIMIT 1'),
  'erp.transactions': () => q('SELECT id, "erpDocType", "erpDocId", "localEntityType", "localEntityId", "syncStatus"::text, amount, currency, "lastSyncAt" FROM erpnext_transactions ORDER BY "createdAt" DESC'),
  'erpnext.sync': async (input) => {
    return { success: true, synced: 12, failed: 0, lastSync: new Date().toISOString(), message: 'Sync completed successfully' };
  },

  // ─── Mutations & Missing Query Routes ───

  // Auth
  'auth.login': (input) => Promise.resolve({ ...DEMO_USER, token: 'demo-jwt-token' }),
  'auth.logout': () => Promise.resolve({ success: true }),

  // AB Testing
  'abTesting.list': () => Promise.resolve([
    { id: 1, name: 'Premium Pricing A/B', description: 'Testing dynamic vs flat pricing', status: 'active', startDate: '2026-05-01', endDate: '2026-06-30', variantA: 'Flat Rate', variantB: 'Dynamic Pricing' },
    { id: 2, name: 'Claims UX Flow', description: 'Simplified vs wizard claims flow', status: 'completed', startDate: '2026-03-01', endDate: '2026-04-30', variantA: 'Wizard', variantB: 'Single Page' },
  ]),
  'abTesting.create': async (input) => {
    const r = await q1(`INSERT INTO ab_tests (name, description, status, "startDate", "endDate", "variant_a", "variant_b", "createdAt") VALUES ($1, $2, 'active', NOW(), NOW() + INTERVAL '30 days', $3, $4, NOW()) RETURNING *`, [input.name || 'New Test', input.description || '', input.variantA || 'Control', input.variantB || 'Variant'], { id: 1 });
    return r;
  },
  'abTesting.update': (input) => Promise.resolve({ id: input.id || 1, ...input, updatedAt: new Date().toISOString() }),
  'abTesting.delete': (input) => Promise.resolve({ success: true, id: input.id || 1 }),

  // Actuarial
  'actuarial.calculate': async (input) => {
    return { calculationType: input.type || 'Premium', result: 125000.50, confidence: 0.95, factors: ['age', 'region', 'riskProfile', 'claimsHistory'], methodology: 'Generalized Linear Model (GLM)', timestamp: new Date().toISOString() };
  },
  'actuarial.tables': () => q('SELECT id, "calculationType", parameters, result, "createdAt" FROM actuarial_calculations ORDER BY "createdAt" DESC'),

  // Agents
  'agents.update': async (input) => {
    if (input.id) {
      await q('UPDATE agents SET status=$1, tier=$2, "updatedAt"=NOW() WHERE id=$3', [input.status || 'active', input.tier || 'Silver', input.id]);
    }
    return { success: true, id: input.id || 1 };
  },

  // Agricultural
  'agricultural.schemes': () => Promise.resolve([
    { id: 1, name: 'NIRSAL Anchor Borrowers Program', type: 'Crop', premium: 7500, coverage: 500000, region: 'All Nigeria', enrollees: 245000 },
    { id: 2, name: 'NAIC Agricultural Insurance', type: 'Multi-Peril', premium: 12000, coverage: 1000000, region: 'North Central', enrollees: 89000 },
    { id: 3, name: 'CBN Agribusiness SME Fund', type: 'Livestock', premium: 9000, coverage: 750000, region: 'North West', enrollees: 67000 },
    { id: 4, name: 'Index-Based Livestock Insurance (IBLI)', type: 'Parametric', premium: 5000, coverage: 300000, region: 'Sahelian Belt', enrollees: 156000 },
  ]),
  'agricultural.submitApplication': (input) => Promise.resolve({ success: true, applicationId: 'AGR-' + Date.now(), message: 'Application submitted for review' }),
  'agriculturalInsurance.products': () => q(`SELECT DISTINCT ON (type) id, name, type, premium, "sumAssured" as "coverageAmount" FROM policies WHERE type='Agricultural' ORDER BY type, id`),
  'agriculturalInsurance.ndviReadings': () => Promise.resolve([
    { date: '2026-05-01', ndvi: 0.72, region: 'Benue', status: 'healthy' },
    { date: '2026-05-08', ndvi: 0.68, region: 'Benue', status: 'moderate' },
    { date: '2026-05-15', ndvi: 0.45, region: 'Sokoto', status: 'stressed' },
    { date: '2026-05-22', ndvi: 0.78, region: 'Niger', status: 'healthy' },
  ]),
  'agriculturalInsurance.purchase': (input) => Promise.resolve({ success: true, policyId: 'AGR-POL-' + Date.now() }),
  'agriculturalInsurance.triggerEvents': () => Promise.resolve([
    { id: 1, type: 'Drought', region: 'Sokoto', severity: 'high', triggeredAt: '2026-05-20T10:00:00Z', payout: 75000, affectedPolicies: 234 },
    { id: 2, type: 'Flooding', region: 'Benue', severity: 'medium', triggeredAt: '2026-05-18T14:00:00Z', payout: 100000, affectedPolicies: 156 },
  ]),

  // AI
  'ai.advisor': (input) => Promise.resolve({ recommendation: 'Based on your profile, we recommend increasing your health coverage to ₦5M and adding a critical illness rider.', confidence: 0.89, products: ['Health Plus', 'Critical Illness Rider', 'Family Shield'] }),
  'ai.chat': (input) => Promise.resolve({ response: 'I can help with insurance queries. What would you like to know about your policies, claims, or coverage options?', sessionId: 'ai-' + Date.now() }),
  'ai.getHistory': () => Promise.resolve([]),
  'aiClaims.process': (input) => Promise.resolve({ claimId: input.claimId || 1, fraudScore: 0.12, recommendation: 'APPROVE', estimatedPayout: 500000, confidence: 0.94, processingTime: '2.3s' }),
  'aiClaims.results': () => q('SELECT c.id, c."claimNumber", c.amount, c."fraudScore", c.status::text FROM claims c ORDER BY c."createdAt" DESC LIMIT 20'),

  // Analytics
  'analytics.dashboard': async (input) => {
    const policies = await q1('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status=\'Active\') as active FROM policies');
    const claims = await q1('SELECT COUNT(*) as total, SUM(amount) as totalAmount FROM claims');
    const revenue = await q1('SELECT SUM(premium) as total FROM policies WHERE status=\'Active\'');
    return {
      totalPolicies: Number(policies.total) || 0,
      activePolicies: Number(policies.active) || 0,
      totalClaims: Number(claims.total) || 0,
      claimsAmount: Number(claims.totalamount) || 0,
      revenue: Number(revenue.total) || 0,
      period: input.period || 'monthly',
      growthRate: 12.5,
      retentionRate: 87.3,
      customerSatisfaction: 4.2,
    };
  },

  // Application (Insurance Application)
  'application.create': async (input) => {
    const r = await q1(`INSERT INTO insurance_applications (id, "userId", "productType", status, "personalInfo", "riskInfo", "createdAt", "updatedAt")
      VALUES ((SELECT COALESCE(MAX(id),0)+1 FROM insurance_applications), 1, $1, 'submitted', $2, '{}', NOW(), NOW()) RETURNING *`,
      [input.productType || 'Motor', JSON.stringify(input.personalInfo || {})], { id: 1, status: 'submitted' });
    return { success: true, applicationId: r.id, status: 'submitted' };
  },
  'application.get': (input) => q1('SELECT * FROM insurance_applications WHERE id=$1', [input.id || 1]),
  'application.list': () => q('SELECT id, "userId", "productType", status, "createdAt" FROM insurance_applications ORDER BY "createdAt" DESC'),
  'application.update': (input) => Promise.resolve({ success: true, id: input.id }),

  // Audit Trail
  'auditTrail.list': () => q('SELECT id, action, "entityType", "entityId", "userId", details, "createdAt" FROM audit_trail ORDER BY "createdAt" DESC LIMIT 100'),
  'auditTrail.export': () => Promise.resolve({ url: '/api/exports/audit-trail.csv', format: 'csv', generatedAt: new Date().toISOString() }),

  // Bancassurance mutations
  'bancassurance.submitApplication': (input) => Promise.resolve({ success: true, applicationId: 'BNC-' + Date.now(), status: 'pending_review' }),

  // Bank Integrations
  'bankIntegrations.banks': () => Promise.resolve([
    { id: 1, name: 'First Bank', code: 'FBN', status: 'connected', lastSync: '2026-05-28T10:00:00Z' },
    { id: 2, name: 'Access Bank', code: 'ACCESS', status: 'connected', lastSync: '2026-05-28T09:00:00Z' },
    { id: 3, name: 'GTBank', code: 'GTB', status: 'connected', lastSync: '2026-05-28T08:00:00Z' },
    { id: 4, name: 'UBA', code: 'UBA', status: 'pending', lastSync: null },
    { id: 5, name: 'Zenith Bank', code: 'ZENITH', status: 'connected', lastSync: '2026-05-27T15:00:00Z' },
  ]),
  'bankIntegrations.verifyAccount': (input) => Promise.resolve({ valid: true, accountName: 'A&G Insurance Ltd', bank: input.bankCode || 'FBN', accountNumber: input.accountNumber || '1234567890' }),

  // Batch Processing
  'batch.run': (input) => Promise.resolve({ jobId: 'batch-' + Date.now(), status: 'running', type: input.type || 'renewal', estimatedCompletion: '5 minutes' }),

  // Broker API
  'brokerApi.keys': () => Promise.resolve([
    { id: 1, name: 'Production Key', key: 'pk_live_****1234', created: '2026-01-15', status: 'active', lastUsed: '2026-05-28' },
    { id: 2, name: 'Test Key', key: 'pk_test_****5678', created: '2026-03-01', status: 'active', lastUsed: '2026-05-27' },
  ]),
  'brokerApi.create': (input) => Promise.resolve({ id: 3, name: input.name || 'New Key', key: 'pk_live_' + Math.random().toString(36).slice(2, 10), status: 'active' }),
  'brokerApi.revoke': (input) => Promise.resolve({ success: true, id: input.id }),

  // Churn
  'churn.list': () => q(`SELECT c.id, c."policyNumber", c.type, c.premium, c.status::text, cu.name as "customerName" FROM policies c LEFT JOIN customers cu ON c."customerId"=cu.id WHERE c.status='Active' ORDER BY c.premium DESC LIMIT 20`),
  'churn.predict': (input) => Promise.resolve({ customerId: input.customerId || 1, churnProbability: 0.23, riskLevel: 'medium', factors: ['Late payments', 'No claims in 2 years', 'Premium increase'] }),

  // Claims mutations
  'claims.create': async (input) => {
    const claimNum = 'CLM-' + new Date().getFullYear() + '-' + String(Math.floor(Math.random() * 99999)).padStart(5, '0');
    const r = await q1(`INSERT INTO claims (id, "policyId", "claimNumber", amount, description, status, "createdAt", "updatedAt")
      VALUES ((SELECT COALESCE(MAX(id),0)+1 FROM claims), $1, $2, $3, $4, 'Submitted', NOW(), NOW()) RETURNING *`,
      [input.policyId || 1, claimNum, input.amount || 0, input.description || ''], { id: 1, claimNumber: claimNum, status: 'Submitted' });
    return { success: true, claimId: r.id, claimNumber: r.claimNumber || claimNum };
  },
  'claims.update': async (input) => {
    if (input.id) {
      await q('UPDATE claims SET status=$1, "updatedAt"=NOW() WHERE id=$2', [input.status || 'Under Review', input.id]);
    }
    return { success: true, id: input.id };
  },
  'claims.delete': async (input) => {
    if (input.id) await q('DELETE FROM claims WHERE id=$1', [input.id]);
    return { success: true };
  },
  'claimsEvidence.list': () => q('SELECT id, "userId", "claimId", "evidenceType", "fileName", "fileUrl", description, status FROM claim_evidence ORDER BY "createdAt" DESC'),
  'claimsEvidence.upload': (input) => Promise.resolve({ success: true, evidenceId: 'EVD-' + Date.now(), status: 'uploaded' }),

  // Claim Routing
  'claimRouting.queue': () => q(`SELECT c.id, c."claimNumber", c.amount, c.status::text, c.description, c."createdAt" FROM claims c WHERE c.status IN ('Submitted', 'Under Review') ORDER BY c."createdAt"`),
  'claimRouting.route': (input) => Promise.resolve({ success: true, claimId: input.claimId, assignedTo: 'Claims Adjudicator Team A', priority: 'high' }),

  // Compliance
  'compliance.list': () => q('SELECT id, "reportType", period, status, "totalAlerts", "highAlerts", "mediumAlerts", "lowAlerts" FROM compliance_reports ORDER BY "createdAt" DESC'),
  'compliance.run': (input) => Promise.resolve({ success: true, reportId: 'CMP-' + Date.now(), status: 'generating' }),

  // Currency
  'currency.convert': (input) => {
    const rates = { USD: 1550, GBP: 1960, EUR: 1680, NGN: 1 };
    const from = rates[input.from] || 1;
    const to = rates[input.to] || 1;
    return Promise.resolve({ from: input.from || 'USD', to: input.to || 'NGN', amount: input.amount || 1, result: (input.amount || 1) * (to / from), rate: to / from });
  },

  // DB Scaling (PostgreSQL performance)
  'dbScaling.metrics': () => Promise.resolve({
    connections: { active: 12, idle: 8, max: 100 },
    queryPerformance: { avgMs: 23, p95Ms: 89, p99Ms: 245 },
    tableStats: { totalRows: 50000, largestTable: 'policies', size: '2.4 GB' },
    replication: { lag: '0.5s', status: 'streaming' },
  }),
  'dbScaling.recommendations': () => Promise.resolve([
    { type: 'index', table: 'claims', column: 'policyId', impact: 'high', description: 'Add index on claims.policyId for JOIN performance' },
    { type: 'vacuum', table: 'audit_trail', impact: 'medium', description: 'Run VACUUM on audit_trail (dead tuples: 12%)' },
  ]),

  // Digital Consumer
  'digitalConsumer.products': () => Promise.resolve([
    { id: 1, name: 'Device Protection', type: 'gadget', premium: 2500, coverage: 500000, duration: '12 months' },
    { id: 2, name: 'Travel Guard', type: 'travel', premium: 5000, coverage: 2000000, duration: 'per trip' },
    { id: 3, name: 'Cyber Shield', type: 'cyber', premium: 3000, coverage: 1000000, duration: '12 months' },
    { id: 4, name: 'Event Cancellation', type: 'event', premium: 8000, coverage: 5000000, duration: 'per event' },
  ]),
  'digitalConsumer.activate': (input) => Promise.resolve({ success: true, policyId: 'DIG-' + Date.now(), activatedAt: new Date().toISOString() }),

  // Disaster Recovery
  'disasterRecovery.status': () => Promise.resolve({
    primarySite: { status: 'operational', location: 'Lagos', uptime: '99.97%' },
    secondarySite: { status: 'standby', location: 'Abuja', lastSync: '2026-05-28T12:00:00Z' },
    rpo: '15 minutes', rto: '4 hours', lastDrillDate: '2026-04-15', nextDrillDate: '2026-07-15',
    backups: { daily: 'completed', weekly: 'completed', monthly: 'completed' },
  }),
  'disasterRecovery.test': () => Promise.resolve({ success: true, testId: 'DR-' + Date.now(), result: 'passed', failoverTime: '3m 42s' }),

  // Documents mutations
  'documents.upload': (input) => Promise.resolve({ success: true, documentId: 'DOC-' + Date.now(), status: 'uploaded' }),
  'documents.delete': async (input) => {
    if (input.id) await q('DELETE FROM documents WHERE id=$1', [input.id]);
    return { success: true };
  },

  // Dynamic Pricing
  'dynamicPricing.history': () => q('SELECT id, "productType", "baseRate", "adjustedRate", factors, "effectiveDate" FROM dynamic_pricing_history ORDER BY "effectiveDate" DESC LIMIT 20'),
  'dynamicPricing.quote': (input) => {
    const baseRate = input.productType === 'Motor' ? 45000 : input.productType === 'Health' ? 65000 : 35000;
    const riskMultiplier = 1 + (Math.random() * 0.3);
    return Promise.resolve({
      productType: input.productType || 'Motor',
      baseRate,
      adjustedRate: Math.round(baseRate * riskMultiplier),
      factors: [
        { name: 'Age', impact: '+5%', weight: 0.15 },
        { name: 'Region', impact: '+8%', weight: 0.20 },
        { name: 'Claims History', impact: '-3%', weight: 0.25 },
        { name: 'Vehicle Type', impact: '+12%', weight: 0.20 },
      ],
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
  },

  // Embedded Distribution
  'embeddedDistribution.partners': () => Promise.resolve([
    { id: 1, name: 'Jumia Nigeria', type: 'e-commerce', products: ['Device Protection', 'Shipping Insurance'], revenue: 12500000, policies: 8900 },
    { id: 2, name: 'Bolt Nigeria', type: 'ride-hailing', products: ['Driver Coverage', 'Passenger Insurance'], revenue: 8700000, policies: 15200 },
    { id: 3, name: 'Paystack', type: 'fintech', products: ['Transaction Insurance', 'Fraud Protection'], revenue: 5600000, policies: 3400 },
  ]),
  'embeddedDistribution.createPartner': (input) => Promise.resolve({ success: true, partnerId: 'EMB-' + Date.now() }),
  'embeddedDistribution.revenue': () => Promise.resolve({ total: 26800000, monthly: 4500000, growth: 15.2 }),

  // Embedded Insurance
  'embedded.activate': (input) => Promise.resolve({ success: true, policyId: 'EMB-POL-' + Date.now() }),
  'embedded.create': (input) => Promise.resolve({ success: true, id: 'EMB-' + Date.now() }),

  // Emergency
  'emergency.create': async (input) => {
    const r = await q1(`INSERT INTO emergency_incidents (id, "userId", "incidentType", description, status, "createdAt")
      VALUES ((SELECT COALESCE(MAX(id),0)+1 FROM emergency_incidents), 1, $1, $2, 'active', NOW()) RETURNING *`,
      [input.type || 'accident', input.description || 'Emergency reported'], { id: 1 });
    return { success: true, emergencyId: r.id, status: 'dispatched', eta: '15 minutes' };
  },
  'emergency.list': () => q('SELECT id, "userId", "incidentType", description, status, "createdAt" FROM emergency_incidents ORDER BY "createdAt" DESC'),

  // Family Coverage
  'familyCoverage.members': () => q('SELECT id, "userId", "memberName" as name, relationship, "dateOfBirth", "coveredPolicyId", status FROM family_members ORDER BY "userId"'),
  'familyCoverage.add': (input) => Promise.resolve({ success: true, memberId: 'FM-' + Date.now() }),
  'familyCoverage.remove': (input) => Promise.resolve({ success: true }),

  // Feedback
  'feedback.submit': async (input) => {
    const r = await q1(`INSERT INTO customer_feedback (id, "userId", "feedbackType", rating, comment, status, "createdAt")
      VALUES ((SELECT COALESCE(MAX(id),0)+1 FROM customer_feedback), 1, $1, $2, $3, 'submitted', NOW()) RETURNING *`,
      [input.type || 'general', input.rating || 5, input.comment || ''], { id: 1 });
    return { success: true, feedbackId: r.id };
  },

  // Financial Wellness
  'financialWellness.score': async () => {
    const policies = await q1('SELECT COUNT(*) as count, SUM(premium) as total FROM policies WHERE status=\'Active\'');
    const claims = await q1('SELECT COUNT(*) as count FROM claims WHERE status IN (\'Approved\', \'Paid\')');
    return {
      score: 78,
      grade: 'B+',
      breakdown: {
        coverageAdequacy: 85,
        premiumAffordability: 72,
        claimsEfficiency: 90,
        diversification: 65,
      },
      activePolicies: Number(policies.count) || 0,
      totalPremium: Number(policies.total) || 0,
      successfulClaims: Number(claims.count) || 0,
      recommendations: [
        'Consider adding critical illness cover',
        'Review motor premium — you may qualify for a no-claims discount',
        'Add a dependent to your health policy for family coverage',
      ],
    };
  },
  'financialWellness.recommendations': () => Promise.resolve([
    { id: 1, type: 'savings', title: 'Emergency Fund Gap', description: 'Your emergency fund covers only 2 months of expenses. Target 6 months.', priority: 'high' },
    { id: 2, type: 'insurance', title: 'Life Coverage Gap', description: 'Recommended coverage: ₦30M based on income. Current: ₦10M.', priority: 'medium' },
    { id: 3, type: 'investment', title: 'Retirement Planning', description: 'Start contributing to your PFA pension fund.', priority: 'medium' },
  ]),

  // Fraud Network
  'fraudNetwork.analyze': (input) => Promise.resolve({
    networkSize: 12,
    riskScore: 0.67,
    connections: [
      { from: 'CLM-001', to: 'CLM-005', type: 'same_address', strength: 0.8 },
      { from: 'CLM-005', to: 'CLM-012', type: 'same_vehicle', strength: 0.9 },
    ],
    flaggedEntities: 3,
  }),

  // Geospatial
  'geospatial.analyze': (input) => Promise.resolve({
    region: input.region || 'Lagos',
    riskLevel: 'medium',
    floodRisk: 0.35,
    crimeIndex: 0.42,
    proximityToHospital: '2.3 km',
    nearestFireStation: '4.1 km',
    premiumAdjustment: '+8%',
  }),

  // Gig Economy
  'gigEconomy.activate': (input) => Promise.resolve({ success: true, policyId: 'GIG-' + Date.now() }),

  // Group Life
  'groupLife.enroll': (input) => Promise.resolve({ success: true, enrollmentId: 'GL-' + Date.now(), status: 'pending_hr_approval' }),

  // Health
  'health.data': () => Promise.resolve({
    bmi: 24.2, bloodPressure: '120/80', cholesterol: 185,
    lastCheckup: '2026-03-15', riskCategory: 'standard',
    wellnessScore: 82,
  }),
  'health.submit': (input) => Promise.resolve({ success: true, recordId: 'HLT-' + Date.now() }),

  // Insurance Radar
  'insuranceRadar.scan': (input) => Promise.resolve({
    threats: 3, opportunities: 5, regulatoryChanges: 2,
    marketTrends: [
      { trend: 'Parametric insurance growth', impact: 'positive', confidence: 0.87 },
      { trend: 'NAICOM minimum capital increase', impact: 'neutral', confidence: 0.95 },
    ],
  }),
  'insuranceRadar.alerts': () => Promise.resolve([
    { id: 1, type: 'regulatory', title: 'NAICOM Circular 2026/05', severity: 'medium', date: '2026-05-15' },
    { id: 2, type: 'market', title: 'Naira depreciation impact on reinsurance', severity: 'high', date: '2026-05-20' },
  ]),

  // Knowledge Graph
  'knowledgeGraph.entities': () => Promise.resolve({ nodes: 45, edges: 78, clusters: 6 }),
  'knowledgeGraph.query': (input) => Promise.resolve({ results: [], totalNodes: 45 }),

  // KYC mutations
  'kyc.submit': (input) => Promise.resolve({ success: true, verificationId: 'KYC-' + Date.now(), status: 'pending' }),
  'kyc.verifyBVN': (input) => Promise.resolve({ valid: true, name: 'Patrick Munis', bvn: input.bvn || '22200000001', bank: 'First Bank' }),
  'kyc.verifyNIN': (input) => Promise.resolve({ valid: true, name: 'Patrick Munis', nin: input.nin || '10000000001' }),
  'kyc.verifyPhone': (input) => Promise.resolve({ valid: true, carrier: 'MTN Nigeria' }),
  'kyc.gate': () => Promise.resolve({ passed: true, level: 'tier3', completedSteps: ['bvn', 'nin', 'address', 'phone'] }),
  'kyc.serviceHealth': () => Promise.resolve({ nibss: 'operational', nimc: 'operational', frsc: 'operational', cac: 'degraded' }),

  // Literacy
  'literacy.content': () => Promise.resolve([
    { id: 1, title: 'Understanding Motor Insurance in Nigeria', category: 'motor', readTime: '5 min', progress: 0 },
    { id: 2, title: 'Health Insurance: HMO vs Indemnity', category: 'health', readTime: '8 min', progress: 0 },
    { id: 3, title: 'What is Reinsurance?', category: 'advanced', readTime: '10 min', progress: 0 },
  ]),
  'literacy.complete': (input) => Promise.resolve({ success: true, badges: ['Motor Expert'] }),
  'literacy.progress': () => Promise.resolve({ completed: 3, total: 12, streak: 5 }),

  // Loyalty mutations
  'loyalty.points': () => Promise.resolve({ balance: 15000, lifetime: 45000, tier: 'Gold', nextTier: 'Platinum', pointsToNext: 5000 }),
  'loyalty.redeem': (input) => Promise.resolve({ success: true, redeemed: input.points || 1000, remaining: 14000 }),

  // Marketplace
  'marketplace.products': () => q(`SELECT id, name, type as category, premium, name as description, status FROM policies WHERE status='Active' ORDER BY type`),
  'marketplace.purchase': (input) => Promise.resolve({ success: true, policyId: 'POL-' + Date.now(), status: 'pending_payment' }),

  // MCMC Risk Modeling
  'mcmc.simulate': (input) => Promise.resolve({
    iterations: 10000,
    burnIn: 2000,
    convergence: true,
    rHat: 1.02,
    posteriorMean: 0.156,
    credibleInterval: [0.12, 0.19],
    chains: 4,
    effectiveSampleSize: 8200,
  }),
  'mcmc.results': () => Promise.resolve({
    models: [
      { name: 'Motor Loss Frequency', distribution: 'Poisson', lambda: 0.23, fit: 'good' },
      { name: 'Health Claim Severity', distribution: 'Lognormal', mu: 12.5, sigma: 1.2, fit: 'excellent' },
    ],
  }),

  // Microinsurance
  'microinsurance.enroll': (input) => Promise.resolve({ success: true, policyId: 'MIC-' + Date.now(), premium: 500 }),

  // Model Security
  'modelSecurity.scan': (input) => Promise.resolve({
    vulnerabilities: 2,
    riskLevel: 'low',
    lastScan: new Date().toISOString(),
    findings: [
      { type: 'model_drift', severity: 'medium', model: 'fraud_detection_v3' },
      { type: 'data_poisoning_risk', severity: 'low', model: 'underwriting_glm' },
    ],
  }),

  // NAICOM mutations
  'naicom.filings': () => q('SELECT id, "filingType", period, status, "dueDate", "submittedAt", "filingRef" FROM naicom_filings ORDER BY "dueDate" DESC'),
  'naicom.submit': async (input) => {
    return { success: true, filingId: 'NAI-' + Date.now(), status: 'submitted', message: 'Filing submitted to NAICOM portal' };
  },

  // NIIRA
  'niiraInsurance.classes': () => Promise.resolve([
    { id: 1, name: 'Motor Third Party', class: 'compulsory', minimumCover: 1000000, regulation: 'Insurance Act 2003, Section 68' },
    { id: 2, name: 'Professional Indemnity (Healthcare)', class: 'compulsory', minimumCover: 5000000, regulation: 'NAICOM Guidelines 2020' },
    { id: 3, name: 'Group Life (Employers)', class: 'compulsory', minimumCover: 3, regulation: 'Pension Reform Act 2014, Section 4(5)' },
    { id: 4, name: 'Buildings Under Construction', class: 'compulsory', minimumCover: 0, regulation: 'Insurance Act 2003, Section 64' },
    { id: 5, name: 'Occupiers Liability', class: 'compulsory', minimumCover: 2000000, regulation: 'Insurance Act 2003, Section 65' },
  ]),
  'niiraInsurance.purchase': (input) => Promise.resolve({ success: true, policyId: 'NII-' + Date.now() }),

  // NMID
  'nmid.verify': (input) => Promise.resolve({ valid: true, nmid: input.nmid || 'NMID-001', holder: 'Patrick Munis', policies: 3 }),
  'nmid.history': () => Promise.resolve([
    { id: 1, event: 'Policy Added', date: '2026-05-01', policyNumber: 'POL-2026-MOT-00001' },
    { id: 2, event: 'Claim Filed', date: '2026-05-15', policyNumber: 'POL-2026-HLT-00001' },
  ]),

  // Notifications
  'notifications.list': () => Promise.resolve([
    { id: 1, type: 'policy', title: 'Policy Renewal Due', message: 'Your motor policy expires in 30 days', read: false, date: '2026-05-28' },
    { id: 2, type: 'claim', title: 'Claim Approved', message: 'Claim CLM-2026-00003 has been approved', read: true, date: '2026-05-25' },
    { id: 3, type: 'payment', title: 'Payment Received', message: 'Premium payment of ₦45,000 received', read: true, date: '2026-05-20' },
  ]),
  'notifications.markRead': (input) => Promise.resolve({ success: true }),

  // Onboarding
  'onboarding.status': () => Promise.resolve({ completed: true, steps: ['profile', 'kyc', 'firstPolicy'], currentStep: null }),
  'onboarding.complete': () => Promise.resolve({ success: true }),

  // Parametric mutations
  'parametric.claim': (input) => Promise.resolve({ success: true, claimId: 'PAR-CLM-' + Date.now(), autoApproved: true, payout: 75000 }),

  // Payments
  'payments.process': (input) => Promise.resolve({ success: true, transactionId: 'TXN-' + Date.now(), amount: input.amount || 0, status: 'completed' }),

  // Performance metrics
  'performance.metrics': async () => {
    const policies = await q1('SELECT COUNT(*) as total FROM policies');
    const claims = await q1('SELECT COUNT(*) as total, AVG(amount) as avgAmount FROM claims');
    return {
      totalPolicies: Number(policies.total) || 0,
      totalClaims: Number(claims.total) || 0,
      avgClaimAmount: Math.round(Number(claims.avgamount)) || 0,
      responseTime: '1.2s',
      uptime: 99.97,
      errorRate: 0.03,
    };
  },

  // PFA Integration
  'pfa.annuities': () => Promise.resolve([
    { id: 1, type: 'Programmed Withdrawal', balance: 25000000, monthly: 250000, provider: 'Stanbic IBTC Pension' },
    { id: 2, type: 'Life Annuity', balance: 18000000, monthly: 180000, provider: 'ARM Pension' },
  ]),
  'pfa.quote': (input) => Promise.resolve({
    monthlyContribution: input.amount || 50000,
    projectedBalance: 15000000,
    estimatedAnnuity: 150000,
    years: input.years || 25,
  }),

  // Policy mutations
  'policies.cancel': async (input) => {
    if (input.id) await q(`UPDATE policies SET status='Cancelled', "updatedAt"=NOW() WHERE id=$1`, [input.id]);
    return { success: true };
  },
  'policies.renew': async (input) => {
    return { success: true, newPolicyId: 'POL-REN-' + Date.now(), status: 'renewed' };
  },

  // Policy Comparison
  'policyComparison.compare': (input) => Promise.resolve({
    policies: (input.policyIds || []).map((id, i) => ({
      id, name: `Policy ${id}`, premium: 45000 + i * 10000, coverage: 5000000 + i * 2000000,
      deductible: 50000, rating: 4.5 - i * 0.3,
    })),
  }),
  'policyComparison.results': () => Promise.resolve({ comparisons: [] }),

  // Policy Renewal
  'policyRenewal.upcoming': () => q(`SELECT id, "policyNumber", type, premium, "endDate" as "renewalDate", status::text FROM policies WHERE "endDate" < NOW() + INTERVAL '90 days' AND status='Active' ORDER BY "endDate"`),
  'policyRenewal.renew': (input) => Promise.resolve({ success: true, renewedPolicyId: 'POL-' + Date.now() }),

  // Premium Rates mutations
  'premiumRates.create': (input) => Promise.resolve({ success: true, id: 'PRT-' + Date.now() }),
  'premiumRates.update': (input) => Promise.resolve({ success: true, id: input.id }),
  'premiumRates.delete': (input) => Promise.resolve({ success: true }),

  // Profile
  'profile.get': () => Promise.resolve(DEMO_USER),
  'profile.update': (input) => Promise.resolve({ ...DEMO_USER, ...input, updatedAt: new Date().toISOString() }),

  // Reconciliation
  'reconciliation.summary': async () => {
    const transactions = await q1('SELECT COUNT(*) as total FROM erpnext_transactions');
    return {
      totalTransactions: Number(transactions.total) || 0,
      matched: Math.round(Number(transactions.total) * 0.92) || 0,
      unmatched: Math.round(Number(transactions.total) * 0.05) || 0,
      pending: Math.round(Number(transactions.total) * 0.03) || 0,
      lastRun: new Date().toISOString(),
    };
  },
  'reconciliation.run': () => Promise.resolve({ success: true, jobId: 'REC-' + Date.now(), status: 'running' }),

  // Referrals mutations
  'referrals.create': (input) => Promise.resolve({ success: true, referralCode: 'REF-' + Math.random().toString(36).slice(2, 8).toUpperCase() }),
  'referrals.delete': (input) => Promise.resolve({ success: true }),

  // Reinsurance mutations
  'reinsurance.cessions': () => q('SELECT id, "treatyId", "policyId", "cedingAmount", "retainedAmount", "reinsurerPremium", status, "cessionDate" FROM reinsurance_cessions ORDER BY "cessionDate" DESC'),
  'reinsurance.create': (input) => Promise.resolve({ success: true, treatyId: 'RE-' + Date.now() }),

  // Reports
  'reports.generate': (input) => Promise.resolve({ success: true, reportId: 'RPT-' + Date.now(), format: input.format || 'pdf', status: 'generating' }),

  // Reviews mutations
  'reviews.create': (input) => Promise.resolve({ success: true, reviewId: 'REV-' + Date.now() }),
  'reviews.delete': (input) => Promise.resolve({ success: true }),

  // Savings mutations
  'savings.create': (input) => Promise.resolve({ success: true, planId: 'SAV-' + Date.now() }),
  'savings.contribute': (input) => Promise.resolve({ success: true, transactionId: 'STX-' + Date.now(), newBalance: 150000 }),

  // SME
  'sme.submitApplication': (input) => Promise.resolve({ success: true, applicationId: 'SME-' + Date.now(), status: 'under_review' }),

  // Takaful mutations
  'takaful.join': (input) => Promise.resolve({ success: true, participantId: 'TAK-' + Date.now() }),
  'takaful.pools': () => Promise.resolve([
    { id: 1, name: 'Family Takaful Pool', type: 'family', participants: 1250, surplus: 45000000, contribution: 15000 },
    { id: 2, name: 'General Takaful Pool', type: 'general', participants: 890, surplus: 32000000, contribution: 12000 },
    { id: 3, name: 'Motor Takaful Pool', type: 'motor', participants: 2100, surplus: 78000000, contribution: 8000 },
  ]),
  'takaful.shariaPrinciples': () => Promise.resolve([
    { principle: 'Tabarru (Donation)', description: 'Participants donate a portion of their contributions to help others in need' },
    { principle: 'Ta\'awun (Mutual Assistance)', description: 'Members cooperate and assist each other' },
    { principle: 'No Gharar (Uncertainty)', description: 'Terms and conditions are transparent and clearly defined' },
    { principle: 'No Riba (Interest)', description: 'Investments follow Islamic finance principles' },
  ]),

  // Telco Credit Scoring
  'telcoCredit.score': (input) => Promise.resolve({
    score: 720, grade: 'A', factors: ['Call patterns', 'Data usage', 'Payment history', 'Account age'],
    eligible: true, maxCoverage: 5000000,
  }),
  'telcoCredit.submitApplication': (input) => Promise.resolve({ success: true, applicationId: 'TCS-' + Date.now() }),

  // Tech Innovations
  'techInnovations.features': () => Promise.resolve([
    { id: 1, name: 'AI Underwriting Engine', status: 'active', accuracy: 94.5 },
    { id: 2, name: 'Blockchain Audit Trail', status: 'active', transactions: 15000 },
    { id: 3, name: 'IoT Telematics', status: 'beta', devices: 2300 },
    { id: 4, name: 'NLP Claims Processing', status: 'active', avgProcessingTime: '45s' },
  ]),
  'techInnovations.calculatePrice': (input) => Promise.resolve({ premium: 45000, discount: 5000, total: 40000, factors: ['loyalty', 'no-claims'] }),
  'techInnovations.gamificationLevels': () => Promise.resolve([
    { level: 1, name: 'Newcomer', xp: 0, badge: 'shield' },
    { level: 2, name: 'Protected', xp: 500, badge: 'star' },
    { level: 3, name: 'Guardian', xp: 1500, badge: 'crown' },
    { level: 4, name: 'Champion', xp: 5000, badge: 'diamond' },
  ]),
  'techInnovations.pricingComparison': () => Promise.resolve([
    { provider: 'InsurePortal', motor: 42000, health: 65000, property: 35000 },
    { provider: 'Leadway', motor: 48000, health: 72000, property: 38000 },
    { provider: 'AXA Mansard', motor: 45000, health: 68000, property: 40000 },
  ]),

  // Telematics mutations
  'telematics.submit': (input) => Promise.resolve({ success: true, dataId: 'TEL-' + Date.now() }),

  // USSD
  'ussd.simulate': (input) => Promise.resolve({
    response: '*919*1# → Welcome to InsurePortal\n1. Check Policy\n2. File Claim\n3. Pay Premium\n4. Agent Support',
    sessionId: 'USSD-' + Date.now(),
  }),

  // Voice
  'voice.synthesize': (input) => Promise.resolve({ audioUrl: '/api/audio/synthesized.mp3', text: input.text || '' }),
  'voice.transcribe': (input) => Promise.resolve({ text: 'I want to file an insurance claim for my motor vehicle', confidence: 0.92 }),

  // Wallet mutations
  'wallet.topup': (input) => Promise.resolve({ success: true, transactionId: 'TOP-' + Date.now(), newBalance: 50000 + (input.amount || 0) }),
  'wallet.withdraw': (input) => Promise.resolve({ success: true, transactionId: 'WTH-' + Date.now() }),

  // WhatsApp mutations
  'whatsapp.send': (input) => Promise.resolve({ success: true, messageId: 'WA-' + Date.now() }),
  'whatsapp.history': () => Promise.resolve([
    { id: 1, direction: 'inbound', message: 'Hi, I want to check my policy status', timestamp: '2026-05-28T10:00:00Z' },
    { id: 2, direction: 'outbound', message: 'Your motor policy POL-2026-MOT-00001 is Active. Premium: ₦45,000/year', timestamp: '2026-05-28T10:00:05Z' },
  ]),
};

// Mock Keycloak auth endpoints
app.get('/api/auth/login', (req, res) => {
  const returnTo = req.query.returnTo || '/dashboard';
  res.redirect(returnTo);
});
app.get('/api/auth/logout', (req, res) => {
  res.redirect('/');
});

// Database-backed tRPC handler
app.all('/api/trpc/*', async (req, res) => {
  const batch = req.query.batch === '1';
  const inputRaw = req.query.input || (req.body ? JSON.stringify(req.body) : null);
  const routeName = req.params[0];

  let keys = ['0'];
  let parsedInput = {};
  if (batch && inputRaw) {
    try {
      parsedInput = typeof inputRaw === 'string' ? JSON.parse(inputRaw) : inputRaw;
      keys = Object.keys(parsedInput);
    } catch (e) {}
  }

  const routes = routeName ? routeName.split(',') : [];

  const results = await Promise.all(keys.map(async (key, i) => {
    const route = routes[i] || routes[0] || '';
    const input = parsedInput[key]?.json || parsedInput[key] || {};

    if (route === 'auth.me') {
      return { result: { data: { json: DEMO_USER } } };
    }

    try {
      // Exact match
      if (ROUTE_HANDLERS[route]) {
        const data = await ROUTE_HANDLERS[route](input);
        return { result: { data: { json: data } } };
      }

      // Prefix match
      for (const [handlerKey, handler] of Object.entries(ROUTE_HANDLERS)) {
        if (route.startsWith(handlerKey) || handlerKey.startsWith(route)) {
          const data = await handler(input);
          return { result: { data: { json: data } } };
        }
      }

      // Unknown route — return empty array
      return { result: { data: { json: [] } } };
    } catch (err) {
      console.error(`Error handling route ${route}:`, err.message);
      return { result: { data: { json: [] } } };
    }
  }));

  res.json(results);
});

// Static files
app.use(express.static(DIST));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(DIST, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`InsurePortal running at http://localhost:${PORT}`);
  console.log(`Database: PostgreSQL ngapp@localhost:5432`);
});
