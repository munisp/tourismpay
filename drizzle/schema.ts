import {
  bigint,
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
  decimal,
  index,
} from "drizzle-orm/pg-core";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum("user_role", ["user", "admin", "tourist", "merchant", "compliance_officer", "noc_operator", "settlement_officer", "bis_analyst"]);

export const bisStatusEnum = pgEnum("bis_status", [
  "pending",
  "processing",
  "completed",
  "flagged",
  "failed",
]);

export const bisRiskLevelEnum = pgEnum("bis_risk_level", [
  "low",
  "medium",
  "high",
  "critical",
]);

export const bisTierEnum = pgEnum("bis_tier", [
  "basic",
  "standard",
  "comprehensive",
]);

export const kybStatusEnum = pgEnum("kyb_status", [
  "draft",
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "suspended",
]);

export const establishmentTypeEnum = pgEnum("establishment_type", [
  "hotel",
  "restaurant",
  "concert_venue",
  "safari_lodge",
  "tour_operator",
  "airline",
  "car_rental",
  "spa_wellness",
  "museum",
  "theme_park",
  "beach_resort",
  "conference_center",
  "nightclub",
  "sports_venue",
  "travel_agency",
]);

export const fraudAlertSeverityEnum = pgEnum("fraud_alert_severity", [
  "info",
  "low",
  "medium",
  "high",
  "critical",
]);

export const fraudAlertStatusEnum = pgEnum("fraud_alert_status", [
  "open",
  "investigating",
  "resolved",
  "false_positive",
]);

export const socAlertTypeEnum = pgEnum("soc_alert_type", [
  "intrusion",
  "anomaly",
  "policy_violation",
  "threat_intel",
  "compliance",
  "data_exfiltration",
]);

// ─── Core Users ───────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("open_id", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("login_method", { length: 64 }),
  role: userRoleEnum("role").default("user").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  lastSignedIn: timestamp("last_signed_in").defaultNow().notNull(),
  loginCount: integer("login_count").default(0).notNull(),
  onboardingCompleted: boolean("onboarding_completed").default(false).notNull(),
  theme: varchar("theme", { length: 16 }).default("dark"),
  preferredLanguage: varchar("preferred_language", { length: 8 }).default("en"),
  preferredCurrency: varchar("preferred_currency", { length: 8 }).default("USDC"),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Establishments (KYB) ─────────────────────────────────────────────────────

export const establishments = pgTable(
  "establishments",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    type: establishmentTypeEnum("type").notNull(),
    country: varchar("country", { length: 2 }).notNull(), // ISO 3166-1 alpha-2
    city: varchar("city", { length: 100 }),
    address: text("address"),
    registrationNumber: varchar("registration_number", { length: 100 }),
    taxId: varchar("tax_id", { length: 100 }),
    contactEmail: varchar("contact_email", { length: 320 }),
    contactPhone: varchar("contact_phone", { length: 30 }),
    website: varchar("website", { length: 500 }),
    kybStatus: kybStatusEnum("kyb_status").default("draft").notNull(),
    kybScore: integer("kyb_score"),
    kybNotes: text("kyb_notes"),
    ownerId: integer("owner_id").references(() => users.id),
    employeeCount: integer("employee_count"),
    annualRevenue: decimal("annual_revenue", { precision: 15, scale: 2 }),
    currency: varchar("currency", { length: 3 }).default("USD"),
    metadata: jsonb("metadata"),
    latitude: decimal("latitude", { precision: 10, scale: 7 }),
    longitude: decimal("longitude", { precision: 10, scale: 7 }),
    // Stripe Connect fields for merchant payouts
    stripeAccountId: varchar("stripe_account_id", { length: 128 }),
    stripeConnectStatus: varchar("stripe_connect_status", { length: 32 }).default("not_started"),
    stripePayoutsEnabled: boolean("stripe_payouts_enabled").default(false),
    stripeDetailsSubmitted: boolean("stripe_details_submitted").default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("est_country_idx").on(t.country),
    index("est_kyb_status_idx").on(t.kybStatus),
  ]
);
export type Establishment = typeof establishments.$inferSelect;
export type InsertEstablishment = typeof establishments.$inferInsert;

// ─── KYB Applications ─────────────────────────────────────────────────────────

export const kybApplications = pgTable(
  "kyb_applications",
  {
    id: serial("id").primaryKey(),
    establishmentId: integer("establishment_id")
      .references(() => establishments.id)
      .notNull(),
    submittedBy: integer("submitted_by").references(() => users.id),
    status: kybStatusEnum("status").default("draft").notNull(),
    currentStep: integer("current_step").default(1).notNull(),
    totalSteps: integer("total_steps").default(5).notNull(),
    documentsUploaded: jsonb("documents_uploaded").$type<string[]>().default([]),
    reviewNotes: text("review_notes"),
    reviewedBy: integer("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at"),
    complianceScore: integer("compliance_score"),
    riskFlags: jsonb("risk_flags").$type<string[]>().default([]),
    externalKybRef: varchar("external_kyb_ref", { length: 100 }), // ref to Go KYB service
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("kyb_est_idx").on(t.establishmentId),
    index("kyb_status_idx").on(t.status),
  ]
);

export type KybApplication = typeof kybApplications.$inferSelect;
export type InsertKybApplication = typeof kybApplications.$inferInsert;

// ─── BIS Investigations ───────────────────────────────────────────────────────

export const bisInvestigations = pgTable(
  "bis_investigations",
  {
    id: serial("id").primaryKey(),
    referenceId: varchar("reference_id", { length: 20 }).notNull().unique(), // BIS-YYYY-NNNN
    establishmentId: integer("establishment_id").references(
      () => establishments.id
    ),
    requestedBy: integer("requested_by").references(() => users.id),

    // Subject details
    // subjectType: 'individual' = staff/person check; 'entity' = company/establishment check
    subjectType: varchar("subject_type", { length: 20 }).default("individual").notNull(),
    subjectFullName: varchar("subject_full_name", { length: 255 }).notNull(),
    subjectDob: varchar("subject_dob", { length: 20 }),
    subjectNationality: varchar("subject_nationality", { length: 100 }),
    subjectNin: varchar("subject_nin", { length: 50 }),
    subjectPhone: varchar("subject_phone", { length: 30 }),
    subjectEmail: varchar("subject_email", { length: 320 }),
    subjectRole: varchar("subject_role", { length: 100 }),
    subjectCountry: varchar("subject_country", { length: 2 }),
    // Entity-specific fields (only populated when subjectType = 'entity')
    entityRegistrationNumber: varchar("entity_registration_number", { length: 100 }),
    entityType: varchar("entity_type", { length: 50 }), // e.g. hotel, safari_lodge, airline
    entityWebsite: varchar("entity_website", { length: 255 }),
    entityYearFounded: integer("entity_year_founded"),

    // Investigation config
    tier: bisTierEnum("tier").default("standard").notNull(),
    status: bisStatusEnum("status").default("pending").notNull(),
    riskLevel: bisRiskLevelEnum("risk_level"),
    riskScore: integer("risk_score"),

    // Results
    moduleResults: jsonb("module_results"),
    recommendations: jsonb("recommendations").$type<string[]>().default([]),
    reportUrl: text("report_url"),
    consentObtained: boolean("consent_obtained").default(false).notNull(),

    // Billing
    pricePaid: decimal("price_paid", { precision: 10, scale: 2 }),
    currency: varchar("currency", { length: 3 }).default("USD"),

    // Assignment
    assignedToId: integer("assigned_to_id").references(() => users.id),
    assignedToName: varchar("assigned_to_name", { length: 255 }),
    assignedAt: timestamp("assigned_at"),
    // SLA tracking
    dueAt: bigint("due_at", { mode: "number" }), // UTC ms timestamp when investigation is due
    slaHours: integer("sla_hours"),               // SLA window in hours (set at creation based on risk level)

    // External service ref
    externalBisRef: varchar("external_bis_ref", { length: 100 }),
    // PaymentSwitch integration: linked transaction for fraud check
    linkedTransactionId: varchar("linked_transaction_id", { length: 100 }),
    // Bundle: if this individual investigation was created as part of an entity investigation bundle
    linkedEntityInvestigationId: integer("linked_entity_investigation_id"),

    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("bis_status_idx").on(t.status),
    index("bis_risk_idx").on(t.riskLevel),
    index("bis_est_idx").on(t.establishmentId),
    index("bis_ref_idx").on(t.referenceId),
  ]
);

export type BisInvestigation = typeof bisInvestigations.$inferSelect;
export type InsertBisInvestigation = typeof bisInvestigations.$inferInsert;

// ─── BIS Directors (linked to entity investigations) ─────────────────────────
export const bisDirectors = pgTable(
  "bis_directors",
  {
    id: serial("id").primaryKey(),
    entityInvestigationId: integer("entity_investigation_id")
      .notNull()
      .references(() => bisInvestigations.id, { onDelete: "cascade" }),
    fullName: varchar("full_name", { length: 255 }).notNull(),
    role: varchar("role", { length: 100 }).notNull().default("Director"), // Director | CEO | CFO | Secretary | Shareholder
    nationality: varchar("nationality", { length: 100 }),
    nin: varchar("nin", { length: 50 }),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 30 }),
    ownershipPercent: integer("ownership_percent"), // 0-100
    // Linked individual BIS investigation (created via bundle)
    linkedInvestigationId: integer("linked_investigation_id").references(
      () => bisInvestigations.id, { onDelete: "set null" }
    ),
    bundleDiscountPercent: integer("bundle_discount_percent").notNull().default(20),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("bis_directors_entity_idx").on(t.entityInvestigationId),
  ]
);
export type BisDirector = typeof bisDirectors.$inferSelect;
export type InsertBisDirector = typeof bisDirectors.$inferInsert;

// ─── Fraud Alerts ─────────────────────────────────────────────────────────────

