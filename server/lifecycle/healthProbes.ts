/**
 * Kubernetes-style Health Probes — liveness, readiness, startup.
 *
 * - /api/health/live   — process is alive (always 200 unless shutting down)
 * - /api/health/ready  — all critical dependencies are reachable
 * - /api/health/startup — initial boot checks passed
 */
import type { Express, Request, Response } from "express";
import { getDb } from "../db";
import { getCacheStats } from "../middleware/redisClient";
import { isShuttingDown } from "./gracefulShutdown";
import { getDegradationStatus } from "./gracefulDegradation";
import { logger } from "../_core/logger";

let startupComplete = false;
const bootTime = Date.now();

interface DependencyCheck {
  name: string;
  status: "ok" | "degraded" | "down";
  latencyMs: number;
  detail?: string;
}

async function checkPostgres(): Promise<DependencyCheck> {
  const start = Date.now();
  try {
    const db = await getDb();
    if (!db) return { name: "postgres", status: "down", latencyMs: Date.now() - start, detail: "No connection" };
    return { name: "postgres", status: "ok", latencyMs: Date.now() - start };
  } catch (err) {
    return { name: "postgres", status: "down", latencyMs: Date.now() - start, detail: String(err) };
  }
}

async function checkRedis(): Promise<DependencyCheck> {
  const start = Date.now();
  const stats = getCacheStats();
  return {
    name: "redis",
    status: stats.redisAvailable ? "ok" : "degraded",
    latencyMs: Date.now() - start,
    detail: stats.strategy,
  };
}

export function registerHealthProbes(app: Express) {
  // Liveness — is the process alive?
  app.get("/api/health/live", (_req: Request, res: Response) => {
    if (isShuttingDown()) {
      res.status(503).json({ status: "shutting_down" });
      return;
    }
    res.json({
      status: "ok",
      uptime: Math.round((Date.now() - bootTime) / 1000),
      timestamp: new Date().toISOString(),
    });
  });

  // Readiness — can the service handle traffic?
  app.get("/api/health/ready", async (_req: Request, res: Response) => {
    if (isShuttingDown()) {
      res.status(503).json({ status: "shutting_down" });
      return;
    }

    const checks = await Promise.all([checkPostgres(), checkRedis()]);
    const allOk = checks.every((c) => c.status !== "down");
    const pgOk = checks.find((c) => c.name === "postgres")?.status !== "down";

    const degradation = getDegradationStatus();

    res.status(pgOk ? 200 : 503).json({
      status: allOk ? "ready" : pgOk ? "degraded" : "not_ready",
      dependencies: checks,
      degradation,
      uptime: Math.round((Date.now() - bootTime) / 1000),
    });
  });

  // Startup — has the initial boot sequence completed?
  app.get("/api/health/startup", (_req: Request, res: Response) => {
    res.status(startupComplete ? 200 : 503).json({
      status: startupComplete ? "started" : "starting",
      bootTimeMs: Date.now() - bootTime,
    });
  });

  logger.info("Health probes registered: /api/health/{live,ready,startup}");
}

export function markStartupComplete() {
  startupComplete = true;
  logger.info("Startup complete", { bootTimeMs: Date.now() - bootTime });
}
