/**
 * server/_core/config.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Runtime Configuration Validation
 *
 * Validates all required environment variables at startup and provides a
 * typed, validated config object throughout the application.
 * Fails fast in production if required secrets are missing.
 */

import { z } from "zod";
import { logger } from "./logger";

// ─── Environment Schema ───────────────────────────────────────────────────────

const envSchema = z.object({
  // Runtime
  NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  BUILD_TIME: z.string().optional(),
  COMMIT_SHA: z.string().optional(),

  // Database
  DATABASE_URL: z.string().url().startsWith("postgresql"),
  DATABASE_POOL_MIN: z.coerce.number().int().min(1).default(2),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).default(20),
  DATABASE_SSL: z.string().transform((v) => v === "true").default(false),

  // Auth
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRY: z.string().default("1h"),
  OWNER_OPEN_ID: z.string().min(1),
  SESSION_SECRET: z.string().min(32).optional(),
  INTERNAL_SHUTDOWN_TOKEN: z.string().optional(),

  // Keycloak
  KEYCLOAK_URL: z.string().url().optional().or(z.literal("")),
  KEYCLOAK_REALM: z.string().default("tourismpay"),
  KEYCLOAK_CLIENT_ID: z.string().default("tourismpay-pwa"),
  KEYCLOAK_CLIENT_SECRET: z.string().optional(),
  KEYCLOAK_ADMIN_CLIENT_ID: z.string().default("admin-cli"),
  KEYCLOAK_ADMIN_CLIENT_SECRET: z.string().optional(),

  // Redis
  REDIS_URL: z.string().default("redis://localhost:6379"),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_TLS: z.string().transform((v) => v === "true").default(false),
  REDIS_KEY_PREFIX: z.string().default("tourismpay:"),
  REDIS_CACHE_TTL_SECONDS: z.coerce.number().int().min(1).default(300),
  REDIS_SESSION_TTL_SECONDS: z.coerce.number().int().min(1).default(86400),

  // TigerBeetle
  TIGERBEETLE_ADDRESSES: z.string().default("127.0.0.1:3001"),
  TIGERBEETLE_CLUSTER_ID: z.coerce.number().int().min(0).default(0),
  TIGERBEETLE_GATEWAY_URL: z.string().url().optional().or(z.literal("")),

  // Temporal
  TEMPORAL_ADDRESS: z.string().default("localhost:7233"),
  TEMPORAL_NAMESPACE: z.string().default("tourismpay"),
  TEMPORAL_TASK_QUEUE: z.string().default("tourismpay-main"),

  // Permify
  PERMIFY_ENDPOINT: z.string().default("localhost:3478"),
  PERMIFY_TOKEN: z.string().optional(),
  PERMIFY_TENANT_ID: z.string().default("tourismpay"),

  // Dapr
  DAPR_HTTP_PORT: z.coerce.number().int().default(3500),
  DAPR_GRPC_PORT: z.coerce.number().int().default(50001),
  DAPR_APP_ID: z.string().default("tourismpay-api"),
  DAPR_PUBSUB_NAME: z.string().default("tourismpay-pubsub"),
  DAPR_STATE_STORE_NAME: z.string().default("tourismpay-state"),
  FEATURE_DAPR_ENABLED: z.string().transform((v) => v === "true").default(false),

  // APISIX
  APISIX_ADMIN_URL: z.string().url().optional().or(z.literal("")),
  APISIX_ADMIN_KEY: z.string().optional(),
  APISIX_GATEWAY_URL: z.string().url().optional().or(z.literal("")),

  // Fluvio
  FLUVIO_ENDPOINT: z.string().optional(),
  FLUVIO_TLS: z.string().transform((v) => v === "true").default(false),
  FEATURE_FLUVIO_ENABLED: z.string().transform((v) => v === "true").default(false),

  // OpenAppSec
  OPENAPPSEC_AGENT_URL: z.string().url().optional().or(z.literal("")),
  OPENAPPSEC_API_KEY: z.string().optional(),

  // Lakehouse
  LAKEHOUSE_S3_BUCKET: z.string().optional(),
  LAKEHOUSE_S3_REGION: z.string().default("af-south-1"),
  LAKEHOUSE_S3_ENDPOINT: z.string().url().optional().or(z.literal("")),
  LAKEHOUSE_CATALOG_URL: z.string().url().optional().or(z.literal("")),
  LAKEHOUSE_ETL_URL: z.string().url().optional().or(z.literal("")),
  FEATURE_LAKEHOUSE_ENABLED: z.string().transform((v) => v === "true").default(false),

  // Fraud Scoring
  FRAUD_SCORING_URL: z.string().url().optional().or(z.literal("")),
  FRAUD_SCORING_API_KEY: z.string().optional(),
  FRAUD_HIGH_RISK_THRESHOLD: z.coerce.number().min(0).max(1).default(0.7),
  FRAUD_CRITICAL_THRESHOLD: z.coerce.number().min(0).max(1).default(0.9),
  FEATURE_FRAUD_ML_ENABLED: z.string().transform((v) => v === "true").default(false),

  // Crypto Engine
  CRYPTO_ENGINE_URL: z.string().url().optional().or(z.literal("")),
  CRYPTO_ENGINE_API_KEY: z.string().optional(),
  MASTER_KEY_DERIVATION_SECRET: z.string().min(32).optional(),

  // Stripe
  STRIPE_SECRET_KEY: z.string().optional(),
  VITE_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // AWS S3
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().default("af-south-1"),
  AWS_S3_BUCKET: z.string().optional(),
  AWS_S3_ENDPOINT: z.string().url().optional().or(z.literal("")),

  // Security
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60000),
  PII_ENCRYPTION_KEY: z.string().min(16).optional(),
  CSP_REPORT_URI: z.string().url().optional().or(z.literal("")),
  HELMET_HSTS_MAX_AGE: z.coerce.number().int().default(31536000),

  // Observability
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional().or(z.literal("")),
  OTEL_SERVICE_NAME: z.string().default("tourismpay-api"),
  OTEL_ENVIRONMENT: z.string().default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  LOG_FORMAT: z.enum(["json", "pretty"]).default("json"),

  // Feature Flags
  FEATURE_ENAIRA_ENABLED: z.string().transform((v) => v === "true").default(false),
  FEATURE_CRYPTO_WALLET_ENABLED: z.string().transform((v) => v === "true").default(false),
  FEATURE_LOYALTY_ENABLED: z.string().transform((v) => v === "true").default(true),
  FEATURE_REMITTANCE_ENABLED: z.string().transform((v) => v === "true").default(true),
  FEATURE_BIS_ENABLED: z.string().transform((v) => v === "true").default(true),

  // CBN Compliance
  CBN_CTR_THRESHOLD_NGN: z.coerce.number().int().default(5000000),
  CBN_SAR_FRAUD_SCORE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.7),
  CBN_DATA_RESIDENCY_REGION: z.string().default("af-south-1"),

  // SMTP
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().email().default("noreply@tourismpay.com"),

  // Mojaloop
  MOJALOOP_HUB_URL: z.string().url().optional().or(z.literal("")),
  MOJALOOP_DFSP_ID: z.string().default("tourismpay"),

  // Session
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).default(24),
});

