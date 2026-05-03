/**
 * PaymentSwitch Routers — split from monolithic psStubs.ts into domain-specific files.
 * Each router now uses requireDb() for proper error propagation instead of getDbOrNull().
 */
export { rateAlertsRouter } from "./rateAlerts";
export { twoFactorRouter } from "./twoFactor";
export { trustedDeviceRouter, accountActivityRouter } from "./trustedDevices";
export { apiKeysRouter, apiKeyEnhancementsRouter } from "./apiKeys";
export { notificationChannelsRouter, reminderEmailsRouter } from "./notificationChannels";
export { ocrCorrectionRouter } from "./ocrCorrection";
export { integrationRouter, testingCertificationRouter } from "./integration";
export { technicalOnboardingRouter, productionGoLiveRouter } from "./technicalOnboarding";
export { remittanceRouter } from "./remittance";
export { analyticsRouter } from "./analytics";
export {
  merchantRouter,
  psNotificationPreferencesRouter,
  psNotificationRouter,
  accountRecoveryRouter,
  psAdminRouter,
} from "./merchant";
