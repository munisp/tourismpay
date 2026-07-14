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

// ─── Additional imports for missing relations ─────────────────────────────────
import {
  establishments,
  serviceHealthHistory,
  bisTimeline,
  scheduledPayments,
  loyaltyPartners,
  walletRecurringPayments,
  loyaltyReferrals,
  bisInvestigationNotes,
  bisExportSchedules,
  remittances,
  psParticipants,
  psSettlements,
  nocEvents,
  psKillSwitchState,
  psFraudRules,
  psLedgerEntries,
  psKillSwitches,
  psKillSwitchHistory,
  psWebhooks,
  psWebhookDeliveries,
  psCorridorRateLimits,
  psCorridorRateLimitUsage,
  trustedDevices,
  loginHistory,
  rateAlerts,
  psApiKeys,
  psTwoFactorSettings,
  psNotificationChannels,
  psReminderEmails,
  psAccountRecovery,
  bisAutoFlagConfig,
  bisAutoFlags,
  bisKillSwitchActivations,
  nocAlertThresholds,
  touristProfiles,
  qrPaymentTokens,
  touristOnboardingState,
  rolePermissions,
  pushSubscriptions,
  merchantPayoutSchedules,
  touristTripSummaries,
  merchantProducts,
  staffInvites,
  qrPaymentReceipts,
  exchangeRateOverrides,
  touristBookings,
  touristReviews,
  reviewSentimentCache,
  reviewSentimentHistory,
  touristDeals,
  touristItineraries,
  touristBudgets,
  touristConciergeSessions,
  touristTopups,
  touristDealRedemptions,
  touristDealWishlists,
  touristItineraryItems,
  itineraryCollaborators,
  itineraryChangelog,
  establishmentScoreSnapshots,
  serviceAvailability,
  kycVerificationRecords,
  channelConnections,
  stablecoinOnrampOrders,
  stablecoinOfframpRequests,
  stablecoinLimitOrders,
  stablecoinYieldPositions,
  lpApplications,
  lpProviders,
  lpPositions,
  lpRewards,
  lpPoolSnapshots,
  lpWithdrawals,
  lpRebalanceEvents,
  smartContractDeployments,
  smartContractEvents,
} from "./schema";;

// ─── Establishments ───────────────────────────────────────────────────────────
export const establishmentsRelations = relations(establishments, ({ many }: { many: any }) => ({
  kybApplications: many(kybApplications),
  kybDocuments: many(kybDocuments),
  bisInvestigations: many(bisInvestigations),
  scoreSnapshots: many(establishmentScoreSnapshots),
  channelConnections: many(channelConnections),
  serviceAvailability: many(serviceAvailability),
  qrPaymentReceipts: many(qrPaymentReceipts),
  touristDealRedemptions: many(touristDealRedemptions),
  touristItineraryItems: many(touristItineraryItems),
}));

// ─── Wallet ───────────────────────────────────────────────────────────────────
export const walletBalancesRelations = relations(walletBalances, ({ one }: { one: any }) => ({
  user: one(users, { fields: [walletBalances.userId], references: [users.id] }),
}));
export const walletTransactionsRelations = relations(walletTransactions, ({ one }: { one: any }) => ({
  user: one(users, { fields: [walletTransactions.userId], references: [users.id] }),
}));
export const walletBalanceAlertsRelations = relations(walletBalanceAlerts, ({ one }: { one: any }) => ({
  user: one(users, { fields: [walletBalanceAlerts.userId], references: [users.id] }),
}));
export const walletSpendingLimitsRelations = relations(walletSpendingLimits, ({ one }: { one: any }) => ({
  user: one(users, { fields: [walletSpendingLimits.userId], references: [users.id] }),
}));
export const walletRecurringPaymentsRelations = relations(walletRecurringPayments, ({ one }: { one: any }) => ({
  user: one(users, { fields: [walletRecurringPayments.userId], references: [users.id] }),
}));
export const scheduledPaymentsRelations = relations(scheduledPayments, ({ one }: { one: any }) => ({
  user: one(users, { fields: [scheduledPayments.userId], references: [users.id] }),
}));

