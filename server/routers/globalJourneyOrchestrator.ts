/**
 * Global Journey Orchestrator Router
 * Location-aware tRPC router for all stakeholder journeys.
 * Replaces Nigeria-hardcoded journeyOrchestrator with fully global support.
 * Nigeria remains the primary destination hub but all journeys work globally.
 */
import { z } from "zod";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import {
  COUNTRIES, CURRENCIES, PAYMENT_RAILS, DIASPORA_CORRIDORS,
  SUPPORTED_COUNTRIES, SUPPORTED_CURRENCIES, FIAT_CURRENCIES, STABLECOINS,
  calculateTax, getPaymentRails, getSettlementDays, getKybDocuments,
} from "../_core/global-registry";
import {
  startGlobalWalletTopupWorkflow,
  startGlobalTouristPaymentWorkflow,
  startGlobalArrivalWorkflow,
  startGlobalGroupBookingWorkflow,
  startGlobalStablecoinConversionWorkflow,
  startGlobalMultiCurrencyStatementWorkflow,
  startGlobalHighValueTransactionWorkflow,
  startGlobalRefundWorkflow,
  startGlobalAiTripPlannerWorkflow,
  startGlobalAiConciergeWorkflow,
  startGlobalSosAlertWorkflow,
} from "../temporal/tourist-workflows-global";
import {
  startGlobalMerchantOnboardingWorkflow,
  signalGlobalMerchantDocumentsSubmitted,
  signalGlobalMerchantKybApproved,
  signalGlobalMerchantKybRejected,
  getGlobalMerchantWorkflowStatus,
  getMerchantOnboardingConfig,
} from "../temporal/merchant-workflows-global";

const MERCHANT_TYPES = ["hotel", "restaurant", "airbnb", "concert", "transport", "nightclub", "spa", "retail", "attraction", "private_chef", "tour_operator"] as const;

