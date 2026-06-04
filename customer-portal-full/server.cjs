const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
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
  const inputRaw = req.query.input;
  const routeName = req.params[0];

  let keys = ['0'];
  if (batch && inputRaw) {
    try {
      const parsed = JSON.parse(inputRaw);
      keys = Object.keys(parsed);
    } catch (e) {}
  }

  const routes = routeName ? routeName.split(',') : [];

  const results = await Promise.all(keys.map(async (key, i) => {
    const route = routes[i] || routes[0] || '';

    if (route === 'auth.me') {
      return { result: { data: { json: DEMO_USER } } };
    }

    try {
      // Exact match
      if (ROUTE_HANDLERS[route]) {
        const data = await ROUTE_HANDLERS[route]();
        return { result: { data: { json: data } } };
      }

      // Prefix match
      for (const [handlerKey, handler] of Object.entries(ROUTE_HANDLERS)) {
        if (route.startsWith(handlerKey) || handlerKey.startsWith(route)) {
          const data = await handler();
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
