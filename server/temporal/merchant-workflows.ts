/**
 * TourismPay Merchant Onboarding Temporal Workflows
 *
 * All 6 merchant types share the same base workflow with type-specific
 * configuration. Each workflow is durable, resumable, and handles:
 *  - Step-by-step onboarding with human review gates
 *  - Document submission with 48h review timer
 *  - KYB approval/rejection with compensation
 *  - Wallet + TigerBeetle account provisioning
 *  - Notifications at every step
 *  - Audit trail via Fluvio events
 *
 * Workflow signals:
 *  - submitDocuments: tourist uploads KYB documents
 *  - approveKyb: admin approves the application
 *  - rejectKyb: admin rejects with reason
 *  - advanceStep: move to next onboarding step
 *
 * Workflow queries:
 *  - getStatus: current step, status, and progress
 */

import {
  startWorkflow,
  signalWorkflow,
  getWorkflowStatus,
  type WorkflowType,
} from "../_core/temporal-integration";
import {
  kybActivities,
  walletActivities,
  tigerBeetleActivities,
  notificationActivities,
  auditActivities,
  fluvioActivities,
} from "./journey-activities";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../_core/logger";

// ─── Merchant Type Config ─────────────────────────────────────────────────────

const MERCHANT_CONFIG: Record<string, {
  kybDocuments: string[];
  steps: string[];
  platformFeePercent: number;
  settlementCycle: string;
  reviewTimeoutHours: number;
  walletCurrencies: string[];
}> = {
  hotel: {
    kybDocuments: ["cac_certificate", "tin_certificate", "hotel_license", "fire_safety_cert", "utility_bill", "owner_id"],
    steps: ["business_info", "kyb_documents", "kyb_review", "wallet_setup", "property_setup", "rate_plans", "go_live"],
    platformFeePercent: 3.5, settlementCycle: "T+1", reviewTimeoutHours: 48,
    walletCurrencies: ["NGN"],
  },
  restaurant: {
    kybDocuments: ["cac_certificate", "tin_certificate", "food_handler_permit", "nafdac_cert", "utility_bill", "owner_id"],
    steps: ["business_info", "kyb_documents", "kyb_review", "wallet_setup", "menu_setup", "table_setup", "go_live"],
    platformFeePercent: 2.5, settlementCycle: "T+1", reviewTimeoutHours: 48,
    walletCurrencies: ["NGN"],
  },
  airbnb: {
    kybDocuments: ["cac_certificate", "tin_certificate", "property_deed", "utility_bill", "owner_id", "property_photos"],
    steps: ["business_info", "kyb_documents", "kyb_review", "wallet_setup", "property_listing", "pricing_setup", "go_live"],
    platformFeePercent: 5.0, settlementCycle: "T+2", reviewTimeoutHours: 72,
    walletCurrencies: ["NGN"],
  },
  concert: {
    kybDocuments: ["cac_certificate", "tin_certificate", "event_permit", "venue_license", "utility_bill", "owner_id"],
    steps: ["business_info", "kyb_documents", "kyb_review", "wallet_setup", "venue_setup", "event_creation", "go_live"],
    platformFeePercent: 3.0, settlementCycle: "T+3", reviewTimeoutHours: 48,
    walletCurrencies: ["NGN"],
  },
  transport: {
    kybDocuments: ["cac_certificate", "tin_certificate", "transport_license", "vehicle_registration", "driver_license", "owner_id"],
    steps: ["business_info", "kyb_documents", "kyb_review", "wallet_setup", "fleet_setup", "route_setup", "go_live"],
    platformFeePercent: 4.0, settlementCycle: "T+1", reviewTimeoutHours: 48,
    walletCurrencies: ["NGN"],
  },
  nightclub: {
    kybDocuments: ["cac_certificate", "tin_certificate", "entertainment_license", "liquor_license", "fire_safety_cert", "owner_id"],
    steps: ["business_info", "kyb_documents", "kyb_review", "wallet_setup", "venue_setup", "entry_config", "go_live"],
    platformFeePercent: 3.5, settlementCycle: "T+1", reviewTimeoutHours: 48,
    walletCurrencies: ["NGN"],
  },
};

// ─── Workflow Input/Output Types ──────────────────────────────────────────────

export interface MerchantOnboardingInput {
  merchantType: keyof typeof MERCHANT_CONFIG;
  businessName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  businessAddress: string;
  lga?: string;
  state?: string;
  rcNumber?: string;
  tinNumber?: string;
  initiatedByUserId: string;
}

export interface MerchantOnboardingResult {
  applicationId: string;
  merchantId?: string;
  status: "pending" | "kyb_review" | "approved" | "rejected" | "expired";
  currentStep: number;
  workflowId: string;
}

// ─── Workflow Starter ─────────────────────────────────────────────────────────