// ─── Fraud & Security ─────────────────────────────────────────────────────────
export const fraudAlertsRelations = relations(fraudAlerts, ({ one }: { one: any }) => ({
  establishment: one(establishments, { fields: [fraudAlerts.establishmentId], references: [establishments.id] }),
}));
/** socAlerts — standalone security log (no direct FK to users) */
export const trustedDevicesRelations = relations(trustedDevices, ({ one }: { one: any }) => ({
  user: one(users, { fields: [trustedDevices.userId], references: [users.id] }),
}));
export const loginHistoryRelations = relations(loginHistory, ({ one }: { one: any }) => ({
  user: one(users, { fields: [loginHistory.userId], references: [users.id] }),
}));
export const pinLockoutHistoryRelations = relations(pinLockoutHistory, ({ one }: { one: any }) => ({
  user: one(users, { fields: [pinLockoutHistory.userId], references: [users.id] }),
}));

// ─── BIS ─────────────────────────────────────────────────────────────────────
export const bisTimelineRelations = relations(bisTimeline, ({ one }: { one: any }) => ({
  investigation: one(bisInvestigations, { fields: [bisTimeline.investigationId], references: [bisInvestigations.id] }),
}));
export const bisInvestigationNotesRelations = relations(bisInvestigationNotes, ({ one }: { one: any }) => ({
  investigation: one(bisInvestigations, { fields: [bisInvestigationNotes.investigationId], references: [bisInvestigations.id] }),
  author: one(users, { fields: [bisInvestigationNotes.authorId], references: [users.id] }),
}));
export const bisExportSchedulesRelations = relations(bisExportSchedules, ({ one }: { one: any }) => ({
  user: one(users, { fields: [bisExportSchedules.userId], references: [users.id] }),
}));
export const bisAutoFlagConfigRelations = relations(bisAutoFlagConfig, ({ many }: { many: any }) => ({
  flags: many(bisAutoFlags),
}));
export const bisAutoFlagsRelations = relations(bisAutoFlags, ({ one }: { one: any }) => ({
  user: one(users, { fields: [bisAutoFlags.userId], references: [users.id] }),
  investigation: one(bisInvestigations, { fields: [bisAutoFlags.bisInvestigationId], references: [bisInvestigations.id] }),
}));
export const bisKillSwitchActivationsRelations = relations(bisKillSwitchActivations, ({ one }: { one: any }) => ({
  user: one(users, { fields: [bisKillSwitchActivations.activatedBy], references: [users.id] }),
}));

// ─── Loyalty ─────────────────────────────────────────────────────────────────
/** loyaltyRewards — standalone (no direct FK accountId column, uses userId) */
export const loyaltyPartnersRelations = relations(loyaltyPartners, ({ many }: { many: any }) => ({
  referrals: many(loyaltyReferrals),
}));
export const loyaltyReferralsRelations = relations(loyaltyReferrals, ({ one }: { one: any }) => ({
  referrer: one(users, { fields: [loyaltyReferrals.referrerId], references: [users.id] }),
  referee: one(users, { fields: [loyaltyReferrals.refereeId], references: [users.id] }),
}));

// ─── Finance & Carbon ─────────────────────────────────────────────────────────
export const financeRequestsRelations = relations(financeRequests, ({ one }: { one: any }) => ({
  user: one(users, { fields: [financeRequests.userId], references: [users.id] }),
}));
export const carbonOffsetsRelations = relations(carbonOffsets, ({ one }: { one: any }) => ({
  user: one(users, { fields: [carbonOffsets.userId], references: [users.id] }),
}));
export const meshTransactionsRelations = relations(meshTransactions, ({ one }: { one: any }) => ({
  user: one(users, { fields: [meshTransactions.userId], references: [users.id] }),
}));

// ─── Service Health ───────────────────────────────────────────────────────────
export const serviceHealthAlertsRelations = relations(serviceHealthAlerts, ({ many }: { many: any }) => ({
  history: many(serviceHealthHistory),
}));
export const serviceHealthHistoryRelations = relations(serviceHealthHistory, ({ one }: { one: any }) => ({
  /** serviceHealthHistory — no direct FK to serviceHealthAlerts (uses serviceName) */
}));

// ─── Tourism Events ───────────────────────────────────────────────────────────
/** tourismEvents — standalone (no createdBy FK column) */

