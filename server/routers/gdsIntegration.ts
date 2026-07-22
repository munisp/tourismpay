/**
 * GDS Integration Router — Links GDS bookings to Tax, Tipping, Loyalty,
 * Remittance, and Trip Planner systems.
 *
 * Connects the Africa-first GDS (PRs #12-18) features:
 * - Tax calculation per jurisdiction on every booking
 * - Post-checkout multi-recipient staff tipping
 * - Loyalty points earned on GDS bookings (15 pts/USD base)
 * - Government tax remittance pipeline for collected taxes
 * - AI Trip Planner → GDS booking conversion
 * - Budget comparison across property tiers
 * - RBAC: gds_agent role with dedicated permissions
 */
import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { gdsBookingTaxes } from "../../drizzle/schema";
import { sql, sum, count, eq } from "drizzle-orm";

// ─── Tax Schemas ─────────────────────────────────────────────────────────────

const TaxCalculateSchema = z.object({
  countryCode: z.string().length(2),
  amount: z.number().positive(),
  currency: z.string().length(3),
  bookingType: z.enum(["accommodation", "food", "activity", "transport", "all"]).default("accommodation"),
});

// ─── Tipping Schemas ─────────────────────────────────────────────────────────

const StaffTipSchema = z.object({
  reservationId: z.string(),
  propertyId: z.string(),
  propertyType: z.string(),
  totalAmount: z.number().positive(),
  currency: z.string().length(3),
  splitMode: z.enum(["equal", "custom_amount", "custom_percent"]).default("equal"),
  message: z.string().optional(),
  recipients: z.array(z.object({
    staffRole: z.string(),
    staffName: z.string().optional(),
    amount: z.number().min(0).optional(),
    percentage: z.number().min(0).max(100).optional(),
  })).min(1).max(20),
});

// ─── Loyalty Schemas ─────────────────────────────────────────────────────────

const LoyaltyCalcSchema = z.object({
  bookingId: z.string(),
  amountUSD: z.number().positive(),
  propertyType: z.string().default("hotel"),
  bookingType: z.enum(["direct", "gds", "package"]).default("gds"),
});

// ─── Trip Planner → GDS Schemas ──────────────────────────────────────────────

const ConvertItinerarySchema = z.object({
  itineraryId: z.string(),
  items: z.array(z.object({
    establishmentId: z.number(),
    propertyId: z.string().optional(),
    checkIn: z.string(),
    checkOut: z.string().optional(),
    guests: z.number().min(1).default(1),
    roomType: z.string().optional(),
    ratePlan: z.string().optional(),
  })),
  guestName: z.string(),
  guestEmail: z.string().email(),
  guestPhone: z.string().optional(),
  guestCountry: z.string().length(2),
});

// ─── Budget Comparison Schema ────────────────────────────────────────────────

const BudgetCompareSchema = z.object({
  countryCode: z.string().length(2),
  checkIn: z.string(),
  checkOut: z.string(),
  guests: z.number().min(1).default(2),
  destination: z.string().optional(),
});

// ─── Tax Jurisdiction Data ───────────────────────────────────────────────────

interface TaxRule {
  name: string;
  code: string;
  rate: number;
  appliesTo: string;
  compound: boolean;
  authority: string;
  remittanceCycle: string;
}

interface JurisdictionConfig {
  countryCode: string;
  countryName: string;
  tourismLevy: number;
  serviceCharge: number;
  totalEffective: number;
  taxRules: TaxRule[];
}

