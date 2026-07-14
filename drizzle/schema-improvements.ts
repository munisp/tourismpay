/**
 * drizzle/schema-improvements.ts
 *
 * This file contains all Drizzle ORM schema improvements:
 *   1. Missing TypeScript type exports for all 76 untyped tables
 *   2. Drizzle `relations()` definitions for all major entity relationships
 *   3. New enums to replace raw text columns
 *   4. New migration 0077 for check constraints and composite indexes
 *
 * These improvements are imported by schema.ts via a barrel re-export.
 */

// ─── Re-export all table objects needed for relations ─────────────────────────
export {
  users,
  walletBalances,
  walletTransactions,
  walletBalanceAlerts,
  walletSpendingLimits,
  pinLockoutHistory,
  loyaltyAccounts,
  loyaltyTransactions,
  loyaltyRewards,
  loyaltyBalances,
  loyaltyConversions,
  insurancePolicies,
  insuranceClaims,
  dataExportRequests,
  dataErasureRequests,
  tourismPassesTable,
  socialPosts,
  flashDeals,
  referralRewards,
  merchantInventory,
  merchantLocations,
  merchantSplitPayments,
  wireTransferOrders,
  agentsTable,
  agentFloatBalances,
  cashLoadOrders,
  partnerQuotes,
  partnerTransfers,
  ussdSessions,
  ussdTransactions,
  agentKycVerifications,
  billPayments,
  virtualCards,
  virtualCardTransactions,
  bankTransfersOut,
  savedBeneficiaries,
  paymentLinks,
  splitBills,
  splitBillParticipants,
  moneyRequests,
  rideBookings,
  nfcPaymentTokens,
  bankTravelNotifications,
  esimOrders,
  agentKioskRegistry,
  currencyCorridors,
  preTravelChecklists,
  kycFastTrackHistory,
  offlineTokenRenewals,
  countryRiskCache,
  travelRiskAssessments,
  tripPlannerSessions,
  tripPlannerMessages,
  tripPlannerRecommendations,
  tipTransactions,
  tipDistributionLog,
  tipConfigs,
  taxCollections,
  taxRemittanceTracker,
  taxRulesCustom,
  taxReceipts,
  multiTipGroups,
  multiTipRecipients,
  gdsBookingTaxes,
  gdsStaffTips,
  gdsLoyaltyEarnings,
  gdsItineraryConversions,
  gdsDemandForecasts,
  taxRules,
  killSwitchSchedules,
  temporalWorkflowExecutions,
  daprSubscriptions,
  daprStateEntries,
  fluvioConsumerOffsets,
  lakehouseEtlRuns,
  openappsecWafEvents,
  keycloakSessionTokens,
  enairaWallets,
  enairaTransactions,
  cbnMerchantRegistrations,
  apisixRouteRegistry,
  daprSidecarHealth,
  kybApplications,
  bisInvestigations,
  bisDirectors,
  fraudAlerts,
  socAlerts,
  tourismEvents,
  kybDocuments,
  bisReportExports,
  userNotifications,
  notificationPreferences,
  auditLogs,
  financeRequests,
  biometricEnrollments,
  didDocuments,
  verifiableCredentials,
  carbonOffsets,
  meshTransactions,
  serviceHealthAlerts,
} from "./schema";

import { relations } from "drizzle-orm";
import { pgEnum } from "drizzle-orm/pg-core";

