/**
 * schema-missing.ts
 * Tables that were referenced in routers/client but not yet defined in any schema file.
 * Generated to resolve TypeScript TS2339/TS2353 errors.
 */
import { pgTable, serial, integer, varchar, text, boolean, timestamp, numeric, jsonb, bigint } from 'drizzle-orm/pg-core';

// ─── Fraud Alerts ────────────────────────────────────────────────────────────
export const fraudAlerts = pgTable("fraud_alerts", {
  id: serial("id").primaryKey(),
  transactionId: varchar("transaction_id", { length: 100 }),
  alertId: varchar("alert_id", { length: 100 }),
  userId: integer("user_id"),
  agentId: integer("agent_id"),
  assignedTo: integer("assigned_to"),
  customerName: varchar("customer_name", { length: 200 }),
  fraudScore: numeric("fraud_score", { precision: 5, scale: 4 }),
  reason: text("reason"),
  type: varchar("type", { length: 50 }),
  status: varchar("status", { length: 50 }).default("open"),
  riskLevel: varchar("risk_level", { length: 20 }),
  amount: numeric("amount", { precision: 18, scale: 2 }),
  currency: varchar("currency", { length: 10 }).default("NGN"),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: integer("resolved_by"),
  resolutionNote: text("resolution_note"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── ERP Integrations ────────────────────────────────────────────────────────
export const erpIntegrations = pgTable("erp_integrations", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  name: varchar("name", { length: 200 }),
  erpType: varchar("erp_type", { length: 50 }),
  baseUrl: varchar("base_url", { length: 500 }),
  apiKey: varchar("api_key", { length: 500 }),
  username: varchar("username", { length: 200 }),
  passwordHash: varchar("password_hash", { length: 500 }),
  fieldMappings: jsonb("field_mappings"),
  syncEnabled: boolean("sync_enabled").default(false),
  syncIntervalMinutes: integer("sync_interval_minutes").default(60),
  syncTransactions: boolean("sync_transactions").default(false),
  syncAgents: boolean("sync_agents").default(false),
  syncInventory: boolean("sync_inventory").default(false),
  lastSyncAt: timestamp("last_sync_at"),
  lastSyncStatus: varchar("last_sync_status", { length: 50 }),
  sessionRef: varchar("session_ref", { length: 200 }),
  supportAgentName: varchar("support_agent_name", { length: 200 }),
  database: varchar("database", { length: 200 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── MQTT Brokers ─────────────────────────────────────────────────────────────
export const mqttBrokers = pgTable("mqtt_brokers", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  name: varchar("name", { length: 200 }),
  brokerUrl: varchar("broker_url", { length: 500 }),
  port: integer("port").default(1883),
  clientId: varchar("client_id", { length: 200 }),
  username: varchar("username", { length: 200 }),
  password: varchar("password", { length: 500 }),
  useTls: boolean("use_tls").default(false),
  keepAliveSeconds: integer("keep_alive_seconds").default(60),
  topicMappings: jsonb("topic_mappings"),
  enabled: boolean("enabled").default(true),
  lastTestStatus: varchar("last_test_status", { length: 50 }),
  lastTestedAt: timestamp("last_tested_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── Tenant Subscriptions ────────────────────────────────────────────────────
export const tenantSubscriptions = pgTable("tenant_subscriptions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  plan: varchar("plan", { length: 50 }),
  billingModel: varchar("billing_model", { length: 50 }).default("flat"),
  status: varchar("status", { length: 50 }).default("active"),
  currency: varchar("currency", { length: 10 }).default("NGN"),
  monthlyFee: numeric("monthly_fee", { precision: 18, scale: 2 }),
  contractStartDate: timestamp("contract_start_date"),
  contractEndDate: timestamp("contract_end_date"),
  autoRenew: boolean("auto_renew").default(true),
  hybridConfig: jsonb("hybrid_config"),
  revenueShareConfig: jsonb("revenue_share_config"),
  subscriptionConfig: jsonb("subscription_config"),
  kafkaTopicPrefix: varchar("kafka_topic_prefix", { length: 100 }),
  tigerBeetleAccountId: bigint("tiger_beetle_account_id", { mode: "bigint" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── Webhook Deliveries ───────────────────────────────────────────────────────
export const webhookDeliveries = pgTable("webhook_deliveries", {
  id: serial("id").primaryKey(),
  endpointId: integer("endpoint_id"),
  subscriptionId: integer("subscription_id"),
  eventType: varchar("event_type", { length: 100 }),
  payload: jsonb("payload"),
  status: varchar("status", { length: 50 }).default("pending"),
  httpStatus: integer("http_status"),
  responseBody: text("response_body"),
  attemptCount: integer("attempt_count").default(0),
  retryCount: integer("retry_count").default(0),
  responseTime: integer("response_time"),
  nextRetryAt: timestamp("next_retry_at"),
  deliveredAt: timestamp("delivered_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── MDM Devices ──────────────────────────────────────────────────────────────
export const mdmDevices = pgTable("mdm_devices", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  agentId: integer("agent_id"),
  deviceId: varchar("device_id", { length: 200 }),
  serialNumber: varchar("serial_number", { length: 100 }),
  model: varchar("model", { length: 100 }),
  osVersion: varchar("os_version", { length: 50 }),
  appVersion: varchar("app_version", { length: 50 }),
  firmwareVersion: varchar("firmware_version", { length: 50 }),
  ipAddress: varchar("ip_address", { length: 50 }),
  status: varchar("status", { length: 50 }).default("active"),
  complianceStatus: varchar("compliance_status", { length: 50 }),
  enrollmentToken: varchar("enrollment_token", { length: 500 }),
  enrollmentExpiresAt: timestamp("enrollment_expires_at"),
  configJson: jsonb("config_json"),
  lastSeenAt: timestamp("last_seen_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── Agent Float Loans ────────────────────────────────────────────────────────
export const agentFloatLoans = pgTable("agent_float_loans", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id"),
  tenantId: integer("tenant_id"),
  amount: numeric("amount", { precision: 18, scale: 2 }),
  totalRepayable: numeric("total_repayable", { precision: 18, scale: 2 }),
  interestRate: numeric("interest_rate", { precision: 5, scale: 4 }),
  status: varchar("status", { length: 50 }).default("pending"),
  accountName: varchar("account_name", { length: 200 }),
  accountNumber: varchar("account_number", { length: 50 }),
  bankCode: varchar("bank_code", { length: 20 }),
  nubanRef: varchar("nuban_ref", { length: 100 }),
  disbursedAt: timestamp("disbursed_at"),
  processedAt: timestamp("processed_at"),
  dueDate: timestamp("due_date"),
  repaidAt: timestamp("repaid_at"),
  approvedBy: integer("approved_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── Tenant Activity Logs ─────────────────────────────────────────────────────
export const tenantActivityLogs = pgTable("tenant_activity_logs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  userId: integer("user_id"),
  userName: varchar("user_name", { length: 200 }),
  action: varchar("action", { length: 100 }),
  resourceType: varchar("resource_type", { length: 100 }),
  resourceId: varchar("resource_id", { length: 255 }),
  details: jsonb("details"),
  ipAddress: varchar("ip_address", { length: 50 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── Establishments ───────────────────────────────────────────────────────────
export const establishments = pgTable("establishments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  tenantId: integer("tenant_id"),
  name: varchar("name", { length: 200 }),
  businessType: varchar("business_type", { length: 100 }),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 100 }),
  country: varchar("country", { length: 10 }).default("NG"),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 200 }),
  ownerName: varchar("owner_name", { length: 200 }),
  tinNumber: varchar("tin_number", { length: 20 }),
  rcNumber: varchar("rc_number", { length: 50 }),
  settlementAccountNumber: varchar("settlement_account_number", { length: 50 }),
  settlementBankName: varchar("settlement_bank_name", { length: 100 }),
  settlementBankCode: varchar("settlement_bank_code", { length: 20 }),
  status: varchar("status", { length: 50 }).default("active"),
  kycStatus: varchar("kyc_status", { length: 50 }).default("pending"),
  latitude: numeric("latitude", { precision: 10, scale: 7 }),
  longitude: numeric("longitude", { precision: 10, scale: 7 }),
  logoUrl: varchar("logo_url", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

// ─── Load Test Scenarios ──────────────────────────────────────────────────────
export const loadTestScenarios = pgTable("load_test_scenarios", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }),
  description: text("description"),
  targetRps: integer("target_rps").default(100),
  durationSeconds: integer("duration_seconds").default(60),
  concurrency: integer("concurrency").default(10),
  merchantCount: integer("merchant_count").default(100),
  zipfSkew: numeric("zipf_skew", { precision: 4, scale: 2 }).default("1.0"),
  config: jsonb("config"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── Agent Onboarding Steps ───────────────────────────────────────────────────
export const agentOnboardingSteps = pgTable("agent_onboarding_steps", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id"),
  step: varchar("step", { length: 100 }),
  status: varchar("status", { length: 50 }).default("pending"),
  profileComplete: boolean("profile_complete").default(false),
  kycComplete: boolean("kyc_complete").default(false),
  trainingComplete: boolean("training_complete").default(false),
  terminalAssigned: boolean("terminal_assigned").default(false),
  floatFunded: boolean("float_funded").default(false),
  notes: text("notes"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── Additional missing tables (TS2305 fixes) ─────────────────────────────────

export const agentBadges = pgTable("agent_badges", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id"),
  badgeType: varchar("badge_type", { length: 100 }),
  badgeName: varchar("badge_name", { length: 200 }),
  description: text("description"),
  iconUrl: varchar("icon_url", { length: 500 }),
  awardedAt: timestamp("awarded_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const emailDeliveryLog = pgTable("email_delivery_log", {
  id: serial("id").primaryKey(),
  recipientEmail: varchar("recipient_email", { length: 200 }),
  subject: varchar("subject", { length: 500 }),
  templateId: varchar("template_id", { length: 100 }),
  status: varchar("status", { length: 50 }).default("pending"),
  provider: varchar("provider", { length: 50 }),
  messageId: varchar("message_id", { length: 200 }),
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const encryptedFields = pgTable("encrypted_fields", {
  id: serial("id").primaryKey(),
  tableName: varchar("table_name", { length: 100 }),
  columnName: varchar("column_name", { length: 100 }),
  recordId: varchar("record_id", { length: 255 }),
  encryptedValue: text("encrypted_value"),
  keyVersion: integer("key_version").default(1),
  algorithm: varchar("algorithm", { length: 50 }).default("AES-256-GCM"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const dataRightsRequests = pgTable("data_rights_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  requestType: varchar("request_type", { length: 50 }),
  status: varchar("status", { length: 50 }).default("pending"),
  details: jsonb("details"),
  processedAt: timestamp("processed_at"),
  processedBy: integer("processed_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const glAccounts = pgTable("gl_accounts", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  accountCode: varchar("account_code", { length: 50 }),
  accountName: varchar("account_name", { length: 200 }),
  accountType: varchar("account_type", { length: 50 }),
  parentId: integer("parent_id"),
  balance: numeric("balance", { precision: 18, scale: 2 }).default("0"),
  currency: varchar("currency", { length: 10 }).default("NGN"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const glJournalEntries = pgTable("gl_journal_entries", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  entryDate: timestamp("entry_date"),
  reference: varchar("reference", { length: 100 }),
  description: text("description"),
  debitAccountId: integer("debit_account_id"),
  creditAccountId: integer("credit_account_id"),
  amount: numeric("amount", { precision: 18, scale: 2 }),
  currency: varchar("currency", { length: 10 }).default("NGN"),
  status: varchar("status", { length: 50 }).default("posted"),
  postedBy: integer("posted_by"),
  postedAt: timestamp("posted_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const deviceCommands = pgTable("device_commands", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id"),
  commandType: varchar("command_type", { length: 100 }),
  payload: jsonb("payload"),
  status: varchar("status", { length: 50 }).default("pending"),
  sentAt: timestamp("sent_at"),
  acknowledgedAt: timestamp("acknowledged_at"),
  executedAt: timestamp("executed_at"),
  result: jsonb("result"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const deviceCompliancePolicies = pgTable("device_compliance_policies", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  name: varchar("name", { length: 200 }),
  rules: jsonb("rules"),
  severity: varchar("severity", { length: 50 }).default("medium"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const deviceComplianceViolations = pgTable("device_compliance_violations", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id"),
  policyId: integer("policy_id"),
  violationType: varchar("violation_type", { length: 100 }),
  details: jsonb("details"),
  severity: varchar("severity", { length: 50 }),
  status: varchar("status", { length: 50 }).default("open"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const otaReleases = pgTable("ota_releases", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  version: varchar("version", { length: 50 }),
  releaseNotes: text("release_notes"),
  packageUrl: varchar("package_url", { length: 500 }),
  checksum: varchar("checksum", { length: 200 }),
  targetDeviceTypes: jsonb("target_device_types"),
  isActive: boolean("is_active").default(true),
  releasedAt: timestamp("released_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const otaUpdateLog = pgTable("ota_update_log", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id"),
  releaseId: integer("release_id"),
  status: varchar("status", { length: 50 }).default("pending"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const connectivityLog = pgTable("connectivity_log", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id"),
  agentId: integer("agent_id"),
  connectionType: varchar("connection_type", { length: 50 }),
  status: varchar("status", { length: 50 }),
  latencyMs: integer("latency_ms"),
  signalStrength: integer("signal_strength"),
  ipAddress: varchar("ip_address", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const simFailoverLog = pgTable("sim_failover_log", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id"),
  fromSimId: integer("from_sim_id"),
  toSimId: integer("to_sim_id"),
  reason: text("reason"),
  triggeredAt: timestamp("triggered_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const simProbeLog = pgTable("sim_probe_log", {
  id: serial("id").primaryKey(),
  simId: integer("sim_id"),
  probeType: varchar("probe_type", { length: 50 }),
  status: varchar("status", { length: 50 }),
  latencyMs: integer("latency_ms"),
  errorMessage: text("error_message"),
  probedAt: timestamp("probed_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});