// ─── Remittances & PaymentSwitch ─────────────────────────────────────────────
export const remittancesRelations = relations(remittances, ({ one }: { one: any }) => ({
  user: one(users, { fields: [remittances.userId], references: [users.id] }),
}));
export const psParticipantsRelations = relations(psParticipants, ({ many }: { many: any }) => ({
  settlements: many(psSettlements),
  ledgerEntries: many(psLedgerEntries),
}));
export const psSettlementsRelations = relations(psSettlements, ({ one }: { one: any }) => ({
  participant: one(psParticipants, { fields: [psSettlements.participantId], references: [psParticipants.id] }),
}));
export const psLedgerEntriesRelations = relations(psLedgerEntries, ({ one }: { one: any }) => ({
  participant: one(psParticipants, { fields: [psLedgerEntries.participantId], references: [psParticipants.id] }),
}));
export const nocEventsRelations = relations(nocEvents, ({ one }: { one: any }) => ({
  /** nocEvents — resolvedBy is not a FK column (uses resolvedAt timestamp) */
}));
export const nocAlertThresholdsRelations = relations(nocAlertThresholds, ({ one }: { one: any }) => ({
  updatedByUser: one(users, { fields: [nocAlertThresholds.updatedBy], references: [users.id] }),
}));
export const psKillSwitchStateRelations = relations(psKillSwitchState, ({ many }: { many: any }) => ({
  killSwitches: many(psKillSwitches),
}));
export const psFraudRulesRelations = relations(psFraudRules, ({ one }: { one: any }) => ({
  creator: one(users, { fields: [psFraudRules.createdBy], references: [users.id] }),
}));
export const psKillSwitchesRelations = relations(psKillSwitches, ({ many }: { many: any }) => ({
  history: many(psKillSwitchHistory),
}));
export const psKillSwitchHistoryRelations = relations(psKillSwitchHistory, ({ one }: { one: any }) => ({
  actor: one(users, { fields: [psKillSwitchHistory.actorId], references: [users.id] }),
}));
export const psWebhooksRelations = relations(psWebhooks, ({ many }: { many: any }) => ({
  deliveries: many(psWebhookDeliveries),
}));
export const psWebhookDeliveriesRelations = relations(psWebhookDeliveries, ({ one }: { one: any }) => ({
  webhook: one(psWebhooks, { fields: [psWebhookDeliveries.webhookId], references: [psWebhooks.id] }),
}));
export const psCorridorRateLimitsRelations = relations(psCorridorRateLimits, ({ many }: { many: any }) => ({
  usage: many(psCorridorRateLimitUsage),
}));
export const psCorridorRateLimitUsageRelations = relations(psCorridorRateLimitUsage, ({ one }: { one: any }) => ({
  limit: one(psCorridorRateLimits, { fields: [psCorridorRateLimitUsage.corridor], references: [psCorridorRateLimits.corridor] }),
}));

// ─── User Auth & Preferences ──────────────────────────────────────────────────
export const rateAlertsRelations = relations(rateAlerts, ({ one }: { one: any }) => ({
  user: one(users, { fields: [rateAlerts.userId], references: [users.id] }),
}));
export const psApiKeysRelations = relations(psApiKeys, ({ one }: { one: any }) => ({
  user: one(users, { fields: [psApiKeys.userId], references: [users.id] }),
}));
export const psTwoFactorSettingsRelations = relations(psTwoFactorSettings, ({ one }: { one: any }) => ({
  user: one(users, { fields: [psTwoFactorSettings.userId], references: [users.id] }),
}));
export const psNotificationChannelsRelations = relations(psNotificationChannels, ({ one }: { one: any }) => ({
  user: one(users, { fields: [psNotificationChannels.userId], references: [users.id] }),
}));
export const psReminderEmailsRelations = relations(psReminderEmails, ({ one }: { one: any }) => ({
  user: one(users, { fields: [psReminderEmails.userId], references: [users.id] }),
}));
export const psAccountRecoveryRelations = relations(psAccountRecovery, ({ one }: { one: any }) => ({
  user: one(users, { fields: [psAccountRecovery.userId], references: [users.id] }),
}));
export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one }: { one: any }) => ({
  user: one(users, { fields: [pushSubscriptions.userId], references: [users.id] }),
}));
export const rolePermissionsRelations = relations(rolePermissions, ({ one }: { one: any }) => ({
  /** rolePermissions — grantedBy is stored as 'granted' boolean, not a FK */
}));