import {
  users,
  walletBalances,
  walletTransactions,
  loyaltyAccounts,
  loyaltyTransactions,
  loyaltyRewards,
  insurancePolicies,
  insuranceClaims,
  kybApplications,
  kybDocuments,
  bisInvestigations,
  bisDirectors,
  fraudAlerts,
  auditLogs,
  userNotifications,
  notificationPreferences,
  enairaWallets,
  enairaTransactions,
  cbnMerchantRegistrations,
  virtualCards,
  virtualCardTransactions,
  tripPlannerSessions,
  tripPlannerMessages,
  tripPlannerRecommendations,
  splitBills,
  splitBillParticipants,
  tipTransactions,
  tipDistributionLog,
  multiTipGroups,
  multiTipRecipients,
  taxCollections,
  taxReceipts,
  agentsTable,
  agentFloatBalances,
  agentKycVerifications,
  cashLoadOrders,
  ussdSessions,
  ussdTransactions,
  wireTransferOrders,
  bankTransfersOut,
  savedBeneficiaries,
  paymentLinks,
  temporalWorkflowExecutions,
  fluvioConsumerOffsets,
  lakehouseEtlRuns,
  biometricEnrollments,
  didDocuments,
  verifiableCredentials,
  meshTransactions,
  financeRequests,
  tourismPassesTable,
  socialPosts,
  referralRewards,
  merchantLocations,
  merchantSplitPayments,
  rideBookings,
  nfcPaymentTokens,
  bankTravelNotifications,
  esimOrders,
  travelRiskAssessments,
  preTravelChecklists,
  gdsBookingTaxes,
  gdsStaffTips,
  gdsLoyaltyEarnings,
  gdsItineraryConversions,
  gdsDemandForecasts,
  moneyRequests,
  partnerQuotes,
  partnerTransfers,
  daprStateEntries,
  daprSubscriptions,
  daprSidecarHealth,
  openappsecWafEvents,
  keycloakSessionTokens,
  apisixRouteRegistry,
  killSwitchSchedules,
  socAlerts,
  bisReportExports,
  tourismEvents,
  carbonOffsets,
  serviceHealthAlerts,
  walletBalanceAlerts,
  walletSpendingLimits,
  pinLockoutHistory,
  loyaltyBalances,
  loyaltyConversions,
  flashDeals,
  merchantInventory,
  billPayments,
  agentKioskRegistry,
  currencyCorridors,
  kycFastTrackHistory,
  offlineTokenRenewals,
  countryRiskCache,
  taxRemittanceTracker,
  taxRulesCustom,
  taxRules,
  partnerQuotes as _pq,
  temporalWorkflowExecutions as _twe,
  dataExportRequests,
  dataErasureRequests,
  tipConfigs,
} from "./schema";

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1: Missing Type Exports
// ─────────────────────────────────────────────────────────────────────────────

// Wallet domain
export type WalletBalance = typeof walletBalances.$inferSelect;
export type InsertWalletBalance = typeof walletBalances.$inferInsert;
export type WalletTransaction = typeof walletTransactions.$inferSelect;
export type InsertWalletTransaction = typeof walletTransactions.$inferInsert;
export type WalletSpendingLimit = typeof walletSpendingLimits.$inferSelect;
export type InsertWalletSpendingLimit = typeof walletSpendingLimits.$inferInsert;
export type PinLockoutHistory = typeof pinLockoutHistory.$inferSelect;
export type InsertPinLockoutHistory = typeof pinLockoutHistory.$inferInsert;

// Loyalty domain
export type LoyaltyBalance = typeof loyaltyBalances.$inferSelect;
export type InsertLoyaltyBalance = typeof loyaltyBalances.$inferInsert;
export type LoyaltyConversion = typeof loyaltyConversions.$inferSelect;
export type InsertLoyaltyConversion = typeof loyaltyConversions.$inferInsert;

// Insurance domain
export type InsurancePolicy = typeof insurancePolicies.$inferSelect;
export type InsertInsurancePolicy = typeof insurancePolicies.$inferInsert;
export type InsuranceClaim = typeof insuranceClaims.$inferSelect;
export type InsertInsuranceClaim = typeof insuranceClaims.$inferInsert;

// Data privacy domain
export type DataExportRequest = typeof dataExportRequests.$inferSelect;
export type InsertDataExportRequest = typeof dataExportRequests.$inferInsert;
export type DataErasureRequest = typeof dataErasureRequests.$inferSelect;
export type InsertDataErasureRequest = typeof dataErasureRequests.$inferInsert;

