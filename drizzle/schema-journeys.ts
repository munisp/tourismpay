/**
 * TourismPay Journey Schemas
 * Covers all 6 merchant types and 3 tourist journey profiles
 * Nigeria-specific: NGN primary currency, Lagos/Abuja locations
 */

import {
  pgTable, serial, text, integer, boolean, real, jsonb, timestamp
} from "drizzle-orm/pg-core";

// ─── SHARED ENUMS / HELPERS ────────────────────────────────────────────────

// ─── MERCHANT ONBOARDING BASE ─────────────────────────────────────────────

export const merchantOnboardingApplications = pgTable("merchant_onboarding_applications", {
  id: text("id").primaryKey(),
  merchantType: text("merchant_type").notNull(), // hotel|restaurant|airbnb|concert|transport|nightclub
  businessName: text("business_name").notNull(),
  ownerName: text("owner_name").notNull(),
  ownerEmail: text("owner_email").notNull(),
  ownerPhone: text("owner_phone").notNull(),
  rcNumber: text("rc_number"), // CAC registration number
  tinNumber: text("tin_number"), // Tax ID
  businessAddress: text("business_address"),
  lga: text("lga"), // Local Government Area
  state: text("state").default("Lagos"),
  country: text("country").default("Nigeria"),
  status: text("status").default("pending"), // pending|kyb_review|approved|rejected|suspended
  kybDocuments: jsonb("kyb_documents").default("{}"), // { cac_cert, tin_cert, id_doc, utility_bill }
  kybScore: real("kyb_score"),
  kybReviewedAt: integer("kyb_reviewed_at"),
  kybReviewedBy: text("kyb_reviewed_by"),
  rejectionReason: text("rejection_reason"),
  merchantId: text("merchant_id"), // FK to merchants table once approved
  temporalWorkflowId: text("temporal_workflow_id"),
  onboardingStep: integer("onboarding_step").default(1), // 1-7
  onboardingData: jsonb("onboarding_data").default("{}"), // step-specific data
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
  updatedAt: integer("updated_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

// ─── HOTEL MERCHANT SCHEMAS ───────────────────────────────────────────────

export const hotelProperties = pgTable("hotel_properties", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  starRating: integer("star_rating").default(3), // 1-5
  address: text("address").notNull(),
  lga: text("lga"),
  state: text("state").default("Lagos"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  checkInTime: text("check_in_time").default("14:00"),
  checkOutTime: text("check_out_time").default("11:00"),
  amenities: jsonb("amenities").default("[]"), // ["wifi","pool","gym","spa","restaurant","bar"]
  policies: jsonb("policies").default("{}"), // { cancellation, pets, smoking, children }
  totalRooms: integer("total_rooms").default(0),
  status: text("status").default("active"), // active|inactive|suspended
  images: jsonb("images").default("[]"),
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const hotelRooms = pgTable("hotel_rooms", {
  id: text("id").primaryKey(),
  propertyId: text("property_id").notNull(),
  roomNumber: text("room_number").notNull(),
  roomType: text("room_type").notNull(), // standard|deluxe|suite|presidential
  bedType: text("bed_type").default("king"), // single|double|twin|king|queen
  maxOccupancy: integer("max_occupancy").default(2),
  floorNumber: integer("floor_number").default(1),
  baseRateNgn: real("base_rate_ngn").notNull(), // per night in NGN
  amenities: jsonb("amenities").default("[]"),
  status: text("status").default("available"), // available|occupied|maintenance|blocked
  images: jsonb("images").default("[]"),
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const hotelRatePlans = pgTable("hotel_rate_plans", {
  id: text("id").primaryKey(),
  propertyId: text("property_id").notNull(),
  name: text("name").notNull(), // "Standard Rate", "Non-Refundable", "Early Bird"
  description: text("description"),
  discountPercent: real("discount_percent").default(0),
  minNights: integer("min_nights").default(1),
  maxNights: integer("max_nights"),
  cancellationPolicy: text("cancellation_policy").default("flexible"), // flexible|moderate|strict|non_refundable
  breakfastIncluded: boolean("breakfast_included").default(false),
  isActive: boolean("is_active").default(true),
  validFrom: integer("valid_from"),
  validTo: integer("valid_to"),
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const hotelBookings = pgTable("hotel_bookings", {
  id: text("id").primaryKey(),
  propertyId: text("property_id").notNull(),
  roomId: text("room_id").notNull(),
  touristProfileId: text("tourist_profile_id"),
  guestName: text("guest_name").notNull(),
  guestEmail: text("guest_email").notNull(),
  guestPhone: text("guest_phone"),
  guestNationality: text("guest_nationality"),
  checkInDate: text("check_in_date").notNull(), // YYYY-MM-DD
  checkOutDate: text("check_out_date").notNull(),
  nights: integer("nights").notNull(),
  adults: integer("adults").default(1),
  children: integer("children").default(0),
  ratePlanId: text("rate_plan_id"),
  totalAmountNgn: real("total_amount_ngn").notNull(),
  originalCurrency: text("original_currency").default("NGN"),
  originalAmount: real("original_amount"),
  fxRate: real("fx_rate").default(1),
  status: text("status").default("pending"), // pending|confirmed|checked_in|checked_out|cancelled|no_show
  paymentStatus: text("payment_status").default("pending"), // pending|paid|refunded|partial
  paymentTransactionId: text("payment_transaction_id"),
  walletTransactionId: text("wallet_transaction_id"),
  tigerBeetleTransferId: text("tigerbeetle_transfer_id"),
  specialRequests: text("special_requests"),
  confirmationCode: text("confirmation_code"),
  source: text("source").default("tourismpay"), // tourismpay|ota|direct
  taxAmount: real("tax_amount").default(0), // 7.5% VAT
  serviceCharge: real("service_charge").default(0), // 10% service charge
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
  updatedAt: integer("updated_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const hotelAmenities = pgTable("hotel_amenities", {
  id: text("id").primaryKey(),
  propertyId: text("property_id").notNull(),
  category: text("category").notNull(), // dining|recreation|business|transport|wellness
  name: text("name").notNull(),
  description: text("description"),
  isComplimentary: boolean("is_complementary").default(true),
  priceNgn: real("price_ngn"),
  operatingHours: text("operating_hours"),
  isActive: boolean("is_active").default(true),
});

export const roomInventory = pgTable("room_inventory", {
  id: text("id").primaryKey(),
  roomId: text("room_id").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD
  isAvailable: boolean("is_available").default(true),
  isBlocked: boolean("is_blocked").default(false),
  blockReason: text("block_reason"),
  priceOverrideNgn: real("price_override_ngn"), // null = use base rate
  bookingId: text("booking_id"), // set when booked
  updatedAt: integer("updated_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

// ─── RESTAURANT MERCHANT SCHEMAS ──────────────────────────────────────────

export const restaurantProfiles = pgTable("restaurant_profiles", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  name: text("name").notNull(),
  cuisine: text("cuisine").notNull(), // nigerian|continental|chinese|italian|seafood|fast_food
  description: text("description"),
  address: text("address").notNull(),
  lga: text("lga"),
  state: text("state").default("Lagos"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  openingHours: jsonb("opening_hours").default("{}"), // { mon: "08:00-22:00", ... }
  seatingCapacity: integer("seating_capacity").default(50),
  hasDelivery: boolean("has_delivery").default(false),
  hasTakeaway: boolean("has_takeaway").default(true),
  acceptsReservations: boolean("accepts_reservations").default(true),
  averageMealCostNgn: real("average_meal_cost_ngn"),
  status: text("status").default("active"),
  images: jsonb("images").default("[]"),
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const restaurantMenus = pgTable("restaurant_menus", {
  id: text("id").primaryKey(),
  restaurantId: text("restaurant_id").notNull(),
  name: text("name").notNull(), // "Breakfast Menu", "Lunch Menu", "Dinner Menu", "Drinks"
  description: text("description"),
  isActive: boolean("is_active").default(true),
  availableFrom: text("available_from"), // "06:00"
  availableTo: text("available_to"), // "11:00"
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const menuItems = pgTable("menu_items", {
  id: text("id").primaryKey(),
  menuId: text("menu_id").notNull(),
  restaurantId: text("restaurant_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull(), // starter|main|dessert|drink|side
  priceNgn: real("price_ngn").notNull(),
  isAvailable: boolean("is_available").default(true),
  isVegetarian: boolean("is_vegetarian").default(false),
  isHalal: boolean("is_halal").default(false),
  allergens: jsonb("allergens").default("[]"),
  preparationTimeMinutes: integer("preparation_time_minutes").default(15),
  images: jsonb("images").default("[]"),
  sortOrder: integer("sort_order").default(0),
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const restaurantTables = pgTable("restaurant_tables", {
  id: text("id").primaryKey(),
  restaurantId: text("restaurant_id").notNull(),
  tableNumber: text("table_number").notNull(),
  capacity: integer("capacity").default(4),
  location: text("location").default("indoor"), // indoor|outdoor|private|rooftop
  status: text("status").default("available"), // available|occupied|reserved|maintenance
  qrCode: text("qr_code"), // for QR-based ordering
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const restaurantReservations = pgTable("restaurant_reservations", {
  id: text("id").primaryKey(),
  restaurantId: text("restaurant_id").notNull(),
  tableId: text("table_id"),
  touristProfileId: text("tourist_profile_id"),
  guestName: text("guest_name").notNull(),
  guestEmail: text("guest_email").notNull(),
  guestPhone: text("guest_phone").notNull(),
  partySize: integer("party_size").notNull(),
  reservationDate: text("reservation_date").notNull(), // YYYY-MM-DD
  reservationTime: text("reservation_time").notNull(), // HH:MM
  duration: integer("duration").default(90), // minutes
  status: text("status").default("pending"), // pending|confirmed|seated|completed|cancelled|no_show
  specialRequests: text("special_requests"),
  confirmationCode: text("confirmation_code"),
  depositAmountNgn: real("deposit_amount_ngn").default(0),
  depositPaid: boolean("deposit_paid").default(false),
  depositTransactionId: text("deposit_transaction_id"),
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const restaurantOrders = pgTable("restaurant_orders", {
  id: text("id").primaryKey(),
  restaurantId: text("restaurant_id").notNull(),
  tableId: text("table_id"),
  reservationId: text("reservation_id"),
  touristProfileId: text("tourist_profile_id"),
  orderType: text("order_type").default("dine_in"), // dine_in|takeaway|delivery
  items: jsonb("items").notNull().default("[]"), // [{ menuItemId, name, qty, priceNgn, notes }]
  subtotalNgn: real("subtotal_ngn").notNull(),
  vatAmountNgn: real("vat_amount_ngn").default(0), // 7.5% VAT
  serviceChargeNgn: real("service_charge_ngn").default(0), // 10%
  tipAmountNgn: real("tip_amount_ngn").default(0),
  totalAmountNgn: real("total_amount_ngn").notNull(),
  status: text("status").default("pending"), // pending|preparing|ready|served|paid|cancelled
  paymentStatus: text("payment_status").default("pending"),
  paymentMethod: text("payment_method"), // wallet|card|cash|ussd
  paymentTransactionId: text("payment_transaction_id"),
  walletTransactionId: text("wallet_transaction_id"),
  tigerBeetleTransferId: text("tigerbeetle_transfer_id"),
  notes: text("notes"),
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
  updatedAt: integer("updated_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

// ─── AIRBNB / SHORT-STAY MERCHANT SCHEMAS ────────────────────────────────

export const shortStayProperties = pgTable("short_stay_properties", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  name: text("name").notNull(),
  propertyType: text("property_type").notNull(), // apartment|house|villa|studio|penthouse|guesthouse
  description: text("description"),
  address: text("address").notNull(),
  neighbourhood: text("neighbourhood"), // Ikoyi|Victoria Island|Lekki|Banana Island
  lga: text("lga"),
  state: text("state").default("Lagos"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  bedrooms: integer("bedrooms").default(1),
  bathrooms: integer("bathrooms").default(1),
  maxGuests: integer("max_guests").default(2),
  amenities: jsonb("amenities").default("[]"), // ["wifi","ac","kitchen","pool","gym","security","generator"]
  houseRules: jsonb("house_rules").default("{}"), // { no_smoking, no_pets, check_in_after, check_out_before }
  basePricePerNightNgn: real("base_price_per_night_ngn").notNull(),
  cleaningFeeNgn: real("cleaning_fee_ngn").default(0),
  securityDepositNgn: real("security_deposit_ngn").default(0),
  minNights: integer("min_nights").default(1),
  maxNights: integer("max_nights").default(30),
  instantBooking: boolean("instant_booking").default(false),
  status: text("status").default("active"), // active|inactive|suspended|pending_review
  verificationStatus: text("verification_status").default("pending"), // pending|verified|rejected
  images: jsonb("images").default("[]"),
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const propertyListings = pgTable("property_listings", {
  id: text("id").primaryKey(),
  propertyId: text("property_id").notNull(),
  title: text("title").notNull(),
  highlights: jsonb("highlights").default("[]"), // ["Beachfront","City view","Newly renovated"]
  seoDescription: text("seo_description"),
  tags: jsonb("tags").default("[]"), // ["luxury","family","business","romantic"]
  isPublished: boolean("is_published").default(false),
  publishedAt: integer("published_at"),
  views: integer("views").default(0),
  bookings: integer("bookings").default(0),
  averageRating: real("average_rating"),
  reviewCount: integer("review_count").default(0),
  updatedAt: integer("updated_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const propertyAvailability = pgTable("property_availability", {
  id: text("id").primaryKey(),
  propertyId: text("property_id").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD
  isAvailable: boolean("is_available").default(true),
  isBlocked: boolean("is_blocked").default(false),
  priceOverrideNgn: real("price_override_ngn"), // weekend/event pricing
  minimumNightsOverride: integer("minimum_nights_override"),
  bookingId: text("booking_id"),
  updatedAt: integer("updated_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const propertyBookings = pgTable("property_bookings", {
  id: text("id").primaryKey(),
  propertyId: text("property_id").notNull(),
  touristProfileId: text("tourist_profile_id"),
  guestName: text("guest_name").notNull(),
  guestEmail: text("guest_email").notNull(),
  guestPhone: text("guest_phone"),
  guestNationality: text("guest_nationality"),
  checkInDate: text("check_in_date").notNull(),
  checkOutDate: text("check_out_date").notNull(),
  nights: integer("nights").notNull(),
  adults: integer("adults").default(1),
  children: integer("children").default(0),
  subtotalNgn: real("subtotal_ngn").notNull(),
  cleaningFeeNgn: real("cleaning_fee_ngn").default(0),
  securityDepositNgn: real("security_deposit_ngn").default(0),
  serviceFeeNgn: real("service_fee_ngn").default(0), // TourismPay 5% fee
  vatAmountNgn: real("vat_amount_ngn").default(0), // 7.5%
  totalAmountNgn: real("total_amount_ngn").notNull(),
  originalCurrency: text("original_currency").default("NGN"),
  originalAmount: real("original_amount"),
  fxRate: real("fx_rate").default(1),
  status: text("status").default("pending"), // pending|confirmed|active|completed|cancelled|disputed
  paymentStatus: text("payment_status").default("pending"),
  paymentTransactionId: text("payment_transaction_id"),
  walletTransactionId: text("wallet_transaction_id"),
  tigerBeetleTransferId: text("tigerbeetle_transfer_id"),
  confirmationCode: text("confirmation_code"),
  specialRequests: text("special_requests"),
  guestReview: text("guest_review"),
  guestRating: real("guest_rating"),
  hostReview: text("host_review"),
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
  updatedAt: integer("updated_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const propertyPricing = pgTable("property_pricing", {
  id: text("id").primaryKey(),
  propertyId: text("property_id").notNull(),
  pricingType: text("pricing_type").notNull(), // base|weekend|holiday|event|seasonal
  name: text("name").notNull(),
  pricePerNightNgn: real("price_per_night_ngn").notNull(),
  startDate: text("start_date"),
  endDate: text("end_date"),
  daysOfWeek: jsonb("days_of_week").default("[]"), // [0,1,2,3,4,5,6] = Sun-Sat
  isActive: boolean("is_active").default(true),
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

// ─── CONCERT / EVENT MERCHANT SCHEMAS ────────────────────────────────────

export const eventVenues = pgTable("event_venues", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  lga: text("lga"),
  state: text("state").default("Lagos"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  totalCapacity: integer("total_capacity").notNull(),
  venueType: text("venue_type").default("indoor"), // indoor|outdoor|hybrid
  facilities: jsonb("facilities").default("[]"), // ["stage","sound_system","bar","parking","vip_lounge"]
  status: text("status").default("active"),
  images: jsonb("images").default("[]"),
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const events = pgTable("events", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  venueId: text("venue_id"),
  name: text("name").notNull(),
  description: text("description"),
  eventType: text("event_type").notNull(), // concert|festival|comedy|fashion_show|corporate|sports|nightlife
  category: text("category"), // afrobeats|highlife|gospel|comedy|fashion|tech
  artists: jsonb("artists").default("[]"), // [{ name, bio, image }]
  startDateTime: integer("start_date_time").notNull(), // Unix timestamp
  endDateTime: integer("end_date_time"),
  doorsOpenTime: integer("doors_open_time"),
  ageRestriction: integer("age_restriction").default(0), // 0=all ages, 18=18+, 21=21+
  dressCode: text("dress_code"),
  status: text("status").default("draft"), // draft|published|on_sale|sold_out|cancelled|completed
  totalCapacity: integer("total_capacity").notNull(),
  soldTickets: integer("sold_tickets").default(0),
  images: jsonb("images").default("[]"),
  bannerImage: text("banner_image"),
  tags: jsonb("tags").default("[]"),
  isFeatured: boolean("is_featured").default(false),
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
  updatedAt: integer("updated_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const ticketTiers = pgTable("ticket_tiers", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull(),
  name: text("name").notNull(), // "General Admission", "VIP", "VVIP", "Early Bird"
  description: text("description"),
  priceNgn: real("price_ngn").notNull(),
  totalQuantity: integer("total_quantity").notNull(),
  soldQuantity: integer("sold_quantity").default(0),
  maxPerOrder: integer("max_per_order").default(10),
  benefits: jsonb("benefits").default("[]"), // ["Lounge access","Meet & greet","Open bar"]
  saleStartTime: integer("sale_start_time"),
  saleEndTime: integer("sale_end_time"),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const eventTickets = pgTable("event_tickets", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull(),
  tierId: text("tier_id").notNull(),
  touristProfileId: text("tourist_profile_id"),
  buyerName: text("buyer_name").notNull(),
  buyerEmail: text("buyer_email").notNull(),
  buyerPhone: text("buyer_phone"),
  quantity: integer("quantity").default(1),
  unitPriceNgn: real("unit_price_ngn").notNull(),
  serviceFeeNgn: real("service_fee_ngn").default(0), // TourismPay 3% fee
  vatAmountNgn: real("vat_amount_ngn").default(0),
  totalAmountNgn: real("total_amount_ngn").notNull(),
  originalCurrency: text("original_currency").default("NGN"),
  originalAmount: real("original_amount"),
  fxRate: real("fx_rate").default(1),
  status: text("status").default("pending"), // pending|confirmed|used|cancelled|refunded
  paymentStatus: text("payment_status").default("pending"),
  paymentTransactionId: text("payment_transaction_id"),
  walletTransactionId: text("wallet_transaction_id"),
  tigerBeetleTransferId: text("tigerbeetle_transfer_id"),
  qrCode: text("qr_code"), // unique QR for gate scanning
  confirmationCode: text("confirmation_code"),
  scannedAt: integer("scanned_at"),
  scannedBy: text("scanned_by"),
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const ticketScans = pgTable("ticket_scans", {
  id: text("id").primaryKey(),
  ticketId: text("ticket_id").notNull(),
  eventId: text("event_id").notNull(),
  scannedAt: integer("scanned_at").notNull(),
  scannedBy: text("scanned_by").notNull(), // staff ID
  scanResult: text("scan_result").notNull(), // valid|invalid|already_used|wrong_event
  deviceId: text("device_id"),
  location: text("location"), // gate A, gate B
});

// ─── TRANSPORT MERCHANT SCHEMAS ───────────────────────────────────────────

export const transportProviders = pgTable("transport_providers", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  name: text("name").notNull(),
  serviceType: text("service_type").notNull(), // ride_hailing|charter|airport_transfer|bus|boat|helicopter
  description: text("description"),
  operatingArea: jsonb("operating_area").default("[]"), // ["Lagos","Abuja","Port Harcourt"]
  baseCity: text("base_city").default("Lagos"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  licenseNumber: text("license_number"),
  status: text("status").default("active"),
  rating: real("rating").default(0),
  totalTrips: integer("total_trips").default(0),
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const vehicles = pgTable("vehicles", {
  id: text("id").primaryKey(),
  providerId: text("provider_id").notNull(),
  driverId: text("driver_id"),
  make: text("make").notNull(), // Toyota|Mercedes|BMW|Kia
  model: text("model").notNull(), // Camry|Vito|5 Series|Carnival
  year: integer("year"),
  color: text("color"),
  plateNumber: text("plate_number").notNull(),
  vehicleType: text("vehicle_type").notNull(), // sedan|suv|van|bus|minibus|luxury
  capacity: integer("capacity").default(4),
  amenities: jsonb("amenities").default("[]"), // ["ac","wifi","usb_charger","water"]
  status: text("status").default("available"), // available|on_trip|maintenance|inactive
  currentLatitude: real("current_latitude"),
  currentLongitude: real("current_longitude"),
  lastLocationUpdate: integer("last_location_update"),
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const driverProfiles = pgTable("driver_profiles", {
  id: text("id").primaryKey(),
  providerId: text("provider_id").notNull(),
  userId: integer("user_id"),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  licenseNumber: text("license_number").notNull(),
  licenseExpiry: text("license_expiry"),
  vehicleId: text("vehicle_id"),
  status: text("status").default("active"), // active|inactive|suspended|on_trip
  rating: real("rating").default(5.0),
  totalTrips: integer("total_trips").default(0),
  languages: jsonb("languages").default('["English","Yoruba"]'),
  profileImage: text("profile_image"),
  backgroundCheckStatus: text("background_check_status").default("pending"),
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const transportRoutes = pgTable("transport_routes", {
  id: text("id").primaryKey(),
  providerId: text("provider_id").notNull(),
  name: text("name").notNull(), // "Airport Transfer - MMIA to VI"
  routeType: text("route_type").default("fixed"), // fixed|flexible|charter
  originName: text("origin_name").notNull(),
  originLatitude: real("origin_latitude"),
  originLongitude: real("origin_longitude"),
  destinationName: text("destination_name").notNull(),
  destinationLatitude: real("destination_latitude"),
  destinationLongitude: real("destination_longitude"),
  estimatedDurationMinutes: integer("estimated_duration_minutes"),
  distanceKm: real("distance_km"),
  baseFareNgn: real("base_fare_ngn").notNull(),
  perKmRateNgn: real("per_km_rate_ngn").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const transportBookings = pgTable("transport_bookings", {
  id: text("id").primaryKey(),
  providerId: text("provider_id").notNull(),
  routeId: text("route_id"),
  vehicleId: text("vehicle_id"),
  driverId: text("driver_id"),
  touristProfileId: text("tourist_profile_id"),
  passengerName: text("passenger_name").notNull(),
  passengerPhone: text("passenger_phone").notNull(),
  passengerEmail: text("passenger_email"),
  pickupAddress: text("pickup_address").notNull(),
  pickupLatitude: real("pickup_latitude"),
  pickupLongitude: real("pickup_longitude"),
  dropoffAddress: text("dropoff_address").notNull(),
  dropoffLatitude: real("dropoff_latitude"),
  dropoffLongitude: real("dropoff_longitude"),
  scheduledPickupTime: integer("scheduled_pickup_time"), // Unix timestamp
  actualPickupTime: integer("actual_pickup_time"),
  actualDropoffTime: integer("actual_dropoff_time"),
  passengers: integer("passengers").default(1),
  fareNgn: real("fare_ngn").notNull(),
  serviceFeeNgn: real("service_fee_ngn").default(0),
  totalAmountNgn: real("total_amount_ngn").notNull(),
  originalCurrency: text("original_currency").default("NGN"),
  originalAmount: real("original_amount"),
  fxRate: real("fx_rate").default(1),
  status: text("status").default("pending"), // pending|confirmed|driver_assigned|en_route|arrived|in_progress|completed|cancelled
  paymentStatus: text("payment_status").default("pending"),
  paymentMethod: text("payment_method").default("wallet"),
  paymentTransactionId: text("payment_transaction_id"),
  walletTransactionId: text("wallet_transaction_id"),
  tigerBeetleTransferId: text("tigerbeetle_transfer_id"),
  rating: real("rating"),
  review: text("review"),
  notes: text("notes"),
  confirmationCode: text("confirmation_code"),
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
  updatedAt: integer("updated_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

// ─── NIGHTCLUB MERCHANT SCHEMAS ───────────────────────────────────────────

export const nightclubVenues = pgTable("nightclub_venues", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  address: text("address").notNull(),
  lga: text("lga"),
  state: text("state").default("Lagos"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  capacity: integer("capacity").notNull(),
  dressCode: text("dress_code").default("Smart Casual"),
  ageRestriction: integer("age_restriction").default(18),
  openingTime: text("opening_time").default("22:00"),
  closingTime: text("closing_time").default("04:00"),
  operatingDays: jsonb("operating_days").default('["friday","saturday"]'),
  musicGenre: jsonb("music_genre").default('["afrobeats","hiphop","house"]'),
  facilities: jsonb("facilities").default("[]"), // ["vip_lounge","rooftop","pool","hookah","live_dj"]
  status: text("status").default("active"),
  images: jsonb("images").default("[]"),
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const nightclubTableReservations = pgTable("nightclub_table_reservations", {
  id: text("id").primaryKey(),
  venueId: text("venue_id").notNull(),
  tableSection: text("table_section").notNull(), // vip|regular|rooftop|poolside
  tableNumber: text("table_number").notNull(),
  touristProfileId: text("tourist_profile_id"),
  guestName: text("guest_name").notNull(),
  guestPhone: text("guest_phone").notNull(),
  guestEmail: text("guest_email"),
  partySize: integer("party_size").notNull(),
  reservationDate: text("reservation_date").notNull(), // YYYY-MM-DD
  arrivalTime: text("arrival_time"),
  minimumSpendNgn: real("minimum_spend_ngn").default(0),
  depositAmountNgn: real("deposit_amount_ngn").default(0),
  depositPaid: boolean("deposit_paid").default(false),
  depositTransactionId: text("deposit_transaction_id"),
  status: text("status").default("pending"), // pending|confirmed|arrived|completed|cancelled|no_show
  specialRequests: text("special_requests"),
  confirmationCode: text("confirmation_code"),
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const bottleService = pgTable("bottle_service", {
  id: text("id").primaryKey(),
  venueId: text("venue_id").notNull(),
  tableReservationId: text("table_reservation_id"),
  touristProfileId: text("tourist_profile_id"),
  items: jsonb("items").notNull().default("[]"), // [{ name, brand, size, qty, priceNgn }]
  subtotalNgn: real("subtotal_ngn").notNull(),
  serviceChargeNgn: real("service_charge_ngn").default(0),
  vatAmountNgn: real("vat_amount_ngn").default(0),
  totalAmountNgn: real("total_amount_ngn").notNull(),
  status: text("status").default("pending"), // pending|confirmed|delivered|paid
  paymentStatus: text("payment_status").default("pending"),
  paymentTransactionId: text("payment_transaction_id"),
  walletTransactionId: text("wallet_transaction_id"),
  tigerBeetleTransferId: text("tigerbeetle_transfer_id"),
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const entryTickets = pgTable("entry_tickets", {
  id: text("id").primaryKey(),
  venueId: text("venue_id").notNull(),
  touristProfileId: text("tourist_profile_id"),
  buyerName: text("buyer_name").notNull(),
  buyerPhone: text("buyer_phone").notNull(),
  buyerEmail: text("buyer_email"),
  ticketType: text("ticket_type").default("general"), // general|vip|ladies_night|early_bird
  eventDate: text("event_date").notNull(), // YYYY-MM-DD
  quantity: integer("quantity").default(1),
  unitPriceNgn: real("unit_price_ngn").notNull(),
  totalAmountNgn: real("total_amount_ngn").notNull(),
  originalCurrency: text("original_currency").default("NGN"),
  originalAmount: real("original_amount"),
  fxRate: real("fx_rate").default(1),
  status: text("status").default("pending"), // pending|confirmed|used|cancelled
  paymentStatus: text("payment_status").default("pending"),
  paymentTransactionId: text("payment_transaction_id"),
  walletTransactionId: text("wallet_transaction_id"),
  qrCode: text("qr_code"),
  confirmationCode: text("confirmation_code"),
  scannedAt: integer("scanned_at"),
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const ageVerifications = pgTable("age_verifications", {
  id: text("id").primaryKey(),
  venueId: text("venue_id").notNull(),
  guestName: text("guest_name"),
  idType: text("id_type").notNull(), // passport|national_id|drivers_license|voters_card
  idNumber: text("id_number").notNull(),
  dateOfBirth: text("date_of_birth").notNull(), // YYYY-MM-DD
  verifiedAge: integer("verified_age").notNull(),
  isEligible: boolean("is_eligible").notNull(),
  verifiedAt: integer("verified_at").notNull(),
  verifiedBy: text("verified_by"),
  touristProfileId: text("tourist_profile_id"),
});

// ─── TOURIST PROFILE & JOURNEY SCHEMAS ───────────────────────────────────

export const touristProfiles = pgTable("tourist_profiles", {
  id: text("id").primaryKey(),
  userId: integer("user_id"),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  nationality: text("nationality").notNull(), // US|GB|NG|DE|FR|...
  residenceCountry: text("residence_country").notNull(),
  passportNumber: text("passport_number"),
  passportExpiry: text("passport_expiry"),
  dateOfBirth: text("date_of_birth"),
  preferredCurrency: text("preferred_currency").default("NGN"), // USD|GBP|EUR|NGN
  profileType: text("profile_type").default("tourist"), // tourist|diaspora|business|expat
  kycStatus: text("kyc_status").default("pending"), // pending|verified|rejected
  kycDocuments: jsonb("kyc_documents").default("{}"),
  preferences: jsonb("preferences").default("{}"), // { dining, accommodation, transport, activities }
  walletId: text("wallet_id"), // FK to wallet
  totalSpendNgn: real("total_spend_ngn").default(0),
  visitCount: integer("visit_count").default(0),
  lastVisit: integer("last_visit"),
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
  updatedAt: integer("updated_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const walletTopups = pgTable("wallet_topups", {
  id: text("id").primaryKey(),
  touristProfileId: text("tourist_profile_id"),
  userId: integer("user_id"),
  sourceCurrency: text("source_currency").notNull(), // USD|GBP|EUR|USDC|USDT
  sourceAmount: real("source_amount").notNull(),
  targetCurrency: text("target_currency").default("NGN"),
  targetAmount: real("target_amount").notNull(),
  fxRate: real("fx_rate").notNull(),
  fxRateSource: text("fx_rate_source").default("cbn"), // cbn|parallel|interbank
  fxFeePercent: real("fx_fee_percent").default(1.5),
  fxFeeAmount: real("fx_fee_amount").default(0),
  topupMethod: text("topup_method").notNull(), // wire_transfer|card|crypto|swift|sepa
  topupProvider: text("topup_provider"), // flutterwave|paystack|stripe|coinbase
  providerReference: text("provider_reference"),
  status: text("status").default("pending"), // pending|processing|completed|failed|reversed
  walletTransactionId: text("wallet_transaction_id"),
  tigerBeetleTransferId: text("tigerbeetle_transfer_id"),
  notes: text("notes"),
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
  completedAt: integer("completed_at"),
});

export const fxConversions = pgTable("fx_conversions", {
  id: text("id").primaryKey(),
  touristProfileId: text("tourist_profile_id"),
  userId: integer("user_id"),
  fromCurrency: text("from_currency").notNull(),
  fromAmount: real("from_amount").notNull(),
  toCurrency: text("to_currency").notNull(),
  toAmount: real("to_amount").notNull(),
  fxRate: real("fx_rate").notNull(),
  fxRateType: text("fx_rate_type").default("mid"), // mid|buy|sell
  fxRateSource: text("fx_rate_source").default("cbn"),
  spreadPercent: real("spread_percent").default(1.0),
  feeNgn: real("fee_ngn").default(0),
  status: text("status").default("completed"), // pending|completed|failed|reversed
  walletDebitTransactionId: text("wallet_debit_transaction_id"),
  walletCreditTransactionId: text("wallet_credit_transaction_id"),
  tigerBeetleTransferId: text("tigerbeetle_transfer_id"),
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const stablecoinWallets = pgTable("stablecoin_wallets", {
  id: text("id").primaryKey(),
  touristProfileId: text("tourist_profile_id"),
  userId: integer("user_id"),
  blockchain: text("blockchain").notNull(), // ethereum|polygon|solana|tron|bnb
  tokenSymbol: text("token_symbol").notNull(), // USDC|USDT|BUSD|DAI
  walletAddress: text("wallet_address").notNull(),
  balanceToken: real("balance_token").default(0),
  balanceUsd: real("balance_usd").default(0),
  isVerified: boolean("is_verified").default(false),
  lastSync: integer("last_sync"),
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const stablecoinConversions = pgTable("stablecoin_conversions", {
  id: text("id").primaryKey(),
  stablecoinWalletId: text("stablecoin_wallet_id").notNull(),
  touristProfileId: text("tourist_profile_id"),
  tokenSymbol: text("token_symbol").notNull(), // USDC|USDT
  tokenAmount: real("token_amount").notNull(),
  usdEquivalent: real("usd_equivalent").notNull(),
  ngnAmount: real("ngn_amount").notNull(),
  usdToNgnRate: real("usd_to_ngn_rate").notNull(),
  conversionFeePercent: real("conversion_fee_percent").default(1.5),
  conversionFeeNgn: real("conversion_fee_ngn").default(0),
  onChainTxHash: text("on_chain_tx_hash"),
  onChainConfirmations: integer("on_chain_confirmations").default(0),
  status: text("status").default("pending"), // pending|confirming|completed|failed
  walletTopupId: text("wallet_topup_id"),
  walletTransactionId: text("wallet_transaction_id"),
  tigerBeetleTransferId: text("tigerbeetle_transfer_id"),
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
  completedAt: integer("completed_at"),
});

export const servicePayments = pgTable("service_payments", {
  id: text("id").primaryKey(),
  touristProfileId: text("tourist_profile_id").notNull(),
  merchantId: text("merchant_id").notNull(),
  serviceType: text("service_type").notNull(), // restaurant|hotel|transport|nightclub|event|dry_cleaning|spa|shopping
  serviceReferenceId: text("service_reference_id"), // booking/order/ticket ID
  description: text("description"),
  amountNgn: real("amount_ngn").notNull(),
  originalCurrency: text("original_currency").default("NGN"),
  originalAmount: real("original_amount"),
  fxRate: real("fx_rate").default(1),
  tipAmountNgn: real("tip_amount_ngn").default(0),
  vatAmountNgn: real("vat_amount_ngn").default(0),
  totalAmountNgn: real("total_amount_ngn").notNull(),
  paymentMethod: text("payment_method").default("wallet"), // wallet|card|ussd|qr
  status: text("status").default("completed"),
  walletTransactionId: text("wallet_transaction_id"),
  tigerBeetleTransferId: text("tigerbeetle_transfer_id"),
  receiptUrl: text("receipt_url"),
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const touristBookings = pgTable("tourist_bookings", {
  id: text("id").primaryKey(),
  touristProfileId: text("tourist_profile_id").notNull(),
  bookingType: text("booking_type").notNull(), // hotel|airbnb|transport|event|restaurant
  referenceId: text("reference_id").notNull(), // FK to specific booking table
  merchantId: text("merchant_id"),
  merchantName: text("merchant_name"),
  checkInDate: text("check_in_date"),
  checkOutDate: text("check_out_date"),
  totalAmountNgn: real("total_amount_ngn").notNull(),
  originalCurrency: text("original_currency").default("NGN"),
  originalAmount: real("original_amount"),
  status: text("status").default("confirmed"),
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const fashionWeekEvents = pgTable("fashion_week_events", {
  id: text("id").primaryKey(),
  eventId: text("event_id"), // FK to events table
  name: text("name").notNull(),
  edition: text("edition").notNull(), // "Lagos Fashion Week 2025"
  season: text("season").notNull(), // SS2025|AW2025
  venue: text("venue").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  designers: jsonb("designers").default("[]"),
  sponsors: jsonb("sponsors").default("[]"),
  ticketTiers: jsonb("ticket_tiers").default("[]"), // [{ name, priceNgn, benefits }]
  status: text("status").default("upcoming"), // upcoming|ongoing|completed
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const dryCleaningOrders = pgTable("dry_cleaning_orders", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  touristProfileId: text("tourist_profile_id"),
  guestName: text("guest_name").notNull(),
  guestPhone: text("guest_phone").notNull(),
  guestEmail: text("guest_email"),
  hotelBookingId: text("hotel_booking_id"), // if hotel guest
  items: jsonb("items").notNull().default("[]"), // [{ type, qty, priceNgn, notes }]
  subtotalNgn: real("subtotal_ngn").notNull(),
  vatAmountNgn: real("vat_amount_ngn").default(0),
  totalAmountNgn: real("total_amount_ngn").notNull(),
  pickupDate: text("pickup_date"),
  pickupTime: text("pickup_time"),
  deliveryDate: text("delivery_date"),
  deliveryTime: text("delivery_time"),
  deliveryAddress: text("delivery_address"),
  status: text("status").default("pending"), // pending|picked_up|processing|ready|delivered|paid
  paymentStatus: text("payment_status").default("pending"),
  paymentTransactionId: text("payment_transaction_id"),
  walletTransactionId: text("wallet_transaction_id"),
  notes: text("notes"),
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
  updatedAt: integer("updated_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const merchantPayments = pgTable("merchant_payments", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  touristProfileId: text("tourist_profile_id"),
  paymentType: text("payment_type").notNull(), // booking|order|ticket|topup|service
  referenceId: text("reference_id"),
  amountNgn: real("amount_ngn").notNull(),
  feeNgn: real("fee_ngn").default(0), // TourismPay platform fee
  vatNgn: real("vat_ngn").default(0),
  netAmountNgn: real("net_amount_ngn").notNull(), // amount after fees
  currency: text("currency").default("NGN"),
  status: text("status").default("completed"),
  walletTransactionId: text("wallet_transaction_id"),
  tigerBeetleTransferId: text("tigerbeetle_transfer_id"),
  settlementBatchId: text("settlement_batch_id"),
  settledAt: integer("settled_at"),
  createdAt: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});
