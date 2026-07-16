/**
 * drizzle/schema-extended.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Extended Schema — 114 tables referenced by server/client code
 * that were not previously defined in any schema file.
 */

import {
  pgTable,
  serial,
  text,
  varchar,
  integer,
  bigint,
  boolean,
  timestamp,
  numeric,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ─── Agent & Commission Tables ────────────────────────────────────────────────

export const agents = pgTable("agents", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 255 }),
  agentCode: varchar("agent_code", { length: 100 }).unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 30 }),
  tier: varchar("tier", { length: 50 }).default("basic"),
  status: varchar("status", { length: 50 }).default("active"),
  isActive: boolean("is_active").default(true),
  commissionRate: numeric("commission_rate", { precision: 5, scale: 4 }).default("0.02"),
  commissionBalance: numeric("commission_balance", { precision: 15, scale: 2 }).default("0"),
  floatBalance: numeric("float_balance", { precision: 15, scale: 2 }).default("0"),
  floatLimit: numeric("float_limit", { precision: 15, scale: 2 }).default("50000"),
  floatLocked: boolean("float_locked").default(false),
  loyaltyPoints: integer("loyalty_points").default(0),
  rank: integer("rank").default(0),
  streak: integer("streak").default(0),
  location: varchar("location", { length: 255 }),
  terminalSerial: varchar("terminal_serial", { length: 100 }),
  terminalModel: varchar("terminal_model", { length: 100 }),
  terminalEnabled: boolean("terminal_enabled").default(false),
  terminalDisabledReason: text("terminal_disabled_reason"),
  keycloakSub: varchar("keycloak_sub", { length: 255 }),
  preferredAgentId: integer("preferred_agent_id"),
  supervisorId: integer("supervisor_id"),
  regionId: integer("region_id"),
  lastLoginAt: timestamp("last_login_at"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  commissionSplitOverride: numeric("commission_split_override", { precision: 5, scale: 4 }),
  creditRating: varchar("credit_rating", { length: 10 }),
  creditScore: integer("credit_score").default(0),
  hierarchyLevel: integer("hierarchy_level").default(1),
  hierarchyRole: varchar("hierarchy_role", { length: 50 }),
  parentAgentId: integer("parent_agent_id"),

  groupId: integer("group_id"),
  dailyLimit: numeric("daily_limit", { precision: 18, scale: 2 }),
  monthlyLimit: numeric("monthly_limit", { precision: 18, scale: 2 }),
  lastActiveAt: timestamp("last_active_at"),
  deviceId: varchar("device_id", { length: 200 }),
  appVersion: varchar("app_version", { length: 50 }),
  latitude: numeric("latitude", { precision: 10, scale: 7 }),
  longitude: numeric("longitude", { precision: 10, scale: 7 }),
  address: text("address"),
  lga: varchar("lga", { length: 100 }),
  state: varchar("state", { length: 100 }),
  suspendedAt: timestamp("suspended_at"),
  suspensionReason: text("suspension_reason"),
  onboardedBy: integer("onboarded_by"),
  kycDocuments: jsonb("kyc_documents"),
  bankAccountNumber: varchar("bank_account_number", { length: 50 }),
  bankCode: varchar("bank_code", { length: 20 }),
  nin: varchar("nin", { length: 20 }),
  bvn: varchar("bvn", { length: 20 }),

  floatFunded: boolean("float_funded").default(False),
  notes: text("notes"),
  profileComplete: boolean("profile_complete").default(False),
  terminalAssigned: boolean("terminal_assigned").default(False),
  trainingComplete: boolean("training_complete").default(False),
});
export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;

export const supervisorAgents = pgTable("supervisor_agents", {
  id: serial("id").primaryKey(),
  supervisorId: integer("supervisor_id").notNull(),
  agentId: integer("agent_id").notNull(),
  assignedAt: timestamp("assigned_at").defaultNow(),
});

export const agentAchievements = pgTable("agent_achievements", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull(),
  achievementType: varchar("achievement_type", { length: 100 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  earnedAt: timestamp("earned_at").defaultNow(),
  metadata: jsonb("metadata"),

  unlockedAt: timestamp("unlocked_at").defaultNow(),
});

export const agentBankAccounts = pgTable("agent_bank_accounts", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull(),
  bankName: varchar("bank_name", { length: 255 }).notNull(),
  accountNumber: varchar("account_number", { length: 100 }).notNull(),
  accountName: varchar("account_name", { length: 255 }).notNull(),
  sortCode: varchar("sort_code", { length: 20 }),
  isPrimary: boolean("is_primary").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const agentGeofenceZones = pgTable("agent_geofence_zones", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull(),
  zoneId: integer("zone_id").notNull(),
  assignedAt: timestamp("assigned_at").defaultNow(),
});

export const agentLoans = pgTable("agent_loans", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull(),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  interestRate: numeric("interest_rate", { precision: 5, scale: 4 }).default("0.05"),
  status: varchar("status", { length: 50 }).default("pending"),
  disbursedAt: timestamp("disbursed_at"),
  dueAt: timestamp("due_at"),
  createdAt: timestamp("created_at").defaultNow(),

  amountRepaid: numeric("amount_repaid", { precision: 18, scale: 6 }).default("0"),
  principalAmount: numeric("principal_amount", { precision: 18, scale: 6 }),
});

export const agentOnboardingProgress = pgTable("agent_onboarding_progress", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull(),
  step: varchar("step", { length: 100 }).notNull(),
  completed: boolean("completed").default(false),
  completedAt: timestamp("completed_at"),
  metadata: jsonb("metadata"),

  agentCode: varchar("agent_code", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow(),
  currentStep: integer("current_step").default(1),
});

export const agentPerformanceScores = pgTable("agent_performance_scores", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull(),
  period: varchar("period", { length: 20 }).notNull(),
  score: numeric("score", { precision: 5, scale: 2 }),
  transactionCount: integer("transaction_count").default(0),
  volumeNgn: numeric("volume_ngn", { precision: 18, scale: 2 }).default("0"),
  calculatedAt: timestamp("calculated_at").defaultNow(),

  createdAt: timestamp("created_at").defaultNow(),
  overallScore: numeric("overall_score", { precision: 5, scale: 2 }),
});