// ─── Tourist ─────────────────────────────────────────────────────────────────
export const touristProfilesRelations = relations(touristProfiles, ({ one, many }: { one: any; many: any }) => ({
  user: one(users, { fields: [touristProfiles.userId], references: [users.id] }),
  bookings: many(touristBookings),
  reviews: many(touristReviews),
  itineraries: many(touristItineraries),
  dealRedemptions: many(touristDealRedemptions),
  tripSummaries: many(touristTripSummaries),
}));
export const touristOnboardingStateRelations = relations(touristOnboardingState, ({ one }: { one: any }) => ({
  user: one(users, { fields: [touristOnboardingState.userId], references: [users.id] }),
}));
export const touristTripSummariesRelations = relations(touristTripSummaries, ({ one }: { one: any }) => ({
  user: one(users, { fields: [touristTripSummaries.userId], references: [users.id] }),
}));
export const touristBookingsRelations = relations(touristBookings, ({ one, many }: { one: any; many: any }) => ({
  user: one(users, { fields: [touristBookings.userId], references: [users.id] }),
  product: one(merchantProducts, { fields: [touristBookings.productId], references: [merchantProducts.id] }),
  reviews: many(touristReviews),
  itineraryItems: many(touristItineraryItems),
}));
export const touristReviewsRelations = relations(touristReviews, ({ one }: { one: any }) => ({
  user: one(users, { fields: [touristReviews.userId], references: [users.id] }),
  booking: one(touristBookings, { fields: [touristReviews.bookingId], references: [touristBookings.id] }),
  establishment: one(establishments, { fields: [touristReviews.establishmentId], references: [establishments.id] }),
}));
export const reviewSentimentCacheRelations = relations(reviewSentimentCache, ({ one }: { one: any }) => ({
  establishment: one(establishments, { fields: [reviewSentimentCache.establishmentId], references: [establishments.id] }),
}));
export const reviewSentimentHistoryRelations = relations(reviewSentimentHistory, ({ one }: { one: any }) => ({
  establishment: one(establishments, { fields: [reviewSentimentHistory.establishmentId], references: [establishments.id] }),
}));
export const touristDealsRelations = relations(touristDeals, ({ one, many }: { one: any; many: any }) => ({
  establishment: one(establishments, { fields: [touristDeals.establishmentId], references: [establishments.id] }),
  redemptions: many(touristDealRedemptions),
  wishlists: many(touristDealWishlists),
}));
export const touristItinerariesRelations = relations(touristItineraries, ({ one, many }: { one: any; many: any }) => ({
  user: one(users, { fields: [touristItineraries.userId], references: [users.id] }),
  items: many(touristItineraryItems),
  collaborators: many(itineraryCollaborators),
  changelog: many(itineraryChangelog),
}));
export const touristBudgetsRelations = relations(touristBudgets, ({ one }: { one: any }) => ({
  user: one(users, { fields: [touristBudgets.userId], references: [users.id] }),
}));
export const touristConciergeSessionsRelations = relations(touristConciergeSessions, ({ one, many }: { one: any; many: any }) => ({
  user: one(users, { fields: [touristConciergeSessions.userId], references: [users.id] }),
  messages: many(tripPlannerMessages),
}));
export const touristTopupsRelations = relations(touristTopups, ({ one }: { one: any }) => ({
  user: one(users, { fields: [touristTopups.userId], references: [users.id] }),
}));
export const touristDealRedemptionsRelations = relations(touristDealRedemptions, ({ one }: { one: any }) => ({
  user: one(users, { fields: [touristDealRedemptions.userId], references: [users.id] }),
  deal: one(touristDeals, { fields: [touristDealRedemptions.dealId], references: [touristDeals.id] }),
  establishment: one(establishments, { fields: [touristDealRedemptions.establishmentId], references: [establishments.id] }),
}));
export const touristDealWishlistsRelations = relations(touristDealWishlists, ({ one }: { one: any }) => ({
  user: one(users, { fields: [touristDealWishlists.userId], references: [users.id] }),
  deal: one(touristDeals, { fields: [touristDealWishlists.dealId], references: [touristDeals.id] }),
}));
export const touristItineraryItemsRelations = relations(touristItineraryItems, ({ one }: { one: any }) => ({
  itinerary: one(touristItineraries, { fields: [touristItineraryItems.itineraryId], references: [touristItineraries.id] }),
  establishment: one(establishments, { fields: [touristItineraryItems.establishmentId], references: [establishments.id] }),
  booking: one(touristBookings, { fields: [touristItineraryItems.bookingId], references: [touristBookings.id] }),
  deal: one(touristDeals, { fields: [touristItineraryItems.dealId], references: [touristDeals.id] }),
}));
export const itineraryCollaboratorsRelations = relations(itineraryCollaborators, ({ one }: { one: any }) => ({
  itinerary: one(touristItineraries, { fields: [itineraryCollaborators.itineraryId], references: [touristItineraries.id] }),
  user: one(users, { fields: [itineraryCollaborators.userId], references: [users.id] }),
}));
export const itineraryChangelogRelations = relations(itineraryChangelog, ({ one }: { one: any }) => ({
  itinerary: one(touristItineraries, { fields: [itineraryChangelog.itineraryId], references: [touristItineraries.id] }),
  user: one(users, { fields: [itineraryChangelog.userId], references: [users.id] }),
}));

