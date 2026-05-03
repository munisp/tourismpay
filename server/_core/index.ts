import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerSSERoutes } from "../sse";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { startBisAutoAdvanceJob } from "../jobs/bisAutoAdvance";
import { startBiometricExpiryJob } from "../jobs/biometricExpiry";
import { startServiceHealthPoller } from "../jobs/serviceHealthPoller";
import { startLoyaltyRewardExpiryJob } from "../jobs/loyaltyRewardExpiry";
import { startScheduledPaymentsJob } from "../jobs/scheduledPayments";
import { startLoyaltyTierDowngradeJob } from "../jobs/loyaltyTierDowngrade";
import { startLoyaltyPointsExpiryJob } from "../jobs/loyaltyPointsExpiry";
import { startWalletRecurringPaymentsJob } from "../jobs/walletRecurringPayments";
import { startBisWeeklyExportJob } from "../jobs/bisWeeklyExport";
import { startWebhookRetryJob } from "../jobs/webhookRetry";
import { startMerchantPayoutSchedulerJob } from "../jobs/merchantPayoutScheduler";
import { startExchangeRateDeviationJob } from "../jobs/exchangeRateDeviationJob";
import { registerStripeWebhook } from "../stripeWebhook";
import { startBookingReminderJob } from "../jobs/bookingReminder";
import { startTouristBookingReminderJob } from "../jobs/touristBookingReminder";
import { startDealExpiryJob } from "../jobs/dealExpiry";
import { startWishlistExpiryAlertJob } from "../jobs/wishlistExpiryAlert";
import { startDailySentimentSnapshotJob } from "../jobs/dailySentimentSnapshot";
import { startReviewPromptJob } from "../jobs/reviewPromptJob";
import { startSentimentAlertJob } from "../jobs/sentimentAlertJob";
import { startLeaderboardSnapshotJob } from "../jobs/leaderboardSnapshotJob";
import { startOnboardingNudgeJob } from "../jobs/onboardingNudgeJob";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Stripe webhook MUST be registered before express.json() for raw body access
  registerStripeWebhook(app);

  // ─── Structured Logging ─────────────────────────────────────────────────────
  const { requestLoggerMiddleware } = await import("./logger");
  app.use(requestLoggerMiddleware);

  // ─── Security Middleware (applied before body parsing) ─────────────────────
  const { ddosProtectionMiddleware, securityHeadersMiddleware } = await import("../security/ddosProtection");
  const { pbacMiddleware } = await import("../security/pbacMiddleware");
  const { rateLimiterMiddleware } = await import("../security/rateLimiter");
  app.use(securityHeadersMiddleware);
  app.use(ddosProtectionMiddleware);
  app.use(rateLimiterMiddleware);

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Cookie parser (required for CSRF double-submit cookie pattern)
  const cookieParser = await import("cookie");

  // Input sanitization (after body parsing)
  const { inputSanitizerMiddleware } = await import("../security/inputSanitizer");
  app.use(inputSanitizerMiddleware);

  // CSRF protection (after body parsing, before tRPC)
  const { csrfMiddleware } = await import("../security/csrf");
  app.use(csrfMiddleware);

  // PBAC enforcement (after auth context is set by tRPC)
  app.use("/api/trpc", pbacMiddleware);

  // ─── Health Check Endpoint ─────────────────────────────────────────────────
  app.get("/api/health", async (_req, res) => {
    try {
      const { getDb } = await import("../db");
      const db = await getDb();
      const dbStatus = db ? "connected" : "disconnected";
      res.json({ status: "ok", timestamp: new Date().toISOString(), db: dbStatus, uptime: process.uptime() });
    } catch {
      res.status(503).json({ status: "degraded", timestamp: new Date().toISOString(), db: "error" });
    }
  });
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);

  // DEV ONLY: session token endpoint for screenshots/testing
  if (process.env.NODE_ENV === "development") {
    app.get("/api/dev/session-token", async (_req, res) => {
      try {
        const { sdk } = await import("./sdk");
        const { ENV } = await import("./env");
        const token = await sdk.createSessionToken(ENV.ownerOpenId, { name: "Patrick Munis" });
        res.setHeader("Set-Cookie", `app_session_id=${token}; Path=/; Max-Age=31536000; SameSite=Lax`);
        const redirect = (_req as any).query?.redirect || "/tourist/onboarding";
        res.redirect(302, redirect as string);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // DEV ONLY: demo merchant fresh login — creates a new merchant user with no establishment for onboarding walkthrough
    app.get("/api/dev/demo-merchant-fresh", async (_req, res) => {
      try {
        const { sdk } = await import("./sdk");
        const dbModule = await import("../db");
        const { getDb } = dbModule;
        const { users, establishments } = await import("../../drizzle/schema");
        const { eq } = await import("drizzle-orm");

        await dbModule.upsertUser({
          openId: "demo_merchant_002",
          name: "Ama Owusu",
          email: "ama.owusu@demo.tourismpay.com",
          loginMethod: "demo",
          lastSignedIn: new Date(),
          role: "merchant" as any,
        });

        // Keep onboardingCompleted = false so we can show the onboarding wizard
        // But ensure loginCount > 1 so the redirect hook doesn't fire
        const db = await getDb();
        if (db) {
          await db
            .update(users)
            .set({ onboardingCompleted: false, updatedAt: new Date() })
            .where(eq(users.openId, "demo_merchant_002"));
        }

        const token = await sdk.createSessionToken("demo_merchant_002", { name: "Ama Owusu" });
        res.setHeader("Set-Cookie", `app_session_id=${token}; Path=/; Max-Age=31536000; SameSite=Lax`);
        res.redirect(302, "/restaurant-onboarding");
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // DEV ONLY: demo merchant login — upserts a demo merchant user and sets a session
    app.get("/api/dev/demo-merchant-login", async (_req, res) => {
      try {
        const { sdk } = await import("./sdk");
        const dbModule = await import("../db");
        const { getDb } = dbModule;
        const { users, establishments } = await import("../../drizzle/schema");
        const { eq, sql } = await import("drizzle-orm");

        await dbModule.upsertUser({
          openId: "demo_merchant_001",
          name: "Kofi Mensah",
          email: "kofi.mensah@demo.tourismpay.com",
          loginMethod: "demo",
          lastSignedIn: new Date(),
          role: "merchant" as any,
        });

        // Mark onboarding as completed so the redirect hook doesn't fire
        const db = await getDb();
        if (db) {
          await db
            .update(users)
            .set({ onboardingCompleted: true, updatedAt: new Date() })
            .where(eq(users.openId, "demo_merchant_001"));

          // Ensure the demo merchant has an approved establishment
          const merchantUser = await db
            .select()
            .from(users)
            .where(eq(users.openId, "demo_merchant_001"))
            .limit(1);
          const merchantId = merchantUser[0]?.id;

          if (merchantId) {
            // Check if establishment exists
            const existing = await db
              .select()
              .from(establishments)
              .where(eq(establishments.ownerId, merchantId))
              .limit(1);

            if (existing.length === 0) {
              // Create a demo establishment with approved KYB
              await db.insert(establishments).values({
                name: "Serengeti Safari Experience",
                type: "tour_operator",
                country: "TZ",
                city: "Arusha",
                address: "123 Safari Road, Arusha, Tanzania",
                latitude: "-3.3869",
                longitude: "36.6830",
                currency: "TZS",
                kybStatus: "approved" as any,
                ownerId: merchantId,
                contactPhone: "+255 27 250 1234",
                contactEmail: "info@serengetisafari.tz",
              });
            } else {
              // Update existing establishment to approved
              await db
                .update(establishments)
                .set({ kybStatus: "approved" as any, updatedAt: new Date() })
                .where(eq(establishments.ownerId, merchantId));
            }
          }
        }

        const token = await sdk.createSessionToken("demo_merchant_001", { name: "Kofi Mensah" });
        res.setHeader("Set-Cookie", `app_session_id=${token}; Path=/; Max-Age=31536000; SameSite=Lax`);
        const redirect = (_req as any).query?.redirect || "/merchant/revenue";
        res.redirect(302, redirect as string);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // DEV ONLY: demo tourist login — upserts a demo tourist user and sets a session
    app.get("/api/dev/demo-tourist-login", async (_req, res) => {
      try {
        const { sdk } = await import("./sdk");
        const dbModule = await import("../db");
        const { getDb } = dbModule;
        const { users } = await import("../../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        await dbModule.upsertUser({
          openId: "demo_tourist_001",
          name: "Amara Diallo",
          email: "amara.diallo@demo.tourismpay.com",
          loginMethod: "demo",
          lastSignedIn: new Date(),
          role: "tourist" as any,
        });
        const db = await getDb();
        if (db) {
          await db
            .update(users)
            .set({ onboardingCompleted: true, role: "tourist", updatedAt: new Date() })
            .where(eq(users.openId, "demo_tourist_001"));
        }
        const token = await sdk.createSessionToken("demo_tourist_001", { name: "Amara Diallo" });
        res.setHeader("Set-Cookie", `app_session_id=${token}; Path=/; Max-Age=31536000; SameSite=Lax`);
        const redirect = (_req as any).query?.redirect || "/";
        res.redirect(302, redirect as string);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // DEV ONLY: unified demo login — supports ?role=admin|tourist|merchant
    app.get("/api/demo-login", async (_req, res) => {
      try {
        const { sdk } = await import("./sdk");
        const dbModule = await import("../db");
        const { getDb } = dbModule;
        const { users, establishments } = await import("../../drizzle/schema");
        const { eq } = await import("drizzle-orm");

        const requestedRole = ((_req as any).query?.role as string) || "tourist";
        const redirect = (_req as any).query?.redirect as string;

        const roleConfigs: Record<string, { openId: string; name: string; email: string; role: string; defaultRedirect: string }> = {
          admin: { openId: "demo_admin_001", name: "Admin User", email: "admin@demo.tourismpay.com", role: "admin", defaultRedirect: "/" },
          tourist: { openId: "demo_tourist_001", name: "Amara Diallo", email: "amara.diallo@demo.tourismpay.com", role: "tourist", defaultRedirect: "/" },
          merchant: { openId: "demo_merchant_001", name: "Kofi Mensah", email: "kofi.mensah@demo.tourismpay.com", role: "merchant", defaultRedirect: "/merchant/revenue" },
          compliance_officer: { openId: "demo_compliance_001", name: "Fatima Osei", email: "fatima.osei@demo.tourismpay.com", role: "compliance_officer", defaultRedirect: "/compliance" },
          settlement_officer: { openId: "demo_settlement_001", name: "Kwame Asante", email: "kwame.asante@demo.tourismpay.com", role: "settlement_officer", defaultRedirect: "/settlement" },
          noc_operator: { openId: "demo_noc_001", name: "Chidera Nwosu", email: "chidera.nwosu@demo.tourismpay.com", role: "noc_operator", defaultRedirect: "/paymentswitch/noc" },
          bis_analyst: { openId: "demo_bis_001", name: "Yemi Adebayo", email: "yemi.adebayo@demo.tourismpay.com", role: "bis_analyst", defaultRedirect: "/bis" },
        };

        const config = roleConfigs[requestedRole] || roleConfigs.tourist;
        await dbModule.upsertUser({
          openId: config.openId,
          name: config.name,
          email: config.email,
          loginMethod: "demo",
          lastSignedIn: new Date(),
          role: config.role as any,
        });

        const db = await getDb();
        if (db) {
          await db
            .update(users)
            .set({ onboardingCompleted: true, role: config.role as any, updatedAt: new Date() })
            .where(eq(users.openId, config.openId));

          // For merchant, ensure an establishment exists
          if (config.role === "merchant") {
            const merchantUser = await db.select().from(users).where(eq(users.openId, config.openId)).limit(1);
            const merchantId = merchantUser[0]?.id;
            if (merchantId) {
              const existing = await db.select().from(establishments).where(eq(establishments.ownerId, merchantId)).limit(1);
              if (existing.length === 0) {
                await db.insert(establishments).values({
                  name: "Serengeti Safari Experience",
                  type: "tour_operator",
                  country: "TZ",
                  city: "Arusha",
                  address: "123 Safari Road, Arusha, Tanzania",
                  latitude: "-3.3869",
                  longitude: "36.6830",
                  currency: "TZS",
                  kybStatus: "approved" as any,
                  ownerId: merchantId,
                  contactPhone: "+255 27 250 1234",
                  contactEmail: "info@serengetisafari.tz",
                });
              }
            }
          }
        }

        const token = await sdk.createSessionToken(config.openId, { name: config.name });
        res.setHeader("Set-Cookie", `app_session_id=${token}; Path=/; Max-Age=31536000; SameSite=Lax`);
        res.redirect(302, redirect || config.defaultRedirect);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });
  }

  // Real-time SSE streams for Fraud Monitor, SOC Dashboard, and BIS
  registerSSERoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    // Start BIS investigation auto-advance background job
    startBisAutoAdvanceJob(60_000);
    // Start biometric enrollment expiry background job (runs every 6 hours)
    startBiometricExpiryJob();
    // Start service health polling job (runs every 5 minutes)
    startServiceHealthPoller();
    // Start loyalty reward expiry job (runs every 6 hours)
    startLoyaltyRewardExpiryJob();
    // Start scheduled payments execution job (runs every hour)
    startScheduledPaymentsJob();
    // Start loyalty tier downgrade grace period job (runs every 6 hours)
    startLoyaltyTierDowngradeJob();
    // Start loyalty points expiry job (runs daily)
    startLoyaltyPointsExpiryJob();
    // Start wallet recurring payments execution job (runs every 5 minutes)
    startWalletRecurringPaymentsJob();
    // Start BIS weekly export scheduler job (runs every 30 minutes)
    startBisWeeklyExportJob();
    // Start webhook retry job (runs every 60 seconds to retry failed deliveries)
    startWebhookRetryJob(60_000);
    // Start merchant payout auto-scheduler job (runs every hour)
    startMerchantPayoutSchedulerJob();
    // Start exchange rate deviation check job (runs every hour, alerts owner on >5% shift)
    startExchangeRateDeviationJob();
    // Start booking reminder job (runs every 15 minutes)
    startBookingReminderJob();
    // Start tourist booking reminder job (runs every 15 minutes)
    startTouristBookingReminderJob();
    // Start deal expiry job (runs every 30 minutes)
    startDealExpiryJob();
    // Start wishlist expiry alert job (runs every 30 minutes)
    startWishlistExpiryAlertJob();
    // Start daily sentiment snapshot job (runs every 24 hours)
    startDailySentimentSnapshotJob();
    // Start review prompt job (runs every 15 minutes)
    startReviewPromptJob();
    // Start sentiment alert job (runs every 24 hours, alerts merchants when positivePercent drops below threshold)
    startSentimentAlertJob();
    // Start leaderboard score snapshot job (runs every 7 days, computes composite scores for trend arrows)
    startLeaderboardSnapshotJob();
    // Start onboarding nudge job (runs every 24 hours, notifies merchants with score < 60% after 7+ days)
    startOnboardingNudgeJob();
  });
}

startServer().catch(console.error);