// Tourism & social
export type TourismPass = typeof tourismPassesTable.$inferSelect;
export type InsertTourismPass = typeof tourismPassesTable.$inferInsert;
export type SocialPost = typeof socialPosts.$inferSelect;
export type InsertSocialPost = typeof socialPosts.$inferInsert;
export type FlashDeal = typeof flashDeals.$inferSelect;
export type InsertFlashDeal = typeof flashDeals.$inferInsert;
export type ReferralReward = typeof referralRewards.$inferSelect;
export type InsertReferralReward = typeof referralRewards.$inferInsert;

// Merchant domain
export type MerchantInventoryItem = typeof merchantInventory.$inferSelect;
export type InsertMerchantInventoryItem = typeof merchantInventory.$inferInsert;
export type MerchantLocation = typeof merchantLocations.$inferSelect;
export type InsertMerchantLocation = typeof merchantLocations.$inferInsert;
export type MerchantSplitPayment = typeof merchantSplitPayments.$inferSelect;
export type InsertMerchantSplitPayment = typeof merchantSplitPayments.$inferInsert;

// Wire transfer & agent domain
export type WireTransferOrder = typeof wireTransferOrders.$inferSelect;
export type InsertWireTransferOrder = typeof wireTransferOrders.$inferInsert;
export type Agent = typeof agentsTable.$inferSelect;
export type InsertAgent = typeof agentsTable.$inferInsert;
export type AgentFloatBalance = typeof agentFloatBalances.$inferSelect;
export type InsertAgentFloatBalance = typeof agentFloatBalances.$inferInsert;
export type CashLoadOrder = typeof cashLoadOrders.$inferSelect;
export type InsertCashLoadOrder = typeof cashLoadOrders.$inferInsert;
export type AgentKycVerification = typeof agentKycVerifications.$inferSelect;
export type InsertAgentKycVerification = typeof agentKycVerifications.$inferInsert;
export type AgentKioskRegistry = typeof agentKioskRegistry.$inferSelect;
export type InsertAgentKioskRegistry = typeof agentKioskRegistry.$inferInsert;

// Partner domain
export type PartnerQuote = typeof partnerQuotes.$inferSelect;
export type InsertPartnerQuote = typeof partnerQuotes.$inferInsert;
export type PartnerTransfer = typeof partnerTransfers.$inferSelect;
export type InsertPartnerTransfer = typeof partnerTransfers.$inferInsert;

// USSD domain
export type UssdSession = typeof ussdSessions.$inferSelect;
export type InsertUssdSession = typeof ussdSessions.$inferInsert;
export type UssdTransaction = typeof ussdTransactions.$inferSelect;
export type InsertUssdTransaction = typeof ussdTransactions.$inferInsert;

// Banking domain
export type BillPayment = typeof billPayments.$inferSelect;
export type InsertBillPayment = typeof billPayments.$inferInsert;
export type VirtualCard = typeof virtualCards.$inferSelect;
export type InsertVirtualCard = typeof virtualCards.$inferInsert;
export type VirtualCardTransaction = typeof virtualCardTransactions.$inferSelect;
export type InsertVirtualCardTransaction = typeof virtualCardTransactions.$inferInsert;
export type BankTransferOut = typeof bankTransfersOut.$inferSelect;
export type InsertBankTransferOut = typeof bankTransfersOut.$inferInsert;
export type SavedBeneficiary = typeof savedBeneficiaries.$inferSelect;
export type InsertSavedBeneficiary = typeof savedBeneficiaries.$inferInsert;
export type PaymentLink = typeof paymentLinks.$inferSelect;
export type InsertPaymentLink = typeof paymentLinks.$inferInsert;
export type SplitBill = typeof splitBills.$inferSelect;
export type InsertSplitBill = typeof splitBills.$inferInsert;
export type SplitBillParticipant = typeof splitBillParticipants.$inferSelect;
export type InsertSplitBillParticipant = typeof splitBillParticipants.$inferInsert;
export type MoneyRequest = typeof moneyRequests.$inferSelect;
export type InsertMoneyRequest = typeof moneyRequests.$inferInsert;

