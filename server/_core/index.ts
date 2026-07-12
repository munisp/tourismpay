import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import crypto from "crypto";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import compression from "compression";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerDaprRoutes } from "./daprSubscriptions";
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
import { logger } from "./logger";
import { getRedis, closeRedis } from "./redis";
import { closeKafka } from "./kafka";
import { keycloakAuthMiddleware } from "./keycloak";
import { syncRoutes as syncApisixRoutes } from "./apisix";
import { ensureIndices as ensureOpenSearchIndices } from "./opensearch";
import { metricsMiddleware, metricsHandler, healthHandler, readinessHandler, livenessHandler } from "./metrics";
import { generalRateLimit } from "./rateLimiter";
import { ensureLedgerTables } from "./tigerbeetle";
import { getMojaloop } from "./mojaloop";

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

  // Trust proxy for correct client IP behind load balancer (rate limiting, X-Forwarded-*)
  if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
  }

  const server = createServer(app);
  // Stripe webhook MUST be registered before express.json() for raw body access
  registerStripeWebhook(app);

  // ─── Request ID / Distributed Tracing ──────────────────────────────────────
  app.use((req, res, next) => {
    const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    req.headers["x-request-id"] = requestId;
    res.setHeader("x-request-id", requestId);
    next();
  });

  // ─── Security middleware ─────────────────────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: process.env.NODE_ENV === "production" ? {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://js.stripe.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        connectSrc: ["'self'", "https://api.stripe.com", "wss:", process.env.CORS_ORIGIN || "'self'"],
        frameSrc: ["'self'", "https://js.stripe.com"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    } : false,
    crossOriginEmbedderPolicy: false,
  }));

  // CORS: restrict origins in production (env var required)
  const corsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",").map(o => o.trim())
    : (process.env.NODE_ENV === "production" ? ["https://tourismpay.com"] : true);
  app.use(cors({
    origin: corsOrigins as string[] | boolean,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-API-Key", "X-Request-ID", "X-CSRF-Token"],
  }));

  app.use(cookieParser());

  // ─── CSRF Protection (double-submit cookie pattern) ────────────────────────
  // Stateless CSRF: server sets a random token in a cookie; client echoes it in X-CSRF-Token header.
  // Safe methods (GET/HEAD/OPTIONS) and webhook endpoints are exempt.
  app.use((req, res, next) => {
    const exempt = ["GET", "HEAD", "OPTIONS"].includes(req.method)
      || req.path === "/health" || req.path === "/livez" || req.path === "/readyz" || req.path === "/metrics"
      || req.path.startsWith("/api/stripe-webhook")
      || req.path.startsWith("/api/oauth/")
      || req.path.startsWith("/api/dev/");
    if (exempt) {
      // Set CSRF cookie if not present (for SPA to read)
      if (!req.cookies?.["csrf-token"]) {
        const token = crypto.randomBytes(32).toString("hex");
        res.cookie("csrf-token", token, { httpOnly: false, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/" });
      }
      return next();
    }
    const cookieToken = req.cookies?.["csrf-token"];
    const headerToken = req.headers["x-csrf-token"];
    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      res.status(403).json({ error: "CSRF token mismatch" });
      return;
    }
    next();
  });

  // Rate limit API endpoints (100 req/min per IP by default)
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: process.env.RATE_LIMIT_MAX ? parseInt(process.env.RATE_LIMIT_MAX, 10) : 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." },
    skip: (req) => req.path === "/health" || req.path === "/livez" || req.path === "/readyz" || req.path === "/metrics" || req.path.startsWith("/api/dev/"),
  });
  app.use("/api", apiLimiter);
  app.use("/trpc", apiLimiter);

  // ─── Health / Lifecycle Probes (before body parsers — lightweight, no auth) ──
  let serviceReady = false;

  app.get("/health", healthHandler);
  app.get("/health/deep", healthHandler);
  app.get("/livez", livenessHandler);
  app.get("/readyz", readinessHandler);
  app.get("/metrics", metricsHandler);

  // Graceful shutdown: mark not ready on SIGTERM, drain in-flight, then exit
  const markReady = () => { serviceReady = true; };
  const markNotReady = () => { serviceReady = false; };

  process.on("SIGTERM", () => {
    const shutdownEvent = {
      level: "WARN", event: "graceful_shutdown_started", service: "tourismpay-server",
      timestamp: new Date().toISOString(), pod_name: process.env.POD_NAME || "unknown",
    };
    process.stderr.write(JSON.stringify(shutdownEvent) + "\n");
    markNotReady();
    // K8s preStop hook sleeps 5s; we wait 2s extra for endpoint propagation
    setTimeout(() => { process.exit(0); }, 7000);
  });

  // ─── Prometheus metrics collection ────────────────────────────────────────
  app.use(metricsMiddleware());

  // ─── Redis-backed rate limiting (per-route) ────────────────────────────────
  app.use("/api/trpc/wallet", generalRateLimit);
  app.use("/api/trpc/bis", generalRateLimit);
  app.use("/api/trpc/settlement", generalRateLimit);

  // ─── Response compression ──────────────────────────────────────────────────
  app.use(compression());

  // ─── Body parsers ───────────────────────────────────────────────────────────
  app.use(express.json({ limit: "16mb" }));
  app.use(express.urlencoded({ limit: "16mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // ─── Dapr pub/sub subscriptions & sidecar health endpoint ─────────────────────────────
  registerDaprRoutes(app);

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
        // Upsert the demo tourist user into the DB so the app can load their profile
        await dbModule.upsertUser({
          openId: "demo_tourist_001",
          name: "Amara Diallo",
          email: "amara.diallo@demo.tourismpay.com",
          loginMethod: "demo",
          lastSignedIn: new Date(),
        });
        const token = await sdk.createSessionToken("demo_tourist_001", { name: "Amara Diallo" });
        res.setHeader("Set-Cookie", `app_session_id=${token}; Path=/; Max-Age=31536000; SameSite=Lax`);
        const redirect = (_req as any).query?.redirect || "/tourist/onboarding";
        res.redirect(302, redirect as string);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });
  }

  // ─── Keycloak OIDC middleware (when configured) ──────────────────────────
  app.use(keycloakAuthMiddleware());

  // Real-time SSE streams for Fraud Monitor, SOC Dashboard, and BIS
  registerSSERoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      onError({ error, path }) {
        if (process.env.NODE_ENV === "production" && error.code === "INTERNAL_SERVER_ERROR") {
          logger.error(`[tRPC] ${path}:`, { message: error.message, stack: error.stack });
          error.message = "An internal error occurred. Please try again later.";
        }
      },
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
    logger.info(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    logger.info(`Server running on http://localhost:${port}/`);
    markReady();

    // ─── Initialize middleware connections ─────────────────────────────────
    getRedis(); // Connect Redis cache (non-blocking)
    ensureLedgerTables().catch(() => {}); // Create TigerBeetle ledger tables (non-blocking)
    getMojaloop(); // Initialize Mojaloop client (non-blocking)
    syncApisixRoutes().catch(() => {}); // Sync APISIX routes (non-blocking)
    ensureOpenSearchIndices().catch(() => {}); // Create OpenSearch indices (non-blocking)

    const shutdown = async (signal: string) => {
      logger.info(`${signal} received — shutting down gracefully`);
      await closeRedis().catch(() => {});
      await closeKafka().catch(() => {});
      server.close(() => {
        logger.info("HTTP server closed");
        process.exit(0);
      });
      setTimeout(() => {
        logger.error("Graceful shutdown timed out — forcing exit");
        process.exit(1);
      }, 10_000);
    };
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));

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

startServer().catch((err) => logger.error("Unhandled error", err));