export const fraudAlerts = pgTable(
  "fraud_alerts",
  {
    id: serial("id").primaryKey(),
    alertId: varchar("alert_id", { length: 30 }).notNull().unique(),
    transactionId: varchar("transaction_id", { length: 100 }),
    establishmentId: integer("establishment_id").references(
      () => establishments.id
    ),
    country: varchar("country", { length: 2 }),
    severity: fraudAlertSeverityEnum("severity").notNull(),
    status: fraudAlertStatusEnum("status").default("open").notNull(),
    ruleTriggered: varchar("rule_triggered", { length: 100 }),
    description: text("description"),
    amount: decimal("amount", { precision: 15, scale: 2 }),
    currency: varchar("currency", { length: 3 }),
    gnnScore: decimal("gnn_score", { precision: 5, scale: 2 }),
    metadata: jsonb("metadata"),
    resolvedBy: integer("resolved_by").references(() => users.id),
    resolvedAt: timestamp("resolved_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("fraud_severity_idx").on(t.severity),
    index("fraud_status_idx").on(t.status),
    index("fraud_created_idx").on(t.createdAt),
  ]
);

export type FraudAlert = typeof fraudAlerts.$inferSelect;
export type InsertFraudAlert = typeof fraudAlerts.$inferInsert;

// ─── SOC Alerts ───────────────────────────────────────────────────────────────

export const socAlerts = pgTable(
  "soc_alerts",
  {
    id: serial("id").primaryKey(),
    alertId: varchar("alert_id", { length: 30 }).notNull().unique(),
    type: socAlertTypeEnum("type").notNull(),
    severity: fraudAlertSeverityEnum("severity").notNull(),
    status: fraudAlertStatusEnum("status").default("open").notNull(),
    source: varchar("source", { length: 100 }), // e.g. "wazuh", "opencti", "opa"
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    affectedSystem: varchar("affected_system", { length: 100 }),
    sourceIp: varchar("source_ip", { length: 45 }),
    mitreTactic: varchar("mitre_tactic", { length: 100 }),
    mitreId: varchar("mitre_id", { length: 20 }),
    rawPayload: jsonb("raw_payload"),
    resolvedBy: integer("resolved_by").references(() => users.id),
    resolvedAt: timestamp("resolved_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("soc_severity_idx").on(t.severity),
    index("soc_status_idx").on(t.status),
    index("soc_type_idx").on(t.type),
    index("soc_created_idx").on(t.createdAt),
  ]
);

export type SocAlert = typeof socAlerts.$inferSelect;
export type InsertSocAlert = typeof socAlerts.$inferInsert;

// ─── Tourism Events ───────────────────────────────────────────────────────────

export const tourismEvents = pgTable(
  "tourism_events",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    country: varchar("country", { length: 2 }).notNull(),
    city: varchar("city", { length: 100 }),
    category: varchar("category", { length: 50 }),
    expectedAttendees: integer("expected_attendees"),
    startDate: timestamp("start_date"),
    endDate: timestamp("end_date"),
    description: text("description"),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("event_country_idx").on(t.country),
    index("event_category_idx").on(t.category),
  ]
);

export type TourismEvent = typeof tourismEvents.$inferSelect;
export type InsertTourismEvent = typeof tourismEvents.$inferInsert;

// ─── KYB Documents ────────────────────────────────────────────────────────────

export const kybDocumentTypeEnum = pgEnum("kyb_document_type", [
  "certificate_of_incorporation",
  "business_license",
  "tax_certificate",
  "director_id",
  "proof_of_address",
  "bank_statement",
  "audited_accounts",
  "ownership_structure",
  "regulatory_approval",
  "other",
]);

export const kybDocumentStatusEnum = pgEnum("kyb_document_status", [
  "pending",
  "verified",
  "rejected",
  "expired",
]);

export const kybDocuments = pgTable(
  "kyb_documents",
  {
    id: serial("id").primaryKey(),
    applicationId: integer("application_id")
      .references(() => kybApplications.id)
      .notNull(),
    establishmentId: integer("establishment_id")
      .references(() => establishments.id)
      .notNull(),
    uploadedBy: integer("uploaded_by").references(() => users.id),
    documentType: kybDocumentTypeEnum("document_type").notNull(),
    status: kybDocumentStatusEnum("status").default("pending").notNull(),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    fileKey: varchar("file_key", { length: 500 }).notNull(),
    fileUrl: text("file_url").notNull(),
    mimeType: varchar("mime_type", { length: 100 }),
    fileSizeBytes: integer("file_size_bytes"),
    reviewNotes: text("review_notes"),
    reviewedBy: integer("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at"),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("kyb_doc_app_idx").on(t.applicationId),
    index("kyb_doc_est_idx").on(t.establishmentId),
    index("kyb_doc_type_idx").on(t.documentType),
    index("kyb_doc_status_idx").on(t.status),
  ]
);

export type KybDocument = typeof kybDocuments.$inferSelect;
export type InsertKybDocument = typeof kybDocuments.$inferInsert;

// ─── BIS Report Exports ───────────────────────────────────────────────────────

export const bisReportExports = pgTable(
  "bis_report_exports",
  {
    id: serial("id").primaryKey(),
    investigationId: integer("investigation_id")
      .references(() => bisInvestigations.id)
      .notNull(),
    generatedBy: integer("generated_by").references(() => users.id),
    fileKey: varchar("file_key", { length: 500 }).notNull(),
    fileUrl: text("file_url").notNull(),
    fileSizeBytes: integer("file_size_bytes"),
    llmSummary: text("llm_summary"),
    exportFormat: varchar("export_format", { length: 10 }).default("pdf").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("bis_export_inv_idx").on(t.investigationId),
  ]
);

export type BisReportExport = typeof bisReportExports.$inferSelect;
export type InsertBisReportExport = typeof bisReportExports.$inferInsert;

// ─── User Notifications ───────────────────────────────────────────────────────

export const notificationCategoryEnum = pgEnum("notification_category", [
  "kyb",
  "bis",
  "fraud",
  "soc",
  "system",
  "report",
  "wallet",
]);

export const userNotifications = pgTable(
  "user_notifications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id)
      .notNull(),
    category: notificationCategoryEnum("category").default("system").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    content: text("content").notNull(),
    actionUrl: varchar("action_url", { length: 500 }),
    actionLabel: varchar("action_label", { length: 100 }),
    isRead: boolean("is_read").default(false).notNull(),
    readAt: timestamp("read_at"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("notif_user_idx").on(t.userId),
    index("notif_read_idx").on(t.isRead),
    index("notif_created_idx").on(t.createdAt),
  ]
);

export type UserNotification = typeof userNotifications.$inferSelect;
export type InsertUserNotification = typeof userNotifications.$inferInsert;

// ─── Notification Preferences ─────────────────────────────────────────────────

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id)
      .notNull()
      .unique(),
    // Category toggles — default all enabled
    bisEnabled: boolean("bis_enabled").default(true).notNull(),
    kybEnabled: boolean("kyb_enabled").default(true).notNull(),
    fraudEnabled: boolean("fraud_enabled").default(true).notNull(),
    socEnabled: boolean("soc_enabled").default(true).notNull(),
    systemEnabled: boolean("system_enabled").default(true).notNull(),
    reportEnabled: boolean("report_enabled").default(true).notNull(),
    // Tourist-specific toggles
    wishlistExpiryAlerts: boolean("wishlist_expiry_alerts").default(true).notNull(),
    // Merchant sentiment alert threshold (0-100, null = disabled)
    sentimentAlertThreshold: integer("sentiment_alert_threshold"),
    // Delivery channel preferences
    inAppEnabled: boolean("in_app_enabled").default(true).notNull(),
    emailEnabled: boolean("email_enabled").default(false).notNull(),
    // Quiet hours (stored as HH:MM strings, null = no quiet hours)
    quietHoursStart: varchar("quiet_hours_start", { length: 5 }),
    quietHoursEnd: varchar("quiet_hours_end", { length: 5 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("notif_pref_user_idx").on(t.userId)]
);

export type NotificationPreferences = typeof notificationPreferences.$inferSelect;
export type InsertNotificationPreferences = typeof notificationPreferences.$inferInsert;

// ─── Audit Logs ───────────────────────────────────────────────────────────────
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    // Actor
    actorId: integer("actor_id").references(() => users.id),
    actorName: varchar("actor_name", { length: 255 }),
    actorEmail: varchar("actor_email", { length: 255 }),
    // Action details
    action: varchar("action", { length: 100 }).notNull(), // e.g. "kyb.document.approve"
    entityType: varchar("entity_type", { length: 100 }).notNull(), // e.g. "kyb_document"
    entityId: varchar("entity_id", { length: 100 }).notNull(),
    // Change tracking (JSON snapshots)
    before: jsonb("before"),
    after: jsonb("after"),
    // Context
    description: text("description"),
    ipAddress: varchar("ip_address", { length: 45 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("audit_actor_idx").on(t.actorId),
    index("audit_action_idx").on(t.action),
    index("audit_entity_idx").on(t.entityType, t.entityId),
    index("audit_created_idx").on(t.createdAt),
  ]
);
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

// ── Digital Wallet ────────────────────────────────────────────────────────────
export const walletBalances = pgTable("wallet_balances", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar("user_id", { length: 36 }).notNull(),
  currency: varchar("currency", { length: 20 }).notNull(),
  balance: decimal("balance", { precision: 20, scale: 6 }).notNull().default("0"),
  lockedBalance: decimal("locked_balance", { precision: 20, scale: 6 }).notNull().default("0"),
  walletAddress: varchar("wallet_address", { length: 100 }),
  network: varchar("network", { length: 50 }),
  createdAt: integer("created_at").notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
  updatedAt: integer("updated_at").notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const walletTransactions = pgTable("wallet_transactions", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar("user_id", { length: 36 }).notNull(),
  type: varchar("type", { length: 20 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  fromCurrency: varchar("from_currency", { length: 20 }).notNull(),
  toCurrency: varchar("to_currency", { length: 20 }),
  amount: decimal("amount", { precision: 20, scale: 6 }).notNull(),
  toAmount: decimal("to_amount", { precision: 20, scale: 6 }),
  fee: decimal("fee", { precision: 20, scale: 6 }).notNull().default("0"),
  counterparty: varchar("counterparty", { length: 200 }),
  counterpartyAddress: varchar("counterparty_address", { length: 100 }),
  reference: varchar("reference", { length: 100 }),
  note: text("note"),
  txHash: varchar("tx_hash", { length: 100 }),
  completedAt: integer("completed_at"),
  createdAt: integer("created_at").notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
});

// ─── Wallet Balance Alerts ─────────────────────────────────────────────────────
export const walletBalanceAlerts = pgTable("wallet_balance_alerts", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar("user_id", { length: 36 }).notNull(),
  currency: varchar("currency", { length: 20 }).notNull(),
  threshold: decimal("threshold", { precision: 20, scale: 6 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: integer("created_at").notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
  updatedAt: integer("updated_at").notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
});
export type WalletBalanceAlert = typeof walletBalanceAlerts.$inferSelect;
export type InsertWalletBalanceAlert = typeof walletBalanceAlerts.$inferInsert;

// ─── Loyalty ────────────────────────────────────────────────────────────────
export const loyaltyTierEnum = pgEnum("loyalty_tier", ["BRONZE", "SILVER", "GOLD", "PLATINUM"]);

export const loyaltyAccounts = pgTable("loyalty_accounts", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar("user_id", { length: 36 }).notNull().unique(),
  pointsBalance: integer("points_balance").notNull().default(0),
  tier: loyaltyTierEnum("tier").notNull().default("BRONZE"),
  lifetimePoints: integer("lifetime_points").notNull().default(0),
  // Tier downgrade protection: if set, the user's tier is protected until this timestamp.
  // Even if points_balance drops below the tier threshold, the tier is preserved.
  // After this date, a background job recalculates and applies the correct tier.
  tierProtectedUntil: bigint("tier_protected_until", { mode: "number" }),
  // Privacy: if true, user's name is masked as "Anonymous" on the public leaderboard
  leaderboardOptOut: boolean("leaderboard_opt_out").notNull().default(false),
  // Privacy: if true, user's transaction history is excluded from admin CSV exports
  hideTransactionHistory: boolean("hide_transaction_history").notNull().default(false),
  createdAt: integer("created_at").notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
  updatedAt: integer("updated_at").notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
});
export type LoyaltyAccount = typeof loyaltyAccounts.$inferSelect;
export type InsertLoyaltyAccount = typeof loyaltyAccounts.$inferInsert;

export const loyaltyTransactions = pgTable("loyalty_transactions", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar("user_id", { length: 36 }).notNull(),
  type: varchar("type", { length: 20 }).notNull(),
  points: integer("points").notNull(),
  description: text("description"),
  partner: varchar("partner", { length: 100 }),
  referenceId: varchar("reference_id", { length: 100 }),
  expiresAt: integer("expires_at"), // Unix timestamp (seconds) when these points expire; null = never
  isExpired: boolean("is_expired").notNull().default(false),
  createdAt: integer("created_at").notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
});
export type LoyaltyTransaction = typeof loyaltyTransactions.$inferSelect;
export type InsertLoyaltyTransaction = typeof loyaltyTransactions.$inferInsert;

export const loyaltyRewards = pgTable("loyalty_rewards", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  pointsCost: integer("points_cost").notNull(),
  category: varchar("category", { length: 50 }),
  imageUrl: varchar("image_url", { length: 500 }),
  isActive: boolean("is_active").notNull().default(true),
  stock: integer("stock"),
  expiresAt: bigint("expires_at", { mode: "number" }), // Unix timestamp (ms). Null = never expires.
  createdAt: integer("created_at").notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
});
export type LoyaltyReward = typeof loyaltyRewards.$inferSelect;
export type InsertLoyaltyReward = typeof loyaltyRewards.$inferInsert;