// ─── QR Payments ─────────────────────────────────────────────────────────────
export const qrPaymentTokensRelations = relations(qrPaymentTokens, ({ one, many }: { one: any; many: any }) => ({
  establishment: one(establishments, { fields: [qrPaymentTokens.establishmentId], references: [establishments.id] }),
  paidByUser: one(users, { fields: [qrPaymentTokens.paidByUserId], references: [users.id] }),
  receipts: many(qrPaymentReceipts),
}));
export const qrPaymentReceiptsRelations = relations(qrPaymentReceipts, ({ one }: { one: any }) => ({
  token: one(qrPaymentTokens, { fields: [qrPaymentReceipts.token], references: [qrPaymentTokens.token] }),
  tourist: one(users, { fields: [qrPaymentReceipts.touristUserId], references: [users.id] }),
  establishment: one(establishments, { fields: [qrPaymentReceipts.establishmentId], references: [establishments.id] }),
}));

// ─── Merchant & Staff ─────────────────────────────────────────────────────────
export const merchantProductsRelations = relations(merchantProducts, ({ one, many }: { one: any; many: any }) => ({
  establishment: one(establishments, { fields: [merchantProducts.establishmentId], references: [establishments.id] }),
  bookings: many(touristBookings),
}));
export const merchantPayoutSchedulesRelations = relations(merchantPayoutSchedules, ({ one }: { one: any }) => ({
  merchant: one(users, { fields: [merchantPayoutSchedules.merchantId], references: [users.id] }),
}));
export const staffInvitesRelations = relations(staffInvites, ({ one }: { one: any }) => ({
  inviter: one(users, { fields: [staffInvites.inviterUserId], references: [users.id] }),
  acceptedBy: one(users, { fields: [staffInvites.acceptedByUserId], references: [users.id] }),
  establishment: one(establishments, { fields: [staffInvites.establishmentId], references: [establishments.id] }),
}));

// ─── Establishment Score & Channel ────────────────────────────────────────────
export const establishmentScoreSnapshotsRelations = relations(establishmentScoreSnapshots, ({ one }: { one: any }) => ({
  establishment: one(establishments, { fields: [establishmentScoreSnapshots.establishmentId], references: [establishments.id] }),
}));
export const serviceAvailabilityRelations = relations(serviceAvailability, ({ one }: { one: any }) => ({
  establishment: one(establishments, { fields: [serviceAvailability.establishmentId], references: [establishments.id] }),
}));
export const channelConnectionsRelations = relations(channelConnections, ({ one }: { one: any }) => ({
  establishment: one(establishments, { fields: [channelConnections.establishmentId], references: [establishments.id] }),
}));
export const exchangeRateOverridesRelations = relations(exchangeRateOverrides, ({ one }: { one: any }) => ({
  creator: one(users, { fields: [exchangeRateOverrides.createdByUserId], references: [users.id] }),
}));

