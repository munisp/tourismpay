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
} from "./routers/psRouters";)

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
  enaira: enairaRouter,)
});


export type AppRouter = typeof appRouter;