export type AppConfig = z.infer<typeof envSchema>;

// ─── Production-Only Required Fields ─────────────────────────────────────────

const PRODUCTION_REQUIRED: Array<keyof AppConfig> = [
  "KEYCLOAK_URL",
  "KEYCLOAK_CLIENT_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "PII_ENCRYPTION_KEY",
  "MASTER_KEY_DERIVATION_SECRET",
  "SESSION_SECRET",
  "VAPID_PUBLIC_KEY" as any,
  "VAPID_PRIVATE_KEY" as any,
];

// ─── Config Singleton ─────────────────────────────────────────────────────────

let _config: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (_config) return _config;

  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    const errorMessages = Object.entries(errors)
      .map(([field, msgs]) => `  ${field}: ${(msgs ?? []).join(", ")}`)
      .join("\n");

    const message = `[Config] Environment validation failed:\n${errorMessages}`;
    logger.error(message);

    if (process.env.NODE_ENV === "production") {
      throw new Error(message);
    } else {
      logger.warn("[Config] Running with invalid config (development mode — errors above are non-fatal)");
      // Return partial config in development
      _config = parsed.error.issues.reduce((acc, _issue) => acc, {} as AppConfig);
      return _config;
    }
  }

  _config = parsed.data;

  // Production-only checks
  if (_config.NODE_ENV === "production") {
    const missing = PRODUCTION_REQUIRED.filter((key) => !process.env[key]);
    if (missing.length > 0) {
      throw new Error(
        `[Config] Missing required production environment variables:\n${missing.map((k) => `  - ${k}`).join("\n")}`
      );
    }
  }

  logger.info({
    type: "config_loaded",
    environment: _config.NODE_ENV,
    features: {
      enaira: _config.FEATURE_ENAIRA_ENABLED,
      cryptoWallet: _config.FEATURE_CRYPTO_WALLET_ENABLED,
      loyalty: _config.FEATURE_LOYALTY_ENABLED,
      remittance: _config.FEATURE_REMITTANCE_ENABLED,
      bis: _config.FEATURE_BIS_ENABLED,
      fraudMl: _config.FEATURE_FRAUD_ML_ENABLED,
      dapr: _config.FEATURE_DAPR_ENABLED,
      fluvio: _config.FEATURE_FLUVIO_ENABLED,
      lakehouse: _config.FEATURE_LAKEHOUSE_ENABLED,
    },
  });

  return _config;
}

/** Reset config singleton (for testing) */
export function resetConfig(): void {
  _config = null;
}

/** Check if a feature flag is enabled */
export function isFeatureEnabled(
  feature: "ENAIRA" | "CRYPTO_WALLET" | "LOYALTY" | "REMITTANCE" | "BIS" | "FRAUD_ML" | "DAPR" | "FLUVIO" | "LAKEHOUSE"
): boolean {
  const config = getConfig();
  const key = `FEATURE_${feature}_ENABLED` as keyof AppConfig;
  return config[key] === true;
}

/** Get CORS origins as an array */
export function getCorsOrigins(): string[] {
  const config = getConfig();
  return config.CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean);
}
