/**
 * server/_core/security.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Production Security Hardening Layer
 *
 * Covers:
 *  1. Request ID propagation (X-Request-ID / X-Correlation-ID)
 *  2. Idempotency key enforcement for mutating endpoints
 *  3. Input sanitisation (XSS, path traversal, null-byte injection)
 *  4. Circuit-breaker factory for external HTTP calls
 *  5. Secrets validation at startup (fail-fast)
 *  6. CORS strict-mode helper
 *  7. Content-Security-Policy builder
 *  8. Security event audit logger
 */

import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { logger } from "./logger";

// ─── 1. Request ID Propagation ────────────────────────────────────────────────

/**
 * Attaches a unique request ID to every inbound request.
 * Respects existing X-Request-ID / X-Correlation-ID headers so that
 * upstream gateways (APISIX) can propagate their own IDs.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const existingId =
    (req.headers["x-request-id"] as string) ||
    (req.headers["x-correlation-id"] as string);

  const requestId = existingId || `tp-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;

  // Attach to request for downstream use
  (req as any).requestId = requestId;

  // Echo back so clients can correlate
  res.setHeader("X-Request-ID", requestId);
  res.setHeader("X-Correlation-ID", requestId);

  next();
}

// ─── 2. Idempotency Key Store ─────────────────────────────────────────────────

const idempotencyStore = new Map<string, { result: unknown; expiresAt: number }>();
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Check and store idempotency keys for mutating operations.
 * Returns the cached result if the key was already processed.
 */
export function checkIdempotencyKey(key: string): unknown | null {
  const entry = idempotencyStore.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    idempotencyStore.delete(key);
    return null;
  }
  return entry.result;
}

export function storeIdempotencyResult(key: string, result: unknown): void {
  idempotencyStore.set(key, {
    result,
    expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
  });
  // Prune expired entries periodically
  if (idempotencyStore.size > 10_000) {
    const now = Date.now();
    for (const [k, v] of (Array.from(idempotencyStore) as [string, { result: unknown; expiresAt: number }][])) {
      if (now > v.expiresAt) idempotencyStore.delete(k);
    }
  }
}

// ─── 3. Input Sanitisation ────────────────────────────────────────────────────

const NULL_BYTE_RE = /\0/g;
const PATH_TRAVERSAL_RE = /\.\.[/\\]/g;
const SCRIPT_TAG_RE = /<script[\s\S]*?>[\s\S]*?<\/script>/gi;
const HTML_ENTITY_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
  "/": "&#x2F;",
};

/** Escape HTML special characters to prevent XSS in reflected content. */
export function escapeHtml(str: string): string {
  return str.replace(/[&<>"'/]/g, (c) => HTML_ENTITY_MAP[c] ?? c);
}

/** Strip null bytes and path traversal sequences from a string. */
export function sanitizeFilename(name: string): string {
  return name
    .replace(NULL_BYTE_RE, "")
    .replace(PATH_TRAVERSAL_RE, "")
    .replace(/[^a-zA-Z0-9._\-\s]/g, "_")
    .substring(0, 255);
}

/** Remove script tags and null bytes from free-text input. */
export function sanitizeText(text: string): string {
  return text
    .replace(NULL_BYTE_RE, "")
    .replace(SCRIPT_TAG_RE, "")
    .trim();
}

/**
 * Express middleware that sanitises common injection vectors in
 * query strings, URL params, and JSON body string fields.
 */
export function inputSanitizationMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const sanitizeObject = (obj: unknown): unknown => {
    if (typeof obj === "string") return sanitizeText(obj);
    if (Array.isArray(obj)) return obj.map(sanitizeObject);
    if (obj && typeof obj === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        out[k] = sanitizeObject(v);
      }
      return out;
    }
    return obj;
  };

  if (req.query) req.query = sanitizeObject(req.query) as typeof req.query;
  if (req.params) req.params = sanitizeObject(req.params) as typeof req.params;
  // Note: req.body is sanitised at the application layer via Zod schemas
  next();
}

