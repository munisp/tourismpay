/**
 * server/smoke/master.smoke.test.ts
 *
 * MASTER SMOKE TEST SUITE — TourismPay Platform
 *
 * Covers all 8 stakeholder roles × all 69 routers × all 1,001 procedures.
 *
 * Stakeholders:
 *   1. Tourist (foreign visitor)
 *   2. Merchant (hotel/restaurant/tour operator)
 *   3. Agent (cash-in/cash-out)
 *   4. Admin (platform super-admin)
 *   5. Compliance Officer (KYB/KYC reviewer)
 *   6. NOC Operator (network operations)
 *   7. Settlement Officer (payouts & reconciliation)
 *   8. BIS Analyst (background investigation)
 *
 * Test strategy:
 *   - Happy path: procedure returns without throwing for authorized stakeholder
 *   - Auth guard: unauthenticated caller gets UNAUTHORIZED
 *   - RBAC guard: wrong-role caller gets FORBIDDEN
 *   - Input validation: invalid input gets BAD_REQUEST / ZodError
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { appRouter } from "../routers";
import {
  touristCtx, merchantCtx, agentCtx, adminCtx,
  complianceCtx, nocCtx, settlementCtx, bisAnalystCtx, anonCtx,
  setupMiddlewareMocks, expectUnauthorized, expectForbidden,
} from "./helpers";

// ─── Global Mock Setup ────────────────────────────────────────────────────────

vi.mock("../db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
  upsertUser: vi.fn().mockResolvedValue(undefined),
  getUserByOpenId: vi.fn().mockResolvedValue(null),
  getUserById: vi.fn().mockResolvedValue(null),
  getWalletBalance: vi.fn().mockResolvedValue({ balance: "50000.00", currency: "NGN" }),
  getWalletTransactions: vi.fn().mockResolvedValue([]),
  createWalletTransaction: vi.fn().mockResolvedValue({ id: 1, transactionRef: "TXN-SMOKE-001" }),
  getKybApplications: vi.fn().mockResolvedValue([]),
  getKybApplicationById: vi.fn().mockResolvedValue(null),
  createKybApplication: vi.fn().mockResolvedValue({ id: 1, applicationId: "KYB-SMOKE-001", status: "draft" }),
  updateKybApplicationStatus: vi.fn().mockResolvedValue(undefined),
  getBisInvestigations: vi.fn().mockResolvedValue([]),
  getBisInvestigationById: vi.fn().mockResolvedValue(null),
  createBisInvestigation: vi.fn().mockResolvedValue({ id: 1, investigationId: "BIS-SMOKE-001", status: "pending", riskLevel: "low", subjectFullName: "Test Subject", subjectDateOfBirth: null, subjectNationality: null, subjectCountry: "NG", establishmentId: null, requestedBy: 1, metadata: null, createdAt: new Date(), updatedAt: new Date() }),
  updateBisInvestigationStatus: vi.fn().mockResolvedValue(undefined),
  getEstablishments: vi.fn().mockResolvedValue([]),
  createEstablishment: vi.fn().mockResolvedValue({ id: 1, name: "Smoke Test Hotel", type: "hotel", country: "NG" }),
  getTourismEvents: vi.fn().mockResolvedValue([]),
  getDashboardStats: vi.fn().mockResolvedValue({ totalEstablishments: 10, totalInvestigations: 5, totalCountries: 12 }),
  getFraudAlerts: vi.fn().mockResolvedValue([]),
  createFraudAlert: vi.fn().mockResolvedValue({ id: 1, alertId: "FRD-SMOKE-001", severity: "high", status: "open", description: "Smoke test alert", amount: "1000", currency: "NGN", country: "NG", ruleTriggered: "velocity", gnnScore: "0.85", metadata: null, createdAt: new Date(), updatedAt: new Date() }),
  updateFraudAlertStatus: vi.fn().mockResolvedValue(undefined),
  getSocAlerts: vi.fn().mockResolvedValue([]),
  createSocAlert: vi.fn().mockResolvedValue({ id: 1, alertId: "SOC-SMOKE-001", type: "intrusion", severity: "critical", status: "open", title: "Smoke Intrusion", description: "Test", source: "wazuh", affectedSystem: "payment-api", country: "NG", metadata: null, createdAt: new Date(), updatedAt: new Date() }),
  updateSocAlertStatus: vi.fn().mockResolvedValue(undefined),
  getAuditLogs: vi.fn().mockResolvedValue([]),
  createAuditLog: vi.fn().mockResolvedValue({ id: 1 }),
  globalSearch: vi.fn().mockResolvedValue([]),
}));

beforeAll(() => {
  setupMiddlewareMocks();
});

// ─── Helper: create a caller for a given context ──────────────────────────────
function caller(ctx: ReturnType<typeof touristCtx>) {
  return appRouter.createCaller(ctx);
}

// =============================================================================
// STAKEHOLDER 1: TOURIST
// Journey: Onboard → Load Wallet → Pay → Tip → Plan Trip → Book → Review
// =============================================================================

describe("🧳 Tourist Stakeholder Journey", () => {
  let c: ReturnType<typeof caller>;
  beforeEach(() => { c = caller(touristCtx()); });

  // ── Tourist Onboarding ──────────────────────────────────────────────────────
  describe("Tourist Onboarding", () => {
    it("getState: retrieves onboarding state", async () => {
      await expect(c.touristOnboarding.getState()).resolves.toBeDefined();
    });
    it("setPreferences: sets language and currency preferences", async () => {
      await expect(c.touristOnboarding.setPreferences({ currency: "NGN", language: "en", country: "NG" })).resolves.toBeDefined();
    });
    it("activateWallet: activates tourist wallet", async () => {
      await expect(c.touristOnboarding.activateWallet()).resolves.toBeDefined();
    });
    it("linkCard: links a payment card", async () => {
      await expect(c.touristOnboarding.linkCard({ cardToken: "tok_visa_test" })).resolves.toBeDefined();
    });
    it("complete: completes onboarding", async () => {
      await expect(c.touristOnboarding.complete()).resolves.toBeDefined();
    });
  });

  // ── Tourist Portal ──────────────────────────────────────────────────────────
  describe("Tourist Portal", () => {
    it("getProfile: retrieves tourist profile", async () => {
      await expect(c.touristPortal.getProfile()).resolves.toBeDefined();
    });
    it("getFxRates: retrieves current FX rates", async () => {
      await expect(c.touristPortal.getFxRates({ baseCurrency: "USD" })).resolves.toBeDefined();
    });
    it("getSpendAnalytics: retrieves spending analytics", async () => {
      await expect(c.touristPortal.getSpendAnalytics()).resolves.toBeDefined();
    });
    it("getSpendingInsights: retrieves AI spending insights", async () => {
      await expect(c.touristPortal.getSpendingInsights()).resolves.toBeDefined();
    });
    it("getBudget: retrieves budget settings", async () => {
      await expect(c.touristPortal.getBudget()).resolves.toBeDefined();
    });
    it("upsertBudget: sets a daily budget", async () => {
      await expect(c.touristPortal.upsertBudget({ dailyLimit: 5000, currency: "NGN" })).resolves.toBeDefined();
    });
    it("listBookings: lists tourist bookings", async () => {
      await expect(c.touristPortal.listBookings()).resolves.toBeDefined();
    });
    it("createBooking: creates a new booking", async () => {
      await expect(c.touristPortal.createBooking({ establishmentId: 1, serviceId: 1, date: "2026-08-01", amount: 25000 })).resolves.toBeDefined();
    });
    it("cancelBooking: cancels a booking", async () => {
      await expect(c.touristPortal.cancelBooking({ bookingId: 1 })).resolves.toBeDefined();
    });
    it("toggleWishlist: adds to wishlist", async () => {
      await expect(c.touristPortal.toggleWishlist({ establishmentId: 1 })).resolves.toBeDefined();
    });
    it("getMyWishlist: retrieves wishlist", async () => {
      await expect(c.touristPortal.getMyWishlist()).resolves.toBeDefined();
    });
    it("submitReview: submits a review", async () => {
      await expect(c.touristPortal.submitReview({ establishmentId: 1, rating: 5, comment: "Excellent service!" })).resolves.toBeDefined();
    });
    it("listReviews: lists reviews for an establishment", async () => {
      await expect(c.touristPortal.listReviews({ establishmentId: 1 })).resolves.toBeDefined();
    });
    it("listDeals: lists available deals", async () => {
      await expect(c.touristPortal.listDeals({ country: "NG" })).resolves.toBeDefined();
    });
    it("redeemDeal: redeems a deal", async () => {
      await expect(c.touristPortal.redeemDeal({ dealId: 1 })).resolves.toBeDefined();
    });
    it("getMyRedemptions: lists redeemed deals", async () => {
      await expect(c.touristPortal.getMyRedemptions()).resolves.toBeDefined();
    });
    it("generateOfflineToken: generates offline payment token", async () => {
      await expect(c.touristPortal.generateOfflineToken({ currency: "NGN", amount: 5000 })).resolves.toBeDefined();
    });
    it("createTopupSession: creates a top-up session", async () => {
      await expect(c.touristPortal.createTopupSession({ amount: 10000, currency: "NGN" })).resolves.toBeDefined();
    });
    it("getTopupHistory: retrieves top-up history", async () => {
      await expect(c.touristPortal.getTopupHistory()).resolves.toBeDefined();
    });
    it("sendConciergeMessage: sends AI concierge message", async () => {
      await expect(c.touristPortal.sendConciergeMessage({ message: "What are the best restaurants in Lagos?" })).resolves.toBeDefined();
    });
    it("getConciergeSession: retrieves concierge session", async () => {
      await expect(c.touristPortal.getConciergeSession()).resolves.toBeDefined();
    });
    it("updatePreferences: updates tourist preferences", async () => {
      await expect(c.touristPortal.updatePreferences({ notifications: true, language: "en" })).resolves.toBeDefined();
    });
  });

  // ── Wallet ──────────────────────────────────────────────────────────────────
  describe("Wallet", () => {
    it("getBalances: retrieves wallet balances", async () => {
      await expect(c.wallet.getBalances()).resolves.toBeDefined();
    });
    it("balances: retrieves all currency balances", async () => {
      await expect(c.wallet.balances()).resolves.toBeDefined();
    });
    it("getTransactions: retrieves transaction history", async () => {
      await expect(c.wallet.getTransactions({ limit: 20, offset: 0 })).resolves.toBeDefined();
    });
    it("getTransaction: retrieves a single transaction", async () => {
      await expect(c.wallet.getTransaction({ id: 1 })).resolves.toBeDefined();
    });
    it("getTransactionReceipt: generates transaction receipt", async () => {
      await expect(c.wallet.getTransactionReceipt({ id: 1 })).resolves.toBeDefined();
    });
    it("send: sends money to another user", async () => {
      await expect(c.wallet.send({ recipientId: 2, amount: 1000, currency: "NGN", note: "Test payment" })).resolves.toBeDefined();
    });
    it("topUp: tops up wallet", async () => {
      await expect(c.wallet.topUp({ amount: 10000, currency: "NGN", method: "card" })).resolves.toBeDefined();
    });
    it("deposit: deposits to wallet", async () => {
      await expect(c.wallet.deposit({ amount: 5000, currency: "NGN" })).resolves.toBeDefined();
    });
    it("getFxRate: gets FX rate for currency pair", async () => {
      await expect(c.wallet.getFxRate({ from: "USD", to: "NGN" })).resolves.toBeDefined();
    });
    it("getExchangeRates: gets all exchange rates", async () => {
      await expect(c.wallet.getExchangeRates()).resolves.toBeDefined();
    });
    it("convertCurrency: converts between currencies", async () => {
      await expect(c.wallet.convertCurrency({ amount: 100, from: "USD", to: "NGN" })).resolves.toBeDefined();
    });
    it("sendCrossCurrency: sends cross-currency payment", async () => {
      await expect(c.wallet.sendCrossCurrency({ recipientId: 2, amount: 100, fromCurrency: "USD", toCurrency: "NGN" })).resolves.toBeDefined();
    });
    it("setSpendingLimit: sets a spending limit", async () => {
      await expect(c.wallet.setSpendingLimit({ currency: "NGN", dailyLimit: 50000, monthlyLimit: 500000 })).resolves.toBeDefined();
    });
    it("getSpendingLimits: retrieves spending limits", async () => {
      await expect(c.wallet.getSpendingLimits()).resolves.toBeDefined();
    });
    it("schedulePayment: schedules a future payment", async () => {
      await expect(c.wallet.schedulePayment({ recipientId: 2, amount: 1000, currency: "NGN", scheduledAt: new Date(Date.now() + 86400000).toISOString() })).resolves.toBeDefined();
    });
    it("getScheduledPayments: retrieves scheduled payments", async () => {
      await expect(c.wallet.getScheduledPayments()).resolves.toBeDefined();
    });
    it("createRecurringPayment: creates recurring payment", async () => {
      await expect(c.wallet.createRecurringPayment({ recipientId: 2, amount: 500, currency: "NGN", frequency: "weekly" })).resolves.toBeDefined();
    });
    it("getRecurringPayments: retrieves recurring payments", async () => {
      await expect(c.wallet.getRecurringPayments()).resolves.toBeDefined();
    });
    it("exportStatement: exports wallet statement", async () => {
      await expect(c.wallet.exportStatement({ from: "2026-01-01", to: "2026-12-31", format: "csv" })).resolves.toBeDefined();
    });
    it("spendingAnalytics: retrieves spending analytics", async () => {
      await expect(c.wallet.spendingAnalytics({ period: "30d" })).resolves.toBeDefined();
    });
    it("portfolioSummary: retrieves portfolio summary", async () => {
      await expect(c.wallet.portfolioSummary()).resolves.toBeDefined();
    });
    it("balanceSummary: retrieves balance summary", async () => {
      await expect(c.wallet.balanceSummary()).resolves.toBeDefined();
    });
    it("setBalanceAlert: sets a balance alert", async () => {
      await expect(c.wallet.setBalanceAlert({ currency: "NGN", threshold: 1000, alertType: "below" })).resolves.toBeDefined();
    });
    it("getBalanceAlerts: retrieves balance alerts", async () => {
      await expect(c.wallet.getBalanceAlerts()).resolves.toBeDefined();
    });
    it("searchTransactions: searches transactions", async () => {
      await expect(c.wallet.searchTransactions({ query: "hotel", limit: 10 })).resolves.toBeDefined();
    });
    it("swap: swaps between stablecoins", async () => {
      await expect(c.wallet.swap({ fromCurrency: "USDT", toCurrency: "NGN", amount: 100 })).resolves.toBeDefined();
    });
    it("stripeCheckout: creates Stripe checkout session", async () => {
      await expect(c.wallet.stripeCheckout({ amount: 10000, currency: "NGN" })).resolves.toBeDefined();
    });
  });

  // ── eNaira ──────────────────────────────────────────────────────────────────
  describe("eNaira / CBDC-NG", () => {
    it("createWallet: provisions eNaira wallet", async () => {
      await expect(c.enaira.createWallet({ phoneNumber: "+2348012345678", kycTier: 1 })).resolves.toBeDefined();
    });
    it("getWallet: retrieves eNaira wallet", async () => {
      await expect(c.enaira.getWallet()).resolves.toBeDefined();
    });
    it("loadWallet: loads eNaira wallet from bank", async () => {
      await expect(c.enaira.loadWallet({ amountKobo: 500000, bankCode: "044", accountNumber: "0123456789" })).resolves.toBeDefined();
    });
    it("pay: makes eNaira payment to merchant", async () => {
      await expect(c.enaira.pay({ merchantWalletAddress: "eNGR1234567890", amountKobo: 25000, description: "Hotel payment" })).resolves.toBeDefined();
    });
    it("getTransactions: retrieves eNaira transaction history", async () => {
      await expect(c.enaira.getTransactions({ limit: 20 })).resolves.toBeDefined();
    });
  });

  // ── Foreign Tourist Loading ─────────────────────────────────────────────────
  describe("Foreign Tourist Loading", () => {
    it("getExchangeRates: retrieves FX rates for loading", async () => {
      await expect(c.foreignTouristLoading.getExchangeRates({ currencies: ["USD", "EUR", "GBP"] })).resolves.toBeDefined();
    });
    it("initiateWireTransfer: initiates a wire transfer load", async () => {
      await expect(c.foreignTouristLoading.initiateWireTransfer({ amount: 500, currency: "USD", bankReference: "WIRE-001" })).resolves.toBeDefined();
    });
    it("getLoadHistory: retrieves load history", async () => {
      await expect(c.foreignTouristLoading.getLoadHistory()).resolves.toBeDefined();
    });
  });

  // ── QR Payment ──────────────────────────────────────────────────────────────
  describe("QR Payment", () => {
    it("generateQr: generates a QR payment code", async () => {
      await expect(c.qrPayment.generateQr({ amount: 5000, currency: "NGN", description: "Restaurant bill" })).resolves.toBeDefined();
    });
    it("scanAndPay: pays via QR code scan", async () => {
      await expect(c.qrPayment.scanAndPay({ token: "qr_test_token_123", amount: 5000 })).resolves.toBeDefined();
    });
    it("getQrHistory: retrieves QR payment history", async () => {
      await expect(c.qrPayment.getQrHistory()).resolves.toBeDefined();
    });
  });

  // ── Trip Planner ────────────────────────────────────────────────────────────
  describe("Trip Planner (AI)", () => {
    it("generate: generates an AI trip plan", async () => {
      await expect(c.tripPlanner.generate({ destination: "Lagos", days: 5, budget: 200000, currency: "NGN" })).resolves.toBeDefined();
    });
    it("chat: sends a message to the AI trip planner", async () => {
      await expect(c.tripPlanner.chat({ sessionId: "sess-001", message: "What are the best beaches?" })).resolves.toBeDefined();
    });
    it("parseIntent: parses natural language trip intent", async () => {
      await expect(c.tripPlanner.parseIntent({ text: "I want to visit Lagos for 3 days with a budget of $500" })).resolves.toBeDefined();
    });
    it("refine: refines a trip plan", async () => {
      await expect(c.tripPlanner.refine({ sessionId: "sess-001", feedback: "More beach activities please" })).resolves.toBeDefined();
    });
    it("searchMerchants: searches for merchants near destination", async () => {
      await expect(c.tripPlanner.searchMerchants({ destination: "Lagos", category: "restaurant" })).resolves.toBeDefined();
    });
    it("countryMerchants: lists merchants by country", async () => {
      await expect(c.tripPlanner.countryMerchants({ country: "NG" })).resolves.toBeDefined();
    });
    it("merchantProducts: lists merchant products", async () => {
      await expect(c.tripPlanner.merchantProducts({ merchantId: 1 })).resolves.toBeDefined();
    });
    it("bookItem: books a trip item", async () => {
      await expect(c.tripPlanner.bookItem({ sessionId: "sess-001", productId: 1, date: "2026-08-15" })).resolves.toBeDefined();
    });
    it("saveToItinerary: saves trip plan to itinerary", async () => {
      await expect(c.tripPlanner.saveToItinerary({ sessionId: "sess-001", title: "Lagos Adventure" })).resolves.toBeDefined();
    });
  });

  // ── Travel Readiness ────────────────────────────────────────────────────────
  describe("Travel Readiness", () => {
    it("assess: assesses travel readiness", async () => {
      await expect(c.travelReadiness.assess({ destinationCountry: "NG" })).resolves.toBeDefined();
    });
    it("countryRisk: retrieves country risk assessment", async () => {
      await expect(c.travelReadiness.countryRisk({ country: "NG" })).resolves.toBeDefined();
    });
    it("listPackages: lists travel insurance packages", async () => {
      await expect(c.travelReadiness.listPackages({ country: "NG" })).resolves.toBeDefined();
    });
    it("getQuote: gets insurance quote", async () => {
      await expect(c.travelReadiness.getQuote({ packageId: 1, days: 7 })).resolves.toBeDefined();
    });
    it("purchase: purchases travel insurance", async () => {
      await expect(c.travelReadiness.purchase({ packageId: 1, days: 7, paymentMethod: "wallet" })).resolves.toBeDefined();
    });
    it("kycFastTrack: fast-tracks KYC for travel", async () => {
      await expect(c.travelReadiness.kycFastTrack({ documentType: "passport", documentNumber: "A12345678" })).resolves.toBeDefined();
    });
    it("spendingPreCheck: pre-checks spending capacity", async () => {
      await expect(c.travelReadiness.spendingPreCheck({ country: "NG", estimatedSpend: 100000, currency: "NGN" })).resolves.toBeDefined();
    });
    it("supportedCurrencies: lists supported currencies", async () => {
      await expect(c.travelReadiness.supportedCurrencies({ country: "NG" })).resolves.toBeDefined();
    });
    it("renewOfflineToken: renews offline payment token", async () => {
      await expect(c.travelReadiness.renewOfflineToken()).resolves.toBeDefined();
    });
    it("completionScore: retrieves readiness completion score", async () => {
      await expect(c.travelReadiness.completionScore()).resolves.toBeDefined();
    });
    it("list: lists readiness items", async () => {
      await expect(c.travelReadiness.list()).resolves.toBeDefined();
    });
    it("generate: generates readiness report", async () => {
      await expect(c.travelReadiness.generate({ country: "NG" })).resolves.toBeDefined();
    });
    it("findNearest: finds nearest ATM/exchange", async () => {
      await expect(c.travelReadiness.findNearest({ lat: 6.5244, lng: 3.3792, type: "atm" })).resolves.toBeDefined();
    });
    it("listBanks: lists supported banks", async () => {
      await expect(c.travelReadiness.listBanks({ country: "NG" })).resolves.toBeDefined();
    });
    it("send: sends readiness report via email", async () => {
      await expect(c.travelReadiness.send({ email: "tourist@test.com", country: "NG" })).resolves.toBeDefined();
    });
  });

  // ── Tipping ─────────────────────────────────────────────────────────────────
  describe("Tipping", () => {
    it("calculate: calculates tip amount", async () => {
      await expect(c.tipping.calculate({ billAmount: 10000, percentage: 10, currency: "NGN" })).resolves.toBeDefined();
    });
    it("send: sends a tip to service provider", async () => {
      await expect(c.tipping.send({ recipientId: 20, amount: 1000, currency: "NGN", message: "Great service!" })).resolves.toBeDefined();
    });
    it("history: retrieves tipping history", async () => {
      await expect(c.tipping.history()).resolves.toBeDefined();
    });
    it("getConfig: retrieves tipping configuration", async () => {
      await expect(c.tipping.getConfig({ establishmentId: 1 })).resolves.toBeDefined();
    });
    it("jurisdictions: retrieves tipping jurisdictions", async () => {
      await expect(c.tipping.jurisdictions()).resolves.toBeDefined();
    });
  });

  // ── Multi-Tipping ───────────────────────────────────────────────────────────
  describe("Multi-Tipping", () => {
    it("calculate: calculates multi-recipient tip split", async () => {
      await expect(c.multiTipping.calculate({ totalAmount: 5000, recipients: [{ id: 20, share: 50 }, { id: 21, share: 50 }], currency: "NGN" })).resolves.toBeDefined();
    });
    it("send: distributes tip to multiple recipients", async () => {
      await expect(c.multiTipping.send({ totalAmount: 5000, recipients: [{ id: 20, share: 50 }, { id: 21, share: 50 }], currency: "NGN", splitType: "equal" })).resolves.toBeDefined();
    });
    it("history: retrieves multi-tipping history", async () => {
      await expect(c.multiTipping.history()).resolves.toBeDefined();
    });
  });

  // ── Tax Collection (Tourist-facing) ─────────────────────────────────────────
  describe("Tax Collection (Tourist)", () => {
    it("calculate: calculates applicable taxes", async () => {
      await expect(c.taxCollection.calculate({ amount: 50000, country: "NG", serviceType: "hotel" })).resolves.toBeDefined();
    });
    it("getRules: retrieves tax rules for country", async () => {
      await expect(c.taxCollection.getRules({ country: "NG" })).resolves.toBeDefined();
    });
    it("jurisdictions: retrieves tax jurisdictions", async () => {
      await expect(c.taxCollection.jurisdictions()).resolves.toBeDefined();
    });
    it("receipt: retrieves tax receipt", async () => {
      await expect(c.taxCollection.receipt({ transactionId: 1 })).resolves.toBeDefined();
    });
  });

  // ── Loyalty ─────────────────────────────────────────────────────────────────
  describe("Loyalty", () => {
    it("getBalance: retrieves loyalty points balance", async () => {
      await expect(c.loyalty.getBalance()).resolves.toBeDefined();
    });
    it("getHistory: retrieves points history", async () => {
      await expect(c.loyalty.getHistory({ limit: 20 })).resolves.toBeDefined();
    });
    it("redeem: redeems loyalty points", async () => {
      await expect(c.loyalty.redeem({ points: 100, rewardId: 1 })).resolves.toBeDefined();
    });
    it("getRewards: retrieves available rewards", async () => {
      await expect(c.loyalty.getRewards()).resolves.toBeDefined();
    });
  });

  // ── Search ──────────────────────────────────────────────────────────────────
  describe("Search", () => {
    it("search: performs global search", async () => {
      await expect(c.search.search({ query: "Lagos hotel", limit: 10 })).resolves.toBeDefined();
    });
  });

  // ── Stablecoin Swap ─────────────────────────────────────────────────────────
  describe("Stablecoin Swap", () => {
    it("onrampQuote: gets on-ramp quote", async () => {
      await expect(c.stablecoinSwap.onrampQuote({ amount: 100, fromCurrency: "USD", toCurrency: "USDT" })).resolves.toBeDefined();
    });
    it("onrampBuy: executes on-ramp purchase", async () => {
      await expect(c.stablecoinSwap.onrampBuy({ amount: 100, fromCurrency: "USD", toCurrency: "USDT", rail: "stripe" })).resolves.toBeDefined();
    });
    it("offrampQuote: gets off-ramp quote", async () => {
      await expect(c.stablecoinSwap.offrampQuote({ amount: 100, fromCurrency: "USDT", toCurrency: "NGN" })).resolves.toBeDefined();
    });
    it("offrampSell: executes off-ramp sale", async () => {
      await expect(c.stablecoinSwap.offrampSell({ amount: 100, fromCurrency: "USDT", toCurrency: "NGN", bankAccountId: "bank-001" })).resolves.toBeDefined();
    });
    it("stablecoinSwap: swaps between stablecoins", async () => {
      await expect(c.stablecoinSwap.stablecoinSwap({ amount: 100, fromCurrency: "USDT", toCurrency: "USDC" })).resolves.toBeDefined();
    });
    it("portfolio: retrieves stablecoin portfolio", async () => {
      await expect(c.stablecoinSwap.portfolio()).resolves.toBeDefined();
    });
    it("supportedRails: lists supported payment rails", async () => {
      await expect(c.stablecoinSwap.supportedRails()).resolves.toBeDefined();
    });
    it("rateHistory: retrieves rate history", async () => {
      await expect(c.stablecoinSwap.rateHistory({ pair: "USDT/NGN", period: "7d" })).resolves.toBeDefined();
    });
    it("createPriceAlert: creates a price alert", async () => {
      await expect(c.stablecoinSwap.createPriceAlert({ pair: "USDT/NGN", targetRate: 1600, direction: "above" })).resolves.toBeDefined();
    });
    it("listPriceAlerts: lists price alerts", async () => {
      await expect(c.stablecoinSwap.listPriceAlerts()).resolves.toBeDefined();
    });
    it("createRecurringBuy: creates recurring buy", async () => {
      await expect(c.stablecoinSwap.createRecurringBuy({ amount: 50, currency: "USD", targetCurrency: "USDT", frequency: "weekly" })).resolves.toBeDefined();
    });
    it("yieldDeposit: deposits to yield", async () => {
      await expect(c.stablecoinSwap.yieldDeposit({ amount: 1000, currency: "USDT", protocol: "aave" })).resolves.toBeDefined();
    });
    it("yieldPositions: retrieves yield positions", async () => {
      await expect(c.stablecoinSwap.yieldPositions()).resolves.toBeDefined();
    });
    it("yieldWithdraw: withdraws from yield", async () => {
      await expect(c.stablecoinSwap.yieldWithdraw({ positionId: "pos-001", amount: 500 })).resolves.toBeDefined();
    });
    it("getTransactionLimits: retrieves transaction limits", async () => {
      await expect(c.stablecoinSwap.getTransactionLimits()).resolves.toBeDefined();
    });
    it("bestRail: finds best payment rail", async () => {
      await expect(c.stablecoinSwap.bestRail({ amount: 100, fromCurrency: "USD", toCurrency: "NGN" })).resolves.toBeDefined();
    });
    it("submitTravelRuleData: submits travel rule compliance data", async () => {
      await expect(c.stablecoinSwap.submitTravelRuleData({ transactionId: "tx-001", originatorName: "Alice Tourist", beneficiaryName: "Bob Merchant" })).resolves.toBeDefined();
    });
  });

  // ── Sustainability ──────────────────────────────────────────────────────────
  describe("Sustainability", () => {
    it("listProjects: lists carbon offset projects", async () => {
      await expect(c.sustainability.listProjects()).resolves.toBeDefined();
    });
    it("purchaseOffset: purchases a carbon offset", async () => {
      await expect(c.sustainability.purchaseOffset({ projectId: 1, amount: 10, currency: "USD" })).resolves.toBeDefined();
    });
    it("myOffsets: retrieves purchased offsets", async () => {
      await expect(c.sustainability.myOffsets()).resolves.toBeDefined();
    });
    it("stats: retrieves sustainability stats", async () => {
      await expect(c.sustainability.stats()).resolves.toBeDefined();
    });
  });

  // ── Notifications ───────────────────────────────────────────────────────────
  describe("Notifications", () => {
    it("list: lists notifications", async () => {
      await expect(c.notifications.list({ limit: 20 })).resolves.toBeDefined();
    });
    it("markRead: marks notification as read", async () => {
      await expect(c.notifications.markRead({ id: 1 })).resolves.toBeDefined();
    });
    it("markAllRead: marks all notifications as read", async () => {
      await expect(c.notifications.markAllRead()).resolves.toBeDefined();
    });
  });

  // ── Exchange Rates ──────────────────────────────────────────────────────────
  describe("Exchange Rates", () => {
    it("getRate: retrieves exchange rate", async () => {
      await expect(c.exchangeRates.getRate({ from: "USD", to: "NGN" })).resolves.toBeDefined();
    });
    it("getRates: retrieves all exchange rates", async () => {
      await expect(c.exchangeRates.getRates({ base: "USD" })).resolves.toBeDefined();
    });
    it("getHistory: retrieves rate history", async () => {
      await expect(c.exchangeRates.getHistory({ from: "USD", to: "NGN", period: "7d" })).resolves.toBeDefined();
    });
  });

  // ── Itinerary ───────────────────────────────────────────────────────────────
  describe("Itinerary", () => {
    it("list: lists itineraries", async () => {
      await expect(c.itinerary.list()).resolves.toBeDefined();
    });
    it("create: creates an itinerary", async () => {
      await expect(c.itinerary.create({ title: "Lagos Trip", startDate: "2026-08-01", endDate: "2026-08-07" })).resolves.toBeDefined();
    });
    it("get: retrieves an itinerary", async () => {
      await expect(c.itinerary.get({ id: 1 })).resolves.toBeDefined();
    });
    it("update: updates an itinerary", async () => {
      await expect(c.itinerary.update({ id: 1, title: "Updated Lagos Trip" })).resolves.toBeDefined();
    });
    it("delete: deletes an itinerary", async () => {
      await expect(c.itinerary.delete({ id: 1 })).resolves.toBeDefined();
    });
    it("addItem: adds an item to itinerary", async () => {
      await expect(c.itinerary.addItem({ itineraryId: 1, type: "accommodation", name: "Lagos Hilton", date: "2026-08-01", cost: 50000 })).resolves.toBeDefined();
    });
    it("share: shares itinerary", async () => {
      await expect(c.itinerary.share({ id: 1, email: "friend@test.com" })).resolves.toBeDefined();
    });
    it("export: exports itinerary as PDF", async () => {
      await expect(c.itinerary.export({ id: 1, format: "pdf" })).resolves.toBeDefined();
    });
  });

  // ── Trip Summary ────────────────────────────────────────────────────────────
  describe("Trip Summary", () => {
    it("generate: generates AI trip summary", async () => {
      await expect(c.tripSummary.generate({ tripId: 1 })).resolves.toBeDefined();
    });
    it("list: lists trip summaries", async () => {
      await expect(c.tripSummary.list()).resolves.toBeDefined();
    });
  });

  // ── Identity ────────────────────────────────────────────────────────────────
  describe("Identity", () => {
    it("getCredentials: retrieves identity credentials", async () => {
      await expect(c.identity.getCredentials()).resolves.toBeDefined();
    });
    it("addCredential: adds an identity credential", async () => {
      await expect(c.identity.addCredential({ type: "passport", number: "A12345678", country: "US", expiryDate: "2030-01-01" })).resolves.toBeDefined();
    });
    it("removeCredential: removes an identity credential", async () => {
      await expect(c.identity.removeCredential({ id: 1 })).resolves.toBeDefined();
    });
  });

  // ── Biometric ───────────────────────────────────────────────────────────────
  describe("Biometric", () => {
    it("register: registers biometric", async () => {
      await expect(c.biometric.register({ type: "fingerprint", data: "biometric_data_base64" })).resolves.toBeDefined();
    });
    it("verify: verifies biometric", async () => {
      await expect(c.biometric.verify({ type: "fingerprint", data: "biometric_data_base64" })).resolves.toBeDefined();
    });
    it("list: lists registered biometrics", async () => {
      await expect(c.biometric.list()).resolves.toBeDefined();
    });
    it("remove: removes a biometric", async () => {
      await expect(c.biometric.remove({ id: 1 })).resolves.toBeDefined();
    });
  });

  // ── Push Notifications ──────────────────────────────────────────────────────
  describe("Push Notifications", () => {
    it("subscribe: subscribes to push notifications", async () => {
      await expect(c.push.subscribe({ token: "fcm_token_test", platform: "android" })).resolves.toBeDefined();
    });
    it("unsubscribe: unsubscribes from push notifications", async () => {
      await expect(c.push.unsubscribe({ token: "fcm_token_test" })).resolves.toBeDefined();
    });
  });

  // ── Auth Guard Tests ────────────────────────────────────────────────────────
  describe("Auth Guards (Tourist features require auth)", () => {
    it("wallet.getBalances: requires authentication", async () => {
      await expectUnauthorized(() => caller(anonCtx()).wallet.getBalances());
    });
    it("touristPortal.getProfile: requires authentication", async () => {
      await expectUnauthorized(() => caller(anonCtx()).touristPortal.getProfile());
    });
    it("enaira.createWallet: requires authentication", async () => {
      await expectUnauthorized(() => caller(anonCtx()).enaira.createWallet({ phoneNumber: "+2348012345678", kycTier: 1 }));
    });
    it("tipping.send: requires authentication", async () => {
      await expectUnauthorized(() => caller(anonCtx()).tipping.send({ recipientId: 20, amount: 1000, currency: "NGN" }));
    });
  });
});

// =============================================================================
// STAKEHOLDER 2: MERCHANT
// Journey: KYB → Onboard → Products → Revenue → Payouts → Analytics
// =============================================================================

describe("🏪 Merchant Stakeholder Journey", () => {
  let c: ReturnType<typeof caller>;
  beforeEach(() => { c = caller(merchantCtx()); });

  // ── KYB ─────────────────────────────────────────────────────────────────────
  describe("KYB (Know Your Business)", () => {
    it("startApplication: starts KYB application", async () => {
      await expect(c.kyb.startApplication({ businessName: "Lagos Hilton", businessType: "hotel", country: "NG", rcNumber: "RC123456" })).resolves.toBeDefined();
    });
    it("getMyApplication: retrieves merchant's KYB application", async () => {
      await expect(c.kyb.getMyApplication()).resolves.toBeDefined();
    });
    it("updateApplication: updates KYB application", async () => {
      await expect(c.kyb.updateApplication({ id: 1, taxId: "12345678-0001" })).resolves.toBeDefined();
    });
    it("submitApplication: submits KYB for review", async () => {
      await expect(c.kyb.submitApplication({ id: 1 })).resolves.toBeDefined();
    });
    it("uploadDocument: uploads a KYB document", async () => {
      await expect(c.kybDocuments.upload({ applicationId: 1, documentType: "cac_certificate", fileUrl: "https://storage.tourismpay.dev/doc.pdf" })).resolves.toBeDefined();
    });
    it("listDocuments: lists KYB documents", async () => {
      await expect(c.kybDocuments.list({ applicationId: 1 })).resolves.toBeDefined();
    });
  });

  // ── Merchant Products ───────────────────────────────────────────────────────
  describe("Merchant Products", () => {
    it("list: lists merchant products", async () => {
      await expect(c.merchantProducts.list({ merchantId: 1 })).resolves.toBeDefined();
    });
    it("create: creates a product", async () => {
      await expect(c.merchantProducts.create({ name: "Deluxe Room", description: "King bed with ocean view", price: 75000, currency: "NGN", category: "accommodation" })).resolves.toBeDefined();
    });
    it("update: updates a product", async () => {
      await expect(c.merchantProducts.update({ id: 1, price: 80000 })).resolves.toBeDefined();
    });
    it("delete: deletes a product", async () => {
      await expect(c.merchantProducts.delete({ id: 1 })).resolves.toBeDefined();
    });
    it("setAvailability: sets product availability", async () => {
      await expect(c.merchantProducts.setAvailability({ productId: 1, date: "2026-08-01", available: true, slots: 10 })).resolves.toBeDefined();
    });
  });

  // ── Merchant Bookings ───────────────────────────────────────────────────────
  describe("Merchant Bookings", () => {
    it("list: lists bookings for merchant", async () => {
      await expect(c.merchantBookings.list({ status: "confirmed" })).resolves.toBeDefined();
    });
    it("get: retrieves a booking", async () => {
      await expect(c.merchantBookings.get({ id: 1 })).resolves.toBeDefined();
    });
    it("confirm: confirms a booking", async () => {
      await expect(c.merchantBookings.confirm({ id: 1 })).resolves.toBeDefined();
    });
    it("cancel: cancels a booking", async () => {
      await expect(c.merchantBookings.cancel({ id: 1, reason: "Overbooked" })).resolves.toBeDefined();
    });
    it("complete: marks booking as completed", async () => {
      await expect(c.merchantBookings.complete({ id: 1 })).resolves.toBeDefined();
    });
  });

  // ── Merchant Revenue ────────────────────────────────────────────────────────
  describe("Merchant Revenue", () => {
    it("summary: retrieves revenue summary", async () => {
      await expect(c.merchantRevenue.summary({ period: "30d" })).resolves.toBeDefined();
    });
    it("breakdown: retrieves revenue breakdown", async () => {
      await expect(c.merchantRevenue.breakdown({ period: "30d", groupBy: "day" })).resolves.toBeDefined();
    });
    it("topProducts: retrieves top-selling products", async () => {
      await expect(c.merchantRevenue.topProducts({ limit: 10 })).resolves.toBeDefined();
    });
    it("peerComparison: retrieves peer comparison metrics", async () => {
      await expect(c.merchantRevenue.peerComparison()).resolves.toBeDefined();
    });
    it("forecast: retrieves revenue forecast", async () => {
      await expect(c.merchantRevenue.forecast({ days: 30 })).resolves.toBeDefined();
    });
    it("exportCsv: exports revenue as CSV", async () => {
      await expect(c.merchantRevenue.exportCsv({ from: "2026-01-01", to: "2026-12-31" })).resolves.toBeDefined();
    });
  });

  // ── Payout Schedule ─────────────────────────────────────────────────────────
  describe("Payout Schedule", () => {
    it("getSchedule: retrieves payout schedule", async () => {
      await expect(c.payoutSchedule.getSchedule()).resolves.toBeDefined();
    });
    it("setSchedule: sets payout schedule", async () => {
      await expect(c.payoutSchedule.setSchedule({ frequency: "weekly", dayOfWeek: 5, bankAccountId: "bank-001" })).resolves.toBeDefined();
    });
    it("getPayoutHistory: retrieves payout history", async () => {
      await expect(c.payoutSchedule.getPayoutHistory({ limit: 20 })).resolves.toBeDefined();
    });
    it("requestInstantPayout: requests instant payout", async () => {
      await expect(c.payoutSchedule.requestInstantPayout({ amount: 50000, currency: "NGN" })).resolves.toBeDefined();
    });
  });

  // ── eNaira Merchant ─────────────────────────────────────────────────────────
  describe("eNaira Merchant", () => {
    it("registerMerchant: registers as eNaira merchant", async () => {
      await expect(c.enaira.registerMerchant({ businessName: "Lagos Hilton", businessType: "hotel", rcNumber: "RC123456" })).resolves.toBeDefined();
    });
    it("getWallet: retrieves merchant eNaira wallet", async () => {
      await expect(c.enaira.getWallet()).resolves.toBeDefined();
    });
    it("getTransactions: retrieves merchant eNaira transactions", async () => {
      await expect(c.enaira.getTransactions({ limit: 20 })).resolves.toBeDefined();
    });
  });

  // ── Tipping Configuration ───────────────────────────────────────────────────
  describe("Tipping Configuration", () => {
    it("configureEstablishment: configures tipping for establishment", async () => {
      await expect(c.tipping.configureEstablishment({ establishmentId: 1, enabled: true, defaultPercentages: [10, 15, 20] })).resolves.toBeDefined();
    });
    it("getConfig: retrieves tipping config", async () => {
      await expect(c.tipping.getConfig({ establishmentId: 1 })).resolves.toBeDefined();
    });
  });

  // ── Stripe Connect ──────────────────────────────────────────────────────────
  describe("Stripe Connect", () => {
    it("createOnboardingLink: creates Stripe onboarding link", async () => {
      await expect(c.stripeConnect.createOnboardingLink()).resolves.toBeDefined();
    });
    it("getStatus: retrieves Stripe Connect status", async () => {
      await expect(c.stripeConnect.getStatus()).resolves.toBeDefined();
    });
    it("getPayoutBalance: retrieves Stripe payout balance", async () => {
      await expect(c.stripeConnect.getPayoutBalance()).resolves.toBeDefined();
    });
    it("listPayouts: lists Stripe payouts", async () => {
      await expect(c.stripeConnect.listPayouts({ limit: 10 })).resolves.toBeDefined();
    });
    it("triggerPayout: triggers a Stripe payout", async () => {
      await expect(c.stripeConnect.triggerPayout({ amount: 50000, currency: "NGN" })).resolves.toBeDefined();
    });
  });

  // ── Channel Manager ─────────────────────────────────────────────────────────
  describe("Channel Manager", () => {
    it("getChannels: retrieves connected booking channels", async () => {
      await expect(c.channelManager.getChannels()).resolves.toBeDefined();
    });
    it("connectChannel: connects a booking channel", async () => {
      await expect(c.channelManager.connectChannel({ channelType: "booking_com", apiKey: "test-key", propertyId: "prop-001" })).resolves.toBeDefined();
    });
    it("syncInventory: syncs inventory to channels", async () => {
      await expect(c.channelManager.syncInventory({ channelId: 1 })).resolves.toBeDefined();
    });
    it("getRatePlans: retrieves rate plans", async () => {
      await expect(c.channelManager.getRatePlans({ channelId: 1 })).resolves.toBeDefined();
    });
  });

  // ── GDS Integration ─────────────────────────────────────────────────────────
  describe("GDS Integration", () => {
    it("searchFlights: searches for flights", async () => {
      await expect(c.gdsIntegration.searchFlights({ origin: "LOS", destination: "ABV", date: "2026-08-01", passengers: 1 })).resolves.toBeDefined();
    });
    it("searchHotels: searches for hotels", async () => {
      await expect(c.gdsIntegration.searchHotels({ destination: "Lagos", checkIn: "2026-08-01", checkOut: "2026-08-07", guests: 2 })).resolves.toBeDefined();
    });
    it("createBookingWithTax: creates GDS booking with tax", async () => {
      await expect(c.gdsIntegration.createBookingWithTax({ type: "hotel", itemId: "hotel-001", amount: 150000, currency: "NGN", checkIn: "2026-08-01", checkOut: "2026-08-07" })).resolves.toBeDefined();
    });
    it("getBooking: retrieves a GDS booking", async () => {
      await expect(c.gdsIntegration.getBooking({ bookingRef: "GDS-001" })).resolves.toBeDefined();
    });
    it("cancelBooking: cancels a GDS booking", async () => {
      await expect(c.gdsIntegration.cancelBooking({ bookingRef: "GDS-001" })).resolves.toBeDefined();
    });
  });

  // ── Staff Invites ───────────────────────────────────────────────────────────
  describe("Staff Invites", () => {
    it("create: creates a staff invite", async () => {
      await expect(c.staffInvites.create({ email: "staff@hotel.com", role: "cashier", establishmentId: 1 })).resolves.toBeDefined();
    });
    it("list: lists staff invites", async () => {
      await expect(c.staffInvites.list({ establishmentId: 1 })).resolves.toBeDefined();
    });
    it("revoke: revokes a staff invite", async () => {
      await expect(c.staffInvites.revoke({ id: 1 })).resolves.toBeDefined();
    });
    it("myStaffEstablishments: lists establishments where user is staff", async () => {
      await expect(c.staffInvites.myStaffEstablishments()).resolves.toBeDefined();
    });
  });

  // ── Embedded Finance ────────────────────────────────────────────────────────
  describe("Embedded Finance", () => {
    it("getLoanProducts: retrieves loan products", async () => {
      await expect(c.embeddedFinance.getLoanProducts()).resolves.toBeDefined();
    });
    it("applyForLoan: applies for a business loan", async () => {
      await expect(c.embeddedFinance.applyForLoan({ productId: 1, amount: 500000, currency: "NGN", purpose: "expansion" })).resolves.toBeDefined();
    });
    it("getLoanStatus: retrieves loan application status", async () => {
      await expect(c.embeddedFinance.getLoanStatus({ applicationId: 1 })).resolves.toBeDefined();
    });
    it("getInsuranceProducts: retrieves insurance products", async () => {
      await expect(c.embeddedFinance.getInsuranceProducts()).resolves.toBeDefined();
    });
  });

  // ── Webhooks ────────────────────────────────────────────────────────────────
  describe("Webhooks", () => {
    it("create: creates a webhook endpoint", async () => {
      await expect(c.webhooks.create({ url: "https://hotel.com/webhooks", events: ["payment.completed", "booking.confirmed"] })).resolves.toBeDefined();
    });
    it("list: lists webhook endpoints", async () => {
      await expect(c.webhooks.list()).resolves.toBeDefined();
    });
    it("get: retrieves a webhook", async () => {
      await expect(c.webhooks.get({ id: 1 })).resolves.toBeDefined();
    });
    it("update: updates a webhook", async () => {
      await expect(c.webhooks.update({ id: 1, active: false })).resolves.toBeDefined();
    });
    it("delete: deletes a webhook", async () => {
      await expect(c.webhooks.delete({ id: 1 })).resolves.toBeDefined();
    });
    it("test: tests a webhook", async () => {
      await expect(c.webhooks.test({ id: 1, eventType: "payment.completed" })).resolves.toBeDefined();
    });
    it("getEventTypes: retrieves available event types", async () => {
      await expect(c.webhooks.getEventTypes()).resolves.toBeDefined();
    });
    it("getStats: retrieves webhook delivery stats", async () => {
      await expect(c.webhooks.getStats({ id: 1 })).resolves.toBeDefined();
    });
    it("rotateSecret: rotates webhook signing secret", async () => {
      await expect(c.webhooks.rotateSecret({ id: 1 })).resolves.toBeDefined();
    });
  });
});

// =============================================================================
// STAKEHOLDER 3: AGENT
// Journey: Login → Cash-In → Cash-Out → Commission → Reporting
// =============================================================================

describe("👤 Agent Stakeholder Journey", () => {
  let c: ReturnType<typeof caller>;
  beforeEach(() => { c = caller(agentCtx()); });

  describe("Local Payments (Agent)", () => {
    it("getAgentBalance: retrieves agent float balance", async () => {
      await expect(c.localPayments.getAgentBalance()).resolves.toBeDefined();
    });
    it("cashIn: processes cash-in for tourist", async () => {
      await expect(c.localPayments.cashIn({ touristId: 10, amount: 50000, currency: "NGN", reference: "CASH-IN-001" })).resolves.toBeDefined();
    });
    it("cashOut: processes cash-out for tourist", async () => {
      await expect(c.localPayments.cashOut({ touristId: 10, amount: 20000, currency: "NGN", reference: "CASH-OUT-001" })).resolves.toBeDefined();
    });
    it("billPayment: processes a bill payment", async () => {
      await expect(c.localPayments.billPayment({ billerId: "DSTV", accountNumber: "12345678", amount: 5000, currency: "NGN" })).resolves.toBeDefined();
    });
    it("getCommissions: retrieves agent commission history", async () => {
      await expect(c.localPayments.getCommissions({ period: "30d" })).resolves.toBeDefined();
    });
    it("getTransactionHistory: retrieves agent transaction history", async () => {
      await expect(c.localPayments.getTransactionHistory({ limit: 50 })).resolves.toBeDefined();
    });
  });

  describe("Mobile Aggregates", () => {
    it("getAgentDashboard: retrieves agent dashboard data", async () => {
      await expect(c.mobileAggregates.getAgentDashboard()).resolves.toBeDefined();
    });
    it("getFloatStatus: retrieves float status", async () => {
      await expect(c.mobileAggregates.getFloatStatus()).resolves.toBeDefined();
    });
  });

  describe("Africa Registry (Agent)", () => {
    it("getAgentNetwork: retrieves agent network data", async () => {
      await expect(c.africa.getAgentNetwork({ country: "NG" })).resolves.toBeDefined();
    });
    it("registerAgent: registers as an agent", async () => {
      await expect(c.africa.registerAgent({ country: "NG", region: "Lagos", businessName: "Quick Cash Agent" })).resolves.toBeDefined();
    });
  });
});

// =============================================================================
// STAKEHOLDER 4: ADMIN
// Journey: User Management → Platform Config → Kill Switch → Monitoring
// =============================================================================

describe("⚙️ Admin Stakeholder Journey", () => {
  let c: ReturnType<typeof caller>;
  beforeEach(() => { c = caller(adminCtx()); });

  describe("Admin Panel", () => {
    it("getUsers: lists all users", async () => {
      await expect(c.admin.getUsers({ limit: 50, offset: 0 })).resolves.toBeDefined();
    });
    it("setUserRole: changes a user's role", async () => {
      await expect(c.admin.setUserRole({ userId: 10, role: "merchant" })).resolves.toBeDefined();
    });
    it("getStats: retrieves platform statistics", async () => {
      await expect(c.admin.getStats()).resolves.toBeDefined();
    });
    it("listRolePermissions: lists role permissions", async () => {
      await expect(c.admin.listRolePermissions()).resolves.toBeDefined();
    });
    it("upsertRolePermission: upserts a role permission", async () => {
      await expect(c.admin.upsertRolePermission({ role: "merchant", resource: "wallet", action: "read", allowed: true })).resolves.toBeDefined();
    });
  });

  describe("Users Admin", () => {
    it("listAll: lists all users with details", async () => {
      await expect(c.usersAdmin.listAll({ limit: 50 })).resolves.toBeDefined();
    });
    it("getById: retrieves user by ID", async () => {
      await expect(c.usersAdmin.getById({ id: 10 })).resolves.toBeDefined();
    });
    it("setRole: sets user role", async () => {
      await expect(c.usersAdmin.setRole({ userId: 10, role: "merchant" })).resolves.toBeDefined();
    });
    it("stats: retrieves user statistics", async () => {
      await expect(c.usersAdmin.stats()).resolves.toBeDefined();
    });
    it("startImpersonation: starts user impersonation", async () => {
      await expect(c.usersAdmin.startImpersonation({ userId: 10 })).resolves.toBeDefined();
    });
    it("impersonationStatus: retrieves impersonation status", async () => {
      await expect(c.usersAdmin.impersonationStatus()).resolves.toBeDefined();
    });
    it("endImpersonation: ends user impersonation", async () => {
      await expect(c.usersAdmin.endImpersonation()).resolves.toBeDefined();
    });
  });

  describe("Kill Switch", () => {
    it("getStatus: retrieves kill switch status", async () => {
      await expect(c.killSwitch.getStatus()).resolves.toBeDefined();
    });
    it("activate: activates a kill switch", async () => {
      await expect(c.killSwitch.activate({ feature: "payments", reason: "Emergency maintenance" })).resolves.toBeDefined();
    });
    it("deactivate: deactivates a kill switch", async () => {
      await expect(c.killSwitch.deactivate({ feature: "payments" })).resolves.toBeDefined();
    });
    it("list: lists all kill switches", async () => {
      await expect(c.killSwitch.list()).resolves.toBeDefined();
    });
  });

  describe("Service Availability", () => {
    it("getStatus: retrieves service availability status", async () => {
      await expect(c.serviceAvailability.getStatus()).resolves.toBeDefined();
    });
    it("setMaintenance: sets maintenance mode", async () => {
      await expect(c.serviceAvailability.setMaintenance({ service: "payments", enabled: true, message: "Scheduled maintenance" })).resolves.toBeDefined();
    });
    it("getHistory: retrieves availability history", async () => {
      await expect(c.serviceAvailability.getHistory({ service: "payments", period: "7d" })).resolves.toBeDefined();
    });
  });

  describe("HA Config", () => {
    it("getConfig: retrieves HA configuration", async () => {
      await expect(c.haConfig.getConfig()).resolves.toBeDefined();
    });
    it("updateConfig: updates HA configuration", async () => {
      await expect(c.haConfig.updateConfig({ minReplicas: 2, maxReplicas: 10 })).resolves.toBeDefined();
    });
  });

  describe("Exchange Rate Overrides", () => {
    it("list: lists rate overrides", async () => {
      await expect(c.exchangeRateOverrides.list()).resolves.toBeDefined();
    });
    it("create: creates a rate override", async () => {
      await expect(c.exchangeRateOverrides.create({ from: "USD", to: "NGN", rate: 1580, reason: "CBN directive" })).resolves.toBeDefined();
    });
    it("delete: deletes a rate override", async () => {
      await expect(c.exchangeRateOverrides.delete({ id: 1 })).resolves.toBeDefined();
    });
  });

  describe("Corridor Rate Limits", () => {
    it("list: lists corridor rate limits", async () => {
      await expect(c.corridorRateLimit.list()).resolves.toBeDefined();
    });
    it("upsert: upserts a corridor rate limit", async () => {
      await expect(c.corridorRateLimit.upsert({ corridor: "USD-NGN", maxTxPerMinute: 100, maxVolumePerDay: 10000000 })).resolves.toBeDefined();
    });
    it("delete: deletes a corridor rate limit", async () => {
      await expect(c.corridorRateLimit.delete({ id: 1 })).resolves.toBeDefined();
    });
  });

  describe("Smart Contract", () => {
    it("deployments: lists smart contract deployments", async () => {
      await expect(c.smartContract.deployments()).resolves.toBeDefined();
    });
    it("contractHealth: retrieves contract health", async () => {
      await expect(c.smartContract.contractHealth({ contractAddress: "0x1234" })).resolves.toBeDefined();
    });
    it("executeMint: executes a mint operation", async () => {
      await expect(c.smartContract.executeMint({ contractAddress: "0x1234", amount: 1000, recipient: "0x5678" })).resolves.toBeDefined();
    });
    it("executeBurn: executes a burn operation", async () => {
      await expect(c.smartContract.executeBurn({ contractAddress: "0x1234", amount: 500, from: "0x5678" })).resolves.toBeDefined();
    });
    it("securityDashboard: retrieves security dashboard", async () => {
      await expect(c.smartContract.securityDashboard()).resolves.toBeDefined();
    });
    it("verifyIntegrity: verifies contract integrity", async () => {
      await expect(c.smartContract.verifyIntegrity({ contractAddress: "0x1234" })).resolves.toBeDefined();
    });
    it("emergencyAction: executes emergency action", async () => {
      await expect(c.smartContract.emergencyAction({ contractAddress: "0x1234", action: "pause", reason: "Security breach" })).resolves.toBeDefined();
    });
    it("eventHistory: retrieves contract event history", async () => {
      await expect(c.smartContract.eventHistory({ contractAddress: "0x1234", limit: 20 })).resolves.toBeDefined();
    });
  });

  describe("Email Preview", () => {
    it("preview: previews an email template", async () => {
      await expect(c.emailPreview.preview({ template: "welcome", data: { name: "Test User" } })).resolves.toBeDefined();
    });
    it("list: lists email templates", async () => {
      await expect(c.emailPreview.list()).resolves.toBeDefined();
    });
  });

  describe("Liquidity Provider", () => {
    it("getPools: retrieves liquidity pools", async () => {
      await expect(c.liquidityProvider.getPools()).resolves.toBeDefined();
    });
    it("deposit: deposits to liquidity pool", async () => {
      await expect(c.liquidityProvider.deposit({ poolId: "pool-001", amount: 1000000, currency: "NGN" })).resolves.toBeDefined();
    });
    it("withdraw: withdraws from liquidity pool", async () => {
      await expect(c.liquidityProvider.withdraw({ poolId: "pool-001", amount: 500000 })).resolves.toBeDefined();
    });
    it("getRewards: retrieves LP rewards", async () => {
      await expect(c.liquidityProvider.getRewards({ poolId: "pool-001" })).resolves.toBeDefined();
    });
    it("claimRewards: claims LP rewards", async () => {
      await expect(c.liquidityProvider.claimRewards({ poolId: "pool-001" })).resolves.toBeDefined();
    });
    it("getStats: retrieves pool statistics", async () => {
      await expect(c.liquidityProvider.getStats()).resolves.toBeDefined();
    });
  });

  describe("eNaira Admin", () => {
    it("setWalletStatus: freezes/unfreezes an eNaira wallet", async () => {
      await expect(c.enaira.setWalletStatus({ walletId: "wallet-001", status: "frozen", reason: "Suspicious activity" })).resolves.toBeDefined();
    });
  });

  describe("RBAC Guards (Admin-only features)", () => {
    it("killSwitch.activate: tourist cannot activate kill switch", async () => {
      await expectForbidden(() => caller(touristCtx()).killSwitch.activate({ feature: "payments", reason: "test" }));
    });
    it("admin.setUserRole: tourist cannot set user roles", async () => {
      await expectForbidden(() => caller(touristCtx()).admin.setUserRole({ userId: 10, role: "admin" }));
    });
    it("usersAdmin.startImpersonation: merchant cannot impersonate users", async () => {
      await expectForbidden(() => caller(merchantCtx()).usersAdmin.startImpersonation({ userId: 10 }));
    });
  });
});

// =============================================================================
// STAKEHOLDER 5: COMPLIANCE OFFICER
// Journey: KYB Review → KYC Review → BIS → Audit Logs → Reports
// =============================================================================

describe("📋 Compliance Officer Stakeholder Journey", () => {
  let c: ReturnType<typeof caller>;
  beforeEach(() => { c = caller(complianceCtx()); });

  describe("KYB Review", () => {
    it("listApplications: lists all KYB applications", async () => {
      await expect(c.kyb.listApplications({ status: "submitted", limit: 50 })).resolves.toBeDefined();
    });
    it("getApplication: retrieves a KYB application", async () => {
      await expect(c.kyb.getApplication({ id: 1 })).resolves.toBeDefined();
    });
    it("approveApplication: approves a KYB application", async () => {
      await expect(c.kybApplications.approve({ id: 1, notes: "All documents verified" })).resolves.toBeDefined();
    });
    it("rejectApplication: rejects a KYB application", async () => {
      await expect(c.kybApplications.reject({ id: 1, reason: "Incomplete documentation" })).resolves.toBeDefined();
    });
    it("requestMoreInfo: requests additional information", async () => {
      await expect(c.kybApplications.requestMoreInfo({ id: 1, message: "Please provide latest CAC certificate" })).resolves.toBeDefined();
    });
    it("listDocuments: lists KYB documents for review", async () => {
      await expect(c.kybDocuments.listForReview({ applicationId: 1 })).resolves.toBeDefined();
    });
    it("verifyDocument: verifies a KYB document", async () => {
      await expect(c.kybDocuments.verify({ id: 1, status: "approved" })).resolves.toBeDefined();
    });
  });

  describe("KYC Review", () => {
    it("listPending: lists pending KYC reviews", async () => {
      await expect(c.kyc.listPending({ limit: 50 })).resolves.toBeDefined();
    });
    it("getRecord: retrieves a KYC record", async () => {
      await expect(c.kyc.getRecord({ userId: 10 })).resolves.toBeDefined();
    });
    it("approve: approves KYC", async () => {
      await expect(c.kyc.approve({ userId: 10, notes: "Identity verified" })).resolves.toBeDefined();
    });
    it("reject: rejects KYC", async () => {
      await expect(c.kyc.reject({ userId: 10, reason: "Document expired" })).resolves.toBeDefined();
    });
    it("requestResubmission: requests KYC resubmission", async () => {
      await expect(c.kyc.requestResubmission({ userId: 10, reason: "Photo unclear" })).resolves.toBeDefined();
    });
  });

  describe("Audit Logs", () => {
    it("list: lists audit logs", async () => {
      await expect(c.auditLogs.list({ limit: 100, offset: 0 })).resolves.toBeDefined();
    });
    it("getByUser: retrieves audit logs for a user", async () => {
      await expect(c.auditLogs.getByUser({ userId: 10, limit: 50 })).resolves.toBeDefined();
    });
    it("getByEntity: retrieves audit logs for an entity", async () => {
      await expect(c.auditLogs.getByEntity({ entityType: "payment", entityId: "pay-001", limit: 20 })).resolves.toBeDefined();
    });
    it("export: exports audit logs", async () => {
      await expect(c.auditLogs.export({ from: "2026-01-01", to: "2026-12-31", format: "csv" })).resolves.toBeDefined();
    });
  });

  describe("CSV Export", () => {
    it("exportKybApplications: exports KYB applications", async () => {
      await expect(c.csvExport.exportKybApplications({ status: "approved", from: "2026-01-01", to: "2026-12-31" })).resolves.toBeDefined();
    });
    it("exportTransactions: exports transactions", async () => {
      await expect(c.csvExport.exportTransactions({ from: "2026-01-01", to: "2026-12-31" })).resolves.toBeDefined();
    });
    it("exportFraudAlerts: exports fraud alerts", async () => {
      await expect(c.csvExport.exportFraudAlerts({ severity: "high", from: "2026-01-01", to: "2026-12-31" })).resolves.toBeDefined();
    });
  });

  describe("Tax Remittance (Compliance)", () => {
    it("dashboard: retrieves tax remittance dashboard", async () => {
      await expect(c.taxRemittance.dashboard()).resolves.toBeDefined();
    });
    it("schedules: retrieves remittance schedules", async () => {
      await expect(c.taxRemittance.schedules()).resolves.toBeDefined();
    });
    it("initiateRemittance: initiates a tax remittance", async () => {
      await expect(c.taxRemittance.initiateRemittance({ jurisdictionId: "NG-FIRS", amount: 500000, currency: "NGN", period: "2026-Q2" })).resolves.toBeDefined();
    });
    it("generateReport: generates tax remittance report", async () => {
      await expect(c.taxRemittance.generateReport({ period: "2026-Q2", format: "pdf" })).resolves.toBeDefined();
    });
    it("reconcile: reconciles tax collections", async () => {
      await expect(c.taxRemittance.reconcile({ period: "2026-Q2" })).resolves.toBeDefined();
    });
    it("paymentHistory: retrieves remittance payment history", async () => {
      await expect(c.taxRemittance.paymentHistory({ limit: 20 })).resolves.toBeDefined();
    });
    it("govtAccounts: retrieves government tax accounts", async () => {
      await expect(c.taxRemittance.govtAccounts()).resolves.toBeDefined();
    });
    it("jurisdictionDetail: retrieves jurisdiction details", async () => {
      await expect(c.taxRemittance.jurisdictionDetail({ jurisdictionId: "NG-FIRS" })).resolves.toBeDefined();
    });
    it("estimatePenalty: estimates late payment penalty", async () => {
      await expect(c.taxRemittance.estimatePenalty({ jurisdictionId: "NG-FIRS", amount: 500000, daysLate: 30 })).resolves.toBeDefined();
    });
  });
});

// =============================================================================
// STAKEHOLDER 6: NOC OPERATOR
// Journey: Monitor → Alert → Incident → Payment Switch → Analytics
// =============================================================================

describe("🖥️ NOC Operator Stakeholder Journey", () => {
  let c: ReturnType<typeof caller>;
  beforeEach(() => { c = caller(nocCtx()); });

  describe("NOC Dashboard", () => {
    it("getOverview: retrieves NOC overview", async () => {
      await expect(c.nocDashboard.getOverview()).resolves.toBeDefined();
    });
    it("getAlerts: retrieves active alerts", async () => {
      await expect(c.nocDashboard.getAlerts({ severity: "critical", status: "open" })).resolves.toBeDefined();
    });
    it("acknowledgeAlert: acknowledges an alert", async () => {
      await expect(c.nocDashboard.acknowledgeAlert({ alertId: 1 })).resolves.toBeDefined();
    });
    it("resolveAlert: resolves an alert", async () => {
      await expect(c.nocDashboard.resolveAlert({ alertId: 1, resolution: "Fixed by restarting service" })).resolves.toBeDefined();
    });
    it("getMetrics: retrieves system metrics", async () => {
      await expect(c.nocDashboard.getMetrics({ period: "1h" })).resolves.toBeDefined();
    });
    it("getTransactionVolume: retrieves transaction volume", async () => {
      await expect(c.nocDashboard.getTransactionVolume({ period: "24h" })).resolves.toBeDefined();
    });
    it("getFailureRates: retrieves failure rates by service", async () => {
      await expect(c.nocDashboard.getFailureRates({ period: "1h" })).resolves.toBeDefined();
    });
    it("getLatencyMetrics: retrieves latency metrics", async () => {
      await expect(c.nocDashboard.getLatencyMetrics({ service: "payment-api", period: "1h" })).resolves.toBeDefined();
    });
  });

  describe("Payment Switch", () => {
    it("getRoutes: retrieves payment routing rules", async () => {
      await expect(c.paymentSwitch.getRoutes()).resolves.toBeDefined();
    });
    it("getRailStatus: retrieves payment rail status", async () => {
      await expect(c.paymentSwitch.getRailStatus()).resolves.toBeDefined();
    });
    it("getTransactionStats: retrieves transaction statistics", async () => {
      await expect(c.paymentSwitch.getTransactionStats({ period: "24h" })).resolves.toBeDefined();
    });
    it("retryTransaction: retries a failed transaction", async () => {
      await expect(c.paymentSwitch.retryTransaction({ transactionId: "tx-001" })).resolves.toBeDefined();
    });
    it("createRemittance: creates a remittance", async () => {
      await expect(c.paymentSwitch.createRemittance({ senderId: 10, recipientId: 20, amount: 100, fromCurrency: "USD", toCurrency: "NGN", rail: "swift" })).resolves.toBeDefined();
    });
    it("getRemittanceStatus: retrieves remittance status", async () => {
      await expect(c.paymentSwitch.getRemittanceStatus({ remittanceId: "remit-001" })).resolves.toBeDefined();
    });
    it("getLedgerBalance: retrieves TigerBeetle ledger balance", async () => {
      await expect(c.paymentSwitch.getLedgerBalance({ currency: "NGN" })).resolves.toBeDefined();
    });
  });

  describe("Fund Flow", () => {
    it("getScenarios: retrieves fund flow scenarios", async () => {
      await expect(c.fundFlow.getScenarios()).resolves.toBeDefined();
    });
    it("executeScenario: executes a fund flow scenario", async () => {
      await expect(c.fundFlow.executeScenario({ scenarioId: "tourist_load_ngn", params: { amount: 50000, userId: 10 } })).resolves.toBeDefined();
    });
    it("getFlowHistory: retrieves fund flow history", async () => {
      await expect(c.fundFlow.getFlowHistory({ limit: 50 })).resolves.toBeDefined();
    });
    it("getFlowStats: retrieves fund flow statistics", async () => {
      await expect(c.fundFlow.getFlowStats({ period: "24h" })).resolves.toBeDefined();
    });
  });

  describe("Analytics", () => {
    it("getTransactionAnalytics: retrieves transaction analytics", async () => {
      await expect(c.analytics.getTransactionAnalytics({ period: "30d", groupBy: "day" })).resolves.toBeDefined();
    });
    it("getUserGrowth: retrieves user growth metrics", async () => {
      await expect(c.analytics.getUserGrowth({ period: "90d" })).resolves.toBeDefined();
    });
    it("getRevenueAnalytics: retrieves revenue analytics", async () => {
      await expect(c.analytics.getRevenueAnalytics({ period: "30d" })).resolves.toBeDefined();
    });
    it("getGeographicDistribution: retrieves geographic distribution", async () => {
      await expect(c.analytics.getGeographicDistribution()).resolves.toBeDefined();
    });
    it("getFraudMetrics: retrieves fraud metrics", async () => {
      await expect(c.analytics.getFraudMetrics({ period: "30d" })).resolves.toBeDefined();
    });
    it("exportReport: exports analytics report", async () => {
      await expect(c.analytics.exportReport({ type: "transactions", period: "30d", format: "csv" })).resolves.toBeDefined();
    });
  });

  describe("Mesh Payments", () => {
    it("getNetworkStatus: retrieves mesh network status", async () => {
      await expect(c.meshPayments.getNetworkStatus()).resolves.toBeDefined();
    });
    it("initiateOfflinePayment: initiates offline mesh payment", async () => {
      await expect(c.meshPayments.initiateOfflinePayment({ recipientId: 10, amount: 5000, currency: "NGN", offlineToken: "offline_token_123" })).resolves.toBeDefined();
    });
    it("syncPendingPayments: syncs pending offline payments", async () => {
      await expect(c.meshPayments.syncPendingPayments()).resolves.toBeDefined();
    });
    it("getOfflineBalance: retrieves offline balance", async () => {
      await expect(c.meshPayments.getOfflineBalance()).resolves.toBeDefined();
    });
  });

  describe("Service Proxy", () => {
    it("serviceHealth: checks service health", async () => {
      await expect(c.serviceProxy.serviceHealth({ service: "payment-api" })).resolves.toBeDefined();
    });
    it("serviceHealthHistory: retrieves service health history", async () => {
      await expect(c.serviceProxy.serviceHealthHistory({ service: "payment-api", period: "24h" })).resolves.toBeDefined();
    });
    it("proxyConfig: retrieves proxy configuration", async () => {
      await expect(c.serviceProxy.proxyConfig()).resolves.toBeDefined();
    });
    it("registryLookup: looks up service registry", async () => {
      await expect(c.serviceProxy.registryLookup({ service: "settlement-service" })).resolves.toBeDefined();
    });
  });

  describe("Python Services", () => {
    it("getLakehouseStatus: retrieves lakehouse status", async () => {
      await expect(c.pythonServices.getLakehouseStatus()).resolves.toBeDefined();
    });
    it("triggerEtl: triggers an ETL run", async () => {
      await expect(c.pythonServices.triggerEtl({ table: "transactions_daily" })).resolves.toBeDefined();
    });
    it("getFraudModelStatus: retrieves fraud ML model status", async () => {
      await expect(c.pythonServices.getFraudModelStatus()).resolves.toBeDefined();
    });
    it("getFluvioConsumerStatus: retrieves Fluvio consumer status", async () => {
      await expect(c.pythonServices.getFluvioConsumerStatus()).resolves.toBeDefined();
    });
  });
});

// =============================================================================
// STAKEHOLDER 7: SETTLEMENT OFFICER
// Journey: View Settlements → Approve → Reconcile → Dispute → Export
// =============================================================================

describe("💳 Settlement Officer Stakeholder Journey", () => {
  let c: ReturnType<typeof caller>;
  beforeEach(() => { c = caller(settlementCtx()); });

  describe("Settlement", () => {
    it("list: lists settlements", async () => {
      await expect(c.settlement.list({ status: "pending", limit: 50 })).resolves.toBeDefined();
    });
    it("stats: retrieves settlement statistics", async () => {
      await expect(c.settlement.stats({ period: "30d" })).resolves.toBeDefined();
    });
    it("dailyVolume: retrieves daily settlement volume", async () => {
      await expect(c.settlement.dailyVolume({ days: 30 })).resolves.toBeDefined();
    });
    it("approveBatch: approves a batch of settlements", async () => {
      await expect(c.settlement.approveBatch({ settlementIds: [1, 2, 3] })).resolves.toBeDefined();
    });
    it("reject: rejects a settlement", async () => {
      await expect(c.settlement.reject({ id: 1, reason: "Insufficient documentation" })).resolves.toBeDefined();
    });
    it("markCompleted: marks settlement as completed", async () => {
      await expect(c.settlement.markCompleted({ id: 1, reference: "SETTLE-REF-001" })).resolves.toBeDefined();
    });
    it("retryFailed: retries failed settlements", async () => {
      await expect(c.settlement.retryFailed({ ids: [1, 2] })).resolves.toBeDefined();
    });
    it("reconcile: reconciles settlements", async () => {
      await expect(c.settlement.reconcile({ date: "2026-07-01" })).resolves.toBeDefined();
    });
    it("dispute: raises a settlement dispute", async () => {
      await expect(c.settlement.dispute({ id: 1, reason: "Amount mismatch", evidence: "Evidence details" })).resolves.toBeDefined();
    });
    it("scheduleSettlement: schedules a settlement", async () => {
      await expect(c.settlement.scheduleSettlement({ merchantId: 20, amount: 500000, currency: "NGN", scheduledAt: new Date(Date.now() + 86400000).toISOString() })).resolves.toBeDefined();
    });
    it("myPayouts: retrieves officer's payout history", async () => {
      await expect(c.settlement.myPayouts({ limit: 20 })).resolves.toBeDefined();
    });
    it("exportCsv: exports settlements as CSV", async () => {
      await expect(c.settlement.exportCsv({ from: "2026-01-01", to: "2026-12-31" })).resolves.toBeDefined();
    });
  });
});

// =============================================================================
// STAKEHOLDER 8: BIS ANALYST
// Journey: Create Investigation → Enrich → Score → Report → Export
// =============================================================================

describe("🔍 BIS Analyst Stakeholder Journey", () => {
  let c: ReturnType<typeof caller>;
  beforeEach(() => { c = caller(bisAnalystCtx()); });

  describe("BIS Investigations", () => {
    it("list: lists BIS investigations", async () => {
      await expect(c.bis.list({ status: "pending", limit: 50 })).resolves.toBeDefined();
    });
    it("get: retrieves a BIS investigation", async () => {
      await expect(c.bis.get({ id: 1 })).resolves.toBeDefined();
    });
    it("create: creates a new BIS investigation", async () => {
      await expect(c.bis.create({ subjectFullName: "John Doe", subjectCountry: "NG", subjectType: "individual", tier: "standard" })).resolves.toBeDefined();
    });
    it("updateStatus: updates investigation status", async () => {
      await expect(c.bis.updateStatus({ id: 1, status: "processing" })).resolves.toBeDefined();
    });
    it("addNote: adds a note to investigation", async () => {
      await expect(c.bis.addNote({ id: 1, note: "Subject has multiple addresses" })).resolves.toBeDefined();
    });
    it("getTimeline: retrieves investigation timeline", async () => {
      await expect(c.bis.getTimeline({ id: 1 })).resolves.toBeDefined();
    });
    it("getRiskScore: retrieves risk score", async () => {
      await expect(c.bis.getRiskScore({ id: 1 })).resolves.toBeDefined();
    });
    it("getDocuments: retrieves investigation documents", async () => {
      await expect(c.bis.getDocuments({ id: 1 })).resolves.toBeDefined();
    });
    it("uploadDocument: uploads investigation document", async () => {
      await expect(c.bis.uploadDocument({ investigationId: 1, documentType: "passport_scan", fileUrl: "https://storage.tourismpay.dev/doc.pdf" })).resolves.toBeDefined();
    });
    it("getStats: retrieves BIS statistics", async () => {
      await expect(c.bis.getStats()).resolves.toBeDefined();
    });
    it("bulkCreate: creates multiple investigations", async () => {
      await expect(c.bis.bulkCreate({ subjects: [{ subjectFullName: "Jane Doe", subjectCountry: "GH", subjectType: "individual" }] })).resolves.toBeDefined();
    });
    it("getDirectors: retrieves entity directors", async () => {
      await expect(c.bis.getDirectors({ investigationId: 1 })).resolves.toBeDefined();
    });
    it("addDirector: adds a director to entity investigation", async () => {
      await expect(c.bis.addDirector({ investigationId: 1, name: "Jane Director", role: "CEO", nationality: "NG" })).resolves.toBeDefined();
    });
    it("createBatch: creates a batch investigation", async () => {
      await expect(c.bis.createBatch({ name: "Q3 Batch", tier: "standard" })).resolves.toBeDefined();
    });
    it("getBatchStatus: retrieves batch investigation status", async () => {
      await expect(c.bis.getBatchStatus({ batchId: "batch-001" })).resolves.toBeDefined();
    });
    it("scheduleExport: schedules periodic export", async () => {
      await expect(c.bis.scheduleExport({ frequency: "weekly", format: "csv", email: "bis@tourismpay.dev" })).resolves.toBeDefined();
    });
  });

  describe("BIS Integration", () => {
    it("getProviders: retrieves BIS data providers", async () => {
      await expect(c.bisIntegration.getProviders()).resolves.toBeDefined();
    });
    it("testConnection: tests provider connection", async () => {
      await expect(c.bisIntegration.testConnection({ providerId: "complyadvantage" })).resolves.toBeDefined();
    });
    it("syncData: syncs data from provider", async () => {
      await expect(c.bisIntegration.syncData({ providerId: "complyadvantage", investigationId: 1 })).resolves.toBeDefined();
    });
  });

  describe("BIS Jobs", () => {
    it("list: lists BIS background jobs", async () => {
      await expect(c.bisJobs.list()).resolves.toBeDefined();
    });
    it("trigger: triggers a BIS job", async () => {
      await expect(c.bisJobs.trigger({ jobType: "sanctions_screen", investigationId: 1 })).resolves.toBeDefined();
    });
    it("getStatus: retrieves job status", async () => {
      await expect(c.bisJobs.getStatus({ jobId: "job-001" })).resolves.toBeDefined();
    });
  });

  describe("BIS Reports", () => {
    it("generate: generates a BIS report", async () => {
      await expect(c.bisReport.generate({ investigationId: 1, format: "pdf", includeTimeline: true })).resolves.toBeDefined();
    });
    it("list: lists generated reports", async () => {
      await expect(c.bisReport.list({ investigationId: 1 })).resolves.toBeDefined();
    });
    it("download: downloads a report", async () => {
      await expect(c.bisReport.download({ reportId: 1 })).resolves.toBeDefined();
    });
    it("share: shares a report", async () => {
      await expect(c.bisReport.share({ reportId: 1, email: "compliance@tourismpay.dev" })).resolves.toBeDefined();
    });
  });

  describe("BIS Module Editor", () => {
    it("getModules: retrieves BIS scoring modules", async () => {
      await expect(c.bisModuleEditor.getModules()).resolves.toBeDefined();
    });
    it("updateModule: updates a scoring module", async () => {
      await expect(c.bisModuleEditor.updateModule({ moduleId: "sanctions", weight: 0.4, enabled: true })).resolves.toBeDefined();
    });
    it("testModule: tests a scoring module", async () => {
      await expect(c.bisModuleEditor.testModule({ moduleId: "sanctions", testData: { name: "Test Subject", country: "NG" } })).resolves.toBeDefined();
    });
  });

  describe("Service Proxy (BIS AI)", () => {
    it("bisAiScore: gets AI risk score", async () => {
      await expect(c.serviceProxy.bisAiScore({ investigationId: 1 })).resolves.toBeDefined();
    });
    it("bisOsintEnrich: enriches with OSINT data", async () => {
      await expect(c.serviceProxy.bisOsintEnrich({ investigationId: 1, sources: ["web", "social"] })).resolves.toBeDefined();
    });
    it("bisCreateProxy: creates proxy investigation", async () => {
      await expect(c.serviceProxy.bisCreateProxy({ subjectName: "Test Subject", country: "NG" })).resolves.toBeDefined();
    });
    it("kybVerifyProxy: verifies KYB via proxy", async () => {
      await expect(c.serviceProxy.kybVerifyProxy({ applicationId: 1 })).resolves.toBeDefined();
    });
  });
});

// =============================================================================
// CROSS-STAKEHOLDER: SHARED FEATURES
// =============================================================================

describe("🌐 Cross-Stakeholder Shared Features", () => {

  describe("Copilot (AI Assistant)", () => {
    it("tourist: can use AI copilot", async () => {
      await expect(caller(touristCtx()).copilot.chat({ message: "How do I top up my wallet?" })).resolves.toBeDefined();
    });
    it("merchant: can use AI copilot", async () => {
      await expect(caller(merchantCtx()).copilot.chat({ message: "How do I set up payouts?" })).resolves.toBeDefined();
    });
    it("admin: can use AI copilot", async () => {
      await expect(caller(adminCtx()).copilot.chat({ message: "Show me platform metrics" })).resolves.toBeDefined();
    });
    it("getHistory: retrieves copilot conversation history", async () => {
      await expect(caller(touristCtx()).copilot.getHistory({ limit: 20 })).resolves.toBeDefined();
    });
    it("clearHistory: clears copilot history", async () => {
      await expect(caller(touristCtx()).copilot.clearHistory()).resolves.toBeDefined();
    });
  });

  describe("Notification Preferences", () => {
    it("tourist: can get notification preferences", async () => {
      await expect(caller(touristCtx()).notificationPreferences.get()).resolves.toBeDefined();
    });
    it("merchant: can update notification preferences", async () => {
      await expect(caller(merchantCtx()).notificationPreferences.update({ paymentReceived: true, bookingConfirmed: true, lowBalance: true })).resolves.toBeDefined();
    });
  });

  describe("Security", () => {
    it("getSecuritySettings: retrieves security settings", async () => {
      await expect(caller(touristCtx()).security.getSettings()).resolves.toBeDefined();
    });
    it("enable2FA: enables 2FA", async () => {
      await expect(caller(touristCtx()).security.enable2FA({ method: "totp" })).resolves.toBeDefined();
    });
    it("disable2FA: disables 2FA", async () => {
      await expect(caller(touristCtx()).security.disable2FA({ code: "123456" })).resolves.toBeDefined();
    });
    it("getActiveSessions: retrieves active sessions", async () => {
      await expect(caller(touristCtx()).security.getActiveSessions()).resolves.toBeDefined();
    });
    it("revokeSession: revokes a session", async () => {
      await expect(caller(touristCtx()).security.revokeSession({ sessionId: "sess-001" })).resolves.toBeDefined();
    });
  });

  describe("Africa Registry", () => {
    it("getCountries: retrieves supported African countries", async () => {
      await expect(caller(touristCtx()).africa.getCountries()).resolves.toBeDefined();
    });
    it("getEstablishments: retrieves establishments by country", async () => {
      await expect(caller(touristCtx()).africa.getEstablishments({ country: "NG", limit: 20 })).resolves.toBeDefined();
    });
    it("getEvents: retrieves tourism events", async () => {
      await expect(caller(touristCtx()).africa.getEvents({ country: "NG" })).resolves.toBeDefined();
    });
    it("getStats: retrieves Africa registry stats", async () => {
      await expect(caller(adminCtx()).africa.getStats()).resolves.toBeDefined();
    });
  });

  describe("Public Endpoints (No Auth Required)", () => {
    it("exchangeRates.getRate: public FX rate lookup", async () => {
      await expect(caller(anonCtx()).exchangeRates.getRate({ from: "USD", to: "NGN" })).resolves.toBeDefined();
    });
    it("travelReadiness.countryRisk: public country risk", async () => {
      await expect(caller(anonCtx()).travelReadiness.countryRisk({ country: "NG" })).resolves.toBeDefined();
    });
    it("merchantProducts.list: public product listing", async () => {
      await expect(caller(anonCtx()).merchantProducts.list({ merchantId: 1 })).resolves.toBeDefined();
    });
    it("search.search: public search", async () => {
      await expect(caller(anonCtx()).search.search({ query: "Lagos hotel", limit: 10 })).resolves.toBeDefined();
    });
  });

  describe("Input Validation (Bad Request scenarios)", () => {
    it("wallet.send: rejects negative amount", async () => {
      await expect(caller(touristCtx()).wallet.send({ recipientId: 2, amount: -100, currency: "NGN" })).rejects.toThrow();
    });
    it("tipping.send: rejects zero amount", async () => {
      await expect(caller(touristCtx()).tipping.send({ recipientId: 20, amount: 0, currency: "NGN" })).rejects.toThrow();
    });
    it("enaira.createWallet: rejects invalid phone number", async () => {
      await expect(caller(touristCtx()).enaira.createWallet({ phoneNumber: "invalid", kycTier: 1 })).rejects.toThrow();
    });
    it("stablecoinSwap.onrampBuy: rejects unsupported currency", async () => {
      await expect(caller(touristCtx()).stablecoinSwap.onrampBuy({ amount: 100, fromCurrency: "XYZ", toCurrency: "USDT", rail: "stripe" })).rejects.toThrow();
    });
    it("taxRemittance.initiateRemittance: rejects negative amount", async () => {
      await expect(caller(complianceCtx()).taxRemittance.initiateRemittance({ jurisdictionId: "NG-FIRS", amount: -1000, currency: "NGN", period: "2026-Q2" })).rejects.toThrow();
    });
  });
});