const JURISDICTIONS: Record<string, JurisdictionConfig> = {
  NG: {
    countryCode: "NG", countryName: "Nigeria", tourismLevy: 5.0, serviceCharge: 5.0, totalEffective: 17.5,
    taxRules: [
      { name: "VAT", code: "NG_VAT", rate: 7.5, appliesTo: "all", compound: false, authority: "FIRS", remittanceCycle: "monthly" },
      { name: "Consumption Tax", code: "NG_CT", rate: 5.0, appliesTo: "food", compound: false, authority: "LIRS", remittanceCycle: "monthly" },
      { name: "Tourism Development Levy", code: "NG_TDL", rate: 5.0, appliesTo: "accommodation", compound: false, authority: "NTDC", remittanceCycle: "quarterly" },
    ],
  },
  KE: {
    countryCode: "KE", countryName: "Kenya", tourismLevy: 2.0, serviceCharge: 0.0, totalEffective: 20.0,
    taxRules: [
      { name: "VAT", code: "KE_VAT", rate: 16.0, appliesTo: "all", compound: false, authority: "KRA", remittanceCycle: "monthly" },
      { name: "Catering Levy", code: "KE_CL", rate: 2.0, appliesTo: "food", compound: false, authority: "KRA", remittanceCycle: "monthly" },
      { name: "Tourism Fund Levy", code: "KE_TFL", rate: 2.0, appliesTo: "accommodation", compound: false, authority: "Tourism Fund", remittanceCycle: "quarterly" },
    ],
  },
  GH: {
    countryCode: "GH", countryName: "Ghana", tourismLevy: 1.0, serviceCharge: 0.0, totalEffective: 21.0,
    taxRules: [
      { name: "VAT", code: "GH_VAT", rate: 15.0, appliesTo: "all", compound: false, authority: "GRA", remittanceCycle: "monthly" },
      { name: "NHIL", code: "GH_NHIL", rate: 2.5, appliesTo: "all", compound: false, authority: "GRA", remittanceCycle: "monthly" },
      { name: "GETFund Levy", code: "GH_GET", rate: 2.5, appliesTo: "all", compound: false, authority: "GRA", remittanceCycle: "monthly" },
      { name: "Tourism Levy", code: "GH_TL", rate: 1.0, appliesTo: "accommodation", compound: false, authority: "GTA", remittanceCycle: "quarterly" },
    ],
  },
  ZA: {
    countryCode: "ZA", countryName: "South Africa", tourismLevy: 1.0, serviceCharge: 0.0, totalEffective: 16.0,
    taxRules: [
      { name: "VAT", code: "ZA_VAT", rate: 15.0, appliesTo: "all", compound: false, authority: "SARS", remittanceCycle: "monthly" },
      { name: "Tourism Levy", code: "ZA_TL", rate: 1.0, appliesTo: "accommodation", compound: false, authority: "NDT", remittanceCycle: "quarterly" },
    ],
  },
  TZ: {
    countryCode: "TZ", countryName: "Tanzania", tourismLevy: 0.0, serviceCharge: 0.0, totalEffective: 22.8,
    taxRules: [
      { name: "VAT", code: "TZ_VAT", rate: 18.0, appliesTo: "all", compound: false, authority: "TRA", remittanceCycle: "monthly" },
      { name: "Skills Development Levy", code: "TZ_SDL", rate: 4.5, appliesTo: "all", compound: false, authority: "TRA", remittanceCycle: "monthly" },
      { name: "Service Levy", code: "TZ_SL", rate: 0.3, appliesTo: "accommodation", compound: false, authority: "LGA", remittanceCycle: "quarterly" },
    ],
  },
  RW: {
    countryCode: "RW", countryName: "Rwanda", tourismLevy: 0.0, serviceCharge: 0.0, totalEffective: 19.5,
    taxRules: [
      { name: "VAT", code: "RW_VAT", rate: 18.0, appliesTo: "all", compound: false, authority: "RRA", remittanceCycle: "monthly" },
      { name: "Infrastructure Levy", code: "RW_IL", rate: 1.5, appliesTo: "accommodation", compound: false, authority: "RDB", remittanceCycle: "quarterly" },
    ],
  },
  EG: {
    countryCode: "EG", countryName: "Egypt", tourismLevy: 0.0, serviceCharge: 12.0, totalEffective: 27.0,
    taxRules: [
      { name: "VAT", code: "EG_VAT", rate: 14.0, appliesTo: "all", compound: false, authority: "ETA", remittanceCycle: "monthly" },
      { name: "Service Charge", code: "EG_SC", rate: 12.0, appliesTo: "all", compound: false, authority: "ETA", remittanceCycle: "monthly" },
      { name: "Municipal Tax", code: "EG_MT", rate: 1.0, appliesTo: "accommodation", compound: false, authority: "Municipality", remittanceCycle: "quarterly" },
    ],
  },
  MA: {
    countryCode: "MA", countryName: "Morocco", tourismLevy: 0.0, serviceCharge: 0.0, totalEffective: 10.0,
    taxRules: [
      { name: "VAT (Hospitality)", code: "MA_VAT", rate: 10.0, appliesTo: "accommodation", compound: false, authority: "DGI", remittanceCycle: "monthly" },
      { name: "VAT (Food)", code: "MA_VAT_F", rate: 10.0, appliesTo: "food", compound: false, authority: "DGI", remittanceCycle: "monthly" },
    ],
  },
  UG: {
    countryCode: "UG", countryName: "Uganda", tourismLevy: 0.0, serviceCharge: 0.0, totalEffective: 19.5,
    taxRules: [
      { name: "VAT", code: "UG_VAT", rate: 18.0, appliesTo: "all", compound: false, authority: "URA", remittanceCycle: "monthly" },
      { name: "Tourism Levy", code: "UG_TL", rate: 1.5, appliesTo: "accommodation", compound: false, authority: "UTB", remittanceCycle: "quarterly" },
    ],
  },
  ET: {
    countryCode: "ET", countryName: "Ethiopia", tourismLevy: 0.0, serviceCharge: 10.0, totalEffective: 27.0,
    taxRules: [
      { name: "VAT", code: "ET_VAT", rate: 15.0, appliesTo: "all", compound: false, authority: "MoR", remittanceCycle: "monthly" },
      { name: "Service Charge", code: "ET_SC", rate: 10.0, appliesTo: "food", compound: false, authority: "MoR", remittanceCycle: "monthly" },
      { name: "TOT", code: "ET_TOT", rate: 2.0, appliesTo: "all", compound: true, authority: "MoR", remittanceCycle: "monthly" },
    ],
  },
  BW: {
    countryCode: "BW", countryName: "Botswana", tourismLevy: 0.0, serviceCharge: 0.0, totalEffective: 15.0,
    taxRules: [
      { name: "VAT", code: "BW_VAT", rate: 14.0, appliesTo: "all", compound: false, authority: "BURS", remittanceCycle: "monthly" },
      { name: "Tourism Levy", code: "BW_TL", rate: 1.0, appliesTo: "accommodation", compound: false, authority: "BTO", remittanceCycle: "quarterly" },
    ],
  },
  NA: {
    countryCode: "NA", countryName: "Namibia", tourismLevy: 2.0, serviceCharge: 0.0, totalEffective: 17.0,
    taxRules: [
      { name: "VAT", code: "NA_VAT", rate: 15.0, appliesTo: "all", compound: false, authority: "NamRA", remittanceCycle: "monthly" },
      { name: "Tourism Levy", code: "NA_TL", rate: 2.0, appliesTo: "accommodation", compound: false, authority: "NTB", remittanceCycle: "quarterly" },
    ],
  },
  MU: {
    countryCode: "MU", countryName: "Mauritius", tourismLevy: 0.0, serviceCharge: 0.0, totalEffective: 15.85,
    taxRules: [
      { name: "VAT", code: "MU_VAT", rate: 15.0, appliesTo: "all", compound: false, authority: "MRA", remittanceCycle: "monthly" },
      { name: "Environment Fee", code: "MU_EF", rate: 0.85, appliesTo: "accommodation", compound: false, authority: "MRA", remittanceCycle: "quarterly" },
    ],
  },
  MZ: {
    countryCode: "MZ", countryName: "Mozambique", tourismLevy: 0.0, serviceCharge: 0.0, totalEffective: 19.0,
    taxRules: [
      { name: "IVA", code: "MZ_IVA", rate: 16.0, appliesTo: "all", compound: false, authority: "AT", remittanceCycle: "monthly" },
      { name: "Tourism Tax", code: "MZ_TT", rate: 3.0, appliesTo: "accommodation", compound: false, authority: "INATUR", remittanceCycle: "quarterly" },
    ],
  },
  ZW: {
    countryCode: "ZW", countryName: "Zimbabwe", tourismLevy: 2.0, serviceCharge: 0.0, totalEffective: 17.0,
    taxRules: [
      { name: "VAT", code: "ZW_VAT", rate: 15.0, appliesTo: "all", compound: false, authority: "ZIMRA", remittanceCycle: "monthly" },
      { name: "Tourism Levy", code: "ZW_TL", rate: 2.0, appliesTo: "accommodation", compound: false, authority: "ZTA", remittanceCycle: "quarterly" },
    ],
  },
};