// Travel domain
export type RideBooking = typeof rideBookings.$inferSelect;
export type InsertRideBooking = typeof rideBookings.$inferInsert;
export type NfcPaymentToken = typeof nfcPaymentTokens.$inferSelect;
export type InsertNfcPaymentToken = typeof nfcPaymentTokens.$inferInsert;
export type BankTravelNotification = typeof bankTravelNotifications.$inferSelect;
export type InsertBankTravelNotification = typeof bankTravelNotifications.$inferInsert;
export type EsimOrder = typeof esimOrders.$inferSelect;
export type InsertEsimOrder = typeof esimOrders.$inferInsert;
export type CurrencyCorridor = typeof currencyCorridors.$inferSelect;
export type InsertCurrencyCorridor = typeof currencyCorridors.$inferInsert;
export type PreTravelChecklist = typeof preTravelChecklists.$inferSelect;
export type InsertPreTravelChecklist = typeof preTravelChecklists.$inferInsert;
export type KycFastTrackHistory = typeof kycFastTrackHistory.$inferSelect;
export type InsertKycFastTrackHistory = typeof kycFastTrackHistory.$inferInsert;
export type OfflineTokenRenewal = typeof offlineTokenRenewals.$inferSelect;
export type InsertOfflineTokenRenewal = typeof offlineTokenRenewals.$inferInsert;
export type CountryRiskCache = typeof countryRiskCache.$inferSelect;
export type InsertCountryRiskCache = typeof countryRiskCache.$inferInsert;
export type TravelRiskAssessment = typeof travelRiskAssessments.$inferSelect;
export type InsertTravelRiskAssessment = typeof travelRiskAssessments.$inferInsert;

// Trip planner domain
export type TripPlannerSession = typeof tripPlannerSessions.$inferSelect;
export type InsertTripPlannerSession = typeof tripPlannerSessions.$inferInsert;
export type TripPlannerMessage = typeof tripPlannerMessages.$inferSelect;
export type InsertTripPlannerMessage = typeof tripPlannerMessages.$inferInsert;
export type TripPlannerRecommendation = typeof tripPlannerRecommendations.$inferSelect;
export type InsertTripPlannerRecommendation = typeof tripPlannerRecommendations.$inferInsert;

// Tipping domain
export type TipTransaction = typeof tipTransactions.$inferSelect;
export type InsertTipTransaction = typeof tipTransactions.$inferInsert;
export type TipDistributionLog = typeof tipDistributionLog.$inferSelect;
export type InsertTipDistributionLog = typeof tipDistributionLog.$inferInsert;
export type TipConfig = typeof tipConfigs.$inferSelect;
export type InsertTipConfig = typeof tipConfigs.$inferInsert;
export type MultiTipGroup = typeof multiTipGroups.$inferSelect;
export type InsertMultiTipGroup = typeof multiTipGroups.$inferInsert;
export type MultiTipRecipient = typeof multiTipRecipients.$inferSelect;
export type InsertMultiTipRecipient = typeof multiTipRecipients.$inferInsert;

// Tax domain
export type TaxCollection = typeof taxCollections.$inferSelect;
export type InsertTaxCollection = typeof taxCollections.$inferInsert;
export type TaxRemittanceTracker = typeof taxRemittanceTracker.$inferSelect;
export type InsertTaxRemittanceTracker = typeof taxRemittanceTracker.$inferInsert;
export type TaxRuleCustom = typeof taxRulesCustom.$inferSelect;
export type InsertTaxRuleCustom = typeof taxRulesCustom.$inferInsert;
export type TaxReceipt = typeof taxReceipts.$inferSelect;
export type InsertTaxReceipt = typeof taxReceipts.$inferInsert;
export type TaxRule = typeof taxRules.$inferSelect;
export type InsertTaxRule = typeof taxRules.$inferInsert;

