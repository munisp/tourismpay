/**
 * schema-platform.ts
 * Platform operations, SLA, health monitoring, and notification channel tables.
 * These were referenced by production-branch routers but missing from schema.
 */
import {
  boolean,
  decimal,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

// ─── Platform Health Checks ───────────────────────────────────────────────────

export const platformHealthChecks = pgTable(
  "platform_health_checks",
  {
    id: serial("id").primaryKey(),
    service: varchar("service", { length: 100 }).notNull(),
    status: varchar("status", { length: 50 }).notNull().default("healthy"), // healthy | degraded | down
    latencyMs: integer("latency_ms"),
    errorMessage: text("error_message"),
    checkedAt: timestamp("checked_at").defaultNow().notNull(),
    metadata: jsonb("metadata"),
  
  serviceName: varchar("service_name", { length: 255 }),
  checkType: varchar("check_type", { length: 100 }).default("http"),
  responseTime: integer("response_time"),
  },
  (t) => [
    index("phc_service_idx").on(t.service),
    index("phc_status_idx").on(t.status),
    index("phc_checked_at_idx").on(t.checkedAt),
  ]
);
export const platform_health_checks = platformHealthChecks;
export type PlatformHealthCheck = typeof platformHealthChecks.$inferSelect;
export type InsertPlatformHealthCheck = typeof platformHealthChecks.$inferInsert;

// ─── Platform Incidents ───────────────────────────────────────────────────────

export const platformIncidents = pgTable(
  "platform_incidents",
  {
    id: serial("id").primaryKey(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    severity: varchar("severity", { length: 50 }).notNull().default("medium"), // low | medium | high | critical
    status: varchar("status", { length: 50 }).notNull().default("open"), // open | investigating | resolved | postmortem
    affectedServices: jsonb("affected_services").$type<string[]>().default([]),
    rootCause: text("root_cause"),
    resolution: text("resolution"),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at"),
    createdBy: integer("created_by"),
    assignedTo: integer("assigned_to"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("pi_severity_idx").on(t.severity),
    index("pi_status_idx").on(t.status),
    index("pi_started_at_idx").on(t.startedAt),
  ]
);
export const platform_incidents = platformIncidents;
export type PlatformIncident = typeof platformIncidents.$inferSelect;
export type InsertPlatformIncident = typeof platformIncidents.$inferInsert;

// ─── Notification Channels ────────────────────────────────────────────────────

export const notificationChannels = pgTable(
  "notification_channels",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    type: varchar("type", { length: 50 }).notNull(), // email | sms | push | webhook | slack
    config: jsonb("config").notNull().default({}), // channel-specific config (webhook URL, SMTP settings, etc.)
    isActive: boolean("is_active").notNull().default(true),
    userId: integer("user_id"), // null = system-wide channel
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("nc_type_idx").on(t.type),
    index("nc_user_id_idx").on(t.userId),
  ]
);
export const notification_channels = notificationChannels;
export type NotificationChannel = typeof notificationChannels.$inferSelect;
export type InsertNotificationChannel = typeof notificationChannels.$inferInsert;

// ─── Realtime Transaction Alerts ─────────────────────────────────────────────

export const realtimeTxAlerts = pgTable(
  "realtime_tx_alerts",
  {
    id: serial("id").primaryKey(),
    alertId: varchar("alert_id", { length: 50 }).notNull().unique(),
    transactionId: varchar("transaction_id", { length: 100 }),
    userId: integer("user_id"),
    alertType: varchar("alert_type", { length: 100 }).notNull(), // large_tx | velocity | geo_anomaly | device_change
    severity: varchar("severity", { length: 50 }).notNull().default("medium"),
    status: varchar("status", { length: 50 }).notNull().default("pending"), // pending | notified | acknowledged | dismissed
    amount: decimal("amount", { precision: 15, scale: 2 }),
    currency: varchar("currency", { length: 3 }),
    metadata: jsonb("metadata"),
    triggeredAt: timestamp("triggered_at").defaultNow().notNull(),
    acknowledgedAt: timestamp("acknowledged_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("rta_user_id_idx").on(t.userId),
    index("rta_status_idx").on(t.status),
    index("rta_triggered_at_idx").on(t.triggeredAt),
  ]
);
export const realtime_tx_alerts = realtimeTxAlerts;
export type RealtimeTxAlert = typeof realtimeTxAlerts.$inferSelect;
export type InsertRealtimeTxAlert = typeof realtimeTxAlerts.$inferInsert;

// ─── SLA Definitions ─────────────────────────────────────────────────────────

export const slaDefinitions = pgTable(
  "sla_definitions",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    service: varchar("service", { length: 100 }).notNull(),
    metricType: varchar("metric_type", { length: 100 }).notNull(), // uptime | latency | error_rate | throughput
    targetValue: decimal("target_value", { precision: 10, scale: 4 }).notNull(),
    unit: varchar("unit", { length: 50 }).notNull(), // percent | ms | rpm
    windowHours: integer("window_hours").notNull().default(24),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("sla_def_service_idx").on(t.service),
  ]
);
export const sla_definitions = slaDefinitions;
export type SlaDefinition = typeof slaDefinitions.$inferSelect;
export type InsertSlaDefinition = typeof slaDefinitions.$inferInsert;

// ─── SLA Breaches ─────────────────────────────────────────────────────────────

export const slaBreaches = pgTable(
  "sla_breaches",
  {
    id: serial("id").primaryKey(),
    slaDefinitionId: integer("sla_definition_id").references(() => slaDefinitions.id),
    service: varchar("service", { length: 100 }).notNull(),
    metricType: varchar("metric_type", { length: 100 }).notNull(),
    actualValue: decimal("actual_value", { precision: 10, scale: 4 }).notNull(),
    targetValue: decimal("target_value", { precision: 10, scale: 4 }).notNull(),
    breachStartedAt: timestamp("breach_started_at").notNull(),
    breachResolvedAt: timestamp("breach_resolved_at"),
    durationMinutes: integer("duration_minutes"),
    severity: varchar("severity", { length: 50 }).notNull().default("medium"),
    notified: boolean("notified").notNull().default(false),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  
  resolvedAt: timestamp("resolved_at"),
},
  (t) => [
    index("sla_breach_service_idx").on(t.service),
    index("sla_breach_started_idx").on(t.breachStartedAt),
  ]
);
export const sla_breaches = slaBreaches;
export type SlaBreach = typeof slaBreaches.$inferSelect;
export type InsertSlaBreach = typeof slaBreaches.$inferInsert;

// ─── Operational Runbooks ─────────────────────────────────────────────────────

export const operationalRunbooks = pgTable(
  "operational_runbooks",
  {
    id: serial("id").primaryKey(),
    title: varchar("title", { length: 255 }).notNull(),
    category: varchar("category", { length: 100 }).notNull(), // incident | maintenance | deployment | security
    content: text("content").notNull(),
    version: integer("version").notNull().default(1),
    isActive: boolean("is_active").notNull().default(true),
    tags: jsonb("tags").$type<string[]>().default([]),
    createdBy: integer("created_by"),
    updatedBy: integer("updated_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("runbook_category_idx").on(t.category),
  ]
);
export type OperationalRunbook = typeof operationalRunbooks.$inferSelect;
export type InsertOperationalRunbook = typeof operationalRunbooks.$inferInsert;

// ─── Platform Config Center ───────────────────────────────────────────────────

export const platformConfigs = pgTable(
  "platform_configs",
  {
    id: serial("id").primaryKey(),
    key: varchar("key", { length: 255 }).notNull().unique(),
    value: jsonb("value").notNull(),
    description: text("description"),
    category: varchar("category", { length: 100 }),
    isSecret: boolean("is_secret").notNull().default(false),
    updatedBy: integer("updated_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("pc_category_idx").on(t.category),
  ]
);
export type PlatformConfig = typeof platformConfigs.$inferSelect;
export type InsertPlatformConfig = typeof platformConfigs.$inferInsert;

// ─── i18n Locales ─────────────────────────────────────────────────────────────

export const i18nLocales = pgTable(
  "i18n_locales",
  {
    id: serial("id").primaryKey(),
    code: varchar("code", { length: 10 }).notNull().unique(), // en, fr, sw, ar, etc.
    name: varchar("name", { length: 100 }).notNull(),
    nativeName: varchar("native_name", { length: 100 }),
    isActive: boolean("is_active").notNull().default(true),
    isRtl: boolean("is_rtl").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  }
);
export type I18nLocale = typeof i18nLocales.$inferSelect;


