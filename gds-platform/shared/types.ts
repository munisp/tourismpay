/**
 * Shared types between GDS client and server.
 * The GDS platform is standalone — it integrates with TourismPay via REST API.
 */

// ─── Property & Inventory ─────────────────────────────────────────────────────

export interface GDSProperty {
  id: string;
  name: string;
  type: PropertyType;
  countryCode: string;
  city: string;
  lat: number;
  lng: number;
  starRating: number;
  totalRooms: number;
  amenities: string[];
  images: string[];
  contactEmail: string;
  contactPhone: string;
  tourismpayMerchantId?: string; // Links to TourismPay merchant for payments
  status: "active" | "pending" | "suspended";
  createdAt: string;
}

export type PropertyType = "hotel" | "lodge" | "safari_camp" | "resort" | "guesthouse" | "apartment" | "hostel";

export interface RoomType {
  id: string;
  propertyId: string;
  name: string;
  description: string;
  maxOccupancy: number;
  baseRateUSD: number;
  totalInventory: number;
  amenities: string[];
}

export interface Availability {
  roomTypeId: string;
  date: string;
  available: number;
  rateUSD: number;
  minStay: number;
}

// ─── Reservations ─────────────────────────────────────────────────────────────

export interface Reservation {
  id: string;
  propertyId: string;
  roomTypeId: string;
  guestName: string;
  guestEmail: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  children: number;
  baseAmountUSD: number;
  taxAmountUSD: number;
  totalAmountUSD: number;
  currency: string;
  localAmount: number;
  status: ReservationStatus;
  channel: BookingChannel;
  agentId?: string;
  loyaltyPointsEarned: number;
  createdAt: string;
}

export type ReservationStatus = "confirmed" | "pending" | "checked_in" | "checked_out" | "cancelled" | "no_show";
export type BookingChannel = "direct" | "ota_booking" | "ota_expedia" | "agent" | "trip_planner" | "walk_in";

// ─── Agents & Commissions ─────────────────────────────────────────────────────

export interface Agent {
  id: string;
  name: string;
  email: string;
  agency: string;
  countryCode: string;
  commissionRate: number; // percentage
  totalBookings: number;
  totalCommissionUSD: number;
  tier: AgentTier;
  status: "active" | "suspended";
}

export type AgentTier = "bronze" | "silver" | "gold" | "platinum";

export interface Commission {
  id: string;
  agentId: string;
  reservationId: string;
  amountUSD: number;
  rate: number;
  status: "pending" | "paid" | "cancelled";
  paidAt?: string;
}

// ─── TourismPay Integration Types ─────────────────────────────────────────────

export interface TaxCalculationRequest {
  countryCode: string;
  amount: number;
  currency: string;
  bookingType: "accommodation" | "food" | "activity" | "transport";
}

export interface TaxCalculationResponse {
  grossAmount: number;
  netAmount: number;
  totalTax: number;
  effectiveRate: number;
  breakdown: Array<{ name: string; rate: number; amount: number; authority: string }>;
}

export interface TipRequest {
  reservationId: string;
  propertyId: string;
  amount: number;
  currency: string;
  recipients: Array<{ role: string; name: string; splitPercent: number }>;
}

export interface LoyaltyEarnRequest {
  guestId: string;
  reservationId: string;
  amountUSD: number;
  propertyType: PropertyType;
  bookingChannel: BookingChannel;
}

export interface LoyaltyEarnResponse {
  pointsEarned: number;
  tierMultiplier: number;
  propertyBonus: number;
  bookingMultiplier: number;
  newBalance: number;
}

export interface RemittanceSummary {
  countryCode: string;
  collected: number;
  remitted: number;
  outstanding: number;
  compliancePercent: number;
  nextDeadline: string;
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export interface GDSStats {
  totalProperties: number;
  totalReservations: number;
  totalRevenue: number;
  occupancyRate: number;
  activeAgents: number;
  countriesCovered: number;
}

// ─── User & Auth ──────────────────────────────────────────────────────────────

export type GDSRole = "gds_admin" | "property_manager" | "agent" | "revenue_manager" | "viewer";

export interface GDSUser {
  id: string;
  name: string;
  email: string;
  role: GDSRole;
  propertyIds?: string[]; // For property managers
  agentId?: string; // For agents
}