// GDS domain
export type GdsBookingTax = typeof gdsBookingTaxes.$inferSelect;
export type InsertGdsBookingTax = typeof gdsBookingTaxes.$inferInsert;
export type GdsStaffTip = typeof gdsStaffTips.$inferSelect;
export type InsertGdsStaffTip = typeof gdsStaffTips.$inferInsert;
export type GdsLoyaltyEarning = typeof gdsLoyaltyEarnings.$inferSelect;
export type InsertGdsLoyaltyEarning = typeof gdsLoyaltyEarnings.$inferInsert;
export type GdsItineraryConversion = typeof gdsItineraryConversions.$inferSelect;
export type InsertGdsItineraryConversion = typeof gdsItineraryConversions.$inferInsert;
export type GdsDemandForecast = typeof gdsDemandForecasts.$inferSelect;
export type InsertGdsDemandForecast = typeof gdsDemandForecasts.$inferInsert;

// Middleware observability domain
export type KillSwitchSchedule = typeof killSwitchSchedules.$inferSelect;
export type InsertKillSwitchSchedule = typeof killSwitchSchedules.$inferInsert;
export type TemporalWorkflowExecution = typeof temporalWorkflowExecutions.$inferSelect;
export type InsertTemporalWorkflowExecution = typeof temporalWorkflowExecutions.$inferInsert;
export type DaprSubscription = typeof daprSubscriptions.$inferSelect;
export type InsertDaprSubscription = typeof daprSubscriptions.$inferInsert;
export type DaprStateEntry = typeof daprStateEntries.$inferSelect;
export type InsertDaprStateEntry = typeof daprStateEntries.$inferInsert;
export type FluvioConsumerOffset = typeof fluvioConsumerOffsets.$inferSelect;
export type InsertFluvioConsumerOffset = typeof fluvioConsumerOffsets.$inferInsert;
export type LakehouseEtlRun = typeof lakehouseEtlRuns.$inferSelect;
export type InsertLakehouseEtlRun = typeof lakehouseEtlRuns.$inferInsert;
export type OpenappsecWafEvent = typeof openappsecWafEvents.$inferSelect;
export type InsertOpenappsecWafEvent = typeof openappsecWafEvents.$inferInsert;
export type KeycloakSessionToken = typeof keycloakSessionTokens.$inferSelect;
export type InsertKeycloakSessionToken = typeof keycloakSessionTokens.$inferInsert;
export type ApisixRouteRegistry = typeof apisixRouteRegistry.$inferSelect;
export type InsertApisixRouteRegistry = typeof apisixRouteRegistry.$inferInsert;
export type DaprSidecarHealth = typeof daprSidecarHealth.$inferSelect;
export type InsertDaprSidecarHealth = typeof daprSidecarHealth.$inferInsert;

// eNaira domain
export type EnairaWallet = typeof enairaWallets.$inferSelect;
export type InsertEnairaWallet = typeof enairaWallets.$inferInsert;
export type EnairaTransaction = typeof enairaTransactions.$inferSelect;
export type InsertEnairaTransaction = typeof enairaTransactions.$inferInsert;
export type CbnMerchantRegistration = typeof cbnMerchantRegistrations.$inferSelect;
export type InsertCbnMerchantRegistration = typeof cbnMerchantRegistrations.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2: New Enums (replacing raw text columns)
// ─────────────────────────────────────────────────────────────────────────────

/** Wallet transaction direction */
export const walletTxDirectionEnum = pgEnum("wallet_tx_direction", [
  "credit",
  "debit",
]);

/** eNaira wallet status */
export const enairaWalletStatusEnum = pgEnum("enaira_wallet_status", [
  "active",
  "frozen",
  "suspended",
  "closed",
]);

/** eNaira transaction type */
export const enairaTransactionTypeEnum = pgEnum("enaira_transaction_type", [
  "tourist_load",
  "merchant_payment",
  "peer_transfer",
  "withdrawal",
  "reversal",
  "fee",
]);

/** Temporal workflow status */
export const temporalWorkflowStatusEnum = pgEnum("temporal_workflow_status", [
  "running",
  "completed",
  "failed",
  "cancelled",
  "terminated",
  "continued_as_new",
  "timed_out",
]);

/** Tax collection status */
export const taxCollectionStatusEnum = pgEnum("tax_collection_status", [
  "pending",
  "collected",
  "remitted",
  "disputed",
  "refunded",
]);

