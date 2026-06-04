const express = require('express');
const path = require('path');

const app = express();
const PORT = 5002;
const DIST = path.join(__dirname, 'dist', 'public');

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

// ========== COMPREHENSIVE MOCK DATA ==========
const MOCK_DATA = {
  // Dashboard
  'dashboard.stats': {
    totalPolicies: 12847, openClaims: 1293, premiumRevenue: 2400000000,
    lossRatio: 62.3, solvencyRatio: 185, naicomScore: 98.2, avgClaimTAT: 4.2,
    activePolicies: 12847, pendingClaims: 342, resolvedClaims: 951,
  },
  'dashboard.recentClaims': [
    { id: 'CLM-001', policyNumber: 'POL-2026-001', type: 'Motor', amount: 450000, status: 'Under Review', date: '2026-05-28' },
    { id: 'CLM-002', policyNumber: 'POL-2026-002', type: 'Health', amount: 180000, status: 'Approved', date: '2026-05-27' },
    { id: 'CLM-003', policyNumber: 'POL-2026-003', type: 'Property', amount: 2500000, status: 'Processing', date: '2026-05-26' },
  ],
  'dashboard.notifications': [],
  'dashboard.activity': [],

  // Products & Marketplace
  'products.list': [
    { id: 1, name: 'Motor Insurance', category: 'Motor', premium: 25000, description: 'Comprehensive motor vehicle coverage', status: 'active', coverageAmount: 5000000 },
    { id: 2, name: 'Health Insurance', category: 'Health', premium: 15000, description: 'Individual health coverage plan', status: 'active', coverageAmount: 2000000 },
    { id: 3, name: 'Property Insurance', category: 'Property', premium: 35000, description: 'Residential property coverage', status: 'active', coverageAmount: 10000000 },
    { id: 4, name: 'Life Insurance', category: 'Life', premium: 12000, description: 'Term life insurance coverage', status: 'active', coverageAmount: 20000000 },
    { id: 5, name: 'Marine Insurance', category: 'Marine', premium: 50000, description: 'Cargo and marine coverage', status: 'active', coverageAmount: 15000000 },
    { id: 6, name: 'Business Liability', category: 'Business', premium: 45000, description: 'Business liability coverage', status: 'active', coverageAmount: 25000000 },
  ],
  'products.getById': { id: 1, name: 'Motor Insurance', category: 'Motor', premium: 25000, description: 'Comprehensive motor vehicle coverage', status: 'active', coverageAmount: 5000000 },
  'marketplace.featured': [
    { id: 1, name: 'Motor Insurance', provider: 'InsurePortal', rating: 4.8, premium: 25000 },
    { id: 2, name: 'Health Insurance', provider: 'InsurePortal', rating: 4.6, premium: 15000 },
  ],
  'marketplace.categories': ['Motor', 'Health', 'Property', 'Life', 'Marine', 'Business', 'Agriculture', 'Takaful'],

  // Coverage & Premium
  'coverage.types': [
    { id: 'motor', name: 'Motor Vehicle', value: 'motor' },
    { id: 'health', name: 'Health', value: 'health' },
    { id: 'property', name: 'Property', value: 'property' },
    { id: 'life', name: 'Life', value: 'life' },
  ],
  'coverage.recommendations': [],
  'premium.calculate': { premium: 25000, coverageAmount: 5000000, deductible: 50000 },

  // Insurance Score
  'insuranceScore.get': { score: 780, maxScore: 1000, status: 'Good', lastUpdated: '2026-05-28', recommendations: ['Maintain claims-free record', 'Increase coverage duration', 'Bundle multiple policies'], factors: [
    { name: 'Claims History', score: 85, weight: 30 },
    { name: 'Payment History', score: 92, weight: 25 },
    { name: 'Coverage Duration', score: 78, weight: 20 },
    { name: 'Risk Profile', score: 70, weight: 25 },
  ]},
  'insuranceScore.improve': [
    { id: 1, suggestion: 'Bundle home and auto insurance', impact: 'High', potentialIncrease: 50 },
    { id: 2, suggestion: 'Install telematics device', impact: 'Medium', potentialIncrease: 30 },
  ],

  // Microinsurance
  'microinsurance.products': [
    { id: 1, name: 'Crop Protection Micro', premium: 500, coverage: 50000, duration: '3 months' },
    { id: 2, name: 'Health Micro', premium: 300, coverage: 25000, duration: '1 month' },
  ],

  // Parametric Insurance
  'parametric.products': [
    { id: 1, name: 'RainCash', trigger: 'Rainfall > 255mm/week', payout: 50000 },
    { id: 2, name: 'DroughtCash', trigger: 'Rainfall < 20mm/month', payout: 75000 },
  ],
  'parametric.triggers': [],

  // P2P Insurance
  'p2p.pools': [
    { id: 1, name: 'Motor Pool Lagos', members: 45, totalFund: 2250000 },
    { id: 2, name: 'Health Pool Abuja', members: 32, totalFund: 1600000 },
  ],

  // Gig Economy
  'gig.plans': [
    { id: 1, name: 'Ride-Share Coverage', premium: 5000, coverageType: 'Motor + Liability' },
    { id: 2, name: 'Delivery Driver Plan', premium: 3500, coverageType: 'Motor + Goods' },
  ],

  // SME Business
  'sme.products': [
    { id: 1, name: 'SME Comprehensive', premium: 45000, coverage: 25000000, category: 'Business' },
    { id: 2, name: 'Professional Liability', premium: 30000, coverage: 10000000, category: 'Liability' },
  ],

  // Digital Consumer Products
  'digital.products': [
    { id: 1, name: 'Gadget Insurance', premium: 5000, coverage: 500000 },
    { id: 2, name: 'Travel Insurance', premium: 8000, coverage: 2000000 },
  ],

  // Agricultural Insurance
  'agricultural.dashboard': {
    totalPolicies: 16174, totalPayouts: 260000000, activeProducts: 13,
    products: [
      { id: 1, name: 'ClimaCash RainCash', trigger: 'Rainfall > 255mm/week', payout: 50000 },
      { id: 2, name: 'Weather Index Crop', trigger: 'Multi-index', payout: 85000 },
    ],
  },
  'agricultural.products': [
    { id: 1, name: 'ClimaCash RainCash', type: 'Parametric', trigger: 'Rainfall > 255mm/week', payout: 50000 },
  ],
  'agricultural.underwriting': { rules: [], riskFactors: [] },

  // Takaful
  'takaful.products': [
    { id: 1, name: 'Family Takaful', contribution: 12000, coverage: 5000000 },
    { id: 2, name: 'General Takaful', contribution: 8000, coverage: 2000000 },
  ],

  // Policies
  'policies.list': [
    { id: 1, policyNumber: 'POL-2026-001', type: 'Motor', status: 'Active', premium: 25000, startDate: '2026-01-01', endDate: '2027-01-01', coverageAmount: 5000000 },
    { id: 2, policyNumber: 'POL-2026-002', type: 'Health', status: 'Active', premium: 15000, startDate: '2026-02-01', endDate: '2027-02-01', coverageAmount: 2000000 },
    { id: 3, policyNumber: 'POL-2026-003', type: 'Property', status: 'Pending Renewal', premium: 35000, startDate: '2025-06-01', endDate: '2026-06-01', coverageAmount: 10000000 },
  ],
  'policies.getById': { id: 1, policyNumber: 'POL-2026-001', type: 'Motor', status: 'Active', premium: 25000, startDate: '2026-01-01', endDate: '2027-01-01', coverageAmount: 5000000 },
  'policies.active': [
    { id: 1, policyNumber: 'POL-2026-001', type: 'Motor', status: 'Active', premium: 25000 },
    { id: 2, policyNumber: 'POL-2026-002', type: 'Health', status: 'Active', premium: 15000 },
  ],

  // Applications
  'applications.list': [
    { id: 1, applicationNumber: 'APP-2026-001', type: 'Motor', status: 'Under Review', date: '2026-05-20' },
  ],
  'applications.getById': { id: 1, applicationNumber: 'APP-2026-001', type: 'Motor', status: 'Under Review', date: '2026-05-20' },

  // Digital Wallet
  'wallet.balance': { balance: 125000, currency: 'NGN', transactions: [] },
  'wallet.transactions': [],

  // Policy Comparison
  'comparison.products': [
    { id: 1, name: 'Motor Basic', premium: 15000, coverage: 2000000, deductible: 25000, features: ['Third Party', 'Fire', 'Theft'] },
    { id: 2, name: 'Motor Comprehensive', premium: 25000, coverage: 5000000, deductible: 50000, features: ['Third Party', 'Fire', 'Theft', 'Own Damage', 'Windscreen'] },
  ],

  // Family Policies & Coverage
  'family.policies': [],
  'family.members': [
    { id: 1, name: 'Patrick Munis', relationship: 'Self', age: 35 },
    { id: 2, name: 'Sarah Munis', relationship: 'Spouse', age: 32 },
  ],
  'family.coverage': { totalCoverage: 7000000, members: 2 },

  // Policy Renewal
  'renewal.upcoming': [
    { id: 1, policyNumber: 'POL-2026-003', type: 'Property', expiryDate: '2026-06-01', premium: 35000 },
  ],

  // Claims
  'claims.list': [
    { id: 1, claimNumber: 'CLM-2026-001', policyNumber: 'POL-2026-001', type: 'Motor', amount: 450000, status: 'Under Review', filedDate: '2026-05-28', description: 'Vehicle collision on Third Mainland Bridge' },
    { id: 2, claimNumber: 'CLM-2026-002', policyNumber: 'POL-2026-002', type: 'Health', amount: 180000, status: 'Approved', filedDate: '2026-05-27', description: 'Hospital admission — Malaria treatment' },
  ],
  'claims.getById': { id: 1, claimNumber: 'CLM-2026-001', policyNumber: 'POL-2026-001', type: 'Motor', amount: 450000, status: 'Under Review', filedDate: '2026-05-28' },
  'claims.timeline': [
    { id: 1, event: 'Claim Filed', date: '2026-05-28', description: 'Claim CLM-2026-001 submitted' },
    { id: 2, event: 'Documents Received', date: '2026-05-28', description: 'Police report and photos uploaded' },
    { id: 3, event: 'Under Review', date: '2026-05-29', description: 'Assigned to adjuster' },
  ],
  'claims.evidence': [
    { id: 1, claimId: 'CLM-2026-001', type: 'Photo', filename: 'damage-front.jpg', uploadDate: '2026-05-28' },
    { id: 2, claimId: 'CLM-2026-001', type: 'Document', filename: 'police-report.pdf', uploadDate: '2026-05-28' },
  ],
  'claims.tracker': { claimId: 'CLM-2026-001', status: 'Under Review', progress: 40, steps: [
    { name: 'Filed', completed: true },
    { name: 'Documents', completed: true },
    { name: 'Review', completed: false },
    { name: 'Assessment', completed: false },
    { name: 'Settlement', completed: false },
  ]},

  // Emergency SOS
  'emergency.contacts': [
    { id: 1, name: 'Emergency Hotline', phone: '+234-800-INSURE-1', type: 'hotline' },
    { id: 2, name: 'Claims Support', phone: '+234-800-INSURE-2', type: 'claims' },
  ],
  'emergency.services': [
    { id: 1, name: 'Roadside Assistance', available: true },
    { id: 2, name: 'Medical Emergency', available: true },
    { id: 3, name: 'Fire Emergency', available: true },
  ],

  // Payments
  'payments.list': [
    { id: 1, amount: 25000, date: '2026-05-01', type: 'Premium', status: 'Completed', reference: 'PAY-2026-001' },
    { id: 2, amount: 15000, date: '2026-04-01', type: 'Premium', status: 'Completed', reference: 'PAY-2026-002' },
  ],
  'payments.methods': [
    { id: 1, type: 'Bank Transfer', provider: 'First Bank', last4: '4523', isDefault: true },
    { id: 2, type: 'Card', provider: 'Visa', last4: '7890', isDefault: false },
  ],

  // Savings & Investment
  'savings.balance': { totalSavings: 500000, investmentReturns: 35000 },
  'savings.plans': [
    { id: 1, name: 'Premium Savings', balance: 300000, returns: 8.5, type: 'savings', targetAmount: 500000, currentBalance: 300000, status: 'Active', startDate: '2026-01-01' },
    { id: 2, name: 'Investment Fund', balance: 200000, returns: 12.0, type: 'investment', targetAmount: 1000000, currentBalance: 200000, status: 'Active', startDate: '2025-06-01' },
  ],

  // Financial Wellness
  'financial.score': { score: 72, maxScore: 100, tips: ['Increase emergency fund', 'Review insurance coverage'] },
  'financial.insights': [],

  // Bancassurance
  'bancassurance.products': [
    { id: 1, name: 'Bank-Linked Motor', bank: 'First Bank', bankPartner: 'First Bank', premium: 22000, minDeposit: 5000, description: 'Comprehensive motor insurance via First Bank', value: 'firstbank-motor', productsOffered: ['Motor', 'Third Party'] },
    { id: 2, name: 'Bank-Linked Home', bank: 'GTBank', bankPartner: 'GTBank', premium: 30000, minDeposit: 10000, description: 'Home protection insurance through GTBank', value: 'gtbank-home', productsOffered: ['Home', 'Content'] },
  ],
  'bancassurance.partners': [
    { id: 1, name: 'First Bank', logo: '', products: 3 },
    { id: 2, name: 'GTBank', logo: '', products: 2 },
  ],

  // Credit Score
  'credit.score': { score: 720, maxScore: 850, factors: [] },
  'telco.creditScore': { score: 720, provider: 'MTN', lastUpdated: '2026-05-01' },

  // KYC
  'kyc.status': { status: 'Verified', level: 3, documents: [
    { type: 'NIN', status: 'Verified', date: '2026-01-15' },
    { type: 'BVN', status: 'Verified', date: '2026-01-15' },
    { type: 'Drivers License', status: 'Verified', date: '2026-01-15' },
  ]},

  // Blockchain
  'blockchain.transactions': [
    { id: 1, hash: '0x1234...abcd', type: 'Policy Created', date: '2026-05-28', status: 'Confirmed' },
  ],
  'blockchain.auditTrail': [],

  // Rewards & Loyalty
  'rewards.balance': { points: 15000, tier: 'Gold', nextTier: 'Platinum', pointsToNext: 5000 },
  'rewards.history': [
    { id: 1, action: 'Premium Payment', points: 250, date: '2026-05-01' },
    { id: 2, action: 'Referral Bonus', points: 500, date: '2026-04-15' },
  ],
  'rewards.achievements': [
    { id: 1, name: 'Early Bird', description: 'Paid premium on time for 6 months', earned: true },
    { id: 2, name: 'Referral Champion', description: 'Referred 5 friends', earned: false, progress: 60 },
  ],
  'loyalty.program': { tier: 'Gold', points: 15000, benefits: ['10% discount on renewals', 'Priority claims processing'] },
  'loyalty.tiers': [
    { name: 'Bronze', minPoints: 0, benefits: ['5% discount'] },
    { name: 'Silver', minPoints: 5000, benefits: ['7% discount', 'Free roadside assist'] },
    { name: 'Gold', minPoints: 10000, benefits: ['10% discount', 'Priority claims'] },
    { name: 'Platinum', minPoints: 20000, benefits: ['15% discount', 'Dedicated manager'] },
  ],
  'loyalty.rewards': [
    { id: 1, name: 'Premium Discount 10%', cost: 5000, category: 'Discount' },
    { id: 2, name: 'Free Health Checkup', cost: 3000, category: 'Health' },
  ],

  // Referrals
  'referral.stats': { totalReferrals: 8, successfulReferrals: 5, pendingRewards: 2500 },
  'referral.code': 'PATRICK-REF-2026',
  'referral.list': [
    { id: 1, name: 'John Doe', status: 'Active', reward: 500, date: '2026-04-10' },
    { id: 2, name: 'Jane Smith', status: 'Pending', reward: 0, date: '2026-05-20' },
  ],
  'referrals.list': [
    { id: 1, name: 'John Doe', status: 'Active', reward: 500, date: '2026-04-10' },
  ],

  // Reviews
  'reviews.list': [
    { id: 1, product: 'Motor Insurance', rating: 5, comment: 'Excellent coverage and fast claims', author: 'Patrick M.', date: '2026-05-15' },
    { id: 2, product: 'Health Insurance', rating: 4, comment: 'Good hospital network coverage', author: 'Sarah M.', date: '2026-04-20' },
  ],
  'reviews.summary': { averageRating: 4.5, totalReviews: 42 },

  // Communication
  'communication.messages': [
    { id: 1, subject: 'Policy Renewal Reminder', body: 'Your property insurance expires on June 1st', date: '2026-05-25', read: false },
  ],
  'communication.preferences': { email: true, sms: true, push: true, whatsapp: false },

  // WhatsApp
  'whatsapp.status': { connected: true, phone: '+234-803-XXX-XXXX' },
  'whatsapp.messages': [],

  // Insurance Literacy
  'literacy.articles': [
    { id: 1, title: 'Understanding Motor Insurance in Nigeria', category: 'Motor', readTime: '5 min' },
    { id: 2, title: 'NAICOM Regulations Explained', category: 'Compliance', readTime: '8 min' },
  ],

  // Health & Wellness
  'health.programs': [
    { id: 1, name: 'Annual Health Check', type: 'Checkup', discount: 15 },
    { id: 2, name: 'Wellness Rewards', type: 'Fitness', discount: 10 },
  ],

  // AI Advisor
  'ai.history': [],
  'ai.suggestions': [
    { id: 1, title: 'Increase life coverage', priority: 'High', reasoning: 'Growing family needs more protection' },
  ],

  // AI Claims
  'ai.claims': {
    pending: 2, automated: 15, avgProcessingTime: '2.4 hours',
    recentDecisions: [
      { id: 1, claimNumber: 'CLM-2026-004', decision: 'Auto-Approved', confidence: 95, amount: 25000 },
    ],
  },

  // Voice Assistant
  'voice.config': { enabled: true, language: 'en-NG' },

  // Document Scanner
  'document.scans': [],

  // Dynamic Pricing
  'pricing.models': [
    { id: 1, name: 'Usage-Based Motor', type: 'Telematics', basePrice: 15000 },
    { id: 2, name: 'Weather-Indexed Crop', type: 'Parametric', basePrice: 8000 },
  ],

  // AI Assistant / Chatbot
  'chatbot.config': { enabled: true, greeting: 'Hello! How can I help you with your insurance needs?' },

  // Risk Assessment
  'risk.assessment': { overallRisk: 'Medium', score: 45, factors: [
    { name: 'Claims Frequency', level: 'Low', score: 30 },
    { name: 'Coverage Gaps', level: 'Medium', score: 55 },
    { name: 'Payment History', level: 'Low', score: 20 },
  ]},
  'risk.mcmc': { convergence: true, iterations: 10000, results: [] },

  // Smart Claim Routing
  'routing.rules': [
    { id: 1, condition: 'Amount < 50000', action: 'Auto-approve', priority: 1 },
    { id: 2, condition: 'Amount > 1000000', action: 'Senior Adjuster', priority: 2 },
  ],

  // Churn Prediction
  'churn.predictions': [
    { id: 1, customerId: 'C-001', probability: 0.75, riskLevel: 'High', suggestedAction: 'Offer discount' },
    { id: 2, customerId: 'C-002', probability: 0.3, riskLevel: 'Low', suggestedAction: 'None' },
  ],

  // Model Security
  'model.security': { status: 'Healthy', lastAudit: '2026-05-20', vulnerabilities: 0 },

  // Fraud
  'fraud.alerts': [
    { id: 1, type: 'Suspicious Claim', severity: 'High', date: '2026-05-27', description: 'Multiple claims from same address' },
  ],
  'fraud.network': { nodes: [], edges: [] },

  // Insurance Radar
  'radar.insights': [
    { id: 1, title: 'Motor premiums trending up', category: 'Market', impact: 'Medium' },
  ],

  // Policy Approval
  'approval.queue': [
    { id: 1, applicationId: 'APP-2026-002', type: 'Motor', applicant: 'John Doe', amount: 25000, status: 'Pending' },
  ],

  // Knowledge Graph
  'knowledge.graph': { nodes: [], edges: [], stats: { totalNodes: 0, totalEdges: 0 } },

  // Agent Portal
  'agent.dashboard': { totalClients: 45, newApplications: 3, pendingRenewals: 7, commission: 125000 },
  'agent.clients': [
    { id: 1, name: 'Client Corp', policies: 3, premium: 125000, status: 'Active' },
  ],

  // Bancassurance Portal
  'bancassurance.dashboard': { totalPolicies: 1200, activeBanks: 5, monthlyPremium: 45000000 },

  // Embedded Insurance
  'embedded.partners': [
    { id: 1, name: 'E-Commerce Platform', type: 'Purchase Protection', policies: 450, status: 'Active', industry: 'E-Commerce', productsOffered: ['Purchase', 'Shipping'] },
    { id: 2, name: 'Ride-Hailing App', type: 'Trip Insurance', policies: 1200, status: 'Active', industry: 'Transport', productsOffered: ['Trip', 'Driver'] },
  ],
  'embedded.distribution': [],

  // NIIRA
  'niira.status': { registered: true, registrationId: 'NIIRA-2026-001', compulsoryProducts: 3 },

  // NAICOM Compliance
  'naicom.status': { compliant: true, score: 98.2, lastAudit: '2026-05-15', filings: [] },
  'compliance.status': { overall: 'Compliant', score: 98.2, items: [] },

  // Audit Trail
  'audit.trail': [
    { id: 1, action: 'Policy Created', user: 'admin', timestamp: '2026-05-28T10:00:00Z', details: 'POL-2026-004' },
  ],

  // USSD
  'ussd.sessions': [],
  'ussd.config': { shortCode: '*555#', active: true },

  // NMID
  'nmid.status': { integrated: true, lastSync: '2026-05-28' },

  // Actuarial
  'actuarial.models': [
    { id: 1, name: 'Motor Loss Model', type: 'GLM', lastRun: '2026-05-25', accuracy: 94.2 },
  ],
  'actuarial.reserves': { totalReserves: 15000000000, ibnr: 2500000000 },

  // Reinsurance
  'reinsurance.treaties': [
    { id: 1, name: 'Excess of Loss Treaty', reinsurer: 'Munich Re', limit: 50000000000, retention: 5000000000 },
  ],

  // Group Life
  'groupLife.schemes': [
    { id: 1, name: 'Corporate Life Plan A', members: 250, premium: 12000000, employer: 'Dangote Group' },
  ],

  // PFA Integration
  'pfa.status': { integrated: true, provider: 'ARM Pension', lastSync: '2026-05-28' },

  // InsureTech
  'insureTech.innovations': [
    { id: 1, name: 'AI Underwriting', status: 'Active', impact: 'High' },
    { id: 2, name: 'Blockchain Claims', status: 'Beta', impact: 'Medium' },
  ],

  // Telematics
  'telematics.data': {
    devices: 1250, activeDrivers: 980, avgScore: 78,
    recentTrips: [
      { id: 1, driver: 'Driver A', distance: 45, score: 85, date: '2026-05-28' },
    ],
  },
  'telematics.devices': [],

  // Geospatial
  'geospatial.data': { regions: [], riskZones: [], heatmap: [] },
  'geospatial.riskMap': { center: { lat: 9.0820, lng: 8.6753 }, zoom: 6, zones: [] },

  // Broker API
  'broker.apiKeys': [],
  'broker.documentation': { version: '2.0', endpoints: [] },

  // ERPNext
  'erpnext.status': { connected: true, lastSync: '2026-05-28' },

  // Agent Performance
  'agent.performance': {
    agents: [
      { id: 1, name: 'Agent Lagos', policies: 120, premium: 4500000, commission: 450000, rating: 4.8 },
      { id: 2, name: 'Agent Abuja', policies: 85, premium: 3200000, commission: 320000, rating: 4.5 },
    ],
    topPerformers: [],
  },

  // Customers
  'customers.list': [
    { id: 1, name: 'Patrick Munis', email: 'demo@insureportal.ng', policies: 3, totalPremium: 75000, status: 'Active' },
  ],

  // Commission
  'commission.summary': { totalEarned: 450000, pending: 75000, paid: 375000 },
  'commission.transactions': [],

  // Analytics
  'analytics.overview': { revenue: 2400000000, claims: 1293, policies: 12847, lossRatio: 62.3 },
  'analytics.charts': [],

  // Executive Dashboard
  'executive.kpis': {
    revenue: 2400000000, growthRate: 15.2, lossRatio: 62.3, customerRetention: 92.5,
    newPolicies: 1250, renewalRate: 87.3,
  },

  // Audit Logs
  'audit.logs': [
    { id: 1, action: 'Login', user: 'admin', timestamp: '2026-05-28T09:00:00Z', ip: '192.168.1.1' },
  ],

  // Operational Reports
  'reports.list': [
    { id: 1, name: 'Monthly Claims Report', type: 'Claims', date: '2026-05-01', status: 'Generated' },
  ],

  // Claims Adjudication
  'adjudication.queue': [
    { id: 1, claimNumber: 'CLM-2026-001', type: 'Motor', amount: 450000, priority: 'High' },
  ],

  // Policy Renewal Automation
  'automation.renewals': [
    { id: 1, policyNumber: 'POL-2026-003', type: 'Property', dueDate: '2026-06-01', autoRenew: true },
  ],

  // Agent Commission
  'agentCommission.summary': { total: 450000, pending: 75000, paid: 375000 },
  'agentCommission.details': [],

  // Batch Processing
  'batch.jobs': [
    { id: 1, name: 'Monthly Premium Collection', status: 'Completed', lastRun: '2026-05-01', records: 12500 },
  ],

  // Customer 360
  'customer360.profile': {
    id: 1, name: 'Patrick Munis', email: 'demo@insureportal.ng',
    policies: 3, claims: 2, totalPremium: 75000, ltv: 450000, riskScore: 'Low',
    interactions: [], preferences: {},
  },

  // Document Management
  'documents.list': [
    { id: 1, name: 'Motor Policy Document', type: 'PDF', size: '2.5MB', date: '2026-01-01' },
  ],

  // Customer Feedback
  'feedback.list': [
    { id: 1, customer: 'Patrick M.', rating: 5, comment: 'Great service', date: '2026-05-15' },
  ],

  // Multi-Currency
  'currency.rates': { NGN: 1, USD: 0.00065, GBP: 0.00052, EUR: 0.0006 },
  'currency.supported': ['NGN', 'USD', 'GBP', 'EUR'],

  // Bank Integrations
  'bank.integrations': [
    { id: 1, bank: 'First Bank', status: 'Connected', lastSync: '2026-05-28' },
  ],

  // Reconciliation
  'reconciliation.status': { lastRun: '2026-05-28', matched: 12400, unmatched: 47 },

  // Disaster Recovery
  'dr.status': { rpo: '1 hour', rto: '4 hours', lastBackup: '2026-05-28T08:00:00Z', backupStatus: 'Healthy' },

  // A/B Testing
  'abtesting.experiments': [
    { id: 1, name: 'Premium Page Layout', status: 'Running', variant: 'B', conversionRate: 12.5 },
  ],

  // Users / Admin
  'users.list': [
    { id: 1, name: 'Patrick Munis', email: 'demo@insureportal.ng', role: 'Admin', status: 'Active' },
    { id: 2, name: 'Agent Lagos', email: 'agent@insureportal.ng', role: 'Agent', status: 'Active' },
  ],
  'agents.list': [
    { id: 1, name: 'Agent Lagos', email: 'agent@insureportal.ng', region: 'Lagos', policies: 120, status: 'Active' },
    { id: 2, name: 'Amina Bello', email: 'amina@insureportal.ng', region: 'Abuja', policies: 145, status: 'Active' },
  ],
  'agents.performance': { totalAgents: 45, averageScore: 89.9, totalPoliciesSold: 3200 },
  'agents.commissions': [
    { id: 1, agentId: 1, amount: 250000, period: '2026-05', status: 'Paid' },
    { id: 2, agentId: 2, amount: 320000, period: '2026-05', status: 'Pending' },
  ],

  // Profile & Security
  'profile.get': DEMO_USER,
  'security.settings': { twoFactor: true, loginAlerts: true, sessionTimeout: 30 },

  // Settings
  'settings.get': { theme: 'light', language: 'en', notifications: true, currency: 'NGN' },

  // Rate Management
  'rate.management': {
    rates: [
      { id: 1, product: 'Motor', basePremium: 25000, riskFactor: 1.2, effectiveDate: '2026-01-01' },
    ],
  },

  // Onboarding
  'onboarding.steps': [
    { id: 1, name: 'Personal Details', completed: true },
    { id: 2, name: 'KYC Verification', completed: true },
    { id: 3, name: 'Product Selection', completed: false },
  ],

  // Performance Monitoring
  'performance.metrics': [
    { id: 1, name: 'API Response Time', value: 120, unit: 'ms', status: 'good', trend: 'stable' },
    { id: 2, name: 'Error Rate', value: 0.1, unit: '%', status: 'good', trend: 'improving' },
    { id: 3, name: 'Uptime', value: 99.9, unit: '%', status: 'good', trend: 'stable' },
    { id: 4, name: 'CPU Usage', value: 45, unit: '%', status: 'warning', trend: 'increasing' },
  ],

  // Gig Economy
  'gigEconomy.coverage': { id: 1, type: 'Comprehensive Gig Worker', provider: 'InsurePortal', status: 'active', premium: 15000, currency: 'NGN', startDate: '2026-01-01', endDate: '2026-12-31', description: 'Full coverage for gig economy workers' },

  // Model Security
  'modelSecurity.status': { overallScore: 85, lastScan: '2026-05-28T10:00:00Z', recommendations: ['Update model weights encryption', 'Add inference logging'], vulnerabilities: 2, patchesApplied: 15 },

  // Fraud Alerts
  'fraudAlerts.graph': { nodes: [{ id: 'N1', label: 'Claim CLM-001', type: 'claim', riskScore: 0.75 }, { id: 'N2', label: 'Customer C001', type: 'customer', riskScore: 0.3 }], edges: [{ source: 'N1', target: 'N2', weight: 0.8 }] },

  // Fraud Network
  'fraudNetwork.data': { nodes: [{ id: 'N1', label: 'Cluster A', type: 'cluster', riskScore: 0.82 }], edges: [{ source: 'N1', target: 'N1', weight: 0.5, type: 'self-loop' }] },
  'fraudNetwork.graph': { nodes: [{ id: 'N1', label: 'Claim CLM-001', type: 'claim', riskScore: 0.75 }, { id: 'N2', label: 'Customer C001', type: 'customer', riskScore: 0.3 }], edges: [{ source: 'N1', target: 'N2', weight: 0.8 }] },

  // Embedded Insurance
  'embeddedInsurance.partners': [
    { id: 1, name: 'TechCo Nigeria', industry: 'Technology', status: 'Active', productsOffered: ['Travel', 'Device'], integrationDate: '2025-06-01', revenue: 5000000 },
    { id: 2, name: 'AutoDeal Lagos', industry: 'Automotive', status: 'Active', productsOffered: ['Motor', 'GAP'], integrationDate: '2025-03-15', revenue: 8000000 },
  ],

  // Agent Performance
  'agentPerformance.list': [
    { id: 1, name: 'Amina Bello', email: 'amina@insureportal.ng', score: 92.5, policiesSold: 145, claimsProcessed: 38, revenue: 12000000, status: 'Active' },
    { id: 2, name: 'Chidi Okafor', email: 'chidi@insureportal.ng', score: 87.3, policiesSold: 120, claimsProcessed: 25, revenue: 9500000, status: 'Active' },
  ],
  'agentPerformance.metrics': { averageScore: 89.9, totalAgents: 45, activeAgents: 42, totalRevenue: 450000000 },

  // Telco Credit Scoring
  'telcoCreditScoring.score': { score: 720, maxScore: 850, tier: 'Good', recommendations: ['Maintain consistent data usage', 'Avoid late top-ups'], lastUpdated: '2026-05-28' },

  // Multi-Currency
  'currency.rates': [
    { currency: 'USD', rate: 1550.0, change: 0.2, symbol: '$' },
    { currency: 'GBP', rate: 1980.0, change: -0.1, symbol: '£' },
    { currency: 'EUR', rate: 1680.0, change: 0.3, symbol: '€' },
  ],
};

// Mock Keycloak auth endpoints
app.get('/api/auth/login', (req, res) => {
  const returnTo = req.query.returnTo || '/dashboard';
  res.redirect(returnTo);
});
app.get('/api/auth/logout', (req, res) => {
  res.redirect('/');
});

// Comprehensive tRPC mock — returns domain-specific data for each route
app.all('/api/trpc/*', (req, res) => {
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

  const results = keys.map((key, i) => {
    const route = routes[i] || routes[0] || '';
    
    if (route === 'auth.me') {
      return { result: { data: { json: DEMO_USER } } };
    }
    
    // Check for exact match first
    if (MOCK_DATA[route]) {
      return { result: { data: { json: MOCK_DATA[route] } } };
    }
    
    // Check for prefix match (e.g., "products.list" matches "products.list")
    for (const [key, value] of Object.entries(MOCK_DATA)) {
      if (route.startsWith(key) || key.startsWith(route)) {
        return { result: { data: { json: value } } };
      }
    }
    
    // Return empty array/object instead of null to prevent crashes
    return { result: { data: { json: [] } } };
  });

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
});