export const agentPushSubscriptions = pgTable("agent_push_subscriptions", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull(),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh"),
  auth: text("auth"),
  createdAt: timestamp("created_at").defaultNow(),

  agentCode: varchar("agent_code", { length: 50 }),
  userAgent: text("user_agent"),
});

export const agentSuspensionLog = pgTable("agent_suspension_log", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull(),
  reason: text("reason").notNull(),
  suspendedBy: integer("suspended_by"),
  suspendedAt: timestamp("suspended_at").defaultNow(),
  reinstatedAt: timestamp("reinstated_at"),

  action: varchar("action", { length: 100 }),
});

export const commissionAuditTrail = pgTable("commission_audit_trail", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull(),
  action: varchar("action", { length: 255 }).notNull(),
  amount: numeric("amount", { precision: 18, scale: 2 }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const commissionCascadeHistory = pgTable("commission_cascade_history", {
  id: serial("id").primaryKey(),
  transactionId: varchar("transaction_id", { length: 255 }),
  agentId: integer("agent_id").notNull(),
  supervisorId: integer("supervisor_id"),
  agentAmount: numeric("agent_amount", { precision: 18, scale: 2 }),
  supervisorAmount: numeric("supervisor_amount", { precision: 18, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),

  recipientAgentId: integer("recipient_agent_id"),
  recipientHierarchyLevel: integer("recipient_hierarchy_level"),
});

export const commissionClawbacks = pgTable("commission_clawbacks", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull(),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  reason: text("reason"),
  status: varchar("status", { length: 50 }).default("pending"),
  createdAt: timestamp("created_at").defaultNow(),

  clawbackAmount: numeric("clawback_amount", { precision: 18, scale: 6 }),
});

export const commissionPayouts = pgTable("commission_payouts", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull(),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  period: varchar("period", { length: 20 }),
  status: varchar("status", { length: 50 }).default("pending"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow(),

  agentCode: varchar("agent_code", { length: 50 }),
});

export const commissionRules = pgTable("commission_rules", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  transactionType: varchar("transaction_type", { length: 100 }),
  rate: numeric("rate", { precision: 5, scale: 4 }).notNull(),
  minAmount: numeric("min_amount", { precision: 18, scale: 2 }),
  maxAmount: numeric("max_amount", { precision: 18, scale: 2 }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const commissionSplits = pgTable("commission_splits", {
  id: serial("id").primaryKey(),
  transactionId: varchar("transaction_id", { length: 255 }),
  agentId: integer("agent_id").notNull(),
  splitType: varchar("split_type", { length: 100 }),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),

  isActive: boolean("is_active").default(true),
});

export const commissionTiers = pgTable("commission_tiers", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  minVolume: numeric("min_volume", { precision: 18, scale: 2 }).default("0"),
  maxVolume: numeric("max_volume", { precision: 18, scale: 2 }),
  rate: numeric("rate", { precision: 5, scale: 4 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),

  isActive: boolean("is_active").default(true),
  transactionType: varchar("transaction_type", { length: 100 }),
});

// ─── Analytics & Reporting ────────────────────────────────────────────────────

export const analyticsDashboards = pgTable("analytics_dashboards", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  ownerId: integer("owner_id"),
  config: jsonb("config"),
  isPublic: boolean("is_public").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const analyticsMetrics = pgTable("analytics_metrics", {
  id: serial("id").primaryKey(),
  metricName: varchar("metric_name", { length: 255 }).notNull(),
  value: numeric("value", { precision: 18, scale: 4 }),
  dimensions: jsonb("dimensions"),
  recordedAt: timestamp("recorded_at").defaultNow(),
});

export const biReportDefinitions = pgTable("bi_report_definitions", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  query: text("query").notNull(),
  schedule: varchar("schedule", { length: 100 }),
  ownerId: integer("owner_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const pnlReports = pgTable("pnl_reports", {
  id: serial("id").primaryKey(),
  period: varchar("period", { length: 20 }).notNull(),
  revenue: numeric("revenue", { precision: 18, scale: 2 }).default("0"),
  expenses: numeric("expenses", { precision: 18, scale: 2 }).default("0"),
  netProfit: numeric("net_profit", { precision: 18, scale: 2 }).default("0"),
  generatedAt: timestamp("generated_at").defaultNow(),

  agentId: integer("agent_id"),
  periodType: varchar("period_type", { length: 20 }).default("monthly"),
  regionCode: varchar("region_code", { length: 10 }),
  totalCommission: numeric("total_commission", { precision: 18, scale: 6 }).default("0"),
  totalFees: numeric("total_fees", { precision: 18, scale: 6 }).default("0"),
  totalRevenue: numeric("total_revenue", { precision: 18, scale: 6 }).default("0"),
});

// ─── API & Webhook Management ─────────────────────────────────────────────────

export const apiKeyUsage = pgTable("api_key_usage", {
  id: serial("id").primaryKey(),
  apiKeyId: integer("api_key_id").notNull(),
  endpoint: varchar("endpoint", { length: 500 }),
  method: varchar("method", { length: 10 }),
  statusCode: integer("status_code"),
  latencyMs: integer("latency_ms"),
  usedAt: timestamp("used_at").defaultNow(),

  createdAt: timestamp("created_at").defaultNow(),
  responseMs: integer("response_ms"),
});

export const webhookSecrets = pgTable("webhook_secrets", {
  id: serial("id").primaryKey(),
  endpointId: integer("endpoint_id").notNull(),
  secret: varchar("secret", { length: 255 }).notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),

  algorithm: varchar("algorithm", { length: 50 }).default("hmac-sha256"),
  integrationName: varchar("integration_name", { length: 255 }),
  lastRotatedAt: timestamp("last_rotated_at"),
});

// ─── Audit & Compliance ───────────────────────────────────────────────────────

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  action: varchar("action", { length: 255 }).notNull(),
  resourceType: varchar("resource_type", { length: 100 }),
  resourceId: varchar("resource_id", { length: 255 }),
  ipAddress: varchar("ip_address", { length: 50 }),
  userAgent: text("user_agent"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),

  agentId: integer("agent_id"),

  entityType: varchar("entity_type", { length: 100 }),
  entityId: varchar("entity_id", { length: 255 }),
  before: jsonb("before"),
  after: jsonb("after"),
  description: text("description"),
  performedBy: integer("performed_by"),
  tenantId: integer("tenant_id"),
  sessionId: varchar("session_id", { length: 100 }),

  updatedAt: timestamp("updated_at").defaultNow(),
});
export type AuditLog = typeof auditLog.$inferSelect;

export const complianceChecks = pgTable("compliance_checks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  checkType: varchar("check_type", { length: 100 }).notNull(),
  result: varchar("result", { length: 50 }),
  details: jsonb("details"),
  checkedAt: timestamp("checked_at").defaultNow(),
});