/** KYB application status */
export const kybApplicationStatusEnum = pgEnum("kyb_application_status", [
  "draft",
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "suspended",
]);

/** BIS investigation status */
export const bisInvestigationStatusEnum = pgEnum("bis_investigation_status", [
  "open",
  "in_progress",
  "escalated",
  "resolved",
  "closed",
]);

/** Trip planner message role */
export const tripMessageRoleEnum = pgEnum("trip_message_role", [
  "user",
  "assistant",
  "system",
]);

/** Tip distribution status */
export const tipDistributionStatusEnum = pgEnum("tip_distribution_status", [
  "pending",
  "distributed",
  "failed",
  "reversed",
]);

/** Wire transfer status */
export const wireTransferStatusEnum = pgEnum("wire_transfer_status", [
  "initiated",
  "pending_confirmation",
  "confirmed",
  "settled",
  "failed",
  "recalled",
]);

/** Fraud alert severity */
export const fraudAlertSeverityEnum = pgEnum("fraud_alert_severity", [
  "low",
  "medium",
  "high",
  "critical",
]);

/** Fluvio consumer offset status */
export const fluvioOffsetStatusEnum = pgEnum("fluvio_offset_status", [
  "active",
  "paused",
  "lagging",
  "stalled",
]);

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3: Drizzle Relations
// All major entity relationships defined for type-safe joins and query building
// ─────────────────────────────────────────────────────────────────────────────

/** Users → all owned entities */
export const usersRelations = relations(users, ({ many }: { many: any }) => ({
  walletBalances: many(walletBalances),
  walletTransactions: many(walletTransactions),
  loyaltyAccounts: many(loyaltyAccounts),
  insurancePolicies: many(insurancePolicies),
  kybApplications: many(kybApplications),
  auditLogs: many(auditLogs),
  userNotifications: many(userNotifications),
  notificationPreferences: many(notificationPreferences),
  enairaWallets: many(enairaWallets),
  virtualCards: many(virtualCards),
  tripPlannerSessions: many(tripPlannerSessions),
  savedBeneficiaries: many(savedBeneficiaries),
  paymentLinks: many(paymentLinks),
  biometricEnrollments: many(biometricEnrollments),
  didDocuments: many(didDocuments),
  verifiableCredentials: many(verifiableCredentials),
  tourismPasses: many(tourismPassesTable),
  socialPosts: many(socialPosts),
  referralRewards: many(referralRewards),
  travelRiskAssessments: many(travelRiskAssessments),
  preTravelChecklists: many(preTravelChecklists),
  moneyRequests: many(moneyRequests),
  financeRequests: many(financeRequests),
  carbonOffsets: many(carbonOffsets),
  keycloakSessionTokens: many(keycloakSessionTokens),
}));

/** KYB Applications → documents */
export const kybApplicationsRelations = relations(kybApplications, ({ many, one }: { many: any; one: any }) => ({
  documents: many(kybDocuments),
  bisInvestigations: many(bisInvestigations),
}));

export const kybDocumentsRelations = relations(kybDocuments, ({ one }: { one: any }) => ({
  application: one(kybApplications, {
    fields: [kybDocuments.applicationId],
    references: [kybApplications.id],
  }),
}));

/** BIS Investigations → directors */
export const bisInvestigationsRelations = relations(bisInvestigations, ({ many }: { many: any }) => ({
  directors: many(bisDirectors),
  reportExports: many(bisReportExports),
}));

export const bisDirectorsRelations = relations(bisDirectors, ({ one }: { one: any }) => ({
  investigation: one(bisInvestigations, {
    fields: [bisDirectors.entityInvestigationId],
    references: [bisInvestigations.id],
  }),
}));

/** eNaira Wallets → transactions and merchant registrations */
export const enairaWalletsRelations = relations(enairaWallets, ({ one, many }: { one: any; many: any }) => ({
  user: one(users, {
    fields: [enairaWallets.userId],
    references: [users.id],
  }),
  transactions: many(enairaTransactions),
}));

