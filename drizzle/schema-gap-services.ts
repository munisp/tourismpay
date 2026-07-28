// drizzle/schema-gap-services.ts
// Database schema for TourismPay Gap Services (15 new microservices)
// Tables: BNPL, Direct Booking, Group Travel, e-Visa, DCC, PMS, AI Sessions,
//         Revenue Recommendations, Tourism Intelligence, Open Banking,
//         Diaspora Gifts, White Label Tenants, Geospatial Zones

import {
  pgTable,
  text,
  varchar,
  integer,
  decimal,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const bnplStatusEnum = pgEnum("bnpl_status", [
  "active", "completed", "cancelled", "defaulted",
]);

export const bnplInstalmentStatusEnum = pgEnum("bnpl_instalment_status", [
  "pending", "paid", "overdue", "waived", "cancelled",
]);

export const directBookingStatusEnum = pgEnum("direct_booking_status", [
  "pending", "confirmed", "checked_in", "checked_out", "cancelled", "no_show",
]);

export const groupBookingStatusEnum = pgEnum("group_booking_status", [
  "draft", "confirmed", "deposit_paid", "in_progress", "completed", "cancelled",
]);

export const evisaStatusEnum = pgEnum("evisa_status", [
  "initiated", "processing", "approved", "rejected", "refunded",
]);

export const dccDecisionEnum = pgEnum("dcc_decision", [
  "accepted", "declined", "expired",
]);

export const pmsProviderEnum = pgEnum("pms_provider", [
  "oracle_opera", "cloudbeds", "mews", "protel", "hotelogix", "custom",
]);

export const pmsConnectionStatusEnum = pgEnum("pms_connection_status", [
  "connected", "disconnected", "error", "syncing",
]);

export const aiSessionStatusEnum = pgEnum("ai_session_status", [
  "active", "completed", "failed", "abandoned",
]);

export const openBankingStatusEnum = pgEnum("open_banking_status", [
  "pending", "connected", "disconnected", "error",
]);

export const diasporaGiftStatusEnum = pgEnum("diaspora_gift_status", [
  "active", "redeemed", "expired", "cancelled",
]);

export const whiteLabelStatusEnum = pgEnum("white_label_status", [
  "draft", "active", "suspended", "terminated",
]);

// ─── BNPL Plans ───────────────────────────────────────────────────────────────

export const bnplPlans = pgTable("bnpl_plans", {
  id: varchar("id", { length: 64 }).primaryKey(),
  touristId: varchar("tourist_id", { length: 64 }).notNull(),
  hotelId: varchar("hotel_id", { length: 64 }).notNull(),
  totalAmount: decimal("total_amount", { precision: 18, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("NGN"),
  instalments: integer("instalments").notNull(),
  instalmentAmount: decimal("instalment_amount", { precision: 18, scale: 2 }).notNull(),
  paidCount: integer("paid_count").notNull().default(0),
  status: bnplStatusEnum("status").notNull().default("active"),
  riskPremiumPct: decimal("risk_premium_pct", { precision: 5, scale: 2 }).notNull().default("2.00"),
  tigerBeetleEscrowId: varchar("tigerbeetle_escrow_id", { length: 64 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  nextDueDate: timestamp("next_due_date"),
  completedAt: timestamp("completed_at"),
  cancelledAt: timestamp("cancelled_at"),
}, (t) => ({
  idxTourist: index("idx_bnpl_plans_tourist_id").on(t.touristId),
  idxHotel: index("idx_bnpl_plans_hotel_id").on(t.hotelId),
  idxStatus: index("idx_bnpl_plans_status").on(t.status),
  idxDueDate: index("idx_bnpl_plans_due_date").on(t.nextDueDate),
}));

export const bnplInstalments = pgTable("bnpl_instalments", {
  id: varchar("id", { length: 64 }).primaryKey(),
  planId: varchar("plan_id", { length: 64 }).notNull().references(() => bnplPlans.id),
  number: integer("number").notNull(),
  amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("NGN"),
  dueDate: timestamp("due_date").notNull(),
  paidAt: timestamp("paid_at"),
  paymentRef: varchar("payment_ref", { length: 128 }),
  status: bnplInstalmentStatusEnum("status").notNull().default("pending"),
}, (t) => ({
  idxPlan: index("idx_bnpl_instalments_plan_id").on(t.planId),
  idxStatus: index("idx_bnpl_instalments_status").on(t.status),
  idxDueDate: index("idx_bnpl_instalments_due_date").on(t.dueDate),
}));

// ─── Direct Bookings ──────────────────────────────────────────────────────────

export const directBookings = pgTable("direct_bookings", {
  id: varchar("id", { length: 64 }).primaryKey(),
  hotelId: varchar("hotel_id", { length: 64 }).notNull(),
  hotelSlug: varchar("hotel_slug", { length: 128 }).notNull(),
  guestName: varchar("guest_name", { length: 256 }).notNull(),
  guestEmail: varchar("guest_email", { length: 256 }).notNull(),
  guestPhone: varchar("guest_phone", { length: 32 }),
  guestPassport: varchar("guest_passport", { length: 32 }),
  roomType: varchar("room_type", { length: 128 }).notNull(),
  checkIn: timestamp("check_in").notNull(),
  checkOut: timestamp("check_out").notNull(),
  nights: integer("nights").notNull(),
  ratePerNight: decimal("rate_per_night", { precision: 18, scale: 2 }).notNull(),
  totalAmount: decimal("total_amount", { precision: 18, scale: 2 }).notNull(),
  depositAmount: decimal("deposit_amount", { precision: 18, scale: 2 }),
  currency: varchar("currency", { length: 3 }).notNull().default("NGN"),
  status: directBookingStatusEnum("status").notNull().default("pending"),
  stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 128 }),
  confirmationCode: varchar("confirmation_code", { length: 16 }),
  specialRequests: text("special_requests"),
  source: varchar("source", { length: 32 }).notNull().default("direct"), // direct, ota_redirect
  createdAt: timestamp("created_at").notNull().defaultNow(),
  confirmedAt: timestamp("confirmed_at"),
  cancelledAt: timestamp("cancelled_at"),
}, (t) => ({
  idxHotel: index("idx_direct_bookings_hotel_id").on(t.hotelId),
  idxSlug: index("idx_direct_bookings_slug").on(t.hotelSlug),
  idxEmail: index("idx_direct_bookings_email").on(t.guestEmail),
  idxStatus: index("idx_direct_bookings_status").on(t.status),
  idxCheckIn: index("idx_direct_bookings_check_in").on(t.checkIn),
  idxConfirmation: uniqueIndex("idx_direct_bookings_confirmation").on(t.confirmationCode),
}));

// ─── Group Travel / MICE ──────────────────────────────────────────────────────

export const groupBookings = pgTable("group_bookings", {
  id: varchar("id", { length: 64 }).primaryKey(),
  groupName: varchar("group_name", { length: 256 }).notNull(),
  organizerId: varchar("organizer_id", { length: 64 }).notNull(),
  organizerEmail: varchar("organizer_email", { length: 256 }).notNull(),
  hotelId: varchar("hotel_id", { length: 64 }).notNull(),
  eventType: varchar("event_type", { length: 64 }).notNull(), // conference, wedding, corporate, leisure
  paxCount: integer("pax_count").notNull(),
  roomsRequired: integer("rooms_required").notNull(),
  checkIn: timestamp("check_in").notNull(),
  checkOut: timestamp("check_out").notNull(),
  nights: integer("nights").notNull(),
  ratePerRoomPerNight: decimal("rate_per_room_per_night", { precision: 18, scale: 2 }).notNull(),
  totalAmount: decimal("total_amount", { precision: 18, scale: 2 }).notNull(),
  depositAmount: decimal("deposit_amount", { precision: 18, scale: 2 }).notNull(),
  depositPaid: decimal("deposit_paid", { precision: 18, scale: 2 }).notNull().default("0"),
  attritionPct: decimal("attrition_pct", { precision: 5, scale: 2 }).notNull().default("20.00"),
  currency: varchar("currency", { length: 3 }).notNull().default("NGN"),
  status: groupBookingStatusEnum("status").notNull().default("draft"),
  contractUrl: varchar("contract_url", { length: 512 }),
  invoiceUrl: varchar("invoice_url", { length: 512 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  confirmedAt: timestamp("confirmed_at"),
  completedAt: timestamp("completed_at"),
  cancelledAt: timestamp("cancelled_at"),
}, (t) => ({
  idxOrganizer: index("idx_group_bookings_organizer_id").on(t.organizerId),
  idxHotel: index("idx_group_bookings_hotel_id").on(t.hotelId),
  idxStatus: index("idx_group_bookings_status").on(t.status),
  idxCheckIn: index("idx_group_bookings_check_in").on(t.checkIn),
}));

// ─── e-Visa Payments ──────────────────────────────────────────────────────────

export const evisaPayments = pgTable("evisa_payments", {
  id: varchar("id", { length: 64 }).primaryKey(),
  touristId: varchar("tourist_id", { length: 64 }).notNull(),
  passportNumber: varchar("passport_number", { length: 32 }).notNull(),
  nationality: varchar("nationality", { length: 3 }).notNull(), // ISO country code
  visaType: varchar("visa_type", { length: 32 }).notNull(), // tourist, business, transit
  durationDays: integer("duration_days").notNull(),
  feeAmount: decimal("fee_amount", { precision: 18, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  feeAmountNgn: decimal("fee_amount_ngn", { precision: 18, scale: 2 }),
  exchangeRate: decimal("exchange_rate", { precision: 18, scale: 6 }),
  status: evisaStatusEnum("status").notNull().default("initiated"),
  nisReferenceId: varchar("nis_reference_id", { length: 128 }), // Nigeria Immigration Service ref
  walletTransactionId: varchar("wallet_transaction_id", { length: 64 }),
  idempotencyKey: varchar("idempotency_key", { length: 128 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  processedAt: timestamp("processed_at"),
  approvedAt: timestamp("approved_at"),
}, (t) => ({
  idxTourist: index("idx_evisa_payments_tourist_id").on(t.touristId),
  idxStatus: index("idx_evisa_payments_status").on(t.status),
  idxPassport: index("idx_evisa_payments_passport").on(t.passportNumber),
  idxIdempotency: uniqueIndex("idx_evisa_payments_idempotency").on(t.idempotencyKey),
}));

// ─── DCC Transactions ─────────────────────────────────────────────────────────

export const dccTransactions = pgTable("dcc_transactions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  merchantId: varchar("merchant_id", { length: 64 }).notNull(),
  touristId: varchar("tourist_id", { length: 64 }),
  originalAmountNgn: decimal("original_amount_ngn", { precision: 18, scale: 2 }).notNull(),
  convertedAmount: decimal("converted_amount", { precision: 18, scale: 2 }).notNull(),
  homeCurrency: varchar("home_currency", { length: 3 }).notNull(),
  exchangeRate: decimal("exchange_rate", { precision: 18, scale: 6 }).notNull(),
  spreadPct: decimal("spread_pct", { precision: 5, scale: 2 }).notNull().default("3.00"),
  spreadRevenueNgn: decimal("spread_revenue_ngn", { precision: 18, scale: 2 }).notNull(),
  decision: dccDecisionEnum("decision").notNull(),
  walletTransactionId: varchar("wallet_transaction_id", { length: 64 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  decidedAt: timestamp("decided_at"),
}, (t) => ({
  idxMerchant: index("idx_dcc_transactions_merchant_id").on(t.merchantId),
  idxDate: index("idx_dcc_transactions_created_at").on(t.createdAt),
  idxCurrency: index("idx_dcc_transactions_currency").on(t.homeCurrency),
}));

// ─── PMS Connections ──────────────────────────────────────────────────────────

export const pmsConnections = pgTable("pms_connections", {
  id: varchar("id", { length: 64 }).primaryKey(),
  hotelId: varchar("hotel_id", { length: 64 }).notNull(),
  provider: pmsProviderEnum("provider").notNull(),
  apiEndpoint: varchar("api_endpoint", { length: 512 }).notNull(),
  apiKeyHash: varchar("api_key_hash", { length: 128 }), // hashed, never stored plain
  propertyId: varchar("property_id", { length: 128 }),
  status: pmsConnectionStatusEnum("status").notNull().default("disconnected"),
  lastSyncAt: timestamp("last_sync_at"),
  lastSyncError: text("last_sync_error"),
  syncIntervalMinutes: integer("sync_interval_minutes").notNull().default(15),
  webhookSecret: varchar("webhook_secret", { length: 128 }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  idxHotel: index("idx_pms_connections_hotel_id").on(t.hotelId),
  idxStatus: index("idx_pms_connections_status").on(t.status),
  idxHotelProvider: uniqueIndex("idx_pms_connections_hotel_provider").on(t.hotelId, t.provider),
}));

export const pmsFolioCharges = pgTable("pms_folio_charges", {
  id: varchar("id", { length: 64 }).primaryKey(),
  connectionId: varchar("connection_id", { length: 64 }).notNull().references(() => pmsConnections.id),
  reservationId: varchar("reservation_id", { length: 128 }).notNull(),
  guestName: varchar("guest_name", { length: 256 }),
  chargeType: varchar("charge_type", { length: 64 }).notNull(), // room, fnb, spa, minibar, misc
  amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  description: text("description"),
  pmsChargeId: varchar("pms_charge_id", { length: 128 }),
  walletTransactionId: varchar("wallet_transaction_id", { length: 64 }),
  settled: boolean("settled").notNull().default(false),
  settledAt: timestamp("settled_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  idxConnection: index("idx_pms_folio_charges_connection_id").on(t.connectionId),
  idxReservation: index("idx_pms_folio_charges_reservation_id").on(t.reservationId),
  idxSettled: index("idx_pms_folio_charges_settled").on(t.settled),
}));

// ─── AI Booking Sessions ──────────────────────────────────────────────────────

export const aiBookingSessions = pgTable("ai_booking_sessions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: varchar("user_id", { length: 64 }).notNull(),
  status: aiSessionStatusEnum("status").notNull().default("active"),
  intent: varchar("intent", { length: 128 }), // book_hotel, plan_trip, find_restaurant
  messages: jsonb("messages").notNull().default([]), // [{role, content, timestamp}]
  toolCalls: jsonb("tool_calls").default([]), // function calls made by AI
  bookingResult: jsonb("booking_result"), // final booking created
  totalTokens: integer("total_tokens").notNull().default(0),
  modelUsed: varchar("model_used", { length: 64 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
}, (t) => ({
  idxUser: index("idx_ai_booking_sessions_user_id").on(t.userId),
  idxStatus: index("idx_ai_booking_sessions_status").on(t.status),
  idxCreated: index("idx_ai_booking_sessions_created_at").on(t.createdAt),
}));

// ─── Revenue Recommendations ──────────────────────────────────────────────────

export const revenueRecommendations = pgTable("revenue_recommendations", {
  id: varchar("id", { length: 64 }).primaryKey(),
  hotelId: varchar("hotel_id", { length: 64 }).notNull(),
  roomType: varchar("room_type", { length: 128 }),
  currentRate: decimal("current_rate", { precision: 18, scale: 2 }).notNull(),
  recommendedRate: decimal("recommended_rate", { precision: 18, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("NGN"),
  confidenceScore: decimal("confidence_score", { precision: 5, scale: 2 }).notNull(),
  reasoning: text("reasoning").notNull(),
  demandForecast: jsonb("demand_forecast"), // {date, occupancy_pct, demand_index}[]
  competitorRates: jsonb("competitor_rates"), // {name, rate}[]
  applied: boolean("applied").notNull().default(false),
  appliedAt: timestamp("applied_at"),
  validFrom: timestamp("valid_from").notNull(),
  validTo: timestamp("valid_to").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  idxHotel: index("idx_revenue_recommendations_hotel_id").on(t.hotelId),
  idxApplied: index("idx_revenue_recommendations_applied").on(t.applied),
  idxValid: index("idx_revenue_recommendations_valid").on(t.validFrom, t.validTo),
}));

// ─── Tourism Intelligence Snapshots ───────────────────────────────────────────

export const tourismIntelligenceSnapshots = pgTable("tourism_intelligence_snapshots", {
  id: varchar("id", { length: 64 }).primaryKey(),
  snapshotDate: timestamp("snapshot_date").notNull(),
  periodType: varchar("period_type", { length: 16 }).notNull().default("daily"), // daily, weekly, monthly
  totalArrivals: integer("total_arrivals").notNull().default(0),
  totalSpendNgn: decimal("total_spend_ngn", { precision: 24, scale: 2 }).notNull().default("0"),
  avgSpendPerVisit: decimal("avg_spend_per_visit", { precision: 18, scale: 2 }),
  fxInflowUsd: decimal("fx_inflow_usd", { precision: 24, scale: 2 }).notNull().default("0"),
  topOriginCountries: jsonb("top_origin_countries"), // [{country, count, spend_ngn}]
  topEstablishments: jsonb("top_establishments"), // [{id, name, revenue_ngn}]
  occupancyByCity: jsonb("occupancy_by_city"), // [{city, occupancy_pct}]
  spendByCategory: jsonb("spend_by_category"), // [{category, amount_ngn}]
  activeWallets: integer("active_wallets").notNull().default(0),
  newRegistrations: integer("new_registrations").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  idxDate: index("idx_tourism_intelligence_date").on(t.snapshotDate),
  idxPeriod: index("idx_tourism_intelligence_period").on(t.periodType),
  idxUnique: uniqueIndex("idx_tourism_intelligence_unique").on(t.snapshotDate, t.periodType),
}));

// ─── Open Banking Connections ─────────────────────────────────────────────────

export const openBankingConnections = pgTable("open_banking_connections", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: varchar("user_id", { length: 64 }).notNull(),
  provider: varchar("provider", { length: 32 }).notNull(), // mono, okra
  accountId: varchar("account_id", { length: 128 }).notNull(),
  bankCode: varchar("bank_code", { length: 16 }).notNull(),
  bankName: varchar("bank_name", { length: 128 }).notNull(),
  accountNumber: varchar("account_number", { length: 32 }), // masked
  accountName: varchar("account_name", { length: 256 }),
  currency: varchar("currency", { length: 3 }).notNull().default("NGN"),
  status: openBankingStatusEnum("status").notNull().default("pending"),
  accessToken: varchar("access_token", { length: 512 }), // encrypted
  refreshToken: varchar("refresh_token", { length: 512 }), // encrypted
  tokenExpiresAt: timestamp("token_expires_at"),
  lastTopupAt: timestamp("last_topup_at"),
  totalTopupNgn: decimal("total_topup_ngn", { precision: 24, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  disconnectedAt: timestamp("disconnected_at"),
}, (t) => ({
  idxUser: index("idx_open_banking_connections_user_id").on(t.userId),
  idxStatus: index("idx_open_banking_connections_status").on(t.status),
  idxUserProvider: uniqueIndex("idx_open_banking_connections_user_provider").on(t.userId, t.provider, t.accountId),
}));

// ─── Diaspora Gift Cards ───────────────────────────────────────────────────────

export const diasporaGifts = pgTable("diaspora_gifts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  senderId: varchar("sender_id", { length: 64 }).notNull(),
  senderName: varchar("sender_name", { length: 256 }).notNull(),
  recipientId: varchar("recipient_id", { length: 64 }),
  recipientEmail: varchar("recipient_email", { length: 256 }),
  recipientPhone: varchar("recipient_phone", { length: 32 }),
  giftType: varchar("gift_type", { length: 32 }).notNull(), // hotel_stay, dining, experience, wallet_credit
  establishmentId: varchar("establishment_id", { length: 64 }),
  amountNgn: decimal("amount_ngn", { precision: 18, scale: 2 }).notNull(),
  amountSenderCurrency: decimal("amount_sender_currency", { precision: 18, scale: 2 }).notNull(),
  senderCurrency: varchar("sender_currency", { length: 3 }).notNull(),
  exchangeRate: decimal("exchange_rate", { precision: 18, scale: 6 }).notNull(),
  message: text("message"),
  redemptionCode: varchar("redemption_code", { length: 16 }).notNull(),
  status: diasporaGiftStatusEnum("status").notNull().default("active"),
  expiresAt: timestamp("expires_at").notNull(),
  redeemedAt: timestamp("redeemed_at"),
  walletTransactionId: varchar("wallet_transaction_id", { length: 64 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  idxSender: index("idx_diaspora_gifts_sender_id").on(t.senderId),
  idxRecipient: index("idx_diaspora_gifts_recipient_id").on(t.recipientId),
  idxStatus: index("idx_diaspora_gifts_status").on(t.status),
  idxRedemption: uniqueIndex("idx_diaspora_gifts_redemption_code").on(t.redemptionCode),
  idxExpiry: index("idx_diaspora_gifts_expires_at").on(t.expiresAt),
}));

// ─── White Label Tenants ──────────────────────────────────────────────────────

export const whiteLabelTenants = pgTable("white_label_tenants", {
  id: varchar("id", { length: 64 }).primaryKey(),
  ownerId: varchar("owner_id", { length: 64 }).notNull(),
  tenantName: varchar("tenant_name", { length: 256 }).notNull(),
  subdomain: varchar("subdomain", { length: 128 }).notNull(),
  customDomain: varchar("custom_domain", { length: 256 }),
  logoUrl: varchar("logo_url", { length: 512 }),
  primaryColor: varchar("primary_color", { length: 7 }).default("#000000"),
  secondaryColor: varchar("secondary_color", { length: 7 }).default("#ffffff"),
  supportedCurrencies: jsonb("supported_currencies").default(["NGN"]),
  supportedCorridors: jsonb("supported_corridors"), // [{from, to}]
  enabledFeatures: jsonb("enabled_features").default({}), // {bnpl, insurance, evisa, ...}
  commissionPct: decimal("commission_pct", { precision: 5, scale: 2 }).notNull().default("1.50"),
  status: whiteLabelStatusEnum("status").notNull().default("draft"),
  deployedAt: timestamp("deployed_at"),
  suspendedAt: timestamp("suspended_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  idxOwner: index("idx_white_label_tenants_owner_id").on(t.ownerId),
  idxStatus: index("idx_white_label_tenants_status").on(t.status),
  idxSubdomain: uniqueIndex("idx_white_label_tenants_subdomain").on(t.subdomain),
  idxDomain: uniqueIndex("idx_white_label_tenants_domain").on(t.customDomain),
}));

// ─── Geospatial Loyalty Zones ─────────────────────────────────────────────────

export const geospatialLoyaltyZones = pgTable("geospatial_loyalty_zones", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  city: varchar("city", { length: 128 }).notNull(),
  country: varchar("country", { length: 3 }).notNull().default("NGA"),
  centerLat: decimal("center_lat", { precision: 10, scale: 7 }).notNull(),
  centerLng: decimal("center_lng", { precision: 10, scale: 7 }).notNull(),
  radiusMetres: integer("radius_metres").notNull().default(1000),
  loyaltyMultiplier: decimal("loyalty_multiplier", { precision: 4, scale: 2 }).notNull().default("1.50"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  idxCity: index("idx_geo_zones_city").on(t.city),
  idxActive: index("idx_geo_zones_active").on(t.active),
}));