// ─── KYC ─────────────────────────────────────────────────────────────────────
export const kycVerificationRecordsRelations = relations(kycVerificationRecords, ({ one }: { one: any }) => ({
  user: one(users, { fields: [kycVerificationRecords.userId], references: [users.id] }),
}));

// ─── Stablecoin & LP ─────────────────────────────────────────────────────────
export const stablecoinOnrampOrdersRelations = relations(stablecoinOnrampOrders, ({ one }: { one: any }) => ({
  user: one(users, { fields: [stablecoinOnrampOrders.userId], references: [users.id] }),
}));
export const stablecoinOfframpRequestsRelations = relations(stablecoinOfframpRequests, ({ one }: { one: any }) => ({
  user: one(users, { fields: [stablecoinOfframpRequests.userId], references: [users.id] }),
}));
export const stablecoinLimitOrdersRelations = relations(stablecoinLimitOrders, ({ one }: { one: any }) => ({
  user: one(users, { fields: [stablecoinLimitOrders.userId], references: [users.id] }),
}));
export const stablecoinYieldPositionsRelations = relations(stablecoinYieldPositions, ({ one }: { one: any }) => ({
  user: one(users, { fields: [stablecoinYieldPositions.userId], references: [users.id] }),
}));
export const lpApplicationsRelations = relations(lpApplications, ({ one }: { one: any }) => ({
  user: one(users, { fields: [lpApplications.userId], references: [users.id] }),
}));
export const lpProvidersRelations = relations(lpProviders, ({ many }: { many: any }) => ({
  applications: many(lpApplications),
  positions: many(lpPositions),
  rewards: many(lpRewards),
  poolSnapshots: many(lpPoolSnapshots),
  withdrawals: many(lpWithdrawals),
  rebalanceEvents: many(lpRebalanceEvents),
}));
export const lpPositionsRelations = relations(lpPositions, ({ one }: { one: any }) => ({
  user: one(users, { fields: [lpPositions.userId], references: [users.id] }),
}));
/** lpRewards — uses lpId/poolId (no direct FK to lpProviders) */
/** lpPoolSnapshots — uses poolId (no direct FK to lpProviders) */
export const lpWithdrawalsRelations = relations(lpWithdrawals, ({ one }: { one: any }) => ({
  user: one(users, { fields: [lpWithdrawals.userId], references: [users.id] }),
}));
/** lpRebalanceEvents — uses fromPool/toPool text fields, no direct FK */

// ─── Smart Contracts ─────────────────────────────────────────────────────────
export const smartContractDeploymentsRelations = relations(smartContractDeployments, ({ many }: { many: any }) => ({
  events: many(smartContractEvents),
}));
/** smartContractEvents — contractName is a text field, not a FK */

// ─── Agent Network ────────────────────────────────────────────────────────────
export const cashLoadOrdersRelations = relations(cashLoadOrders, ({ one }: { one: any }) => ({
  agent: one(agentsTable, { fields: [cashLoadOrders.agentId], references: [agentsTable.id] }),
  user: one(users, { fields: [cashLoadOrders.userId], references: [users.id] }),
}));
export const agentKycVerificationsRelations = relations(agentKycVerifications, ({ one }: { one: any }) => ({
  agent: one(agentsTable, { fields: [agentKycVerifications.agentId], references: [agentsTable.id] }),
  tourist: one(users, { fields: [agentKycVerifications.touristUserId], references: [users.id] }),
}));