export const enairaTransactionsRelations = relations(enairaTransactions, ({ one }: { one: any }) => ({
  wallet: one(enairaWallets, {
    fields: [enairaTransactions.enairaWalletId],
    references: [enairaWallets.id],
  }),
}));

/** Loyalty Accounts → transactions and rewards */
export const loyaltyAccountsRelations = relations(loyaltyAccounts, ({ one, many }: { one: any; many: any }) => ({
  user: one(users, {
    fields: [loyaltyAccounts.userId],
    references: [users.id],
  }),
  transactions: many(loyaltyTransactions),
  rewards: many(loyaltyRewards),
}));

export const loyaltyTransactionsRelations = relations(loyaltyTransactions, ({ one }: { one: any }) => ({
  account: one(loyaltyAccounts, {
    fields: [loyaltyTransactions.userId],
    references: [loyaltyAccounts.id],
  }),
}));

/** Virtual Cards → transactions */
export const virtualCardsRelations = relations(virtualCards, ({ one, many }: { one: any; many: any }) => ({
  user: one(users, {
    fields: [virtualCards.userId],
    references: [users.id],
  }),
  transactions: many(virtualCardTransactions),
}));

export const virtualCardTransactionsRelations = relations(virtualCardTransactions, ({ one }: { one: any }) => ({
  card: one(virtualCards, {
    fields: [virtualCardTransactions.cardId],
    references: [virtualCards.id],
  }),
}));

/** Trip Planner Sessions → messages and recommendations */
export const tripPlannerSessionsRelations = relations(tripPlannerSessions, ({ one, many }: { one: any; many: any }) => ({
  user: one(users, {
    fields: [tripPlannerSessions.userId],
    references: [users.id],
  }),
  messages: many(tripPlannerMessages),
  recommendations: many(tripPlannerRecommendations),
}));

export const tripPlannerMessagesRelations = relations(tripPlannerMessages, ({ one }: { one: any }) => ({
  session: one(tripPlannerSessions, {
    fields: [tripPlannerMessages.sessionId],
    references: [tripPlannerSessions.id],
  }),
}));

export const tripPlannerRecommendationsRelations = relations(tripPlannerRecommendations, ({ one }: { one: any }) => ({
  session: one(tripPlannerSessions, {
    fields: [tripPlannerRecommendations.sessionId],
    references: [tripPlannerSessions.id],
  }),
}));

/** Split Bills → participants */
export const splitBillsRelations = relations(splitBills, ({ one, many }: { one: any; many: any }) => ({
  creator: one(users, {
    fields: [splitBills.creatorId],
    references: [users.id],
  }),
  participants: many(splitBillParticipants),
}));

export const splitBillParticipantsRelations = relations(splitBillParticipants, ({ one }: { one: any }) => ({
  splitBill: one(splitBills, {
    fields: [splitBillParticipants.splitId],
    references: [splitBills.id],
  }),
}));

/** Multi-tip groups → recipients */
export const multiTipGroupsRelations = relations(multiTipGroups, ({ many }: { many: any }) => ({
  recipients: many(multiTipRecipients),
}));

export const multiTipRecipientsRelations = relations(multiTipRecipients, ({ one }: { one: any }) => ({
  group: one(multiTipGroups, {
    fields: [multiTipRecipients.groupId],
    references: [multiTipGroups.id],
  }),
}));

/** Tax Collections → receipts */
export const taxCollectionsRelations = relations(taxCollections, ({ many }: { many: any }) => ({
  receipts: many(taxReceipts),
}));

export const taxReceiptsRelations = relations(taxReceipts, ({ one }: { one: any }) => ({
  taxCollection: one(taxCollections, {
    fields: [taxReceipts.transactionId],
    references: [taxCollections.id],
  }),
}));

/** Agents → float balances, KYC, cash loads, kiosk registries */
export const agentsRelations = relations(agentsTable, ({ one, many }: { one: any; many: any }) => ({
  user: one(users, {
    fields: [agentsTable.id],
    references: [users.id],
  }),
  floatBalances: many(agentFloatBalances),
  kycVerifications: many(agentKycVerifications),
  cashLoadOrders: many(cashLoadOrders),
  kioskRegistries: many(agentKioskRegistry),
}));