// ─── Finance Requests ────────────────────────────────────────────────────────
export const financeRequestTypeEnum = pgEnum("finance_request_type", ["payout", "loan", "insurance"]);
export const financeRequestStatusEnum = pgEnum("finance_request_status", [
  "pending", "under_review", "approved", "rejected", "active", "completed", "quoted",
]);

export const financeRequests = pgTable("finance_requests", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar("user_id", { length: 36 }).notNull(),
  type: financeRequestTypeEnum("type").notNull(),
  amount: decimal("amount", { precision: 20, scale: 6 }),
  currency: varchar("currency", { length: 20 }),
  status: financeRequestStatusEnum("status").notNull().default("pending"),
  description: text("description"),
  metadata: text("metadata"),
  adminNotes: text("admin_notes"),
  reviewedBy: varchar("reviewed_by", { length: 36 }),
  reviewedAt: integer("reviewed_at"),
  createdAt: integer("created_at").notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
  updatedAt: integer("updated_at").notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
});
export type FinanceRequest = typeof financeRequests.$inferSelect;
export type InsertFinanceRequest = typeof financeRequests.$inferInsert;

// ─── Biometric Enrollments ───────────────────────────────────────────────────
export const biometricEnrollments = pgTable("biometric_enrollments", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar("user_id", { length: 36 }).notNull(),
  credentialId: varchar("credential_id", { length: 500 }).notNull(),
  publicKey: text("public_key").notNull(),
  deviceName: varchar("device_name", { length: 200 }),
  aaguid: varchar("aaguid", { length: 100 }),
  signCount: integer("sign_count").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  lastUsedAt: integer("last_used_at"),
  expiresAt: integer("expires_at"), // Unix timestamp (seconds). Null = never expires. Default: 90 days.
  createdAt: integer("created_at").notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
});
export type BiometricEnrollment = typeof biometricEnrollments.$inferSelect;
export type InsertBiometricEnrollment = typeof biometricEnrollments.$inferInsert;

// ─── DID Identity ────────────────────────────────────────────────────────────
export const didDocuments = pgTable("did_documents", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar("user_id", { length: 36 }).notNull().unique(),
  did: varchar("did", { length: 500 }).notNull().unique(),
  didDocument: text("did_document").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: integer("created_at").notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
  updatedAt: integer("updated_at").notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
});
export type DidDocument = typeof didDocuments.$inferSelect;
export type InsertDidDocument = typeof didDocuments.$inferInsert;

export const verifiableCredentials = pgTable("verifiable_credentials", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar("user_id", { length: 36 }).notNull(),
  type: varchar("type", { length: 200 }).notNull(),
  issuer: varchar("issuer", { length: 200 }).notNull(),
  subject: varchar("subject", { length: 500 }).notNull(),
  credentialData: text("credential_data").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  expiresAt: integer("expires_at"),
  revokedAt: integer("revoked_at"),
  createdAt: integer("created_at").notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
});
export type VerifiableCredential = typeof verifiableCredentials.$inferSelect;
export type InsertVerifiableCredential = typeof verifiableCredentials.$inferInsert;

// ─── Sustainability ──────────────────────────────────────────────────────────
export const carbonOffsets = pgTable("carbon_offsets", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar("user_id", { length: 36 }).notNull(),
  amount: decimal("amount", { precision: 10, scale: 3 }).notNull(),
  projectName: varchar("project_name", { length: 200 }).notNull(),
  projectCountry: varchar("project_country", { length: 10 }),
  costUsd: decimal("cost_usd", { precision: 10, scale: 2 }).notNull(),
  certificateUrl: varchar("certificate_url", { length: 500 }),
  vintageYear: integer("vintage_year"),
  createdAt: integer("created_at").notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
});
export type CarbonOffset = typeof carbonOffsets.$inferSelect;
export type InsertCarbonOffset = typeof carbonOffsets.$inferInsert;

// ─── Mesh Payments ───────────────────────────────────────────────────────────
export const meshTransactions = pgTable("mesh_transactions", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar("user_id", { length: 36 }).notNull(),
  corridorId: varchar("corridor_id", { length: 50 }).notNull(),
  fromCurrency: varchar("from_currency", { length: 10 }).notNull(),
  toCurrency: varchar("to_currency", { length: 10 }).notNull(),
  amount: decimal("amount", { precision: 18, scale: 6 }).notNull(),
  convertedAmount: decimal("converted_amount", { precision: 18, scale: 6 }).notNull(),
  feeAmount: decimal("fee_amount", { precision: 18, scale: 6 }).notNull(),
  exchangeRate: decimal("exchange_rate", { precision: 18, scale: 8 }).notNull(),
  recipientAddress: varchar("recipient_address", { length: 500 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  txHash: varchar("tx_hash", { length: 200 }),
  createdAt: integer("created_at").notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
  completedAt: integer("completed_at"),
});
export type MeshTransaction = typeof meshTransactions.$inferSelect;
export type InsertMeshTransaction = typeof meshTransactions.$inferInsert;

// ─── Wallet Spending Limits ──────────────────────────────────────────────────
export const walletSpendingLimits = pgTable("wallet_spending_limits", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar("user_id", { length: 36 }).notNull(),
  currency: varchar("currency", { length: 20 }).notNull(),
  period: varchar("period", { length: 10 }).notNull().default("daily"), // "daily" | "monthly"
  limitAmount: decimal("limit_amount", { precision: 20, scale: 6 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: integer("created_at").notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
  updatedAt: integer("updated_at").notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
});
export type WalletSpendingLimit = typeof walletSpendingLimits.$inferSelect;
export type InsertWalletSpendingLimit = typeof walletSpendingLimits.$inferInsert;

// ─── PIN Lockout History ─────────────────────────────────────────────────────
// Persists lockout events for exponential backoff tier tracking
export const pinLockoutHistory = pgTable("pin_lockout_history", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar("user_id", { length: 36 }).notNull(),
  // Tier 0 = first lockout (15 min), Tier 1 = second (1 hr), Tier 2+ = 24 hr
  tier: integer("tier").notNull().default(0),
  lockedAt: integer("locked_at").notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
  unlocksAt: integer("unlocks_at").notNull(),
  failedAttempts: integer("failed_attempts").notNull().default(5),
  resolved: boolean("resolved").notNull().default(false),
});
export type PinLockoutHistory = typeof pinLockoutHistory.$inferSelect;
export type InsertPinLockoutHistory = typeof pinLockoutHistory.$inferInsert;

// ─── Service Health Alerts ───────────────────────────────────────────────────
// Tracks the last time an owner alert was sent per service (1-hour cooldown)
export const serviceHealthAlerts = pgTable("service_health_alerts", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  serviceKey: varchar("service_key", { length: 50 }).notNull().unique(),
  lastAlertAt: integer("last_alert_at").notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
  lastStatus: varchar("last_status", { length: 20 }).notNull().default("unreachable"),
  alertCount: integer("alert_count").notNull().default(1),
});
export type ServiceHealthAlert = typeof serviceHealthAlerts.$inferSelect;
export type InsertServiceHealthAlert = typeof serviceHealthAlerts.$inferInsert;

