/**
 * Service Health Polling Job
 *
 * Runs every 5 minutes to:
 *   1. Ping all configured microservice /health endpoints
 *   2. Record results to service_health_history for sparkline display
 *   3. Send an owner notification when a service transitions healthy → unreachable
 *      (1-hour cooldown per service to prevent notification spam)
 *   4. Prune history records older than 24 hours
 *
 * Services polled:
 *   - bis-core    (BIS_CORE_URL)
 *   - bis-ai      (BIS_AI_URL)
 *   - bis-gateway (BIS_GATEWAY_URL)
 *   - bis-osint   (BIS_OSINT_URL)
 *   - kyb-service (KYB_SERVICE_URL)
 *   - registry    (REGISTRY_SERVICE_URL)
 */
import { getDb } from "../db";
import { serviceHealthAlerts, serviceHealthHistory } from "../../drizzle/schema";
import { eq, lt } from "drizzle-orm";
import { notifyOwner } from "../_core/notification";
import { ENV } from "../_core/env";

const ALERT_COOLDOWN_S = 60 * 60; // 1 hour between alerts per service
const HISTORY_TTL_S = 24 * 60 * 60; // keep 24h of history
const POLL_TIMEOUT_MS = 5000; // 5s per service

interface ServiceConfig {
  key: string;
  name: string;
  url: string;
  healthPath: string;
}

function getServiceConfigs(): ServiceConfig[] {
  return [
    { key: "bis-core", name: "BIS Core", url: ENV.bisCoreUrl, healthPath: "/health" },
    { key: "bis-ai", name: "BIS AI", url: ENV.bisAiUrl, healthPath: "/health" },
    { key: "bis-gateway", name: "BIS Gateway", url: ENV.bisGatewayUrl, healthPath: "/health" },
    { key: "bis-osint", name: "BIS OSINT", url: ENV.bisOsintUrl, healthPath: "/health" },
    { key: "kyb-service", name: "KYB Service", url: ENV.kybServiceUrl, healthPath: "/health" },
    { key: "registry", name: "Registry Service", url: ENV.registryServiceUrl, healthPath: "/health" },
  ].filter((s) => !!s.url); // only poll configured services
}

interface PollResult {
  key: string;
  name: string;
  status: "healthy" | "unhealthy" | "unreachable";
  httpStatus?: number;
  responseMs: number;
  error?: string;
}

async function pollService(svc: ServiceConfig): Promise<PollResult> {
  const start = Date.now();
  try {
    const url = `${svc.url.replace(/\/$/, "")}${svc.healthPath}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { "X-Source": "tourismpay-pwa-health-poller" },
      signal: AbortSignal.timeout(POLL_TIMEOUT_MS),
    });
    const responseMs = Date.now() - start;
    return {
      key: svc.key,
      name: svc.name,
      status: res.ok ? "healthy" : "unhealthy",
      httpStatus: res.status,
      responseMs,
    };
  } catch (err) {
    return {
      key: svc.key,
      name: svc.name,
      status: "unreachable",
      responseMs: Date.now() - start,
      error: err instanceof Error ? err.message : "unknown",
    };
  }
}

async function runHealthPoller() {
  const db = await getDb();
  if (!db) return;

  const services = getServiceConfigs();
  if (services.length === 0) return; // no services configured

  const nowS = Math.floor(Date.now() / 1000);

  // Poll all services concurrently
  const results = await Promise.all(services.map(pollService));

  // Load existing alert records for cooldown check
  const existingAlerts = await db
    .select()
    .from(serviceHealthAlerts)
    .catch(() => [] as typeof serviceHealthAlerts.$inferSelect[]);

  const alertMap = new Map(existingAlerts.map((a) => [a.serviceKey, a]));

  for (const result of results) {
    // 1. Record to history
    await db.insert(serviceHealthHistory).values({
      id: crypto.randomUUID(),
      serviceKey: result.key,
      status: result.status,
      httpStatus: result.httpStatus,
      responseMs: result.responseMs,
      checkedAt: nowS,
    }).catch(() => {});

    // 2. Check if we need to send an owner alert
    if (result.status === "unreachable" || result.status === "unhealthy") {
      const existing = alertMap.get(result.key);
      const lastAlertAt = existing?.lastAlertAt ?? 0;
      const cooldownExpired = (nowS - lastAlertAt) >= ALERT_COOLDOWN_S;

      if (cooldownExpired) {
        // Send owner notification
        const statusLabel = result.status === "unreachable" ? "🔴 Unreachable" : "🟡 Unhealthy";
        const errorDetail = result.error ? ` Error: ${result.error}.` : result.httpStatus ? ` HTTP ${result.httpStatus}.` : "";
        await notifyOwner({
          title: `${statusLabel}: ${result.name} microservice`,
          content:
            `The **${result.name}** service (${result.key}) is currently **${result.status}**.` +
            errorDetail +
            ` Response time: ${result.responseMs}ms.` +
            ` This alert will not repeat for 1 hour.`,
        }).catch(() => {});

        // Upsert alert record with updated timestamp and count
        if (existing) {
          await db
            .update(serviceHealthAlerts)
            .set({
              lastAlertAt: nowS,
              lastStatus: result.status,
              alertCount: (existing.alertCount ?? 0) + 1,
            })
            .where(eq(serviceHealthAlerts.serviceKey, result.key))
            .catch(() => {});
        } else {
          await db.insert(serviceHealthAlerts).values({
            id: crypto.randomUUID(),
            serviceKey: result.key,
            lastAlertAt: nowS,
            lastStatus: result.status,
            alertCount: 1,
          }).catch(() => {});
        }
        console.log(`[Health Poller] Alert sent for ${result.name} (${result.status})`);
      }
    }
  }

  // 3. Prune history older than 24h
  const cutoff = nowS - HISTORY_TTL_S;
  await db
    .delete(serviceHealthHistory)
    .where(lt(serviceHealthHistory.checkedAt, cutoff))
    .catch(() => {});

  const unhealthy = results.filter((r) => r.status !== "healthy");
  if (unhealthy.length > 0) {
    console.log(
      `[Health Poller] Checked ${results.length} services. Unhealthy: ${unhealthy.map((r) => r.key).join(", ")}`
    );
  }
}

let _jobInterval: ReturnType<typeof setInterval> | null = null;

export function startServiceHealthPoller(intervalMs = 5 * 60 * 1000) {
  if (_jobInterval) return; // already running
  // Run immediately on start, then on interval
  runHealthPoller().catch((err) => console.error("[Health Poller] Initial run error:", err));
  _jobInterval = setInterval(() => {
    runHealthPoller().catch((err) => console.error("[Health Poller] Cycle error:", err));
  }, intervalMs);
  console.log(`[Health Poller] Started (interval: ${intervalMs / 60000}min)`);
}

export function stopServiceHealthPoller() {
  if (_jobInterval) {
    clearInterval(_jobInterval);
    _jobInterval = null;
  }
}

/** Exported for testing: run a single poll cycle */
export { runHealthPoller, pollService, getServiceConfigs };
