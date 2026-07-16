import { z } from "zod";
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
import { fraudRouter, socRouter } from "./routers/security";
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
import { workflowEngineRouter } from "./routers/workflowEngine";
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
        const openId = `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
  fraud: fraudRouter,
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
  merchant: mobileMerchantRouter,
  tourist: mobileTouristRouter,
  paymentSwitch: mobilePaymentSwitchRouter,
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
  secret: vaultSecretsRouter,
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
  workflowEngine: workflowEngineRouter,
});


export type AppRouter = typeof appRouter;