export const globalJourneyOrchestratorRouter = router({

  // ── PLATFORM COVERAGE ──────────────────────────────────────────────────────
  getPlatformCoverage: protectedProcedure.query(() => ({
    countries: SUPPORTED_COUNTRIES.length,
    currencies: SUPPORTED_CURRENCIES.length,
    stablecoins: STABLECOINS.length,
    paymentRails: Object.keys(PAYMENT_RAILS).length,
    diasporaCorridors: DIASPORA_CORRIDORS.length,
    merchantTypes: MERCHANT_TYPES.length,
    primaryHub: "Nigeria",
    supportedRegions: ["West Africa", "East Africa", "North Africa", "Southern Africa", "Indian Ocean", "North America", "Europe", "Middle East", "Asia", "South America", "Oceania"],
  })),

  // ── MERCHANT ONBOARDING ────────────────────────────────────────────────────
  startMerchantOnboarding: protectedProcedure
    .input(z.object({
      merchantType: z.enum(MERCHANT_TYPES),
      countryCode: z.string().min(2).max(2).toUpperCase(),
      businessName: z.string().min(2).max(200),
      businessEmail: z.string().email(),
      businessPhone: z.string().min(7).max(20),
      businessAddress: z.string().min(5).max(500),
      city: z.string().min(2).max(100),
      registrationNumber: z.string().optional(),
      taxId: z.string().optional(),
      bankAccountNumber: z.string().optional(),
      bankName: z.string().optional(),
      bankCountryCode: z.string().optional(),
      settlementCurrency: z.string().optional(),
      websiteUrl: z.string().url().optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!COUNTRIES[input.countryCode]) {
        throw new Error(`Country ${input.countryCode} is not supported. Supported countries: ${SUPPORTED_COUNTRIES.join(", ")}`);
      }

      const { workflowId, config, country } = await startGlobalMerchantOnboardingWorkflow({
        ...input,
        ownerUserId: ctx.user.id,
      });

      const db = getDb();
      const now = Math.floor(Date.now() / 1000);
      await db.execute(sql`
        INSERT INTO merchant_onboarding_applications (
          id, user_id, merchant_type, country_code, business_name, business_email,
          business_phone, business_address, city, registration_number, tax_id,
          bank_account_number, bank_name, website_url, description,
          platform_fee_percent, settlement_days, required_documents,
          workflow_id, status, created_at, updated_at
        ) VALUES (
          ${workflowId}, ${ctx.user.id}, ${input.merchantType}, ${input.countryCode},
          ${input.businessName}, ${input.businessEmail}, ${input.businessPhone},
          ${input.businessAddress}, ${input.city},
          ${input.registrationNumber ?? null}, ${input.taxId ?? null},
          ${input.bankAccountNumber ?? null}, ${input.bankName ?? null},
          ${input.websiteUrl ?? null}, ${input.description ?? null},
          ${config.platformFeePercent}, ${config.settlementDays},
          ${JSON.stringify(config.requiredDocuments)},
          ${workflowId}, 'pending_documents', ${now}, ${now}
        ) ON CONFLICT DO NOTHING
      `);

      return {
        workflowId,
        status: "pending_documents",
        requiredDocuments: config.requiredDocuments,
        optionalDocuments: config.optionalDocuments,
        platformFeePercent: config.platformFeePercent,
        settlementDays: config.settlementDays,
        country: {
          code: input.countryCode,
          name: country.name,
          currency: country.currency,
          vatRate: country.vatRate,
          vatName: country.vatName,
          regulatoryBody: country.regulatoryBody,
        },
      };
    }),

  getMerchantOnboardingConfig: protectedProcedure
    .input(z.object({
      merchantType: z.enum(MERCHANT_TYPES),
      countryCode: z.string().default("NG"),
    }))
    .query(({ input }) => {
      return getMerchantOnboardingConfig(input.merchantType, input.countryCode.toUpperCase());
    }),

  submitKybDocuments: protectedProcedure
    .input(z.object({
      workflowId: z.string(),
      documents: z.array(z.object({
        type: z.string(),
        url: z.string().url(),
        verified: z.boolean().optional(),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      await signalGlobalMerchantDocumentsSubmitted(input.workflowId, input.documents);
      const db = getDb();
      const now = Math.floor(Date.now() / 1000);
      await db.execute(sql`
        UPDATE merchant_onboarding_applications
        SET status = 'documents_submitted', updated_at = ${now}
        WHERE workflow_id = ${input.workflowId} AND user_id = ${ctx.user.id}
      `);
      return { status: "documents_submitted" };
    }),

  approveMerchantKyb: adminProcedure
    .input(z.object({
      workflowId: z.string(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await signalGlobalMerchantKybApproved(input.workflowId, String(ctx.user.id), input.notes);
      const db = getDb();
      const now = Math.floor(Date.now() / 1000);
      await db.execute(sql`
        UPDATE merchant_onboarding_applications
        SET status = 'approved', approved_by = ${String(ctx.user.id)}, approved_at = ${now}, updated_at = ${now}
        WHERE workflow_id = ${input.workflowId}
      `);
      return { status: "approved" };
    }),

  rejectMerchantKyb: adminProcedure
    .input(z.object({
      workflowId: z.string(),
      reason: z.string().min(10),
    }))
    .mutation(async ({ input, ctx }) => {
      await signalGlobalMerchantKybRejected(input.workflowId, String(ctx.user.id), input.reason);
      const db = getDb();
      const now = Math.floor(Date.now() / 1000);
      await db.execute(sql`
        UPDATE merchant_onboarding_applications
        SET status = 'rejected', rejection_reason = ${input.reason}, updated_at = ${now}
        WHERE workflow_id = ${input.workflowId}
      `);
      return { status: "rejected" };
    }),

  getMerchantOnboardingStatus: protectedProcedure
    .input(z.object({ workflowId: z.string() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.execute(sql`
        SELECT * FROM merchant_onboarding_applications WHERE workflow_id = ${input.workflowId} LIMIT 1
      `);
      const app = (rows as any[])[0];
      if (!app) return null;
      const wfStatus = await getGlobalMerchantWorkflowStatus(input.workflowId).catch(() => null);
      return { ...app, workflowStatus: wfStatus };
    }),

  // ── WALLET TOP-UP (GLOBAL) ─────────────────────────────────────────────────
  initiateWalletTopup: protectedProcedure
    .input(z.object({
      fromCurrency: z.string().min(3).max(6),
      fromCountryCode: z.string().min(2).max(2),
      toCountryCode: z.string().min(2).max(2).default("NG"),
      toCurrency: z.string().min(3).max(6).default("NGN"),
      amount: z.number().positive(),
      paymentRail: z.string().default("wise"),
      paymentReference: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const fromCurrency = CURRENCIES[input.fromCurrency.toUpperCase()];
      const toCurrency = CURRENCIES[input.toCurrency.toUpperCase()];
      const toCountry = COUNTRIES[input.toCountryCode.toUpperCase()];

      if (!fromCurrency) throw new Error(`Currency ${input.fromCurrency} not supported`);
      if (!toCurrency) throw new Error(`Currency ${input.toCurrency} not supported`);
      if (!toCountry) throw new Error(`Country ${input.toCountryCode} not supported`);

      // Validate amount limits
      if (input.amount < fromCurrency.minAmount) throw new Error(`Minimum top-up is ${fromCurrency.minAmount} ${input.fromCurrency}`);
      if (input.amount > fromCurrency.maxAmount) throw new Error(`Maximum top-up is ${fromCurrency.maxAmount} ${input.fromCurrency}`);

      const db = getDb();
      const touristRows = await db.execute(sql`
        SELECT id FROM tourist_profiles WHERE user_id = ${ctx.user.id} LIMIT 1
      `);
      const touristProfileId = (touristRows as any[])[0]?.id ?? `tourist-${ctx.user.id}`;

      const workflowId = await startGlobalWalletTopupWorkflow({
        userId: ctx.user.id,
        touristProfileId,
        fromCurrency: input.fromCurrency.toUpperCase(),
        fromCountryCode: input.fromCountryCode.toUpperCase(),
        toCountryCode: input.toCountryCode.toUpperCase(),
        toCurrency: input.toCurrency.toUpperCase(),
        amount: input.amount,
        paymentRail: input.paymentRail,
        paymentReference: input.paymentReference,
      });

      return {
        workflowId,
        status: "initiated",
        fromCurrency: fromCurrency.code,
        toCurrency: toCurrency.code,
        toCountry: toCountry.name,
        amount: input.amount,
        currencySymbol: fromCurrency.symbol,
        estimatedArrival: `${PAYMENT_RAILS[input.paymentRail]?.processingTimeMinutes ?? 60} minutes`,
      };
    }),

  // ── TOURIST PAYMENT (GLOBAL) ───────────────────────────────────────────────
  payAtMerchant: protectedProcedure
    .input(z.object({
      merchantId: z.string(),
      merchantCountryCode: z.string().min(2).max(2).default("NG"),
      merchantType: z.string().default("general"),
      amountInLocalCurrency: z.number().positive(),
      localCurrency: z.string().default("NGN"),
      walletCurrency: z.string().default("NGN"),
      isTourist: z.boolean().default(true),
      tipAmount: z.number().min(0).default(0),
      description: z.string(),
      itineraryItemId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const merchantCountry = COUNTRIES[input.merchantCountryCode.toUpperCase()] ?? COUNTRIES["NG"];

      // Validate currency is supported in merchant's country
      if (!merchantCountry.paymentMethods.length) {
        throw new Error(`No payment methods available in ${merchantCountry.name}`);
      }

      const db = getDb();
      const touristRows = await db.execute(sql`
        SELECT id FROM tourist_profiles WHERE user_id = ${ctx.user.id} LIMIT 1
      `);
      const touristProfileId = (touristRows as any[])[0]?.id ?? `tourist-${ctx.user.id}`;

      // Pre-calculate tax for response
      const taxCalc = calculateTax(
        input.amountInLocalCurrency,
        input.merchantCountryCode.toUpperCase(),
        input.merchantType,
        input.isTourist
      );

      const workflowId = await startGlobalTouristPaymentWorkflow({
        userId: ctx.user.id,
        touristProfileId,
        merchantId: input.merchantId,
        merchantCountryCode: input.merchantCountryCode.toUpperCase(),
        merchantType: input.merchantType,
        amountInLocalCurrency: input.amountInLocalCurrency,
        localCurrency: input.localCurrency.toUpperCase(),
        walletCurrency: input.walletCurrency.toUpperCase(),
        isTourist: input.isTourist,
        tipAmount: input.tipAmount,
        tipCurrency: input.localCurrency.toUpperCase(),
        description: input.description,
        itineraryItemId: input.itineraryItemId,
      });

      return {
        workflowId,
        status: "processing",
        amount: input.amountInLocalCurrency,
        currency: input.localCurrency.toUpperCase(),
        merchantCountry: merchantCountry.name,
        vatAmount: taxCalc.vatAmount,
        vatName: merchantCountry.vatName,
        serviceCharge: taxCalc.serviceChargeAmount,
        touristTax: taxCalc.touristTaxAmount,
        totalWithTax: taxCalc.totalWithTax,
        tipAmount: input.tipAmount,
      };
    }),

  // ── AIRPORT ARRIVAL (GLOBAL) ───────────────────────────────────────────────
  startArrivalJourney: protectedProcedure
    .input(z.object({
      originCountryCode: z.string().min(2).max(2),
      destinationCountryCode: z.string().min(2).max(2).default("NG"),
      destinationCity: z.string().default("Lagos"),
      arrivalAirportCode: z.string().min(3).max(4),
      flightNumber: z.string().optional(),
      arrivalDateTime: z.number(),
      needsTransfer: z.boolean().default(true),
      needsSimCard: z.boolean().default(true),
      preferredLanguage: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const destinationCountry = COUNTRIES[input.destinationCountryCode.toUpperCase()];
      if (!destinationCountry) throw new Error(`Destination country ${input.destinationCountryCode} not supported`);

      const db = getDb();
      const touristRows = await db.execute(sql`
        SELECT id FROM tourist_profiles WHERE user_id = ${ctx.user.id} LIMIT 1
      `);
      const touristProfileId = (touristRows as any[])[0]?.id ?? `tourist-${ctx.user.id}`;

      const workflowId = await startGlobalArrivalWorkflow({
        touristProfileId,
        userId: ctx.user.id,
        originCountryCode: input.originCountryCode.toUpperCase(),
        destinationCountryCode: input.destinationCountryCode.toUpperCase(),
        destinationCity: input.destinationCity,
        arrivalAirportCode: input.arrivalAirportCode.toUpperCase(),
        flightNumber: input.flightNumber,
        arrivalDateTime: input.arrivalDateTime,
        needsTransfer: input.needsTransfer,
        needsSimCard: input.needsSimCard,
        preferredLanguage: input.preferredLanguage,
      });

      return {
        workflowId,
        status: "arrival_journey_started",
        destination: destinationCountry.name,
        destinationCity: input.destinationCity,
        localCurrency: destinationCountry.currency,
        availablePaymentMethods: destinationCountry.paymentMethods,
        timezone: destinationCountry.timezone,
        languages: destinationCountry.languages,
      };
    }),

  // ── STABLECOIN CONVERSION (GLOBAL) ────────────────────────────────────────
  convertStablecoin: protectedProcedure
    .input(z.object({
      fromStablecoin: z.enum(["USDC", "USDT", "DAI", "CNGN"]),
      toFiatCurrency: z.string().default("NGN"),
      toCountryCode: z.string().min(2).max(2).default("NG"),
      amount: z.number().positive(),
      walletAddress: z.string().optional(),
      network: z.enum(["ethereum", "polygon", "tron", "bsc", "solana"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const toCountry = COUNTRIES[input.toCountryCode.toUpperCase()] ?? COUNTRIES["NG"];
      const toCurrency = CURRENCIES[input.toFiatCurrency.toUpperCase()];
      if (!toCurrency) throw new Error(`Currency ${input.toFiatCurrency} not supported`);

      const db = getDb();
      const touristRows = await db.execute(sql`
        SELECT id FROM tourist_profiles WHERE user_id = ${ctx.user.id} LIMIT 1
      `);
      const touristProfileId = (touristRows as any[])[0]?.id ?? `tourist-${ctx.user.id}`;

      const workflowId = await startGlobalStablecoinConversionWorkflow({
        userId: ctx.user.id,
        touristProfileId,
        fromStablecoin: input.fromStablecoin,
        toFiatCurrency: input.toFiatCurrency.toUpperCase(),
        toCountryCode: input.toCountryCode.toUpperCase(),
        amount: input.amount,
        walletAddress: input.walletAddress,
        network: input.network,
      });

      return {
        workflowId,
        status: "conversion_initiated",
        fromStablecoin: input.fromStablecoin,
        toFiatCurrency: toCurrency.code,
        toCountry: toCountry.name,
        amount: input.amount,
        network: input.network ?? "ethereum",
        estimatedArrival: "5-15 minutes",
      };
    }),

  // ── AI TRIP PLANNER (GLOBAL) ──────────────────────────────────────────────
  startAiTripPlanner: protectedProcedure
    .input(z.object({
      originCountryCode: z.string().min(2).max(2),
      destinationCountryCode: z.string().min(2).max(2).default("NG"),
      destinationCity: z.string().default("Lagos"),
      startDate: z.string(),
      endDate: z.string(),
      budget: z.number().positive(),
      budgetCurrency: z.string().default("USD"),
      interests: z.array(z.string()).default(["culture", "food", "nightlife"]),
      groupSize: z.number().int().min(1).max(50).default(1),
      accommodationType: z.string().default("hotel"),
      prompt: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const destinationCountry = COUNTRIES[input.destinationCountryCode.toUpperCase()] ?? COUNTRIES["NG"];

      const db = getDb();
      const touristRows = await db.execute(sql`
        SELECT id FROM tourist_profiles WHERE user_id = ${ctx.user.id} LIMIT 1
      `);
      const touristProfileId = (touristRows as any[])[0]?.id ?? `tourist-${ctx.user.id}`;

      const workflowId = await startGlobalAiTripPlannerWorkflow({
        userId: ctx.user.id,
        touristProfileId,
        originCountryCode: input.originCountryCode.toUpperCase(),
        destinationCountryCode: input.destinationCountryCode.toUpperCase(),
        destinationCity: input.destinationCity,
        startDate: input.startDate,
        endDate: input.endDate,
        budget: input.budget,
        budgetCurrency: input.budgetCurrency.toUpperCase(),
        interests: input.interests,
        groupSize: input.groupSize,
        accommodationType: input.accommodationType,
        prompt: input.prompt,
      });

      return {
        workflowId,
        status: "generating_itinerary",
        destination: `${input.destinationCity}, ${destinationCountry.name}`,
        localCurrency: destinationCountry.currency,
        vatRate: destinationCountry.vatRate,
        vatName: destinationCountry.vatName,
        estimatedGenerationTime: "30-60 seconds",
      };
    }),

  // ── GROUP BOOKING (GLOBAL) ────────────────────────────────────────────────
  startGroupBooking: protectedProcedure
    .input(z.object({
      bookingType: z.string(),
      referenceId: z.string(),
      destinationCountryCode: z.string().min(2).max(2).default("NG"),
      participants: z.array(z.object({
        name: z.string(),
        email: z.string().email(),
        phone: z.string().optional(),
      })),
      totalAmountLocal: z.number().positive(),
      localCurrency: z.string().default("NGN"),
      splitMethod: z.enum(["equal", "custom"]).default("equal"),
      customSplits: z.record(z.number()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const touristRows = await db.execute(sql`
        SELECT id FROM tourist_profiles WHERE user_id = ${ctx.user.id} LIMIT 1
      `);
      const touristProfileId = (touristRows as any[])[0]?.id ?? `tourist-${ctx.user.id}`;

      const workflowId = await startGlobalGroupBookingWorkflow({
        organizerTouristProfileId: touristProfileId,
        organizerUserId: ctx.user.id,
        bookingType: input.bookingType,
        referenceId: input.referenceId,
        destinationCountryCode: input.destinationCountryCode.toUpperCase(),
        participants: input.participants,
        totalAmountLocal: input.totalAmountLocal,
        localCurrency: input.localCurrency.toUpperCase(),
        splitMethod: input.splitMethod,
        customSplits: input.customSplits,
      });

      const perPersonShare = input.totalAmountLocal / (input.participants.length + 1);

      return {
        workflowId,
        status: "group_booking_initiated",
        participantCount: input.participants.length + 1,
        perPersonShare,
        currency: input.localCurrency.toUpperCase(),
        destinationCountry: COUNTRIES[input.destinationCountryCode.toUpperCase()]?.name ?? input.destinationCountryCode,
      };
    }),

  // ── REFUND (GLOBAL) ───────────────────────────────────────────────────────
  requestRefund: protectedProcedure
    .input(z.object({
      originalTransactionId: z.string(),
      bookingType: z.string(),
      bookingReferenceId: z.string(),
      merchantId: z.string(),
      merchantCountryCode: z.string().min(2).max(2).default("NG"),
      requestedAmountLocal: z.number().positive(),
      localCurrency: z.string().default("NGN"),
      walletCurrency: z.string().default("NGN"),
      reason: z.string().min(5),
      description: z.string().min(10),
      evidenceUrls: z.array(z.string().url()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const touristRows = await db.execute(sql`
        SELECT id FROM tourist_profiles WHERE user_id = ${ctx.user.id} LIMIT 1
      `);
      const touristProfileId = (touristRows as any[])[0]?.id ?? `tourist-${ctx.user.id}`;

      const workflowId = await startGlobalRefundWorkflow({
        userId: ctx.user.id,
        touristProfileId,
        ...input,
        merchantCountryCode: input.merchantCountryCode.toUpperCase(),
        localCurrency: input.localCurrency.toUpperCase(),
        walletCurrency: input.walletCurrency.toUpperCase(),
      });

      return { workflowId, status: "refund_requested" };
    }),

  // ── SOS ALERT (GLOBAL) ────────────────────────────────────────────────────
  triggerSosAlert: protectedProcedure
    .input(z.object({
      currentCountryCode: z.string().min(2).max(2).default("NG"),
      currentCity: z.string(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      alertType: z.enum(["medical", "security", "lost", "accident", "other"]),
      description: z.string(),
      emergencyContactIds: z.array(z.string()).default([]),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const touristRows = await db.execute(sql`
        SELECT id FROM tourist_profiles WHERE user_id = ${ctx.user.id} LIMIT 1
      `);
      const touristProfileId = (touristRows as any[])[0]?.id ?? `tourist-${ctx.user.id}`;

      const workflowId = await startGlobalSosAlertWorkflow({
        touristProfileId,
        userId: ctx.user.id,
        currentCountryCode: input.currentCountryCode.toUpperCase(),
        currentCity: input.currentCity,
        latitude: input.latitude,
        longitude: input.longitude,
        alertType: input.alertType,
        description: input.description,
        emergencyContactIds: input.emergencyContactIds,
      });

      const country = COUNTRIES[input.currentCountryCode.toUpperCase()];
      return {
        workflowId,
        status: "sos_alert_active",
        country: country?.name ?? input.currentCountryCode,
        emergencyNumbers: getLocalEmergencyNumbers(input.currentCountryCode.toUpperCase()),
      };
    }),

  // ── AI CONCIERGE (GLOBAL) ─────────────────────────────────────────────────
  startAiConcierge: protectedProcedure
    .input(z.object({
      currentCountryCode: z.string().min(2).max(2).default("NG"),
      currentCity: z.string().default("Lagos"),
      sessionType: z.enum(["general", "booking", "payment", "recommendation", "emergency"]).default("general"),
      context: z.record(z.unknown()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const touristRows = await db.execute(sql`
        SELECT id FROM tourist_profiles WHERE user_id = ${ctx.user.id} LIMIT 1
      `);
      const touristProfileId = (touristRows as any[])[0]?.id ?? `tourist-${ctx.user.id}`;

      const workflowId = await startGlobalAiConciergeWorkflow({
        userId: ctx.user.id,
        touristProfileId,
        currentCountryCode: input.currentCountryCode.toUpperCase(),
        currentCity: input.currentCity,
        sessionType: input.sessionType,
        context: input.context,
      });

      const country = COUNTRIES[input.currentCountryCode.toUpperCase()] ?? COUNTRIES["NG"];
      return {
        workflowId,
        status: "concierge_session_started",
        country: country.name,
        city: input.currentCity,
        currency: country.currency,
        languages: country.languages,
      };
    }),

  // ── MULTI-CURRENCY STATEMENT (GLOBAL) ─────────────────────────────────────
  generateMultiCurrencyStatement: protectedProcedure
    .input(z.object({
      periodStart: z.string(),
      periodEnd: z.string(),
      currencies: z.array(z.string()).default(["NGN"]),
      countriesVisited: z.array(z.string()).default(["NG"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const touristRows = await db.execute(sql`
        SELECT id FROM tourist_profiles WHERE user_id = ${ctx.user.id} LIMIT 1
      `);
      const touristProfileId = (touristRows as any[])[0]?.id ?? `tourist-${ctx.user.id}`;

      const workflowId = await startGlobalMultiCurrencyStatementWorkflow({
        userId: ctx.user.id,
        touristProfileId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        currencies: input.currencies.map(c => c.toUpperCase()),
        countriesVisited: input.countriesVisited.map(c => c.toUpperCase()),
      });

      return { workflowId, status: "statement_generating" };
    }),

  // ── QUERY: JOURNEY STATUS ─────────────────────────────────────────────────
  getJourneyStatus: protectedProcedure
    .input(z.object({ workflowId: z.string() }))
    .query(async ({ input }) => {
      const { getWorkflowStatus } = await import("../_core/temporal-integration");
      return getWorkflowStatus(input.workflowId);
    }),

  // ── QUERY: MY JOURNEYS ────────────────────────────────────────────────────
  getMyJourneys: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(50).default(20),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const rows = await db.execute(sql`
        SELECT tw.*, u.email as user_email
        FROM temporal_workflow_executions tw
        LEFT JOIN users u ON u.id = ${ctx.user.id}
        WHERE tw.user_id = ${ctx.user.id}
        ORDER BY tw.started_at DESC
        LIMIT ${input.limit} OFFSET ${input.offset}
      `);
      return rows as any[];
    }),

  // ── QUERY: SUPPORTED PAYMENT RAILS ───────────────────────────────────────
  getSupportedPaymentRails: protectedProcedure
    .input(z.object({
      fromCurrency: z.string(),
      toCountryCode: z.string().default("NG"),
    }))
    .query(({ input }) => {
      const toCountry = COUNTRIES[input.toCountryCode.toUpperCase()] ?? COUNTRIES["NG"];
      const rails = getPaymentRails(
        input.fromCurrency.toUpperCase(),
        toCountry.currency,
        "US" // assume origin is US for available rails
      );
      return rails.map(r => ({
        ...r,
        destinationCountry: toCountry.name,
        destinationCurrency: toCountry.currency,
      }));
    }),

  // ── QUERY: TAX PREVIEW ────────────────────────────────────────────────────
  previewTax: protectedProcedure
    .input(z.object({
      amount: z.number().positive(),
      countryCode: z.string().default("NG"),
      merchantType: z.string().default("general"),
      isTourist: z.boolean().default(true),
    }))
    .query(({ input }) => {
      return calculateTax(
        input.amount,
        input.countryCode.toUpperCase(),
        input.merchantType,
        input.isTourist
      );
    }),

  // ── ADMIN: ALL JOURNEYS ───────────────────────────────────────────────────
  adminListJourneys: adminProcedure
    .input(z.object({
      countryCode: z.string().optional(),
      journeyType: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(50),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.execute(sql`
        SELECT tw.*, u.email as user_email
        FROM temporal_workflow_executions tw
        LEFT JOIN users u ON u.id = tw.user_id
        WHERE (${input.countryCode ?? null} IS NULL OR tw.metadata->>'country' = ${input.countryCode ?? null})
          AND (${input.journeyType ?? null} IS NULL OR tw.workflow_type ILIKE ${`%${input.journeyType ?? ""}%`})
        ORDER BY tw.started_at DESC
        LIMIT ${input.limit} OFFSET ${input.offset}
      `);
      const total = await db.execute(sql`SELECT COUNT(*) as count FROM temporal_workflow_executions`);
      return { journeys: rows as any[], total: parseInt((total as any[])[0]?.count ?? "0") };
    }),
});

function getLocalEmergencyNumbers(countryCode: string): Record<string, string> {
  const numbers: Record<string, Record<string, string>> = {
    NG: { police: "199", emergency: "112", fire: "123", ambulance: "112" },
    GH: { police: "191", fire: "192", ambulance: "193", emergency: "112" },
    KE: { police: "999", emergency: "112", ambulance: "999" },
    ZA: { police: "10111", ambulance: "10177", emergency: "112" },
    EG: { police: "122", ambulance: "123", fire: "180", emergency: "112" },
    MA: { police: "19", ambulance: "15", fire: "150", emergency: "112" },
    TZ: { emergency: "112", police: "111" },
    RW: { emergency: "112", police: "113" },
    US: { emergency: "911" },
    GB: { emergency: "999", alternative: "112" },
    AE: { police: "999", ambulance: "998", fire: "997" },
    IN: { police: "100", ambulance: "102", fire: "101", emergency: "112" },
  };
  return numbers[countryCode] ?? { emergency: "112" };
}