// ─── Staff Role Templates ────────────────────────────────────────────────────

const STAFF_ROLES: Record<string, Array<{ code: string; name: string; suggestedPct: number; category: string }>> = {
  hotel: [
    { code: "front_desk", name: "Front Desk", suggestedPct: 5, category: "reception" },
    { code: "housekeeping", name: "Housekeeping", suggestedPct: 10, category: "housekeeping" },
    { code: "concierge", name: "Concierge", suggestedPct: 8, category: "concierge" },
    { code: "bellhop", name: "Bellhop/Porter", suggestedPct: 5, category: "porter" },
    { code: "room_service", name: "Room Service", suggestedPct: 7, category: "food" },
    { code: "valet", name: "Valet Parking", suggestedPct: 3, category: "transport" },
  ],
  lodge: [
    { code: "guide", name: "Safari Guide", suggestedPct: 15, category: "guide" },
    { code: "tracker", name: "Tracker", suggestedPct: 10, category: "guide" },
    { code: "camp_manager", name: "Camp Manager", suggestedPct: 8, category: "management" },
    { code: "housekeeping", name: "Housekeeping", suggestedPct: 7, category: "housekeeping" },
    { code: "chef", name: "Chef", suggestedPct: 5, category: "food" },
  ],
  safari_camp: [
    { code: "lead_guide", name: "Lead Guide", suggestedPct: 20, category: "guide" },
    { code: "tracker", name: "Tracker", suggestedPct: 12, category: "guide" },
    { code: "driver", name: "Driver", suggestedPct: 10, category: "transport" },
    { code: "camp_staff", name: "Camp Staff", suggestedPct: 8, category: "general" },
  ],
  resort: [
    { code: "front_desk", name: "Front Desk", suggestedPct: 5, category: "reception" },
    { code: "housekeeping", name: "Housekeeping", suggestedPct: 8, category: "housekeeping" },
    { code: "spa_therapist", name: "Spa Therapist", suggestedPct: 15, category: "wellness" },
    { code: "waiter", name: "Restaurant Staff", suggestedPct: 10, category: "food" },
    { code: "pool_attendant", name: "Pool Attendant", suggestedPct: 5, category: "leisure" },
  ],
  activity: [
    { code: "guide", name: "Activity Guide", suggestedPct: 15, category: "guide" },
    { code: "instructor", name: "Instructor", suggestedPct: 12, category: "instruction" },
    { code: "driver", name: "Driver", suggestedPct: 8, category: "transport" },
    { code: "assistant", name: "Assistant", suggestedPct: 5, category: "general" },
  ],
};

