/**
 * drizzle/schema-additions.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Schema Additions — 101 Missing Tables
 *
 * Covers:
 *  1. Middleware support tables (outbox, Fluvio offsets, Lakehouse ETL, WAF, Dapr, etc.)
 *  2. Financial products (payments, refunds, chargebacks, disputes)
 *  3. Digital currencies (CBDC, eNaira, crypto, stablecoins)
 *  4. Cross-border payments (SWIFT, SEPA, ACH, correspondent banks)
 *  5. Mobile money & agent banking
 *  6. Bill payments, airtime, data bundles
 *  7. Insurance, investments, savings, micro-loans
 *  8. Compliance (AML, CTR, SAR, sanctions)
 *  9. Settlement & reconciliation
 * 10. Analytics, metrics, SLA
 * 11. GDPR & consent management
 * 12. POS & NFC terminals
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
  pgEnum,
  uuid,
} from "drizzle-orm/pg-core";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const outboxStatusEnum = pgEnum("outbox_status", [
  "pending", "processing", "delivered", "failed", "dead_letter",
]);

export const etlJobStatusEnum = pgEnum("etl_job_status", [
  "queued", "running", "completed", "failed", "cancelled",
]);

export const wafActionEnum = pgEnum("waf_action", ["detect", "prevent"]);
export const wafSeverityEnum = pgEnum("waf_severity", ["low", "medium", "high", "critical"]);

export const paymentMethodTypeEnum = pgEnum("payment_method_type", [
  "card", "bank_account", "mobile_money", "wallet", "crypto", "cbdc", "enaira",
]);

export const paymentIntentStatusEnum = pgEnum("payment_intent_status", [
  "created", "processing", "succeeded", "failed", "cancelled", "refunded",
]);

export const refundStatusEnum = pgEnum("refund_status", [
  "pending", "processing", "completed", "failed", "cancelled",
]);

export const disputeStatusEnum = pgEnum("dispute_status", [
  "open", "under_review", "resolved_merchant", "resolved_customer", "escalated", "closed",
]);

export const complianceAlertStatusEnum = pgEnum("compliance_alert_status", [
  "open", "investigating", "escalated", "resolved", "false_positive",
]);

export const complianceAlertTypeEnum = pgEnum("compliance_alert_type", [
  "aml", "sanctions", "pep", "ctr", "sar", "structuring", "velocity", "unusual_pattern",
]);

export const settlementStatusEnum = pgEnum("settlement_status", [
  "pending", "processing", "completed", "failed", "reversed",
]);

export const loanStatusEnum = pgEnum("loan_status", [
  "applied", "under_review", "approved", "disbursed", "active",
  "overdue", "defaulted", "paid_off", "written_off", "rejected",
]);

export const insuranceStatusEnum = pgEnum("insurance_status", [
  "active", "lapsed", "cancelled", "expired", "claimed",
]);

export const investmentStatusEnum = pgEnum("investment_status", [
  "active", "matured", "liquidated", "cancelled",
]);

export const cbdcAccountTypeEnum = pgEnum("cbdc_account_type", [
  "retail", "wholesale", "institutional",
]);

export const cryptoNetworkEnum = pgEnum("crypto_network", [
  "ethereum", "bitcoin", "polygon", "solana", "bnb_chain", "tron", "stellar",
]);

export const mobileMoneProviderEnum = pgEnum("mobile_money_provider", [
  "mtn_momo", "airtel_money", "mpesa", "orange_money", "wave", "opay", "palmpay",
]);

export const gdprRequestStatusEnum = pgEnum("gdpr_request_status", [
  "pending", "processing", "completed", "rejected",
]);

export const gdprRequestTypeEnum = pgEnum("gdpr_request_type", [
  "deletion", "export", "rectification", "restriction", "portability",
]);

// ─── 1. Middleware Support Tables ─────────────────────────────────────────────

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    topic: varchar("topic", { length: 200 }).notNull(),
    eventType: varchar("event_type", { length: 200 }).notNull(),
    payload: jsonb("payload").notNull(),
    status: outboxStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    lastAttemptAt: timestamp("last_attempt_at"),
    errorMessage: text("error_message"),
    processedAt: timestamp("processed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index("outbox_events_status_idx").on(t.status),
    topicIdx: index("outbox_events_topic_idx").on(t.topic),
    createdAtIdx: index("outbox_events_created_at_idx").on(t.createdAt),
  }),
);

export const fluvioConsumerOffsets = pgTable(
  "fluvio_consumer_offsets",
  {
    id: serial("id").primaryKey(),
    topic: varchar("topic", { length: 200 }).notNull(),
    consumerGroup: varchar("consumer_group", { length: 200 }).notNull(),
    partition: integer("partition").notNull().default(0),
    lastOffset: bigint("last_offset", { mode: "number" }).notNull().default(0),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    uniqueTopicGroup: uniqueIndex("fluvio_offsets_topic_group_idx").on(
      t.topic, t.consumerGroup, t.partition,
    ),
  }),
);

export const lakehouseEtlRuns = pgTable(
  "lakehouse_etl_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobType: varchar("job_type", { length: 100 }).notNull(),
    status: etlJobStatusEnum("status").notNull().default("queued"),
    params: jsonb("params"),
    rowsProcessed: integer("rows_processed"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index("lakehouse_etl_status_idx").on(t.status),
    jobTypeIdx: index("lakehouse_etl_job_type_idx").on(t.jobType),
  }),
);

export const openappsecWafEvents = pgTable(
  "openappsec_waf_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceIp: varchar("source_ip", { length: 45 }).notNull(),
    method: varchar("method", { length: 10 }).notNull(),
    uri: text("uri").notNull(),
    userAgent: text("user_agent"),
    attackType: varchar("attack_type", { length: 100 }).notNull(),
    severity: wafSeverityEnum("severity").notNull(),
    action: wafActionEnum("action").notNull(),
    requestId: varchar("request_id", { length: 100 }),
    userId: integer("user_id"),
    details: jsonb("details"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    sourceIpIdx: index("waf_events_source_ip_idx").on(t.sourceIp),
    attackTypeIdx: index("waf_events_attack_type_idx").on(t.attackType),
    createdAtIdx: index("waf_events_created_at_idx").on(t.createdAt),
    severityIdx: index("waf_events_severity_idx").on(t.severity),
  }),
);

export const keycloakUserSyncLog = pgTable(
  "keycloak_user_sync_log",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    keycloakId: varchar("keycloak_id", { length: 100 }),
    action: varchar("action", { length: 50 }).notNull(), // created, updated, deleted, synced
    status: varchar("status", { length: 20 }).notNull().default("success"),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    userIdIdx: index("keycloak_sync_user_id_idx").on(t.userId),
    keycloakIdIdx: index("keycloak_sync_keycloak_id_idx").on(t.keycloakId),
  }),
);

export const tigerbeetleAccountMap = pgTable(
  "tigerbeetle_account_map",
  {
    id: serial("id").primaryKey(),
    entityType: varchar("entity_type", { length: 50 }).notNull(), // user, establishment, system
    entityId: integer("entity_id").notNull(),
    currency: varchar("currency", { length: 10 }).notNull(),
    tbAccountId: bigint("tb_account_id", { mode: "number" }).notNull(),
    tbAccountType: integer("tb_account_type").notNull(), // TigerBeetle account type code
    ledger: integer("ledger").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    entityIdx: uniqueIndex("tb_account_entity_idx").on(t.entityType, t.entityId, t.currency),
    tbAccountIdx: uniqueIndex("tb_account_id_idx").on(t.tbAccountId),
  }),
);

export const tigerbeetleTransferLog = pgTable(
  "tigerbeetle_transfer_log",
  {
    id: serial("id").primaryKey(),
    tbTransferId: bigint("tb_transfer_id", { mode: "number" }).notNull(),
    debitAccountId: bigint("debit_account_id", { mode: "number" }).notNull(),
    creditAccountId: bigint("credit_account_id", { mode: "number" }).notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    currency: varchar("currency", { length: 10 }).notNull(),
    ledger: integer("ledger").notNull(),
    code: integer("code").notNull(),
    referenceType: varchar("reference_type", { length: 50 }), // transaction, settlement, fee
    referenceId: varchar("reference_id", { length: 100 }),
    status: varchar("status", { length: 20 }).notNull().default("committed"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    tbTransferIdx: uniqueIndex("tb_transfer_id_idx").on(t.tbTransferId),
    referenceIdx: index("tb_transfer_reference_idx").on(t.referenceType, t.referenceId),
  }),
);

export const temporalWorkflowLog = pgTable(
  "temporal_workflow_log",
  {
    id: serial("id").primaryKey(),
    workflowId: varchar("workflow_id", { length: 200 }).notNull(),
    workflowType: varchar("workflow_type", { length: 100 }).notNull(),
    runId: varchar("run_id", { length: 100 }),
    status: varchar("status", { length: 30 }).notNull().default("started"),
    input: jsonb("input"),
    result: jsonb("result"),
    errorMessage: text("error_message"),
    userId: integer("user_id"),
    entityType: varchar("entity_type", { length: 50 }),
    entityId: varchar("entity_id", { length: 100 }),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
  },
  (t) => ({
    workflowIdIdx: index("temporal_workflow_id_idx").on(t.workflowId),
    workflowTypeIdx: index("temporal_workflow_type_idx").on(t.workflowType),
    statusIdx: index("temporal_workflow_status_idx").on(t.status),
  }),
);

export const featureFlags = pgTable(
  "feature_flags",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull().unique(),
    description: text("description"),
    isEnabled: boolean("is_enabled").notNull().default(false),
    rolloutPercentage: integer("rollout_percentage").notNull().default(0),
    targetUserIds: jsonb("target_user_ids"), // array of user IDs for targeted rollout
    targetRoles: jsonb("target_roles"), // array of roles
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at"),
  },
  (t) => ({
    nameIdx: uniqueIndex("feature_flags_name_idx").on(t.name),
  }),
);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: serial("id").primaryKey(),
    key: varchar("key", { length: 200 }).notNull().unique(),
    userId: integer("user_id"),
    endpoint: varchar("endpoint", { length: 200 }),
    statusCode: integer("status_code"),
    responseBody: jsonb("response_body"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (t) => ({
    keyIdx: uniqueIndex("idempotency_key_idx").on(t.key),
    expiresAtIdx: index("idempotency_expires_at_idx").on(t.expiresAt),
  }),
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id"),
    establishmentId: integer("establishment_id"),
    name: varchar("name", { length: 100 }).notNull(),
    keyHash: varchar("key_hash", { length: 200 }).notNull().unique(),
    keyPrefix: varchar("key_prefix", { length: 20 }).notNull(),
    scopes: jsonb("scopes").notNull().default([]), // array of permission scopes
    isActive: boolean("is_active").notNull().default(true),
    lastUsedAt: timestamp("last_used_at"),
    expiresAt: timestamp("expires_at"),
    ipWhitelist: jsonb("ip_whitelist"), // array of allowed IPs
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    revokedAt: timestamp("revoked_at"),
    status: varchar("status", { length: 50 }).default("active"),
    description: text("description"),
    rateLimit: integer("rate_limit").default(1000),
    tenantId: integer("tenant_id"),
  },
  (t) => ({
    keyHashIdx: uniqueIndex("api_keys_hash_idx").on(t.keyHash),
    userIdIdx: index("api_keys_user_id_idx").on(t.userId),
    establishmentIdIdx: index("api_keys_establishment_id_idx").on(t.establishmentId),
  }),
);

export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id"),
    establishmentId: integer("establishment_id"),
    url: text("url").notNull(),
    secret: varchar("secret", { length: 200 }).notNull(),
    events: jsonb("events").notNull().default([]), // subscribed event types
    isActive: boolean("is_active").notNull().default(true),
    description: text("description"),
    headers: jsonb("headers"), // custom headers to include
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    userIdIdx: index("webhook_endpoints_user_id_idx").on(t.userId),
    establishmentIdIdx: index("webhook_endpoints_establishment_id_idx").on(t.establishmentId),
  }),
);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    endpointId: integer("endpoint_id").notNull(),
    eventType: varchar("event_type", { length: 200 }).notNull(),
    payload: jsonb("payload").notNull(),
    statusCode: integer("status_code"),
    responseBody: text("response_body"),
    attempts: integer("attempts").notNull().default(0),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    nextRetryAt: timestamp("next_retry_at"),
    deliveredAt: timestamp("delivered_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    endpointIdIdx: index("webhook_deliveries_endpoint_id_idx").on(t.endpointId),
    statusIdx: index("webhook_deliveries_status_idx").on(t.status),
    createdAtIdx: index("webhook_deliveries_created_at_idx").on(t.createdAt),
  }),
);

// ─── 2. Notifications ─────────────────────────────────────────────────────────

export const notificationTemplates = pgTable(
  "notification_templates",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull().unique(),
    channel: varchar("channel", { length: 20 }).notNull(), // email, sms, push, in_app
    subject: varchar("subject", { length: 500 }),
    bodyTemplate: text("body_template").notNull(),
    variables: jsonb("variables"), // expected template variables
    isActive: boolean("is_active").notNull().default(true),
    language: varchar("language", { length: 10 }).notNull().default("en"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
);

export const notificationLogs = pgTable(
  "notification_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: integer("user_id"),
    channel: varchar("channel", { length: 20 }).notNull(),
    templateId: integer("template_id"),
    recipient: varchar("recipient", { length: 500 }).notNull(),
    subject: varchar("subject", { length: 500 }),
    body: text("body"),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    providerMessageId: varchar("provider_message_id", { length: 200 }),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata"),
    sentAt: timestamp("sent_at"),
    deliveredAt: timestamp("delivered_at"),
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    userIdIdx: index("notification_logs_user_id_idx").on(t.userId),
    statusIdx: index("notification_logs_status_idx").on(t.status),
    createdAtIdx: index("notification_logs_created_at_idx").on(t.createdAt),
  }),
);

// ─── 3. Exchange Rates & Currency ─────────────────────────────────────────────

export const exchangeRateHistory = pgTable(
  "exchange_rate_history",
  {
    id: serial("id").primaryKey(),
    fromCurrency: varchar("from_currency", { length: 10 }).notNull(),
    toCurrency: varchar("to_currency", { length: 10 }).notNull(),
    rate: numeric("rate", { precision: 20, scale: 8 }).notNull(),
    bidRate: numeric("bid_rate", { precision: 20, scale: 8 }),
    askRate: numeric("ask_rate", { precision: 20, scale: 8 }),
    provider: varchar("provider", { length: 100 }).notNull(),
    source: varchar("source", { length: 50 }).notNull().default("api"),
    recordedAt: timestamp("recorded_at").notNull().defaultNow(),
  },
  (t) => ({
    pairIdx: index("exchange_rate_pair_idx").on(t.fromCurrency, t.toCurrency),
    recordedAtIdx: index("exchange_rate_recorded_at_idx").on(t.recordedAt),
  }),
);

export const currencyConfigs = pgTable(
  "currency_configs",
  {
    id: serial("id").primaryKey(),
    code: varchar("code", { length: 10 }).notNull().unique(),
    name: varchar("name", { length: 100 }).notNull(),
    symbol: varchar("symbol", { length: 10 }).notNull(),
    decimalPlaces: integer("decimal_places").notNull().default(2),
    isActive: boolean("is_active").notNull().default(true),
    isFiat: boolean("is_fiat").notNull().default(true),
    isCbdc: boolean("is_cbdc").notNull().default(false),
    isCrypto: boolean("is_crypto").notNull().default(false),
    minTransactionAmount: numeric("min_transaction_amount", { precision: 20, scale: 8 }),
    maxTransactionAmount: numeric("max_transaction_amount", { precision: 20, scale: 8 }),
    dailyLimit: numeric("daily_limit", { precision: 20, scale: 8 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
);

// ─── 4. Tax ───────────────────────────────────────────────────────────────────

export const taxRates = pgTable(
  "tax_rates",
  {
    id: serial("id").primaryKey(),
    taxType: varchar("tax_type", { length: 50 }).notNull(), // vat, withholding, stamp_duty, etc.
    country: varchar("country", { length: 3 }).notNull(),
    state: varchar("state", { length: 100 }),
    rate: numeric("rate", { precision: 8, scale: 4 }).notNull(),
    effectiveFrom: timestamp("effective_from").notNull(),
    effectiveTo: timestamp("effective_to"),
    isActive: boolean("is_active").notNull().default(true),
    description: text("description"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    taxTypeCountryIdx: index("tax_rates_type_country_idx").on(t.taxType, t.country),
  }),
);

export const taxCollectionRecords = pgTable(
  "tax_collection_records",
  {
    id: serial("id").primaryKey(),
    transactionId: varchar("transaction_id", { length: 100 }).notNull(),
    userId: integer("user_id").notNull(),
    taxType: varchar("tax_type", { length: 50 }).notNull(),
    taxableAmount: numeric("taxable_amount", { precision: 20, scale: 8 }).notNull(),
    taxAmount: numeric("tax_amount", { precision: 20, scale: 8 }).notNull(),
    taxRate: numeric("tax_rate", { precision: 8, scale: 4 }).notNull(),
    currency: varchar("currency", { length: 10 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("collected"),
    filingPeriod: varchar("filing_period", { length: 20 }), // e.g. "2025-Q1"
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    transactionIdIdx: index("tax_collection_transaction_id_idx").on(t.transactionId),
    userIdIdx: index("tax_collection_user_id_idx").on(t.userId),
    filingPeriodIdx: index("tax_collection_filing_period_idx").on(t.filingPeriod),
  }),
);

export const taxRemittanceRecords = pgTable(
  "tax_remittance_records",
  {
    id: serial("id").primaryKey(),
    filingPeriod: varchar("filing_period", { length: 20 }).notNull(),
    taxType: varchar("tax_type", { length: 50 }).notNull(),
    totalCollected: numeric("total_collected", { precision: 20, scale: 8 }).notNull(),
    totalRemitted: numeric("total_remitted", { precision: 20, scale: 8 }).notNull(),
    currency: varchar("currency", { length: 10 }).notNull(),
    taxAuthority: varchar("tax_authority", { length: 100 }).notNull(),
    referenceNumber: varchar("reference_number", { length: 100 }),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    filedAt: timestamp("filed_at"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
);

// ─── 5. Settlement & Reconciliation ──────────────────────────────────────────

export const settlementBatches = pgTable(
  "settlement_batches",
  {
    id: serial("id").primaryKey(),
    batchReference: varchar("batch_reference", { length: 100 }).notNull().unique(),
    currency: varchar("currency", { length: 10 }).notNull(),
    totalAmount: numeric("total_amount", { precision: 20, scale: 8 }).notNull(),
    feeAmount: numeric("fee_amount", { precision: 20, scale: 8 }).notNull().default("0"),
    netAmount: numeric("net_amount", { precision: 20, scale: 8 }).notNull(),
    itemCount: integer("item_count").notNull().default(0),
    status: settlementStatusEnum("status").notNull().default("pending"),
    settlementDate: timestamp("settlement_date").notNull(),
    processedAt: timestamp("processed_at"),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index("settlement_batches_status_idx").on(t.status),
    settlementDateIdx: index("settlement_batches_date_idx").on(t.settlementDate),
  }),
);

export const settlementBatchItems = pgTable(
  "settlement_batch_items",
  {
    id: serial("id").primaryKey(),
    batchId: integer("batch_id").notNull(),
    transactionId: varchar("transaction_id", { length: 100 }).notNull(),
    merchantId: integer("merchant_id"),
    amount: numeric("amount", { precision: 20, scale: 8 }).notNull(),
    feeAmount: numeric("fee_amount", { precision: 20, scale: 8 }).notNull().default("0"),
    netAmount: numeric("net_amount", { precision: 20, scale: 8 }).notNull(),
    currency: varchar("currency", { length: 10 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("included"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    batchIdIdx: index("settlement_batch_items_batch_id_idx").on(t.batchId),
    transactionIdIdx: index("settlement_batch_items_tx_id_idx").on(t.transactionId),
  }),
);

export const merchantSettlements = pgTable(
  "merchant_settlements",
  {
    id: serial("id").primaryKey(),
    batchId: integer("batch_id").notNull(),
    merchantId: integer("merchant_id").notNull(),
    establishmentId: integer("establishment_id"),
    totalAmount: numeric("total_amount", { precision: 20, scale: 8 }).notNull(),
    feeAmount: numeric("fee_amount", { precision: 20, scale: 8 }).notNull().default("0"),
    netAmount: numeric("net_amount", { precision: 20, scale: 8 }).notNull(),
    currency: varchar("currency", { length: 10 }).notNull(),
    bankAccountNumber: varchar("bank_account_number", { length: 50 }),
    bankCode: varchar("bank_code", { length: 20 }),
    status: settlementStatusEnum("status").notNull().default("pending"),
    transferReference: varchar("transfer_reference", { length: 200 }),
    settledAt: timestamp("settled_at"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  
    grossAmount: numeric("gross_amount", { precision: 20, scale: 8 }).default("0"),
    period: varchar("period", { length: 50 }),
    periodStart: timestamp("period_start"),
    periodEnd: timestamp("period_end"),
  },
  (t) => ({
    batchIdIdx: index("merchant_settlements_batch_id_idx").on(t.batchId),
    merchantIdIdx: index("merchant_settlements_merchant_id_idx").on(t.merchantId),
  }),
);

export const reconciliationReports = pgTable(
  "reconciliation_reports",
  {
    id: serial("id").primaryKey(),
    reportType: varchar("report_type", { length: 50 }).notNull(),
    periodStart: timestamp("period_start").notNull(),
    periodEnd: timestamp("period_end").notNull(),
    currency: varchar("currency", { length: 10 }),
    totalCredits: numeric("total_credits", { precision: 20, scale: 8 }).notNull().default("0"),
    totalDebits: numeric("total_debits", { precision: 20, scale: 8 }).notNull().default("0"),
    netPosition: numeric("net_position", { precision: 20, scale: 8 }).notNull().default("0"),
    discrepancies: jsonb("discrepancies"),
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    generatedBy: integer("generated_by"),
    approvedBy: integer("approved_by"),
    approvedAt: timestamp("approved_at"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
);

// ─── 6. Compliance ────────────────────────────────────────────────────────────

export const complianceRules = pgTable(
  "compliance_rules",
  {
    id: serial("id").primaryKey(),
    ruleCode: varchar("rule_code", { length: 50 }).notNull().unique(),
    ruleType: varchar("rule_type", { length: 50 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    conditions: jsonb("conditions").notNull(),
    actions: jsonb("actions").notNull(),
    severity: varchar("severity", { length: 20 }).notNull().default("medium"),
    isActive: boolean("is_active").notNull().default(true),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
);

export const complianceAlerts = pgTable(
  "compliance_alerts",
  {
    id: serial("id").primaryKey(),
    ruleId: integer("rule_id"),
    alertType: complianceAlertTypeEnum("alert_type").notNull(),
    severity: varchar("severity", { length: 20 }).notNull().default("medium"),
    status: complianceAlertStatusEnum("status").notNull().default("open"),
    userId: integer("user_id"),
    transactionId: varchar("transaction_id", { length: 100 }),
    description: text("description").notNull(),
    details: jsonb("details"),
    assignedTo: integer("assigned_to"),
    resolvedBy: integer("resolved_by"),
    resolvedAt: timestamp("resolved_at"),
    resolution: text("resolution"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index("compliance_alerts_status_idx").on(t.status),
    alertTypeIdx: index("compliance_alerts_type_idx").on(t.alertType),
    userIdIdx: index("compliance_alerts_user_id_idx").on(t.userId),
  }),
);

export const sanctionsScreeningResults = pgTable(
  "sanctions_screening_results",
  {
    id: serial("id").primaryKey(),
    entityType: varchar("entity_type", { length: 30 }).notNull(), // user, establishment, transaction
    entityId: varchar("entity_id", { length: 100 }).notNull(),
    screeningProvider: varchar("screening_provider", { length: 100 }).notNull(),
    isMatch: boolean("is_match").notNull().default(false),
    matchScore: numeric("match_score", { precision: 5, scale: 2 }),
    matchedLists: jsonb("matched_lists"),
    matchedEntities: jsonb("matched_entities"),
    status: varchar("status", { length: 20 }).notNull().default("clear"),
    reviewedBy: integer("reviewed_by"),
    reviewedAt: timestamp("reviewed_at"),
    metadata: jsonb("metadata"),
    screenedAt: timestamp("screened_at").notNull().defaultNow(),
  },
  (t) => ({
    entityIdx: index("sanctions_entity_idx").on(t.entityType, t.entityId),
    isMatchIdx: index("sanctions_is_match_idx").on(t.isMatch),
  }),
);

export const amlTransactionFlags = pgTable(
  "aml_transaction_flags",
  {
    id: serial("id").primaryKey(),
    transactionId: varchar("transaction_id", { length: 100 }).notNull(),
    userId: integer("user_id").notNull(),
    flagType: varchar("flag_type", { length: 50 }).notNull(),
    riskScore: numeric("risk_score", { precision: 5, scale: 2 }).notNull(),
    reasons: jsonb("reasons").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("flagged"),
    reviewedBy: integer("reviewed_by"),
    reviewedAt: timestamp("reviewed_at"),
    resolution: text("resolution"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    transactionIdIdx: index("aml_flags_transaction_id_idx").on(t.transactionId),
    userIdIdx: index("aml_flags_user_id_idx").on(t.userId),
  }),
);

export const ctrReports = pgTable(
  "ctr_reports",
  {
    id: serial("id").primaryKey(),
    reportReference: varchar("report_reference", { length: 100 }).notNull().unique(),
    userId: integer("user_id").notNull(),
    transactionIds: jsonb("transaction_ids").notNull(),
    totalAmount: numeric("total_amount", { precision: 20, scale: 8 }).notNull(),
    currency: varchar("currency", { length: 10 }).notNull(),
    reportingPeriod: varchar("reporting_period", { length: 20 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    submittedAt: timestamp("submitted_at"),
    filingReference: varchar("filing_reference", { length: 200 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
);

export const sarReports = pgTable(
  "sar_reports",
  {
    id: serial("id").primaryKey(),
    reportReference: varchar("report_reference", { length: 100 }).notNull().unique(),
    userId: integer("user_id").notNull(),
    suspiciousActivityType: varchar("suspicious_activity_type", { length: 100 }).notNull(),
    description: text("description").notNull(),
    transactionIds: jsonb("transaction_ids"),
    totalAmount: numeric("total_amount", { precision: 20, scale: 8 }),
    currency: varchar("currency", { length: 10 }),
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    submittedAt: timestamp("submitted_at"),
    filingReference: varchar("filing_reference", { length: 200 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
);

// ─── 7. Document Storage ──────────────────────────────────────────────────────

export const documentStorage = pgTable(
  "document_storage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: integer("user_id"),
    establishmentId: integer("establishment_id"),
    documentType: varchar("document_type", { length: 100 }).notNull(),
    fileName: varchar("file_name", { length: 500 }).notNull(),
    fileSize: integer("file_size").notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    storageKey: varchar("storage_key", { length: 500 }).notNull(),
    storageProvider: varchar("storage_provider", { length: 50 }).notNull().default("s3"),
    checksum: varchar("checksum", { length: 100 }),
    isVerified: boolean("is_verified").notNull().default(false),
    verifiedBy: integer("verified_by"),
    verifiedAt: timestamp("verified_at"),
    expiresAt: timestamp("expires_at"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    userIdIdx: index("document_storage_user_id_idx").on(t.userId),
    documentTypeIdx: index("document_storage_type_idx").on(t.documentType),
  }),
);

export const kybDocuments = pgTable(
  "kyb_documents",
  {
    id: serial("id").primaryKey(),
    establishmentId: integer("establishment_id").notNull(),
    documentId: uuid("document_id").notNull(),
    documentType: varchar("document_type", { length: 100 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    reviewedBy: integer("reviewed_by"),
    reviewedAt: timestamp("reviewed_at"),
    rejectionReason: text("rejection_reason"),
    expiresAt: timestamp("expires_at"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    establishmentIdIdx: index("kyb_docs_establishment_id_idx").on(t.establishmentId),
  }),
);

export const merchantKybRecords = pgTable(
  "merchant_kyb_records",
  {
    id: serial("id").primaryKey(),
    establishmentId: integer("establishment_id").notNull(),
    kybStatus: varchar("kyb_status", { length: 30 }).notNull().default("pending"),
    businessName: varchar("business_name", { length: 300 }),
    registrationNumber: varchar("registration_number", { length: 100 }),
    taxId: varchar("tax_id", { length: 100 }),
    businessType: varchar("business_type", { length: 100 }),
    incorporationDate: timestamp("incorporation_date"),
    country: varchar("country", { length: 3 }),
    riskLevel: varchar("risk_level", { length: 20 }).notNull().default("medium"),
    reviewedBy: integer("reviewed_by"),
    reviewedAt: timestamp("reviewed_at"),
    approvedAt: timestamp("approved_at"),
    rejectionReason: text("rejection_reason"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    establishmentIdIdx: uniqueIndex("merchant_kyb_establishment_idx").on(t.establishmentId),
  }),
);

// ─── 8. Payments ──────────────────────────────────────────────────────────────

export const paymentMethods = pgTable(
  "payment_methods",
  {
    id: serial("id").primaryKey(),
    type: paymentMethodTypeEnum("type").notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    provider: varchar("provider", { length: 100 }),
    isActive: boolean("is_active").notNull().default(true),
    supportedCurrencies: jsonb("supported_currencies").notNull().default([]),
    fees: jsonb("fees"),
    limits: jsonb("limits"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
);

export const savedPaymentMethods = pgTable(
  "saved_payment_methods",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    methodType: paymentMethodTypeEnum("method_type").notNull(),
    nickname: varchar("nickname", { length: 100 }),
    maskedIdentifier: varchar("masked_identifier", { length: 50 }),
    providerToken: varchar("provider_token", { length: 500 }),
    isDefault: boolean("is_default").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    expiresAt: timestamp("expires_at"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    userIdIdx: index("saved_payment_methods_user_id_idx").on(t.userId),
  }),
);

export const paymentIntents = pgTable(
  "payment_intents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: integer("user_id").notNull(),
    amount: numeric("amount", { precision: 20, scale: 8 }).notNull(),
    currency: varchar("currency", { length: 10 }).notNull(),
    status: paymentIntentStatusEnum("status").notNull().default("created"),
    paymentMethodId: integer("payment_method_id"),
    savedMethodId: integer("saved_method_id"),
    description: text("description"),
    metadata: jsonb("metadata"),
    clientSecret: varchar("client_secret", { length: 200 }),
    providerIntentId: varchar("provider_intent_id", { length: 200 }),
    idempotencyKey: varchar("idempotency_key", { length: 200 }),
    expiresAt: timestamp("expires_at"),
    confirmedAt: timestamp("confirmed_at"),
    cancelledAt: timestamp("cancelled_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    userIdIdx: index("payment_intents_user_id_idx").on(t.userId),
    statusIdx: index("payment_intents_status_idx").on(t.status),
    idempotencyKeyIdx: uniqueIndex("payment_intents_idempotency_idx").on(t.idempotencyKey),
  }),
);

export const refunds = pgTable(
  "refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: varchar("transaction_id", { length: 100 }).notNull(),
    userId: integer("user_id").notNull(),
    amount: numeric("amount", { precision: 20, scale: 8 }).notNull(),
    currency: varchar("currency", { length: 10 }).notNull(),
    reason: text("reason").notNull(),
    status: refundStatusEnum("status").notNull().default("pending"),
    refundReference: varchar("refund_reference", { length: 200 }),
    processedBy: integer("processed_by"),
    processedAt: timestamp("processed_at"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    transactionIdIdx: index("refunds_transaction_id_idx").on(t.transactionId),
    userIdIdx: index("refunds_user_id_idx").on(t.userId),
    statusIdx: index("refunds_status_idx").on(t.status),
  }),
);

export const chargebacks = pgTable(
  "chargebacks",
  {
    id: serial("id").primaryKey(),
    transactionId: varchar("transaction_id", { length: 100 }).notNull(),
    userId: integer("user_id").notNull(),
    amount: numeric("amount", { precision: 20, scale: 8 }).notNull(),
    currency: varchar("currency", { length: 10 }).notNull(),
    reason: varchar("reason", { length: 100 }).notNull(),
    status: varchar("status", { length: 30 }).notNull().default("received"),
    caseReference: varchar("case_reference", { length: 200 }),
    dueDate: timestamp("due_date"),
    resolvedAt: timestamp("resolved_at"),
    resolution: text("resolution"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
);

export const disputeRecords = pgTable(
  "dispute_records",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    transactionId: varchar("transaction_id", { length: 100 }),
    disputeType: varchar("dispute_type", { length: 50 }).notNull(),
    description: text("description").notNull(),
    status: disputeStatusEnum("status").notNull().default("open"),
    priority: varchar("priority", { length: 20 }).notNull().default("normal"),
    assignedTo: integer("assigned_to"),
    resolvedBy: integer("resolved_by"),
    resolvedAt: timestamp("resolved_at"),
    resolution: text("resolution"),
    attachments: jsonb("attachments"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    userIdIdx: index("dispute_records_user_id_idx").on(t.userId),
    statusIdx: index("dispute_records_status_idx").on(t.status),
  }),
);

// ─── 9. POS & NFC ─────────────────────────────────────────────────────────────

export const posTerminals = pgTable(
  "pos_terminals",
  {
    id: serial("id").primaryKey(),
    terminalId: varchar("terminal_id", { length: 100 }).notNull().unique(),
    establishmentId: integer("establishment_id").notNull(),
    serialNumber: varchar("serial_number", { length: 100 }),
    model: varchar("model", { length: 100 }),
    manufacturer: varchar("manufacturer", { length: 100 }),
    firmwareVersion: varchar("firmware_version", { length: 50 }),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    lastSeenAt: timestamp("last_seen_at"),
    location: varchar("location", { length: 200 }),
    agentId: integer("agent_id"),
    groupId: integer("group_id"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  
  appVersion: varchar("app_version", { length: 50 }),
  configJson: jsonb("config_json"),
  deletedAt: timestamp("deleted_at"),
  simIccid: varchar("sim_iccid", { length: 100 }),
},
  (t) => ({
    establishmentIdIdx: index("pos_terminals_establishment_id_idx").on(t.establishmentId),
    terminalIdIdx: uniqueIndex("pos_terminals_terminal_id_idx").on(t.terminalId),
  }),
);

export const posTransactions = pgTable(
  "pos_transactions",
  {
    id: serial("id").primaryKey(),
    terminalId: integer("terminal_id").notNull(),
    transactionId: varchar("transaction_id", { length: 100 }).notNull(),
    amount: numeric("amount", { precision: 20, scale: 8 }).notNull(),
    currency: varchar("currency", { length: 10 }).notNull(),
    paymentMethod: varchar("payment_method", { length: 50 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("completed"),
    receiptNumber: varchar("receipt_number", { length: 100 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    terminalIdIdx: index("pos_transactions_terminal_id_idx").on(t.terminalId),
    transactionIdIdx: index("pos_transactions_tx_id_idx").on(t.transactionId),
  }),
);

export const nfcTapEvents = pgTable(
  "nfc_tap_events",
  {
    id: serial("id").primaryKey(),
    terminalId: integer("terminal_id"),
    userId: integer("user_id"),
    tapType: varchar("tap_type", { length: 30 }).notNull(), // payment, check_in, loyalty
    amount: numeric("amount", { precision: 20, scale: 8 }),
    currency: varchar("currency", { length: 10 }),
    status: varchar("status", { length: 20 }).notNull().default("success"),
    deviceId: varchar("device_id", { length: 200 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    userIdIdx: index("nfc_tap_events_user_id_idx").on(t.userId),
    createdAtIdx: index("nfc_tap_events_created_at_idx").on(t.createdAt),
  }),
);

export const qrCodeRegistry = pgTable(
  "qr_code_registry",
  {
    id: serial("id").primaryKey(),
    qrCode: varchar("qr_code", { length: 500 }).notNull().unique(),
    qrType: varchar("qr_type", { length: 30 }).notNull(), // payment, merchant, booking, loyalty
    userId: integer("user_id"),
    establishmentId: integer("establishment_id"),
    amount: numeric("amount", { precision: 20, scale: 8 }),
    currency: varchar("currency", { length: 10 }),
    isOneTime: boolean("is_one_time").notNull().default(false),
    usedCount: integer("used_count").notNull().default(0),
    maxUses: integer("max_uses"),
    isActive: boolean("is_active").notNull().default(true),
    expiresAt: timestamp("expires_at"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    qrCodeIdx: uniqueIndex("qr_code_registry_code_idx").on(t.qrCode),
    userIdIdx: index("qr_code_registry_user_id_idx").on(t.userId),
  }),
);

// ─── 10. Digital Currencies ───────────────────────────────────────────────────

export const cbdcAccounts = pgTable(
  "cbdc_accounts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    accountNumber: varchar("account_number", { length: 100 }).notNull().unique(),
    accountType: cbdcAccountTypeEnum("account_type").notNull().default("retail"),
    currency: varchar("currency", { length: 10 }).notNull().default("eNGN"),
    balance: numeric("balance", { precision: 20, scale: 8 }).notNull().default("0"),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    cbcRegistrationId: varchar("cbc_registration_id", { length: 100 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    userIdIdx: index("cbdc_accounts_user_id_idx").on(t.userId),
    accountNumberIdx: uniqueIndex("cbdc_accounts_number_idx").on(t.accountNumber),
  }),
);

export const cbdcTransactions = pgTable(
  "cbdc_transactions",
  {
    id: serial("id").primaryKey(),
    fromAccountId: integer("from_account_id"),
    toAccountId: integer("to_account_id"),
    amount: numeric("amount", { precision: 20, scale: 8 }).notNull(),
    currency: varchar("currency", { length: 10 }).notNull().default("eNGN"),
    transactionType: varchar("transaction_type", { length: 50 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("completed"),
    cbcTransactionId: varchar("cbc_transaction_id", { length: 200 }),
    reference: varchar("reference", { length: 200 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    fromAccountIdx: index("cbdc_transactions_from_idx").on(t.fromAccountId),
    toAccountIdx: index("cbdc_transactions_to_idx").on(t.toAccountId),
  }),
);

export const enairaWallets = pgTable(
  "enaira_wallets",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    walletId: varchar("wallet_id", { length: 100 }).notNull().unique(),
    phoneNumber: varchar("phone_number", { length: 20 }).notNull(),
    balance: numeric("balance", { precision: 20, scale: 8 }).notNull().default("0"),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    tier: varchar("tier", { length: 20 }).notNull().default("basic"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    userIdIdx: uniqueIndex("enaira_wallets_user_id_idx").on(t.userId),
    walletIdIdx: uniqueIndex("enaira_wallets_wallet_id_idx").on(t.walletId),
  }),
);

export const enairaTransactions = pgTable(
  "enaira_transactions",
  {
    id: serial("id").primaryKey(),
    fromWalletId: integer("from_wallet_id"),
    toWalletId: integer("to_wallet_id"),
    amount: numeric("amount", { precision: 20, scale: 8 }).notNull(),
    transactionType: varchar("transaction_type", { length: 50 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("completed"),
    enairaTransactionId: varchar("enaira_transaction_id", { length: 200 }),
    reference: varchar("reference", { length: 200 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
);

export const cryptoWallets = pgTable(
  "crypto_wallets",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    network: cryptoNetworkEnum("network").notNull(),
    address: varchar("address", { length: 200 }).notNull(),
    isHot: boolean("is_hot").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    label: varchar("label", { length: 100 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    userIdIdx: index("crypto_wallets_user_id_idx").on(t.userId),
    addressIdx: uniqueIndex("crypto_wallets_address_idx").on(t.network, t.address),
  }),
);

export const cryptoTransactions = pgTable(
  "crypto_transactions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    walletId: integer("wallet_id"),
    network: cryptoNetworkEnum("network").notNull(),
    txHash: varchar("tx_hash", { length: 200 }),
    fromAddress: varchar("from_address", { length: 200 }),
    toAddress: varchar("to_address", { length: 200 }).notNull(),
    amount: numeric("amount", { precision: 30, scale: 18 }).notNull(),
    currency: varchar("currency", { length: 20 }).notNull(),
    fiatAmount: numeric("fiat_amount", { precision: 20, scale: 8 }),
    fiatCurrency: varchar("fiat_currency", { length: 10 }),
    transactionType: varchar("transaction_type", { length: 30 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    confirmations: integer("confirmations").notNull().default(0),
    gasUsed: numeric("gas_used", { precision: 30, scale: 18 }),
    gasFee: numeric("gas_fee", { precision: 30, scale: 18 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    confirmedAt: timestamp("confirmed_at"),
  },
  (t) => ({
    userIdIdx: index("crypto_transactions_user_id_idx").on(t.userId),
    txHashIdx: index("crypto_transactions_tx_hash_idx").on(t.txHash),
  }),
);

export const stablecoinPositions = pgTable(
  "stablecoin_positions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    currency: varchar("currency", { length: 20 }).notNull(), // USDT, USDC, BUSD, etc.
    network: cryptoNetworkEnum("network").notNull(),
    balance: numeric("balance", { precision: 30, scale: 18 }).notNull().default("0"),
    walletAddress: varchar("wallet_address", { length: 200 }),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    userIdIdx: index("stablecoin_positions_user_id_idx").on(t.userId),
    currencyNetworkIdx: index("stablecoin_positions_currency_network_idx").on(t.currency, t.network),
  }),
);

// ─── 11. Cross-Border Payments ────────────────────────────────────────────────

export const correspondentBanks = pgTable(
  "correspondent_banks",
  {
    id: serial("id").primaryKey(),
    bankName: varchar("bank_name", { length: 300 }).notNull(),
    swiftCode: varchar("swift_code", { length: 20 }).notNull().unique(),
    country: varchar("country", { length: 3 }).notNull(),
    currency: varchar("currency", { length: 10 }).notNull(),
    accountNumber: varchar("account_number", { length: 100 }),
    routingNumber: varchar("routing_number", { length: 50 }),
    isActive: boolean("is_active").notNull().default(true),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
);

export const crossBorderPayments = pgTable(
  "cross_border_payments",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    sendAmount: numeric("send_amount", { precision: 20, scale: 8 }).notNull(),
    sendCurrency: varchar("send_currency", { length: 10 }).notNull(),
    receiveAmount: numeric("receive_amount", { precision: 20, scale: 8 }).notNull(),
    receiveCurrency: varchar("receive_currency", { length: 10 }).notNull(),
    exchangeRate: numeric("exchange_rate", { precision: 20, scale: 8 }).notNull(),
    feeAmount: numeric("fee_amount", { precision: 20, scale: 8 }).notNull().default("0"),
    destinationCountry: varchar("destination_country", { length: 3 }).notNull(),
    paymentMethod: varchar("payment_method", { length: 50 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    providerReference: varchar("provider_reference", { length: 200 }),
    correspondentBankId: integer("correspondent_bank_id"),
    recipientName: varchar("recipient_name", { length: 300 }),
    recipientAccount: varchar("recipient_account", { length: 100 }),
    recipientBank: varchar("recipient_bank", { length: 300 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
  },
  (t) => ({
    userIdIdx: index("cross_border_payments_user_id_idx").on(t.userId),
    statusIdx: index("cross_border_payments_status_idx").on(t.status),
  }),
);

export const swiftMessages = pgTable(
  "swift_messages",
  {
    id: serial("id").primaryKey(),
    messageType: varchar("message_type", { length: 10 }).notNull(), // MT103, MT202, etc.
    uetr: varchar("uetr", { length: 100 }).unique(),
    senderBic: varchar("sender_bic", { length: 20 }).notNull(),
    receiverBic: varchar("receiver_bic", { length: 20 }).notNull(),
    amount: numeric("amount", { precision: 20, scale: 8 }).notNull(),
    currency: varchar("currency", { length: 10 }).notNull(),
    valueDate: timestamp("value_date"),
    status: varchar("status", { length: 20 }).notNull().default("sent"),
    rawMessage: text("raw_message"),
    crossBorderPaymentId: integer("cross_border_payment_id"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
);

export const sepaTransfers = pgTable(
  "sepa_transfers",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    amount: numeric("amount", { precision: 20, scale: 8 }).notNull(),
    currency: varchar("currency", { length: 10 }).notNull().default("EUR"),
    debtorIban: varchar("debtor_iban", { length: 50 }).notNull(),
    creditorIban: varchar("creditor_iban", { length: 50 }).notNull(),
    creditorName: varchar("creditor_name", { length: 300 }).notNull(),
    remittanceInfo: text("remittance_info"),
    endToEndId: varchar("end_to_end_id", { length: 100 }).unique(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    providerReference: varchar("provider_reference", { length: 200 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    settledAt: timestamp("settled_at"),
  },
);

export const achTransfers = pgTable(
  "ach_transfers",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    amount: numeric("amount", { precision: 20, scale: 8 }).notNull(),
    currency: varchar("currency", { length: 10 }).notNull().default("USD"),
    routingNumber: varchar("routing_number", { length: 20 }).notNull(),
    accountNumber: varchar("account_number", { length: 50 }).notNull(),
    accountType: varchar("account_type", { length: 20 }).notNull().default("checking"),
    transactionType: varchar("transaction_type", { length: 10 }).notNull(), // credit, debit
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    traceNumber: varchar("trace_number", { length: 50 }),
    batchId: varchar("batch_id", { length: 100 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    settledAt: timestamp("settled_at"),
  },
);

// ─── 12. Mobile Money & Agent Banking ────────────────────────────────────────

export const mobileMoneAccounts = pgTable(
  "mobile_money_accounts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    provider: mobileMoneProviderEnum("provider").notNull(),
    phoneNumber: varchar("phone_number", { length: 20 }).notNull(),
    accountName: varchar("account_name", { length: 300 }),
    isVerified: boolean("is_verified").notNull().default(false),
    isDefault: boolean("is_default").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    userIdIdx: index("mobile_money_accounts_user_id_idx").on(t.userId),
    phoneProviderIdx: uniqueIndex("mobile_money_phone_provider_idx").on(t.phoneNumber, t.provider),
  }),
);

export const mobileMoneTransactions = pgTable(
  "mobile_money_transactions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    accountId: integer("account_id").notNull(),
    transactionType: varchar("transaction_type", { length: 30 }).notNull(),
    amount: numeric("amount", { precision: 20, scale: 8 }).notNull(),
    currency: varchar("currency", { length: 10 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("completed"),
    providerReference: varchar("provider_reference", { length: 200 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    userIdIdx: index("mobile_money_tx_user_id_idx").on(t.userId),
    accountIdIdx: index("mobile_money_tx_account_id_idx").on(t.accountId),
  }),
);

export const agentFloatAccounts = pgTable(
  "agent_float_accounts",
  {
    id: serial("id").primaryKey(),
    agentUserId: integer("agent_user_id").notNull(),
    currency: varchar("currency", { length: 10 }).notNull(),
    balance: numeric("balance", { precision: 20, scale: 8 }).notNull().default("0"),
    minBalance: numeric("min_balance", { precision: 20, scale: 8 }).notNull().default("0"),
    maxBalance: numeric("max_balance", { precision: 20, scale: 8 }),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    agentUserIdIdx: uniqueIndex("agent_float_accounts_agent_currency_idx").on(t.agentUserId, t.currency),
  }),
);

export const agentCashPositions = pgTable(
  "agent_cash_positions",
  {
    id: serial("id").primaryKey(),
    agentUserId: integer("agent_user_id").notNull(),
    currency: varchar("currency", { length: 10 }).notNull(),
    cashInHand: numeric("cash_in_hand", { precision: 20, scale: 8 }).notNull().default("0"),
    cashInVault: numeric("cash_in_vault", { precision: 20, scale: 8 }).notNull().default("0"),
    lastReconciled: timestamp("last_reconciled"),
    metadata: jsonb("metadata"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
);

export const superAgentAccounts = pgTable(
  "super_agent_accounts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    agentCode: varchar("agent_code", { length: 50 }).notNull().unique(),
    networkSize: integer("network_size").notNull().default(0),
    totalFloat: numeric("total_float", { precision: 20, scale: 8 }).notNull().default("0"),
    currency: varchar("currency", { length: 10 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
);

export const cashInCashOutLog = pgTable(
  "cash_in_cash_out_log",
  {
    id: serial("id").primaryKey(),
    agentUserId: integer("agent_user_id").notNull(),
    customerId: integer("customer_id"),
    operationType: varchar("operation_type", { length: 20 }).notNull(), // cash_in, cash_out
    amount: numeric("amount", { precision: 20, scale: 8 }).notNull(),
    currency: varchar("currency", { length: 10 }).notNull(),
    fee: numeric("fee", { precision: 20, scale: 8 }).notNull().default("0"),
    status: varchar("status", { length: 20 }).notNull().default("completed"),
    reference: varchar("reference", { length: 200 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    agentUserIdIdx: index("cash_in_out_agent_user_id_idx").on(t.agentUserId),
    createdAtIdx: index("cash_in_out_created_at_idx").on(t.createdAt),
  }),
);

// ─── 13. Bill Payments & VAS ──────────────────────────────────────────────────

export const billPaymentProviders = pgTable(
  "bill_payment_providers",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 200 }).notNull(),
    category: varchar("category", { length: 50 }).notNull(), // electricity, water, internet, tv, etc.
    country: varchar("country", { length: 3 }).notNull(),
    providerCode: varchar("provider_code", { length: 50 }).notNull().unique(),
    isActive: boolean("is_active").notNull().default(true),
    logoUrl: varchar("logo_url", { length: 500 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
);

export const billPayments = pgTable(
  "bill_payments",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    providerId: integer("provider_id").notNull(),
    billReference: varchar("bill_reference", { length: 200 }).notNull(),
    amount: numeric("amount", { precision: 20, scale: 8 }).notNull(),
    currency: varchar("currency", { length: 10 }).notNull(),
    fee: numeric("fee", { precision: 20, scale: 8 }).notNull().default("0"),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    providerReference: varchar("provider_reference", { length: 200 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
  },
  (t) => ({
    userIdIdx: index("bill_payments_user_id_idx").on(t.userId),
    statusIdx: index("bill_payments_status_idx").on(t.status),
  }),
);

export const airtimePurchases = pgTable(
  "airtime_purchases",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    phoneNumber: varchar("phone_number", { length: 20 }).notNull(),
    network: varchar("network", { length: 50 }).notNull(),
    amount: numeric("amount", { precision: 20, scale: 8 }).notNull(),
    currency: varchar("currency", { length: 10 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    providerReference: varchar("provider_reference", { length: 200 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    userIdIdx: index("airtime_purchases_user_id_idx").on(t.userId),
  }),
);

export const dataBundlePurchases = pgTable(
  "data_bundle_purchases",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    phoneNumber: varchar("phone_number", { length: 20 }).notNull(),
    network: varchar("network", { length: 50 }).notNull(),
    bundleCode: varchar("bundle_code", { length: 100 }).notNull(),
    bundleDescription: varchar("bundle_description", { length: 300 }),
    amount: numeric("amount", { precision: 20, scale: 8 }).notNull(),
    currency: varchar("currency", { length: 10 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    providerReference: varchar("provider_reference", { length: 200 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
);

// ─── 14. Insurance ────────────────────────────────────────────────────────────

export const insuranceProducts = pgTable(
  "insurance_products",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 300 }).notNull(),
    category: varchar("category", { length: 50 }).notNull(), // travel, health, life, property
    provider: varchar("provider", { length: 200 }).notNull(),
    description: text("description"),
    premium: numeric("premium", { precision: 20, scale: 8 }).notNull(),
    currency: varchar("currency", { length: 10 }).notNull(),
    coverageAmount: numeric("coverage_amount", { precision: 20, scale: 8 }),
    durationDays: integer("duration_days"),
    isActive: boolean("is_active").notNull().default(true),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
);

export const insurancePolicies = pgTable(
  "insurance_policies",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    productId: integer("product_id").notNull(),
    policyNumber: varchar("policy_number", { length: 100 }).notNull().unique(),
    status: insuranceStatusEnum("status").notNull().default("active"),
    startDate: timestamp("start_date").notNull(),
    endDate: timestamp("end_date").notNull(),
    premiumPaid: numeric("premium_paid", { precision: 20, scale: 8 }).notNull(),
    currency: varchar("currency", { length: 10 }).notNull(),
    beneficiaries: jsonb("beneficiaries"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    userIdIdx: index("insurance_policies_user_id_idx").on(t.userId),
    statusIdx: index("insurance_policies_status_idx").on(t.status),
  }),
);

export const insuranceClaims = pgTable(
  "insurance_claims",
  {
    id: serial("id").primaryKey(),
    policyId: integer("policy_id").notNull(),
    userId: integer("user_id").notNull(),
    claimReference: varchar("claim_reference", { length: 100 }).notNull().unique(),
    claimType: varchar("claim_type", { length: 100 }).notNull(),
    claimAmount: numeric("claim_amount", { precision: 20, scale: 8 }).notNull(),
    approvedAmount: numeric("approved_amount", { precision: 20, scale: 8 }),
    currency: varchar("currency", { length: 10 }).notNull(),
    status: varchar("status", { length: 30 }).notNull().default("submitted"),
    description: text("description").notNull(),
    documents: jsonb("documents"),
    processedBy: integer("processed_by"),
    processedAt: timestamp("processed_at"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
);

// ─── 15. Investments ──────────────────────────────────────────────────────────

export const investmentProducts = pgTable(
  "investment_products",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 300 }).notNull(),
    category: varchar("category", { length: 50 }).notNull(), // fixed_deposit, mutual_fund, bonds, stocks
    provider: varchar("provider", { length: 200 }).notNull(),
    description: text("description"),
    minimumAmount: numeric("minimum_amount", { precision: 20, scale: 8 }).notNull(),
    maximumAmount: numeric("maximum_amount", { precision: 20, scale: 8 }),
    currency: varchar("currency", { length: 10 }).notNull(),
    expectedReturnRate: numeric("expected_return_rate", { precision: 8, scale: 4 }),
    tenorDays: integer("tenor_days"),
    riskLevel: varchar("risk_level", { length: 20 }).notNull().default("medium"),
    isActive: boolean("is_active").notNull().default(true),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
);

export const investmentAccounts = pgTable(
  "investment_accounts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    productId: integer("product_id").notNull(),
    accountReference: varchar("account_reference", { length: 100 }).notNull().unique(),
    principalAmount: numeric("principal_amount", { precision: 20, scale: 8 }).notNull(),
    currentValue: numeric("current_value", { precision: 20, scale: 8 }).notNull(),
    currency: varchar("currency", { length: 10 }).notNull(),
    status: investmentStatusEnum("status").notNull().default("active"),
    startDate: timestamp("start_date").notNull(),
    maturityDate: timestamp("maturity_date"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    userIdIdx: index("investment_accounts_user_id_idx").on(t.userId),
  }),
);

export const investmentTransactions = pgTable(
  "investment_transactions",
  {
    id: serial("id").primaryKey(),
    accountId: integer("account_id").notNull(),
    userId: integer("user_id").notNull(),
    transactionType: varchar("transaction_type", { length: 30 }).notNull(), // deposit, withdrawal, interest, dividend
    amount: numeric("amount", { precision: 20, scale: 8 }).notNull(),
    currency: varchar("currency", { length: 10 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("completed"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
);

// ─── 16. Savings & Micro-Loans ────────────────────────────────────────────────

export const savingsGoals = pgTable(
  "savings_goals",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    name: varchar("name", { length: 300 }).notNull(),
    targetAmount: numeric("target_amount", { precision: 20, scale: 8 }).notNull(),
    currentAmount: numeric("current_amount", { precision: 20, scale: 8 }).notNull().default("0"),
    currency: varchar("currency", { length: 10 }).notNull(),
    targetDate: timestamp("target_date"),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    autoSaveAmount: numeric("auto_save_amount", { precision: 20, scale: 8 }),
    autoSaveFrequency: varchar("auto_save_frequency", { length: 20 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    userIdIdx: index("savings_goals_user_id_idx").on(t.userId),
  }),
);

export const savingsTransactions = pgTable(
  "savings_transactions",
  {
    id: serial("id").primaryKey(),
    goalId: integer("goal_id").notNull(),
    userId: integer("user_id").notNull(),
    transactionType: varchar("transaction_type", { length: 20 }).notNull(), // deposit, withdrawal, interest
    amount: numeric("amount", { precision: 20, scale: 8 }).notNull(),
    currency: varchar("currency", { length: 10 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("completed"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
);

export const microLoanApplications = pgTable(
  "micro_loan_applications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    requestedAmount: numeric("requested_amount", { precision: 20, scale: 8 }).notNull(),
    currency: varchar("currency", { length: 10 }).notNull(),
    purpose: text("purpose").notNull(),
    tenorDays: integer("tenor_days").notNull(),
    status: varchar("status", { length: 30 }).notNull().default("submitted"),
    creditScore: integer("credit_score"),
    reviewedBy: integer("reviewed_by"),
    reviewedAt: timestamp("reviewed_at"),
    rejectionReason: text("rejection_reason"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    userIdIdx: index("micro_loan_applications_user_id_idx").on(t.userId),
    statusIdx: index("micro_loan_applications_status_idx").on(t.status),
  }),
);

export const microLoans = pgTable(
  "micro_loans",
  {
    id: serial("id").primaryKey(),
    applicationId: integer("application_id").notNull(),
    userId: integer("user_id").notNull(),
    loanReference: varchar("loan_reference", { length: 100 }).notNull().unique(),
    principalAmount: numeric("principal_amount", { precision: 20, scale: 8 }).notNull(),
    interestRate: numeric("interest_rate", { precision: 8, scale: 4 }).notNull(),
    totalRepayable: numeric("total_repayable", { precision: 20, scale: 8 }).notNull(),
    outstandingBalance: numeric("outstanding_balance", { precision: 20, scale: 8 }).notNull(),
    currency: varchar("currency", { length: 10 }).notNull(),
    status: loanStatusEnum("status").notNull().default("disbursed"),
    disbursedAt: timestamp("disbursed_at"),
    dueDate: timestamp("due_date").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    userIdIdx: index("micro_loans_user_id_idx").on(t.userId),
    statusIdx: index("micro_loans_status_idx").on(t.status),
  }),
);

export const loanRepayments = pgTable(
  "loan_repayments",
  {
    id: serial("id").primaryKey(),
    loanId: integer("loan_id").notNull(),
    userId: integer("user_id").notNull(),
    amount: numeric("amount", { precision: 20, scale: 8 }).notNull(),
    principalPortion: numeric("principal_portion", { precision: 20, scale: 8 }).notNull(),
    interestPortion: numeric("interest_portion", { precision: 20, scale: 8 }).notNull(),
    currency: varchar("currency", { length: 10 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("completed"),
    paymentReference: varchar("payment_reference", { length: 200 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
);

export const creditScores = pgTable(
  "credit_scores",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    score: integer("score").notNull(),
    scoreModel: varchar("score_model", { length: 50 }).notNull().default("internal"),
    factors: jsonb("factors"),
    band: varchar("band", { length: 20 }).notNull(), // excellent, good, fair, poor
    provider: varchar("provider", { length: 100 }),
    validUntil: timestamp("valid_until"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    userIdIdx: index("credit_scores_user_id_idx").on(t.userId),
  }),
);

export const creditBureauReports = pgTable(
  "credit_bureau_reports",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    bureau: varchar("bureau", { length: 100 }).notNull(),
    reportData: jsonb("report_data").notNull(),
    creditScore: integer("credit_score"),
    status: varchar("status", { length: 20 }).notNull().default("received"),
    requestedBy: integer("requested_by"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
);

// ─── 17. Analytics & Metrics ──────────────────────────────────────────────────

export const merchantAnalytics = pgTable(
  "merchant_analytics",
  {
    id: serial("id").primaryKey(),
    establishmentId: integer("establishment_id").notNull(),
    period: varchar("period", { length: 20 }).notNull(), // daily, weekly, monthly
    periodStart: timestamp("period_start").notNull(),
    periodEnd: timestamp("period_end").notNull(),
    totalTransactions: integer("total_transactions").notNull().default(0),
    totalVolume: numeric("total_volume", { precision: 20, scale: 8 }).notNull().default("0"),
    totalFees: numeric("total_fees", { precision: 20, scale: 8 }).notNull().default("0"),
    currency: varchar("currency", { length: 10 }).notNull(),
    uniqueCustomers: integer("unique_customers").notNull().default(0),
    avgTransactionValue: numeric("avg_transaction_value", { precision: 20, scale: 8 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    establishmentPeriodIdx: uniqueIndex("merchant_analytics_establishment_period_idx").on(
      t.establishmentId, t.period, t.periodStart,
    ),
  }),
);

export const userAnalytics = pgTable(
  "user_analytics",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    period: varchar("period", { length: 20 }).notNull(),
    periodStart: timestamp("period_start").notNull(),
    periodEnd: timestamp("period_end").notNull(),
    totalTransactions: integer("total_transactions").notNull().default(0),
    totalVolume: numeric("total_volume", { precision: 20, scale: 8 }).notNull().default("0"),
    currency: varchar("currency", { length: 10 }).notNull(),
    loginCount: integer("login_count").notNull().default(0),
    loyaltyPointsEarned: integer("loyalty_points_earned").notNull().default(0),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    userPeriodIdx: uniqueIndex("user_analytics_user_period_idx").on(
      t.userId, t.period, t.periodStart,
    ),
  }),
);

export const platformMetrics = pgTable(
  "platform_metrics",
  {
    id: serial("id").primaryKey(),
    metricName: varchar("metric_name", { length: 200 }).notNull(),
    metricValue: numeric("metric_value", { precision: 30, scale: 8 }).notNull(),
    metricUnit: varchar("metric_unit", { length: 50 }),
    dimensions: jsonb("dimensions"),
    recordedAt: timestamp("recorded_at").notNull().defaultNow(),
  },
  (t) => ({
    metricNameIdx: index("platform_metrics_name_idx").on(t.metricName),
    recordedAtIdx: index("platform_metrics_recorded_at_idx").on(t.recordedAt),
  }),
);

export const slaMetrics = pgTable(
  "sla_metrics",
  {
    id: serial("id").primaryKey(),
    service: varchar("service", { length: 100 }).notNull(),
    endpoint: varchar("endpoint", { length: 300 }),
    periodStart: timestamp("period_start").notNull(),
    periodEnd: timestamp("period_end").notNull(),
    uptimePercent: numeric("uptime_percent", { precision: 8, scale: 4 }),
    avgLatencyMs: numeric("avg_latency_ms", { precision: 10, scale: 2 }),
    p95LatencyMs: numeric("p95_latency_ms", { precision: 10, scale: 2 }),
    p99LatencyMs: numeric("p99_latency_ms", { precision: 10, scale: 2 }),
    errorRate: numeric("error_rate", { precision: 8, scale: 4 }),
    totalRequests: integer("total_requests").notNull().default(0),
    failedRequests: integer("failed_requests").notNull().default(0),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    serviceIdx: index("sla_metrics_service_idx").on(t.service),
    periodIdx: index("sla_metrics_period_idx").on(t.periodStart),
  }),
);

export const systemHealthLogs = pgTable(
  "system_health_logs",
  {
    id: serial("id").primaryKey(),
    service: varchar("service", { length: 100 }).notNull(),
    status: varchar("status", { length: 20 }).notNull(), // healthy, degraded, down
    details: jsonb("details"),
    checkedAt: timestamp("checked_at").notNull().defaultNow(),
  },
  (t) => ({
    serviceIdx: index("system_health_logs_service_idx").on(t.service),
    checkedAtIdx: index("system_health_logs_checked_at_idx").on(t.checkedAt),
  }),
);

export const maintenanceWindows = pgTable(
  "maintenance_windows",
  {
    id: serial("id").primaryKey(),
    title: varchar("title", { length: 300 }).notNull(),
    description: text("description"),
    affectedServices: jsonb("affected_services").notNull().default([]),
    startAt: timestamp("start_at").notNull(),
    endAt: timestamp("end_at").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("scheduled"),
    createdBy: integer("created_by").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
);

// ─── 18. GDPR & Consent ───────────────────────────────────────────────────────

export const gdprDeletionRequests = pgTable(
  "gdpr_deletion_requests",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    requestType: gdprRequestTypeEnum("request_type").notNull(),
    status: gdprRequestStatusEnum("status").notNull().default("pending"),
    reason: text("reason"),
    scheduledDeletionAt: timestamp("scheduled_deletion_at"),
    processedAt: timestamp("processed_at"),
    processedBy: integer("processed_by"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    userIdIdx: index("gdpr_deletion_requests_user_id_idx").on(t.userId),
    statusIdx: index("gdpr_deletion_requests_status_idx").on(t.status),
  }),
);

export const dataExportRequests = pgTable(
  "data_export_requests",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    status: gdprRequestStatusEnum("status").notNull().default("pending"),
    exportFormat: varchar("export_format", { length: 20 }).notNull().default("json"),
    downloadUrl: text("download_url"),
    expiresAt: timestamp("expires_at"),
    processedAt: timestamp("processed_at"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
);

export const consentRecords = pgTable(
  "consent_records",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    consentType: varchar("consent_type", { length: 100 }).notNull(),
    version: varchar("version", { length: 20 }).notNull(),
    isGranted: boolean("is_granted").notNull(),
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata"),
    grantedAt: timestamp("granted_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    userIdIdx: index("consent_records_user_id_idx").on(t.userId),
    consentTypeIdx: index("consent_records_consent_type_idx").on(t.consentType),
  }),
);

export const privacyPolicyVersions = pgTable(
  "privacy_policy_versions",
  {
    id: serial("id").primaryKey(),
    version: varchar("version", { length: 20 }).notNull().unique(),
    content: text("content").notNull(),
    summary: text("summary"),
    effectiveDate: timestamp("effective_date").notNull(),
    isActive: boolean("is_active").notNull().default(false),
    createdBy: integer("created_by"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
);

export const termsVersions = pgTable(
  "terms_versions",
  {
    id: serial("id").primaryKey(),
    version: varchar("version", { length: 20 }).notNull().unique(),
    content: text("content").notNull(),
    summary: text("summary"),
    effectiveDate: timestamp("effective_date").notNull(),
    isActive: boolean("is_active").notNull().default(false),
    createdBy: integer("created_by"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
);

export const userConsents = pgTable(
  "user_consents",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    privacyPolicyVersion: varchar("privacy_policy_version", { length: 20 }),
    termsVersion: varchar("terms_version", { length: 20 }),
    marketingConsent: boolean("marketing_consent").notNull().default(false),
    analyticsConsent: boolean("analytics_consent").notNull().default(false),
    thirdPartyConsent: boolean("third_party_consent").notNull().default(false),
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    userIdIdx: uniqueIndex("user_consents_user_id_idx").on(t.userId),
  }),
);

// ─── 19. Audit Trail Archive ──────────────────────────────────────────────────

export const auditTrailArchive = pgTable(
  "audit_trail_archive",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    originalId: integer("original_id"),
    userId: integer("user_id"),
    action: varchar("action", { length: 200 }).notNull(),
    resource: varchar("resource", { length: 100 }).notNull(),
    resourceId: varchar("resource_id", { length: 100 }),
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: text("user_agent"),
    oldValues: jsonb("old_values"),
    newValues: jsonb("new_values"),
    metadata: jsonb("metadata"),
    archivedAt: timestamp("archived_at").notNull().defaultNow(),
    originalCreatedAt: timestamp("original_created_at"),
  },
  (t) => ({
    userIdIdx: index("audit_trail_archive_user_id_idx").on(t.userId),
    resourceIdx: index("audit_trail_archive_resource_idx").on(t.resource),
    archivedAtIdx: index("audit_trail_archive_archived_at_idx").on(t.archivedAt),
  }),
);

// ─── 20. Tourism Additions ────────────────────────────────────────────────────

export const establishmentReviews = pgTable(
  "establishment_reviews",
  {
    id: serial("id").primaryKey(),
    establishmentId: integer("establishment_id").notNull(),
    userId: integer("user_id").notNull(),
    bookingId: integer("booking_id"),
    rating: integer("rating").notNull(), // 1-5
    title: varchar("title", { length: 300 }),
    body: text("body"),
    photos: jsonb("photos"),
    isVerified: boolean("is_verified").notNull().default(false),
    isPublished: boolean("is_published").notNull().default(true),
    helpfulCount: integer("helpful_count").notNull().default(0),
    reportCount: integer("report_count").notNull().default(0),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    establishmentIdIdx: index("establishment_reviews_establishment_id_idx").on(t.establishmentId),
    userIdIdx: index("establishment_reviews_user_id_idx").on(t.userId),
  }),
);

export const touristDealBookings = pgTable(
  "tourist_deal_bookings",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    dealId: integer("deal_id").notNull(),
    quantity: integer("quantity").notNull().default(1),
    totalAmount: numeric("total_amount", { precision: 20, scale: 8 }).notNull(),
    currency: varchar("currency", { length: 10 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    paymentIntentId: uuid("payment_intent_id"),
    voucherCode: varchar("voucher_code", { length: 100 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    userIdIdx: index("tourist_deal_bookings_user_id_idx").on(t.userId),
    dealIdIdx: index("tourist_deal_bookings_deal_id_idx").on(t.dealId),
  }),
);

export const dealRedemptions = pgTable(
  "deal_redemptions",
  {
    id: serial("id").primaryKey(),
    bookingId: integer("booking_id").notNull(),
    userId: integer("user_id").notNull(),
    dealId: integer("deal_id").notNull(),
    redemptionCode: varchar("redemption_code", { length: 100 }).notNull().unique(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    redeemedAt: timestamp("redeemed_at"),
    expiresAt: timestamp("expires_at"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
);

export const voucherCodes = pgTable(
  "voucher_codes",
  {
    id: serial("id").primaryKey(),
    code: varchar("code", { length: 100 }).notNull().unique(),
    voucherType: varchar("voucher_type", { length: 50 }).notNull(), // discount, cashback, free_item
    discountType: varchar("discount_type", { length: 20 }).notNull(), // percentage, fixed
    discountValue: numeric("discount_value", { precision: 20, scale: 8 }).notNull(),
    currency: varchar("currency", { length: 10 }),
    maxUses: integer("max_uses"),
    usedCount: integer("used_count").notNull().default(0),
    minOrderAmount: numeric("min_order_amount", { precision: 20, scale: 8 }),
    isActive: boolean("is_active").notNull().default(true),
    validFrom: timestamp("valid_from").notNull(),
    validTo: timestamp("valid_to"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    codeIdx: uniqueIndex("voucher_codes_code_idx").on(t.code),
  }),
);

export const voucherRedemptions = pgTable(
  "voucher_redemptions",
  {
    id: serial("id").primaryKey(),
    voucherId: integer("voucher_id").notNull(),
    userId: integer("user_id").notNull(),
    orderId: varchar("order_id", { length: 100 }),
    discountApplied: numeric("discount_applied", { precision: 20, scale: 8 }).notNull(),
    currency: varchar("currency", { length: 10 }).notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    voucherIdIdx: index("voucher_redemptions_voucher_id_idx").on(t.voucherId),
    userIdIdx: index("voucher_redemptions_user_id_idx").on(t.userId),
  }),
);
