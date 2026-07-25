/**
 * Journey Orchestrator tRPC Router
 *
 * This router is the API surface for all stakeholder journeys.
 * Every mutation starts a Temporal workflow — no direct DB writes here.
 * Every query reads from the DB (read path is fine without Temporal).
 *
 * Architecture:
 *   tRPC mutation → startXxxWorkflow() → Temporal workflow → activities → DB + services
 *   tRPC query    → direct DB read
 */

import { z } from "zod";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getWorkflowStatus } from "../_core/temporal-integration";

// Import all Temporal workflow starters
import {
  startMerchantOnboardingWorkflow,
  signalDocumentsSubmitted,
  signalKybApproved,
  signalKybRejected,
  getMerchantWorkflowStatus,
} from "../temporal/merchant-workflows";

import {
  startWalletTopupWorkflow,
  startTouristPaymentWorkflow,
  startAirportArrivalWorkflow,
  startAiTripPlannerWorkflow,
  startGroupBookingWorkflow,
  startRefundWorkflow,
  startHighValueTransactionWorkflow,
  startSosAlertWorkflow,
  startAiConciergeWorkflow,
  startNightlifeJourneyWorkflow,
  startCulturalTourismWorkflow,
  startStablecoinConversionWorkflow,
  startMultiCurrencyStatementWorkflow,
} from "../temporal/tourist-workflows";

const MERCHANT_TYPES = ["hotel", "restaurant", "airbnb", "concert", "transport", "nightclub"] as const;

