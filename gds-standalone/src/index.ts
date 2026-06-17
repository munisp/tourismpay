/**
 * Africa-first GDS — Standalone API Gateway
 *
 * Independent Express server with JWT auth (Keycloak or any OIDC provider).
 * Can be deployed separately from TourismPay with its own database, auth,
 * and middleware stack.
 *
 * External applications integrate via REST API or the SDK client.
 */
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";

import { authMiddleware } from "./auth";
import { tenantMiddleware } from "./tenant";
import { rateLimiter } from "./rateLimit";
import { propertiesRouter } from "./routes/properties";
import { reservationsRouter } from "./routes/reservations";
import { availabilityRouter } from "./routes/availability";
import { ratesRouter } from "./routes/rates";
import { agentsRouter } from "./routes/agents";
import { settlementRouter } from "./routes/settlement";
import { searchRouter } from "./routes/search";
import { analyticsRouter } from "./routes/analytics";
import { distributionRouter } from "./routes/distribution";
import { taxRouter } from "./routes/tax";
import { tippingRouter } from "./routes/tipping";
import { remittanceRouter } from "./routes/remittance";
import { loyaltyRouter } from "./routes/loyalty";
import { pnrRouter } from "./routes/pnr";
import { queueRouter } from "./routes/queue";
import { guestProfileRouter } from "./routes/guest-profile";
import { contentRouter } from "./routes/content";
import { revenueRouter } from "./routes/revenue";
import { groupBookingsRouter } from "./routes/group-bookings";
import { healthRouter } from "./routes/health";
import meteringRouter from "./routes/metering";
import sandboxRouter from "./routes/sandbox";
import { onboardingRouter } from "./routes/onboarding";
import { config } from "./config";

const app = express();

// --- Global Middleware ---
app.use(helmet());
app.use(compression());
app.use(express.json({ limit: "16mb" }));
app.use(morgan("combined"));
app.use(cors({
  origin: config.CORS_ORIGINS.split(","),
  credentials: true,
}));

// --- Health (no auth) ---
app.use("/health", healthRouter);
app.use("/api/v1/gds/health", healthRouter);

// --- Auth + Tenant + Rate Limit ---
app.use("/api", authMiddleware);
app.use("/api", tenantMiddleware);
app.use("/api", rateLimiter);

// --- GDS API Routes ---
app.use("/api/v1/gds/properties", propertiesRouter);
app.use("/api/v1/gds/reservations", reservationsRouter);
app.use("/api/v1/gds/availability", availabilityRouter);
app.use("/api/v1/gds/rates", ratesRouter);
app.use("/api/v1/gds/agents", agentsRouter);
app.use("/api/v1/gds/settlement", settlementRouter);
app.use("/api/v1/gds/search", searchRouter);
app.use("/api/v1/gds/analytics", analyticsRouter);
app.use("/api/v1/gds/distribution", distributionRouter);
app.use("/api/v1/gds/tax", taxRouter);
app.use("/api/v1/gds/tipping", tippingRouter);
app.use("/api/v1/gds/remittance", remittanceRouter);
app.use("/api/v1/gds/loyalty", loyaltyRouter);
app.use("/api/v1/gds/pnr", pnrRouter);
app.use("/api/v1/gds/queues", queueRouter);
app.use("/api/v1/gds/guests", guestProfileRouter);
app.use("/api/v1/gds/content", contentRouter);
app.use("/api/v1/gds/revenue", revenueRouter);
app.use("/api/v1/gds/groups", groupBookingsRouter);
app.use("/api/v1/gds/metering", meteringRouter);
app.use("/api/v1/gds/sandbox", sandboxRouter);
app.use("/api/v1/gds/onboarding", onboardingRouter);

// --- Error Handler ---
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = (err as any).status || 500;
  const message = config.NODE_ENV === "production" ? "Internal server error" : err.message;
  res.status(status).json({ error: message });
});

// --- Start Server ---
const PORT = config.PORT;
app.listen(PORT, () => {
  console.log(`[GDS Standalone] Africa-first GDS running on port ${PORT}`);
  console.log(`[GDS Standalone] Environment: ${config.NODE_ENV}`);
  console.log(`[GDS Standalone] Tenant mode: ${config.MULTI_TENANT ? "multi-tenant" : "single-tenant"}`);
});

export { app };
