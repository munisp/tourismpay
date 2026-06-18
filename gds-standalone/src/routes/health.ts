import { Router } from "express";
import { config } from "../config";
import { dbHealthCheck, isDbAvailable } from "../lib/database";
import { redisHealthCheck, isRedisAvailable } from "../lib/redis";
import { isKafkaAvailable } from "../lib/kafka";

export const healthRouter = Router();

const SERVICE_PORTS: Record<string, { port: number; lang: string }> = {
  pnr_engine: { port: 8082, lang: "Go" },
  queue_system: { port: 8083, lang: "Rust" },
  guest_crm: { port: 8084, lang: "Go" },
  content_mgmt: { port: 8085, lang: "Python" },
  revenue_mgmt: { port: 8086, lang: "Python" },
  group_bookings: { port: 8087, lang: "Go" },
  commission_engine: { port: 8110, lang: "Rust" },
  discount_promo: { port: 8111, lang: "Python" },
  cancellation_policy: { port: 8112, lang: "Go" },
  negotiated_rates: { port: 8113, lang: "Go" },
  settlement_saga: { port: 8114, lang: "Python" },
};

async function checkService(port: number): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`http://localhost:${port}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

// Quick health — for load balancers / k8s liveness
healthRouter.get("/", (_req, res) => {
  res.json({
    status: "healthy",
    service: config.BRAND_NAME,
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    tenant_mode: config.MULTI_TENANT ? "multi" : "single",
  });
});

// Deep health — cascading checks on all dependencies
healthRouter.get("/deep", async (_req, res) => {
  const [db, redis, serviceChecks] = await Promise.all([
    dbHealthCheck(),
    redisHealthCheck(),
    Promise.all(
      Object.entries(SERVICE_PORTS).map(async ([name, { port, lang }]) => ({
        name,
        port,
        lang,
        healthy: await checkService(port),
      }))
    ),
  ]);

  const services: Record<string, { port: number; lang: string; status: string }> = {};
  let healthyServices = 0;
  for (const svc of serviceChecks) {
    services[svc.name] = {
      port: svc.port,
      lang: svc.lang,
      status: svc.healthy ? "healthy" : "unreachable",
    };
    if (svc.healthy) healthyServices++;
  }

  const infrastructure = {
    postgresql: db,
    redis,
    kafka: { status: isKafkaAvailable() ? "connected" : "disconnected" },
  };

  const overallHealthy =
    db.status === "connected" &&
    healthyServices >= 3; // at least 3 core services must be up

  res.status(overallHealthy ? 200 : 503).json({
    status: overallHealthy ? "healthy" : "degraded",
    service: config.BRAND_NAME,
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    infrastructure,
    services,
    summary: {
      services_healthy: healthyServices,
      services_total: Object.keys(SERVICE_PORTS).length,
      db_connected: isDbAvailable(),
      redis_connected: isRedisAvailable(),
      kafka_connected: isKafkaAvailable(),
    },
  });
});

// Readiness — for k8s readiness probe
healthRouter.get("/ready", async (_req, res) => {
  const db = await dbHealthCheck();
  if (db.status === "connected") {
    res.json({ status: "ready" });
  } else {
    res.status(503).json({ status: "not_ready", reason: "database_unavailable" });
  }
});