// ─── Transfers & Payments ─────────────────────────────────────────────────────
export const bankTransfersOutRelations = relations(bankTransfersOut, ({ one }: { one: any }) => ({
  user: one(users, { fields: [bankTransfersOut.userId], references: [users.id] }),
}));
export const savedBeneficiariesRelations = relations(savedBeneficiaries, ({ one }: { one: any }) => ({
  user: one(users, { fields: [savedBeneficiaries.userId], references: [users.id] }),
}));
export const paymentLinksRelations = relations(paymentLinks, ({ one }: { one: any }) => ({
  creator: one(users, { fields: [paymentLinks.creatorId], references: [users.id] }),
}));
export const moneyRequestsRelations = relations(moneyRequests, ({ one }: { one: any }) => ({
  requester: one(users, { fields: [moneyRequests.requesterId], references: [users.id] }),
  payer: one(users, { fields: [moneyRequests.payerId], references: [users.id] }),
}));
export const rideBookingsRelations = relations(rideBookings, ({ one }: { one: any }) => ({
  user: one(users, { fields: [rideBookings.userId], references: [users.id] }),
}));
export const nfcPaymentTokensRelations = relations(nfcPaymentTokens, ({ one }: { one: any }) => ({
  user: one(users, { fields: [nfcPaymentTokens.userId], references: [users.id] }),
}));
export const bankTravelNotificationsRelations = relations(bankTravelNotifications, ({ one }: { one: any }) => ({
  user: one(users, { fields: [bankTravelNotifications.userId], references: [users.id] }),
}));
export const esimOrdersRelations = relations(esimOrders, ({ one }: { one: any }) => ({
  user: one(users, { fields: [esimOrders.userId], references: [users.id] }),
}));
export const currencyCorridorsRelations = relations(currencyCorridors, ({ many }: { many: any }) => ({
  rateLimits: many(psCorridorRateLimits),
}));
export const preTravelChecklistsRelations = relations(preTravelChecklists, ({ one }: { one: any }) => ({
  user: one(users, { fields: [preTravelChecklists.userId], references: [users.id] }),
}));
export const kycFastTrackHistoryRelations = relations(kycFastTrackHistory, ({ one }: { one: any }) => ({
  user: one(users, { fields: [kycFastTrackHistory.userId], references: [users.id] }),
}));
export const offlineTokenRenewalsRelations = relations(offlineTokenRenewals, ({ one }: { one: any }) => ({
  user: one(users, { fields: [offlineTokenRenewals.userId], references: [users.id] }),
}));
export const countryRiskCacheRelations = relations(countryRiskCache, ({ many }: { many: any }) => ({
  travelRiskAssessments: many(travelRiskAssessments),
}));
export const travelRiskAssessmentsRelations = relations(travelRiskAssessments, ({ one }: { one: any }) => ({
  user: one(users, { fields: [travelRiskAssessments.userId], references: [users.id] }),
}));

// ─── Tax & GDS ────────────────────────────────────────────────────────────────
export const tipConfigsRelations = relations(tipConfigs, ({ one }: { one: any }) => ({
  establishment: one(establishments, { fields: [tipConfigs.establishmentId], references: [establishments.id] }),
}));
/** taxRemittanceTracker — standalone (no direct FK to establishments, uses jurisdictionCode) */
/** taxRulesCustom — standalone (no direct FK to establishments, uses jurisdictionCode) */
/** gdsBookingTaxes — uses reservationId (external GDS reference, no direct FK) */
/** gdsStaffTips — uses tipGroupId (external GDS reference, no direct FK) */
export const gdsLoyaltyEarningsRelations = relations(gdsLoyaltyEarnings, ({ one }: { one: any }) => ({
  booking: one(touristBookings, { fields: [gdsLoyaltyEarnings.bookingId], references: [touristBookings.id] }),
}));
export const gdsItineraryConversionsRelations = relations(gdsItineraryConversions, ({ one }: { one: any }) => ({
  itinerary: one(touristItineraries, { fields: [gdsItineraryConversions.itineraryId], references: [touristItineraries.id] }),
}));
/** gdsDemandForecasts — uses countryCode (no direct FK to establishments) */
export const taxRulesRelations = relations(taxRules, ({ many }: { many: any }) => ({
  taxRulesCustom: many(taxRulesCustom),
}));

// ─── Kill Switch Schedules ────────────────────────────────────────────────────
export const killSwitchSchedulesRelations = relations(killSwitchSchedules, ({ one }: { one: any }) => ({
  creator: one(users, { fields: [killSwitchSchedules.createdBy], references: [users.id] }),
}));

// ─── Dapr & Infrastructure ────────────────────────────────────────────────────
export const daprSubscriptionsRelations = relations(daprSubscriptions, ({ many }: { many: any }) => ({
  stateEntries: many(daprStateEntries),
}));
export const daprStateEntriesRelations = relations(daprStateEntries, ({ one }: { one: any }) => ({
  /** daprStateEntries — no direct FK to daprSubscriptions (uses storeName/stateKey) */
}));
