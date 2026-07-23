export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  // LOCAL_DATABASE_URL takes precedence over the platform-injected DATABASE_URL
  // so we can use a local PostgreSQL instance instead of TiDB Cloud.
  databaseUrl: process.env.LOCAL_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // Self-hosted MinIO (S3-compatible object storage) for file uploads (KYB
  // documents, merchant product images, reports, etc.)
  minioEndpoint: process.env.MINIO_ENDPOINT ?? "http://localhost:9000",
  minioRootUser: process.env.MINIO_ROOT_USER ?? "",
  minioRootPassword: process.env.MINIO_ROOT_PASSWORD ?? "",
  minioBucket: process.env.MINIO_BUCKET ?? "tourismpay-storage",
  // VAPID keys for Web Push notifications
  // Default keys are pre-generated for TourismPay — override via env vars in production
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? "BFMCqrD4ysRr4VAMWI8gh856ZGWEXX7pCeZWLoF3e7t7Aa3SOAS-29AxsOkVlAisaZm60lQ9vIgjR5OnU5KblC0",
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? "1V-wQJoESMNsfMgmGBTg521zJJxZCovtSoW9y_4zcPo",
  vapidEmail: process.env.VAPID_EMAIL ?? "mailto:admin@tourismpay.com",
  // Stripe payment processing
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  stripePublishableKey: process.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "",
  // Go microservice URLs (optional — when set, PWA proxies requests to these services)
  bisCoreUrl: process.env.BIS_CORE_URL ?? "",
  bisAiUrl: process.env.BIS_AI_URL ?? "",
  bisGatewayUrl: process.env.BIS_GATEWAY_URL ?? "",
  bisOsintUrl: process.env.BIS_OSINT_URL ?? "",
  kybServiceUrl: process.env.KYB_SERVICE_URL ?? "",
  registryServiceUrl: process.env.REGISTRY_SERVICE_URL ?? "",
  // PaymentSwitch external API URL (required for PS integration)
  // PaymentSwitch is an external service, not embedded in TourismPay.
  // e.g. http://payment-switch:8080 or https://ps.yourdomain.com
  paymentSwitchUrl: process.env.PAYMENT_SWITCH_URL ?? "",
  // Settlement / TigerBeetle / Mojaloop service URL (optional)
  // When set, the PWA proxies settlement procedures to the standalone Go ledger service
  // e.g. http://settlement-service:8081 or https://settlement.yourdomain.com
  settlementServiceUrl: process.env.SETTLEMENT_SERVICE_URL ?? "",
  // SMTP transactional email (optional — falls back to in-app notification when not set)
  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: parseInt(process.env.SMTP_PORT ?? "587", 10),
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  smtpFrom: process.env.SMTP_FROM ?? "noreply@tourismpay.com",
  // TigerBeetle sidecar URL (for TB client)
  tbSidecarUrl: process.env.TB_SIDECAR_URL ?? "http://tigerbeetle-sidecar:3000",
  // Termii SMS API key
  termiiApiKey: process.env.TERMII_API_KEY ?? "",
  termiiBaseUrl: process.env.TERMII_BASE_URL ?? "https://api.ng.termii.com",
  // Temporal service address
  temporalAddress: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
  temporalNamespace: process.env.TEMPORAL_NAMESPACE ?? "default",
};