export const journeyOrchestratorRouter = router({

  // ─── MERCHANT ONBOARDING JOURNEYS ─────────────────────────────────────────

  startMerchantOnboarding: protectedProcedure
    .input(z.object({
      merchantType: z.enum(MERCHANT_TYPES),
      businessName: z.string().min(2).max(200),
      ownerName: z.string().min(2).max(200),
      ownerEmail: z.string().email(),
      ownerPhone: z.string().min(10).max(20),
      rcNumber: z.string().optional(),
      tinNumber: z.string().optional(),
      businessAddress: z.string().min(5).max(500),
      lga: z.string().optional(),
      state: z.string().default("Lagos"),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await startMerchantOnboardingWorkflow({
        ...input,
        initiatedByUserId: String(ctx.user.id),
      });
      return {
        ...result,
        message: `${input.merchantType} merchant onboarding started. Upload KYB documents to proceed.`,
        requiredDocuments: {
          hotel: ["cac_certificate", "tin_certificate", "hotel_license", "fire_safety_cert", "utility_bill", "owner_id"],
          restaurant: ["cac_certificate", "tin_certificate", "food_handler_permit", "nafdac_cert", "utility_bill", "owner_id"],
          airbnb: ["cac_certificate", "tin_certificate", "property_deed", "utility_bill", "owner_id", "property_photos"],
          concert: ["cac_certificate", "tin_certificate", "event_permit", "venue_license", "utility_bill", "owner_id"],
          transport: ["cac_certificate", "tin_certificate", "transport_license", "vehicle_registration", "driver_license", "owner_id"],
          nightclub: ["cac_certificate", "tin_certificate", "entertainment_license", "liquor_license", "fire_safety_cert", "owner_id"],
        }[input.merchantType],
      };
    }),

  submitKybDocuments: protectedProcedure
    .input(z.object({
      workflowId: z.string(),
      applicationId: z.string(),
      documents: z.array(z.object({
        documentType: z.string(),
        fileUrl: z.string().url(),
        fileName: z.string(),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      await signalDocumentsSubmitted({
        workflowId: input.workflowId,
        applicationId: input.applicationId,
        documents: input.documents,
        submittedByUserId: String(ctx.user.id),
      });
      return {
        applicationId: input.applicationId,
        documentsSubmitted: input.documents.length,
        message: "Documents submitted for KYB review. Expect a response within 24-48 hours.",
      };
    }),

  approveMerchantKyb: adminProcedure
    .input(z.object({
      workflowId: z.string(),
      applicationId: z.string(),
      complianceScore: z.number().min(0).max(100).default(85),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await signalKybApproved({
        workflowId: input.workflowId,
        applicationId: input.applicationId,
        complianceScore: input.complianceScore,
        reviewedBy: String(ctx.user.id),
        notes: input.notes,
      });
      return { ...result, message: "Merchant KYB approved. Wallet and ledger account provisioned." };
    }),

  rejectMerchantKyb: adminProcedure
    .input(z.object({
      workflowId: z.string(),
      applicationId: z.string(),
      reason: z.string().min(10).max(500),
    }))
    .mutation(async ({ input, ctx }) => {
      await signalKybRejected({
        workflowId: input.workflowId,
        applicationId: input.applicationId,
        reason: input.reason,
        reviewedBy: String(ctx.user.id),
      });
      return { message: "Application rejected. Merchant has been notified." };
    }),

  getMerchantOnboardingStatus: protectedProcedure
    .input(z.object({ workflowId: z.string() }))
    .query(async ({ input }) => {
      return getMerchantWorkflowStatus(input.workflowId);
    }),

  listMerchantApplications: adminProcedure
    .input(z.object({
      status: z.string().optional(),
      merchantType: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(50),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.execute(sql`
        SELECT * FROM merchant_onboarding_applications
        WHERE (${input.status ?? null} IS NULL OR status = ${input.status ?? null})
          AND (${input.merchantType ?? null} IS NULL OR merchant_type = ${input.merchantType ?? null})
        ORDER BY created_at DESC
        LIMIT ${input.limit} OFFSET ${input.offset}
      `);
      return { applications: rows as any[], total: (rows as any[]).length };
    }),

  // ─── TOURIST JOURNEY WORKFLOWS ────────────────────────────────────────────

  initiateWalletTopup: protectedProcedure
    .input(z.object({
      touristProfileId: z.string(),
      sourceCurrency: z.enum(["USD", "GBP", "EUR", "USDC", "USDT", "DAI"]),
      sourceAmount: z.number().positive(),
      topupMethod: z.enum(["wire_transfer", "card", "swift", "sepa", "crypto"]),
      providerReference: z.string().optional(),
      onChainTxHash: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      return startWalletTopupWorkflow({
        userId: ctx.user.id,
        ...input,
      });
    }),

  payAtMerchant: protectedProcedure
    .input(z.object({
      touristProfileId: z.string(),
      merchantId: z.string(),
      merchantType: z.enum(MERCHANT_TYPES),
      description: z.string().min(1).max(500),
      amountNgn: z.number().positive(),
      tipAmountNgn: z.number().min(0).default(0),
      paymentMethod: z.enum(["wallet", "ussd", "qr"]).default("wallet"),
      serviceReferenceId: z.string().optional(),
      itineraryItemId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      return startTouristPaymentWorkflow({
        userId: ctx.user.id,
        ...input,
      });
    }),

  startAirportArrival: protectedProcedure
    .input(z.object({
      touristProfileId: z.string(),
      itineraryId: z.string().optional(),
      flightNumber: z.string(),
      arrivalAirport: z.enum(["MMIA", "NAIA", "PHC"]).default("MMIA"),
      arrivalDateTime: z.number().int(),
      hotelMerchantId: z.string().optional(),
      transportMerchantId: z.string().optional(),
      simProvider: z.enum(["MTN", "Airtel", "Glo", "9mobile"]).default("MTN"),
    }))
    .mutation(async ({ input, ctx }) => {
      return startAirportArrivalWorkflow({ userId: ctx.user.id, ...input });
    }),

  startAiTripPlanner: protectedProcedure
    .input(z.object({
      touristProfileId: z.string(),
      prompt: z.string().min(10).max(1000),
      destination: z.string().default("Lagos, Nigeria"),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      budgetNgn: z.number().positive(),
      preferences: z.array(z.string()).default([]),
      profileType: z.string().default("tourist"),
      autoBook: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      return startAiTripPlannerWorkflow({ userId: ctx.user.id, ...input });
    }),

  startGroupBooking: protectedProcedure
    .input(z.object({
      organizerTouristProfileId: z.string(),
      bookingType: z.enum(["hotel", "airbnb", "transport", "event", "restaurant"]),
      referenceId: z.string(),
      groupName: z.string().min(2).max(200),
      participants: z.array(z.object({
        name: z.string(),
        email: z.string().email(),
        phone: z.string().optional(),
      })).min(1).max(50),
      totalAmountNgn: z.number().positive(),
      splitMethod: z.enum(["equal", "custom", "organizer_pays"]).default("equal"),
    }))
    .mutation(async ({ input, ctx }) => {
      return startGroupBookingWorkflow({
        organizerUserId: ctx.user.id,
        ...input,
      });
    }),

  requestRefund: protectedProcedure
    .input(z.object({
      touristProfileId: z.string(),
      originalTransactionId: z.string(),
      bookingType: z.string(),
      bookingReferenceId: z.string(),
      merchantId: z.string(),
      requestedAmountNgn: z.number().positive(),
      reason: z.enum(["cancellation", "no_show", "service_failure", "fraud", "other"]),
      description: z.string().min(10).max(1000),
    }))
    .mutation(async ({ input, ctx }) => {
      return startRefundWorkflow({ userId: ctx.user.id, ...input });
    }),

  startHighValueTransaction: protectedProcedure
    .input(z.object({
      touristProfileId: z.string(),
      transactionId: z.string(),
      amountNgn: z.number().min(5_000_000),
      merchantId: z.string(),
      merchantType: z.enum(MERCHANT_TYPES),
      description: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      return startHighValueTransactionWorkflow({ userId: ctx.user.id, ...input });
    }),

  triggerSosAlert: protectedProcedure
    .input(z.object({
      touristProfileId: z.string(),
      alertType: z.enum(["medical", "security", "accident", "lost", "other"]),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      address: z.string().optional(),
      description: z.string().min(5).max(500),
    }))
    .mutation(async ({ input, ctx }) => {
      return startSosAlertWorkflow({ userId: ctx.user.id, ...input });
    }),

  startAiConcierge: protectedProcedure
    .input(z.object({
      touristProfileId: z.string(),
      sessionType: z.enum(["general", "trip_planning", "booking", "complaint", "recommendation"]).default("general"),
      initialMessage: z.string().min(5).max(1000),
      context: z.object({
        itineraryId: z.string().optional(),
        currentLocation: z.string().optional(),
        preferences: z.array(z.string()).optional(),
        budgetNgn: z.number().optional(),
      }).default({}),
    }))
    .mutation(async ({ input, ctx }) => {
      return startAiConciergeWorkflow({ userId: ctx.user.id, ...input });
    }),

  startNightlifeJourney: protectedProcedure
    .input(z.object({
      touristProfileId: z.string(),
      itineraryId: z.string().optional(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      budgetNgn: z.number().positive().default(500000),
      preferences: z.array(z.string()).default(["afrobeats", "vip", "beach"]),
    }))
    .mutation(async ({ input, ctx }) => {
      return startNightlifeJourneyWorkflow({ userId: ctx.user.id, ...input });
    }),

  startCulturalTourism: protectedProcedure
    .input(z.object({
      touristProfileId: z.string(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      durationDays: z.number().int().min(1).max(14).default(3),
      budgetNgn: z.number().positive().default(200000),
    }))
    .mutation(async ({ input, ctx }) => {
      return startCulturalTourismWorkflow({ userId: ctx.user.id, ...input });
    }),

  convertStablecoin: protectedProcedure
    .input(z.object({
      touristProfileId: z.string(),
      tokenSymbol: z.enum(["USDC", "USDT", "DAI", "BUSD"]),
      tokenAmount: z.number().positive(),
      walletAddress: z.string().min(10).max(100),
      onChainTxHash: z.string().min(10).max(100),
    }))
    .mutation(async ({ input, ctx }) => {
      return startStablecoinConversionWorkflow({ userId: ctx.user.id, ...input });
    }),

  generateMultiCurrencyStatement: protectedProcedure
    .input(z.object({
      touristProfileId: z.string(),
      periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }))
    .mutation(async ({ input, ctx }) => {
      return startMultiCurrencyStatementWorkflow({ userId: ctx.user.id, ...input });
    }),

  // ─── QUERIES ──────────────────────────────────────────────────────────────

  getWorkflowStatus: protectedProcedure
    .input(z.object({ workflowId: z.string() }))
    .query(async ({ input }) => {
      return getWorkflowStatus(input.workflowId);
    }),

  getItinerary: protectedProcedure
    .input(z.object({ itineraryId: z.string() }))
    .query(async ({ input }) => {
      const db = getDb();
      const [itinerary, days] = await Promise.all([
        db.execute(sql`SELECT * FROM itineraries WHERE id = ${input.itineraryId} LIMIT 1`),
        db.execute(sql`
          SELECT d.*, json_agg(i.* ORDER BY i.sort_order) as items
          FROM itinerary_days d
          LEFT JOIN itinerary_items i ON i.day_id = d.id
          WHERE d.itinerary_id = ${input.itineraryId}
          GROUP BY d.id ORDER BY d.day_number
        `),
      ]);
      const itin = (itinerary as any[])[0];
      if (!itin) throw new TRPCError({ code: "NOT_FOUND", message: "Itinerary not found" });
      return { ...itin, days: days as any[] };
    }),

  listItineraries: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(50).default(20),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const rows = await db.execute(sql`
        SELECT * FROM itineraries WHERE user_id = ${ctx.user.id}
        ORDER BY created_at DESC LIMIT ${input.limit} OFFSET ${input.offset}
      `);
      return { itineraries: rows as any[], total: (rows as any[]).length };
    }),

  getTouristJourneySummary: protectedProcedure
    .input(z.object({ touristProfileId: z.string() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const [profile, balances, topups, payments, loyaltyRows, bookings, itineraries] = await Promise.all([
        db.execute(sql`SELECT * FROM tourist_profiles WHERE id = ${input.touristProfileId} LIMIT 1`),
        db.execute(sql`SELECT currency, balance FROM wallet_balances WHERE user_id = ${ctx.user.id}`),
        db.execute(sql`SELECT * FROM wallet_topups WHERE user_id = ${ctx.user.id} ORDER BY created_at DESC LIMIT 10`),
        db.execute(sql`SELECT sp.*, m.business_name as merchant_name FROM service_payments sp LEFT JOIN merchants m ON m.id = sp.merchant_id WHERE sp.tourist_profile_id = ${input.touristProfileId} ORDER BY sp.created_at DESC LIMIT 20`),
        db.execute(sql`SELECT COALESCE(SUM(CASE WHEN transaction_type = 'earn' THEN points ELSE -points END), 0) as total_points FROM loyalty_transactions WHERE user_id = ${ctx.user.id}`),
        db.execute(sql`SELECT * FROM tourist_bookings WHERE tourist_profile_id = ${input.touristProfileId} ORDER BY created_at DESC LIMIT 20`),
        db.execute(sql`SELECT * FROM itineraries WHERE tourist_profile_id = ${input.touristProfileId} ORDER BY created_at DESC LIMIT 5`),
      ]);
      const totalSpend = (payments as any[]).reduce((s: number, p: any) => s + (p.total_amount_ngn ?? 0), 0);
      return {
        profile: (profile as any[])[0],
        walletBalances: balances as any[],
        topupHistory: topups as any[],
        recentPayments: payments as any[],
        bookings: bookings as any[],
        itineraries: itineraries as any[],
        loyaltyPoints: (loyaltyRows as any[])[0]?.total_points ?? 0,
        totalSpendNgn: totalSpend,
        journeyStats: {
          totalTopups: (topups as any[]).length,
          totalPayments: (payments as any[]).length,
          totalBookings: (bookings as any[]).length,
          totalItineraries: (itineraries as any[]).length,
          merchantTypesVisited: [...new Set((payments as any[]).map((p: any) => p.service_type))],
        },
      };
    }),

  getJourneyDashboard: adminProcedure.query(async () => {
    const db = getDb();
    const [merchantApps, touristProfiles, recentPayments, topups, activeWorkflows] = await Promise.all([
      db.execute(sql`SELECT merchant_type, status, COUNT(*) as count FROM merchant_onboarding_applications GROUP BY merchant_type, status ORDER BY merchant_type, status`),
      db.execute(sql`SELECT profile_type, nationality, COUNT(*) as count FROM tourist_profiles GROUP BY profile_type, nationality ORDER BY count DESC LIMIT 20`),
      db.execute(sql`SELECT service_type, COUNT(*) as count, SUM(total_amount_ngn) as total_ngn FROM service_payments WHERE created_at > ${Math.floor(Date.now() / 1000) - 86400 * 30} GROUP BY service_type ORDER BY total_ngn DESC`),
      db.execute(sql`SELECT source_currency, COUNT(*) as count, SUM(target_amount) as total_ngn FROM wallet_topups WHERE status = 'completed' AND created_at > ${Math.floor(Date.now() / 1000) - 86400 * 30} GROUP BY source_currency ORDER BY total_ngn DESC`),
      db.execute(sql`SELECT workflow_type, status, COUNT(*) as count FROM temporal_workflow_executions WHERE created_at > ${Math.floor(Date.now() / 1000) - 86400 * 7} GROUP BY workflow_type, status ORDER BY count DESC LIMIT 20`),
    ]);
    return {
      merchantApplications: merchantApps as any[],
      touristProfiles: touristProfiles as any[],
      paymentsByMerchantType: recentPayments as any[],
      topupsByCurrency: topups as any[],
      activeWorkflows: activeWorkflows as any[],
    };
  }),

  getAllMerchantTypeConfigs: protectedProcedure.query(() => {
    return [
      { merchantType: "hotel", platformFeePercent: 3.5, settlementCycle: "T+1", vatApplicable: true, serviceChargePercent: 10, kybDocuments: ["cac_certificate", "tin_certificate", "hotel_license", "fire_safety_cert", "utility_bill", "owner_id"] },
      { merchantType: "restaurant", platformFeePercent: 2.5, settlementCycle: "T+1", vatApplicable: true, serviceChargePercent: 10, kybDocuments: ["cac_certificate", "tin_certificate", "food_handler_permit", "nafdac_cert", "utility_bill", "owner_id"] },
      { merchantType: "airbnb", platformFeePercent: 5.0, settlementCycle: "T+2", vatApplicable: true, serviceChargePercent: 0, kybDocuments: ["cac_certificate", "tin_certificate", "property_deed", "utility_bill", "owner_id", "property_photos"] },
      { merchantType: "concert", platformFeePercent: 3.0, settlementCycle: "T+3", vatApplicable: true, serviceChargePercent: 0, kybDocuments: ["cac_certificate", "tin_certificate", "event_permit", "venue_license", "utility_bill", "owner_id"] },
      { merchantType: "transport", platformFeePercent: 4.0, settlementCycle: "T+1", vatApplicable: true, serviceChargePercent: 0, kybDocuments: ["cac_certificate", "tin_certificate", "transport_license", "vehicle_registration", "driver_license", "owner_id"] },
      { merchantType: "nightclub", platformFeePercent: 3.5, settlementCycle: "T+1", vatApplicable: true, serviceChargePercent: 10, kybDocuments: ["cac_certificate", "tin_certificate", "entertainment_license", "liquor_license", "fire_safety_cert", "owner_id"] },
    ];
  }),

  getTouristJourneyConfig: protectedProcedure
    .input(z.object({ profileType: z.enum(["diaspora_usd", "diaspora_gbp", "crypto_fiat"]) }))
    .query(({ input }) => {
      const configs = {
        diaspora_usd: { sourceCurrency: "USD", topupMethod: "wire_transfer", fxSpread: 1.5, kycLevel: "enhanced", loyaltyTier: "diaspora", supportedServices: ["hotel", "restaurant", "airbnb", "concert", "transport", "nightclub", "dry_cleaning"], taxInfo: { vat: "7.5% (FIRS)", serviceCharge: "10% (hospitality)", withholdingTax: "5% (professional services)" }, loyaltyInfo: { pointsPerNaira: "1 point per ₦100 spent", redemptionRate: "₦1 per 100 points", tiers: ["standard", "silver", "gold", "diaspora", "premium"] } },
        diaspora_gbp: { sourceCurrency: "GBP", topupMethod: "swift", fxSpread: 1.5, kycLevel: "enhanced", loyaltyTier: "diaspora", supportedServices: ["hotel", "restaurant", "airbnb", "concert", "transport", "nightclub", "dry_cleaning"], taxInfo: { vat: "7.5% (FIRS)", serviceCharge: "10% (hospitality)", withholdingTax: "5% (professional services)" }, loyaltyInfo: { pointsPerNaira: "1 point per ₦100 spent", redemptionRate: "₦1 per 100 points", tiers: ["standard", "silver", "gold", "diaspora", "premium"] } },
        crypto_fiat: { sourceCurrency: "USDC", topupMethod: "crypto", fxSpread: 2.0, kycLevel: "enhanced", loyaltyTier: "premium", supportedServices: ["hotel", "restaurant", "airbnb", "concert", "transport", "nightclub", "dry_cleaning", "fashion_week"], taxInfo: { vat: "7.5% (FIRS)", serviceCharge: "10% (hospitality)", withholdingTax: "5% (professional services)" }, loyaltyInfo: { pointsPerNaira: "1 point per ₦100 spent", redemptionRate: "₦1 per 100 points", tiers: ["standard", "silver", "gold", "diaspora", "premium"] } },
      };
      return { profileType: input.profileType, ...configs[input.profileType] };
    }),

  createTouristProfile: protectedProcedure
    .input(z.object({
      firstName: z.string().min(1).max(100),
      lastName: z.string().min(1).max(100),
      email: z.string().email(),
      phone: z.string().optional(),
      nationality: z.string().min(2).max(5),
      residenceCountry: z.string().min(2).max(5),
      profileType: z.enum(["tourist", "diaspora", "business", "expat"]).default("tourist"),
      preferredCurrency: z.enum(["USD", "GBP", "EUR", "NGN"]).default("NGN"),
      passportNumber: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const profileId = crypto.randomUUID();
      await db.execute(sql`
        INSERT INTO tourist_profiles (id, user_id, first_name, last_name, email, phone, nationality, residence_country, preferred_currency, profile_type, kyc_status, created_at, updated_at)
        VALUES (${profileId}, ${ctx.user.id}, ${input.firstName}, ${input.lastName}, ${input.email}, ${input.phone ?? null}, ${input.nationality}, ${input.residenceCountry}, ${input.preferredCurrency}, ${input.profileType}, 'pending', ${Math.floor(Date.now() / 1000)}, ${Math.floor(Date.now() / 1000)})
        ON CONFLICT (email) DO UPDATE SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name, updated_at = EXCLUDED.updated_at
      `);
      // Provision wallets
      const currencies = input.preferredCurrency !== "NGN" ? [input.preferredCurrency, "NGN"] : ["NGN"];
      for (const currency of currencies) {
        await db.execute(sql`INSERT INTO wallet_balances (user_id, currency, balance, created_at) VALUES (${ctx.user.id}, ${currency}, 0, ${Math.floor(Date.now() / 1000)}) ON CONFLICT DO NOTHING`);
      }
      return { profileId, profileType: input.profileType, walletCurrencies: currencies, message: `Tourist profile created. ${currencies.join(" and ")} wallets provisioned.` };
    }),
});
