/**
 * Circuit Breaker — prevents cascading failures when downstream services are degraded.
 *
 * States:
 * - CLOSED: normal operation, requests pass through
 * - OPEN: service is down, fail fast without attempting the call
 * - HALF_OPEN: testing if service recovered, allow limited requests
 */

type CircuitState = "closed" | "open" | "half_open";

interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxRequests: number;
  monitorWindowMs: number;
}

interface CircuitBreakerState {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number;
  lastStateChange: number;
  halfOpenRequests: number;
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
  totalShortCircuited: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  halfOpenMaxRequests: 3,
  monitorWindowMs: 60_000,
};

const circuits = new Map<string, CircuitBreakerState>();
const configs = new Map<string, CircuitBreakerConfig>();

function getState(serviceName: string): CircuitBreakerState {
  let state = circuits.get(serviceName);
  if (!state) {
    state = {
      state: "closed",
      failureCount: 0,
      successCount: 0,
      lastFailureTime: 0,
      lastStateChange: Date.now(),
      halfOpenRequests: 0,
      totalRequests: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      totalShortCircuited: 0,
    };
    circuits.set(serviceName, state);
  }
  return state;
}

function getConfig(serviceName: string): CircuitBreakerConfig {
  return configs.get(serviceName) ?? DEFAULT_CONFIG;
}

function transition(state: CircuitBreakerState, newState: CircuitState) {
  state.state = newState;
  state.lastStateChange = Date.now();
  if (newState === "closed") {
    state.failureCount = 0;
    state.successCount = 0;
    state.halfOpenRequests = 0;
  }
  if (newState === "half_open") {
    state.halfOpenRequests = 0;
  }
}

export function configureCircuit(serviceName: string, config: Partial<CircuitBreakerConfig>) {
  configs.set(serviceName, { ...DEFAULT_CONFIG, ...config });
}

/**
 * Execute an async function through the circuit breaker.
 * Returns the result of fn() on success, or throws on failure/short-circuit.
 */
export async function withCircuitBreaker<T>(
  serviceName: string,
  fn: () => Promise<T>,
  fallback?: () => T
): Promise<T> {
  const state = getState(serviceName);
  const config = getConfig(serviceName);
  const now = Date.now();

  state.totalRequests++;

  // OPEN state — check if we should transition to half-open
  if (state.state === "open") {
    if (now - state.lastFailureTime >= config.resetTimeoutMs) {
      transition(state, "half_open");
    } else {
      state.totalShortCircuited++;
      if (fallback) return fallback();
      throw new CircuitBreakerOpenError(serviceName, state);
    }
  }

  // HALF_OPEN state — limit concurrent probes
  if (state.state === "half_open") {
    if (state.halfOpenRequests >= config.halfOpenMaxRequests) {
      state.totalShortCircuited++;
      if (fallback) return fallback();
      throw new CircuitBreakerOpenError(serviceName, state);
    }
    state.halfOpenRequests++;
  }

  try {
    const result = await fn();
    onSuccess(serviceName, state, config);
    return result;
  } catch (err) {
    onFailure(serviceName, state, config);
    if (fallback) return fallback();
    throw err;
  }
}

function onSuccess(serviceName: string, state: CircuitBreakerState, config: CircuitBreakerConfig) {
  state.totalSuccesses++;
  state.successCount++;

  if (state.state === "half_open") {
    if (state.successCount >= config.halfOpenMaxRequests) {
      transition(state, "closed");
    }
  } else if (state.state === "closed") {
    // Reset failure count on success within the window
    state.failureCount = 0;
  }
}

function onFailure(serviceName: string, state: CircuitBreakerState, config: CircuitBreakerConfig) {
  state.totalFailures++;
  state.failureCount++;
  state.lastFailureTime = Date.now();

  if (state.state === "half_open") {
    transition(state, "open");
  } else if (state.state === "closed" && state.failureCount >= config.failureThreshold) {
    transition(state, "open");
  }
}

export class CircuitBreakerOpenError extends Error {
  constructor(public serviceName: string, public circuitState: CircuitBreakerState) {
    super(`Circuit breaker OPEN for service: ${serviceName}`);
    this.name = "CircuitBreakerOpenError";
  }
}

/** Get stats for all circuits (used by health dashboard) */
export function getCircuitBreakerStats(): Record<string, CircuitBreakerState & { config: CircuitBreakerConfig }> {
  const stats: Record<string, CircuitBreakerState & { config: CircuitBreakerConfig }> = {};
  circuits.forEach((state, name) => {
    stats[name] = { ...state, config: getConfig(name) };
  });
  return stats;
}

/** Reset a specific circuit (admin action) */
export function resetCircuit(serviceName: string) {
  const state = getState(serviceName);
  transition(state, "closed");
}

// Configure known services
configureCircuit("pbac-engine", { failureThreshold: 5, resetTimeoutMs: 15_000 });
configureCircuit("go-settlement", { failureThreshold: 3, resetTimeoutMs: 30_000 });
configureCircuit("python-ml", { failureThreshold: 5, resetTimeoutMs: 60_000 });
configureCircuit("redis", { failureThreshold: 3, resetTimeoutMs: 10_000 });
configureCircuit("kafka", { failureThreshold: 5, resetTimeoutMs: 30_000 });
configureCircuit("temporal", { failureThreshold: 5, resetTimeoutMs: 30_000 });
configureCircuit("opensearch", { failureThreshold: 5, resetTimeoutMs: 30_000 });
configureCircuit("permify", { failureThreshold: 5, resetTimeoutMs: 30_000 });
configureCircuit("apisix", { failureThreshold: 5, resetTimeoutMs: 30_000 });
configureCircuit("lakehouse", { failureThreshold: 5, resetTimeoutMs: 60_000 });
configureCircuit("crypto-engine", { failureThreshold: 3, resetTimeoutMs: 15_000 });
configureCircuit("offline-sync", { failureThreshold: 5, resetTimeoutMs: 30_000 });
