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
import { paymentSwitchRouter } from "./routers/paymentSwitch";
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
import { killSwitchRouter } from "./routers/killSwitch";
import { webhooksRouter } from "./routers/webhooks";
import { corridorRateLimitRouter } from "./routers/corridorRateLimit";
import { stripeConnectRouter } from "./routers/stripeConnect";
import { pythonServicesRouter } from "./routers/pythonServices";
import { analyticsRouter as crossPlatformAnalyticsRouter } from "./routers/analytics";
import { emailPreviewRouter } from "./routers/emailPreview";
import { nocDashboardRouter } from "./routers/nocDashboard";
import { offlineResilienceRouter } from "./resilience/offlineResilience";
import { middlewareHubRouter } from "./middleware/middlewareHub";
import { verificationRouter } from "./routers/verification";
import { livenessRouter } from "./routers/liveness";
import { paymentRailsRouter } from "./routers/paymentRails";
import { mapLocationRouter } from "./routers/mapLocation";
import { arTourismRouter } from "./integrations/arTourism";
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
} from "./routers/ps";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
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
  paymentSwitch: paymentSwitchRouter,
  haConfig: haConfigRouter,
  killSwitch: killSwitchRouter,
  webhooks: webhooksRouter,
  corridorRateLimit: corridorRateLimitRouter,
  nocDashboard: nocDashboardRouter,
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
  analytics: crossPlatformAnalyticsRouter,
  merchant: merchantRouter,
  notificationPreferences: psNotificationPreferencesRouter,
  notification: psNotificationRouter,
  accountRecovery: accountRecoveryRouter,
  psAdmin: psAdminRouter,
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
  offlineResilience: offlineResilienceRouter,
  middlewareHub: middlewareHubRouter,
  verification: verificationRouter,
  liveness: livenessRouter,
  paymentRails: paymentRailsRouter,
  mapLocation: mapLocationRouter,
  arTourism: arTourismRouter,
});

export type AppRouter = typeof appRouter;
