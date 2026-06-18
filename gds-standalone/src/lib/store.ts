/**
 * In-memory CRUD Store — Shared data layer for GDS gateway.
 * Provides seed data + full CRUD for all entities when backend services are offline.
 * In production, this is replaced by PostgreSQL queries.
 */

// ─── Establishments ──────────────────────────────────────────────
export interface Establishment {
  id: string;
  name: string;
  type: string;
  country: string;
  city: string;
  address: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  rooms: number;
  star_rating: number;
  tier: string;
  status: string;
  onboarding_step: number;
  onboarding_channel: string;
  amenities: string[];
  currency: string;
  base_rate: number;
  verified: boolean;
  created_at: string;
  updated_at: string;
}

export const establishments: Establishment[] = [
  {
    id: "EST-001", name: "Serena Hotel Nairobi", type: "hotel", country: "KE", city: "Nairobi",
    address: "Kenyatta Ave, Nairobi", contact_name: "John Mwangi", contact_email: "john@serena.co.ke",
    contact_phone: "+254712345678", rooms: 180, star_rating: 5, tier: "full", status: "active",
    onboarding_step: 5, onboarding_channel: "web", amenities: ["pool", "spa", "wifi", "restaurant", "gym", "parking"],
    currency: "KES", base_rate: 22000, verified: true, created_at: "2024-01-15T10:00:00Z", updated_at: "2026-06-01T10:00:00Z",
  },
  {
    id: "EST-002", name: "Zanzibar Beach Resort", type: "resort", country: "TZ", city: "Zanzibar",
    address: "Nungwi Beach Road", contact_name: "Hamisi Juma", contact_email: "hamisi@zanzibar-beach.tz",
    contact_phone: "+255712345678", rooms: 85, star_rating: 4, tier: "web_lite", status: "active",
    onboarding_step: 5, onboarding_channel: "agent", amenities: ["beach", "pool", "restaurant", "wifi", "diving"],
    currency: "TZS", base_rate: 280000, verified: true, created_at: "2024-06-20T14:00:00Z", updated_at: "2026-05-15T09:00:00Z",
  },
  {
    id: "EST-003", name: "Mara Plains Camp", type: "safari_camp", country: "KE", city: "Masai Mara",
    address: "Olare Motorogi Conservancy", contact_name: "Grace Kiplagat", contact_email: "grace@maraplains.ke",
    contact_phone: "+254798765432", rooms: 7, star_rating: 5, tier: "whatsapp", status: "active",
    onboarding_step: 5, onboarding_channel: "whatsapp", amenities: ["safari", "pool", "restaurant", "wifi"],
    currency: "USD", base_rate: 1200, verified: true, created_at: "2025-03-10T08:00:00Z", updated_at: "2026-04-22T11:00:00Z",
  },
  {
    id: "EST-004", name: "Table Mountain Inn", type: "boutique_hotel", country: "ZA", city: "Cape Town",
    address: "Long Street 42, Cape Town", contact_name: "Pieter du Plessis", contact_email: "pieter@tablemountaininn.co.za",
    contact_phone: "+27821234567", rooms: 32, star_rating: 3, tier: "full", status: "active",
    onboarding_step: 5, onboarding_channel: "web", amenities: ["wifi", "restaurant", "parking", "bar"],
    currency: "ZAR", base_rate: 2800, verified: true, created_at: "2024-09-05T12:00:00Z", updated_at: "2026-05-30T16:00:00Z",
  },
  {
    id: "EST-005", name: "Kigali Marriott", type: "hotel", country: "RW", city: "Kigali",
    address: "KN 3 Ave, Kigali", contact_name: "Diane Uwimana", contact_email: "diane@kigalimarriott.rw",
    contact_phone: "+250788123456", rooms: 254, star_rating: 5, tier: "full", status: "active",
    onboarding_step: 5, onboarding_channel: "web", amenities: ["pool", "spa", "wifi", "restaurant", "gym", "conference"],
    currency: "RWF", base_rate: 350000, verified: true, created_at: "2023-11-01T09:00:00Z", updated_at: "2026-06-05T14:00:00Z",
  },
  {
    id: "EST-006", name: "Lekki Guesthouse", type: "guesthouse", country: "NG", city: "Lagos",
    address: "Admiralty Way, Lekki Phase 1", contact_name: "Chidinma Okafor", contact_email: "chidinma@lekkiguest.ng",
    contact_phone: "+2348031234567", rooms: 12, star_rating: 2, tier: "sms_only", status: "pending_verification",
    onboarding_step: 3, onboarding_channel: "ussd", amenities: ["wifi", "parking"],
    currency: "NGN", base_rate: 35000, verified: false, created_at: "2026-06-08T15:00:00Z", updated_at: "2026-06-08T15:00:00Z",
  },
  {
    id: "EST-007", name: "Accra Beach Lodge", type: "lodge", country: "GH", city: "Accra",
    address: "Labadi Beach Road", contact_name: "Kofi Mensah", contact_email: "kofi@accrabeach.gh",
    contact_phone: "+233241234567", rooms: 24, star_rating: 3, tier: "whatsapp", status: "active",
    onboarding_step: 5, onboarding_channel: "agent", amenities: ["beach", "wifi", "restaurant"],
    currency: "GHS", base_rate: 850, verified: true, created_at: "2025-07-14T10:00:00Z", updated_at: "2026-05-20T08:00:00Z",
  },
  {
    id: "EST-008", name: "Marrakech Riad Andalous", type: "riad", country: "MA", city: "Marrakech",
    address: "Derb Sidi Ahmed, Medina", contact_name: "Youssef El Amrani", contact_email: "youssef@riadandalous.ma",
    contact_phone: "+212612345678", rooms: 8, star_rating: 4, tier: "web_lite", status: "active",
    onboarding_step: 5, onboarding_channel: "web", amenities: ["pool", "spa", "restaurant", "wifi", "terrace"],
    currency: "MAD", base_rate: 1800, verified: true, created_at: "2025-01-22T11:00:00Z", updated_at: "2026-06-02T13:00:00Z",
  },
  {
    id: "EST-009", name: "Kampala Backpackers", type: "hostel", country: "UG", city: "Kampala",
    address: "Natete Road, Kampala", contact_name: "Moses Ssempijja", contact_email: "moses@kampalabackpackers.ug",
    contact_phone: "+256771234567", rooms: 18, star_rating: 1, tier: "sms_only", status: "in_review",
    onboarding_step: 4, onboarding_channel: "sms", amenities: ["wifi", "bar"],
    currency: "UGX", base_rate: 80000, verified: false, created_at: "2026-06-05T16:00:00Z", updated_at: "2026-06-10T09:00:00Z",
  },
  {
    id: "EST-010", name: "Volcanoes Bwindi Lodge", type: "eco_lodge", country: "UG", city: "Bwindi",
    address: "Bwindi Impenetrable Forest", contact_name: "Agnes Naturinda", contact_email: "agnes@volcanoeslodge.ug",
    contact_phone: "+256702345678", rooms: 10, star_rating: 4, tier: "web_lite", status: "active",
    onboarding_step: 5, onboarding_channel: "agent", amenities: ["restaurant", "wifi", "guided_treks", "spa"],
    currency: "USD", base_rate: 550, verified: true, created_at: "2025-04-18T07:00:00Z", updated_at: "2026-05-25T10:00:00Z",
  },
];

