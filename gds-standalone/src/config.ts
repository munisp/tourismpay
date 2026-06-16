/**
 * GDS Standalone Configuration
 * All settings are environment-variable driven for white-label deployment.
 */

export const config = {
  // Server
  PORT: parseInt(process.env.GDS_PORT || "8090", 10),
  NODE_ENV: process.env.NODE_ENV || "development",

  // Multi-tenancy
  MULTI_TENANT: process.env.GDS_MULTI_TENANT === "true",
  DEFAULT_TENANT: process.env.GDS_DEFAULT_TENANT || "default",

  // Auth (Keycloak or any OIDC provider)
  AUTH_ISSUER: process.env.GDS_AUTH_ISSUER || "http://localhost:8180/realms/gds-agents",
  AUTH_AUDIENCE: process.env.GDS_AUTH_AUDIENCE || "gds-api",
  AUTH_JWKS_URI: process.env.GDS_AUTH_JWKS_URI || "http://localhost:8180/realms/gds-agents/protocol/openid-connect/certs",
  AUTH_API_KEY_ENABLED: process.env.GDS_AUTH_API_KEY_ENABLED !== "false",

  // CORS
  CORS_ORIGINS: process.env.GDS_CORS_ORIGINS || "http://localhost:3000,http://localhost:5173",

  // Database
  DATABASE_URL: process.env.GDS_DATABASE_URL || "postgresql://gds_user:gds_pass@localhost:5432/gds",

  // Redis
  REDIS_URL: process.env.GDS_REDIS_URL || "redis://localhost:6379/1",

  // Kafka
  KAFKA_BROKERS: process.env.GDS_KAFKA_BROKERS || "localhost:9092",

  // Go GDS Engine (upstream)
  GDS_ENGINE_URL: process.env.GDS_ENGINE_URL || "http://localhost:8080",

  // Python Search Service
  GDS_SEARCH_URL: process.env.GDS_SEARCH_URL || "http://localhost:8010",

  // Python Analytics Service
  GDS_ANALYTICS_URL: process.env.GDS_ANALYTICS_URL || "http://localhost:8011",

  // TigerBeetle
  TIGERBEETLE_ADDRESSES: process.env.TIGERBEETLE_ADDRESSES || "localhost:3000",

  // Mojaloop
  MOJALOOP_HUB_URL: process.env.MOJALOOP_HUB_URL || "http://localhost:4000",

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.GDS_RATE_LIMIT_WINDOW || "60000", 10),
  RATE_LIMIT_MAX: parseInt(process.env.GDS_RATE_LIMIT_MAX || "100", 10),

  // Branding (white-label)
  BRAND_NAME: process.env.GDS_BRAND_NAME || "Africa GDS",
  BRAND_LOGO_URL: process.env.GDS_BRAND_LOGO_URL || "",
  BRAND_PRIMARY_COLOR: process.env.GDS_BRAND_PRIMARY_COLOR || "#6366f1",
};