// ─── 4. Circuit Breaker ───────────────────────────────────────────────────────

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerOptions {
  /** Number of consecutive failures before opening the circuit. Default: 5 */
  threshold?: number;
  /** How long (ms) to keep the circuit open before trying HALF_OPEN. Default: 30s */
  resetTimeoutMs?: number;
  /** Name for logging. */
  name?: string;
}

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failures = 0;
  private openedAt = 0;
  private readonly threshold: number;
  private readonly resetTimeoutMs: number;
  private readonly name: string;

  constructor(opts: CircuitBreakerOptions = {}) {
    this.threshold = opts.threshold ?? 5;
    this.resetTimeoutMs = opts.resetTimeoutMs ?? 30_000;
    this.name = opts.name ?? "circuit";
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      if (Date.now() - this.openedAt >= this.resetTimeoutMs) {
        this.state = "HALF_OPEN";
        logger.info(`[CircuitBreaker:${this.name}] HALF_OPEN — attempting probe`);
      } else {
        throw new Error(`Circuit breaker OPEN for ${this.name} — request rejected`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    if (this.state === "HALF_OPEN") {
      logger.info(`[CircuitBreaker:${this.name}] CLOSED — probe succeeded`);
    }
    this.failures = 0;
    this.state = "CLOSED";
  }

  private onFailure(): void {
    this.failures++;
    if (this.failures >= this.threshold) {
      this.state = "OPEN";
      this.openedAt = Date.now();
      logger.warn(`[CircuitBreaker:${this.name}] OPEN after ${this.failures} failures`);
    }
  }

  getState(): CircuitState { return this.state; }
  getFailures(): number { return this.failures; }
}

/** Registry of named circuit breakers for external services. */
const circuitBreakers = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(name: string, opts?: CircuitBreakerOptions): CircuitBreaker {
  if (!circuitBreakers.has(name)) {
    circuitBreakers.set(name, new CircuitBreaker({ ...opts, name }));
  }
  return circuitBreakers.get(name)!;
}

export function getAllCircuitBreakerStatus(): Record<string, { state: CircuitState; failures: number }> {
  const out: Record<string, { state: CircuitState; failures: number }> = {};
  for (const [name, cb] of (Array.from(circuitBreakers) as [string, CircuitBreaker][])) {
    out[name] = { state: cb.getState(), failures: cb.getFailures() };
  }
  return out;
}

// ─── 5. Secrets Validation ────────────────────────────────────────────────────

export interface SecretSpec {
  name: string;
  envVar: string;
  minLength?: number;
  required?: boolean;
}

const REQUIRED_SECRETS: SecretSpec[] = [
  { name: "JWT Secret",          envVar: "JWT_SECRET",          minLength: 32, required: true },
  { name: "Database URL",        envVar: "DATABASE_URL",        minLength: 10, required: true },
  { name: "Owner OpenID",        envVar: "OWNER_OPEN_ID",       minLength: 1,  required: true },
];

const OPTIONAL_SECRETS: SecretSpec[] = [
  { name: "Keycloak Client Secret", envVar: "KEYCLOAK_CLIENT_SECRET", minLength: 8 },
  { name: "TigerBeetle Address",    envVar: "TB_ADDRESS" },
  { name: "Temporal Host",          envVar: "TEMPORAL_HOST" },
  { name: "Redis URL",              envVar: "REDIS_URL" },
  { name: "APISIX Admin Key",       envVar: "APISIX_ADMIN_KEY" },
];

/**
 * Validate all required secrets at startup.
 * Throws if any required secret is missing or too short.
 * Logs warnings for missing optional secrets.
 */
export function validateSecrets(): void {
  const errors: string[] = [];

  for (const spec of REQUIRED_SECRETS) {
    const val = process.env[spec.envVar];
    if (!val) {
      errors.push(`Missing required secret: ${spec.name} (${spec.envVar})`);
    } else if (spec.minLength && val.length < spec.minLength) {
      errors.push(`Secret too short: ${spec.name} (${spec.envVar}) — minimum ${spec.minLength} chars`);
    }
  }

  for (const spec of OPTIONAL_SECRETS) {
    const val = process.env[spec.envVar];
    if (!val) {
      logger.warn(`[Security] Optional secret not set: ${spec.name} (${spec.envVar}) — feature may be degraded`);
    }
  }

  if (errors.length > 0) {
    const msg = `FATAL: Secret validation failed:\n${errors.map((e) => `  - ${e}`).join("\n")}`;
    logger.error(msg);
    if (process.env.NODE_ENV === "production") {
      throw new Error(msg);
    }
  } else {
    logger.info("[Security] All required secrets validated successfully");
  }
}

// ─── 6. CORS Strict-Mode Helper ───────────────────────────────────────────────

export function buildCorsOptions(allowedOrigins: string[]): {
  origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => void;
  credentials: boolean;
  methods: string[];
  allowedHeaders: string[];
  exposedHeaders: string[];
  maxAge: number;
} {
  return {
    origin: (origin, cb) => {
      // Allow server-to-server (no origin) and configured origins
      if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
        cb(null, true);
      } else {
        logger.warn(`[CORS] Blocked origin: ${origin}`);
        cb(new Error(`CORS: origin ${origin} not allowed`));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-API-Key",
      "X-Request-ID",
      "X-Idempotency-Key",
      "X-CSRF-Token",
    ],
    exposedHeaders: ["X-Request-ID", "X-Correlation-ID", "X-RateLimit-Remaining"],
    maxAge: 86400, // 24 hours preflight cache
  };
}

// ─── 7. Content-Security-Policy Builder ──────────────────────────────────────

export function buildCSP(opts: { isDev?: boolean; reportUri?: string } = {}): string {
  const directives: string[] = [
    "default-src 'self'",
    "script-src 'self' 'strict-dynamic'",
    "style-src 'self' 'unsafe-inline'",  // unsafe-inline needed for some UI frameworks
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ];

  if (!opts.isDev) {
    directives.push("block-all-mixed-content");
  }

  if (opts.reportUri) {
    directives.push(`report-uri ${opts.reportUri}`);
  }

  return directives.join("; ");
}

// ─── 8. Security Event Audit Logger ──────────────────────────────────────────

export type SecurityEventType =
  | "auth.login_success"
  | "auth.login_failed"
  | "auth.logout"
  | "auth.token_expired"
  | "auth.mfa_required"
  | "auth.mfa_success"
  | "auth.mfa_failed"
  | "authz.permission_denied"
  | "authz.role_escalation_attempt"
  | "rate_limit.exceeded"
  | "input.validation_failed"
  | "input.injection_attempt"
  | "cors.blocked"
  | "csrf.blocked"
  | "waf.threat_detected"
  | "secret.rotation_required"
  | "circuit_breaker.opened"
  | "circuit_breaker.closed";

export interface SecurityEvent {
  type: SecurityEventType;
  userId?: string | number;
  ip?: string;
  requestId?: string;
  resource?: string;
  details?: Record<string, unknown>;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export function logSecurityEvent(event: SecurityEvent): void {
  const entry = {
    ...event,
    timestamp: new Date().toISOString(),
    service: "tourismpay-server",
  };

  if (event.severity === "CRITICAL" || event.severity === "HIGH") {
    logger.error(`[SECURITY] ${JSON.stringify(entry)}`);
  } else if (event.severity === "MEDIUM") {
    logger.warn(`[SECURITY] ${JSON.stringify(entry)}`);
  } else {
    logger.info(`[SECURITY] ${JSON.stringify(entry)}`);
  }
}

// ─── 9. DB Read Replica Router ────────────────────────────────────────────────

/**
 * Determines whether a tRPC procedure name should use the read replica.
 * Queries (procedures starting with "get", "list", "search", "find", "count")
 * are routed to the replica; mutations use the primary.
 */
export function isReadOnlyProcedure(procedureName: string): boolean {
  const readPrefixes = ["get", "list", "search", "find", "count", "fetch", "query", "load"];
  const lower = procedureName.toLowerCase();
  return readPrefixes.some((prefix) => lower.startsWith(prefix));
}

// ─── 10. Security Headers Middleware ─────────────────────────────────────────

/**
 * Adds security headers beyond what Helmet provides:
 * - Permissions-Policy (disable camera, microphone, geolocation by default)
 * - Cache-Control for API responses
 * - X-DNS-Prefetch-Control
 */
export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Disable browser features not needed by the API
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(self), usb=()"
  );

  // Prevent API responses from being cached by intermediaries
  if (req.path.startsWith("/api/") || req.path.startsWith("/trpc/")) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }

  // Disable DNS prefetching
  res.setHeader("X-DNS-Prefetch-Control", "off");

  // Prevent MIME type sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");

  next();
}

logger.info("[Security] Security hardening module loaded");