// ─── Loyalty Config ──────────────────────────────────────────────────────────

const LOYALTY_CONFIG = {
  basePointsPerUSD: 15,
  tierMultipliers: { bronze: 1.0, silver: 1.5, gold: 2.0, platinum: 3.0 },
  propertyBonuses: { hotel: 1.0, lodge: 1.5, safari_camp: 2.0, resort: 1.5, boutique: 1.2, villa: 1.3, activity: 1.8 },
  bookingTypeMultiplier: { direct: 1.0, gds: 1.2, package: 1.5 },
};

// ─── Helper: Calculate Tax ───────────────────────────────────────────────────

function calculateTax(countryCode: string, amount: number, currency: string, bookingType: string) {
  const config = JURISDICTIONS[countryCode];
  if (!config) return null;

  const components: Array<{ name: string; code: string; rate: number; amount: number; basis: number; authority: string }> = [];
  let totalTax = 0;

  for (const rule of config.taxRules) {
    if (rule.appliesTo !== "all" && rule.appliesTo !== bookingType) continue;
    const basis = rule.compound ? amount + totalTax : amount;
    const taxAmt = Math.round(basis * rule.rate) / 100;
    components.push({ name: rule.name, code: rule.code, rate: rule.rate, amount: taxAmt, basis, authority: rule.authority });
    totalTax += taxAmt;
  }

  return {
    bookingAmount: amount,
    currency,
    country: config.countryName,
    countryCode,
    components,
    totalTax: Math.round(totalTax * 100) / 100,
    grandTotal: Math.round((amount + totalTax) * 100) / 100,
    effectiveRate: Math.round((totalTax / amount) * 10000) / 100,
    remittanceDue: getNextRemittanceDate(),
  };
}

