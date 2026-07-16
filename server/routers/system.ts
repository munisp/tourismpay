/**
 * server/routers/system.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * System API Router
 *
 * Provides:
 *  1. GET /health        — Aggregated health check (liveness + readiness)
 *  2. GET /metrics       — Prometheus metrics endpoint
 *  3. GET /version       — API version and build info
 *  4. GET /slo           — SLO status dashboard
 *  5. POST /compliance/consent  — Record user consent (NDPR/GDPR)
 *  6. GET  /compliance/limits   — Get user's CBN transaction limits
 *  7. POST /compliance/aml-check — Run AML check on a transaction
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  runHealthChecks,
  getPrometheusMetrics,
  getSLOStatus,
} from "../_core/observability";
import {
  checkCBNTransactionLimit,
  runAMLCheck,
  recordConsent,
  type KycTier,
  type ConsentPurpose,
} from "../_core/compliance";
import { logger } from "../_core/logger";

export const systemRouter = Router();

// ─── 1. Health Check ─────────────────────────────────────────────────────────

systemRouter.get("/health", async (req: Request, res: Response) => {
  try {
    const report = await runHealthChecks();
    const statusCode =
      report.status === "healthy" ? 200 :
      report.status === "degraded" ? 207 : 503;

    res.status(statusCode).json(report);
  } catch (err) {
    logger.error({ type: "health_check_error", error: String(err) });
    res.status(503).json({
      status: "unhealthy",
      error: "Health check failed",
      timestamp: new Date().toISOString(),
    });
  }
});

// Kubernetes liveness probe — always returns 200 if process is alive
systemRouter.get("/health/live", (_req: Request, res: Response) => {
  res.status(200).json({ status: "alive", timestamp: new Date().toISOString() });
});

// Kubernetes readiness probe — returns 200 only when ready to serve traffic
systemRouter.get("/health/ready", async (_req: Request, res: Response) => {
  try {
    const report = await runHealthChecks();
    const ready = report.status !== "unhealthy";
    res.status(ready ? 200 : 503).json({
      ready,
      status: report.status,
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({ ready: false, timestamp: new Date().toISOString() });
  }
});

// ─── 2. Prometheus Metrics ────────────────────────────────────────────────────

systemRouter.get("/metrics", (_req: Request, res: Response) => {
  res.set("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
  res.send(getPrometheusMetrics());
});

// ─── 3. Version & Build Info ──────────────────────────────────────────────────

systemRouter.get("/version", (_req: Request, res: Response) => {
  res.json({
    name: "tourismpay-api",
    version: process.env.npm_package_version ?? "unknown",
    apiVersion: "v1",
    buildTime: process.env.BUILD_TIME ?? "unknown",
    commitSha: process.env.COMMIT_SHA ?? "unknown",
    environment: process.env.NODE_ENV ?? "development",
    nodeVersion: process.version,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ─── 4. SLO Status ────────────────────────────────────────────────────────────

systemRouter.get("/slo", (_req: Request, res: Response) => {
  const slos = getSLOStatus();
  const overallStatus = slos.every((s) => s.status === "OK")
    ? "OK"
    : slos.some((s) => s.status === "VIOLATED")
    ? "VIOLATED"
    : "WARNING";

  res.json({
    overallStatus,
    slos,
    timestamp: new Date().toISOString(),
  });
});

// ─── 5. Compliance: Record Consent ───────────────────────────────────────────

const consentSchema = z.object({
  userId: z.union([z.string(), z.number()]),
  purpose: z.enum([
    "marketing_email",
    "marketing_sms",
    "analytics",
    "third_party_sharing",
    "profiling",
    "location_tracking",
  ]),
  granted: z.boolean(),
});

systemRouter.post("/compliance/consent", async (req: Request, res: Response) => {
  const parsed = consentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    return;
  }

  try {
    await recordConsent({
      ...parsed.data,
      purpose: parsed.data.purpose as ConsentPurpose,
      grantedAt: parsed.data.granted ? new Date() : undefined,
      withdrawnAt: !parsed.data.granted ? new Date() : undefined,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json({
      success: true,
      message: parsed.data.granted ? "Consent recorded" : "Consent withdrawn",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error({ type: "consent_error", error: String(err) });
    res.status(500).json({ error: "Failed to record consent" });
  }
});

// ─── 6. Compliance: CBN Transaction Limits ───────────────────────────────────

const limitsSchema = z.object({
  kycTier: z.enum(["TIER_1", "TIER_2", "TIER_3"]),
  amountKobo: z.number().positive().optional(),
  transactionType: z.enum(["single", "daily", "monthly"]).optional(),
});

systemRouter.get("/compliance/limits", (req: Request, res: Response) => {
  const parsed = limitsSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query parameters", details: parsed.error.flatten() });
    return;
  }

  const { kycTier, amountKobo, transactionType } = parsed.data;

  // Return all limits for the tier
  const { CBN_KYC_LIMITS } = require("../_core/compliance");
  const tierLimits = CBN_KYC_LIMITS[kycTier];

  const response: Record<string, unknown> = { kycTier, limits: tierLimits };

  // If amount and type provided, also check if it's within limits
  if (amountKobo && transactionType) {
    response.check = checkCBNTransactionLimit(amountKobo, kycTier as KycTier, transactionType);
  }

  res.json(response);
});

// ─── 7. Compliance: AML Check ────────────────────────────────────────────────

const amlCheckSchema = z.object({
  transactionId: z.string(),
  userId: z.union([z.string(), z.number()]),
  amountKobo: z.number().positive(),
  transactionType: z.string(),
  fraudScore: z.number().min(0).max(1).optional(),
  isNewBeneficiary: z.boolean().optional(),
  beneficiaryCountry: z.string().length(2).optional(),
  structuringDetected: z.boolean().optional(),
});

systemRouter.post("/compliance/aml-check", async (req: Request, res: Response) => {
  const parsed = amlCheckSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    return;
  }

  try {
    const result = runAMLCheck(parsed.data);

    logger.info({
      type: "aml_check",
      transactionId: parsed.data.transactionId,
      userId: parsed.data.userId,
      result,
    });

    res.json({
      transactionId: parsed.data.transactionId,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error({ type: "aml_check_error", error: String(err) });
    res.status(500).json({ error: "AML check failed" });
  }
});

// ─── 8. Graceful Shutdown Endpoint (internal only) ───────────────────────────

systemRouter.post("/system/shutdown", (req: Request, res: Response) => {
  const internalToken = process.env.INTERNAL_SHUTDOWN_TOKEN;
  if (!internalToken || req.headers["x-internal-token"] !== internalToken) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  res.json({ message: "Shutdown initiated" });
  logger.info("[System] Graceful shutdown requested via API");

  setTimeout(() => {
    process.emit("SIGTERM");
  }, 100);
});