// ─── Field Agents ────────────────────────────────────────────────
export interface FieldAgent {
  id: string;
  name: string;
  email: string;
  phone: string;
  region: string;
  country: string;
  status: string;
  properties_onboarded: number;
  success_rate: number;
  commission_earned: number;
  kyc_verified: boolean;
  certification: string;
  training_completed: boolean;
  joined_at: string;
}

export const fieldAgents: FieldAgent[] = [
  { id: "FA-001", name: "James Kamau", email: "james@agents.gds.ke", phone: "+254712000001", region: "Nairobi", country: "KE", status: "active", properties_onboarded: 23, success_rate: 0.87, commission_earned: 34500, kyc_verified: true, certification: "gold", training_completed: true, joined_at: "2024-06-01T10:00:00Z" },
  { id: "FA-002", name: "Amina Hassan", email: "amina@agents.gds.ke", phone: "+254712000002", region: "Mombasa", country: "KE", status: "active", properties_onboarded: 31, success_rate: 0.92, commission_earned: 42000, kyc_verified: true, certification: "platinum", training_completed: true, joined_at: "2024-03-15T08:00:00Z" },
  { id: "FA-003", name: "David Osei", email: "david@agents.gds.gh", phone: "+233241000003", region: "Accra", country: "GH", status: "active", properties_onboarded: 18, success_rate: 0.83, commission_earned: 27500, kyc_verified: true, certification: "silver", training_completed: true, joined_at: "2024-09-20T12:00:00Z" },
  { id: "FA-004", name: "Fatima Diallo", email: "fatima@agents.gds.sn", phone: "+221771000004", region: "Dakar", country: "SN", status: "active", properties_onboarded: 15, success_rate: 0.80, commission_earned: 22000, kyc_verified: true, certification: "silver", training_completed: true, joined_at: "2025-01-10T09:00:00Z" },
  { id: "FA-005", name: "Emmanuel Nkosi", email: "emmanuel@agents.gds.za", phone: "+27821000005", region: "Johannesburg", country: "ZA", status: "active", properties_onboarded: 27, success_rate: 0.89, commission_earned: 38000, kyc_verified: true, certification: "gold", training_completed: true, joined_at: "2024-07-08T14:00:00Z" },
  { id: "FA-006", name: "Wanjiku Muthoni", email: "wanjiku@agents.gds.ke", phone: "+254712000006", region: "Kisumu", country: "KE", status: "active", properties_onboarded: 12, success_rate: 0.75, commission_earned: 18000, kyc_verified: true, certification: "bronze", training_completed: true, joined_at: "2025-05-01T10:00:00Z" },
  { id: "FA-007", name: "Abdul Razak", email: "abdul@agents.gds.ng", phone: "+2348031000007", region: "Lagos", country: "NG", status: "pending_kyc", properties_onboarded: 0, success_rate: 0, commission_earned: 0, kyc_verified: false, certification: "none", training_completed: false, joined_at: "2026-06-10T16:00:00Z" },
  { id: "FA-008", name: "Marie Claire", email: "marie@agents.gds.rw", phone: "+250781000008", region: "Kigali", country: "RW", status: "active", properties_onboarded: 20, success_rate: 0.90, commission_earned: 30000, kyc_verified: true, certification: "gold", training_completed: true, joined_at: "2024-11-15T08:00:00Z" },
];

