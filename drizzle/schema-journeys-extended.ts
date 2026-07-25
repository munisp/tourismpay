/**
 * TourismPay Extended Journey Schemas
 * Covers all 20 additional tourist journey scenarios
 */

import { pgTable, serial, text, integer, boolean, real, jsonb } from "drizzle-orm/pg-core";

// ─── ITINERARY ENGINE ─────────────────────────────────────────────────────────

export const itineraries = pgTable("itineraries", {
  id: text("id").primaryKey(),
  touristProfileId: text("tourist_profile_id"),
  userId: integer("user_id"),
  title: text("title").notNull(),
  description: text("description"),
  destination: text("destination").default("Lagos, Nigeria"),
  startDate: text("start_date").notNull(), // YYYY-MM-DD
  endDate: text("end_date").notNull(),
  totalDays: integer("total_days").notNull(),
  totalBudgetNgn: real("total_budget_ngn"),
  spentNgn: real("spent_ngn").default(0),
  currency: text("currency").default("NGN"),
  status: text("status").default("draft"), // draft|active|completed|cancelled
  aiGenerated: boolean("ai_generated").default(false),
  aiPrompt: text("ai_prompt"), // original user prompt for AI-generated itineraries
  journeyType: text("journey_type"), // airport_arrival|nightlife|cultural|fashion_week|sports|fine_dining|...
  tags: jsonb("tags").default("[]"), // ["luxury","adventure","cultural","family","business"]
  isShared: boolean("is_shared").default(false),
  shareCode: text("share_code"), // for group itinerary sharing
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
  updatedAt: integer("updated_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const itineraryDays = pgTable("itinerary_days", {
  id: text("id").primaryKey(),
  itineraryId: text("itinerary_id").notNull(),
  dayNumber: integer("day_number").notNull(), // 1, 2, 3...
  date: text("date").notNull(), // YYYY-MM-DD
  title: text("title"), // "Day 1 — Arrival & Settle In"
  theme: text("theme"), // "arrival"|"exploration"|"nightlife"|"departure"
  notes: text("notes"),
  totalCostNgn: real("total_cost_ngn").default(0),
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const itineraryItems = pgTable("itinerary_items", {
  id: text("id").primaryKey(),
  itineraryId: text("itinerary_id").notNull(),
  dayId: text("day_id").notNull(),
  sortOrder: integer("sort_order").default(0),
  itemType: text("item_type").notNull(), // hotel|restaurant|transport|event|attraction|activity|shopping|service
  title: text("title").notNull(),
  description: text("description"),
  merchantId: text("merchant_id"),
  merchantName: text("merchant_name"),
  location: text("location"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  startTime: text("start_time"), // HH:MM
  endTime: text("end_time"),
  durationMinutes: integer("duration_minutes"),
  estimatedCostNgn: real("estimated_cost_ngn").default(0),
  actualCostNgn: real("actual_cost_ngn"),
  status: text("status").default("planned"), // planned|booked|confirmed|completed|cancelled|skipped
  bookingReferenceId: text("booking_reference_id"), // FK to specific booking table
  bookingType: text("booking_type"), // hotel_booking|property_booking|transport_booking|event_ticket|restaurant_reservation
  paymentTransactionId: text("payment_transaction_id"),
  notes: text("notes"),
  aiSuggested: boolean("ai_suggested").default(false),
  aiReason: text("ai_reason"), // why AI suggested this item
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
  updatedAt: integer("updated_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const itineraryCollaborators = pgTable("itinerary_collaborators", {
  id: text("id").primaryKey(),
  itineraryId: text("itinerary_id").notNull(),
  userId: integer("user_id"),
  email: text("email"),
  role: text("role").default("viewer"), // owner|editor|viewer
  invitedAt: integer("invited_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
  acceptedAt: integer("accepted_at"),
});

// ─── AIRPORT & ARRIVAL ────────────────────────────────────────────────────────

export const airportTransfers = pgTable("airport_transfers", {
  id: text("id").primaryKey(),
  touristProfileId: text("tourist_profile_id"),
  transportBookingId: text("transport_booking_id"), // FK to transport_bookings
  flightNumber: text("flight_number"),
  arrivalAirport: text("arrival_airport").default("MMIA"), // MMIA|NAIA|PHC
  arrivalDateTime: integer("arrival_date_time"),
  pickupSignName: text("pickup_sign_name"),
  meetingPoint: text("meeting_point"),
  status: text("status").default("scheduled"), // scheduled|driver_waiting|passenger_met|completed
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const simCardOrders = pgTable("sim_card_orders", {
  id: text("id").primaryKey(),
  touristProfileId: text("tourist_profile_id"),
  provider: text("provider").notNull(), // MTN|Airtel|Glo|9mobile
  planType: text("plan_type").notNull(), // tourist_7day|tourist_30day|data_only|voice_data
  dataGb: real("data_gb"),
  validityDays: integer("validity_days"),
  priceNgn: real("price_ngn").notNull(),
  phoneNumber: text("phone_number"),
  deliveryMethod: text("delivery_method").default("airport_pickup"), // airport_pickup|hotel_delivery|esim
  status: text("status").default("pending"), // pending|processing|delivered|activated
  paymentTransactionId: text("payment_transaction_id"),
  activatedAt: integer("activated_at"),
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

// ─── EXPENSE TRACKING (BUSINESS TRAVELER) ────────────────────────────────────

export const expenseReports = pgTable("expense_reports", {
  id: text("id").primaryKey(),
  touristProfileId: text("tourist_profile_id"),
  userId: integer("user_id"),
  title: text("title").notNull(),
  tripName: text("trip_name"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  currency: text("currency").default("NGN"),
  totalAmountNgn: real("total_amount_ngn").default(0),
  approvedAmountNgn: real("approved_amount_ngn"),
  status: text("status").default("draft"), // draft|submitted|approved|rejected|reimbursed
  submittedAt: integer("submitted_at"),
  approvedAt: integer("approved_at"),
  approvedBy: text("approved_by"),
  notes: text("notes"),
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const expenseItems = pgTable("expense_items", {
  id: text("id").primaryKey(),
  reportId: text("report_id").notNull(),
  category: text("category").notNull(), // accommodation|meals|transport|entertainment|communication|other
  description: text("description").notNull(),
  merchantName: text("merchant_name"),
  amountNgn: real("amount_ngn").notNull(),
  originalCurrency: text("original_currency").default("NGN"),
  originalAmount: real("original_amount"),
  fxRate: real("fx_rate").default(1),
  receiptUrl: text("receipt_url"),
  paymentTransactionId: text("payment_transaction_id"),
  date: text("date").notNull(), // YYYY-MM-DD
  isReimbursable: boolean("is_reimbursable").default(true),
  vatAmountNgn: real("vat_amount_ngn").default(0),
  notes: text("notes"),
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

// ─── SAFETY & EMERGENCY ───────────────────────────────────────────────────────

export const emergencyContacts = pgTable("emergency_contacts", {
  id: text("id").primaryKey(),
  touristProfileId: text("tourist_profile_id").notNull(),
  name: text("name").notNull(),
  relationship: text("relationship").notNull(), // spouse|parent|sibling|friend|embassy|hotel
  phone: text("phone").notNull(),
  email: text("email"),
  country: text("country"),
  isPrimary: boolean("is_primary").default(false),
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const sosAlerts = pgTable("sos_alerts", {
  id: text("id").primaryKey(),
  touristProfileId: text("tourist_profile_id").notNull(),
  alertType: text("alert_type").notNull(), // medical|security|accident|lost|other
  latitude: real("latitude"),
  longitude: real("longitude"),
  address: text("address"),
  description: text("description"),
  status: text("status").default("active"), // active|acknowledged|resolved
  respondedBy: text("responded_by"),
  resolvedAt: integer("resolved_at"),
  notifiedContacts: jsonb("notified_contacts").default("[]"),
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const safetyCheckins = pgTable("safety_checkins", {
  id: text("id").primaryKey(),
  touristProfileId: text("tourist_profile_id").notNull(),
  latitude: real("latitude"),
  longitude: real("longitude"),
  address: text("address"),
  status: text("status").default("safe"), // safe|uncertain|sos
  message: text("message"),
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

// ─── TOURIST ATTRACTIONS ──────────────────────────────────────────────────────

export const touristAttractions = pgTable("tourist_attractions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(), // nature|museum|beach|market|cultural|religious|entertainment|shopping
  description: text("description"),
  address: text("address").notNull(),
  lga: text("lga"),
  state: text("state").default("Lagos"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  openingHours: jsonb("opening_hours").default("{}"),
  entryFeeNgn: real("entry_fee_ngn").default(0),
  entryFeeForeign: real("entry_fee_foreign"), // USD for foreign tourists
  rating: real("rating").default(4.0),
  reviewCount: integer("review_count").default(0),
  images: jsonb("images").default("[]"),
  tags: jsonb("tags").default("[]"), // ["family","photography","history","nature"]
  isActive: boolean("is_active").default(true),
  merchantId: text("merchant_id"), // if managed by a merchant on platform
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const attractionVisits = pgTable("attraction_visits", {
  id: text("id").primaryKey(),
  attractionId: text("attraction_id").notNull(),
  touristProfileId: text("tourist_profile_id"),
  visitDate: text("visit_date").notNull(),
  adults: integer("adults").default(1),
  children: integer("children").default(0),
  totalAmountNgn: real("total_amount_ngn").default(0),
  paymentTransactionId: text("payment_transaction_id"),
  rating: real("rating"),
  review: text("review"),
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

// ─── GROUP BOOKING & SPLIT PAYMENT ───────────────────────────────────────────

export const groupBookings = pgTable("group_bookings", {
  id: text("id").primaryKey(),
  organizerTouristProfileId: text("organizer_tourist_profile_id").notNull(),
  bookingType: text("booking_type").notNull(), // hotel|airbnb|transport|event|restaurant
  referenceId: text("reference_id").notNull(), // FK to specific booking
  groupName: text("group_name"),
  totalParticipants: integer("total_participants").notNull(),
  totalAmountNgn: real("total_amount_ngn").notNull(),
  splitMethod: text("split_method").default("equal"), // equal|custom|organizer_pays
  status: text("status").default("pending"), // pending|partial|fully_paid|completed
  shareCode: text("share_code").notNull(), // unique code for participants to join
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const groupBookingParticipants = pgTable("group_booking_participants", {
  id: text("id").primaryKey(),
  groupBookingId: text("group_booking_id").notNull(),
  touristProfileId: text("tourist_profile_id"),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  shareAmountNgn: real("share_amount_ngn").notNull(),
  paidAmountNgn: real("paid_amount_ngn").default(0),
  paymentStatus: text("payment_status").default("pending"), // pending|partial|paid
  paymentTransactionId: text("payment_transaction_id"),
  joinedAt: integer("joined_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
  paidAt: integer("paid_at"),
});

// ─── VISA & DOCUMENTATION ─────────────────────────────────────────────────────

export const visaApplications = pgTable("visa_applications", {
  id: text("id").primaryKey(),
  touristProfileId: text("tourist_profile_id").notNull(),
  visaType: text("visa_type").notNull(), // tourist|business|transit|extension
  currentVisaExpiry: text("current_visa_expiry"),
  requestedExtensionDays: integer("requested_extension_days"),
  applicationDate: text("application_date").notNull(),
  status: text("status").default("draft"), // draft|submitted|under_review|approved|rejected
  documents: jsonb("documents").default("[]"),
  processingFeeNgn: real("processing_fee_ngn"),
  paymentTransactionId: text("payment_transaction_id"),
  approvedUntil: text("approved_until"),
  notes: text("notes"),
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

// ─── ROOM SERVICE & CONCIERGE ─────────────────────────────────────────────────

export const roomServiceOrders = pgTable("room_service_orders", {
  id: text("id").primaryKey(),
  hotelBookingId: text("hotel_booking_id").notNull(),
  roomId: text("room_id"),
  touristProfileId: text("tourist_profile_id"),
  orderType: text("order_type").default("food"), // food|housekeeping|laundry|amenity|maintenance
  items: jsonb("items").notNull().default("[]"),
  subtotalNgn: real("subtotal_ngn").notNull(),
  serviceChargeNgn: real("service_charge_ngn").default(0),
  vatAmountNgn: real("vat_amount_ngn").default(0),
  totalAmountNgn: real("total_amount_ngn").notNull(),
  deliveryTime: text("delivery_time"), // requested delivery time
  status: text("status").default("pending"), // pending|preparing|on_the_way|delivered|billed
  paymentStatus: text("payment_status").default("pending"), // pending|charged_to_room|paid
  paymentTransactionId: text("payment_transaction_id"),
  notes: text("notes"),
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const conciergeRequests = pgTable("concierge_requests", {
  id: text("id").primaryKey(),
  hotelBookingId: text("hotel_booking_id"),
  touristProfileId: text("tourist_profile_id").notNull(),
  requestType: text("request_type").notNull(), // restaurant_reservation|transport|tour|shopping|tickets|spa|other
  description: text("description").notNull(),
  preferredDate: text("preferred_date"),
  preferredTime: text("preferred_time"),
  budget: real("budget_ngn"),
  status: text("status").default("pending"), // pending|in_progress|completed|cancelled
  assignedTo: text("assigned_to"),
  resolution: text("resolution"),
  itineraryItemId: text("itinerary_item_id"), // auto-added to itinerary when fulfilled
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
  resolvedAt: integer("resolved_at"),
});

// ─── SPA & WELLNESS ───────────────────────────────────────────────────────────

export const spaBookings = pgTable("spa_bookings", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  touristProfileId: text("tourist_profile_id"),
  hotelBookingId: text("hotel_booking_id"), // if hotel spa
  treatmentType: text("treatment_type").notNull(), // massage|facial|body_wrap|manicure|pedicure|package
  treatmentName: text("treatment_name").notNull(),
  durationMinutes: integer("duration_minutes").default(60),
  priceNgn: real("price_ngn").notNull(),
  vatAmountNgn: real("vat_amount_ngn").default(0),
  totalAmountNgn: real("total_amount_ngn").notNull(),
  appointmentDate: text("appointment_date").notNull(),
  appointmentTime: text("appointment_time").notNull(),
  therapistName: text("therapist_name"),
  status: text("status").default("booked"), // booked|confirmed|in_progress|completed|cancelled
  paymentStatus: text("payment_status").default("pending"),
  paymentTransactionId: text("payment_transaction_id"),
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

// ─── SPORTS & MERCHANDISE ─────────────────────────────────────────────────────

export const sportsEvents = pgTable("sports_events", {
  id: text("id").primaryKey(),
  eventId: text("event_id"), // FK to events table
  name: text("name").notNull(),
  sport: text("sport").notNull(), // football|basketball|athletics|boxing|tennis
  homeTeam: text("home_team"),
  awayTeam: text("away_team"),
  venue: text("venue").notNull(),
  eventDate: integer("event_date").notNull(),
  status: text("status").default("upcoming"), // upcoming|live|completed|cancelled
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const merchandiseOrders = pgTable("merchandise_orders", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  touristProfileId: text("tourist_profile_id"),
  items: jsonb("items").notNull().default("[]"), // [{ name, sku, qty, priceNgn }]
  subtotalNgn: real("subtotal_ngn").notNull(),
  vatAmountNgn: real("vat_amount_ngn").default(0),
  totalAmountNgn: real("total_amount_ngn").notNull(),
  deliveryMethod: text("delivery_method").default("pickup"), // pickup|hotel_delivery|shipping
  deliveryAddress: text("delivery_address"),
  status: text("status").default("pending"), // pending|confirmed|processing|shipped|delivered
  paymentStatus: text("payment_status").default("pending"),
  paymentTransactionId: text("payment_transaction_id"),
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

// ─── PRIVATE CHEF & CATERING ──────────────────────────────────────────────────

export const privateChefBookings = pgTable("private_chef_bookings", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  touristProfileId: text("tourist_profile_id"),
  chefName: text("chef_name"),
  eventType: text("event_type").default("dinner"), // breakfast|lunch|dinner|brunch|cocktail|full_day
  guestCount: integer("guest_count").notNull(),
  cuisineType: text("cuisine_type").default("nigerian"), // nigerian|continental|fusion|seafood
  menuItems: jsonb("menu_items").default("[]"),
  location: text("location").notNull(), // address where chef will cook
  eventDate: text("event_date").notNull(),
  startTime: text("start_time").notNull(),
  durationHours: real("duration_hours").default(3),
  chefFeeNgn: real("chef_fee_ngn").notNull(),
  ingredientCostNgn: real("ingredient_cost_ngn").default(0),
  serviceChargeNgn: real("service_charge_ngn").default(0),
  vatAmountNgn: real("vat_amount_ngn").default(0),
  totalAmountNgn: real("total_amount_ngn").notNull(),
  depositAmountNgn: real("deposit_amount_ngn").default(0),
  depositPaid: boolean("deposit_paid").default(false),
  status: text("status").default("pending"), // pending|confirmed|in_progress|completed|cancelled
  paymentStatus: text("payment_status").default("pending"),
  paymentTransactionId: text("payment_transaction_id"),
  specialRequests: text("special_requests"),
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

// ─── MULTI-CURRENCY STATEMENT ─────────────────────────────────────────────────

export const consolidatedStatements = pgTable("consolidated_statements", {
  id: text("id").primaryKey(),
  touristProfileId: text("tourist_profile_id").notNull(),
  userId: integer("user_id"),
  periodStart: text("period_start").notNull(), // YYYY-MM-DD
  periodEnd: text("period_end").notNull(),
  currencies: jsonb("currencies").default("[]"), // ["USD","GBP","NGN","USDC"]
  totalSpendNgn: real("total_spend_ngn").default(0),
  totalTopupsNgn: real("total_topups_ngn").default(0),
  totalFxFeesNgn: real("total_fx_fees_ngn").default(0),
  totalVatNgn: real("total_vat_ngn").default(0),
  totalTipsNgn: real("total_tips_ngn").default(0),
  totalLoyaltyPoints: integer("total_loyalty_points").default(0),
  breakdownByCategory: jsonb("breakdown_by_category").default("{}"),
  breakdownByCurrency: jsonb("breakdown_by_currency").default("{}"),
  generatedAt: integer("generated_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

// ─── AI CONCIERGE SESSIONS ────────────────────────────────────────────────────

export const aiConciergeSessionsExtended = pgTable("ai_concierge_sessions", {
  id: text("id").primaryKey(),
  touristProfileId: text("tourist_profile_id"),
  userId: integer("user_id"),
  sessionType: text("session_type").default("general"), // general|trip_planning|booking|complaint|recommendation
  context: jsonb("context").default("{}"), // { itineraryId, currentLocation, preferences, budget }
  totalMessages: integer("total_messages").default(0),
  actionsExecuted: jsonb("actions_executed").default("[]"), // [{ action, result, timestamp }]
  itineraryCreated: text("itinerary_created"), // FK to itineraries
  bookingsMade: jsonb("bookings_made").default("[]"),
  totalSpendNgn: real("total_spend_ngn").default(0),
  satisfactionScore: integer("satisfaction_score"), // 1-5
  status: text("status").default("active"), // active|completed|abandoned
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
  endedAt: integer("ended_at"),
});

// ─── HIGH-VALUE TRANSACTION MONITORING ───────────────────────────────────────

export const highValueTransactionReviews = pgTable("high_value_transaction_reviews", {
  id: text("id").primaryKey(),
  transactionId: text("transaction_id").notNull(),
  touristProfileId: text("tourist_profile_id"),
  amountNgn: real("amount_ngn").notNull(),
  threshold: real("threshold").notNull(), // the threshold that triggered review
  reviewType: text("review_type").notNull(), // aml|kyc_enhanced|bis_flag|manual
  riskScore: real("risk_score"),
  status: text("status").default("pending"), // pending|cleared|escalated|blocked
  reviewedBy: text("reviewed_by"),
  reviewNotes: text("review_notes"),
  biometricVerified: boolean("biometric_verified").default(false),
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
  resolvedAt: integer("resolved_at"),
});

// ─── REFUND & DISPUTE TRACKING ────────────────────────────────────────────────

export const refundRequests = pgTable("refund_requests", {
  id: text("id").primaryKey(),
  touristProfileId: text("tourist_profile_id").notNull(),
  originalTransactionId: text("original_transaction_id").notNull(),
  bookingType: text("booking_type"), // hotel|airbnb|transport|event|restaurant
  bookingReferenceId: text("booking_reference_id"),
  merchantId: text("merchant_id"),
  requestedAmountNgn: real("requested_amount_ngn").notNull(),
  approvedAmountNgn: real("approved_amount_ngn"),
  reason: text("reason").notNull(), // cancellation|no_show|service_failure|fraud|other
  description: text("description"),
  evidenceUrls: jsonb("evidence_urls").default("[]"),
  status: text("status").default("pending"), // pending|under_review|approved|rejected|processed
  reviewedBy: text("reviewed_by"),
  reviewNotes: text("review_notes"),
  refundTransactionId: text("refund_transaction_id"),
  processedAt: integer("processed_at"),
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

// ─── OFFLINE / QR PAYMENT SESSIONS ───────────────────────────────────────────

export const qrPaymentSessions = pgTable("qr_payment_sessions", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  tableId: text("table_id"), // for restaurant QR
  qrCode: text("qr_code").notNull(),
  amountNgn: real("amount_ngn"),
  isDynamic: boolean("is_dynamic").default(false), // dynamic = amount set by merchant
  status: text("status").default("active"), // active|scanned|paid|expired
  expiresAt: integer("expires_at"),
  paymentTransactionId: text("payment_transaction_id"),
  touristProfileId: text("tourist_profile_id"),
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
  paidAt: integer("paid_at"),
});

export const offlinePaymentQueue = pgTable("offline_payment_queue", {
  id: text("id").primaryKey(),
  touristProfileId: text("tourist_profile_id").notNull(),
  merchantId: text("merchant_id").notNull(),
  amountNgn: real("amount_ngn").notNull(),
  description: text("description"),
  queuedAt: integer("queued_at").notNull(),
  syncedAt: integer("synced_at"),
  status: text("status").default("queued"), // queued|syncing|completed|failed
  retryCount: integer("retry_count").default(0),
  errorMessage: text("error_message"),
  paymentTransactionId: text("payment_transaction_id"),
});