// ─── Service Health History ──────────────────────────────────────────────────
// Stores per-check health results for sparkline display (last 24h)
export const serviceHealthHistory = pgTable("service_health_history", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  serviceKey: varchar("service_key", { length: 50 }).notNull(),
  status: varchar("status", { length: 20 }).notNull(), // "healthy" | "unhealthy" | "unreachable" | "not_configured"
  httpStatus: integer("http_status"),
  responseMs: integer("response_ms"),
  checkedAt: integer("checked_at").notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
});
export type ServiceHealthHistory = typeof serviceHealthHistory.$inferSelect;
export type InsertServiceHealthHistory = typeof serviceHealthHistory.$inferInsert;
// ─── BIS Investigation Timeline ──────────────────────────────────────────────
// Ordered audit trail of events for each BIS investigation
export const bisTimeline = pgTable("bis_timeline", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  investigationId: integer("investigation_id").notNull().references(() => bisInvestigations.id, { onDelete: "cascade" }),
  actorId: varchar("actor_id", { length: 36 }),
  actorName: varchar("actor_name", { length: 255 }),
  eventType: varchar("event_type", { length: 50 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  severity: varchar("severity", { length: 20 }).notNull().default("info"),
  createdAt: bigint("created_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
});
export type BisTimelineEvent = typeof bisTimeline.$inferSelect;
export type InsertBisTimelineEvent = typeof bisTimeline.$inferInsert;

// ─── Scheduled Payments ───────────────────────────────────────────────────────
// Stores user-configured future or recurring wallet transfers

export const scheduledPaymentStatusEnum = pgEnum("scheduled_payment_status", [
  "active",
  "paused",
  "cancelled",
  "completed",
  "failed",
]);

export const scheduledPaymentRecurrenceEnum = pgEnum("scheduled_payment_recurrence", [
  "once",
  "daily",
  "weekly",
  "monthly",
]);

export const scheduledPayments = pgTable(
  "scheduled_payments",
  {
    id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: varchar("user_id", { length: 36 }).notNull(),
    toAddress: varchar("to_address", { length: 255 }).notNull(),
    counterpartyName: varchar("counterparty_name", { length: 255 }),
    amount: decimal("amount", { precision: 20, scale: 8 }).notNull(),
    currency: varchar("currency", { length: 20 }).notNull(),
    recurrence: scheduledPaymentRecurrenceEnum("recurrence").notNull().default("once"),
    note: varchar("note", { length: 500 }),
    reference: varchar("reference", { length: 100 }),
    status: scheduledPaymentStatusEnum("status").notNull().default("active"),
    scheduledAt: bigint("scheduled_at", { mode: "number" }).notNull(), // Unix ms
    lastRunAt: bigint("last_run_at", { mode: "number" }),
    nextRunAt: bigint("next_run_at", { mode: "number" }),
    runCount: integer("run_count").notNull().default(0),
    failureReason: text("failure_reason"),
    createdAt: bigint("created_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  },
  (t) => [
    index("sched_pay_user_idx").on(t.userId),
    index("sched_pay_status_idx").on(t.status),
    index("sched_pay_next_run_idx").on(t.nextRunAt),
  ]
);

export type ScheduledPayment = typeof scheduledPayments.$inferSelect;
export type InsertScheduledPayment = typeof scheduledPayments.$inferInsert;

// ─── Loyalty Partners ─────────────────────────────────────────────────────────
export const loyaltyPartners = pgTable(
  "loyalty_partners",
  {
    id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: varchar("name", { length: 200 }).notNull(),
    logoUrl: text("logo_url"),
    description: text("description"),
    bonusMultiplier: decimal("bonus_multiplier", { precision: 5, scale: 2 }).notNull().default("1.00"),
    category: varchar("category", { length: 50 }).notNull().default("general"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: bigint("created_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  },
  (t) => [
    index("loyalty_partners_active_idx").on(t.isActive),
    index("loyalty_partners_category_idx").on(t.category),
  ]
);
export type LoyaltyPartner = typeof loyaltyPartners.$inferSelect;
export type InsertLoyaltyPartner = typeof loyaltyPartners.$inferInsert;

// ─── Wallet Recurring Payments ────────────────────────────────────────────────
export const recurringPaymentFrequencyEnum = pgEnum("recurring_payment_frequency", ["daily", "weekly", "monthly"]);

export const walletRecurringPayments = pgTable(
  "wallet_recurring_payments",
  {
    id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: varchar("user_id", { length: 36 }).notNull(),
    currency: varchar("currency", { length: 20 }).notNull(),
    recipientAddress: varchar("recipient_address", { length: 200 }).notNull(),
    recipientName: varchar("recipient_name", { length: 200 }),
    amount: decimal("amount", { precision: 20, scale: 6 }).notNull(),
    note: text("note"),
    frequency: recurringPaymentFrequencyEnum("frequency").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    nextRunAt: bigint("next_run_at", { mode: "number" }).notNull(),
    lastRunAt: bigint("last_run_at", { mode: "number" }),
    runCount: integer("run_count").notNull().default(0),
    failureReason: text("failure_reason"),
    createdAt: bigint("created_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  },
  (t) => [
    index("wallet_rec_pay_user_idx").on(t.userId),
    index("wallet_rec_pay_status_idx").on(t.status),
    index("wallet_rec_pay_next_run_idx").on(t.nextRunAt),
  ]
);
export type WalletRecurringPayment = typeof walletRecurringPayments.$inferSelect;
export type InsertWalletRecurringPayment = typeof walletRecurringPayments.$inferInsert;

// ─── Loyalty Referrals ────────────────────────────────────────────────────────
export const loyaltyReferrals = pgTable(
  "loyalty_referrals",
  {
    id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    referrerId: varchar("referrer_id", { length: 36 }).notNull(),
    refereeId: varchar("referee_id", { length: 36 }),
    code: varchar("code", { length: 20 }).notNull().unique(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    referrerPointsAwarded: integer("referrer_points_awarded").notNull().default(0),
    refereePointsAwarded: integer("referee_points_awarded").notNull().default(0),
    usedAt: bigint("used_at", { mode: "number" }),
    createdAt: bigint("created_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  },
  (t) => [
    index("loyalty_referrals_referrer_idx").on(t.referrerId),
    index("loyalty_referrals_code_idx").on(t.code),
    index("loyalty_referrals_referee_idx").on(t.refereeId),
  ]
);
export type LoyaltyReferral = typeof loyaltyReferrals.$inferSelect;
export type InsertLoyaltyReferral = typeof loyaltyReferrals.$inferInsert;

// ─── BIS Investigation Notes ─────────────────────────────────────────────────
export const bisInvestigationNotes = pgTable(
  "bis_investigation_notes",
  {
    id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    investigationId: varchar("investigation_id", { length: 36 }).notNull(),
    authorId: varchar("author_id", { length: 36 }).notNull(),
    authorName: varchar("author_name", { length: 200 }).notNull(),
    content: text("content").notNull(),
    isInternal: boolean("is_internal").notNull().default(false),
    createdAt: bigint("created_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  },
  (t) => [
    index("bis_notes_investigation_idx").on(t.investigationId),
    index("bis_notes_author_idx").on(t.authorId),
    index("bis_notes_created_idx").on(t.createdAt),
  ]
);
export type BisInvestigationNote = typeof bisInvestigationNotes.$inferSelect;
export type InsertBisInvestigationNote = typeof bisInvestigationNotes.$inferInsert;

// ─── BIS Export Schedule ──────────────────────────────────────────────────────
// Stores per-user weekly export schedule preferences for BIS investigation notes.
export const bisExportScheduleFrequencyEnum = pgEnum("bis_export_schedule_frequency", [
  "weekly",
  "biweekly",
  "monthly",
]);

export const bisExportSchedules = pgTable(
  "bis_export_schedules",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id).notNull().unique(),
    frequency: bisExportScheduleFrequencyEnum("frequency").notNull().default("weekly"),
    enabled: boolean("enabled").notNull().default(true),
    includeInternal: boolean("include_internal").notNull().default(false),
    // Filters applied to the export (JSON: { status?, assignedToId?, dateFrom?, dateTo? })
    filters: jsonb("filters").$type<Record<string, unknown>>().default({}),
    // UTC ms timestamp of when the next export should run
    nextRunAt: bigint("next_run_at", { mode: "number" }).notNull().$defaultFn(() => {
      // Default: next Monday at 08:00 UTC
      const now = new Date();
      const daysUntilMonday = (8 - now.getUTCDay()) % 7 || 7;
      const nextMonday = new Date(now);
      nextMonday.setUTCDate(now.getUTCDate() + daysUntilMonday);
      nextMonday.setUTCHours(8, 0, 0, 0);
      return nextMonday.getTime();
    }),
    // UTC ms timestamp of when the last export ran (null if never)
    lastRunAt: bigint("last_run_at", { mode: "number" }),
    // Total notes included in the last export run (null if never run)
    lastExportNoteCount: integer("last_export_note_count"),
    createdAt: bigint("created_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  },
  (t) => [
    index("bis_export_sched_user_idx").on(t.userId),
    index("bis_export_sched_next_run_idx").on(t.nextRunAt),
    index("bis_export_sched_enabled_idx").on(t.enabled),
  ]
);
export type BisExportSchedule = typeof bisExportSchedules.$inferSelect;
export type InsertBisExportSchedule = typeof bisExportSchedules.$inferInsert;

// ============================================================================
// PAYMENT SWITCH — Three-Platform Integration
// ============================================================================

export const remittanceStatusEnum = pgEnum("remittance_status", [
  "pending", "processing", "completed", "failed", "reversed", "refunded",
]);
export const remittanceCurrencyEnum = pgEnum("remittance_currency", [
  "BTC", "ETH", "USDC", "USDT", "NGN", "KES", "GHS", "TZS", "UGX", "ZAR", "USD",
]);
export const deliveryOptionEnum = pgEnum("delivery_option", [
  "bank_transfer", "mobile_money", "agent_cash", "bill_payment", "wallet",
]);

export const remittances = pgTable(
  "remittances",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: integer("user_id").notNull(),
    senderCurrency: remittanceCurrencyEnum("sender_currency").notNull(),
    senderAmount: numeric("sender_amount", { precision: 20, scale: 8 }).notNull(),
    recipientCurrency: remittanceCurrencyEnum("recipient_currency").notNull().default("NGN"),
    recipientAmount: numeric("recipient_amount", { precision: 20, scale: 8 }),
    exchangeRate: numeric("exchange_rate", { precision: 20, scale: 8 }),
    fee: numeric("fee", { precision: 20, scale: 8 }).notNull().default("0"),
    status: remittanceStatusEnum("status").notNull().default("pending"),
    deliveryOption: deliveryOptionEnum("delivery_option").notNull().default("bank_transfer"),
    recipientPhone: varchar("recipient_phone", { length: 32 }),
    recipientName: varchar("recipient_name", { length: 255 }),
    recipientBank: varchar("recipient_bank", { length: 64 }),
    recipientAccount: varchar("recipient_account", { length: 64 }),
    tbTransferId: varchar("tb_transfer_id", { length: 128 }),
    mojaloopRef: varchar("mojaloop_ref", { length: 128 }),
    externalRef: varchar("external_ref", { length: 255 }),
    errorCode: varchar("error_code", { length: 64 }),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    completedAt: bigint("completed_at", { mode: "number" }),
    createdAt: bigint("created_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  },
  (t) => [
    index("remittances_user_idx").on(t.userId),
    index("remittances_status_idx").on(t.status),
    index("remittances_created_idx").on(t.createdAt),
  ]
);
export type Remittance = typeof remittances.$inferSelect;
export type InsertRemittance = typeof remittances.$inferInsert;

export const participantTypeEnum = pgEnum("participant_type", [
  "bank", "fintech", "mobile_money", "agent_network", "psp",
]);
export const participantStatusEnum = pgEnum("participant_status", [
  "active", "suspended", "pending", "inactive",
]);

export const psParticipants = pgTable(
  "ps_participants",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    type: participantTypeEnum("type").notNull(),
    status: participantStatusEnum("status").notNull().default("active"),
    country: varchar("country", { length: 2 }).notNull().default("NG"),
    currency: varchar("currency", { length: 8 }).notNull().default("NGN"),
    tbAccountId: varchar("tb_account_id", { length: 128 }),
    mojaloopFspId: varchar("mojaloop_fsp_id", { length: 64 }),
    healthScore: integer("health_score").notNull().default(100),
    lastHealthCheck: bigint("last_health_check", { mode: "number" }),
    apiEndpoint: varchar("api_endpoint", { length: 512 }),
    apiKeyHash: varchar("api_key_hash", { length: 128 }),
    dailyLimit: numeric("daily_limit", { precision: 20, scale: 2 }),
    monthlyLimit: numeric("monthly_limit", { precision: 20, scale: 2 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: bigint("created_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  },
  (t) => [
    index("ps_participants_status_idx").on(t.status),
    index("ps_participants_country_idx").on(t.country),
  ]
);
export type PsParticipant = typeof psParticipants.$inferSelect;
export type InsertPsParticipant = typeof psParticipants.$inferInsert;

export const settlementStatusEnum = pgEnum("settlement_status", [
  "pending", "processing", "completed", "failed", "disputed",
]);

export const psSettlements = pgTable(
  "ps_settlements",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    batchId: varchar("batch_id", { length: 64 }).notNull(),
    participantId: varchar("participant_id", { length: 64 }).notNull(),
    currency: varchar("currency", { length: 8 }).notNull(),
    totalAmount: numeric("total_amount", { precision: 20, scale: 2 }).notNull(),
    transactionCount: integer("transaction_count").notNull().default(0),
    status: settlementStatusEnum("status").notNull().default("pending"),
    tbBatchId: varchar("tb_batch_id", { length: 128 }),
    mojaloopWindowId: varchar("mojaloop_window_id", { length: 64 }),
    settledAt: bigint("settled_at", { mode: "number" }),
    createdAt: bigint("created_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  },
  (t) => [
    index("ps_settlements_batch_idx").on(t.batchId),
    index("ps_settlements_participant_idx").on(t.participantId),
    index("ps_settlements_status_idx").on(t.status),
    index("ps_settlements_created_idx").on(t.createdAt),
  ]
);
export type PsSettlement = typeof psSettlements.$inferSelect;
export type InsertPsSettlement = typeof psSettlements.$inferInsert;

export const nocEventTypeEnum = pgEnum("noc_event_type", [
  "kill_switch_activated", "kill_switch_deactivated",
  "participant_suspended", "participant_restored",
  "rate_limit_breach", "fraud_alert", "system_alert",
  "settlement_failed", "settlement_completed",
]);

export const nocEvents = pgTable(
  "noc_events",
  {
    id: serial("id").primaryKey(),
    type: nocEventTypeEnum("type").notNull(),
    severity: varchar("severity", { length: 16 }).notNull().default("info"),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    actorId: integer("actor_id"),
    actorName: varchar("actor_name", { length: 255 }),
    targetId: varchar("target_id", { length: 128 }),
    targetType: varchar("target_type", { length: 64 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    resolvedAt: bigint("resolved_at", { mode: "number" }),
    createdAt: bigint("created_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  },
  (t) => [
    index("noc_events_type_idx").on(t.type),
    index("noc_events_severity_idx").on(t.severity),
    index("noc_events_created_idx").on(t.createdAt),
  ]
);
export type NocEvent = typeof nocEvents.$inferSelect;
export type InsertNocEvent = typeof nocEvents.$inferInsert;

export const psKillSwitchState = pgTable("ps_kill_switch_state", {
  id: serial("id").primaryKey(),
  isActive: boolean("is_active").notNull().default(false),
  activatedBy: integer("activated_by"),
  activatedByName: varchar("activated_by_name", { length: 255 }),
  reason: text("reason"),
  activatedAt: bigint("activated_at", { mode: "number" }),
  deactivatedAt: bigint("deactivated_at", { mode: "number" }),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
});
export type PsKillSwitchState = typeof psKillSwitchState.$inferSelect;

// ─── PaymentSwitch Aliases & Additional Tables ────────────────────────────────
// psRemittances is an alias for remittances (PaymentSwitch namespace)
export const psRemittances = remittances;
export type PsRemittance = typeof remittances.$inferSelect;

// psNocEvents is an alias for nocEvents (PaymentSwitch namespace)
export const psNocEvents = nocEvents;
export type PsNocEvent = typeof nocEvents.$inferSelect;

// ─── PaymentSwitch Fraud Rules ─────────────────────────────────────────────────
export const psFraudRules = pgTable(
  "ps_fraud_rules",
  {
    id: serial("id").primaryKey(),
    ruleId: varchar("rule_id", { length: 64 }).notNull().unique(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    ruleType: varchar("rule_type", { length: 50 }).notNull().default("threshold"), // threshold | velocity | pattern | ml
    conditions: jsonb("conditions").$type<Record<string, unknown>>().default({}),
    action: varchar("action", { length: 50 }).notNull().default("flag"), // flag | block | review
    severity: fraudAlertSeverityEnum("severity").notNull().default("medium"),
    isActive: boolean("is_active").notNull().default(true),
    hitCount: integer("hit_count").notNull().default(0),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: bigint("created_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  },
  (t) => [
    index("ps_fraud_rules_type_idx").on(t.ruleType),
    index("ps_fraud_rules_active_idx").on(t.isActive),
    index("ps_fraud_rules_severity_idx").on(t.severity),
  ]
);
export type PsFraudRule = typeof psFraudRules.$inferSelect;
export type InsertPsFraudRule = typeof psFraudRules.$inferInsert;

// ─── PaymentSwitch Ledger Entries (TigerBeetle mirror) ────────────────────────
export const psLedgerEntries = pgTable(
  "ps_ledger_entries",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    accountId: varchar("account_id", { length: 64 }).notNull(),
    participantId: varchar("participant_id", { length: 64 }).notNull(),
    ledger: integer("ledger").notNull().default(1), // TigerBeetle ledger ID
    code: integer("code").notNull().default(1),     // TigerBeetle transfer code
    debitAmount: numeric("debit_amount", { precision: 20, scale: 2 }).notNull().default("0"),
    creditAmount: numeric("credit_amount", { precision: 20, scale: 2 }).notNull().default("0"),
    currency: varchar("currency", { length: 8 }).notNull(),
    transferId: varchar("transfer_id", { length: 64 }),
    remittanceId: varchar("remittance_id", { length: 64 }),
    settlementId: varchar("settlement_id", { length: 64 }),
    tbTransferId: varchar("tb_transfer_id", { length: 128 }), // TigerBeetle transfer ID
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: bigint("created_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  },
  (t) => [
    index("ps_ledger_account_idx").on(t.accountId),
    index("ps_ledger_participant_idx").on(t.participantId),
    index("ps_ledger_transfer_idx").on(t.transferId),
    index("ps_ledger_created_idx").on(t.createdAt),
  ]
);
export type PsLedgerEntry = typeof psLedgerEntries.$inferSelect;
export type InsertPsLedgerEntry = typeof psLedgerEntries.$inferInsert;

// ─── PaymentSwitch Kill Switches (per-corridor) ────────────────────────────────
export const psKillSwitches = pgTable(
  "ps_kill_switches",
  {
    id: serial("id").primaryKey(),
    // corridor: "USD-NGN", "USD-KES", "GBP-NGN", etc. or "GLOBAL" for all
    corridor: varchar("corridor", { length: 32 }).notNull().unique(),
    isActive: boolean("is_active").notNull().default(false),
    activatedBy: integer("activated_by"),
    activatedByName: varchar("activated_by_name", { length: 255 }),
    reason: text("reason"),
    activatedAt: bigint("activated_at", { mode: "number" }),
    deactivatedAt: bigint("deactivated_at", { mode: "number" }),
    deactivatedBy: integer("deactivated_by"),
    deactivatedByName: varchar("deactivated_by_name", { length: 255 }),
    createdAt: bigint("created_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  },
  (t) => [
    index("ps_kill_switches_corridor_idx").on(t.corridor),
    index("ps_kill_switches_active_idx").on(t.isActive),
  ]
);
export type PsKillSwitch = typeof psKillSwitches.$inferSelect;
export type InsertPsKillSwitch = typeof psKillSwitches.$inferInsert;

// ─── PaymentSwitch Kill Switch History ────────────────────────────────────────
export const psKillSwitchHistory = pgTable(
  "ps_kill_switch_history",
  {
    id: serial("id").primaryKey(),
    corridor: varchar("corridor", { length: 32 }).notNull(),
    action: varchar("action", { length: 16 }).notNull(),
    actorId: integer("actor_id"),
    actorName: varchar("actor_name", { length: 255 }),
    reason: text("reason"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: bigint("created_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  },
  (t) => [
    index("ps_kill_switch_history_corridor_idx").on(t.corridor),
    index("ps_kill_switch_history_created_idx").on(t.createdAt),
  ]
);
export type PsKillSwitchHistory = typeof psKillSwitchHistory.$inferSelect;

// ─── PaymentSwitch Webhooks ────────────────────────────────────────────────────
export const psWebhooks = pgTable(
  "ps_webhooks",
  {
    id: serial("id").primaryKey(),
    webhookId: varchar("webhook_id", { length: 64 }).notNull().unique(),
    name: varchar("name", { length: 255 }).notNull(),
    endpoint: varchar("endpoint", { length: 2048 }).notNull(),
    events: text("events").notNull().default("remittance.completed"),
    secret: varchar("secret", { length: 128 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    participantId: varchar("participant_id", { length: 64 }),
    createdBy: integer("created_by"),
    createdByName: varchar("created_by_name", { length: 255 }),
    lastDeliveryAt: bigint("last_delivery_at", { mode: "number" }),
    lastDeliveryStatus: varchar("last_delivery_status", { length: 16 }),
    totalDeliveries: integer("total_deliveries").notNull().default(0),
    failureCount: integer("failure_count").notNull().default(0),
    createdAt: bigint("created_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  },
  (t) => [
    index("ps_webhooks_participant_idx").on(t.participantId),
    index("ps_webhooks_active_idx").on(t.isActive),
    index("ps_webhooks_created_idx").on(t.createdAt),
  ]
);
export type PsWebhook = typeof psWebhooks.$inferSelect;
export type InsertPsWebhook = typeof psWebhooks.$inferInsert;

// ─── PaymentSwitch Webhook Deliveries ─────────────────────────────────────────
export const psWebhookDeliveryStatusEnum = pgEnum("ps_webhook_delivery_status", [
  "pending",
  "success",
  "failed",
  "retrying",
  "exhausted",
]);

export const psWebhookDeliveries = pgTable(
  "ps_webhook_deliveries",
  {
    id: serial("id").primaryKey(),
    deliveryId: varchar("delivery_id", { length: 64 }).notNull().unique(),
    webhookId: varchar("webhook_id", { length: 64 }).notNull(),
    event: varchar("event", { length: 64 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: psWebhookDeliveryStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    nextRetryAt: bigint("next_retry_at", { mode: "number" }),
    lastAttemptAt: bigint("last_attempt_at", { mode: "number" }),
    responseCode: integer("response_code"),
    responseBody: text("response_body"),
    responseTimeMs: integer("response_time_ms"),
    errorMessage: text("error_message"),
    createdAt: bigint("created_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  },
  (t) => [
    index("ps_webhook_deliveries_webhook_idx").on(t.webhookId),
    index("ps_webhook_deliveries_status_idx").on(t.status),
    index("ps_webhook_deliveries_event_idx").on(t.event),
    index("ps_webhook_deliveries_retry_idx").on(t.nextRetryAt),
    index("ps_webhook_deliveries_created_idx").on(t.createdAt),
  ]
);
export type PsWebhookDelivery = typeof psWebhookDeliveries.$inferSelect;
export type InsertPsWebhookDelivery = typeof psWebhookDeliveries.$inferInsert;

// ─── PaymentSwitch: Corridor Rate Limits ─────────────────────────────────────

export const psCorridorRateLimits = pgTable(
  "ps_corridor_rate_limits",
  {
    id: serial("id").primaryKey(),
    corridor: varchar("corridor", { length: 16 }).notNull().unique(),
    // Maximum transactions allowed per 1-minute sliding window (0 = unlimited)
    maxTxPerMinute: integer("max_tx_per_minute").notNull().default(0),
    // Maximum aggregate volume per 24-hour window in minor currency units (0 = unlimited)
    maxVolumePerDay: bigint("max_volume_per_day", { mode: "number" }).notNull().default(0),
    // Currency for volume cap (e.g. "USD", "NGN")
    currency: varchar("currency", { length: 8 }).notNull().default("USD"),
    isActive: boolean("is_active").notNull().default(true),
    notes: text("notes"),
    createdBy: varchar("created_by", { length: 128 }),
    updatedBy: varchar("updated_by", { length: 128 }),
    createdAt: bigint("created_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  },
  (t) => [
    index("ps_corridor_rl_corridor_idx").on(t.corridor),
    index("ps_corridor_rl_active_idx").on(t.isActive),
  ]
);
export type PsCorridorRateLimit = typeof psCorridorRateLimits.$inferSelect;
export type InsertPsCorridorRateLimit = typeof psCorridorRateLimits.$inferInsert;

export const psCorridorRateLimitUsage = pgTable(
  "ps_corridor_rate_limit_usage",
  {
    id: serial("id").primaryKey(),
    corridor: varchar("corridor", { length: 16 }).notNull(),
    // Unix timestamp (ms) of the start of the 1-minute window
    windowStart: bigint("window_start", { mode: "number" }).notNull(),
    // Unix timestamp (ms) of the start of the 24-hour day window
    dayWindowStart: bigint("day_window_start", { mode: "number" }).notNull(),
    txCount: integer("tx_count").notNull().default(0),
    // Aggregate volume in minor currency units for the day window
    volumeSum: bigint("volume_sum", { mode: "number" }).notNull().default(0),
    currency: varchar("currency", { length: 8 }).notNull().default("USD"),
    lastUpdatedAt: bigint("last_updated_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  },
  (t) => [
    index("ps_corridor_rl_usage_corridor_idx").on(t.corridor),
    index("ps_corridor_rl_usage_window_idx").on(t.windowStart),
    index("ps_corridor_rl_usage_day_idx").on(t.dayWindowStart),
  ]
);
export type PsCorridorRateLimitUsage = typeof psCorridorRateLimitUsage.$inferSelect;
export type InsertPsCorridorRateLimitUsage = typeof psCorridorRateLimitUsage.$inferInsert;

// ─── Security & Account Tables (migrated from previous archive) ───────────────

export const rateConditionEnum = pgEnum("rate_condition", ["above", "below", "exact"]);
export const rateAlertStatusEnum2 = pgEnum("rate_alert_status", ["active", "triggered", "expired", "cancelled"]);

export const trustedDevices = pgTable("trusted_devices", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 64 }).notNull(),
  deviceFingerprint: varchar("device_fingerprint", { length: 255 }).notNull(),
  deviceName: varchar("device_name", { length: 255 }),
  deviceType: varchar("device_type", { length: 100 }),
  lastUsedAt: bigint("last_used_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  expiresAt: bigint("expires_at", { mode: "number" }),
  createdAt: bigint("created_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
});
export type TrustedDevice = typeof trustedDevices.$inferSelect;

export const loginHistory = pgTable("login_history", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 64 }).notNull(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  deviceFingerprint: varchar("device_fingerprint", { length: 255 }),
  country: varchar("country", { length: 100 }),
  city: varchar("city", { length: 100 }),
  loginMethod: varchar("login_method", { length: 64 }),
  success: boolean("success").default(true).notNull(),
  isSuspicious: boolean("is_suspicious").default(false).notNull(),
  isTrustedDevice: boolean("is_trusted_device").default(false).notNull(),
  sessionId: varchar("session_id", { length: 128 }),
  sessionActive: boolean("session_active").default(true).notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
});
export type LoginHistory = typeof loginHistory.$inferSelect;

export const rateAlerts = pgTable("rate_alerts", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 64 }).notNull(),
  baseCurrency: varchar("base_currency", { length: 10 }).notNull(),
  targetCurrency: varchar("target_currency", { length: 10 }).notNull(),
  targetRate: numeric("target_rate", { precision: 18, scale: 8 }).notNull(),
  condition: rateConditionEnum("condition").notNull().default("above"),
  status: rateAlertStatusEnum2("status").default("active").notNull(),
  notifyEmail: boolean("notify_email").default(true).notNull(),
  notifySms: boolean("notify_sms").default(false).notNull(),
  triggeredAt: bigint("triggered_at", { mode: "number" }),
  expiresAt: bigint("expires_at", { mode: "number" }),
  createdAt: bigint("created_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
});
export type RateAlert = typeof rateAlerts.$inferSelect;

export const psApiKeys = pgTable("ps_api_keys", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: varchar("user_id", { length: 64 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  keyHash: varchar("key_hash", { length: 255 }).notNull(),
  keyPrefix: varchar("key_prefix", { length: 16 }).notNull(),
  environment: varchar("environment", { length: 16 }).notNull().default("sandbox"),
  permissions: jsonb("permissions").$type<string[]>().default([]),
  isActive: boolean("is_active").default(true).notNull(),
  lastUsedAt: bigint("last_used_at", { mode: "number" }),
  expiresAt: bigint("expires_at", { mode: "number" }),
  rateLimit: integer("rate_limit").default(1000),
  createdAt: bigint("created_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
});
export type PsApiKey = typeof psApiKeys.$inferSelect;

export const psTwoFactorSettings = pgTable("ps_two_factor_settings", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 64 }).notNull().unique(),
  enabled: boolean("enabled").default(false).notNull(),
  method: varchar("method", { length: 16 }),
  secret: varchar("secret", { length: 255 }),
  backupCodes: jsonb("backup_codes").$type<string[]>().default([]),
  createdAt: bigint("created_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
});
export type PsTwoFactorSetting = typeof psTwoFactorSettings.$inferSelect;

export const psNotificationChannels = pgTable("ps_notification_channels", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: varchar("user_id", { length: 64 }).notNull(),
  type: varchar("type", { length: 32 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  config: jsonb("config").$type<Record<string, unknown>>().default({}),
  isActive: boolean("is_active").default(true).notNull(),
  lastTestedAt: bigint("last_tested_at", { mode: "number" }),
  createdAt: bigint("created_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
});
export type PsNotificationChannel = typeof psNotificationChannels.$inferSelect;

export const psReminderEmails = pgTable("ps_reminder_emails", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: varchar("user_id", { length: 64 }).notNull(),
  type: varchar("type", { length: 64 }).notNull(),
  subject: varchar("subject", { length: 512 }).notNull(),
  body: text("body").notNull(),
  scheduledAt: bigint("scheduled_at", { mode: "number" }).notNull(),
  sentAt: bigint("sent_at", { mode: "number" }),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  createdAt: bigint("created_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
});
export type PsReminderEmail = typeof psReminderEmails.$inferSelect;

export const psAccountRecovery = pgTable("ps_account_recovery", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: varchar("user_id", { length: 64 }).notNull(),
  method: varchar("method", { length: 32 }).notNull(),
  token: varchar("token", { length: 255 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
  completedAt: bigint("completed_at", { mode: "number" }),
  createdAt: bigint("created_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
});
export type PsAccountRecovery = typeof psAccountRecovery.$inferSelect;

// ─── BIS Auto-Flag Configuration ─────────────────────────────────────────────
// Per-currency or global thresholds that trigger automatic BIS investigations
// when a TourismPay wallet transaction exceeds them.
export const bisAutoFlagConfig = pgTable("bis_auto_flag_config", {
  id: serial("id").primaryKey(),
  // "GLOBAL" or a specific wallet currency (e.g. "USDC", "NGN")
  currency: varchar("currency", { length: 20 }).notNull().unique(),
  // USD-equivalent amount above which a transaction is auto-flagged
  thresholdUsd: numeric("threshold_usd", { precision: 18, scale: 4 }).notNull().default("5000"),
  // Minimum number of sends within 1 hour to trigger velocity flag
  velocityCount: integer("velocity_count").notNull().default(10),
  // Tier to use for auto-created BIS investigations
  bisTier: varchar("bis_tier", { length: 20 }).notNull().default("standard"),
  isActive: boolean("is_active").default(true).notNull(),
  updatedBy: varchar("updated_by", { length: 64 }),
  createdAt: bigint("created_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
});
export type BisAutoFlagConfig = typeof bisAutoFlagConfig.$inferSelect;

// ─── BIS Auto-Flag Audit Log ──────────────────────────────────────────────────
// Records every automatically triggered BIS investigation from wallet transactions.
export const bisAutoFlags = pgTable(
  "bis_auto_flags",
  {
    id: serial("id").primaryKey(),
    walletTxId: varchar("wallet_tx_id", { length: 64 }).notNull(),
    userId: varchar("user_id", { length: 64 }).notNull(),
    currency: varchar("currency", { length: 20 }).notNull(),
    amountUsd: numeric("amount_usd", { precision: 18, scale: 4 }).notNull(),
    triggerReason: varchar("trigger_reason", { length: 64 }).notNull(), // "amount_threshold" | "velocity"
    thresholdUsd: numeric("threshold_usd", { precision: 18, scale: 4 }),
    bisInvestigationId: integer("bis_investigation_id"),
    bisReferenceId: varchar("bis_reference_id", { length: 20 }),
    status: varchar("status", { length: 32 }).notNull().default("created"), // "created" | "failed"
    errorMessage: text("error_message"),
    createdAt: bigint("created_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  },
  (t) => [
    index("bis_auto_flags_user_idx").on(t.userId),
    index("bis_auto_flags_tx_idx").on(t.walletTxId),
    index("bis_auto_flags_created_idx").on(t.createdAt),
  ]
);
export type BisAutoFlag = typeof bisAutoFlags.$inferSelect;

// ─── BIS Kill Switch Activations ──────────────────────────────────────────────
// Audit log of PaymentSwitch kill switches auto-activated by BIS high-risk findings.
export const bisKillSwitchActivations = pgTable(
  "bis_kill_switch_activations",
  {
    id: serial("id").primaryKey(),
    bisInvestigationId: integer("bis_investigation_id").notNull(),
    bisReferenceId: varchar("bis_reference_id", { length: 20 }).notNull(),
    subjectFullName: varchar("subject_full_name", { length: 255 }).notNull(),
    riskLevel: varchar("risk_level", { length: 16 }).notNull(),
    riskScore: integer("risk_score"),
    corridor: varchar("corridor", { length: 32 }).notNull(),
    reason: text("reason").notNull(),
    activatedBy: varchar("activated_by", { length: 64 }).notNull().default("BIS_AUTO"),
    createdAt: bigint("created_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  },
  (t) => [
    index("bis_ks_act_inv_idx").on(t.bisInvestigationId),
    index("bis_ks_act_corridor_idx").on(t.corridor),
    index("bis_ks_act_created_idx").on(t.createdAt),
  ]
);
export type BisKillSwitchActivation = typeof bisKillSwitchActivations.$inferSelect;

// ─── NOC Alert Thresholds ─────────────────────────────────────────────────────
// Per-metric configurable warning/critical thresholds for the NOC Dashboard.
export const nocAlertThresholds = pgTable(
  "noc_alert_thresholds",
  {
    id: serial("id").primaryKey(),
    metric: varchar("metric", { length: 64 }).notNull().unique(),
    warnMin: numeric("warn_min", { precision: 10, scale: 2 }),
    warnMax: numeric("warn_max", { precision: 10, scale: 2 }),
    critMin: numeric("crit_min", { precision: 10, scale: 2 }),
    critMax: numeric("crit_max", { precision: 10, scale: 2 }),
    unit: varchar("unit", { length: 16 }).notNull().default(""),
    label: varchar("label", { length: 64 }).notNull(),
    updatedBy: varchar("updated_by", { length: 64 }),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  },
  (t) => [index("noc_thresholds_metric_idx").on(t.metric)]
);
export type NocAlertThreshold = typeof nocAlertThresholds.$inferSelect;

// ─── Tourist Profiles ─────────────────────────────────────────────────────────
export const touristProfiles = pgTable("tourist_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  homeCurrency: varchar("home_currency", { length: 10 }).notNull().default("USD"),
  homeCountry: varchar("home_country", { length: 3 }).notNull().default("US"),
  preferredLanguage: varchar("preferred_language", { length: 10 }).notNull().default("en"),
  linkedCardLast4: varchar("linked_card_last4", { length: 4 }),
  linkedCardBrand: varchar("linked_card_brand", { length: 32 }),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type TouristProfile = typeof touristProfiles.$inferSelect;
export type InsertTouristProfile = typeof touristProfiles.$inferInsert;

// ─── QR Payment Tokens ────────────────────────────────────────────────────────
export const qrPaymentTokens = pgTable("qr_payment_tokens", {
  id: serial("id").primaryKey(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  establishmentId: integer("establishment_id").notNull().references(() => establishments.id, { onDelete: "cascade" }),
  amountUsd: numeric("amount_usd", { precision: 18, scale: 6 }),
  currency: varchar("currency", { length: 10 }),
  description: text("description"),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  expiresAt: timestamp("expires_at").notNull(),
  paidAt: timestamp("paid_at"),
  paidByUserId: integer("paid_by_user_id"),
  walletTxId: varchar("wallet_tx_id", { length: 128 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type QrPaymentToken = typeof qrPaymentTokens.$inferSelect;
export type InsertQrPaymentToken = typeof qrPaymentTokens.$inferInsert;

// ─── Tourist Onboarding State ─────────────────────────────────────────────────
export const touristOnboardingState = pgTable("tourist_onboarding_state", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  step: integer("step").notNull().default(1),
  completedSteps: jsonb("completed_steps").notNull().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type TouristOnboardingState = typeof touristOnboardingState.$inferSelect;
export type InsertTouristOnboardingState = typeof touristOnboardingState.$inferInsert;

// ─── Role Permissions ─────────────────────────────────────────────────────────
export const rolePermissions = pgTable("role_permissions", {
  id: serial("id").primaryKey(),
  role: userRoleEnum("role").notNull(),
  resource: varchar("resource", { length: 128 }).notNull(),
  action: varchar("action", { length: 64 }).notNull(),
  granted: boolean("granted").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type RolePermission = typeof rolePermissions.$inferSelect;
export type InsertRolePermission = typeof rolePermissions.$inferInsert;

// ─── Push Subscriptions (Web Push API) ───────────────────────────────────────
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: varchar("user_agent", { length: 512 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
export type InsertPushSubscriptionRow = typeof pushSubscriptions.$inferInsert;

// ─── Merchant Payout Schedules ────────────────────────────────────────────────
export const payoutFrequencyEnum = pgEnum("payout_frequency", ["daily", "weekly", "monthly"]);

export const merchantPayoutSchedules = pgTable("merchant_payout_schedules", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  frequency: payoutFrequencyEnum("frequency").notNull().default("weekly"),
  // For weekly: 0=Sun…6=Sat; for monthly: 1–28 (day of month); for daily: ignored
  preferredDay: integer("preferred_day").notNull().default(1),
  isActive: boolean("is_active").notNull().default(true),
  nextRunAt: timestamp("next_run_at"),
  lastRunAt: timestamp("last_run_at"),
  lastBatchId: varchar("last_batch_id", { length: 128 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type MerchantPayoutSchedule = typeof merchantPayoutSchedules.$inferSelect;
export type InsertMerchantPayoutSchedule = typeof merchantPayoutSchedules.$inferInsert;

// ─── Tourist Trip Summary Reports ─────────────────────────────────────────────
export const touristTripSummaries = pgTable("tourist_trip_summaries", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  dateFrom: timestamp("date_from").notNull(),
  dateTo: timestamp("date_to").notNull(),
  totalSpentUsd: numeric("total_spent_usd", { precision: 18, scale: 6 }).notNull().default("0"),
  totalPointsEarned: integer("total_points_earned").notNull().default(0),
  paymentCount: integer("payment_count").notNull().default(0),
  establishmentCount: integer("establishment_count").notNull().default(0),
  reportUrl: text("report_url"),
  reportKey: text("report_key"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type TouristTripSummary = typeof touristTripSummaries.$inferSelect;
export type InsertTouristTripSummary = typeof touristTripSummaries.$inferInsert;

// ─── Merchant Products / Menu Items ──────────────────────────────────────────
export const merchantProducts = pgTable(
  "merchant_products",
  {
    id: serial("id").primaryKey(),
    establishmentId: integer("establishment_id").notNull().references(() => establishments.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    category: varchar("category", { length: 100 }).notNull().default("general"),
    price: decimal("price", { precision: 12, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    imageUrl: text("image_url"),
    sku: varchar("sku", { length: 100 }),
    available: boolean("available").notNull().default(true),
    featured: boolean("featured").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("mp_est_idx").on(t.establishmentId),
    index("mp_category_idx").on(t.category),
    index("mp_available_idx").on(t.available),
  ]
);
export type MerchantProduct = typeof merchantProducts.$inferSelect;
export type InsertMerchantProduct = typeof merchantProducts.$inferInsert;

// ─── Staff Invites ────────────────────────────────────────────────────────────
export const staffInviteStatusEnum = pgEnum("staff_invite_status", [
  "pending",
  "accepted",
  "revoked",
  "expired",
]);

export const staffRoleEnum = pgEnum("staff_role", [
  "cashier",
  "manager",
  "supervisor",
]);

export const staffInvites = pgTable(
  "staff_invites",
  {
    id: serial("id").primaryKey(),
    token: varchar("token", { length: 128 }).notNull().unique(),
    establishmentId: integer("establishment_id").notNull().references(() => establishments.id, { onDelete: "cascade" }),
    inviterUserId: integer("inviter_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    role: staffRoleEnum("role").notNull().default("cashier"),
    status: staffInviteStatusEnum("status").notNull().default("pending"),
    acceptedByUserId: integer("accepted_by_user_id").references(() => users.id, { onDelete: "set null" }),
    acceptedAt: timestamp("accepted_at"),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("si_est_idx").on(t.establishmentId),
    index("si_token_idx").on(t.token),
    index("si_email_idx").on(t.email),
    index("si_status_idx").on(t.status),
  ]
);
export type StaffInvite = typeof staffInvites.$inferSelect;
export type InsertStaffInvite = typeof staffInvites.$inferInsert;

// ─── QR Payment Receipts ──────────────────────────────────────────────────────
export const qrPaymentReceipts = pgTable(
  "qr_payment_receipts",
  {
    id: serial("id").primaryKey(),
    token: varchar("token", { length: 128 }).notNull().unique(),
    touristUserId: integer("tourist_user_id").references(() => users.id, { onDelete: "set null" }),
    establishmentId: integer("establishment_id").references(() => establishments.id, { onDelete: "set null" }),
    merchantName: varchar("merchant_name", { length: 255 }),
    amountUsd: decimal("amount_usd", { precision: 12, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 10 }).notNull().default("USD"),
    lineItems: jsonb("line_items"), // Array of { name, qty, unitPrice, currency }
    status: varchar("status", { length: 50 }).notNull().default("completed"),
    pdfUrl: text("pdf_url"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("qpr_token_idx").on(t.token),
    index("qpr_tourist_idx").on(t.touristUserId),
    index("qpr_est_idx").on(t.establishmentId),
  ]
);
export type QrPaymentReceipt = typeof qrPaymentReceipts.$inferSelect;
export type InsertQrPaymentReceipt = typeof qrPaymentReceipts.$inferInsert;

// ─── Exchange Rate Overrides (admin-managed) ──────────────────────────────────
export const exchangeRateOverrides = pgTable(
  "exchange_rate_overrides",
  {
    id: serial("id").primaryKey(),
    baseCurrency: varchar("base_currency", { length: 10 }).notNull().default("USD"),
    targetCurrency: varchar("target_currency", { length: 10 }).notNull(),
    rate: decimal("rate", { precision: 18, scale: 8 }).notNull(),
    reason: text("reason"),
    isActive: boolean("is_active").notNull().default(true),
    expiresAt: bigint("expires_at", { mode: "number" }), // unix ms, null = no expiry
    createdByUserId: integer("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: bigint("created_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  },
  (t) => [
    index("ero_currencies_idx").on(t.baseCurrency, t.targetCurrency),
    index("ero_active_idx").on(t.isActive),
  ]
);
export type ExchangeRateOverride = typeof exchangeRateOverrides.$inferSelect;
export type InsertExchangeRateOverride = typeof exchangeRateOverrides.$inferInsert;

// ─── Tourist Bookings ─────────────────────────────────────────────────────────
export const bookingStatusEnum = pgEnum("booking_status", [
  "pending", "confirmed", "cancelled", "completed", "no_show",
]);

export const touristBookings = pgTable("tourist_bookings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  establishmentId: integer("establishment_id").notNull().references(() => establishments.id, { onDelete: "cascade" }),
  productId: integer("product_id").references(() => merchantProducts.id, { onDelete: "set null" }),
  serviceType: varchar("service_type", { length: 64 }).notNull().default("general"),
  serviceName: text("service_name").notNull(),
  bookingDate: timestamp("booking_date").notNull(),
  bookingDateStr: varchar("booking_date_str", { length: 10 }), // YYYY-MM-DD for serviceAvailability lookup
  partySize: integer("party_size").notNull().default(1),
  priceUsd: numeric("price_usd", { precision: 18, scale: 6 }).notNull().default("0"),
  currency: varchar("currency", { length: 10 }).notNull().default("USDC"),
  status: bookingStatusEnum("status").notNull().default("pending"),
  notes: text("notes"),
  confirmationCode: varchar("confirmation_code", { length: 32 }),
  walletTxId: varchar("wallet_tx_id", { length: 128 }),
  reminderEnabled: boolean("reminder_enabled").notNull().default(true),
  reminderSentAt: timestamp("reminder_sent_at"),
  touristReminderSentAt: timestamp("tourist_reminder_sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type TouristBooking = typeof touristBookings.$inferSelect;
export type InsertTouristBooking = typeof touristBookings.$inferInsert;

// ─── Tourist Reviews ──────────────────────────────────────────────────────────
export const touristReviews = pgTable("tourist_reviews", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  establishmentId: integer("establishment_id").notNull().references(() => establishments.id, { onDelete: "cascade" }),
  bookingId: integer("booking_id").references(() => touristBookings.id),
  rating: integer("rating").notNull(), // 1-5
  title: varchar("title", { length: 128 }),
  body: text("body"),
  tags: jsonb("tags").notNull().default([]), // ["clean","friendly","value"]
  photos: jsonb("photos").notNull().default([]), // S3 URLs
  helpfulVotes: integer("helpful_votes").notNull().default(0),
  isVerifiedPurchase: boolean("is_verified_purchase").notNull().default(false),
  merchantResponse: text("merchant_response"), // merchant public reply
  merchantRespondedAt: timestamp("merchant_responded_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type TouristReview = typeof touristReviews.$inferSelect;
export type InsertTouristReview = typeof touristReviews.$inferInsert;

// ─── Review Sentiment Cache ───────────────────────────────────────────────────
export const reviewSentimentCache = pgTable("review_sentiment_cache", {
  id: serial("id").primaryKey(),
  establishmentId: integer("establishment_id").notNull().unique().references(() => establishments.id, { onDelete: "cascade" }),
  positivePercent: integer("positive_percent").notNull(), // 0-100
  themes: jsonb("themes").notNull().default([]), // string[]
  summary: text("summary").notNull(),
  reviewCount: integer("review_count").notNull().default(0),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
});
export type ReviewSentimentCache = typeof reviewSentimentCache.$inferSelect;
export type InsertReviewSentimentCache = typeof reviewSentimentCache.$inferInsert;

// Daily sentiment history snapshots for trend sparkline
export const reviewSentimentHistory = pgTable(
  "review_sentiment_history",
  {
    id: serial("id").primaryKey(),
    establishmentId: integer("establishment_id")
      .notNull()
      .references(() => establishments.id, { onDelete: "cascade" }),
    positivePercent: integer("positive_percent").notNull(), // 0-100
    reviewCount: integer("review_count").notNull().default(0),
    snapshotDate: date("snapshot_date").notNull(), // YYYY-MM-DD
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    uniquePerDay: unique().on(t.establishmentId, t.snapshotDate),
  })
);
export type ReviewSentimentHistory = typeof reviewSentimentHistory.$inferSelect;
export type InsertReviewSentimentHistory = typeof reviewSentimentHistory.$inferInsert;

// ─── Tourist Deals / Promotions ───────────────────────────────────────────────
export const touristDeals = pgTable("tourist_deals", {
  id: serial("id").primaryKey(),
  establishmentId: integer("establishment_id").notNull().references(() => establishments.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 128 }).notNull(),
  description: text("description"),
  discountPercent: integer("discount_percent").notNull().default(0),
  discountAmountUsd: numeric("discount_amount_usd", { precision: 18, scale: 6 }),
  promoCode: varchar("promo_code", { length: 32 }),
  category: varchar("category", { length: 64 }).notNull().default("general"),
  imageUrl: text("image_url"),
  validFrom: timestamp("valid_from").notNull(),
  validTo: timestamp("valid_to").notNull(),
  maxRedemptions: integer("max_redemptions"),
  redemptionCount: integer("redemption_count").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  visibilityScore: integer("visibility_score").notNull().default(0),
  boostedAt: timestamp("boosted_at"),
  boostedUntil: timestamp("boosted_until"),
  boostBudgetUsd: numeric("boost_budget_usd", { precision: 12, scale: 2 }), // max spend per boost campaign
  boostSpentUsd: numeric("boost_spent_usd", { precision: 12, scale: 2 }).notNull().default("0"), // total spent so far
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type TouristDeal = typeof touristDeals.$inferSelect;
export type InsertTouristDeal = typeof touristDeals.$inferInsert;

// ─── Tourist Itinerary ────────────────────────────────────────────────────────
export const touristItineraries = pgTable("tourist_itineraries", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 128 }).notNull(),
  destination: varchar("destination", { length: 128 }),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  items: jsonb("items").notNull().default([]), // [{day, time, estId, note}]
  budgetUsd: numeric("budget_usd", { precision: 18, scale: 6 }),
  isPublic: boolean("is_public").notNull().default(false),
  coverImageUrl: text("cover_image_url"),
  status: varchar("status", { length: 32 }).notNull().default("draft"), // draft | confirmed | completed | cancelled
  currency: varchar("currency", { length: 10 }).notNull().default("USD"),
  description: text("description"),
  shareToken: varchar("share_token", { length: 64 }).unique(), // nanoid — set when user shares
  shareExportUrl: text("share_export_url"), // S3 URL of the exported HTML/PDF report
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type TouristItinerary = typeof touristItineraries.$inferSelect;
export type InsertTouristItinerary = typeof touristItineraries.$inferInsert;

// ─── Tourist Budget Tracker ───────────────────────────────────────────────────
export const touristBudgets = pgTable("tourist_budgets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  dailyLimitUsd: numeric("daily_limit_usd", { precision: 18, scale: 6 }).notNull().default("100"),
  weeklyLimitUsd: numeric("weekly_limit_usd", { precision: 18, scale: 6 }).notNull().default("500"),
  tripLimitUsd: numeric("trip_limit_usd", { precision: 18, scale: 6 }),
  alertAt80Percent: boolean("alert_at_80_percent").notNull().default(true),
  alertAt100Percent: boolean("alert_at_100_percent").notNull().default(true),
  categories: jsonb("categories").notNull().default({}), // {food:50, transport:20, ...}
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type TouristBudget = typeof touristBudgets.$inferSelect;
export type InsertTouristBudget = typeof touristBudgets.$inferInsert;

// ─── Tourist Concierge Sessions ───────────────────────────────────────────────
export const touristConciergeSessions = pgTable("tourist_concierge_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  messages: jsonb("messages").notNull().default([]), // [{role,content,ts}]
  context: jsonb("context").notNull().default({}), // destination, preferences, etc.
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type TouristConciergeSession = typeof touristConciergeSessions.$inferSelect;
export type InsertTouristConciergeSession = typeof touristConciergeSessions.$inferInsert;

// ─── Tourist Wallet Top-ups ───────────────────────────────────────────────────
export const touristTopups = pgTable("tourist_topups", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  amountUsd: numeric("amount_usd", { precision: 18, scale: 6 }).notNull(),
  targetCurrency: varchar("target_currency", { length: 10 }).notNull().default("USDC"),
  fxRate: numeric("fx_rate", { precision: 18, scale: 8 }).notNull().default("1"),
  creditedAmount: numeric("credited_amount", { precision: 18, scale: 6 }),
  stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 128 }),
  stripeSessionId: varchar("stripe_session_id", { length: 128 }),
  status: varchar("status", { length: 32 }).notNull().default("pending"), // pending|completed|failed
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type TouristTopup = typeof touristTopups.$inferSelect;
export type InsertTouristTopup = typeof touristTopups.$inferInsert;

// ─── Tourist Deal Redemptions ─────────────────────────────────────────────────
export const touristDealRedemptions = pgTable("tourist_deal_redemptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  dealId: integer("deal_id").notNull().references(() => touristDeals.id, { onDelete: "cascade" }),
  establishmentId: integer("establishment_id").references(() => establishments.id, { onDelete: "set null" }),
  redemptionCode: varchar("redemption_code", { length: 32 }).notNull().unique(),
  status: varchar("status", { length: 32 }).notNull().default("redeemed"), // redeemed|confirmed|cancelled
  redeemedAt: timestamp("redeemed_at").defaultNow().notNull(),
  confirmedAt: timestamp("confirmed_at"),
  confirmedBy: integer("confirmed_by"),
  notes: text("notes"),
  reviewPromptedAt: timestamp("review_prompted_at"),
});
export type TouristDealRedemption = typeof touristDealRedemptions.$inferSelect;
export type InsertTouristDealRedemption = typeof touristDealRedemptions.$inferInsert;

// ─── Tourist Deal Wishlists ───────────────────────────────────────────────────
export const touristDealWishlists = pgTable("tourist_deal_wishlists", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  dealId: integer("deal_id").notNull().references(() => touristDeals.id, { onDelete: "cascade" }),
  alertedAt: timestamp("alerted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type TouristDealWishlist = typeof touristDealWishlists.$inferSelect;
export type InsertTouristDealWishlist = typeof touristDealWishlists.$inferInsert;


export const touristItineraryItems = pgTable("tourist_itinerary_items", {
  id: serial("id").primaryKey(),
  itineraryId: integer("itinerary_id").notNull().references(() => touristItineraries.id, { onDelete: "cascade" }),
  dayNumber: integer("day_number").notNull().default(1), // 1-based day within the trip
  orderInDay: integer("order_in_day").notNull().default(1), // ordering within a day
  establishmentId: integer("establishment_id").references(() => establishments.id, { onDelete: "set null" }),
  bookingId: integer("booking_id").references(() => touristBookings.id, { onDelete: "set null" }),
  dealId: integer("deal_id").references(() => touristDeals.id, { onDelete: "set null" }),
  title: varchar("title", { length: 255 }).notNull(),
  notes: text("notes"),
  startTime: varchar("start_time", { length: 10 }), // HH:MM
  endTime: varchar("end_time", { length: 10 }),   // HH:MM
  estimatedCostUsd: numeric("estimated_cost_usd", { precision: 18, scale: 2 }).default("0"),
  itemType: varchar("item_type", { length: 32 }).notNull().default("activity"), // activity|accommodation|transport|meal|free_time
  status: varchar("status", { length: 32 }).notNull().default("planned"), // planned|confirmed|completed|cancelled
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type TouristItineraryItem = typeof touristItineraryItems.$inferSelect;
export type InsertTouristItineraryItem = typeof touristItineraryItems.$inferInsert;

// ─── Itinerary Collaboration ──────────────────────────────────────────────────
export const itineraryCollaboratorRoleEnum = pgEnum("itinerary_collaborator_role", ["owner", "editor", "viewer"]);

export const itineraryCollaborators = pgTable("itinerary_collaborators", {
  id: serial("id").primaryKey(),
  itineraryId: integer("itinerary_id").notNull().references(() => touristItineraries.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  role: itineraryCollaboratorRoleEnum("role").notNull().default("editor"),
  inviteToken: varchar("invite_token", { length: 64 }).unique(),
  inviteEmail: varchar("invite_email", { length: 320 }),
  acceptedAt: timestamp("accepted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type ItineraryCollaborator = typeof itineraryCollaborators.$inferSelect;
export type InsertItineraryCollaborator = typeof itineraryCollaborators.$inferInsert;

export const itineraryChangelog = pgTable("itinerary_changelog", {
  id: serial("id").primaryKey(),
  itineraryId: integer("itinerary_id").notNull().references(() => touristItineraries.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  action: varchar("action", { length: 64 }).notNull(), // add_item|edit_item|remove_item|update_itinerary|invite_collaborator
  itemId: integer("item_id"),
  diff: jsonb("diff"), // { before: {...}, after: {...} }
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type ItineraryChangelogEntry = typeof itineraryChangelog.$inferSelect;
export type InsertItineraryChangelogEntry = typeof itineraryChangelog.$inferInsert;

// ─── Establishment Score Snapshots (weekly leaderboard trend) ────────────────
export const establishmentScoreSnapshots = pgTable(
  "establishment_score_snapshots",
  {
    id: serial("id").primaryKey(),
    establishmentId: integer("establishment_id")
      .notNull()
      .references(() => establishments.id, { onDelete: "cascade" }),
    compositeScore: integer("composite_score").notNull().default(0),
    bookingCount: integer("booking_count").notNull().default(0),
    avgRating: decimal("avg_rating", { precision: 3, scale: 1 }).notNull().default("0"),
    responseRate: integer("response_rate").notNull().default(0), // 0-100
    snapshotDate: varchar("snapshot_date", { length: 10 }).notNull(), // YYYY-MM-DD (Monday of the week)
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("est_snapshot_est_idx").on(t.establishmentId),
    index("est_snapshot_date_idx").on(t.snapshotDate),
    // Unique per establishment per week
    uniqueIndex("est_snapshot_unique").on(t.establishmentId, t.snapshotDate),
  ]
);
export type EstablishmentScoreSnapshot = typeof establishmentScoreSnapshots.$inferSelect;
export type InsertEstablishmentScoreSnapshot = typeof establishmentScoreSnapshots.$inferInsert;

// ─── Service Availability Calendar ───────────────────────────────────────────
// Tracks per-date slot availability for each merchant product/service.
// totalSlots=0 means unlimited (open); isBlocked=true means fully closed for that date.
export const serviceAvailability = pgTable(
  "service_availability",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => merchantProducts.id, { onDelete: "cascade" }),
    establishmentId: integer("establishment_id")
      .notNull()
      .references(() => establishments.id, { onDelete: "cascade" }),
    date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
    totalSlots: integer("total_slots").notNull().default(0), // 0 = unlimited
    bookedSlots: integer("booked_slots").notNull().default(0),
    isBlocked: boolean("is_blocked").notNull().default(false),
    notes: text("notes"), // e.g. "Maintenance", "Public holiday"
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("sav_product_idx").on(t.productId),
    index("sav_est_idx").on(t.establishmentId),
    index("sav_date_idx").on(t.date),
    // One availability record per product per date
    uniqueIndex("sav_product_date_unique").on(t.productId, t.date),
  ]
);
export type ServiceAvailability = typeof serviceAvailability.$inferSelect;
export type InsertServiceAvailability = typeof serviceAvailability.$inferInsert;

// ─── KYC Verification Records (Tourist identity verification) ─────────────────
export const kycVerificationRecords = pgTable(
  "kyc_verification_records",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 128 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    documentType: varchar("document_type", { length: 32 }),
    documentCountry: varchar("document_country", { length: 3 }),
    documentNumberHash: varchar("document_number_hash", { length: 128 }),
    fullNameEncrypted: text("full_name_encrypted"),
    dateOfBirth: varchar("date_of_birth", { length: 16 }),
    nationality: varchar("nationality", { length: 3 }),
    livenessScore: real("liveness_score"),
    documentMatchScore: real("document_match_score"),
    riskScore: real("risk_score"),
    sanctionsClear: boolean("sanctions_clear"),
    pepClear: boolean("pep_clear"),
    reviewerId: varchar("reviewer_id", { length: 128 }),
    rejectionReason: text("rejection_reason"),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("kyc_user_idx").on(t.userId),
    index("kyc_status_idx").on(t.status),
    index("kyc_doc_hash_idx").on(t.documentNumberHash),
  ]
);
export type KycVerificationRecord = typeof kycVerificationRecords.$inferSelect;
export type InsertKycVerificationRecord = typeof kycVerificationRecords.$inferInsert;


// ─── Channel Manager ─────────────────────────────────────────────────────────
export const channelConnections = pgTable(
  "channel_connections",
  {
    id: serial("id").primaryKey(),
    establishmentId: integer("establishment_id")
      .references(() => establishments.id)
      .notNull(),
    channelName: varchar("channel_name", { length: 50 }).notNull(),
    displayName: varchar("display_name", { length: 100 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    config: jsonb("config").default({}),
    lastSyncAt: timestamp("last_sync_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("channel_conn_est_idx").on(t.establishmentId),
    index("channel_conn_name_idx").on(t.channelName),
  ]
);
export type ChannelConnection = typeof channelConnections.$inferSelect;
export type InsertChannelConnection = typeof channelConnections.$inferInsert;