// ─── Onboarding Applications ─────────────────────────────────────
export interface OnboardingApplication {
  id: string;
  establishment_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  country: string;
  city: string;
  property_type: string;
  rooms: number;
  channel: string;
  assigned_agent_id: string | null;
  status: string;
  step: number;
  total_steps: number;
  notes: string;
  created_at: string;
  updated_at: string;
}

export const onboardingApplications: OnboardingApplication[] = [
  { id: "OB-001", establishment_name: "Lekki Guesthouse", contact_name: "Chidinma Okafor", contact_email: "chidinma@lekkiguest.ng", contact_phone: "+2348031234567", country: "NG", city: "Lagos", property_type: "guesthouse", rooms: 12, channel: "ussd", assigned_agent_id: null, status: "documents_pending", step: 3, total_steps: 5, notes: "Awaiting property photos via WhatsApp", created_at: "2026-06-08T15:00:00Z", updated_at: "2026-06-10T09:00:00Z" },
  { id: "OB-002", establishment_name: "Kampala Backpackers", contact_name: "Moses Ssempijja", contact_email: "moses@kampalabackpackers.ug", contact_phone: "+256771234567", country: "UG", city: "Kampala", property_type: "hostel", rooms: 18, channel: "sms", assigned_agent_id: "FA-006", status: "in_review", step: 4, total_steps: 5, notes: "Photos received, rates under review", created_at: "2026-06-05T16:00:00Z", updated_at: "2026-06-10T09:00:00Z" },
  { id: "OB-003", establishment_name: "Dar es Salaam Executive Suites", contact_name: "Ali Mwinyi", contact_email: "ali@darexec.tz", contact_phone: "+255712000010", country: "TZ", city: "Dar es Salaam", property_type: "serviced_apartment", rooms: 42, channel: "agent", assigned_agent_id: "FA-002", status: "rate_setup", step: 2, total_steps: 5, notes: "Agent visited, property details captured", created_at: "2026-06-09T11:00:00Z", updated_at: "2026-06-09T14:00:00Z" },
  { id: "OB-004", establishment_name: "Nakuru Farm Stay", contact_name: "Peter Wachira", contact_email: "peter@nakurufarm.ke", contact_phone: "+254722000011", country: "KE", city: "Nakuru", property_type: "farm_stay", rooms: 5, channel: "whatsapp", assigned_agent_id: "FA-001", status: "registered", step: 1, total_steps: 5, notes: "Initial registration via WhatsApp", created_at: "2026-06-10T08:00:00Z", updated_at: "2026-06-10T08:00:00Z" },
  { id: "OB-005", establishment_name: "Abuja Grand Palace", contact_name: "Ibrahim Musa", contact_email: "ibrahim@abujagrand.ng", contact_phone: "+2349031000012", country: "NG", city: "Abuja", property_type: "hotel", rooms: 120, channel: "web", assigned_agent_id: null, status: "verified", step: 5, total_steps: 5, notes: "All documents verified, ready to go live", created_at: "2026-06-03T10:00:00Z", updated_at: "2026-06-11T09:00:00Z" },
  { id: "OB-006", establishment_name: "Windhoek Safari Lodge", contact_name: "Hendrik van Wyk", contact_email: "hendrik@windhoeksafari.na", contact_phone: "+264811000013", country: "NA", city: "Windhoek", property_type: "safari_lodge", rooms: 15, channel: "web", assigned_agent_id: null, status: "rejected", step: 3, total_steps: 5, notes: "Failed verification — inconsistent property details", created_at: "2026-05-28T12:00:00Z", updated_at: "2026-06-07T16:00:00Z" },
];

// Helper: generate unique ID
export function generateId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