export const complianceFilings = pgTable("compliance_filings", {
  id: serial("id").primaryKey(),
  filingType: varchar("filing_type", { length: 100 }).notNull(),
  period: varchar("period", { length: 20 }),
  status: varchar("status", { length: 50 }).default("pending"),
  filedAt: timestamp("filed_at"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const complianceReports = pgTable("compliance_reports", {
  id: serial("id").primaryKey(),
  reportType: varchar("report_type", { length: 100 }).notNull(),
  period: varchar("period", { length: 20 }),
  data: jsonb("data"),
  generatedAt: timestamp("generated_at").defaultNow(),

  createdAt: timestamp("created_at").defaultNow(),
});

export const dataConsentRecords = pgTable("data_consent_records", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  purpose: varchar("purpose", { length: 255 }).notNull(),
  granted: boolean("granted").default(false),
  grantedAt: timestamp("granted_at"),
  revokedAt: timestamp("revoked_at"),
  ipAddress: varchar("ip_address", { length: 50 }),

  consentType: varchar("consent_type", { length: 100 }),
  userAgent: text("user_agent"),
});

// ─── Billing & Tenant Management ─────────────────────────────────────────────

export const billingAuditLog = pgTable("billing_audit_log", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  action: varchar("action", { length: 255 }).notNull(),
  amount: numeric("amount", { precision: 18, scale: 2 }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const billingProvisioningHistory = pgTable("billing_provisioning_history", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  plan: varchar("plan", { length: 100 }),
  action: varchar("action", { length: 100 }),
  performedAt: timestamp("performed_at").defaultNow(),

  startedAt: timestamp("started_at").defaultNow(),
  step: varchar("step", { length: 100 }),
});

export const billingRevenuePeriods = pgTable("billing_revenue_periods", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  period: varchar("period", { length: 20 }).notNull(),
  revenue: numeric("revenue", { precision: 18, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const billingRoleAssignments = pgTable("billing_role_assignments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  role: varchar("role", { length: 100 }).notNull(),
  tenantId: integer("tenant_id"),
  assignedAt: timestamp("assigned_at").defaultNow(),

  grantedAt: timestamp("granted_at").defaultNow(),
  isActive: boolean("is_active").default(true),
});

export const platformBillingLedger = pgTable("platform_billing_ledger", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  description: text("description"),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  type: varchar("type", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow(),

  transactionRef: varchar("transaction_ref", { length: 255 }),
});

export const tenantBillingConfig = pgTable("tenant_billing_config", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().unique(),
  plan: varchar("plan", { length: 100 }).default("free"),
  billingEmail: varchar("billing_email", { length: 255 }),
  paymentMethodId: varchar("payment_method_id", { length: 255 }),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const tenantBranding = pgTable("tenant_branding", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().unique(),
  logoUrl: text("logo_url"),
  primaryColor: varchar("primary_color", { length: 20 }),
  secondaryColor: varchar("secondary_color", { length: 20 }),
  customCss: text("custom_css"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const tenantFeatureToggles = pgTable("tenant_feature_toggles", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  feature: varchar("feature", { length: 255 }).notNull(),
  enabled: boolean("enabled").default(false),
  updatedAt: timestamp("updated_at").defaultNow(),

  createdAt: timestamp("created_at").defaultNow(),
});

export const tenantFeeOverrides = pgTable("tenant_fee_overrides", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  feeRuleId: integer("fee_rule_id").notNull(),
  overrideRate: numeric("override_rate", { precision: 5, scale: 4 }),
  createdAt: timestamp("created_at").defaultNow(),

  isActive: boolean("is_active").default(true),
  txType: varchar("tx_type", { length: 100 }),
});

export const tenantUsers = pgTable("tenant_users", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  userId: integer("user_id").notNull(),
  role: varchar("role", { length: 100 }).default("member"),
  joinedAt: timestamp("joined_at").defaultNow(),
});

export const tenants = pgTable("tenants", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  ownerId: integer("owner_id"),
  plan: varchar("plan", { length: 50 }).default("starter"),
  billingEmail: varchar("billing_email", { length: 255 }),
  paymentMethod: varchar("payment_method", { length: 100 }),
  tigerBeetleAccountId: varchar("tiger_beetle_account_id", { length: 255 }),
  kafkaTopicPrefix: varchar("kafka_topic_prefix", { length: 100 }),
  status: varchar("status", { length: 50 }).default("active"),
  tenantId: integer("tenant_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── Biometric & Security ─────────────────────────────────────────────────────

export const biometricAuditEvents = pgTable("biometric_audit_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  success: boolean("success").default(false),
  confidence: numeric("confidence", { precision: 5, scale: 4 }),
  deviceId: varchar("device_id", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),

  outcome: varchar("outcome", { length: 50 }),
  processingTimeMs: integer("processing_time_ms"),
  spoofType: varchar("spoof_type", { length: 100 }),
});

export const faceEnrollments = pgTable("face_enrollments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  faceVector: text("face_vector"),
  quality: numeric("quality", { precision: 5, scale: 4 }),
  isActive: boolean("is_active").default(true),
  enrolledAt: timestamp("enrolled_at").defaultNow(),

  createdAt: timestamp("created_at").defaultNow(),
  embeddingVersion: varchar("embedding_version", { length: 50 }),
  enrollmentType: varchar("enrollment_type", { length: 50 }).default("face"),
  expiresAt: timestamp("expires_at"),
  livenessScore: numeric("liveness_score", { precision: 5, scale: 4 }),
  qualityScore: numeric("quality_score", { precision: 5, scale: 4 }),
  revokedAt: timestamp("revoked_at"),
});

export const fido2Challenges = pgTable("fido2_challenges", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  challenge: varchar("challenge", { length: 512 }).notNull(),
  type: varchar("type", { length: 50 }),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const fido2Credentials = pgTable("fido2_credentials", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  credentialId: text("credential_id").notNull().unique(),
  publicKey: text("public_key").notNull(),
  counter: integer("counter").default(0),
  deviceName: varchar("device_name", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  lastUsedAt: timestamp("last_used_at"),

  deviceType: varchar("device_type", { length: 100 }),
  status: varchar("status", { length: 50 }).default("active"),
  transports: jsonb("transports"),
});

export const otpTokens = pgTable("otp_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  token: varchar("token", { length: 10 }).notNull(),
  purpose: varchar("purpose", { length: 100 }),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),

  agentId: integer("agent_id"),

  used: boolean("used").default(false),

  updatedAt: timestamp("updated_at").defaultNow(),
  status: varchar("status", { length: 20 }).default("active"),
  verifiedAt: timestamp("verified_at"),
  verifiedBy: integer("verified_by"),
  reviewedAt: timestamp("reviewed_at"),
  revokedReason: text("revoked_reason"),
  score: numeric("score", { precision: 5, scale: 4 }),
  livenessScore: numeric("liveness_score", { precision: 5, scale: 4 }),
  progress: integer("progress").default(0),
  rejectionReason: text("rejection_reason"),
  fulfilledAt: timestamp("fulfilled_at"),
});

// ─── Chat & Communication ─────────────────────────────────────────────────────

export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull(),
  role: varchar("role", { length: 20 }).notNull(),
  content: text("content").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const chatSessions = pgTable("chat_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  title: varchar("title", { length: 255 }),
  context: jsonb("context"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  status: varchar("status", { length: 50 }).default("active"),
});

export const notificationDispatchLog = pgTable("notification_dispatch_log", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  channel: varchar("channel", { length: 50 }).notNull(),
  templateId: varchar("template_id", { length: 255 }),
  status: varchar("status", { length: 50 }).default("pending"),
  sentAt: timestamp("sent_at"),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const emailQueue = pgTable("email_queue", {
  id: serial("id").primaryKey(),
  to: varchar("to", { length: 255 }).notNull(),
  subject: varchar("subject", { length: 500 }).notNull(),
  body: text("body").notNull(),
  status: varchar("status", { length: 50 }).default("pending"),
  attempts: integer("attempts").default(0),
  scheduledAt: timestamp("scheduled_at").defaultNow(),
  sentAt: timestamp("sent_at"),
  error: text("error"),

  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Credit & Finance ─────────────────────────────────────────────────────────

export const creditApplications = pgTable("credit_applications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  purpose: text("purpose"),
  status: varchar("status", { length: 50 }).default("pending"),
  creditScore: integer("credit_score"),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow(),

  agentId: integer("agent_id"),
});

export const creditScoreHistory = pgTable("credit_score_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  score: integer("score").notNull(),
  factors: jsonb("factors"),
  calculatedAt: timestamp("calculated_at").defaultNow(),

  agentId: integer("agent_id"),
  computedAt: timestamp("computed_at").defaultNow(),
});

export const glEntries = pgTable("gl_entries", {
  id: serial("id").primaryKey(),
  accountCode: varchar("account_code", { length: 50 }).notNull(),
  debit: numeric("debit", { precision: 18, scale: 2 }).default("0"),
  credit: numeric("credit", { precision: 18, scale: 2 }).default("0"),
  description: text("description"),
  referenceId: varchar("reference_id", { length: 255 }),
  postedAt: timestamp("posted_at").defaultNow(),

  accountName: varchar("account_name", { length: 255 }),
  amount: numeric("amount", { precision: 18, scale: 6 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  entryType: varchar("entry_type", { length: 20 }).notNull(),
});

export const vatRecords = pgTable("vat_records", {
  id: serial("id").primaryKey(),
  transactionId: varchar("transaction_id", { length: 255 }),
  vatAmount: numeric("vat_amount", { precision: 18, scale: 2 }).notNull(),
  vatRate: numeric("vat_rate", { precision: 5, scale: 4 }).default("0.075"),
  period: varchar("period", { length: 20 }),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Customer & CRM ───────────────────────────────────────────────────────────

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  tier: varchar("tier", { length: 50 }).default("standard"),
  segment: varchar("segment", { length: 100 }),
  lifetimeValue: numeric("lifetime_value", { precision: 18, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").defaultNow(),

  email: varchar("email", { length: 320 }),
  keycloakSub: varchar("keycloak_sub", { length: 255 }),
  lastName: varchar("last_name", { length: 100 }),
  phone: varchar("phone", { length: 30 }),
  status: varchar("status", { length: 50 }).default("active"),
  passwordHash: varchar("password_hash", { length: 512 }),
  refreshToken: varchar("refresh_token", { length: 1024 }),
  walletBalance: numeric("wallet_balance", { precision: 18, scale: 6 }).default("0"),
  dailyLimit: numeric("daily_limit", { precision: 18, scale: 6 }),
  monthlyLimit: numeric("monthly_limit", { precision: 18, scale: 6 }),
});

export const customerJourneySteps = pgTable("customer_journey_steps", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  step: varchar("step", { length: 100 }).notNull(),
  completedAt: timestamp("completed_at"),
  metadata: jsonb("metadata"),

  createdAt: timestamp("created_at").defaultNow(),
  customerId: integer("customer_id"),
  status: varchar("status", { length: 50 }).default("pending"),
  stepType: varchar("step_type", { length: 100 }),
});

export const referrals = pgTable("referrals", {
  id: serial("id").primaryKey(),
  referrerId: integer("referrer_id").notNull(),
  refereeId: integer("referee_id"),
  referralCode: varchar("referral_code", { length: 50 }).notNull(),
  status: varchar("status", { length: 50 }).default("pending"),
  rewardAmount: numeric("reward_amount", { precision: 18, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

// ─── Device & Location ────────────────────────────────────────────────────────

export const devices = pgTable("devices", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  deviceId: varchar("device_id", { length: 255 }).notNull().unique(),
  deviceType: varchar("device_type", { length: 100 }),
  platform: varchar("platform", { length: 50 }),
  pushToken: text("push_token"),
  lastSeenAt: timestamp("last_seen_at"),
  createdAt: timestamp("created_at").defaultNow(),

  deviceToken: varchar("device_token", { length: 512 }),
  enrolledAt: timestamp("enrolled_at").defaultNow(),
  status: varchar("status", { length: 50 }).default("active"),
});

export const deviceLocations = pgTable("device_locations", {
  id: serial("id").primaryKey(),
  deviceId: varchar("device_id", { length: 255 }).notNull(),
  latitude: numeric("latitude", { precision: 10, scale: 7 }),
  longitude: numeric("longitude", { precision: 10, scale: 7 }),
  accuracy: numeric("accuracy", { precision: 8, scale: 2 }),
  recordedAt: timestamp("recorded_at").defaultNow(),

  agentId: integer("agent_id"),
});

export const geoFences = pgTable("geo_fences", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).default("circle"),
  coordinates: jsonb("coordinates"),
  radiusMeters: numeric("radius_meters", { precision: 10, scale: 2 }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const geofenceZones = pgTable("geofence_zones", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  regionCode: varchar("region_code", { length: 50 }),
  polygon: jsonb("polygon"),
  createdAt: timestamp("created_at").defaultNow(),

  isActive: boolean("is_active").default(true),
});

export const mdmGeofenceViolations = pgTable("mdm_geofence_violations", {
  id: serial("id").primaryKey(),
  deviceId: varchar("device_id", { length: 255 }),
  zoneId: integer("zone_id"),
  latitude: numeric("latitude", { precision: 10, scale: 7 }),
  longitude: numeric("longitude", { precision: 10, scale: 7 }),
  detectedAt: timestamp("detected_at").defaultNow(),
});

// ─── Disputes & Reversals ─────────────────────────────────────────────────────

export const disputes = pgTable("disputes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  transactionId: varchar("transaction_id", { length: 255 }),
  reason: text("reason").notNull(),
  status: varchar("status", { length: 50 }).default("open"),
  resolution: text("resolution"),
  createdAt: timestamp("created_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),

  agentId: integer("agent_id"),
  priority: varchar("priority", { length: 20 }).default("medium"),
  slaDeadlineAt: timestamp("sla_deadline_at"),
  type: varchar("type", { length: 50 }),

  amount: numeric("amount", { precision: 18, scale: 2 }),
  assignedTo: integer("assigned_to"),
  createdBy: integer("created_by"),
  description: text("description"),
  ref: varchar("ref", { length: 100 }),
  updatedAt: timestamp("updated_at").defaultNow(),
  resolutionNote: text("resolution_note"),
  resolvedBy: integer("resolved_by"),
  erpDocName: varchar("erp_doc_name", { length: 200 }),
});

export const disputeEvidence = pgTable("dispute_evidence", {
  id: serial("id").primaryKey(),
  disputeId: integer("dispute_id").notNull(),
  evidenceType: varchar("evidence_type", { length: 100 }),
  fileUrl: text("file_url"),
  description: text("description"),
  submittedAt: timestamp("submitted_at").defaultNow(),
});

export const disputeMessages = pgTable("dispute_messages", {
  id: serial("id").primaryKey(),
  disputeId: integer("dispute_id").notNull(),
  senderId: integer("sender_id"),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const refunds = pgTable("refunds", {
  id: serial("id").primaryKey(),
  transactionId: varchar("transaction_id", { length: 255 }).notNull(),
  userId: integer("user_id").notNull(),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  reason: text("reason"),
  status: varchar("status", { length: 50 }).default("pending"),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const reversalRequests = pgTable("reversal_requests", {
  id: serial("id").primaryKey(),
  transactionId: varchar("transaction_id", { length: 255 }).notNull(),
  requestedBy: integer("requested_by").notNull(),
  reason: text("reason"),
  status: varchar("status", { length: 50 }).default("pending"),
  approvedBy: integer("approved_by"),
  createdAt: timestamp("created_at").defaultNow(),
  processedAt: timestamp("processed_at"),

  agentId: integer("agent_id"),
});

// ─── E-Commerce ───────────────────────────────────────────────────────────────

export const ecommerceCartItems = pgTable("ecommerce_cart_items", {
  id: serial("id").primaryKey(),
  cartId: integer("cart_id").notNull(),
  productId: integer("product_id").notNull(),
  sku: varchar("sku", { length: 100 }),
  quantity: integer("quantity").default(1),
  unitPrice: numeric("unit_price", { precision: 18, scale: 2 }),
  addedAt: timestamp("added_at").defaultNow(),
});
export type EcommerceCartItem = typeof ecommerceCartItems.$inferSelect;

export const ecommerceCarts = pgTable("ecommerce_carts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  sessionId: varchar("session_id", { length: 255 }),
  status: varchar("status", { length: 50 }).default("active"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  customerId: integer("customer_id"),
});

export const ecommerceCategories = pgTable("ecommerce_categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  parentId: integer("parent_id"),
  imageUrl: text("image_url"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),

  sortOrder: integer("sort_order").default(0),
});

export const ecommerceInventory = pgTable("ecommerce_inventory", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull(),
  sku: varchar("sku", { length: 100 }),
  quantity: integer("quantity").default(0),
  reservedQuantity: integer("reserved_quantity").default(0),
  reserved: integer("reserved").default(0),
  warehouseLocation: varchar("warehouse_location", { length: 255 }),
  updatedAt: timestamp("updated_at").defaultNow(),

  reorderPoint: integer("reorder_point").default(10),
});

export const ecommerceOrderItems = pgTable("ecommerce_order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  productId: integer("product_id").notNull(),
  sku: varchar("sku", { length: 100 }),
  quantity: integer("quantity").notNull(),
  unitPrice: numeric("unit_price", { precision: 18, scale: 2 }).notNull(),
  totalPrice: numeric("total_price", { precision: 18, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const ecommerceOrders = pgTable("ecommerce_orders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  customerId: integer("customer_id"),
  merchantId: integer("merchant_id"),
  ref: varchar("ref", { length: 100 }).unique(),
  status: varchar("status", { length: 50 }).default("pending"),
  totalAmount: numeric("total_amount", { precision: 18, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("NGN"),
  paymentRef: varchar("payment_ref", { length: 255 }),
  shippingAddress: jsonb("shipping_address"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const ecommerceProducts = pgTable("ecommerce_products", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id"),
  categoryId: integer("category_id"),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  price: numeric("price", { precision: 18, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("NGN"),
  sku: varchar("sku", { length: 100 }),
  stock: integer("stock").default(0),
  imageUrls: jsonb("image_urls"),
  isActive: boolean("is_active").default(true),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── ERP & Integration ────────────────────────────────────────────────────────

export const erpConfig = pgTable("erp_config", {
  id: serial("id").primaryKey(),
  provider: varchar("provider", { length: 100 }).notNull(),
  config: jsonb("config"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const erpSyncLog = pgTable("erp_sync_log", {
  id: serial("id").primaryKey(),
  erpConfigId: integer("erp_config_id"),
  entityType: varchar("entity_type", { length: 100 }),
  entityId: varchar("entity_id", { length: 255 }),
  status: varchar("status", { length: 50 }).default("pending"),
  error: text("error"),
  syncedAt: timestamp("synced_at").defaultNow(),

  createdAt: timestamp("created_at").defaultNow(),
  nextRetryAt: timestamp("next_retry_at"),

  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0),
  maxRetries: integer("max_retries").default(5),
  payload: jsonb("payload"),
  erpDocType: varchar("erp_doc_type", { length: 100 }),
});

export const mqttBridgeConfig = pgTable("mqtt_bridge_config", {
  id: serial("id").primaryKey(),
  brokerUrl: varchar("broker_url", { length: 500 }).notNull(),
  topics: jsonb("topics"),
  qos: integer("qos").default(1),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Fee & Rate Management ────────────────────────────────────────────────────

export const feeAuditTrail = pgTable("fee_audit_trail", {
  id: serial("id").primaryKey(),
  transactionId: varchar("transaction_id", { length: 255 }),
  feeRuleId: integer("fee_rule_id"),
  feeAmount: numeric("fee_amount", { precision: 18, scale: 2 }),
  appliedAt: timestamp("applied_at").defaultNow(),

  createdAt: timestamp("created_at").defaultNow(),
  txAmount: numeric("tx_amount", { precision: 18, scale: 6 }),
});

export const feeRules = pgTable("fee_rules", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  transactionType: varchar("transaction_type", { length: 100 }),
  feeType: varchar("fee_type", { length: 50 }).default("flat"),
  feeValue: numeric("fee_value", { precision: 18, scale: 4 }).notNull(),
  minFee: numeric("min_fee", { precision: 18, scale: 2 }),
  maxFee: numeric("max_fee", { precision: 18, scale: 2 }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),

  txType: varchar("tx_type", { length: 100 }),
});

export const rateLimitRules = pgTable("rate_limit_rules", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  endpoint: varchar("endpoint", { length: 500 }),
  maxRequests: integer("max_requests").notNull(),
  windowSeconds: integer("window_seconds").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const velocityLimits = pgTable("velocity_limits", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  limitType: varchar("limit_type", { length: 100 }).notNull(),
  currentAmount: numeric("current_amount", { precision: 18, scale: 2 }).default("0"),
  maxAmount: numeric("max_amount", { precision: 18, scale: 2 }).notNull(),
  windowStart: timestamp("window_start").defaultNow(),
  windowEnd: timestamp("window_end"),
});

// ─── Float & Reconciliation ───────────────────────────────────────────────────

export const floatReconciliations = pgTable("float_reconciliations", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id"),
  openingBalance: numeric("opening_balance", { precision: 18, scale: 2 }),
  closingBalance: numeric("closing_balance", { precision: 18, scale: 2 }),
  period: varchar("period", { length: 20 }),
  status: varchar("status", { length: 50 }).default("pending"),
  createdAt: timestamp("created_at").defaultNow(),

  date: timestamp("date").defaultNow(),
});

export const floatTopUpRequests = pgTable("float_top_up_requests", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull(),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  status: varchar("status", { length: 50 }).default("pending"),
  approvedBy: integer("approved_by"),
  createdAt: timestamp("created_at").defaultNow(),
  processedAt: timestamp("processed_at"),

  notes: text("notes"),
  requestedAmount: numeric("requested_amount", { precision: 18, scale: 6 }),
  supervisorApprovalRequired: boolean("supervisor_approval_required").default(false),
  supervisorApprovedAt: timestamp("supervisor_approved_at"),
  supervisorApprovedBy: integer("supervisor_approved_by"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const reconciliationBatches = pgTable("reconciliation_batches", {
  id: serial("id").primaryKey(),
  batchDate: varchar("batch_date", { length: 20 }).notNull(),
  status: varchar("status", { length: 50 }).default("pending"),
  totalItems: integer("total_items").default(0),
  matchedItems: integer("matched_items").default(0),
  unmatchedItems: integer("unmatched_items").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),

  sourceType: varchar("source_type", { length: 100 }),
});

export const reconciliationItems = pgTable("reconciliation_items", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").notNull(),
  transactionId: varchar("transaction_id", { length: 255 }),
  status: varchar("status", { length: 50 }).default("unmatched"),
  discrepancy: numeric("discrepancy", { precision: 18, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const settlementReconciliation = pgTable("settlement_reconciliation", {
  id: serial("id").primaryKey(),
  settlementId: varchar("settlement_id", { length: 255 }),
  expectedAmount: numeric("expected_amount", { precision: 18, scale: 2 }),
  actualAmount: numeric("actual_amount", { precision: 18, scale: 2 }),
  discrepancy: numeric("discrepancy", { precision: 18, scale: 2 }),
  status: varchar("status", { length: 50 }).default("pending"),
  createdAt: timestamp("created_at").defaultNow(),

  agentCode: varchar("agent_code", { length: 50 }),
  agentId: integer("agent_id"),
});

// ─── Fraud & Monitoring ───────────────────────────────────────────────────────

export const fraudMlScores = pgTable("fraud_ml_scores", {
  id: serial("id").primaryKey(),
  transactionId: varchar("transaction_id", { length: 255 }),
  userId: integer("user_id"),
  score: numeric("score", { precision: 5, scale: 4 }),
  riskLevel: varchar("risk_level", { length: 50 }),
  features: jsonb("features"),
  modelVersion: varchar("model_version", { length: 50 }),
  scoredAt: timestamp("scored_at").defaultNow(),

  createdAt: timestamp("created_at").defaultNow(),
  riskScore: numeric("risk_score", { precision: 5, scale: 4 }),
});

export const txMonitoringAlerts = pgTable("tx_monitoring_alerts", {
  id: serial("id").primaryKey(),
  transactionId: varchar("transaction_id", { length: 255 }),
  userId: integer("user_id"),
  alertType: varchar("alert_type", { length: 100 }).notNull(),
  severity: varchar("severity", { length: 50 }).default("medium"),
  status: varchar("status", { length: 50 }).default("open"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

export const observabilityAlerts = pgTable("observability_alerts", {
  id: serial("id").primaryKey(),
  alertName: varchar("alert_name", { length: 255 }).notNull(),
  severity: varchar("severity", { length: 50 }).default("warning"),
  message: text("message"),
  metadata: jsonb("metadata"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),

  service: varchar("service", { length: 255 }),
  status: varchar("status", { length: 50 }).default("open"),
});

export const dlqMessages = pgTable("dlq_messages", {
  id: serial("id").primaryKey(),
  topic: varchar("topic", { length: 255 }).notNull(),
  payload: jsonb("payload"),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  processedAt: timestamp("processed_at"),

  status: varchar("status", { length: 50 }).default("pending"),
});

// ─── Inventory & Products ─────────────────────────────────────────────────────

export const inventoryItems = pgTable("inventory_items", {
  id: serial("id").primaryKey(),
  productId: integer("product_id"),
  sku: varchar("sku", { length: 100 }).unique(),
  quantity: integer("quantity").default(0),
  unitCost: numeric("unit_cost", { precision: 18, scale: 2 }),
  warehouseId: integer("warehouse_id"),
  updatedAt: timestamp("updated_at").defaultNow(),

  category: varchar("category", { length: 100 }),
  name: varchar("name", { length: 255 }).notNull(),
  status: varchar("status", { length: 50 }).default("active"),
});

export const receiptTemplates = pgTable("receipt_templates", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  template: text("template").notNull(),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const storefrontAds = pgTable("storefront_ads", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id"),
  title: varchar("title", { length: 255 }).notNull(),
  imageUrl: text("image_url"),
  targetUrl: text("target_url"),
  isActive: boolean("is_active").default(true),
  startsAt: timestamp("starts_at"),
  endsAt: timestamp("ends_at"),
  createdAt: timestamp("created_at").defaultNow(),

  status: varchar("status", { length: 50 }).default("active"),
});

// ─── KYC & Documents ─────────────────────────────────────────────────────────

export const kycDocuments = pgTable("kyc_documents", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  documentType: varchar("document_type", { length: 100 }).notNull(),
  fileUrl: text("file_url").notNull(),
  status: varchar("status", { length: 50 }).default("pending"),
  reviewedBy: integer("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow(),

  agentId: integer("agent_id"),
  docType: varchar("doc_type", { length: 100 }),
});

export const kycSessions = pgTable("kyc_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  sessionToken: varchar("session_token", { length: 255 }).unique(),
  status: varchar("status", { length: 50 }).default("pending"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),

  agentId: integer("agent_id"),
  sessionRef: varchar("session_ref", { length: 255 }),
});

export const merchantKycDocs = pgTable("merchant_kyc_docs", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull(),
  documentType: varchar("document_type", { length: 100 }).notNull(),
  fileUrl: text("file_url").notNull(),
  status: varchar("status", { length: 50 }).default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Loyalty ──────────────────────────────────────────────────────────────────

export const loyaltyHistory = pgTable("loyalty_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  points: integer("points").notNull(),
  action: varchar("action", { length: 100 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),

  agentId: integer("agent_id"),
  type: varchar("type", { length: 50 }),
});

// ─── Merchant & POS ───────────────────────────────────────────────────────────

export const merchants = pgTable("merchants", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  businessName: varchar("business_name", { length: 255 }).notNull(),
  businessType: varchar("business_type", { length: 100 }),
  rcNumber: varchar("rc_number", { length: 50 }),
  taxId: varchar("tax_id", { length: 50 }),
  status: varchar("status", { length: 50 }).default("pending"),
  kycStatus: varchar("kyc_status", { length: 50 }).default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  category: varchar("category", { length: 100 }),
  deletedAt: timestamp("deleted_at"),
  email: varchar("email", { length: 320 }),
  merchantCode: varchar("merchant_code", { length: 50 }),
  preferredAgentId: integer("preferred_agent_id"),
  totalTransactions: integer("total_transactions").default(0),
  totalVolume: numeric("total_volume", { precision: 18, scale: 6 }).default("0"),
  walletBalance: numeric("wallet_balance", { precision: 18, scale: 6 }).default("0"),
});

export const merchantKybDocuments = pgTable("merchant_kyb_documents", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull(),
  documentType: varchar("document_type", { length: 100 }).notNull(),
  fileUrl: text("file_url").notNull(),
  status: varchar("status", { length: 50 }).default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const merchantPayouts = pgTable("merchant_payouts", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull(),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("NGN"),
  status: varchar("status", { length: 50 }).default("pending"),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const merchantSettlements = pgTable("merchant_settlements", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull(),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("NGN"),
  period: varchar("period", { length: 20 }),
  status: varchar("status", { length: 50 }).default("pending"),
  settledAt: timestamp("settled_at"),
  createdAt: timestamp("created_at").defaultNow(),

  grossAmount: numeric("gross_amount", { precision: 18, scale: 6 }),

  periodStart: timestamp("period_start"),
  periodEnd: timestamp("period_end"),
});

// posTerminals is defined in schema-additions.ts

export const terminalGroups = pgTable("terminal_groups", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  merchantId: integer("merchant_id"),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Mobile & SIM ─────────────────────────────────────────────────────────────

export const multiSimProfiles = pgTable("multi_sim_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  iccid: varchar("iccid", { length: 50 }).notNull(),
  msisdn: varchar("msisdn", { length: 20 }),
  carrier: varchar("carrier", { length: 100 }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),

  failoverPriority: integer("failover_priority").default(1),
  terminalId: integer("terminal_id"),
});

export const simOrchestratorConfig = pgTable("sim_orchestrator_config", {
  id: serial("id").primaryKey(),
  provider: varchar("provider", { length: 100 }).notNull(),
  config: jsonb("config"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Platform Config & Settings ───────────────────────────────────────────────

export const platformSettings = pgTable("platform_settings", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 255 }).notNull().unique(),
  value: text("value"),
  description: text("description"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const systemConfig = pgTable("system_config", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 255 }).notNull().unique(),
  value: text("value"),
  category: varchar("category", { length: 100 }),
  updatedBy: integer("updated_by"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const backupSnapshots = pgTable("backup_snapshots", {
  id: serial("id").primaryKey(),
  snapshotType: varchar("snapshot_type", { length: 100 }).notNull(),
  status: varchar("status", { length: 50 }).default("pending"),
  sizeBytes: bigint("size_bytes", { mode: "number" }),
  storageUrl: text("storage_url"),
  checksum: varchar("checksum", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const loadTestRuns = pgTable("load_test_runs", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }),
  config: jsonb("config"),
  status: varchar("status", { length: 50 }).default("pending"),
  results: jsonb("results"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),

  runId: varchar("run_id", { length: 255 }),
});

export const serviceRecords = pgTable("service_records", {
  id: serial("id").primaryKey(),
  terminalId: integer("terminal_id"),
  agentId: integer("agent_id"),
  serviceName: varchar("service_name", { length: 255 }).notNull(),
  status: varchar("status", { length: 50 }).default("healthy"),
  version: varchar("version", { length: 50 }),
  lastHealthCheck: timestamp("last_health_check").defaultNow(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const softwareUpdates = pgTable("software_updates", {
  id: serial("id").primaryKey(),
  version: varchar("version", { length: 50 }).notNull(),
  releaseNotes: text("release_notes"),
  targetDevices: jsonb("target_devices"),
  status: varchar("status", { length: 50 }).default("pending"),
  releasedAt: timestamp("released_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── QR & Payments ────────────────────────────────────────────────────────────

export const qrCodes = pgTable("qr_codes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  merchantId: integer("merchant_id"),
  code: varchar("code", { length: 500 }).notNull().unique(),
  type: varchar("type", { length: 50 }).default("payment"),
  status: varchar("status", { length: 50 }).default("active"),
  amount: numeric("amount", { precision: 18, scale: 2 }),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  agentId: integer("agent_id"),
  merchantId: integer("merchant_id"),
  reference: varchar("reference", { length: 255 }).unique(),
  type: varchar("type", { length: 100 }).notNull(),
  txType: varchar("tx_type", { length: 100 }),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("NGN"),
  status: varchar("status", { length: 50 }).default("pending"),
  channel: varchar("channel", { length: 50 }),
  description: text("description"),
  metadata: jsonb("metadata"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  commission: numeric("commission", { precision: 18, scale: 6 }).default("0"),
  customerPhone: varchar("customer_phone", { length: 30 }),
  fee: numeric("fee", { precision: 18, scale: 6 }).default("0"),
  fraudScore: numeric("fraud_score", { precision: 5, scale: 4 }),
  idempotencyKey: varchar("idempotency_key", { length: 255 }),

  ref: varchar("ref", { length: 100 }),

  terminalId: varchar("terminal_id", { length: 100 }),
  retryCount: integer("retry_count").default(0),
  reversedAt: timestamp("reversed_at"),
  reversalRef: varchar("reversal_ref", { length: 100 }),
  disputeId: integer("dispute_id"),
  processorRef: varchar("processor_ref", { length: 200 }),
  switchRef: varchar("switch_ref", { length: 200 }),
  tigerBeetleId: bigint("tiger_beetle_id", { mode: "bigint" }),
  latitude: numeric("latitude", { precision: 10, scale: 7 }),
  longitude: numeric("longitude", { precision: 10, scale: 7 }),
  deviceFingerprint: varchar("device_fingerprint", { length: 200 }),
  riskLevel: varchar("risk_level", { length: 20 }),
});

// ─── Shareable Links & Misc ───────────────────────────────────────────────────

export const shareableLinks = pgTable("shareable_links", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  type: varchar("type", { length: 50 }),
  targetId: varchar("target_id", { length: 255 }),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),

  agentId: integer("agent_id"),
  status: varchar("status", { length: 50 }).default("active"),
});

export const guideFeedback = pgTable("guide_feedback", {
  id: serial("id").primaryKey(),
  guideId: integer("guide_id"),
  userId: integer("user_id"),
  rating: integer("rating"),
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow(),

  subsection: varchar("subsection", { length: 255 }),
});

// ─── Training ─────────────────────────────────────────────────────────────────

export const trainingCourses = pgTable("training_courses", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  targetRole: varchar("target_role", { length: 100 }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),

  category: varchar("category", { length: 100 }),
  isMandatory: boolean("is_mandatory").default(false),
});

export const trainingEnrollments = pgTable("training_enrollments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  courseId: integer("course_id").notNull(),
  status: varchar("status", { length: 50 }).default("enrolled"),
  completedAt: timestamp("completed_at"),
  enrolledAt: timestamp("enrolled_at").defaultNow(),

  agentId: integer("agent_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Workflow ─────────────────────────────────────────────────────────────────

export const workflowDefinitions = pgTable("workflow_definitions", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  version: integer("version").default(1),
  definition: jsonb("definition"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const workflowInstances = pgTable("workflow_instances", {
  id: serial("id").primaryKey(),
  definitionId: integer("definition_id").notNull(),
  status: varchar("status", { length: 50 }).default("running"),
  context: jsonb("context"),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  error: text("error"),

  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Snake_case Compatibility Aliases ────────────────────────────────────────
// Some routers import tables using snake_case names from the production branch.
// These aliases bridge the gap without renaming the canonical camelCase exports.
export { notificationLogs as notification_logs } from "./schema-additions";
// customer_journey_events alias removed (self-referential)

// data_export_jobs — used by dataExportHub and dataExportRouter
export const dataExportJobs = pgTable("data_export_jobs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  exportType: varchar("export_type", { length: 100 }).notNull(),
  status: varchar("status", { length: 50 }).default("pending"),
  fileUrl: text("file_url"),
  requestedAt: timestamp("requested_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  expiresAt: timestamp("expires_at"),
  metadata: jsonb("metadata"),

  createdAt: timestamp("created_at").defaultNow(),
});
export const data_export_jobs = dataExportJobs;
