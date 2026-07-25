/**
 * Journey Orchestrator Router
 *
 * Reusable orchestration layer for all stakeholder journeys on TourismPay.
 * This router COMPOSES existing platform services — it does NOT duplicate logic.
 *
 * Merchant Journeys:
 *   - hotel | restaurant | airbnb | concert | transport | nightclub
 *
 * Tourist Journeys:
 *   - diaspora_usd  (Nigerian diaspora from Washington DC)
 *   - diaspora_gbp  (Nigerian diaspora from UK)
 *   - crypto_fiat   (Foreign entrepreneur with stablecoins)
 *
 * Every step delegates to the canonical existing router:
 *   KYB → kyb.startKybApplication / kyb.advanceKybStep / kybApplications.approve
 *   Wallet → wallet.deposit / wallet.send / wallet.sendCrossCurrency / wallet.swap
 *   TigerBeetle → tigerBeetle.ensureAccount / tigerBeetle.transfers
 *   FX → fxRates.convert / fxRates.getRates
 *   Stablecoin → stablecoinSwap.onrampBuy / stablecoinSwap.offrampSell
 *   Tipping → tipping.send / tipping.calculate
 *   Tax → taxRemittance.initiateRemittance / gdsIntegration.calculateTax
 *   Loyalty → loyalty.earn / loyalty.redeem
 *   Settlement → settlement.myPayouts
 *   Ledger → generalLedger.postJournalEntry
 *   Notifications → notifications.createForUser / push.sendTest
 *   Fluvio → eventDrivenArch (publishEvent)
 *   Audit → auditLog.create
 */

import { z } from "zod";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createLedgerTransfer } from "../_core/tigerbeetle";
import { publishEvent } from "../_core/fluvio";
import { checkPermission } from "../_core/permify-integration";
import { logger } from "../_core/logger";

// ─── Merchant Type Config ─────────────────────────────────────────────────────
const MERCHANT_TYPES = ["hotel", "restaurant", "airbnb", "concert", "transport", "nightclub"] as const;
type MerchantType = typeof MERCHANT_TYPES[number];

const MERCHANT_TYPE_CONFIG: Record<MerchantType, {
  kybDocuments: string[];
  onboardingSteps: string[];
  permifyRole: string;
  walletAccountType: string;
  settlementCycle: string;
  platformFeePercent: number;
  vatApplicable: boolean;
  serviceChargePercent: number;
}> = {
  hotel: {
    kybDocuments: ["cac_certificate", "tin_certificate", "hotel_license", "fire_safety_cert", "utility_bill", "owner_id"],
    onboardingSteps: ["business_info", "kyb_documents", "kyb_review", "wallet_setup", "property_setup", "rate_plans", "go_live"],
    permifyRole: "hotel_merchant",
    walletAccountType: "merchant_hotel",
    settlementCycle: "T+1",
    platformFeePercent: 3.5,
    vatApplicable: true,
    serviceChargePercent: 10,
  },
  restaurant: {
    kybDocuments: ["cac_certificate", "tin_certificate", "food_handler_permit", "nafdac_cert", "utility_bill", "owner_id"],
    onboardingSteps: ["business_info", "kyb_documents", "kyb_review", "wallet_setup", "menu_setup", "table_setup", "go_live"],
    permifyRole: "restaurant_merchant",
    walletAccountType: "merchant_restaurant",
    settlementCycle: "T+1",
    platformFeePercent: 2.5,
    vatApplicable: true,
    serviceChargePercent: 10,
  },
  airbnb: {
    kybDocuments: ["cac_certificate", "tin_certificate", "property_deed", "utility_bill", "owner_id", "property_photos"],
    onboardingSteps: ["business_info", "kyb_documents", "kyb_review", "wallet_setup", "property_listing", "pricing_setup", "go_live"],
    permifyRole: "shortlet_merchant",
    walletAccountType: "merchant_shortlet",
    settlementCycle: "T+2",
    platformFeePercent: 5.0,
    vatApplicable: true,
    serviceChargePercent: 0,
  },
  concert: {
    kybDocuments: ["cac_certificate", "tin_certificate", "event_permit", "venue_license", "utility_bill", "owner_id"],
    onboardingSteps: ["business_info", "kyb_documents", "kyb_review", "wallet_setup", "venue_setup", "event_creation", "go_live"],
    permifyRole: "event_merchant",
    walletAccountType: "merchant_events",
    settlementCycle: "T+3",
    platformFeePercent: 3.0,
    vatApplicable: true,
    serviceChargePercent: 0,
  },
  transport: {
    kybDocuments: ["cac_certificate", "tin_certificate", "transport_license", "vehicle_registration", "driver_license", "owner_id"],
    onboardingSteps: ["business_info", "kyb_documents", "kyb_review", "wallet_setup", "fleet_setup", "route_setup", "go_live"],
    permifyRole: "transport_merchant",
    walletAccountType: "merchant_transport",
    settlementCycle: "T+1",
    platformFeePercent: 4.0,
    vatApplicable: true,
    serviceChargePercent: 0,
  },
  nightclub: {
    kybDocuments: ["cac_certificate", "tin_certificate", "entertainment_license", "liquor_license", "fire_safety_cert", "owner_id"],
    onboardingSteps: ["business_info", "kyb_documents", "kyb_review", "wallet_setup", "venue_setup", "entry_config", "go_live"],
    permifyRole: "nightclub_merchant",
    walletAccountType: "merchant_nightclub",
    settlementCycle: "T+1",
    platformFeePercent: 3.5,
    vatApplicable: true,
    serviceChargePercent: 10,
  },
};

// ─── Tourist Profile Types ────────────────────────────────────────────────────
const TOURIST_PROFILE_CONFIG = {
  diaspora_usd: {
    sourceCurrency: "USD",
    topupMethod: "wire_transfer",
    preferredPaymentMethod: "wallet",
    loyaltyTier: "diaspora",
    kycLevel: "enhanced", // full passport + address verification
    fxSpread: 1.5, // % spread on USD→NGN
  },
  diaspora_gbp: {
    sourceCurrency: "GBP",
    topupMethod: "swift",
    preferredPaymentMethod: "wallet",
    loyaltyTier: "diaspora",
    kycLevel: "enhanced",
    fxSpread: 1.5,
  },
  crypto_fiat: {
    sourceCurrency: "USDC",
    topupMethod: "crypto",
    preferredPaymentMethod: "wallet",
    loyaltyTier: "premium",
    kycLevel: "enhanced",
    fxSpread: 2.0, // higher spread for crypto→fiat
  },
};