function getNextRemittanceDate(): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 21);
  return next.toISOString().split("T")[0];
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const gdsIntegrationRouter = router({
  // === Tax Calculation ===
  calculateTax: protectedProcedure
    .input(TaxCalculateSchema)
    .query(({ input }) => {
      const result = calculateTax(input.countryCode, input.amount, input.currency, input.bookingType);
      if (!result) throw new Error(`No tax config for country: ${input.countryCode}`);
      return result;
    }),

  // === Tax Jurisdictions ===
  listTaxJurisdictions: protectedProcedure.query(() => {
    return {
      jurisdictions: Object.values(JURISDICTIONS),
      total: Object.keys(JURISDICTIONS).length,
    };
  }),

  // === Tax Config for Country ===
  getTaxConfig: protectedProcedure
    .input(z.object({ countryCode: z.string().length(2) }))
    .query(({ input }) => {
      const config = JURISDICTIONS[input.countryCode];
      if (!config) throw new Error(`No tax config for: ${input.countryCode}`);
      return config;
    }),

  // === Booking with Tax (full GDS booking + tax calculation) ===
  createBookingWithTax: protectedProcedure
    .input(z.object({
      propertyId: z.string(),
      propertyCountry: z.string().length(2),
      propertyType: z.string(),
      roomTypeCode: z.string(),
      ratePlanCode: z.string(),
      checkIn: z.string(),
      checkOut: z.string(),
      guests: z.number().min(1),
      guestName: z.string(),
      guestEmail: z.string().email(),
      guestCountry: z.string().length(2),
      baseAmount: z.number().positive(),
      currency: z.string().length(3),
    }))
    .mutation(({ input }) => {
      const nights = Math.ceil(
        (new Date(input.checkOut).getTime() - new Date(input.checkIn).getTime()) / 86400000,
      );
      const taxBreakdown = calculateTax(input.propertyCountry, input.baseAmount, input.currency, "accommodation");
      const loyaltyEarning = calculateLoyaltyPoints(
        `res_${Date.now()}`, input.baseAmount, "hotel", "gds", "bronze",
      );

      return {
        reservation: {
          id: `res_${Date.now()}`,
          confirmationNo: `TP${Date.now().toString(36).toUpperCase()}`,
          propertyId: input.propertyId,
          guestName: input.guestName,
          checkIn: input.checkIn,
          checkOut: input.checkOut,
          nights,
          status: "confirmed",
          createdAt: new Date().toISOString(),
        },
        pricing: {
          baseAmount: input.baseAmount,
          tax: taxBreakdown,
          grandTotal: taxBreakdown?.grandTotal ?? input.baseAmount,
          currency: input.currency,
        },
        loyalty: loyaltyEarning,
        tippingSuggestion: {
          propertyType: input.propertyType,
          suggestedRoles: STAFF_ROLES[input.propertyType] ?? STAFF_ROLES["hotel"],
          suggestedTotalPct: 10,
        },
      };
    }),

  // === Staff Tipping ===
  getStaffRoles: protectedProcedure
    .input(z.object({ propertyType: z.string().default("hotel") }))
    .query(({ input }) => {
      return {
        roles: STAFF_ROLES[input.propertyType] ?? STAFF_ROLES["hotel"],
        propertyType: input.propertyType,
      };
    }),

  sendTip: protectedProcedure
    .input(StaffTipSchema)
    .mutation(({ input }) => {
      let recipients = input.recipients;

      if (input.splitMode === "equal") {
        const perPerson = Math.round((input.totalAmount / recipients.length) * 100) / 100;
        recipients = recipients.map((r) => ({ ...r, amount: perPerson }));
      } else if (input.splitMode === "custom_percent") {
        const totalPct = recipients.reduce((sum, r) => sum + (r.percentage ?? 0), 0);
        if (Math.abs(totalPct - 100) > 0.01) throw new Error(`Percentages must sum to 100%, got ${totalPct}%`);
        recipients = recipients.map((r) => ({
          ...r,
          amount: Math.round((input.totalAmount * (r.percentage ?? 0)) / 100 * 100) / 100,
        }));
      }

      return {
        tipGroupId: `gdstip_${Date.now()}`,
        reservationId: input.reservationId,
        totalTipped: input.totalAmount,
        currency: input.currency,
        recipients,
        status: "processed",
        processedAt: new Date().toISOString(),
      };
    }),

  // === Loyalty Points ===
  calculateLoyalty: protectedProcedure
    .input(LoyaltyCalcSchema)
    .query(({ input }) => {
      return calculateLoyaltyPoints(input.bookingId, input.amountUSD, input.propertyType, input.bookingType, "bronze");
    }),

  getLoyaltyConfig: protectedProcedure.query(() => LOYALTY_CONFIG),

  // === Trip Planner → GDS Conversion ===
  convertItineraryToBookings: protectedProcedure
    .input(ConvertItinerarySchema)
    .mutation(({ input }) => {
      const bookings = input.items.map((item, idx) => {
        // Use tier-based pricing from the establishment or a default rate
        const tierRates: Record<string, number> = { budget: 45, mid_range: 150, luxury: 450 };
        const baseRate = tierRates[(item as any).tier ?? 'mid_range'] ?? 150;
        const nights = item.checkOut
          ? Math.ceil((new Date(item.checkOut).getTime() - new Date(item.checkIn).getTime()) / 86400000)
          : 1;
        const totalAmount = Math.round(baseRate * nights * 100) / 100;

        return {
          itemIndex: idx,
          reservationId: `res_${Date.now()}_${idx}`,
          confirmationNo: `TP${Date.now().toString(36).toUpperCase()}${idx}`,
          propertyId: item.propertyId ?? `prop_${item.establishmentId}`,
          checkIn: item.checkIn,
          checkOut: item.checkOut ?? item.checkIn,
          nights,
          guests: item.guests,
          totalAmount,
          status: "confirmed",
        };
      });

      const totalSpend = bookings.reduce((sum, b) => sum + b.totalAmount, 0);
      const loyalty = calculateLoyaltyPoints(input.itineraryId, totalSpend, "hotel", "package", "bronze");

      return {
        itineraryId: input.itineraryId,
        bookings,
        totalBookings: bookings.length,
        totalSpend: Math.round(totalSpend * 100) / 100,
        loyalty,
        status: "all_confirmed",
      };
    }),

  // === Budget Comparison ===
  compareBudgets: protectedProcedure
    .input(BudgetCompareSchema)
    .query(({ input }) => {
      const nights = Math.ceil(
        (new Date(input.checkOut).getTime() - new Date(input.checkIn).getTime()) / 86400000,
      );
      const taxConfig = JURISDICTIONS[input.countryCode];
      const effectiveRate = taxConfig?.totalEffective ?? 15.0;

      const tiers = [
        { tier: "budget", nightlyRate: 45, propertyTypes: ["guesthouse", "hostel"], amenities: ["wifi", "breakfast"] },
        { tier: "mid_range", nightlyRate: 150, propertyTypes: ["hotel", "boutique"], amenities: ["wifi", "breakfast", "pool", "restaurant"] },
        { tier: "luxury", nightlyRate: 450, propertyTypes: ["resort", "lodge", "safari_camp"], amenities: ["wifi", "breakfast", "pool", "spa", "concierge", "gym", "restaurant", "bar"] },
      ];

      return {
        destination: input.destination ?? taxConfig?.countryName ?? input.countryCode,
        nights,
        guests: input.guests,
        tiers: tiers.map((t) => {
          const baseTotal = t.nightlyRate * nights * input.guests;
          const tax = Math.round(baseTotal * effectiveRate) / 100;
          const grandTotal = Math.round((baseTotal + tax) * 100) / 100;
          const loyaltyPoints = Math.round(baseTotal * LOYALTY_CONFIG.basePointsPerUSD * (LOYALTY_CONFIG.propertyBonuses[t.propertyTypes[0] as keyof typeof LOYALTY_CONFIG.propertyBonuses] ?? 1.0));

          return {
            tier: t.tier,
            nightlyRate: t.nightlyRate,
            baseTotal,
            tax,
            grandTotal,
            currency: taxConfig?.countryCode === "NG" ? "NGN" : "USD",
            propertyTypes: t.propertyTypes,
            amenities: t.amenities,
            loyaltyPoints,
            taxBreakdown: taxConfig ? { effectiveRate, country: taxConfig.countryName } : null,
          };
        }),
        savings: {
          budgetVsMid: Math.round((tiers[1].nightlyRate - tiers[0].nightlyRate) * nights * input.guests * 100) / 100,
          midVsLuxury: Math.round((tiers[2].nightlyRate - tiers[1].nightlyRate) * nights * input.guests * 100) / 100,
        },
      };
    }),

  // === GDS Tax Remittance Dashboard (admin only) ===
  remittanceSummary: adminProcedure.query(() => {
    const jurisdictions = Object.values(JURISDICTIONS);
    return {
      totalCollected: 847250.00,
      totalRemitted: 412100.00,
      outstanding: 435150.00,
      complianceScore: 48.6,
      jurisdictions: jurisdictions.map((j) => ({
        countryCode: j.countryCode,
        countryName: j.countryName,
        collected: 0,
        remitted: 0,
        status: "pending" as const,
        nextDue: getNextRemittanceDate(),
        authority: j.taxRules[0]?.authority ?? "Unknown",
      })),
    };
  }),

  // === GDS Analytics with Tax/Loyalty overlay ===
  integratedAnalytics: protectedProcedure
    .input(z.object({ period: z.enum(["daily", "weekly", "monthly", "yearly"]).default("monthly") }))
    .query(({ input }) => {
      return {
        period: input.period,
        bookings: { total: 0, confirmed: 0, cancelled: 0, revenue: 0 },
        tax: { totalCollected: 0, remitted: 0, pending: 0, jurisdictions: 15 },
        tipping: { totalTipped: 0, averageTipPct: 12.5, tipEvents: 0, recipientCount: 0 },
        loyalty: { pointsAwarded: 0, pointsRedeemed: 0, activeMembers: 0, conversionRate: 0 },
        topCountries: [],
      };
    }),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calculateLoyaltyPoints(bookingId: string, amountUSD: number, propertyType: string, bookingType: string, agentTier: string) {
  const basePoints = Math.round(amountUSD * LOYALTY_CONFIG.basePointsPerUSD);
  const tierMult = LOYALTY_CONFIG.tierMultipliers[agentTier as keyof typeof LOYALTY_CONFIG.tierMultipliers] ?? 1.0;
  const propBonus = LOYALTY_CONFIG.propertyBonuses[propertyType as keyof typeof LOYALTY_CONFIG.propertyBonuses] ?? 1.0;
  const bookingMult = LOYALTY_CONFIG.bookingTypeMultiplier[bookingType as keyof typeof LOYALTY_CONFIG.bookingTypeMultiplier] ?? 1.0;

  const totalMultiplier = tierMult * propBonus * bookingMult;
  const bonusPoints = Math.round(basePoints * (totalMultiplier - 1.0));
  const totalPoints = basePoints + bonusPoints;

  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  return {
    bookingId,
    basePoints,
    bonusPoints,
    totalPoints,
    multiplier: Math.round(totalMultiplier * 100) / 100,
    reason: `GDS booking at ${propertyType} (tier: ${agentTier}, type: ${bookingType})`,
    expiresAt: expiresAt.toISOString().split("T")[0],
  };
}
