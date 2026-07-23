import { z } from "zod";
import crypto from "node:crypto";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { eq } from "drizzle-orm";
import { users } from "../drizzle/schema";
import { bisRouter } from "./routers/bis";
import { bisReportRouter } from "./routers/bisReport";
import { kybDocumentsRouter } from "./routers/kybDocuments";
import { kybRouter } from "./routers/kyb";
import { africaRouter } from "./routers/africa";
import { copilotRouter } from "./routers/copilot";
import { socRouter } from "./routers/security";
import { adminRouter } from "./routers/admin";
import { notificationsRouter } from "./routers/notifications";
import { kybApplicationsRouter } from "./routers/kybApplications";
import { bisJobsRouter } from "./routers/bisJobs";
import { notificationPreferencesRouter } from "./routers/notificationPreferences";
import { auditLogsRouter } from "./routers/auditLogs";
import { searchRouter } from "./routers/search";
import { bisModuleEditorRouter, kybComplianceRouter } from "./routers/bisModuleEditor";
import { csvExportRouter } from "./routers/csvExport";
import { usersAdminRouter } from "./routers/usersAdmin";
import { walletRouter } from "./routers/wallet";
import { loyaltyRouter } from "./routers/loyalty";
import { embeddedFinanceRouter } from "./routers/embeddedFinance";
import { biometricRouter } from "./routers/biometric";
import { identityRouter } from "./routers/identity";
import { sustainabilityRouter } from "./routers/sustainability";
import { meshPaymentsRouter } from "./routers/meshPayments";
import { serviceProxyRouter } from "./routers/serviceProxy";
import { bisIntegrationRouter } from "./routers/bisIntegration";
import { qrPaymentRouter } from "./routers/qrPayment";
import { touristOnboardingRouter } from "./routers/touristOnboarding";
import { touristPortalRouter } from "./routers/touristPortal";
import { merchantRevenueRouter } from "./routers/merchantRevenue";
import { pushRouter } from "./routers/push";
import { settlementRouter } from "./routers/settlement";
import { payoutScheduleRouter } from "./routers/payoutSchedule";
import { tripSummaryRouter } from "./routers/tripSummary";
import { itineraryRouter } from "./routers/itinerary";
import { merchantProductsRouter } from "./routers/merchantProducts";
import { serviceAvailabilityRouter } from "./routers/serviceAvailability";
import { merchantBookingsRouter } from "./routers/merchantBookings";
import { staffInvitesRouter } from "./routers/staffInvites";
import { exchangeRatesRouter } from "./routers/exchangeRates";
import { exchangeRateOverridesRouter } from "./routers/exchangeRateOverrides";
import { haConfigRouter } from "./routers/haConfig";
import { stripeConnectRouter } from "./routers/stripeConnect";
import { pythonServicesRouter } from "./routers/pythonServices";
import { analyticsRouter as crossPlatformAnalyticsRouter } from "./routers/analytics";
import { emailPreviewRouter } from "./routers/emailPreview";
import { kycRouter } from "./routers/kyc";
import { nocDashboardRouter } from "./routers/nocDashboard";
import { channelManagerRouter } from "./routers/channelManager";
import { stablecoinSwapRouter } from "./routers/stablecoinSwap";
import { liquidityProviderRouter } from "./routers/liquidityProvider";
import { smartContractRouter } from "./routers/smartContract";
import { foreignTouristLoadingRouter } from "./routers/foreignTouristLoading";
import { localPaymentsRouter } from "./routers/localPayments";
import { travelReadinessRouter } from "./routers/travelReadiness";
import { tripPlannerRouter } from "./routers/tripPlanner";
import { tippingRouter } from "./routers/tipping";
import { multiTippingRouter } from "./routers/multiTipping";
import { taxCollectionRouter } from "./routers/taxCollection";
import { gdsIntegrationRouter } from "./routers/gdsIntegration";
import { mobileMerchantRouter, mobileTouristRouter, mobilePaymentSwitchRouter, mobileBookingsRouter } from "./routers/mobileAggregates";
import { fundFlowRouter } from "./routers/fundFlow";
import { taxRemittanceRouter } from "./routers/taxRemittance";
import { enairaRouter } from "./routers/enaira";
import { killSwitchRouter } from "./routers/killSwitch";
import { webhooksRouter } from "./routers/webhooks";
import { corridorRateLimitRouter } from "./routers/corridorRateLimit";
// Auto-registered routers
import { adminDashboardRouter } from "./routers/adminDashboard";
import { advancedAuditLogViewerRouter } from "./routers/advancedAuditLogViewer";
import { advancedLoadingStatesRouter } from "./routers/advancedLoadingStates";
import { advancedRateLimiterRouter } from "./routers/advancedRateLimiter";
import { advancedSearchFilteringRouter } from "./routers/advancedSearchFiltering";
import { agentRouter } from "./routers/agent";
import { agentBankingRouter } from "./routers/agentBanking";
import { agentCommissionCalcRouter } from "./routers/agentCommissionCalc";
import { agentCommunicationHubRouter } from "./routers/agentCommunicationHub";
import { agentGamificationRouter } from "./routers/agentGamification";
import { agentHierarchyRouter } from "./routers/agentHierarchy";
import { agentInventoryMgmtRouter } from "./routers/agentInventoryMgmt";
import { agentLoanAdvanceRouter } from "./routers/agentLoanAdvance";
import { agentLoanFacilityRouter } from "./routers/agentLoanFacility";
import { agentMicroInsuranceRouter } from "./routers/agentMicroInsurance";
import { agentOnboardingRouter } from "./routers/agentOnboarding";
import { agentOnboardingWizardRouter } from "./routers/agentOnboardingWizard";
import { agentPerformanceLeaderboardRouter } from "./routers/agentPerformanceLeaderboard";
import { agentTerritoryMgmtRouter } from "./routers/agentTerritoryMgmt";
import { agentTrainingRouter } from "./routers/agentTraining";
import { aiCashFlowPredictorRouter } from "./routers/aiCashFlowPredictor";
import { aiChatSupportRouter } from "./routers/aiChatSupport";
import { analyticsQueryRouter } from "./routers/analyticsQuery";
import { announcementReactionsRouter } from "./routers/announcementReactions";
import { apiAnalyticsDashRouter } from "./routers/apiAnalyticsDash";
import { apiVersioningRouter } from "./routers/apiVersioning";
import { autoComplianceWorkflowRouter } from "./routers/autoComplianceWorkflow";
import { automatedSettlementSchedulerRouter } from "./routers/automatedSettlementScheduler";
import { automatedTestingFrameworkRouter } from "./routers/automatedTestingFramework";
import { backupDisasterRecoveryRouter } from "./routers/backupDisasterRecovery";
import { bankAccountManagementRouter } from "./routers/bankAccountManagement";
import { bankingWorkflowPatternsRouter } from "./routers/bankingWorkflowPatterns";
import { batchProcessingRouter } from "./routers/batchProcessing";
import { billingInvoiceRouter } from "./routers/billingInvoice";
import { biometricAuthGatewayRouter } from "./routers/biometricAuthGateway";
import { blockchainAuditTrailRouter } from "./routers/blockchainAuditTrail";
import { broadcastAnnouncementsRouter } from "./routers/broadcastAnnouncements";
import { bulkTransactionProcessingRouter } from "./routers/bulkTransactionProcessing";
import { businessRulesRouter } from "./routers/businessRules";
import { canaryReleaseManagerRouter } from "./routers/canaryReleaseManager";
import { carrierSlaRouter } from "./routers/carrierSla";
import { carrierSwitchingRouter } from "./routers/carrierSwitching";
import { cbdcIntegrationGatewayRouter } from "./routers/cbdcIntegrationGateway";
import { cbnReportingRouter } from "./routers/cbnReporting";
import { cdnCacheManagerRouter } from "./routers/cdnCacheManager";
import { chaosEngineeringConsoleRouter } from "./routers/chaosEngineeringConsole";
import { chargebackManagementRouter } from "./routers/chargebackManagement";
import { chatRouter } from "./routers/chat";
import { commissionCascadeHistoryRouter } from "./routers/commissionCascadeHistoryCrud";
import { commissionPayoutsRouter } from "./routers/commissionPayouts";
import { complianceFilingRouter } from "./routers/complianceFiling";
import { complianceTrainingTrackerRouter } from "./routers/complianceTrainingTracker";
import { connectionPoolMonitorRouter } from "./routers/connectionPoolMonitor";
import { cqrsEventStoreRouter } from "./routers/cqrsEventStore";
import { customerRouter } from "./routers/customer";
import { customer360ViewRouter } from "./routers/customer360View";
import { customerLoyaltyProgramRouter } from "./routers/customerLoyaltyProgram";
import { customerSegmentationEngineRouter } from "./routers/customerSegmentationEngine";
import { customerWalletSystemRouter } from "./routers/customerWalletSystem";
import { dbSchemaMigrationManagerRouter } from "./routers/dbSchemaMigrationManager";
import { decentralizedIdentityManagerRouter } from "./routers/decentralizedIdentityManager";
import { digitalTwinSimulatorRouter } from "./routers/digitalTwinSimulator";
import { disputeMediationAIRouter } from "./routers/disputeMediationAI";
import { disputeResolutionRouter } from "./routers/disputeResolution";
import { disputeWorkflowEngineRouter } from "./routers/disputeWorkflowEngine";
import { distributedTracingDashRouter } from "./routers/distributedTracingDash";
import { documentManagementRouter } from "./routers/documentManagement";
import { dynamicFeeEngineRouter } from "./routers/dynamicFeeEngine";
import { dynamicPricingEngineRouter } from "./routers/dynamicPricingEngine";
import { erpRouter } from "./routers/erp";
import { esgCarbonTrackerRouter } from "./routers/esgCarbonTracker";
import { financialNlEngineRouter } from "./routers/financialNlEngine";
import { financialReconciliationDashRouter } from "./routers/financialReconciliationDash";
import { floatTopUpRouter } from "./routers/floatTopUp";
import { fraudCaseManagementRouter } from "./routers/fraudCaseManagement";
import { gdprRouter } from "./routers/gdpr";
import { generalLedgerRouter } from "./routers/generalLedger";
import { graphqlFederationRouter } from "./routers/graphqlFederation";
import { graphqlSubscriptionGatewayRouter } from "./routers/graphqlSubscriptionGateway";
import { guideFeedbackRouter } from "./routers/guideFeedback";
import { apiDocsRouter } from "./routers/apiDocs";
import { incidentCommandCenterRouter } from "./routers/incidentCommandCenter";
import { inviteCodesRouter } from "./routers/inviteCodes";
import { kycDocumentManagementRouter } from "./routers/kycDocumentManagement";
import { lakehouseRouter } from "./routers/lakehouse";
import { billingLedgerRouter } from "./routers/billingLedger";
import { activityAuditLogRouter } from "./routers/activityAuditLog";
import { managementRouter } from "./routers/management";
import { mdmRouter } from "./routers/mdm";
import { merchantAnalyticsDashRouter } from "./routers/merchantAnalyticsDash";
import { merchantOnboardingPortalRouter } from "./routers/merchantOnboardingPortal";
import { merchantPayoutSettlementRouter } from "./routers/merchantPayoutSettlement";
import { middlewareServiceManagerRouter } from "./routers/middlewareServiceManager";
import { mobileApiLayerRouter } from "./routers/mobileApiLayer";
import { mqttBridgeRouter } from "./routers/mqttBridge";
import { multiChannelPaymentOrchRouter } from "./routers/multiChannelPaymentOrch";
import { multiCurrencyRouter } from "./routers/multiCurrency";
import { nlAnalyticsQueryRouter } from "./routers/nlAnalyticsQuery";
import { nlFinancialQueryRouter } from "./routers/nlFinancialQuery";
import { offlinePosModeRouter } from "./routers/offlinePosMode";
import { partnerOnboardingRouter } from "./routers/partnerOnboarding";
import { partnerRevenueSharingRouter } from "./routers/partnerRevenueSharing";
import { partnerSelfServiceRouter } from "./routers/partnerSelfService";
import { paymentLinkGeneratorRouter } from "./routers/paymentLinkGenerator";
import { pinResetRouter } from "./routers/pinReset";
import { platformABTestingRouter } from "./routers/platformABTesting";
import { platformChangelogRouter } from "./routers/platformChangelog";
import { platformFeatureFlagsRouter } from "./routers/platformFeatureFlags";
import { platformMaturityScorecardRouter } from "./routers/platformMaturityScorecard";
import { platformRecommendationsRouter } from "./routers/platformRecommendations";
import { posFirmwareOTARouter } from "./routers/posFirmwareOTA";
import { posTerminalFleetRouter } from "./routers/posTerminalFleet";
import { publishReadinessCheckerRouter } from "./routers/publishReadinessChecker";
import { rateLimitEngineRouter } from "./routers/rateLimitEngine";
import { realtimeDashboardWidgetsRouter } from "./routers/realtimeDashboardWidgets";
import { realtimeNotificationsRouter } from "./routers/realtimeNotifications";
import { realtimeWebSocketFeedsRouter } from "./routers/realtimeWebSocketFeeds";
import { referralsRouter } from "./routers/referrals";
import { regulatoryFilingAutomationRouter } from "./routers/regulatoryFilingAutomation";
import { regulatoryReportingEngineRouter } from "./routers/regulatoryReportingEngine";
import { regulatorySandboxRouter } from "./routers/regulatorySandbox";
import { reportBuilderTemplatesRouter } from "./routers/reportBuilderTemplates";
import { reportSchedulerRouter } from "./routers/reportScheduler";
import { resilienceRouter } from "./routers/resilience";
import { revenueAnalyticsRouter } from "./routers/revenueAnalytics";
import { revenueForecastingEngineRouter } from "./routers/revenueForecastingEngine";
import { vaultSecretsRouter } from "./routers/vaultSecrets";
import { settlementNettingEngineRouter } from "./routers/settlementNettingEngine";
import { simOrchestratorRouter } from "./routers/simOrchestrator";
import { slaMonitoringDashRouter } from "./routers/slaMonitoringDash";
import { slaMonitoringRouter } from "./routers/slaMonitoring";
import { socialCommerceGatewayRouter } from "./routers/socialCommerceGateway";
import { supervisorRouter } from "./routers/supervisor";
import { systemConfigRouter } from "./routers/systemConfig";
import { systemMigrationToolsRouter } from "./routers/systemMigrationTools";
import { temporalWorkflowsRouter } from "./routers/temporalWorkflows";
import { tenantBillingOnboardingRouter } from "./routers/tenantBillingOnboarding";
import { transactionCsvExportRouter } from "./routers/transactionCsvExport";
import { transactionEnrichmentServiceRouter } from "./routers/transactionEnrichmentService";
import { transactionExportEngineRouter } from "./routers/transactionExportEngine";
import { transactionMapLoadingRouter } from "./routers/transactionMapLoading";
import { transactionMapVizRouter } from "./routers/transactionMapViz";
import { transactionMonitoringRouter } from "./routers/transactionMonitoring";
import { transactionReceiptGeneratorRouter } from "./routers/transactionReceiptGenerator";
import { transactionReconciliationRouter } from "./routers/transactionReconciliation";
import { txDisputeArbitrationRouter } from "./routers/txDisputeArbitration";
import { ussdLocalizationRouter } from "./routers/ussdLocalization";
import { ussdSessionReplayRouter } from "./routers/ussdSessionReplay";
import { voiceCommandPosRouter } from "./routers/voiceCommandPos";
import { whiteLabelApprovalRouter } from "./routers/whiteLabelApproval";
import { whiteLabelBrandingRouter } from "./routers/whiteLabelBranding";
import { whiteLabelOnboardingRouter } from "./routers/whiteLabelOnboarding";
import { caddyRouter } from "./routers/caddy";
import { workflowEngineRouter } from "./routers/workflowEngine";
import { accentColorRouter } from './routers/accentColor';
import { accountOpeningRouter } from './routers/accountOpening';
import { activeRouter } from './routers/active';
import { adminClearCooldownRouter } from './routers/adminClearCooldown';
import { adminDeviceHistoriesRouter } from './routers/adminDeviceHistories';
import { adminGetCooldownsRouter } from './routers/adminGetCooldowns';
import { adminProblematicDevicesRouter } from './routers/adminProblematicDevices';
import { advancedBiReportingRouter } from './routers/advancedBiReporting';
import { advancedNotificationsRouter } from './routers/advancedNotifications';
import { agentBalanceRouter } from './routers/agentBalance';
import { agentBankAccountsRouter } from './routers/agentBankAccountsCrud';
import { agentBenchmarkingRouter } from './routers/agentBenchmarking';
import { agentClusterAnalyticsRouter } from './routers/agentClusterAnalytics';
import { agentDeviceFingerprintRouter } from './routers/agentDeviceFingerprint';
import { agentFloatForecastingRouter } from './routers/agentFloatForecasting';
import { agentFloatInsuranceClaimsRouter } from './routers/agentFloatInsuranceClaims';
import { agentFloatTransferRouter } from './routers/agentFloatTransfer';
import { agentHierarchyTerritoryRouter } from './routers/agentHierarchyTerritory';
import { agentKycRouter } from './routers/agentKyc';
import { agentKycDocVaultRouter } from './routers/agentKycDocVault';
import { agentLeaderboardRouter } from './routers/agentLeaderboard';
import { agentLoanOriginationRouter } from './routers/agentLoanOrigination';
import { agentLoanOrigination2Router } from './routers/agentLoanOrigination2';
import { agentManagementRouter } from './routers/agentManagement';
import { agentMgmtRouter } from './routers/agentMgmt';
import { agentNetworkTopologyRouter } from './routers/agentNetworkTopology';
import { agentOnboardingWorkflowRouter } from './routers/agentOnboardingWorkflow';
import { agentPerformanceAnalyticsRouter } from './routers/agentPerformanceAnalytics';
import { agentPerformanceIncentivesRouter } from './routers/agentPerformanceIncentives';
import { agentPerformanceScorecardRouter } from './routers/agentPerformanceScorecard';
import { agentPerformanceScoresRouter } from './routers/agentPerformanceScoresCrud';
import { agentRevenueAttributionRouter } from './routers/agentRevenueAttribution';
import { agentScorecardRouter } from './routers/agentScorecard';
import { agentSuspensionLogRouter } from './routers/agentSuspensionLogCrud';
import { agentSuspensionWorkflowRouter } from './routers/agentSuspensionWorkflow';
import { agentTerritoryHeatmapRouter } from './routers/agentTerritoryHeatmap';
import { agentTerritoryOptimizerRouter } from './routers/agentTerritoryOptimizer';
import { agentTrainingAcademyRouter } from './routers/agentTrainingAcademy';
import { agentTrainingGamificationRouter } from './routers/agentTrainingGamification';
import { agentTrainingPortalRouter } from './routers/agentTrainingPortal';
import { aiMessageRouter } from './routers/aiMessage';
import { aiMonitoringRouter } from './routers/aiMonitoring';
import { airtimeVendingRouter } from './routers/airtimeVending';
import { alertNotificationsRouter } from './routers/alertNotifications';
import { amlScreeningRouter } from './routers/amlScreening';
import { analyticsDashboardRouter } from './routers/analyticsDashboard';
import { analyticsDashboardsRouter } from './routers/analyticsDashboardsCrud';
import { announcementsRouter } from './routers/announcements';
import { apacheAirflowRouter } from './routers/apacheAirflow';
import { apacheNifiRouter } from './routers/apacheNifi';
import { apiGatewayRouter } from './routers/apiGateway';
import { apiKeyManagementRouter } from './routers/apiKeyManagement';
import { apiRateLimiterDashRouter } from './routers/apiRateLimiterDash';
import { appVersionRouter } from './routers/appVersion';
import { archivalAdminRouter } from './routers/archivalAdmin';
import { artRobustnessRouter } from './routers/artRobustness';
import { auditExportRouter } from './routers/auditExport';
import { auditLogRouter } from './routers/auditLog';
import { auditTrailRouter } from './routers/auditTrail';
import { auditTrailExportRouter } from './routers/auditTrailExport';
import { autoReconciliationEngineRouter } from './routers/autoReconciliationEngine';
import { autoRenewRouter } from './routers/autoRenew';
import { automatedComplianceCheckerRouter } from './routers/automatedComplianceChecker';
import { avgScoreRouter } from './routers/avgScore';
import { backgroundColorRouter } from './routers/backgroundColor';
import { baseUrlRouter } from './routers/baseUrl';
import { biReportDefinitionsRouter } from './routers/biReportDefinitionsCrud';
import { billPaymentsRouter } from './routers/billPayments';
import { billingAuditRouter } from './routers/billingAudit';
import { billingLifecycleRouter } from './routers/billingLifecycle';
import { billingModelRouter } from './routers/billingModel';
import { billingProductionRouter } from './routers/billingProduction';
import { billingRbacRouter } from './routers/billingRbac';
import { billingRevenuePeriodsRouter } from './routers/billingRevenuePeriodsCrud';
import { biometricAuditDashboardRouter } from './routers/biometricAuditDashboard';
import { biometricAuthRouter } from './routers/biometricAuth';
import { brandNameRouter } from './routers/brandName';
import { bulkDisbursementEngineRouter } from './routers/bulkDisbursementEngine';
import { bulkNotifRouter } from './routers/bulkNotif';
import { bulkOperationsRouter } from './routers/bulkOperations';
import { bulkOpsRouter } from './routers/bulkOps';
import { bulkPaymentProcessorRouter } from './routers/bulkPaymentProcessor';
import { bulkRoleImportRouter } from './routers/bulkRoleImport';
import { bulkTransactionProcessorRouter } from './routers/bulkTransactionProcessor';
import { cacheRouter } from './routers/cache';
import { capacityPlanningRouter } from './routers/capacityPlanning';
import { cardBinLookupRouter } from './routers/cardBinLookup';
import { cardRequestRouter } from './routers/cardRequest';
import { carrierCostRouter } from './routers/carrierCost';
import { carrierLivePricingRouter } from './routers/carrierLivePricing';
import { cbnMetricsRouter } from './routers/cbnMetrics';
import { certificatesActiveRouter } from './routers/certificatesActive';
import { changelogRouter } from './routers/changelog';
import { checkRegistrationStatusRouter } from './routers/checkRegistrationStatus';
import { claimChallengeRouter } from './routers/claimChallenge';
import { clientIdRouter } from './routers/clientId';
import { closeSessionRouter } from './routers/closeSession';
import { cocoIndexPipelineRouter } from './routers/cocoIndexPipeline';
import { commentsRouter } from './routers/comments';
import { commissionCalculatorRouter } from './routers/commissionCalculator';
import { commissionClawbackRouter } from './routers/commissionClawback';
import { commissionEngineRouter } from './routers/commissionEngine';
import { completedRouter } from './routers/completed';
import { complianceAutomationRouter } from './routers/complianceAutomation';
import { complianceCertManagerRouter } from './routers/complianceCertManager';
import { complianceChatbotRouter } from './routers/complianceChatbot';
import { complianceRateRouter } from './routers/complianceRate';
import { complianceReportingRouter } from './routers/complianceReporting';
import { configManagementRouter } from './routers/configManagement';
import { contractEndDateRouter } from './routers/contractEndDate';
import { createRuleRouter } from './routers/createRule';
import { crossBorderRemittanceRouter } from './routers/crossBorderRemittance';
import { crossBorderRemittanceHubRouter } from './routers/crossBorderRemittanceHub';
import { currencyRouter } from './routers/currency';
import { currencyHedgingRouter } from './routers/currencyHedging';
import { customer360Router } from './routers/customer360';
import { customerDatabaseRouter } from './routers/customerDatabase';
import { customerDisputePortalRouter } from './routers/customerDisputePortal';
import { customerFeedbackNpsRouter } from './routers/customerFeedbackNps';
import { customerJourneyAnalyticsRouter } from './routers/customerJourneyAnalytics';
import { customer_journey_eventsRouter } from './routers/customerJourneyEventsCrud';
import { customerJourneyMapperRouter } from './routers/customerJourneyMapper';
import { customerOnboardingPipelineRouter } from './routers/customerOnboardingPipeline';
import { customerSurveysRouter } from './routers/customerSurveys';
import { dailyPnlReportRouter } from './routers/dailyPnlReport';
import { dashboardLayoutRouter } from './routers/dashboardLayout';
import { dataConsentRecordsRouter } from './routers/dataConsentRecordsCrud';
import { dataExportRouter } from './routers/dataExport';
import { dataExportHubRouter } from './routers/dataExportHub';
import { dataExportImportRouter } from './routers/dataExportImport';
import { dataExportRouter } from './routers/dataExportRouter';
import { dataQualityRouter } from './routers/dataQuality';
import { dataRetentionPolicyRouter } from './routers/dataRetentionPolicy';
import { dataThresholdAlertsRouter } from './routers/dataThresholdAlerts';
import { databaseRouter } from './routers/database';
import { databaseVisualizationRouter } from './routers/databaseVisualization';
import { dbSchemaPushRouter } from './routers/dbSchemaPush';
import { dbtIntegrationRouter } from './routers/dbtIntegration';
import { deepfaceRouter } from './routers/deepface';
import { deleteCommentRouter } from './routers/deleteComment';
import { deleteRuleRouter } from './routers/deleteRule';
import { devPortalRouter } from './routers/devPortal';
import { developerPortalRouter } from './routers/developerPortal';
import { deviceFleetManagerRouter } from './routers/deviceFleetManager';
import { disputeAnalyticsRouter } from './routers/disputeAnalytics';
import { disputeNotificationsRouter } from './routers/disputeNotifications';
import { disputeRefundRouter } from './routers/disputeRefund';
import { disputesRouter } from './routers/disputes';
import { dragDropReportBuilderRouter } from './routers/dragDropReportBuilder';
import { dynamicFeeCalculatorRouter } from './routers/dynamicFeeCalculator';
import { dynamicQrPaymentRouter } from './routers/dynamicQrPayment';
import { e2eTestFrameworkRouter } from './routers/e2eTestFramework';
import { ecommerceCartRouter } from './routers/ecommerceCart';
import { ecommerceCatalogRouter } from './routers/ecommerceCatalog';
import { ecommerceOrdersRouter } from './routers/ecommerceOrders';
import { emailDeliveryLogRouter } from './routers/emailDeliveryLogCrud';
import { emailNotificationsRouter } from './routers/emailNotifications';
import { emojiRouter } from './routers/emoji';
import { enabledRouter } from './routers/enabled';
import { encryptedFieldsRouter } from './routers/encryptedFieldsCrud';
import { eodReconciliationRouter } from './routers/eodReconciliation';
import { erpTypeRouter } from './routers/erpType';
import { errorRouter } from './routers/error';
import { escalateRouter } from './routers/escalate';
import { escalationChainsRouter } from './routers/escalationChains';
import { eventDrivenArchRouter } from './routers/eventDrivenArch';
import { executiveCommandCenterRouter } from './routers/executiveCommandCenter';
import { expiringIn30DaysRouter } from './routers/expiringIn30Days';
import { exportRouter } from './routers/export';
import { faceEnrollmentRouter } from './routers/faceEnrollment';
import { failedRouter } from './routers/failed';
import { falkordbGraphRouter } from './routers/falkordbGraph';
import { featureFlagsRouter } from './routers/featureFlags';
import { fieldMappingsRouter } from './routers/fieldMappings';
import { financialReportingSuiteRouter } from './routers/financialReportingSuite';
import { firmwareVersionRouter } from './routers/firmwareVersion';
import { firstNameRouter } from './routers/firstName';
import { floatManagementRouter } from './routers/floatManagement';
import { floatReconciliationRouter } from './routers/floatReconciliation';
import { floatReconciliationsRouter } from './routers/floatReconciliationsCrud';
import { fontFamilyRouter } from './routers/fontFamily';
import { fraudRouter } from './routers/fraud';
import { fraudMlScoringEngineRouter } from './routers/fraudMlScoringEngine';
import { fraudRealtimeVizRouter } from './routers/fraudRealtimeViz';
import { fraudReportRouter } from './routers/fraudReport';
import { fraudReportGeneratorRouter } from './routers/fraudReportGenerator';
import { fxRatesRouter } from './routers/fxRates';
import { gatewayHealthMonitorRouter } from './routers/gatewayHealthMonitor';
import { geoFenceDedicatedRouter } from './routers/geoFenceDedicated';
import { geoFencesRouter } from './routers/geoFencesCrud';
import { geofencingRouter as geoFencingRouter } from './routers/geofencing';
import { geoFencingDedicatedRouter } from './routers/geoFencingDedicated';
import { geofencingRouter } from './routers/geofencing';
import { getCheckerStatusRouter } from './routers/getCheckerStatus';
import { getDashboardRouter } from './routers/getDashboard';
import { getErpSyncStatsRouter } from './routers/getErpSyncStats';
import { getHistoryRouter } from './routers/getHistory';
import { getLastRunRouter } from './routers/getLastRun';
import { getLiveStatsRouter } from './routers/getLiveStats';
import { getMqttThroughputRouter } from './routers/getMqttThroughput';
import { getOutstandingRouter } from './routers/getOutstanding';
import { getProfileRouter } from './routers/getProfile';
import { getRankingsRouter } from './routers/getRankings';
import { getRecommendationRouter } from './routers/getRecommendation';
import { getSettlementsRouter } from './routers/getSettlements';
import { getStatsRouter } from './routers/getStats';
import { getSwitchStatsRouter } from './routers/getSwitchStats';
import { getTransactionsRouter } from './routers/getTransactions';
import { gl_accountsRouter } from './routers/glAccountsCrud';
import { gl_journal_entriesRouter } from './routers/glJournalEntriesCrud';
import { globalSearchRouter } from './routers/globalSearch';
import { goServiceBridgeRouter } from './routers/goServiceBridge';
import { healthRouter } from './routers/health';
import { healthCheckRouter } from './routers/healthCheck';
import { healthMonitorRouter } from './routers/healthMonitor';
import { healthyRouter } from './routers/healthy';
import { helpDeskRouter } from './routers/helpDesk';
import { hourlyStatsRouter } from './routers/hourlyStats';
import { inProgressRouter } from './routers/inProgress';
import { incidentManagementRouter } from './routers/incidentManagement';
import { incidentPlaybookRouter } from './routers/incidentPlaybook';
import { insuranceProductsRouter } from './routers/insuranceProducts';
import { integrationMarketplaceRouter } from './routers/integrationMarketplace';
import { intelligentRoutingEngineRouter } from './routers/intelligentRoutingEngine';
import { ipAddressRouter } from './routers/ipAddress';
import { isLiveRouter } from './routers/isLive';
import { isRegisteringRouter } from './routers/isRegistering';
import { itemsRouter } from './routers/items';
import { kafkaRouter } from './routers/kafka';
import { kafkaConsumerRouter } from './routers/kafkaConsumer';
import { kafkaTopicPrefixRouter } from './routers/kafkaTopicPrefix';
import { keepAliveSecondsRouter } from './routers/keepAliveSeconds';
import { kycDocumentsRouter } from './routers/kycDocumentsCrud';
import { kycEnforcementRouter } from './routers/kycEnforcement';
import { kycLevelRouter } from './routers/kycLevel';
import { lakehouseAiIntegrationRouter } from './routers/lakehouseAiIntegration';
import { lastSyncAtRouter } from './routers/lastSyncAt';
import { lastSyncStatusRouter } from './routers/lastSyncStatus';
import { lastTestStatusRouter } from './routers/lastTestStatus';
import { lengthRouter } from './routers/length';
import { listAccountsRouter } from './routers/listAccounts';
import { listAllRouter } from './routers/listAll';
import { listRulesRouter } from './routers/listRules';
import { listSessionsRouter } from './routers/listSessions';
import { listSubscriptionsRouter } from './routers/listSubscriptions';
import { liveBillingDashboardRouter } from './routers/liveBillingDashboard';
import { loadTestMetricsRouter } from './routers/loadTestMetrics';
import { loanDisbursementRouter } from './routers/loanDisbursement';
import { marketplaceRouter } from './routers/marketplace';
import { mccManagerRouter } from './routers/mccManager';
import { merchantRouter } from './routers/merchant';
import { merchantAcquirerGatewayRouter } from './routers/merchantAcquirerGateway';
import { merchantKycOnboardingRouter } from './routers/merchantKycOnboarding';
import { merchantPaymentsRouter } from './routers/merchantPayments';
import { merchantRiskScoringRouter } from './routers/merchantRiskScoring';
import { merchantSettlementDashboardRouter } from './routers/merchantSettlementDashboard';
import { mfaManagerRouter } from './routers/mfaManager';
import { mlScoringRouter } from './routers/mlScoring';
import { mlScoringServiceRouter } from './routers/mlScoringService';
import { mobileMoneyRouter } from './routers/mobileMoney';
import { modelRouter } from './routers/model';
import { multiChannelNotificationHubRouter } from './routers/multiChannelNotificationHub';
import { multiCurrencyExchangeRouter } from './routers/multiCurrencyExchange';
import { multiSimFailoverRouter } from './routers/multiSimFailover';
import { multiTenancyRouter } from './routers/multiTenancy';
import { multiTenantIsolationRouter } from './routers/multiTenantIsolation';
import { nameRouter } from './routers/name';
import { networkQualityHeatmapRouter } from './routers/networkQualityHeatmap';
import { networkResilienceRouter } from './routers/networkResilience';
import { networkStatusDashboardRouter } from './routers/networkStatusDashboard';
import { networkTelemetryRouter } from './routers/networkTelemetry';
import { networkTrendsRouter } from './routers/networkTrends';
import { notifAnalyticsRouter } from './routers/notifAnalytics';
import { notifTemplatesRouter } from './routers/notifTemplates';
import { notificationCenterRouter } from './routers/notificationCenter';
import { notification_channelsRouter } from './routers/notificationChannelsCrud';
import { notificationInboxRouter } from './routers/notificationInbox';
import { notification_logsRouter } from './routers/notificationLogsCrud';
import { notificationOrchestratorRouter } from './routers/notificationOrchestrator';
import { observabilityAlertsRouter } from './routers/observabilityAlertsCrud';
import { offlineQueueRouter } from './routers/offlineQueue';
import { offlineSyncRouter } from './routers/offlineSync';
import { ollamaLLMRouter } from './routers/ollamaLLM';
import { openTelemetryRouter } from './routers/openTelemetry';
import { operationalCommandBridgeRouter } from './routers/operationalCommandBridge';
import { operationalRunbookRouter } from './routers/operationalRunbook';
import { orderNumberRouter } from './routers/orderNumber';
import { osVersionRouter } from './routers/osVersion';
import { overdueRouter } from './routers/overdue';
import { passwordRouter } from './routers/password';
import { paymentDisputeArbitrationRouter } from './routers/paymentDisputeArbitration';
import { paymentGatewayRouterRouter } from './routers/paymentGatewayRouter';
import { paymentNotificationSystemRouter } from './routers/paymentNotificationSystem';
import { paymentReconciliationRouter } from './routers/paymentReconciliation';
import { paymentSwitchRouter } from './routers/paymentSwitch';
import { paymentTokenVaultRouter } from './routers/paymentTokenVault';
import { pbacManagementRouter } from './routers/pbacManagement';
import { pensionCollectionRouter } from './routers/pensionCollection';
import { performanceProfilerRouter } from './routers/performanceProfiler';
import { permissionRouter } from './routers/permission';
import { pingRouter } from './routers/ping';
import { pinnedRouter } from './routers/pinned';
import { pipelineMonitoringRouter } from './routers/pipelineMonitoring';
import { platformRouter } from './routers/platform';
import { platformCapacityPlannerRouter } from './routers/platformCapacityPlanner';
import { platformConfigCenterRouter } from './routers/platformConfigCenter';
import { platformCostAllocatorRouter } from './routers/platformCostAllocator';
import { platformHealthRouter } from './routers/platformHealth';
import { platformHealthDashRouter } from './routers/platformHealthDash';
import { platformHealthMonitorRouter } from './routers/platformHealthMonitor';
import { platformHealthScorecardRouter } from './routers/platformHealthScorecard';
import { platformMetricsExporterRouter } from './routers/platformMetricsExporter';
import { platformMigrationToolkitRouter } from './routers/platformMigrationToolkit';
import { platformProxyRouter } from './routers/platformProxy';
import { platformRevenueOptimizerRouter } from './routers/platformRevenueOptimizer';
import { platformSlaMonitorRouter } from './routers/platformSlaMonitor';
import { pnlReportRouter } from './routers/pnlReport';
import { pnlReportsRouter } from './routers/pnlReportsCrud';
import { portRouter } from './routers/port';
import { posDisputeRouter } from './routers/posDispute';
import { predictiveAgentChurnRouter } from './routers/predictiveAgentChurn';
import { primaryColorRouter } from './routers/primaryColor';
import { probeIntervalMsRouter } from './routers/probeIntervalMs';
import { productionFeaturesRouter } from './routers/productionFeatures';
import { profileRouter } from './routers/profile';
import { promotionsRouter } from './routers/promotions';
import { pushNotificationsRouter } from './routers/pushNotifications';
import { qdrantVectorSearchRouter } from './routers/qdrantVectorSearch';
import { quietHoursRouter } from './routers/quietHours';
import { raiseDisputeRouter } from './routers/raiseDispute';
import { ransomwareAlertsRouter } from './routers/ransomwareAlerts';
import { rateAlertsRouter } from './routers/rateAlerts';
import { rateLimitDashboardRouter } from './routers/rateLimitDashboard';
import { reactionsRouter } from './routers/reactions';
import { realtimePnlDashboardRouter } from './routers/realtimePnlDashboard';
import { realtime_tx_alertsRouter } from './routers/realtimeTxAlertsCrud';
import { realtimeTxMonitorRouter } from './routers/realtimeTxMonitor';
import { rearmRouter } from './routers/rearm';
import { receiptTemplatesRouter } from './routers/receiptTemplates';
import { reconciliationEngineRouter } from './routers/reconciliationEngine';
import { recordSwitchRouter } from './routers/recordSwitch';
import { recurringPaymentsRouter } from './routers/recurringPayments';
import { redeemRewardRouter } from './routers/redeemReward';
import { referralProgramRouter } from './routers/referralProgram';
import { referralProgramDedicatedRouter } from './routers/referralProgramDedicated';
import { registerRouter } from './routers/register';
import { regulatoryComplianceRouter } from './routers/regulatoryCompliance';
import { regulatoryComplianceChecksRouter } from './routers/regulatoryComplianceChecks';
import { regulatoryReportGeneratorRouter } from './routers/regulatoryReportGenerator';
import { regulatorySandboxTesterRouter } from './routers/regulatorySandboxTester';
import { relayEndpointRouter } from './routers/relayEndpoint';
import { remittanceRouter } from './routers/remittance';
import { reportTemplateRouter } from './routers/reportTemplate';
import { reportTemplateDesignerRouter } from './routers/reportTemplateDesigner';
import { requestPermissionRouter } from './routers/requestPermission';
import { resilienceHardeningRouter } from './routers/resilienceHardening';
import { retryFailedRouter } from './routers/retryFailed';
import { retryQueueRouter } from './routers/retryQueue';
import { revenueLeakageDetectorRouter } from './routers/revenueLeakageDetector';
import { revenueReconciliationRouter } from './routers/revenueReconciliation';
import { revenueShareConfigRouter } from './routers/revenueShareConfig';
import { reversalApprovalRouter } from './routers/reversalApproval';
import { runCheckRouter } from './routers/runCheck';
import { runNowRouter } from './routers/runNow';
import { runningRouter } from './routers/running';
import { runtimeConfigAdminRouter } from './routers/runtimeConfigAdmin';
import { savingsProductsRouter } from './routers/savingsProducts';
import { scheduledReportsRouter } from './routers/scheduledReports';
import { secondaryColorRouter } from './routers/secondaryColor';
import { secretRouter } from './routers/secret';
import { securityAuditRouter } from './routers/securityAudit';
import { securityHardeningRouter } from './routers/securityHardening';
import { seedDefaultRulesRouter } from './routers/seedDefaultRules';
import { serialNumberRouter } from './routers/serialNumber';
import { seriesRouter } from './routers/series';
import { serviceHealthRouter } from './routers/serviceHealth';
import { serviceMeshRouter } from './routers/serviceMesh';
import { sessionRouter } from './routers/session';
import { sessionMgmtRouter } from './routers/sessionMgmt';
import { sessionRefRouter } from './routers/sessionRef';
import { settlementBatchProcessorRouter } from './routers/settlementBatchProcessor';
import { settlementReconciliationRouter } from './routers/settlementReconciliation';
import { sharedLayoutsRouter } from './routers/sharedLayouts';
import { skillCreatorIntegrationRouter } from './routers/skillCreatorIntegration';
import { slaManagementRouter } from './routers/slaManagement';
import { smartContractPaymentRouter } from './routers/smartContractPayment';
import { smsNotificationsRouter } from './routers/smsNotifications';
import { smsReceiptRouter } from './routers/smsReceipt';
import { sourceRouter } from './routers/source';
import { splitPaymentsRouter } from './routers/splitPayments';
import { bulkNotifRouter } from './routers/sprint15Features';
import { sprint23Router } from './routers/sprint23';
import { sprint23Router } from './routers/sprint23Router';
import { startRouter } from './routers/start';
import { startLivenessRouter } from './routers/startLiveness';
import { statsRouter } from './routers/stats';
import { statusRouter } from './routers/status';
import { stripeRouter } from './routers/stripe';
import { submitLivenessFrameRouter } from './routers/submitLivenessFrame';
import { summaryRouter } from './routers/summary';
import { superAdminRouter } from './routers/superAdmin';
import { supplyChainRouter } from './routers/supplyChain';
import { supportAgentNameRouter } from './routers/supportAgentName';
import { syncAgentsRouter } from './routers/syncAgents';
import { syncEnabledRouter } from './routers/syncEnabled';
import { syncIntervalMinutesRouter } from './routers/syncIntervalMinutes';
import { syncInventoryRouter } from './routers/syncInventory';
import { syncStatusRouter } from './routers/syncStatus';
import { syncTransactionsRouter } from './routers/syncTransactions';
import { systemConfigManagerRouter } from './routers/systemConfigManager';
import { systemHealthDashboardRouter } from './routers/systemHealthDashboard';
import { systemHealthMonitorRouter } from './routers/systemHealthMonitor';
import { taglineRouter } from './routers/tagline';
import { tenantAdminRouter } from './routers/tenantAdmin';
import { tenantBrandingRouter } from './routers/tenantBrandingCrud';
import { tenantFeatureToggleRouter } from './routers/tenantFeatureToggle';
import { tenantFeeOverridesRouter } from './routers/tenantFeeOverridesCrud';
import { terminalIdRouter } from './routers/terminalId';
import { terminalLeasingRouter } from './routers/terminalLeasing';
import { terminatedRouter } from './routers/terminated';
import { textColorRouter } from './routers/textColor';
import { thresholdAlertsRouter } from './routers/thresholdAlerts';
import { tigerBeetleRouter } from './routers/tigerBeetle';
import { tigerBeetleAccountIdRouter } from './routers/tigerBeetleAccountId';
import { toggleRouter } from './routers/toggle';
import { toggleRuleRouter } from './routers/toggleRule';
import { topicMappingsRouter } from './routers/topicMappings';
import { totalRouter } from './routers/total';
import { totalCommentsRouter } from './routers/totalComments';
import { totalTrainingsRouter } from './routers/totalTrainings';
import { trainingCertificationRouter } from './routers/trainingCertification';
import { trainingCoursesRouter } from './routers/trainingCoursesCrud';
import { trainingEnrollmentsRouter } from './routers/trainingEnrollmentsCrud';
import { transactionDisputeResolutionRouter } from './routers/transactionDisputeResolution';
import { transactionFeeCalcRouter } from './routers/transactionFeeCalc';
import { transactionGraphAnalyzerRouter } from './routers/transactionGraphAnalyzer';
import { transactionLimitsEngineRouter } from './routers/transactionLimitsEngine';
import { transactionReversalManagerRouter } from './routers/transactionReversalManager';
import { transactionReversalWorkflowRouter } from './routers/transactionReversalWorkflow';
import { transactionVelocityMonitorRouter } from './routers/transactionVelocityMonitor';
import { transactionsRouter } from './routers/transactions';
import { triggerSyncRouter } from './routers/triggerSync';
import { txMonitorRouter } from './routers/txMonitor';
import { txVelocityMonitorRouter } from './routers/txVelocityMonitor';
import { typesRouter } from './routers/types';
import { unreadRouter } from './routers/unread';
import { updateRuleRouter } from './routers/updateRule';
import { updateStatusRouter } from './routers/updateStatus';
import { useTlsRouter } from './routers/useTls';
import { userMessageRouter } from './routers/userMessage';
import { userNotifPreferencesRouter } from './routers/userNotifPreferences';
import { usernameRouter } from './routers/username';
import { ussdAnalyticsRouter } from './routers/ussdAnalytics';
import { ussdGatewayRouter } from './routers/ussdGateway';
import { ussdIntegrationRouter } from './routers/ussdIntegration';
import { ussdReceiptRouter } from './routers/ussdReceipt';
import { vaultRouter } from './routers/vault';
import { verifyDocumentRouter } from './routers/verifyDocument';
import { webhookDeliverySystemRouter } from './routers/webhookDeliverySystem';
import { webhookManagementRouter } from './routers/webhookManagement';
import { webhookNotifRouter } from './routers/webhookNotif';
import { webhookNotificationsRouter } from './routers/webhookNotifications';
import { websocketServiceRouter } from './routers/websocketService';
import { weeklyReportsRouter } from './routers/weeklyReports';
import { whatsappChannelRouter } from './routers/whatsappChannel';
import { workflowAutomationRouter } from './routers/workflowAutomation';
import { workflowsRouter } from './routers/workflows';
import {
  rateAlertsRouter,
  twoFactorRouter,
  trustedDeviceRouter,
  accountActivityRouter,
  apiKeysRouter,
  notificationChannelsRouter,
  reminderEmailsRouter,
  ocrCorrectionRouter,
  integrationRouter,
  testingCertificationRouter,
  technicalOnboardingRouter,
  apiKeyEnhancementsRouter,
  productionGoLiveRouter,
  remittanceRouter,
  analyticsRouter,
  merchantRouter,
  psNotificationPreferencesRouter,
  psNotificationRouter,
  accountRecoveryRouter,
  psAdminRouter,
} from "./routers/psRouters";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    getProfile: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return ctx.user;
      const row = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
      return row[0] ?? ctx.user;
    }),
    updateProfile: protectedProcedure
      .input(z.object({
        name: z.string().optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        avatar: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return ctx.user;
        const updates: Record<string, unknown> = { updatedAt: new Date() };
        if (input.name) updates.name = input.name;
        if (input.email) updates.email = input.email;
        await db.update(users).set(updates).where(eq(users.id, ctx.user.id));
        const row = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
        return row[0] ?? ctx.user;
      }),
    login: publicProcedure
      .input(z.object({ email: z.string().email(), password: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const row = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
        if (row.length === 0) throw new Error("Invalid credentials");
        // In production, verify password hash. For mobile API compatibility:
        const user = row[0];
        const { SignJWT } = await import("jose");
        const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-secret");
        const token = await new SignJWT({ openId: user.openId, name: user.name, appId: process.env.VITE_APP_ID ?? "tourismpay" })
          .setProtectedHeader({ alg: "HS256" })
          .setExpirationTime("7d")
          .sign(secret);
        const refreshToken = await new SignJWT({ openId: user.openId, type: "refresh" })
          .setProtectedHeader({ alg: "HS256" })
          .setExpirationTime("30d")
          .sign(secret);
        return { token, refreshToken, user };
      }),
    register: publicProcedure
      .input(z.object({
        name: z.string().min(1),
        email: z.string().email(),
        password: z.string().min(8),
        role: z.enum(["tourist", "merchant", "admin"]).default("tourist"),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const existing = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
        if (existing.length > 0) throw new Error("Email already registered");
        const openId = `mobile-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
        const row = await db.insert(users).values({
          name: input.name,
          email: input.email,
          role: input.role,
          openId,
          loginMethod: "email",
          onboardingCompleted: false,
        }).returning();
        const user = row[0];
        const { SignJWT } = await import("jose");
        const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-secret");
        const token = await new SignJWT({ openId, name: input.name, appId: process.env.VITE_APP_ID ?? "tourismpay" })
          .setProtectedHeader({ alg: "HS256" })
          .setExpirationTime("7d")
          .sign(secret);
        return { token, user };
      }),
    completeOnboarding: protectedProcedure.mutation(async ({ ctx }) => {
      const db = await getDb();
      if (db) {
        await db
          .update(users)
          .set({ onboardingCompleted: true, updatedAt: new Date() })
          .where(eq(users.id, ctx.user.id));
      }
      return { success: true };
    }),
    refreshToken: publicProcedure
      .input(z.object({ refreshToken: z.string() }))
      .mutation(async ({ input }) => {
        try {
          const { jwtVerify, SignJWT } = await import("jose");
          const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-secret");
          const { payload } = await jwtVerify(new TextEncoder().encode(input.refreshToken), secret);
          if ((payload as any).type !== "refresh") throw new Error("Invalid token type");
          const openId = (payload as any).openId as string;
          const db = await getDb();
          const user = db ? (await db.select().from(users).where(eq(users.openId, openId)).limit(1))[0] : null;
          if (!user) throw new Error("User not found");
          const token = await new SignJWT({ openId, name: user.name, appId: process.env.VITE_APP_ID ?? "tourismpay" })
            .setProtectedHeader({ alg: "HS256" })
            .setExpirationTime("7d")
            .sign(secret);
          const newRefresh = await new SignJWT({ openId, type: "refresh" })
            .setProtectedHeader({ alg: "HS256" })
            .setExpirationTime("30d")
            .sign(secret);
          return { token, refreshToken: newRefresh };
        } catch {
          throw new Error("Invalid refresh token");
        }
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // ─── Feature Routers ───────────────────────────────────────────────────────
  bis: bisRouter,
  bisReport: bisReportRouter,
  kybDocuments: kybDocumentsRouter,
  kyb: kybRouter,
  africa: africaRouter,
  copilot: copilotRouter,
  soc: socRouter,
  admin: adminRouter,
  notifications: notificationsRouter,
  kybApplications: kybApplicationsRouter,
  bisJobs: bisJobsRouter,
  notifPrefs: notificationPreferencesRouter,
  auditLogs: auditLogsRouter,
  search: searchRouter,
  bisModuleEditor: bisModuleEditorRouter,
  kybCompliance: kybComplianceRouter,
  csvExport: csvExportRouter,
  usersAdmin: usersAdminRouter,
  wallet: walletRouter,
  loyalty: loyaltyRouter,
  embeddedFinance: embeddedFinanceRouter,
  biometric: biometricRouter,
  identity: identityRouter,
  sustainability: sustainabilityRouter,
  mesh: meshPaymentsRouter,
  serviceProxy: serviceProxyRouter,
  haConfig: haConfigRouter,
  nocDashboard: nocDashboardRouter,
  analytics: crossPlatformAnalyticsRouter,
  bisIntegration: bisIntegrationRouter,
  qrPayment: qrPaymentRouter,
  touristOnboarding: touristOnboardingRouter,
  touristPortal: touristPortalRouter,
  merchantRevenue: merchantRevenueRouter,
  merchantBookings: merchantBookingsRouter,
  push: pushRouter,
  settlement: settlementRouter,
  payoutSchedule: payoutScheduleRouter,
  tripSummary: tripSummaryRouter,
  itinerary: itineraryRouter,
  merchantProducts: merchantProductsRouter,
  serviceAvailability: serviceAvailabilityRouter,
  staffInvites: staffInvitesRouter,
  exchangeRates: exchangeRatesRouter,
  exchangeRateOverrides: exchangeRateOverridesRouter,
  stripeConnect: stripeConnectRouter,
  pythonServices: pythonServicesRouter,
  emailPreview: emailPreviewRouter,
  kyc: kycRouter,
  channelManager: channelManagerRouter,
  stablecoinSwap: stablecoinSwapRouter,
  liquidityProvider: liquidityProviderRouter,
  smartContract: smartContractRouter,
  foreignTouristLoading: foreignTouristLoadingRouter,
  localPayments: localPaymentsRouter,
  travelReadiness: travelReadinessRouter,
  tripPlanner: tripPlannerRouter,
  tipping: tippingRouter,
  multiTipping: multiTippingRouter,
  taxCollection: taxCollectionRouter,
  gdsIntegration: gdsIntegrationRouter,

  // ─── Fund Flow Orchestrator (atomic financial transactions) ─────────────────
  fundFlow: fundFlowRouter,

  // ─── Mobile Aggregate Routers (unified namespaces for React Native client) ─
  mobileMerchant: mobileMerchantRouter,
  tourist: mobileTouristRouter,
  mobilePaymentSwitch: mobilePaymentSwitchRouter,
  bookings: mobileBookingsRouter,
taxRemittance: taxRemittanceRouter,
  // ─── eNaira / CBDC-NG Gateway ─────────────────────────────────────────────
  enaira: enairaRouter,
  // ─── Previously unregistered routers ──────────────────────────────────────
  killSwitch: killSwitchRouter,
  webhooks: webhooksRouter,
  corridorRateLimit: corridorRateLimitRouter,
  notificationPreferences: notificationPreferencesRouter,
  // ─── psRouters ────────────────────────────────────────────────────────────
  rateAlerts: rateAlertsRouter,
  twoFactor: twoFactorRouter,
  trustedDevice: trustedDeviceRouter,
  accountActivity: accountActivityRouter,
  apiKeys: apiKeysRouter,
  notificationChannels: notificationChannelsRouter,
  reminderEmails: reminderEmailsRouter,
  ocrCorrection: ocrCorrectionRouter,
  integration: integrationRouter,
  testingCertification: testingCertificationRouter,
  technicalOnboarding: technicalOnboardingRouter,
  apiKeyEnhancements: apiKeyEnhancementsRouter,
  productionGoLive: productionGoLiveRouter,
  remittance: remittanceRouter,
  psNotificationPreferences: psNotificationPreferencesRouter,
  psNotification: psNotificationRouter,
  accountRecovery: accountRecoveryRouter,
  psAdmin: psAdminRouter,
  // Auto-registered routers
adminDashboard: adminDashboardRouter,
  advancedAuditLogViewer: advancedAuditLogViewerRouter,
  advancedLoadingStates: advancedLoadingStatesRouter,
  advancedRateLimiter: advancedRateLimiterRouter,
  advancedSearchFiltering: advancedSearchFilteringRouter,
  agent: agentRouter,
  agentBanking: agentBankingRouter,
  agentCommissionCalc: agentCommissionCalcRouter,
  agentCommunicationHub: agentCommunicationHubRouter,
  agentGamification: agentGamificationRouter,
  agentHierarchy: agentHierarchyRouter,
  agentInventoryMgmt: agentInventoryMgmtRouter,
  agentLoanAdvance: agentLoanAdvanceRouter,
  agentLoanFacility: agentLoanFacilityRouter,
  agentMicroInsurance: agentMicroInsuranceRouter,
  agentOnboarding: agentOnboardingRouter,
  agentOnboardingWizard: agentOnboardingWizardRouter,
  agentPerformanceLeaderboard: agentPerformanceLeaderboardRouter,
  agentTerritoryMgmt: agentTerritoryMgmtRouter,
  agentTraining: agentTrainingRouter,
  aiCashFlowPredictor: aiCashFlowPredictorRouter,
  aiChat: aiChatSupportRouter,
  analyticsQuery: analyticsQueryRouter,
  announcementReactions: announcementReactionsRouter,
  apiAnalyticsDash: apiAnalyticsDashRouter,
  apiVersioning: apiVersioningRouter,
  autoComplianceWorkflow: autoComplianceWorkflowRouter,
  automatedSettlementScheduler: automatedSettlementSchedulerRouter,
  automatedTestingFramework: automatedTestingFrameworkRouter,
  backupDisasterRecovery: backupDisasterRecoveryRouter,
  bankAccountManagement: bankAccountManagementRouter,
  bankingWorkflowPatterns: bankingWorkflowPatternsRouter,
  batchProcessing: batchProcessingRouter,
  billingInvoice: billingInvoiceRouter,
  biometricAuthGateway: biometricAuthGatewayRouter,
  blockchainAuditTrail: blockchainAuditTrailRouter,
  broadcast: broadcastAnnouncementsRouter,
  bulkTransactionProcessing: bulkTransactionProcessingRouter,
  businessRules: businessRulesRouter,
  canaryReleaseManager: canaryReleaseManagerRouter,
  carrierSla: carrierSlaRouter,
  carrierSwitching: carrierSwitchingRouter,
  cbdcIntegrationGateway: cbdcIntegrationGatewayRouter,
  cbnReporting: cbnReportingRouter,
  cdnCacheManager: cdnCacheManagerRouter,
  chaosEngineeringConsole: chaosEngineeringConsoleRouter,
  chargebackManagement: chargebackManagementRouter,
  chat: chatRouter,
  commissionCascadeHistory: commissionCascadeHistoryRouter,
  commissionPayouts: commissionPayoutsRouter,
  complianceFiling: complianceFilingRouter,
  complianceTrainingTracker: complianceTrainingTrackerRouter,
  connectionPoolMonitor: connectionPoolMonitorRouter,
  cqrsEventStore: cqrsEventStoreRouter,
  customer: customerRouter,
  customer360View: customer360ViewRouter,
  customerLoyaltyProgram: customerLoyaltyProgramRouter,
  customerSegmentationEngine: customerSegmentationEngineRouter,
  customerWalletSystem: customerWalletSystemRouter,
  dbSchemaMigrationManager: dbSchemaMigrationManagerRouter,
  decentralizedIdentityManager: decentralizedIdentityManagerRouter,
  digitalTwinSimulator: digitalTwinSimulatorRouter,
  disputeMediationAI: disputeMediationAIRouter,
  disputeResolution: disputeResolutionRouter,
  disputeWorkflowEngine: disputeWorkflowEngineRouter,
  distributedTracingDash: distributedTracingDashRouter,
  documentManagement: documentManagementRouter,
  dynamicFeeEngine: dynamicFeeEngineRouter,
  dynamicPricingEngine: dynamicPricingEngineRouter,
  erp: erpRouter,
  esgCarbonTracker: esgCarbonTrackerRouter,
  financialNlEngine: financialNlEngineRouter,
  financialReconciliationDash: financialReconciliationDashRouter,
  floatTopUp: floatTopUpRouter,
  fraudCaseManagement: fraudCaseManagementRouter,
  gdpr: gdprRouter,
  generalLedger: generalLedgerRouter,
  graphqlFederation: graphqlFederationRouter,
  graphqlSubscriptionGateway: graphqlSubscriptionGatewayRouter,
  guideFeedback: guideFeedbackRouter,
  id: apiDocsRouter,
  incidentCommandCenter: incidentCommandCenterRouter,
  inviteCodes: inviteCodesRouter,
  kycDocumentManagement: kycDocumentManagementRouter,
  lakehouse: lakehouseRouter,
  ledger: billingLedgerRouter,
  log: activityAuditLogRouter,
  management: managementRouter,
  mdm: mdmRouter,
  merchantAnalyticsDash: merchantAnalyticsDashRouter,
  merchantOnboardingPortal: merchantOnboardingPortalRouter,
  merchantPayoutSettlement: merchantPayoutSettlementRouter,
  middlewareServiceManager: middlewareServiceManagerRouter,
  mobileApiLayer: mobileApiLayerRouter,
  mqttBridge: mqttBridgeRouter,
  multiChannelPaymentOrch: multiChannelPaymentOrchRouter,
  multiCurrency: multiCurrencyRouter,
  nlAnalyticsQuery: nlAnalyticsQueryRouter,
  nlFinancialQuery: nlFinancialQueryRouter,
  offlinePosMode: offlinePosModeRouter,
  partnerOnboarding: partnerOnboardingRouter,
  partnerRevenueSharing: partnerRevenueSharingRouter,
  partnerSelfService: partnerSelfServiceRouter,
  paymentLinkGenerator: paymentLinkGeneratorRouter,
  pinReset: pinResetRouter,
  platformABTesting: platformABTestingRouter,
  platformChangelog: platformChangelogRouter,
  platformFeatureFlags: platformFeatureFlagsRouter,
  platformMaturityScorecard: platformMaturityScorecardRouter,
  platformRecommendations: platformRecommendationsRouter,
  posFirmwareOTA: posFirmwareOTARouter,
  posTerminalFleet: posTerminalFleetRouter,
  publishReadinessChecker: publishReadinessCheckerRouter,
  rateLimitEngine: rateLimitEngineRouter,
  realtimeDashboardWidgets: realtimeDashboardWidgetsRouter,
  realtimeNotifications: realtimeNotificationsRouter,
  realtimeWebSocketFeeds: realtimeWebSocketFeedsRouter,
  referrals: referralsRouter,
  regulatoryFilingAutomation: regulatoryFilingAutomationRouter,
  regulatoryReportingEngine: regulatoryReportingEngineRouter,
  regulatorySandbox: regulatorySandboxRouter,
  reportBuilderTemplates: reportBuilderTemplatesRouter,
  reportScheduler: reportSchedulerRouter,
  resilience: resilienceRouter,
  revenueAnalytics: revenueAnalyticsRouter,
  revenueForecastingEngine: revenueForecastingEngineRouter,
  vaultSecrets: vaultSecretsRouter,
  settlementNettingEngine: settlementNettingEngineRouter,
  simOrchestrator: simOrchestratorRouter,
  slaMonitoringDash: slaMonitoringDashRouter,
  slaMonitoringProd: slaMonitoringRouter,
  socialCommerceGateway: socialCommerceGatewayRouter,
  supervisor: supervisorRouter,
  systemConfig: systemConfigRouter,
  systemMigrationTools: systemMigrationToolsRouter,
  temporal: temporalWorkflowsRouter,
  tenantBillingOnboarding: tenantBillingOnboardingRouter,
  transactionCsvExport: transactionCsvExportRouter,
  transactionEnrichmentService: transactionEnrichmentServiceRouter,
  transactionExportEngine: transactionExportEngineRouter,
  transactionMapLoading: transactionMapLoadingRouter,
  transactionMapViz: transactionMapVizRouter,
  transactionMonitoring: transactionMonitoringRouter,
  transactionReceiptGenerator: transactionReceiptGeneratorRouter,
  transactionReconciliation: transactionReconciliationRouter,
  txDisputeArbitration: txDisputeArbitrationRouter,
  ussdLocalization: ussdLocalizationRouter,
  ussdSessionReplay: ussdSessionReplayRouter,
  voiceCommandPos: voiceCommandPosRouter,
  whiteLabelApproval: whiteLabelApprovalRouter,
  whiteLabelBranding: whiteLabelBrandingRouter,
  whiteLabelOnboarding: whiteLabelOnboardingRouter,
  caddy: caddyRouter,
  workflowEngine: workflowEngineRouter,
  accentColor: accentColorRouter,
  accountOpening: accountOpeningRouter,
  active: activeRouter,
  adminClearCooldown: adminClearCooldownRouter,
  adminDeviceHistories: adminDeviceHistoriesRouter,
  adminGetCooldowns: adminGetCooldownsRouter,
  adminProblematicDevices: adminProblematicDevicesRouter,
  advancedBiReporting: advancedBiReportingRouter,
  advancedNotifications: advancedNotificationsRouter,
  agentBalance: agentBalanceRouter,
  agentBankAccountsCrud: agentBankAccountsRouter,
  agentBenchmarking: agentBenchmarkingRouter,
  agentClusterAnalytics: agentClusterAnalyticsRouter,
  agentDeviceFingerprint: agentDeviceFingerprintRouter,
  agentFloatForecasting: agentFloatForecastingRouter,
  agentFloatInsuranceClaims: agentFloatInsuranceClaimsRouter,
  agentFloatTransfer: agentFloatTransferRouter,
  agentHierarchyTerritory: agentHierarchyTerritoryRouter,
  agentKyc: agentKycRouter,
  agentKycDocVault: agentKycDocVaultRouter,
  agentLeaderboard: agentLeaderboardRouter,
  agentLoanOrigination: agentLoanOriginationRouter,
  agentLoanOrigination2: agentLoanOrigination2Router,
  agentManagement: agentManagementRouter,
  agentMgmt: agentMgmtRouter,
  agentNetworkTopology: agentNetworkTopologyRouter,
  agentOnboardingWorkflow: agentOnboardingWorkflowRouter,
  agentPerformanceAnalytics: agentPerformanceAnalyticsRouter,
  agentPerformanceIncentives: agentPerformanceIncentivesRouter,
  agentPerformanceScorecard: agentPerformanceScorecardRouter,
  agentPerformanceScoresCrud: agentPerformanceScoresRouter,
  agentRevenueAttribution: agentRevenueAttributionRouter,
  agentScorecard: agentScorecardRouter,
  agentSuspensionLogCrud: agentSuspensionLogRouter,
  agentSuspensionWorkflow: agentSuspensionWorkflowRouter,
  agentTerritoryHeatmap: agentTerritoryHeatmapRouter,
  agentTerritoryOptimizer: agentTerritoryOptimizerRouter,
  agentTrainingAcademy: agentTrainingAcademyRouter,
  agentTrainingGamification: agentTrainingGamificationRouter,
  agentTrainingPortal: agentTrainingPortalRouter,
  aiMessage: aiMessageRouter,
  aiMonitoring: aiMonitoringRouter,
  airtimeVending: airtimeVendingRouter,
  alertNotifications: alertNotificationsRouter,
  amlScreening: amlScreeningRouter,
  analyticsDashboard: analyticsDashboardRouter,
  analyticsDashboardsCrud: analyticsDashboardsRouter,
  announcements: announcementsRouter,
  apacheAirflow: apacheAirflowRouter,
  apacheNifi: apacheNifiRouter,
  apiGateway: apiGatewayRouter,
  apiKeyManagement: apiKeyManagementRouter,
  apiRateLimiterDash: apiRateLimiterDashRouter,
  appVersion: appVersionRouter,
  archivalAdmin: archivalAdminRouter,
  artRobustness: artRobustnessRouter,
  auditExport: auditExportRouter,
  auditLog: auditLogRouter,
  auditTrail: auditTrailRouter,
  auditTrailExport: auditTrailExportRouter,
  autoReconciliationEngine: autoReconciliationEngineRouter,
  autoRenew: autoRenewRouter,
  automatedComplianceChecker: automatedComplianceCheckerRouter,
  avgScore: avgScoreRouter,
  backgroundColor: backgroundColorRouter,
  baseUrl: baseUrlRouter,
  biReportDefinitionsCrud: biReportDefinitionsRouter,
  billPayments: billPaymentsRouter,
  billingAudit: billingAuditRouter,
  billingLifecycle: billingLifecycleRouter,
  billingModel: billingModelRouter,
  billingProduction: billingProductionRouter,
  billingRbac: billingRbacRouter,
  billingRevenuePeriodsCrud: billingRevenuePeriodsRouter,
  biometricAuditDashboard: biometricAuditDashboardRouter,
  biometricAuth: biometricAuthRouter,
  brandName: brandNameRouter,
  bulkDisbursementEngine: bulkDisbursementEngineRouter,
  bulkNotif: bulkNotifRouter,
  bulkOperations: bulkOperationsRouter,
  bulkOps: bulkOpsRouter,
  bulkPaymentProcessor: bulkPaymentProcessorRouter,
  bulkRoleImport: bulkRoleImportRouter,
  bulkTransactionProcessor: bulkTransactionProcessorRouter,
  cache: cacheRouter,
  capacityPlanning: capacityPlanningRouter,
  cardBinLookup: cardBinLookupRouter,
  cardRequest: cardRequestRouter,
  carrierCost: carrierCostRouter,
  carrierLivePricing: carrierLivePricingRouter,
  cbnMetrics: cbnMetricsRouter,
  certificatesActive: certificatesActiveRouter,
  changelog: changelogRouter,
  checkRegistrationStatus: checkRegistrationStatusRouter,
  claimChallenge: claimChallengeRouter,
  clientId: clientIdRouter,
  closeSession: closeSessionRouter,
  cocoIndexPipeline: cocoIndexPipelineRouter,
  comments: commentsRouter,
  commissionCalculator: commissionCalculatorRouter,
  commissionClawback: commissionClawbackRouter,
  commissionEngine: commissionEngineRouter,
  completed: completedRouter,
  complianceAutomation: complianceAutomationRouter,
  complianceCertManager: complianceCertManagerRouter,
  complianceChatbot: complianceChatbotRouter,
  complianceRate: complianceRateRouter,
  complianceReporting: complianceReportingRouter,
  configManagement: configManagementRouter,
  contractEndDate: contractEndDateRouter,
  createRule: createRuleRouter,
  crossBorderRemittance: crossBorderRemittanceRouter,
  crossBorderRemittanceHub: crossBorderRemittanceHubRouter,
  currency: currencyRouter,
  currencyHedging: currencyHedgingRouter,
  customer360: customer360Router,
  customerDatabase: customerDatabaseRouter,
  customerDisputePortal: customerDisputePortalRouter,
  customerFeedbackNps: customerFeedbackNpsRouter,
  customerJourneyAnalytics: customerJourneyAnalyticsRouter,
  customerJourneyEventsCrud: customer_journey_eventsRouter,
  customerJourneyMapper: customerJourneyMapperRouter,
  customerOnboardingPipeline: customerOnboardingPipelineRouter,
  customerSurveys: customerSurveysRouter,
  dailyPnlReport: dailyPnlReportRouter,
  dashboardLayout: dashboardLayoutRouter,
  dataConsentRecordsCrud: dataConsentRecordsRouter,
  dataExport: dataExportRouter,
  dataExportHub: dataExportHubRouter,
  dataExportImport: dataExportImportRouter,
  dataExportRouter: dataExportRouter,
  dataQuality: dataQualityRouter,
  dataRetentionPolicy: dataRetentionPolicyRouter,
  dataThresholdAlerts: dataThresholdAlertsRouter,
  database: databaseRouter,
  databaseVisualization: databaseVisualizationRouter,
  dbSchemaPush: dbSchemaPushRouter,
  dbtIntegration: dbtIntegrationRouter,
  deepface: deepfaceRouter,
  deleteComment: deleteCommentRouter,
  deleteRule: deleteRuleRouter,
  devPortal: devPortalRouter,
  developerPortal: developerPortalRouter,
  deviceFleetManager: deviceFleetManagerRouter,
  disputeAnalytics: disputeAnalyticsRouter,
  disputeNotifications: disputeNotificationsRouter,
  disputeRefund: disputeRefundRouter,
  disputes: disputesRouter,
  dragDropReportBuilder: dragDropReportBuilderRouter,
  dynamicFeeCalculator: dynamicFeeCalculatorRouter,
  dynamicQrPayment: dynamicQrPaymentRouter,
  e2eTestFramework: e2eTestFrameworkRouter,
  ecommerceCart: ecommerceCartRouter,
  ecommerceCatalog: ecommerceCatalogRouter,
  ecommerceOrders: ecommerceOrdersRouter,
  emailDeliveryLogCrud: emailDeliveryLogRouter,
  emailNotifications: emailNotificationsRouter,
  emoji: emojiRouter,
  enabled: enabledRouter,
  encryptedFieldsCrud: encryptedFieldsRouter,
  eodReconciliation: eodReconciliationRouter,
  erpType: erpTypeRouter,
  error: errorRouter,
  escalate: escalateRouter,
  escalationChains: escalationChainsRouter,
  eventDrivenArch: eventDrivenArchRouter,
  executiveCommandCenter: executiveCommandCenterRouter,
  expiringIn30Days: expiringIn30DaysRouter,
  export: exportRouter,
  faceEnrollment: faceEnrollmentRouter,
  failed: failedRouter,
  falkordbGraph: falkordbGraphRouter,
  featureFlags: featureFlagsRouter,
  fieldMappings: fieldMappingsRouter,
  financialReportingSuite: financialReportingSuiteRouter,
  firmwareVersion: firmwareVersionRouter,
  firstName: firstNameRouter,
  floatManagement: floatManagementRouter,
  floatReconciliation: floatReconciliationRouter,
  floatReconciliationsCrud: floatReconciliationsRouter,
  fontFamily: fontFamilyRouter,
  fraud: fraudRouter,
  fraudMlScoringEngine: fraudMlScoringEngineRouter,
  fraudRealtimeViz: fraudRealtimeVizRouter,
  fraudReport: fraudReportRouter,
  fraudReportGenerator: fraudReportGeneratorRouter,
  fxRates: fxRatesRouter,
  gatewayHealthMonitor: gatewayHealthMonitorRouter,
  geoFenceDedicated: geoFenceDedicatedRouter,
  geoFencesCrud: geoFencesRouter,
  geoFencing: geoFencingRouter,
  geoFencingDedicated: geoFencingDedicatedRouter,
  geofencing: geofencingRouter,
  getCheckerStatus: getCheckerStatusRouter,
  getDashboard: getDashboardRouter,
  getErpSyncStats: getErpSyncStatsRouter,
  getHistory: getHistoryRouter,
  getLastRun: getLastRunRouter,
  getLiveStats: getLiveStatsRouter,
  getMqttThroughput: getMqttThroughputRouter,
  getOutstanding: getOutstandingRouter,
  getProfile: getProfileRouter,
  getRankings: getRankingsRouter,
  getRecommendation: getRecommendationRouter,
  getSettlements: getSettlementsRouter,
  getStats: getStatsRouter,
  getSwitchStats: getSwitchStatsRouter,
  getTransactions: getTransactionsRouter,
  glAccountsCrud: gl_accountsRouter,
  glJournalEntriesCrud: gl_journal_entriesRouter,
  globalSearch: globalSearchRouter,
  goServiceBridge: goServiceBridgeRouter,
  health: healthRouter,
  healthCheck: healthCheckRouter,
  healthMonitor: healthMonitorRouter,
  healthy: healthyRouter,
  helpDesk: helpDeskRouter,
  hourlyStats: hourlyStatsRouter,
  inProgress: inProgressRouter,
  incidentManagement: incidentManagementRouter,
  incidentPlaybook: incidentPlaybookRouter,
  insuranceProducts: insuranceProductsRouter,
  integrationMarketplace: integrationMarketplaceRouter,
  intelligentRoutingEngine: intelligentRoutingEngineRouter,
  ipAddress: ipAddressRouter,
  isLive: isLiveRouter,
  isRegistering: isRegisteringRouter,
  items: itemsRouter,
  kafka: kafkaRouter,
  kafkaConsumer: kafkaConsumerRouter,
  kafkaTopicPrefix: kafkaTopicPrefixRouter,
  keepAliveSeconds: keepAliveSecondsRouter,
  kycDocumentsCrud: kycDocumentsRouter,
  kycEnforcement: kycEnforcementRouter,
  kycLevel: kycLevelRouter,
  lakehouseAiIntegration: lakehouseAiIntegrationRouter,
  lastSyncAt: lastSyncAtRouter,
  lastSyncStatus: lastSyncStatusRouter,
  lastTestStatus: lastTestStatusRouter,
  length: lengthRouter,
  listAccounts: listAccountsRouter,
  listAll: listAllRouter,
  listRules: listRulesRouter,
  listSessions: listSessionsRouter,
  listSubscriptions: listSubscriptionsRouter,
  liveBillingDashboard: liveBillingDashboardRouter,
  loadTestMetrics: loadTestMetricsRouter,
  loanDisbursement: loanDisbursementRouter,
  marketplace: marketplaceRouter,
  mccManager: mccManagerRouter,
  merchant: merchantRouter,
  merchantAcquirerGateway: merchantAcquirerGatewayRouter,
  merchantKycOnboarding: merchantKycOnboardingRouter,
  merchantPayments: merchantPaymentsRouter,
  merchantRiskScoring: merchantRiskScoringRouter,
  merchantSettlementDashboard: merchantSettlementDashboardRouter,
  mfaManager: mfaManagerRouter,
  mlScoring: mlScoringRouter,
  mlScoringService: mlScoringServiceRouter,
  mobileMoney: mobileMoneyRouter,
  model: modelRouter,
  multiChannelNotificationHub: multiChannelNotificationHubRouter,
  multiCurrencyExchange: multiCurrencyExchangeRouter,
  multiSimFailover: multiSimFailoverRouter,
  multiTenancy: multiTenancyRouter,
  multiTenantIsolation: multiTenantIsolationRouter,
  name: nameRouter,
  networkQualityHeatmap: networkQualityHeatmapRouter,
  networkResilience: networkResilienceRouter,
  networkStatusDashboard: networkStatusDashboardRouter,
  networkTelemetry: networkTelemetryRouter,
  networkTrends: networkTrendsRouter,
  notifAnalytics: notifAnalyticsRouter,
  notifTemplates: notifTemplatesRouter,
  notificationCenter: notificationCenterRouter,
  notificationChannelsCrud: notification_channelsRouter,
  notificationInbox: notificationInboxRouter,
  notificationLogsCrud: notification_logsRouter,
  notificationOrchestrator: notificationOrchestratorRouter,
  observabilityAlertsCrud: observabilityAlertsRouter,
  offlineQueue: offlineQueueRouter,
  offlineSync: offlineSyncRouter,
  ollamaLLM: ollamaLLMRouter,
  openTelemetry: openTelemetryRouter,
  operationalCommandBridge: operationalCommandBridgeRouter,
  operationalRunbook: operationalRunbookRouter,
  orderNumber: orderNumberRouter,
  osVersion: osVersionRouter,
  overdue: overdueRouter,
  password: passwordRouter,
  paymentDisputeArbitration: paymentDisputeArbitrationRouter,
  paymentGatewayRouter: paymentGatewayRouterRouter,
  paymentNotificationSystem: paymentNotificationSystemRouter,
  paymentReconciliation: paymentReconciliationRouter,
  paymentSwitch: paymentSwitchRouter,
  paymentTokenVault: paymentTokenVaultRouter,
  pbacManagement: pbacManagementRouter,
  pensionCollection: pensionCollectionRouter,
  performanceProfiler: performanceProfilerRouter,
  permission: permissionRouter,
  ping: pingRouter,
  pinned: pinnedRouter,
  pipelineMonitoring: pipelineMonitoringRouter,
  platform: platformRouter,
  platformCapacityPlanner: platformCapacityPlannerRouter,
  platformConfigCenter: platformConfigCenterRouter,
  platformCostAllocator: platformCostAllocatorRouter,
  platformHealth: platformHealthRouter,
  platformHealthDash: platformHealthDashRouter,
  platformHealthMonitor: platformHealthMonitorRouter,
  platformHealthScorecard: platformHealthScorecardRouter,
  platformMetricsExporter: platformMetricsExporterRouter,
  platformMigrationToolkit: platformMigrationToolkitRouter,
  platformProxy: platformProxyRouter,
  platformRevenueOptimizer: platformRevenueOptimizerRouter,
  platformSlaMonitor: platformSlaMonitorRouter,
  pnlReport: pnlReportRouter,
  pnlReportsCrud: pnlReportsRouter,
  port: portRouter,
  posDispute: posDisputeRouter,
  predictiveAgentChurn: predictiveAgentChurnRouter,
  primaryColor: primaryColorRouter,
  probeIntervalMs: probeIntervalMsRouter,
  productionFeatures: productionFeaturesRouter,
  profile: profileRouter,
  promotions: promotionsRouter,
  pushNotifications: pushNotificationsRouter,
  qdrantVectorSearch: qdrantVectorSearchRouter,
  quietHours: quietHoursRouter,
  raiseDispute: raiseDisputeRouter,
  ransomwareAlerts: ransomwareAlertsRouter,
  rateLimitDashboard: rateLimitDashboardRouter,
  reactions: reactionsRouter,
  realtimePnlDashboard: realtimePnlDashboardRouter,
  realtimeTxAlertsCrud: realtime_tx_alertsRouter,
  realtimeTxMonitor: realtimeTxMonitorRouter,
  rearm: rearmRouter,
  receiptTemplates: receiptTemplatesRouter,
  reconciliationEngine: reconciliationEngineRouter,
  recordSwitch: recordSwitchRouter,
  recurringPayments: recurringPaymentsRouter,
  redeemReward: redeemRewardRouter,
  referralProgram: referralProgramRouter,
  referralProgramDedicated: referralProgramDedicatedRouter,
  register: registerRouter,
  regulatoryCompliance: regulatoryComplianceRouter,
  regulatoryComplianceChecks: regulatoryComplianceChecksRouter,
  regulatoryReportGenerator: regulatoryReportGeneratorRouter,
  regulatorySandboxTester: regulatorySandboxTesterRouter,
  relayEndpoint: relayEndpointRouter,
  reportTemplate: reportTemplateRouter,
  reportTemplateDesigner: reportTemplateDesignerRouter,
  requestPermission: requestPermissionRouter,
  resilienceHardening: resilienceHardeningRouter,
  retryFailed: retryFailedRouter,
  retryQueue: retryQueueRouter,
  revenueLeakageDetector: revenueLeakageDetectorRouter,
  revenueReconciliation: revenueReconciliationRouter,
  revenueShareConfig: revenueShareConfigRouter,
  reversalApproval: reversalApprovalRouter,
  runCheck: runCheckRouter,
  runNow: runNowRouter,
  running: runningRouter,
  runtimeConfigAdmin: runtimeConfigAdminRouter,
  savingsProducts: savingsProductsRouter,
  scheduledReports: scheduledReportsRouter,
  secondaryColor: secondaryColorRouter,
  secret: secretRouter,
  securityAudit: securityAuditRouter,
  securityHardening: securityHardeningRouter,
  seedDefaultRules: seedDefaultRulesRouter,
  serialNumber: serialNumberRouter,
  series: seriesRouter,
  serviceHealth: serviceHealthRouter,
  serviceMesh: serviceMeshRouter,
  session: sessionRouter,
  sessionMgmt: sessionMgmtRouter,
  sessionRef: sessionRefRouter,
  settlementBatchProcessor: settlementBatchProcessorRouter,
  settlementReconciliation: settlementReconciliationRouter,
  sharedLayouts: sharedLayoutsRouter,
  skillCreatorIntegration: skillCreatorIntegrationRouter,
  slaManagement: slaManagementRouter,
  smartContractPayment: smartContractPaymentRouter,
  smsNotifications: smsNotificationsRouter,
  smsReceipt: smsReceiptRouter,
  source: sourceRouter,
  splitPayments: splitPaymentsRouter,
  sprint15Features: bulkNotifRouter,
  sprint23: sprint23Router,
  sprint23Router: sprint23Router,
  start: startRouter,
  startLiveness: startLivenessRouter,
  stats: statsRouter,
  status: statusRouter,
  stripe: stripeRouter,
  submitLivenessFrame: submitLivenessFrameRouter,
  summary: summaryRouter,
  superAdmin: superAdminRouter,
  supplyChain: supplyChainRouter,
  supportAgentName: supportAgentNameRouter,
  syncAgents: syncAgentsRouter,
  syncEnabled: syncEnabledRouter,
  syncIntervalMinutes: syncIntervalMinutesRouter,
  syncInventory: syncInventoryRouter,
  syncStatus: syncStatusRouter,
  syncTransactions: syncTransactionsRouter,
  systemConfigManager: systemConfigManagerRouter,
  systemHealthDashboard: systemHealthDashboardRouter,
  systemHealthMonitor: systemHealthMonitorRouter,
  tagline: taglineRouter,
  tenantAdmin: tenantAdminRouter,
  tenantBrandingCrud: tenantBrandingRouter,
  tenantFeatureToggle: tenantFeatureToggleRouter,
  tenantFeeOverridesCrud: tenantFeeOverridesRouter,
  terminalId: terminalIdRouter,
  terminalLeasing: terminalLeasingRouter,
  terminated: terminatedRouter,
  textColor: textColorRouter,
  thresholdAlerts: thresholdAlertsRouter,
  tigerBeetle: tigerBeetleRouter,
  tigerBeetleAccountId: tigerBeetleAccountIdRouter,
  toggle: toggleRouter,
  toggleRule: toggleRuleRouter,
  topicMappings: topicMappingsRouter,
  total: totalRouter,
  totalComments: totalCommentsRouter,
  totalTrainings: totalTrainingsRouter,
  trainingCertification: trainingCertificationRouter,
  trainingCoursesCrud: trainingCoursesRouter,
  trainingEnrollmentsCrud: trainingEnrollmentsRouter,
  transactionDisputeResolution: transactionDisputeResolutionRouter,
  transactionFeeCalc: transactionFeeCalcRouter,
  transactionGraphAnalyzer: transactionGraphAnalyzerRouter,
  transactionLimitsEngine: transactionLimitsEngineRouter,
  transactionReversalManager: transactionReversalManagerRouter,
  transactionReversalWorkflow: transactionReversalWorkflowRouter,
  transactionVelocityMonitor: transactionVelocityMonitorRouter,
  transactions: transactionsRouter,
  triggerSync: triggerSyncRouter,
  txMonitor: txMonitorRouter,
  txVelocityMonitor: txVelocityMonitorRouter,
  types: typesRouter,
  unread: unreadRouter,
  updateRule: updateRuleRouter,
  updateStatus: updateStatusRouter,
  useTls: useTlsRouter,
  userMessage: userMessageRouter,
  userNotifPreferences: userNotifPreferencesRouter,
  username: usernameRouter,
  ussdAnalytics: ussdAnalyticsRouter,
  ussdGateway: ussdGatewayRouter,
  ussdIntegration: ussdIntegrationRouter,
  ussdReceipt: ussdReceiptRouter,
  vault: vaultRouter,
  verifyDocument: verifyDocumentRouter,
  webhookDeliverySystem: webhookDeliverySystemRouter,
  webhookManagement: webhookManagementRouter,
  webhookNotif: webhookNotifRouter,
  webhookNotifications: webhookNotificationsRouter,
  websocketService: websocketServiceRouter,
  weeklyReports: weeklyReportsRouter,
  whatsappChannel: whatsappChannelRouter,
  workflowAutomation: workflowAutomationRouter,
  workflows: workflowsRouter,
});


export type AppRouter = typeof appRouter;