export async function startMerchantOnboardingWorkflow(
  input: MerchantOnboardingInput
): Promise<{ workflowId: string; applicationId: string }> {
  const workflowId = `merchant-onboarding-${input.merchantType}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const config = MERCHANT_CONFIG[input.merchantType];
  if (!config) throw new Error(`Unknown merchant type: ${input.merchantType}`);

  // Step 1: Create the onboarding application record (immediate — before workflow starts)
  const applicationId = await kybActivities.createOnboardingApplication({
    ...input,
    workflowId,
  });

  // Step 2: Create establishment in Africa Registry
  await kybActivities.createEstablishment({
    name: input.businessName,
    type: input.merchantType,
    email: input.ownerEmail,
    phone: input.ownerPhone,
    address: input.businessAddress,
  });

  // Step 3: Emit Fluvio event
  await fluvioActivities.emit("merchant.onboarding.started", {
    workflowId,
    applicationId,
    merchantType: input.merchantType,
    businessName: input.businessName,
  });

  // Step 4: Audit log
  await auditActivities.log({
    actorId: input.initiatedByUserId,
    action: "merchant.onboarding.started",
    entityType: "merchant_application",
    entityId: applicationId,
    workflowId,
    metadata: { merchantType: input.merchantType, businessName: input.businessName },
  });

  // Step 5: Send welcome notification
  await notificationActivities.sendInApp({
    userId: input.initiatedByUserId,
    title: `Welcome to TourismPay, ${input.businessName}!`,
    body: `Your ${input.merchantType} merchant application has been received. Upload ${config.kybDocuments.length} required documents to proceed.`,
    type: "onboarding_started",
    metadata: { applicationId, merchantType: input.merchantType, requiredDocs: config.kybDocuments },
  });

  // Step 6: Start the Temporal workflow (durable orchestration)
  await startWorkflow({
    workflowType: "KybOnboardingWorkflow" as WorkflowType,
    workflowId,
    input: {
      applicationId,
      merchantType: input.merchantType,
      businessName: input.businessName,
      ownerEmail: input.ownerEmail,
      config,
    },
    executionTimeout: `${config.reviewTimeoutHours * 7 * 3600}s`, // 7x review timeout
    retryPolicy: { maximumAttempts: 3, initialInterval: "5s", maximumInterval: "60s" },
    memo: {
      applicationId,
      merchantType: input.merchantType,
      businessName: input.businessName,
    },
  });

  logger.info({ workflowId, applicationId, merchantType: input.merchantType }, "[Merchant Workflow] Started");
  return { workflowId, applicationId };
}

// ─── Signal: Submit KYB Documents ────────────────────────────────────────────

export async function signalDocumentsSubmitted(params: {
  workflowId: string;
  applicationId: string;
  documents: Array<{ documentType: string; fileUrl: string; fileName: string }>;
  submittedByUserId: string;
}): Promise<void> {
  // Store documents in DB
  const db = getDb();
  for (const doc of params.documents) {
    await db.execute(sql`
      INSERT INTO kyb_documents (id, application_id, document_type, file_url, file_name, status, uploaded_by, created_at)
      VALUES (${crypto.randomUUID()}, ${params.applicationId}, ${doc.documentType}, ${doc.fileUrl}, ${doc.fileName}, 'pending_review', ${params.submittedByUserId}, ${Math.floor(Date.now() / 1000)})
      ON CONFLICT DO NOTHING
    `);
  }

  // Advance step
  await kybActivities.advanceOnboardingStep(params.applicationId, 2, "kyb_review");

  // Emit event
  await fluvioActivities.emit("merchant.kyb.documents_submitted", {
    workflowId: params.workflowId,
    applicationId: params.applicationId,
    documentCount: params.documents.length,
  });

  // Audit
  await auditActivities.log({
    actorId: params.submittedByUserId,
    action: "merchant.kyb.documents_submitted",
    entityType: "merchant_application",
    entityId: params.applicationId,
    workflowId: params.workflowId,
    metadata: { documentCount: params.documents.length },
  });

  // Notify admin team
  await notificationActivities.sendInApp({
    userId: "admin",
    title: `KYB Documents Submitted`,
    body: `Application ${params.applicationId} has submitted ${params.documents.length} documents for review.`,
    type: "kyb_review_required",
    metadata: { applicationId: params.applicationId, workflowId: params.workflowId },
  });

  // Signal Temporal workflow
  await signalWorkflow(params.workflowId, "documentsSubmitted", {
    applicationId: params.applicationId,
    documentCount: params.documents.length,
  });
}

// ─── Signal: Approve KYB ──────────────────────────────────────────────────────

export async function signalKybApproved(params: {
  workflowId: string;
  applicationId: string;
  complianceScore: number;
  reviewedBy: string;
  notes?: string;
}): Promise<{ merchantId: string }> {
  // Create merchant record + provision wallet + TigerBeetle account
  const merchantId = await kybActivities.approveMerchant({
    applicationId: params.applicationId,
    complianceScore: params.complianceScore,
    reviewedBy: params.reviewedBy,
  });

  // Provision wallet
  await walletActivities.provisionWallet(merchantId, ["NGN"]);

  // TigerBeetle ledger entry
  await tigerBeetleActivities.postGlEntry({
    description: `Merchant account provisioned`,
    debitAccount: "1000-MERCHANT-ONBOARDING",
    creditAccount: `2000-MERCHANT-WALLET-${merchantId}`,
    amountNgn: 0,
    reference: merchantId,
    journeyType: "merchant_kyb_approved",
  });

  // Emit event
  await fluvioActivities.emit("merchant.kyb.approved", {
    workflowId: params.workflowId,
    applicationId: params.applicationId,
    merchantId,
    complianceScore: params.complianceScore,
  });

  // Audit
  await auditActivities.log({
    actorId: params.reviewedBy,
    action: "merchant.kyb.approved",
    entityType: "merchant",
    entityId: merchantId,
    workflowId: params.workflowId,
    metadata: { applicationId: params.applicationId, complianceScore: params.complianceScore },
  });

  // Notify merchant
  const db = getDb();
  const apps = await db.execute(sql`SELECT owner_email, business_name, merchant_type FROM merchant_onboarding_applications WHERE id = ${params.applicationId} LIMIT 1`);
  const app = (apps as any[])[0];
  if (app) {
    await notificationActivities.sendInApp({
      userId: app.owner_email,
      title: "🎉 Merchant Account Approved!",
      body: `Your ${app.merchant_type} business "${app.business_name}" is now live on TourismPay. Start accepting payments today!`,
      type: "kyb_approved",
      metadata: { merchantId, merchantType: app.merchant_type },
    });
    await notificationActivities.sendEmail(
      app.owner_email,
      "Your TourismPay Merchant Account is Approved!",
      `Congratulations! Your merchant account for ${app.business_name} has been approved. Log in to set up your profile and start accepting payments.`
    );
  }

  // Signal Temporal workflow
  await signalWorkflow(params.workflowId, "kybApproved", { merchantId, complianceScore: params.complianceScore });

  logger.info({ workflowId: params.workflowId, merchantId }, "[Merchant Workflow] KYB Approved");
  return { merchantId };
}

// ─── Signal: Reject KYB ───────────────────────────────────────────────────────

export async function signalKybRejected(params: {
  workflowId: string;
  applicationId: string;
  reason: string;
  reviewedBy: string;
}): Promise<void> {
  await kybActivities.rejectApplication(params.applicationId, params.reason);

  await fluvioActivities.emit("merchant.kyb.rejected", {
    workflowId: params.workflowId,
    applicationId: params.applicationId,
    reason: params.reason,
  });

  await auditActivities.log({
    actorId: params.reviewedBy,
    action: "merchant.kyb.rejected",
    entityType: "merchant_application",
    entityId: params.applicationId,
    workflowId: params.workflowId,
    metadata: { reason: params.reason },
  });

  const db = getDb();
  const apps = await db.execute(sql`SELECT owner_email, business_name FROM merchant_onboarding_applications WHERE id = ${params.applicationId} LIMIT 1`);
  const app = (apps as any[])[0];
  if (app) {
    await notificationActivities.sendInApp({
      userId: app.owner_email,
      title: "KYB Application Update",
      body: `Your application for ${app.business_name} requires additional information. Reason: ${params.reason}`,
      type: "kyb_rejected",
      metadata: { applicationId: params.applicationId, reason: params.reason },
    });
  }

  await signalWorkflow(params.workflowId, "kybRejected", { reason: params.reason });
}

// ─── Query: Get Workflow Status ───────────────────────────────────────────────

export async function getMerchantWorkflowStatus(workflowId: string): Promise<{
  status: string;
  currentStep: number;
  applicationId?: string;
  merchantId?: string;
}> {
  const temporalStatus = await getWorkflowStatus(workflowId);
  const db = getDb();
  const apps = await db.execute(sql`
    SELECT id, status, onboarding_step, merchant_id FROM merchant_onboarding_applications
    WHERE temporal_workflow_id = ${workflowId} LIMIT 1
  `);
  const app = (apps as any[])[0];

  return {
    status: temporalStatus?.status ?? app?.status ?? "unknown",
    currentStep: app?.onboarding_step ?? 1,
    applicationId: app?.id,
    merchantId: app?.merchant_id,
  };
}

// ─── Register new workflow types in temporal-integration.ts ──────────────────
// These are added to the WorkflowType union via the temporal-integration extension below
export const JOURNEY_WORKFLOW_TYPES = [
  "MerchantOnboardingWorkflow",
  "TouristArrivalWorkflow",
  "WalletTopupWorkflow",
  "TouristPaymentWorkflow",
  "AiTripPlannerWorkflow",
  "GroupBookingWorkflow",
  "RefundWorkflow",
  "HighValueTransactionWorkflow",
  "SosAlertWorkflow",
  "BusinessTravelerWorkflow",
  "NightlifeJourneyWorkflow",
  "CulturalTourismWorkflow",
  "FashionWeekWorkflow",
  "SportsJourneyWorkflow",
  "FineDiningWorkflow",
  "LuxuryHotelWorkflow",
  "AiConciergeWorkflow",
  "MultiCurrencyStatementWorkflow",
  "PrivateChefWorkflow",
  "StablecoinConversionWorkflow",
] as const;

export type JourneyWorkflowType = typeof JOURNEY_WORKFLOW_TYPES[number];
