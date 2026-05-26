/**
 * Graceful Degradation Framework — maintains service availability when
 * downstream dependencies are unavailable.
 *
 * Tracks the health of each dependency and automatically switches to
 * fallback behavior when a service is down. Services recover automatically
 * when the dependency comes back.
 *
 * Degradation levels:
 * - FULL:     All dependencies healthy, full functionality
 * - DEGRADED: Some non-critical services down, reduced functionality
 * - MINIMAL:  Core services only (DB must be up)
 * - OFFLINE:  Running from local cache/queue only
 */
import { logger } from "../_core/logger";
import { getCacheStats } from "../middleware/redisClient";
import { getCircuitBreakerStats } from "../middleware/circuitBreaker";

type DegradationLevel = "full" | "degraded" | "minimal" | "offline";

interface ServiceDep {
  name: string;
  critical: boolean; // If true, service going down moves us to MINIMAL
  healthy: boolean;
  lastCheck: number;
  failCount: number;
  lastError?: string;
}

const dependencies = new Map<string, ServiceDep>();

// ─── Registration ────────────────────────────────────────────────────────────

export function registerDependency(name: string, critical: boolean) {
  dependencies.set(name, {
    name,
    critical,
    healthy: true,
    lastCheck: Date.now(),
    failCount: 0,
  });
}

export function markDependencyHealthy(name: string) {
  const dep = dependencies.get(name);
  if (dep) {
    dep.healthy = true;
    dep.lastCheck = Date.now();
    dep.failCount = 0;
    dep.lastError = undefined;
  }
}

export function markDependencyUnhealthy(name: string, error?: string) {
  const dep = dependencies.get(name);
  if (dep) {
    const wasHealthy = dep.healthy;
    dep.healthy = false;
    dep.lastCheck = Date.now();
    dep.failCount++;
    dep.lastError = error;
    if (wasHealthy) {
      logger.warn(`Dependency ${name} is now unhealthy`, { error, critical: dep.critical });
    }
  }
}

// ─── Level Computation ───────────────────────────────────────────────────────

export function getDegradationLevel(): DegradationLevel {
  const deps = Array.from(dependencies.values());
  if (deps.length === 0) return "full";

  const criticalDown = deps.filter((d) => d.critical && !d.healthy);
  const nonCriticalDown = deps.filter((d) => !d.critical && !d.healthy);

  if (criticalDown.length > 0) {
    const dbDown = criticalDown.some((d) => d.name === "postgres");
    return dbDown ? "offline" : "minimal";
  }
  if (nonCriticalDown.length > 0) return "degraded";
  return "full";
}

export function getDegradationStatus() {
  const level = getDegradationLevel();
  const deps = Array.from(dependencies.values());
  const cbStats = getCircuitBreakerStats();
  const cacheStats = getCacheStats();

  return {
    level,
    dependencies: deps.map((d) => ({
      name: d.name,
      healthy: d.healthy,
      critical: d.critical,
      failCount: d.failCount,
      lastCheck: new Date(d.lastCheck).toISOString(),
      lastError: d.lastError,
    })),
    circuitBreakers: Object.entries(cbStats).map(([name, state]) => ({
      name,
      state: state.state,
      failures: state.totalFailures,
    })),
    cache: cacheStats,
    capabilities: getCapabilities(level),
  };
}

function getCapabilities(level: DegradationLevel) {
  switch (level) {
    case "full":
      return {
        payments: true, walletOps: true, fraudScoring: true,
        bisChecks: true, mlInference: true, notifications: true,
        analytics: true, search: true, streaming: true,
      };
    case "degraded":
      return {
        payments: true, walletOps: true, fraudScoring: true,
        bisChecks: true, mlInference: false, notifications: false,
        analytics: false, search: false, streaming: false,
      };
    case "minimal":
      return {
        payments: true, walletOps: true, fraudScoring: false,
        bisChecks: false, mlInference: false, notifications: false,
        analytics: false, search: false, streaming: false,
      };
    case "offline":
      return {
        payments: false, walletOps: false, fraudScoring: false,
        bisChecks: false, mlInference: false, notifications: false,
        analytics: false, search: false, streaming: false,
      };
  }
}

// ─── Degradation-aware wrapper ───────────────────────────────────────────────

/**
 * Execute a function that depends on a service, with automatic fallback.
 * If the service is unhealthy, returns the fallback value immediately.
 */
export async function withDegradation<T>(
  serviceName: string,
  fn: () => Promise<T>,
  fallback: T,
  options?: { skipIfLevel?: DegradationLevel }
): Promise<T> {
  const dep = dependencies.get(serviceName);
  if (dep && !dep.healthy) {
    return fallback;
  }

  const level = getDegradationLevel();
  if (options?.skipIfLevel && level === options.skipIfLevel) {
    return fallback;
  }

  try {
    const result = await fn();
    if (dep) markDependencyHealthy(serviceName);
    return result;
  } catch (err) {
    if (dep) markDependencyUnhealthy(serviceName, err instanceof Error ? err.message : String(err));
    return fallback;
  }
}

// ─── Initialize default dependencies ─────────────────────────────────────────

export function initDegradationDeps() {
  registerDependency("postgres", true);
  registerDependency("redis", false);
  registerDependency("go-settlement", false);
  registerDependency("python-ml", false);
  registerDependency("pbac-engine", false);
  registerDependency("kafka", false);
  registerDependency("opensearch", false);
  registerDependency("keycloak", false);
  registerDependency("temporal", false);
  registerDependency("lakehouse", false);
  registerDependency("neo4j", false);
  logger.info("Degradation framework initialized", { dependencies: dependencies.size });
}

// ─── Periodic health checker ─────────────────────────────────────────────────

let healthCheckInterval: ReturnType<typeof setInterval> | null = null;

export function startDependencyHealthChecks(intervalMs = 30_000) {
  healthCheckInterval = setInterval(async () => {
    // Check Redis via cache stats
    const cacheStats = getCacheStats();
    if (cacheStats.redisAvailable) {
      markDependencyHealthy("redis");
    } else {
      markDependencyUnhealthy("redis", "Not connected");
    }

    // Check circuit breaker states for downstream services
    const cbStats = getCircuitBreakerStats();
    for (const [name, state] of Object.entries(cbStats)) {
      const depName = name.replace(/([A-Z])/g, "-$1").toLowerCase();
      const dep = dependencies.get(depName) ?? dependencies.get(name);
      if (dep) {
        if (state.state === "open") {
          markDependencyUnhealthy(dep.name, `Circuit breaker open (${state.totalFailures} failures)`);
        } else if (state.state === "closed") {
          markDependencyHealthy(dep.name);
        }
      }
    }
  }, intervalMs);
}

export function stopDependencyHealthChecks() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
}