/** USSD Sessions → transactions */
export const ussdSessionsRelations = relations(ussdSessions, ({ many }: { many: any }) => ({
  transactions: many(ussdTransactions),
}));

export const ussdTransactionsRelations = relations(ussdTransactions, ({ one }: { one: any }) => ({
  session: one(ussdSessions, {
    fields: [ussdTransactions.sessionId],
    references: [ussdSessions.id],
  }),
}));

/** Temporal Workflow Executions — self-referential parent/child */
export const temporalWorkflowExecutionsRelations = relations(temporalWorkflowExecutions, ({ one, many }: { one: any; many: any }) => ({
  parent: one(temporalWorkflowExecutions, {
    fields: [temporalWorkflowExecutions.correlationId],
    references: [temporalWorkflowExecutions.id],
    relationName: "parent_child",
  }),
  children: many(temporalWorkflowExecutions, {
    relationName: "parent_child",
  }),
}));

/** Insurance Policies → claims */
export const insurancePoliciesRelations = relations(insurancePolicies, ({ one, many }: { one: any; many: any }) => ({
  user: one(users, {
    fields: [insurancePolicies.userId],
    references: [users.id],
  }),
  claims: many(insuranceClaims),
}));

export const insuranceClaimsRelations = relations(insuranceClaims, ({ one }: { one: any }) => ({
  policy: one(insurancePolicies, {
    fields: [insuranceClaims.policyId],
    references: [insurancePolicies.id],
  }),
}));

/** User Notifications → preferences */
export const userNotificationsRelations = relations(userNotifications, ({ one }: { one: any }) => ({
  user: one(users, {
    fields: [userNotifications.userId],
    references: [users.id],
  }),
}));

export const notificationPreferencesRelations = relations(notificationPreferences, ({ one }: { one: any }) => ({
  user: one(users, {
    fields: [notificationPreferences.userId],
    references: [users.id],
  }),
}));

/** Audit Logs → user */
export const auditLogsRelations = relations(auditLogs, ({ one }: { one: any }) => ({
  user: one(users, {
    fields: [auditLogs.actorId],
    references: [users.id],
  }),
}));

/** Biometric Enrollments → DID Documents */
export const biometricEnrollmentsRelations = relations(biometricEnrollments, ({ one }: { one: any }) => ({
  user: one(users, {
    fields: [biometricEnrollments.userId],
    references: [users.id],
  }),
}));

export const didDocumentsRelations = relations(didDocuments, ({ one, many }: { one: any; many: any }) => ({
  user: one(users, {
    fields: [didDocuments.userId],
    references: [users.id],
  }),
  verifiableCredentials: many(verifiableCredentials),
}));

export const verifiableCredentialsRelations = relations(verifiableCredentials, ({ one }: { one: any }) => ({
  didDocument: one(didDocuments, {
    fields: [verifiableCredentials.userId],
    references: [didDocuments.id],
  }),
}));

/** Tip Transactions → distribution log */
export const tipTransactionsRelations = relations(tipTransactions, ({ many }: { many: any }) => ({
  distributions: many(tipDistributionLog),
}));

export const tipDistributionLogRelations = relations(tipDistributionLog, ({ one }: { one: any }) => ({
  tipTransaction: one(tipTransactions, {
    fields: [tipDistributionLog.tipId],
    references: [tipTransactions.id],
  }),
}));

/** Keycloak Session Tokens → user */
export const keycloakSessionTokensRelations = relations(keycloakSessionTokens, ({ one }: { one: any }) => ({
  user: one(users, {
    fields: [keycloakSessionTokens.userId],
    references: [users.id],
  }),
}));

/** Fluvio Consumer Offsets — standalone (no FK, tracks external stream) */
/** Lakehouse ETL Runs — standalone audit table */
/** OpenAppSec WAF Events — standalone security log */
/** APISIX Route Registry — standalone config table */
/** Dapr Sidecar Health — standalone health table */