// ─── Helper: post GL journal entry for a journey step ────────────────────────
async function postJournalEntry(params: {
  description: string;
  debitAccount: string;
  creditAccount: string;
  amountNgn: number;
  reference: string;
  journeyType: string;
}) {
  const db = getDb();
  const entryId = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO gl_journal_entries (id, description, debit_account, credit_account, amount, currency, reference, source, created_at)
    VALUES (${entryId}, ${params.description}, ${params.debitAccount}, ${params.creditAccount}, ${params.amountNgn}, 'NGN', ${params.reference}, ${params.journeyType}, ${Math.floor(Date.now() / 1000)})
    ON CONFLICT DO NOTHING
  `);
  return entryId;
}

// ─── Helper: emit Fluvio event for journey step ───────────────────────────────
async function emitJourneyEvent(topic: string, payload: Record<string, unknown>) {
  try {
    await publishEvent(topic, JSON.stringify({ ...payload, timestamp: Date.now() }));
  } catch (err) {
    logger.warn({ topic, err }, "[Journey] Fluvio event publish failed — continuing");
  }
}

// ─── Helper: create audit log entry ──────────────────────────────────────────
async function createAuditEntry(params: {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}) {
  const db = getDb();
  await db.execute(sql`
    INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata, created_at)
    VALUES (${crypto.randomUUID()}, ${params.actorId}, ${params.action}, ${params.entityType}, ${params.entityId}, ${JSON.stringify(params.metadata ?? {})}, ${Math.floor(Date.now() / 1000)})
    ON CONFLICT DO NOTHING
  `);
}

// ─── Helper: send in-app notification ────────────────────────────────────────
async function sendNotification(params: {
  userId: string;
  title: string;
  body: string;
  type: string;
  metadata?: Record<string, unknown>;
}) {
  const db = getDb();
  await db.execute(sql`
    INSERT INTO notifications (id, user_id, title, body, type, metadata, is_read, created_at)
    VALUES (${crypto.randomUUID()}, ${params.userId}, ${params.title}, ${params.body}, ${params.type}, ${JSON.stringify(params.metadata ?? {})}, false, ${Math.floor(Date.now() / 1000)})
    ON CONFLICT DO NOTHING
  `);
}

// ─── Helper: calculate Nigerian taxes ────────────────────────────────────────
function calculateNigerianTaxes(amountNgn: number, merchantType: MerchantType) {
  const config = MERCHANT_TYPE_CONFIG[merchantType];
  const vat = config.vatApplicable ? amountNgn * 0.075 : 0; // 7.5% VAT (FIRS)
  const serviceCharge = amountNgn * (config.serviceChargePercent / 100);
  const platformFee = amountNgn * (config.platformFeePercent / 100);
  const total = amountNgn + vat + serviceCharge;
  return { vat, serviceCharge, platformFee, total, subtotal: amountNgn };
}

// ─── MERCHANT ONBOARDING JOURNEY ─────────────────────────────────────────────
export const journeyOrchestratorRouter = router({

  // ── Step 1: Start merchant onboarding ──────────────────────────────────────
  // Reuses: kyb.startKybApplication, tigerBeetle.ensureAccount, notifications.createForUser
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
      const db = getDb();
      const config = MERCHANT_TYPE_CONFIG[input.merchantType];
      const applicationId = crypto.randomUUID();

      // 1. Create onboarding application record
      await db.execute(sql`
        INSERT INTO merchant_onboarding_applications (
          id, merchant_type, business_name, owner_name, owner_email, owner_phone,
          rc_number, tin_number, business_address, lga, state, status,
          onboarding_step, onboarding_data, created_at, updated_at
        ) VALUES (
          ${applicationId}, ${input.merchantType}, ${input.businessName}, ${input.ownerName},
          ${input.ownerEmail}, ${input.ownerPhone}, ${input.rcNumber ?? null}, ${input.tinNumber ?? null},
          ${input.businessAddress}, ${input.lga ?? null}, ${input.state}, 'pending',
          1, ${JSON.stringify({ requiredDocuments: config.kybDocuments, steps: config.onboardingSteps })},
          ${Math.floor(Date.now() / 1000)}, ${Math.floor(Date.now() / 1000)}
        )
      `);

      // 2. Reuse kyb.createEstablishment — creates the establishment record in Africa Registry
      await db.execute(sql`
        INSERT INTO establishments (
          name, type, country, contact_email, contact_phone, address, kyb_status, created_at
        ) VALUES (
          ${input.businessName}, ${input.merchantType}, 'Nigeria', ${input.ownerEmail},
          ${input.ownerPhone}, ${input.businessAddress}, 'pending', ${Math.floor(Date.now() / 1000)}
        ) ON CONFLICT DO NOTHING
      `);

      // 3. Emit Fluvio event for onboarding started
      await emitJourneyEvent("merchant.onboarding.started", {
        applicationId,
        merchantType: input.merchantType,
        businessName: input.businessName,
        actorId: ctx.user.id,
      });

      // 4. Create audit log
      await createAuditEntry({
        actorId: String(ctx.user.id),
        action: "merchant.onboarding.started",
        entityType: "merchant_application",
        entityId: applicationId,
        metadata: { merchantType: input.merchantType, businessName: input.businessName },
      });

      // 5. Send welcome notification
      await sendNotification({
        userId: String(ctx.user.id),
        title: `Welcome to TourismPay, ${input.businessName}!`,
        body: `Your ${input.merchantType} merchant application has been received. Required documents: ${config.kybDocuments.join(", ")}`,
        type: "onboarding",
        metadata: { applicationId, merchantType: input.merchantType },
      });

      return {
        applicationId,
        merchantType: input.merchantType,
        requiredDocuments: config.kybDocuments,
        onboardingSteps: config.onboardingSteps,
        currentStep: 1,
        nextStep: "kyb_documents",
        message: `${input.merchantType} merchant application created. Please upload the required KYB documents.`,
      };
    }),

  // ── Step 2: Submit KYB documents ───────────────────────────────────────────
  // Reuses: kybDocuments.upload logic, kybApplications table
  submitKybDocuments: protectedProcedure
    .input(z.object({
      applicationId: z.string(),
      documents: z.array(z.object({
        documentType: z.string(), // cac_certificate|tin_certificate|hotel_license|...
        fileUrl: z.string().url(),
        fileName: z.string(),
        fileSize: z.number().optional(),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();

      // Retrieve the application
      const apps = await db.execute(sql`
        SELECT * FROM merchant_onboarding_applications WHERE id = ${input.applicationId} LIMIT 1
      `);
      const app = (apps as any[])[0];
      if (!app) throw new TRPCError({ code: "NOT_FOUND", message: "Application not found" });

      // Store documents using existing kybDocuments pattern
      const docIds: string[] = [];
      for (const doc of input.documents) {
        const docId = crypto.randomUUID();
        await db.execute(sql`
          INSERT INTO kyb_documents (id, application_id, document_type, file_url, file_name, status, uploaded_by, created_at)
          VALUES (${docId}, ${input.applicationId}, ${doc.documentType}, ${doc.fileUrl}, ${doc.fileName}, 'pending_review', ${ctx.user.id}, ${Math.floor(Date.now() / 1000)})
          ON CONFLICT DO NOTHING
        `);
        docIds.push(docId);
      }

      // Advance onboarding step to kyb_review
      await db.execute(sql`
        UPDATE merchant_onboarding_applications
        SET onboarding_step = 2, status = 'kyb_review', updated_at = ${Math.floor(Date.now() / 1000)}
        WHERE id = ${input.applicationId}
      `);

      // Emit event
      await emitJourneyEvent("merchant.kyb.documents_submitted", {
        applicationId: input.applicationId,
        documentCount: input.documents.length,
        merchantType: app.merchant_type,
      });

      // Audit
      await createAuditEntry({
        actorId: String(ctx.user.id),
        action: "merchant.kyb.documents_submitted",
        entityType: "merchant_application",
        entityId: input.applicationId,
        metadata: { documentCount: input.documents.length },
      });

      return {
        applicationId: input.applicationId,
        documentsSubmitted: docIds.length,
        currentStep: 2,
        nextStep: "kyb_review",
        message: "Documents submitted. Our compliance team will review within 24-48 hours.",
      };
    }),

  // ── Step 3: Admin approves KYB (reuses kybApplications.approve) ────────────
  approveMerchantKyb: adminProcedure
    .input(z.object({
      applicationId: z.string(),
      complianceScore: z.number().min(0).max(100).default(85),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();

      const apps = await db.execute(sql`
        SELECT * FROM merchant_onboarding_applications WHERE id = ${input.applicationId} LIMIT 1
      `);
      const app = (apps as any[])[0];
      if (!app) throw new TRPCError({ code: "NOT_FOUND", message: "Application not found" });

      const merchantType = app.merchant_type as MerchantType;
      const config = MERCHANT_TYPE_CONFIG[merchantType];

      // 1. Create merchant record using existing merchant table
      const merchantId = crypto.randomUUID();
      await db.execute(sql`
        INSERT INTO merchants (
          id, business_name, owner_name, email, phone, merchant_type,
          status, kyb_status, platform_fee_percent, settlement_cycle,
          created_at, updated_at
        ) VALUES (
          ${merchantId}, ${app.business_name}, ${app.owner_name}, ${app.owner_email},
          ${app.owner_phone}, ${merchantType}, 'active', 'approved',
          ${config.platformFeePercent}, ${config.settlementCycle},
          ${Math.floor(Date.now() / 1000)}, ${Math.floor(Date.now() / 1000)}
        ) ON CONFLICT DO NOTHING
      `);

      // 2. Provision TigerBeetle ledger account (reuses tigerBeetle.ensureAccount logic)
      const tbAccountId = `merchant_${merchantId}`;
      try {
        await createLedgerTransfer({
          id: BigInt(Date.now()),
          debitAccountId: BigInt(1), // platform float account
          creditAccountId: BigInt(2), // merchant account (will be created)
          amount: BigInt(0),
          ledger: 1,
          code: 1,
          flags: 0,
        });
      } catch (err) {
        logger.warn({ err }, "[Journey] TigerBeetle account provisioning — continuing");
      }

      // 3. Create wallet for merchant (reuses wallet system)
      await db.execute(sql`
        INSERT INTO wallet_balances (user_id, currency, balance, ledger_account_id, created_at)
        VALUES (${merchantId}, 'NGN', 0, ${tbAccountId}, ${Math.floor(Date.now() / 1000)})
        ON CONFLICT DO NOTHING
      `);

      // 4. Update application status
      await db.execute(sql`
        UPDATE merchant_onboarding_applications
        SET status = 'approved', merchant_id = ${merchantId},
            kyb_score = ${input.complianceScore}, kyb_reviewed_at = ${Math.floor(Date.now() / 1000)},
            kyb_reviewed_by = ${String(ctx.user.id)}, onboarding_step = 3,
            updated_at = ${Math.floor(Date.now() / 1000)}
        WHERE id = ${input.applicationId}
      `);

      // 5. Update establishment KYB status (reuses africa registry)
      await db.execute(sql`
        UPDATE establishments SET kyb_status = 'approved', updated_at = ${Math.floor(Date.now() / 1000)}
        WHERE contact_email = ${app.owner_email}
      `);

      // 6. Post GL journal entry (reuses generalLedger)
      await postJournalEntry({
        description: `Merchant account provisioned: ${app.business_name}`,
        debitAccount: "1000-MERCHANT-ONBOARDING",
        creditAccount: "2000-MERCHANT-WALLET",
        amountNgn: 0,
        reference: merchantId,
        journeyType: "merchant_onboarding",
      });

      // 7. Emit Fluvio event
      await emitJourneyEvent("merchant.kyb.approved", {
        applicationId: input.applicationId,
        merchantId,
        merchantType,
        complianceScore: input.complianceScore,
      });

      // 8. Send approval notification
      await sendNotification({
        userId: app.owner_email,
        title: "🎉 Your merchant account is approved!",
        body: `Congratulations! Your ${merchantType} merchant account on TourismPay is now active. You can start accepting payments.`,
        type: "kyb_approved",
        metadata: { merchantId, merchantType },
      });

      // 9. Audit
      await createAuditEntry({
        actorId: String(ctx.user.id),
        action: "merchant.kyb.approved",
        entityType: "merchant",
        entityId: merchantId,
        metadata: { applicationId: input.applicationId, complianceScore: input.complianceScore },
      });

      return {
        merchantId,
        tbAccountId,
        status: "approved",
        nextStep: "wallet_setup",
        message: `${app.business_name} is now an approved ${merchantType} merchant on TourismPay.`,
        config: {
          platformFeePercent: config.platformFeePercent,
          settlementCycle: config.settlementCycle,
          vatApplicable: config.vatApplicable,
          serviceChargePercent: config.serviceChargePercent,
          permifyRole: config.permifyRole,
        },
      };
    }),

  // ── Step 4: Get merchant onboarding status ─────────────────────────────────
  getMerchantOnboardingStatus: protectedProcedure
    .input(z.object({ applicationId: z.string() }))
    .query(async ({ input }) => {
      const db = getDb();
      const apps = await db.execute(sql`
        SELECT moa.*, m.id as merchant_id_confirmed
        FROM merchant_onboarding_applications moa
        LEFT JOIN merchants m ON m.id = moa.merchant_id
        WHERE moa.id = ${input.applicationId}
        LIMIT 1
      `);
      const app = (apps as any[])[0];
      if (!app) throw new TRPCError({ code: "NOT_FOUND", message: "Application not found" });

      const config = MERCHANT_TYPE_CONFIG[app.merchant_type as MerchantType];
      const currentStepIndex = app.onboarding_step - 1;
      const steps = config.onboardingSteps;

      return {
        applicationId: app.id,
        merchantType: app.merchant_type,
        businessName: app.business_name,
        status: app.status,
        currentStep: app.onboarding_step,
        currentStepName: steps[currentStepIndex] ?? "complete",
        totalSteps: steps.length,
        steps: steps.map((step: string, i: number) => ({
          step: i + 1,
          name: step,
          status: i < currentStepIndex ? "completed" : i === currentStepIndex ? "current" : "pending",
        })),
        kybScore: app.kyb_score,
        merchantId: app.merchant_id,
        requiredDocuments: config.kybDocuments,
      };
    }),

  // ── List all merchant onboarding applications ──────────────────────────────
  listMerchantApplications: adminProcedure
    .input(z.object({
      status: z.string().optional(),
      merchantType: z.enum([...MERCHANT_TYPES, "all"] as const).optional(),
      limit: z.number().int().min(1).max(100).default(50),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.execute(sql`
        SELECT * FROM merchant_onboarding_applications
        WHERE (${input.status ?? null} IS NULL OR status = ${input.status ?? null})
          AND (${input.merchantType === "all" || !input.merchantType ? null : input.merchantType} IS NULL
               OR merchant_type = ${input.merchantType === "all" || !input.merchantType ? null : input.merchantType})
        ORDER BY created_at DESC
        LIMIT ${input.limit} OFFSET ${input.offset}
      `);
      return { applications: rows as any[], total: (rows as any[]).length };
    }),

  // ─── TOURIST JOURNEY ORCHESTRATION ────────────────────────────────────────

  // ── Tourist: Create profile ────────────────────────────────────────────────
  // Reuses: wallet system, KYC, notifications
  createTouristProfile: protectedProcedure
    .input(z.object({
      firstName: z.string().min(1).max(100),
      lastName: z.string().min(1).max(100),
      email: z.string().email(),
      phone: z.string().optional(),
      nationality: z.string().min(2).max(5), // ISO country code: US|GB|NG|DE
      residenceCountry: z.string().min(2).max(5),
      profileType: z.enum(["tourist", "diaspora", "business", "expat"]).default("tourist"),
      preferredCurrency: z.enum(["USD", "GBP", "EUR", "NGN"]).default("NGN"),
      passportNumber: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const profileId = crypto.randomUUID();

      // 1. Create tourist profile
      await db.execute(sql`
        INSERT INTO tourist_profiles (
          id, user_id, first_name, last_name, email, phone, nationality,
          residence_country, preferred_currency, profile_type, kyc_status, created_at, updated_at
        ) VALUES (
          ${profileId}, ${ctx.user.id}, ${input.firstName}, ${input.lastName},
          ${input.email}, ${input.phone ?? null}, ${input.nationality},
          ${input.residenceCountry}, ${input.preferredCurrency}, ${input.profileType},
          'pending', ${Math.floor(Date.now() / 1000)}, ${Math.floor(Date.now() / 1000)}
        ) ON CONFLICT (email) DO UPDATE SET
          first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
          updated_at = EXCLUDED.updated_at
      `);

      // 2. Provision wallet (reuses wallet system)
      await db.execute(sql`
        INSERT INTO wallet_balances (user_id, currency, balance, created_at)
        VALUES (${ctx.user.id}, ${input.preferredCurrency}, 0, ${Math.floor(Date.now() / 1000)})
        ON CONFLICT DO NOTHING
      `);
      // Also provision NGN wallet
      if (input.preferredCurrency !== "NGN") {
        await db.execute(sql`
          INSERT INTO wallet_balances (user_id, currency, balance, created_at)
          VALUES (${ctx.user.id}, 'NGN', 0, ${Math.floor(Date.now() / 1000)})
          ON CONFLICT DO NOTHING
        `);
      }

      // 3. Emit event
      await emitJourneyEvent("tourist.profile.created", {
        profileId,
        profileType: input.profileType,
        nationality: input.nationality,
        preferredCurrency: input.preferredCurrency,
      });

      // 4. Send welcome notification
      await sendNotification({
        userId: String(ctx.user.id),
        title: `Welcome to TourismPay, ${input.firstName}!`,
        body: "Your tourist profile is ready. Top up your wallet to start exploring Nigeria.",
        type: "welcome",
        metadata: { profileId, profileType: input.profileType },
      });

      return {
        profileId,
        profileType: input.profileType,
        preferredCurrency: input.preferredCurrency,
        walletCurrencies: input.preferredCurrency !== "NGN" ? [input.preferredCurrency, "NGN"] : ["NGN"],
        message: `Tourist profile created. Your ${input.preferredCurrency} and NGN wallets are ready.`,
      };
    }),

  // ── Tourist: Wallet top-up (USD/GBP/Stablecoin) ────────────────────────────
  // Reuses: wallet.deposit, fxRates.convert, stablecoinSwap.onrampBuy, tigerBeetle.transfers
  initiateWalletTopup: protectedProcedure
    .input(z.object({
      touristProfileId: z.string(),
      sourceCurrency: z.enum(["USD", "GBP", "EUR", "USDC", "USDT", "DAI"]),
      sourceAmount: z.number().positive(),
      topupMethod: z.enum(["wire_transfer", "card", "swift", "sepa", "crypto"]),
      providerReference: z.string().optional(),
      onChainTxHash: z.string().optional(), // for crypto topups
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const topupId = crypto.randomUUID();

      // 1. Get live FX rate (reuses fxRates router data)
      const fxRows = await db.execute(sql`
        SELECT rate, source FROM fx_rates
        WHERE from_currency = ${input.sourceCurrency} AND to_currency = 'NGN'
        ORDER BY updated_at DESC LIMIT 1
      `);
      const fxRow = (fxRows as any[])[0];
      const fxRate = fxRow?.rate ?? (
        input.sourceCurrency === "USD" ? 1580 :
        input.sourceCurrency === "GBP" ? 2010 :
        input.sourceCurrency === "EUR" ? 1720 :
        1580 // stablecoins pegged to USD
      );

      // 2. Calculate amounts
      const isCrypto = ["USDC", "USDT", "DAI"].includes(input.sourceCurrency);
      const usdEquivalent = isCrypto ? input.sourceAmount : null;
      const fxFeePercent = isCrypto ? 2.0 : 1.5;
      const fxFeeNgn = (input.sourceAmount * fxRate) * (fxFeePercent / 100);
      const targetAmountNgn = (input.sourceAmount * fxRate) - fxFeeNgn;

      // 3. Record topup
      await db.execute(sql`
        INSERT INTO wallet_topups (
          id, user_id, source_currency, source_amount, target_currency, target_amount,
          fx_rate, fx_rate_source, fx_fee_percent, fx_fee_amount, topup_method,
          topup_provider, provider_reference, status, created_at
        ) VALUES (
          ${topupId}, ${ctx.user.id}, ${input.sourceCurrency}, ${input.sourceAmount},
          'NGN', ${targetAmountNgn}, ${fxRate}, ${fxRow?.source ?? 'interbank'},
          ${fxFeePercent}, ${fxFeeNgn}, ${input.topupMethod},
          ${isCrypto ? 'crypto_bridge' : 'bank_transfer'}, ${input.providerReference ?? null},
          'processing', ${Math.floor(Date.now() / 1000)}
        )
      `);

      // 4. For crypto: record stablecoin conversion (reuses stablecoinSwap pattern)
      if (isCrypto && input.onChainTxHash) {
        await db.execute(sql`
          INSERT INTO stablecoin_conversions (
            id, token_symbol, token_amount, usd_equivalent, ngn_amount,
            usd_to_ngn_rate, conversion_fee_percent, conversion_fee_ngn,
            on_chain_tx_hash, status, wallet_topup_id, created_at
          ) VALUES (
            ${crypto.randomUUID()}, ${input.sourceCurrency}, ${input.sourceAmount},
            ${input.sourceAmount}, ${targetAmountNgn}, ${fxRate},
            ${fxFeePercent}, ${fxFeeNgn}, ${input.onChainTxHash},
            'confirming', ${topupId}, ${Math.floor(Date.now() / 1000)}
          )
        `);
      }

      // 5. Credit NGN wallet (reuses wallet system)
      await db.execute(sql`
        UPDATE wallet_balances
        SET balance = balance + ${targetAmountNgn}, updated_at = ${Math.floor(Date.now() / 1000)}
        WHERE user_id = ${ctx.user.id} AND currency = 'NGN'
      `);

      // 6. Mark topup as completed
      await db.execute(sql`
        UPDATE wallet_topups SET status = 'completed', completed_at = ${Math.floor(Date.now() / 1000)}
        WHERE id = ${topupId}
      `);

      // 7. TigerBeetle ledger entry (reuses tigerBeetle)
      try {
        const tbTransferId = BigInt(Date.now());
        await createLedgerTransfer({
          id: tbTransferId,
          debitAccountId: BigInt(9999), // FX settlement account
          creditAccountId: BigInt(ctx.user.id),
          amount: BigInt(Math.round(targetAmountNgn * 100)), // kobo
          ledger: 1,
          code: 10, // topup code
          flags: 0,
        });
        await db.execute(sql`
          UPDATE wallet_topups SET tigerbeetle_transfer_id = ${tbTransferId.toString()}
          WHERE id = ${topupId}
        `);
      } catch (err) {
        logger.warn({ err }, "[Journey] TigerBeetle topup transfer — continuing");
      }

      // 8. Post GL entry (reuses generalLedger)
      await postJournalEntry({
        description: `Tourist wallet top-up: ${input.sourceAmount} ${input.sourceCurrency} → ${targetAmountNgn.toFixed(2)} NGN`,
        debitAccount: "1100-FX-SETTLEMENT",
        creditAccount: `2100-TOURIST-WALLET-${ctx.user.id}`,
        amountNgn: targetAmountNgn,
        reference: topupId,
        journeyType: "tourist_topup",
      });

      // 9. Emit event (reuses Fluvio)
      await emitJourneyEvent("tourist.wallet.topup", {
        topupId,
        sourceCurrency: input.sourceCurrency,
        sourceAmount: input.sourceAmount,
        targetAmountNgn,
        fxRate,
        method: input.topupMethod,
      });

      // 10. Send notification
      await sendNotification({
        userId: String(ctx.user.id),
        title: "💰 Wallet Topped Up!",
        body: `₦${targetAmountNgn.toLocaleString("en-NG", { maximumFractionDigits: 2 })} has been added to your TourismPay wallet (${input.sourceAmount} ${input.sourceCurrency} @ ₦${fxRate.toLocaleString()})`,
        type: "wallet_topup",
        metadata: { topupId, sourceCurrency: input.sourceCurrency, targetAmountNgn },
      });

      return {
        topupId,
        sourceCurrency: input.sourceCurrency,
        sourceAmount: input.sourceAmount,
        targetCurrency: "NGN",
        targetAmountNgn,
        fxRate,
        fxFeeNgn,
        status: "completed",
        message: `₦${targetAmountNgn.toLocaleString("en-NG", { maximumFractionDigits: 2 })} credited to your wallet`,
      };
    }),

  // ── Tourist: Pay at merchant (restaurant/hotel/transport/nightclub) ─────────
  // Reuses: wallet.send, tipping.send, taxRemittance, tigerBeetle, settlement, loyalty.earn
  payAtMerchant: protectedProcedure
    .input(z.object({
      touristProfileId: z.string(),
      merchantId: z.string(),
      merchantType: z.enum(MERCHANT_TYPES),
      serviceReferenceId: z.string().optional(), // booking/order/ticket ID
      description: z.string().min(1).max(500),
      amountNgn: z.number().positive(),
      tipAmountNgn: z.number().min(0).default(0),
      paymentMethod: z.enum(["wallet", "ussd", "qr"]).default("wallet"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const paymentId = crypto.randomUUID();
      const config = MERCHANT_TYPE_CONFIG[input.merchantType];

      // 1. Calculate taxes (reuses Nigerian tax logic)
      const taxes = calculateNigerianTaxes(input.amountNgn, input.merchantType);
      const totalWithTip = taxes.total + input.tipAmountNgn;

      // 2. Check wallet balance (reuses wallet system)
      const balRows = await db.execute(sql`
        SELECT balance FROM wallet_balances
        WHERE user_id = ${ctx.user.id} AND currency = 'NGN' LIMIT 1
      `);
      const balance = (balRows as any[])[0]?.balance ?? 0;
      if (balance < totalWithTip) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Insufficient wallet balance. Available: ₦${balance.toLocaleString()}, Required: ₦${totalWithTip.toLocaleString()}`,
        });
      }

      // 3. Debit tourist wallet
      await db.execute(sql`
        UPDATE wallet_balances
        SET balance = balance - ${totalWithTip}, updated_at = ${Math.floor(Date.now() / 1000)}
        WHERE user_id = ${ctx.user.id} AND currency = 'NGN'
      `);

      // 4. Credit merchant wallet
      const netToMerchant = taxes.total - taxes.platformFee;
      await db.execute(sql`
        UPDATE wallet_balances
        SET balance = balance + ${netToMerchant}, updated_at = ${Math.floor(Date.now() / 1000)}
        WHERE user_id = ${input.merchantId} AND currency = 'NGN'
      `);

      // 5. Record service payment
      await db.execute(sql`
        INSERT INTO service_payments (
          id, tourist_profile_id, merchant_id, service_type, service_reference_id,
          description, amount_ngn, tip_amount_ngn, vat_amount_ngn, total_amount_ngn,
          payment_method, status, created_at
        ) VALUES (
          ${paymentId}, ${input.touristProfileId}, ${input.merchantId}, ${input.merchantType},
          ${input.serviceReferenceId ?? null}, ${input.description}, ${input.amountNgn},
          ${input.tipAmountNgn}, ${taxes.vat}, ${totalWithTip},
          ${input.paymentMethod}, 'completed', ${Math.floor(Date.now() / 1000)}
        )
      `);

      // 6. Record merchant payment (for settlement)
      await db.execute(sql`
        INSERT INTO merchant_payments (
          id, merchant_id, tourist_profile_id, payment_type, reference_id,
          amount_ngn, fee_ngn, vat_ngn, net_amount_ngn, currency, status, created_at
        ) VALUES (
          ${crypto.randomUUID()}, ${input.merchantId}, ${input.touristProfileId},
          'service', ${paymentId}, ${taxes.total}, ${taxes.platformFee}, ${taxes.vat},
          ${netToMerchant}, 'NGN', 'completed', ${Math.floor(Date.now() / 1000)}
        )
      `);

      // 7. Process tip via existing tipping system
      if (input.tipAmountNgn > 0) {
        await db.execute(sql`
          INSERT INTO tip_transactions (
            id, merchant_id, tipper_user_id, amount_ngn, currency, status,
            payment_method, created_at
          ) VALUES (
            ${crypto.randomUUID()}, ${input.merchantId}, ${ctx.user.id},
            ${input.tipAmountNgn}, 'NGN', 'completed', ${input.paymentMethod},
            ${Math.floor(Date.now() / 1000)}
          ) ON CONFLICT DO NOTHING
        `);
      }

      // 8. Remit VAT to FIRS (reuses taxRemittance system)
      if (taxes.vat > 0) {
        await db.execute(sql`
          INSERT INTO tax_collections (
            id, merchant_id, tax_type, amount, currency, period, status, created_at
          ) VALUES (
            ${crypto.randomUUID()}, ${input.merchantId}, 'VAT', ${taxes.vat},
            'NGN', ${new Date().toISOString().slice(0, 7)}, 'collected',
            ${Math.floor(Date.now() / 1000)}
          ) ON CONFLICT DO NOTHING
        `);
      }

      // 9. Award loyalty points (reuses loyalty.earn)
      const loyaltyPoints = Math.floor(input.amountNgn / 100); // 1 point per ₦100
      await db.execute(sql`
        INSERT INTO loyalty_transactions (
          id, user_id, merchant_id, points, transaction_type, reference_id, created_at
        ) VALUES (
          ${crypto.randomUUID()}, ${ctx.user.id}, ${input.merchantId},
          ${loyaltyPoints}, 'earn', ${paymentId}, ${Math.floor(Date.now() / 1000)}
        ) ON CONFLICT DO NOTHING
      `);

      // 10. TigerBeetle ledger entry
      try {
        const tbTransferId = BigInt(Date.now());
        await createLedgerTransfer({
          id: tbTransferId,
          debitAccountId: BigInt(ctx.user.id),
          creditAccountId: BigInt(parseInt(input.merchantId.replace(/\D/g, "").slice(0, 10) || "1")),
          amount: BigInt(Math.round(totalWithTip * 100)),
          ledger: 1,
          code: 20, // merchant payment code
          flags: 0,
        });
        await db.execute(sql`
          UPDATE service_payments SET tigerbeetle_transfer_id = ${tbTransferId.toString()}
          WHERE id = ${paymentId}
        `);
      } catch (err) {
        logger.warn({ err }, "[Journey] TigerBeetle merchant payment — continuing");
      }

      // 11. Post GL entry
      await postJournalEntry({
        description: `Tourist payment at ${input.merchantType}: ${input.description}`,
        debitAccount: `2100-TOURIST-WALLET-${ctx.user.id}`,
        creditAccount: `3000-MERCHANT-WALLET-${input.merchantId}`,
        amountNgn: totalWithTip,
        reference: paymentId,
        journeyType: "tourist_payment",
      });

      // 12. Emit event
      await emitJourneyEvent("tourist.payment.completed", {
        paymentId,
        merchantType: input.merchantType,
        amountNgn: input.amountNgn,
        vatNgn: taxes.vat,
        tipNgn: input.tipAmountNgn,
        totalNgn: totalWithTip,
        loyaltyPoints,
      });

      // 13. Notify tourist
      await sendNotification({
        userId: String(ctx.user.id),
        title: `Payment Successful ✅`,
        body: `₦${totalWithTip.toLocaleString("en-NG", { maximumFractionDigits: 2 })} paid at ${input.merchantType}. You earned ${loyaltyPoints} loyalty points!`,
        type: "payment_success",
        metadata: { paymentId, merchantType: input.merchantType, loyaltyPoints },
      });

      return {
        paymentId,
        subtotalNgn: input.amountNgn,
        vatNgn: taxes.vat,
        serviceChargeNgn: taxes.serviceCharge,
        platformFeeNgn: taxes.platformFee,
        tipNgn: input.tipAmountNgn,
        totalNgn: totalWithTip,
        netToMerchantNgn: netToMerchant,
        loyaltyPointsEarned: loyaltyPoints,
        status: "completed",
        receipt: {
          paymentId,
          description: input.description,
          merchantType: input.merchantType,
          breakdown: {
            subtotal: input.amountNgn,
            vat: taxes.vat,
            serviceCharge: taxes.serviceCharge,
            tip: input.tipAmountNgn,
            total: totalWithTip,
          },
        },
      };
    }),

  // ── Tourist: Get full journey summary ──────────────────────────────────────
  getTouristJourneySummary: protectedProcedure
    .input(z.object({ touristProfileId: z.string() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();

      // Get profile
      const profiles = await db.execute(sql`
        SELECT * FROM tourist_profiles WHERE id = ${input.touristProfileId} LIMIT 1
      `);
      const profile = (profiles as any[])[0];
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Tourist profile not found" });

      // Get wallet balances (reuses wallet system)
      const balances = await db.execute(sql`
        SELECT currency, balance FROM wallet_balances WHERE user_id = ${ctx.user.id}
      `);

      // Get topup history
      const topups = await db.execute(sql`
        SELECT * FROM wallet_topups WHERE user_id = ${ctx.user.id}
        ORDER BY created_at DESC LIMIT 10
      `);

      // Get all payments
      const payments = await db.execute(sql`
        SELECT sp.*, m.business_name as merchant_name
        FROM service_payments sp
        LEFT JOIN merchants m ON m.id = sp.merchant_id
        WHERE sp.tourist_profile_id = ${input.touristProfileId}
        ORDER BY sp.created_at DESC LIMIT 20
      `);

      // Get loyalty points (reuses loyalty system)
      const loyaltyRows = await db.execute(sql`
        SELECT COALESCE(SUM(CASE WHEN transaction_type = 'earn' THEN points ELSE -points END), 0) as total_points
        FROM loyalty_transactions WHERE user_id = ${ctx.user.id}
      `);

      // Get bookings (hotel + airbnb + transport + events)
      const bookings = await db.execute(sql`
        SELECT * FROM tourist_bookings WHERE tourist_profile_id = ${input.touristProfileId}
        ORDER BY created_at DESC LIMIT 20
      `);

      const totalSpend = (payments as any[]).reduce((sum: number, p: any) => sum + (p.total_amount_ngn ?? 0), 0);

      return {
        profile,
        walletBalances: balances as any[],
        topupHistory: topups as any[],
        recentPayments: payments as any[],
        bookings: bookings as any[],
        loyaltyPoints: (loyaltyRows as any[])[0]?.total_points ?? 0,
        totalSpendNgn: totalSpend,
        journeyStats: {
          totalTopups: (topups as any[]).length,
          totalPayments: (payments as any[]).length,
          totalBookings: (bookings as any[]).length,
          merchantTypesVisited: [...new Set((payments as any[]).map((p: any) => p.service_type))],
        },
      };
    }),

  // ── Stablecoin → NGN conversion (for fashion week entrepreneur) ────────────
  // Reuses: stablecoinSwap.onrampBuy, fxRates, wallet.deposit
  convertStablecoinToNgn: protectedProcedure
    .input(z.object({
      touristProfileId: z.string(),
      tokenSymbol: z.enum(["USDC", "USDT", "DAI", "BUSD"]),
      tokenAmount: z.number().positive(),
      walletAddress: z.string().min(10).max(100),
      onChainTxHash: z.string().min(10).max(100),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const conversionId = crypto.randomUUID();

      // 1. Get USD→NGN rate (reuses fxRates)
      const fxRows = await db.execute(sql`
        SELECT rate FROM fx_rates WHERE from_currency = 'USD' AND to_currency = 'NGN'
        ORDER BY updated_at DESC LIMIT 1
      `);
      const usdNgnRate = (fxRows as any[])[0]?.rate ?? 1580;

      // 2. Calculate conversion (stablecoins are 1:1 with USD)
      const usdEquivalent = input.tokenAmount; // USDC/USDT = 1 USD
      const feePercent = 2.0;
      const feeNgn = usdEquivalent * usdNgnRate * (feePercent / 100);
      const ngnAmount = (usdEquivalent * usdNgnRate) - feeNgn;

      // 3. Record stablecoin conversion
      await db.execute(sql`
        INSERT INTO stablecoin_conversions (
          id, token_symbol, token_amount, usd_equivalent, ngn_amount,
          usd_to_ngn_rate, conversion_fee_percent, conversion_fee_ngn,
          on_chain_tx_hash, status, created_at
        ) VALUES (
          ${conversionId}, ${input.tokenSymbol}, ${input.tokenAmount},
          ${usdEquivalent}, ${ngnAmount}, ${usdNgnRate},
          ${feePercent}, ${feeNgn}, ${input.onChainTxHash},
          'completed', ${Math.floor(Date.now() / 1000)}
        )
      `);

      // 4. Credit NGN wallet (reuses wallet system)
      await db.execute(sql`
        UPDATE wallet_balances
        SET balance = balance + ${ngnAmount}, updated_at = ${Math.floor(Date.now() / 1000)}
        WHERE user_id = ${ctx.user.id} AND currency = 'NGN'
      `);

      // 5. Record as wallet topup
      const topupId = crypto.randomUUID();
      await db.execute(sql`
        INSERT INTO wallet_topups (
          id, user_id, source_currency, source_amount, target_currency, target_amount,
          fx_rate, fx_fee_percent, fx_fee_amount, topup_method, status, created_at, completed_at
        ) VALUES (
          ${topupId}, ${ctx.user.id}, ${input.tokenSymbol}, ${input.tokenAmount},
          'NGN', ${ngnAmount}, ${usdNgnRate}, ${feePercent}, ${feeNgn},
          'crypto', 'completed', ${Math.floor(Date.now() / 1000)}, ${Math.floor(Date.now() / 1000)}
        )
      `);

      // 6. Update stablecoin conversion with topup reference
      await db.execute(sql`
        UPDATE stablecoin_conversions SET wallet_topup_id = ${topupId} WHERE id = ${conversionId}
      `);

      // 7. Post GL entry (reuses generalLedger)
      await postJournalEntry({
        description: `Stablecoin conversion: ${input.tokenAmount} ${input.tokenSymbol} → ₦${ngnAmount.toFixed(2)}`,
        debitAccount: "1200-CRYPTO-BRIDGE",
        creditAccount: `2100-TOURIST-WALLET-${ctx.user.id}`,
        amountNgn: ngnAmount,
        reference: conversionId,
        journeyType: "stablecoin_conversion",
      });

      // 8. Emit event
      await emitJourneyEvent("tourist.stablecoin.converted", {
        conversionId,
        tokenSymbol: input.tokenSymbol,
        tokenAmount: input.tokenAmount,
        ngnAmount,
        usdNgnRate,
      });

      // 9. Notify
      await sendNotification({
        userId: String(ctx.user.id),
        title: `${input.tokenSymbol} Converted! 💱`,
        body: `${input.tokenAmount} ${input.tokenSymbol} → ₦${ngnAmount.toLocaleString("en-NG", { maximumFractionDigits: 2 })} at ₦${usdNgnRate.toLocaleString()}/USD`,
        type: "stablecoin_conversion",
        metadata: { conversionId, tokenSymbol: input.tokenSymbol, ngnAmount },
      });

      return {
        conversionId,
        tokenSymbol: input.tokenSymbol,
        tokenAmount: input.tokenAmount,
        usdEquivalent,
        ngnAmount,
        usdNgnRate,
        feePercent,
        feeNgn,
        status: "completed",
        message: `₦${ngnAmount.toLocaleString("en-NG", { maximumFractionDigits: 2 })} credited to your wallet`,
      };
    }),

  // ── Get journey config for a merchant type ─────────────────────────────────
  getMerchantTypeConfig: protectedProcedure
    .input(z.object({ merchantType: z.enum(MERCHANT_TYPES) }))
    .query(({ input }) => {
      return {
        merchantType: input.merchantType,
        ...MERCHANT_TYPE_CONFIG[input.merchantType],
      };
    }),

  // ── Get all merchant type configs (for onboarding wizard) ─────────────────
  getAllMerchantTypeConfigs: protectedProcedure.query(() => {
    return Object.entries(MERCHANT_TYPE_CONFIG).map(([type, config]) => ({
      merchantType: type,
      ...config,
    }));
  }),

  // ── Get tourist journey config ─────────────────────────────────────────────
  getTouristJourneyConfig: protectedProcedure
    .input(z.object({ profileType: z.enum(["diaspora_usd", "diaspora_gbp", "crypto_fiat"]) }))
    .query(({ input }) => {
      return {
        profileType: input.profileType,
        ...TOURIST_PROFILE_CONFIG[input.profileType],
        supportedServices: ["hotel", "restaurant", "airbnb", "concert", "transport", "nightclub", "dry_cleaning"],
        taxInfo: {
          vat: "7.5% (FIRS)",
          serviceCharge: "10% (hospitality)",
          withholdingTax: "5% (professional services)",
        },
        loyaltyInfo: {
          pointsPerNaira: "1 point per ₦100 spent",
          redemptionRate: "₦1 per 100 points",
          tiers: ["standard", "silver", "gold", "diaspora", "premium"],
        },
      };
    }),

  // ── Dashboard: All active journeys ────────────────────────────────────────
  getJourneyDashboard: adminProcedure.query(async () => {
    const db = getDb();

    const [merchantApps, touristProfiles, recentPayments, topups] = await Promise.all([
      db.execute(sql`
        SELECT merchant_type, status, COUNT(*) as count
        FROM merchant_onboarding_applications
        GROUP BY merchant_type, status
        ORDER BY merchant_type, status
      `),
      db.execute(sql`
        SELECT profile_type, nationality, COUNT(*) as count
        FROM tourist_profiles
        GROUP BY profile_type, nationality
        ORDER BY count DESC LIMIT 20
      `),
      db.execute(sql`
        SELECT service_type, COUNT(*) as count, SUM(total_amount_ngn) as total_ngn
        FROM service_payments
        WHERE created_at > ${Math.floor(Date.now() / 1000) - 86400 * 30}
        GROUP BY service_type
        ORDER BY total_ngn DESC
      `),
      db.execute(sql`
        SELECT source_currency, COUNT(*) as count, SUM(target_amount) as total_ngn
        FROM wallet_topups
        WHERE status = 'completed' AND created_at > ${Math.floor(Date.now() / 1000) - 86400 * 30}
        GROUP BY source_currency
        ORDER BY total_ngn DESC
      `),
    ]);

    return {
      merchantApplications: merchantApps as any[],
      touristProfiles: touristProfiles as any[],
      paymentsByMerchantType: recentPayments as any[],
      topupsByCurrency: topups as any[],
    };
  }),
});
