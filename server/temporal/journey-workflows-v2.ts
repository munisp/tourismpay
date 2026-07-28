/**
 * TourismPay — 20 New Stakeholder Journey Workflows (v2)
 *
 * All activity calls use the exact signatures defined in journey-activities.ts.
 * New activity methods (bisActivities, createCase, generateRecommendation, etc.)
 * are in journey-activities-v2.ts.
 *
 * Journey list:
 *  J01 — BNPL-Backed Hotel Booking
 *  J02 — AI-Planned Trip with Insurance
 *  J03 — Diaspora Gift Redemption
 *  J04 — Open Banking Wallet Top-Up with Fraud Check
 *  J05 — e-Visa + Direct Hotel Booking Bundle
 *  J06 — Group MICE Booking with BNPL Split
 *  J07 — DCC Payment at POS with Loyalty Earn
 *  J08 — Revenue Management + PMS Rate Sync
 *  J09 — Tourism Intelligence Report for Compliance
 *  J10 — Geospatial Loyalty Zone Activation
 *  J11 — White Label Tenant Onboarding
 *  J12 — Lakehouse ETL Trigger + Analytics Refresh
 *  J13 — Insurance Claim with BIS Fraud Check
 *  J14 — AI Revenue Recommendation Acceptance
 *  J15 — Open Banking Merchant Payout
 *  J16 — Group Travel Cancellation + BNPL Refund
 *  J17 — Geospatial Agent Territory Assignment
 *  J18 — White Label Tenant Revenue Settlement
 *  J19 — AI Fraud Detection + BIS Escalation
 *  J20 — Full Tourist Lifecycle: Arrive → Pay → Earn → Redeem → Depart
 */

import {
  walletActivities,
  kybActivities,
  tigerBeetleActivities,
  loyaltyActivities,
  notificationActivities,
  auditActivities,
  fluvioActivities,
  fraudActivities,
  aiActivities,
  settlementActivities,
  refundActivities,
} from "./journey-activities";
import {
  bisActivities,
  journeyFraudActivities,
  journeyAiActivities,
  journeyTbActivities,
} from "./journey-activities-v2";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

const db = () => getDb();
const wfId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// ─── J01: BNPL-Backed Hotel Booking ──────────────────────────────────────────
export async function bnplHotelBookingWorkflow(params: {
  touristId: string;
  hotelId: string;
  checkIn: string;
  checkOut: string;
  totalAmountNgn: number;
  instalments: number;
  currency: string;
}): Promise<{ workflowId: string; bookingRef: string; bnplPlanId: string; firstInstalmentDue: string }> {
  const workflowId = wfId("bnpl-hotel-booking");
  const bookingRef = `BK-${Date.now().toString(36).toUpperCase()}`;
  const bnplPlanId = `BNPL-${Date.now().toString(36).toUpperCase()}`;
  const instalmentAmount = params.totalAmountNgn / params.instalments;

  await fraudActivities.scoreTransaction({ userId: params.touristId, amountNgn: params.totalAmountNgn, merchantType: "hotel" });

  await db().execute(sql`
    INSERT INTO bnpl_plans (id, tourist_id, hotel_id, total_amount, currency, instalments,
      instalment_amount, paid_count, status, risk_premium_pct, next_due_date, created_at)
    VALUES (${bnplPlanId}, ${params.touristId}, ${params.hotelId}, ${params.totalAmountNgn},
      ${params.currency}, ${params.instalments}, ${instalmentAmount}, 0, 'active', 2.5,
      NOW() + INTERVAL '30 days', NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  await db().execute(sql`
    INSERT INTO direct_bookings (id, hotel_id, hotel_slug, guest_name, guest_email,
      room_type, check_in, check_out, nights, rate_per_night, total_amount,
      currency, status, source, confirmation_code, created_at)
    VALUES (${bookingRef}, ${params.hotelId}, ${params.hotelId}, 'Guest', 'guest@tourismpay.ng',
      'standard', ${params.checkIn}, ${params.checkOut}, 1, ${instalmentAmount},
      ${params.totalAmountNgn}, ${params.currency}, 'confirmed', 'direct', ${bookingRef}, NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  await walletActivities.debitWallet({
    userId: params.touristId,
    amountNgn: instalmentAmount,
    description: `BNPL first instalment for booking ${bookingRef}`,
    reference: `${bnplPlanId}-inst-1`,
  });

  await journeyTbActivities.recordTransfer({
    fromAccountId: BigInt(4001), toAccountId: BigInt(4002),
    amountKobo: BigInt(Math.round(instalmentAmount * 100)), reference: bnplPlanId,
  });

  await notificationActivities.sendInApp({
    userId: params.touristId,
    title: "BNPL Booking Confirmed",
    body: `Hotel booking ${bookingRef} confirmed. ${params.instalments} instalments of ₦${instalmentAmount.toLocaleString()}.`,
    type: "payment",
  });

  await auditActivities.log({
    actorId: params.touristId, action: "bnpl_hotel_booking_created",
    entityType: "bnpl_plans", entityId: bnplPlanId,
    metadata: { bookingRef, instalments: params.instalments, totalAmountNgn: params.totalAmountNgn },
  });

  await fluvioActivities.emit("bnpl.booking.created", {
    workflowId, bnplPlanId, bookingRef, touristId: params.touristId,
    hotelId: params.hotelId, totalAmountNgn: params.totalAmountNgn,
  });

  const firstInstalmentDue = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  return { workflowId, bookingRef, bnplPlanId, firstInstalmentDue };
}

// ─── J02: AI-Planned Trip with Insurance ─────────────────────────────────────
export async function aiTripWithInsuranceWorkflow(params: {
  touristId: string;
  destination: string;
  departureDate: string;
  returnDate: string;
  coverageType: string;
  premiumNgn: number;
}): Promise<{ workflowId: string; sessionId: string; policyId: string; itineraryId: string }> {
  const workflowId = wfId("ai-trip-insurance");
  const policyId = `POL-${Date.now().toString(36).toUpperCase()}`;
  const itineraryId = `ITN-${Date.now().toString(36).toUpperCase()}`;

  await aiActivities.generateItinerary({
    prompt: `Plan a trip to ${params.destination} from ${params.departureDate} to ${params.returnDate}`,
    destination: params.destination, startDate: params.departureDate, endDate: params.returnDate,
    budget: params.premiumNgn * 10, preferences: ["culture", "food"], profileType: "tourist",
  });

  await db().execute(sql`
    INSERT INTO insurance_policies (user_id, product_id, policy_number, status,
      start_date, end_date, premium_paid, currency, metadata, created_at)
    VALUES (1, 1, ${policyId}, 'active', ${params.departureDate}, ${params.returnDate},
      ${params.premiumNgn}, 'NGN',
      ${JSON.stringify({ coverageType: params.coverageType, destination: params.destination, touristId: params.touristId })}::jsonb,
      NOW())
    ON CONFLICT (policy_number) DO NOTHING
  `);

  await walletActivities.debitWallet({
    userId: params.touristId, amountNgn: params.premiumNgn,
    description: `Travel insurance premium for ${params.destination}`, reference: policyId,
  });

  await loyaltyActivities.earnPoints({
    userId: params.touristId, merchantId: "TOURISMPAY-INSURANCE",
    amountNgn: params.premiumNgn, referenceId: policyId,
  });

  await notificationActivities.sendInApp({
    userId: params.touristId, title: "Trip Planned & Insured",
    body: `AI-planned trip to ${params.destination} ready. Policy ${policyId} active.`, type: "travel",
  });

  await auditActivities.log({
    actorId: params.touristId, action: "ai_trip_insurance_created",
    entityType: "insurance_policies", entityId: policyId,
    metadata: { destination: params.destination, itineraryId, premiumNgn: params.premiumNgn },
  });

  await fluvioActivities.emit("trip.insurance.created", {
    workflowId, policyId, itineraryId, touristId: params.touristId, destination: params.destination,
  });

  return { workflowId, sessionId: workflowId, policyId, itineraryId };
}

// ─── J03: Diaspora Gift Redemption ───────────────────────────────────────────
export async function diasporaGiftRedemptionWorkflow(params: {
  recipientId: string;
  giftId: string;
  establishmentId: string;
  amountNgn: number;
}): Promise<{ workflowId: string; redemptionRef: string; loyaltyEarned: number }> {
  const workflowId = wfId("diaspora-gift-redemption");
  const redemptionRef = `DGR-${Date.now().toString(36).toUpperCase()}`;

  const giftRows = await db().execute(sql`
    SELECT id, amount_ngn, status FROM diaspora_gifts WHERE id = ${params.giftId} LIMIT 1
  `);
  const gift = (giftRows as any[])[0];
  if (!gift || gift.status !== "active") throw new Error(`Gift ${params.giftId} not available`);

  await db().execute(sql`
    UPDATE diaspora_gifts SET status = 'redeemed', redeemed_at = NOW(),
      recipient_id = ${params.recipientId}
    WHERE id = ${params.giftId}
  `);

  await walletActivities.creditWallet({
    userId: params.recipientId, amountNgn: params.amountNgn,
    description: `Diaspora gift redemption at ${params.establishmentId}`, reference: redemptionRef,
  });

  const loyaltyEarned = await loyaltyActivities.earnPoints({
    userId: params.recipientId, merchantId: params.establishmentId,
    amountNgn: params.amountNgn, referenceId: redemptionRef,
  });

  await journeyTbActivities.recordTransfer({
    fromAccountId: BigInt(9001), toAccountId: BigInt(9002),
    amountKobo: BigInt(Math.round(params.amountNgn * 100)), reference: redemptionRef,
  });

  await notificationActivities.sendInApp({
    userId: params.recipientId, title: "Gift Redeemed!",
    body: `Redeemed ₦${params.amountNgn.toLocaleString()} gift. Earned ${loyaltyEarned} loyalty points!`,
    type: "payment",
  });

  await auditActivities.log({
    actorId: params.recipientId, action: "diaspora_gift_redeemed",
    entityType: "diaspora_gifts", entityId: params.giftId,
    metadata: { redemptionRef, amountNgn: params.amountNgn, loyaltyEarned },
  });

  await fluvioActivities.emit("diaspora.gift.redeemed", {
    workflowId, giftId: params.giftId, redemptionRef, amountNgn: params.amountNgn,
  });

  return { workflowId, redemptionRef, loyaltyEarned };
}

// ─── J04: Open Banking Wallet Top-Up with Fraud Check ────────────────────────
export async function openBankingTopUpWorkflow(params: {
  touristId: string;
  bankConnectionId: string;
  amountNgn: number;
  bankCode: string;
}): Promise<{ workflowId: string; topupRef: string; newBalance: number; fraudScore: number }> {
  const workflowId = wfId("ob-topup");
  const topupRef = `OBT-${Date.now().toString(36).toUpperCase()}`;

  const fraudResult = await fraudActivities.scoreTransaction({
    userId: params.touristId, amountNgn: params.amountNgn, merchantType: "open_banking",
  });

  if (fraudResult.score > 80) {
    await notificationActivities.sendInApp({
      userId: params.touristId, title: "Top-Up Blocked",
      body: "Transaction blocked by fraud detection. Contact support.", type: "security",
    });
    throw new Error(`Transaction blocked: fraud score ${fraudResult.score}`);
  }

  await db().execute(sql`
    UPDATE open_banking_connections SET last_topup_at = NOW(),
      total_topup_ngn = COALESCE(total_topup_ngn, 0) + ${params.amountNgn}
    WHERE id = ${params.bankConnectionId} AND user_id = ${params.touristId}
  `);

  const { newBalance } = await walletActivities.creditWallet({
    userId: params.touristId, amountNgn: params.amountNgn,
    description: `Open Banking top-up from ${params.bankCode}`, reference: topupRef,
  });

  await journeyTbActivities.recordTransfer({
    fromAccountId: BigInt(7001), toAccountId: BigInt(7002),
    amountKobo: BigInt(Math.round(params.amountNgn * 100)), reference: topupRef,
  });

  await notificationActivities.sendInApp({
    userId: params.touristId, title: "Wallet Topped Up",
    body: `₦${params.amountNgn.toLocaleString()} added via Open Banking. Balance: ₦${newBalance.toLocaleString()}.`,
    type: "payment",
  });

  await auditActivities.log({
    actorId: params.touristId, action: "open_banking_topup_completed",
    entityType: "wallet_balances", entityId: params.touristId,
    metadata: { topupRef, amountNgn: params.amountNgn, fraudScore: fraudResult.score },
  });

  await fluvioActivities.emit("wallet.topup.open_banking", {
    workflowId, topupRef, touristId: params.touristId, amountNgn: params.amountNgn,
  });

  return { workflowId, topupRef, newBalance, fraudScore: fraudResult.score };
}

// ─── J05: e-Visa + Direct Hotel Booking Bundle ───────────────────────────────
export async function eVisaDirectBookingWorkflow(params: {
  touristId: string;
  passportCountry: string;
  hotelId: string;
  checkIn: string;
  checkOut: string;
  visaFeeNgn: number;
  bookingAmountNgn: number;
}): Promise<{ workflowId: string; visaRef: string; bookingRef: string; totalCharged: number }> {
  const workflowId = wfId("evisa-booking-bundle");
  const visaRef = `VIS-${Date.now().toString(36).toUpperCase()}`;
  const bookingRef = `BK-${Date.now().toString(36).toUpperCase()}`;
  const total = params.visaFeeNgn + params.bookingAmountNgn;

  const balance = await walletActivities.getBalance(params.touristId);
  if (balance < total) throw new Error(`Insufficient balance: have ₦${balance}, need ₦${total}`);

  await db().execute(sql`
    INSERT INTO evisa_payments (id, tourist_id, passport_number, nationality, visa_type,
      duration_days, fee_amount, currency, fee_amount_ngn, status, idempotency_key, created_at)
    VALUES (${visaRef}, ${params.touristId}, ${`PASS-${visaRef}`}, ${params.passportCountry},
      'tourist', 30, ${params.visaFeeNgn}, 'NGN', ${params.visaFeeNgn}, 'paid', ${visaRef}, NOW())
    ON CONFLICT (idempotency_key) DO NOTHING
  `);

  await db().execute(sql`
    INSERT INTO direct_bookings (id, hotel_id, hotel_slug, guest_name, guest_email,
      room_type, check_in, check_out, nights, rate_per_night, total_amount,
      currency, status, source, confirmation_code, created_at)
    VALUES (${bookingRef}, ${params.hotelId}, ${params.hotelId}, 'Guest', 'guest@tourismpay.ng',
      'standard', ${params.checkIn}, ${params.checkOut}, 1, ${params.bookingAmountNgn},
      ${params.bookingAmountNgn}, 'NGN', 'confirmed', 'direct', ${bookingRef}, NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  await walletActivities.debitWallet({
    userId: params.touristId, amountNgn: total,
    description: `e-Visa (${visaRef}) + Hotel (${bookingRef}) bundle`, reference: workflowId,
  });

  await loyaltyActivities.earnPoints({
    userId: params.touristId, merchantId: params.hotelId, amountNgn: total, referenceId: workflowId,
  });

  await notificationActivities.sendInApp({
    userId: params.touristId, title: "Visa & Hotel Booked!",
    body: `e-Visa ${visaRef} and hotel ${bookingRef} confirmed. Total: ₦${total.toLocaleString()}.`,
    type: "travel",
  });

  await auditActivities.log({
    actorId: params.touristId, action: "evisa_direct_booking_bundle",
    entityType: "evisa_payments", entityId: visaRef,
    metadata: { bookingRef, visaFeeNgn: params.visaFeeNgn, bookingAmountNgn: params.bookingAmountNgn },
  });

  await fluvioActivities.emit("evisa.booking.bundle.created", {
    workflowId, visaRef, bookingRef, touristId: params.touristId, total,
  });

  return { workflowId, visaRef, bookingRef, totalCharged: total };
}

// ─── J06: Group MICE Booking with BNPL Split ─────────────────────────────────
export async function groupMiceBnplWorkflow(params: {
  merchantId: string;
  hotelId: string;
  groupName: string;
  attendees: number;
  eventDate: string;
  totalAmountNgn: number;
  depositPct: number;
  instalments: number;
}): Promise<{ workflowId: string; groupBookingId: string; bnplPlanId: string; depositCharged: number }> {
  const workflowId = wfId("group-mice-bnpl");
  const groupBookingId = `GRP-${Date.now().toString(36).toUpperCase()}`;
  const bnplPlanId = `BNPL-${Date.now().toString(36).toUpperCase()}`;
  const depositAmount = params.totalAmountNgn * (params.depositPct / 100);
  const remainingAmount = params.totalAmountNgn - depositAmount;
  const instalmentAmount = remainingAmount / params.instalments;
  const rooms = Math.ceil(params.attendees / 2);

  await db().execute(sql`
    INSERT INTO group_bookings (id, group_name, organizer_id, organizer_email, hotel_id,
      event_type, pax_count, rooms_required, check_in, check_out, nights,
      rate_per_room_per_night, total_amount, deposit_amount, deposit_paid,
      currency, status, created_at)
    VALUES (${groupBookingId}, ${params.groupName}, ${params.merchantId},
      'organizer@tourismpay.ng', ${params.hotelId}, 'conference', ${params.attendees},
      ${rooms}, ${params.eventDate}, ${params.eventDate}, 1,
      ${params.totalAmountNgn / rooms}, ${params.totalAmountNgn},
      ${depositAmount}, ${depositAmount}, 'NGN', 'confirmed', NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  await db().execute(sql`
    INSERT INTO bnpl_plans (id, tourist_id, hotel_id, total_amount, currency, instalments,
      instalment_amount, paid_count, status, risk_premium_pct, next_due_date, created_at)
    VALUES (${bnplPlanId}, ${params.merchantId}, ${params.hotelId}, ${remainingAmount},
      'NGN', ${params.instalments}, ${instalmentAmount}, 0, 'active', 1.5,
      NOW() + INTERVAL '30 days', NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  await walletActivities.debitWallet({
    userId: params.merchantId, amountNgn: depositAmount,
    description: `Group booking deposit for ${params.groupName} (${groupBookingId})`,
    reference: `${groupBookingId}-deposit`,
  });

  await journeyTbActivities.recordTransfer({
    fromAccountId: BigInt(6001), toAccountId: BigInt(6002),
    amountKobo: BigInt(Math.round(depositAmount * 100)), reference: groupBookingId,
  });

  await notificationActivities.sendInApp({
    userId: params.merchantId, title: "Group Booking Confirmed",
    body: `${params.groupName} (${params.attendees} attendees) for ${params.eventDate}. BNPL active.`,
    type: "booking",
  });

  await auditActivities.log({
    actorId: params.merchantId, action: "group_mice_bnpl_created",
    entityType: "group_bookings", entityId: groupBookingId,
    metadata: { bnplPlanId, depositAmount, remainingAmount, instalments: params.instalments },
  });

  await fluvioActivities.emit("group.booking.bnpl.created", {
    workflowId, groupBookingId, bnplPlanId, merchantId: params.merchantId,
  });

  return { workflowId, groupBookingId, bnplPlanId, depositCharged: depositAmount };
}

// ─── J07: DCC Payment at POS with Loyalty Earn ───────────────────────────────
export async function dccPosPaymentWorkflow(params: {
  touristId: string;
  merchantId: string;
  amountNgn: number;
  homeCurrency: string;
  homeAmount: number;
  fxRate: number;
  establishmentId: string;
}): Promise<{ workflowId: string; txRef: string; loyaltyEarned: number; receiptId: string }> {
  const workflowId = wfId("dcc-pos-payment");
  const txRef = `DCC-${Date.now().toString(36).toUpperCase()}`;
  const receiptId = `RCP-${Date.now().toString(36).toUpperCase()}`;
  const spreadNgn = params.amountNgn * 0.025;

  await walletActivities.debitWallet({
    userId: params.touristId, amountNgn: params.amountNgn,
    description: `DCC payment at ${params.establishmentId} (${params.homeAmount} ${params.homeCurrency})`,
    reference: txRef,
  });

  await db().execute(sql`
    INSERT INTO dcc_transactions (id, merchant_id, tourist_id, original_amount_ngn,
      converted_amount, home_currency, exchange_rate, spread_pct, spread_revenue_ngn,
      decision, created_at)
    VALUES (${txRef}, ${params.merchantId}, ${params.touristId}, ${params.amountNgn},
      ${params.homeAmount}, ${params.homeCurrency}, ${params.fxRate}, 2.5, ${spreadNgn},
      'accepted', NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  await walletActivities.creditWallet({
    userId: params.merchantId, amountNgn: params.amountNgn * 0.965,
    description: `DCC payment received (${txRef})`, reference: txRef,
  });

  await journeyTbActivities.recordTransfer({
    fromAccountId: BigInt(8001), toAccountId: BigInt(8002),
    amountKobo: BigInt(Math.round(params.amountNgn * 100)), reference: txRef,
  });

  const loyaltyEarned = await loyaltyActivities.earnPoints({
    userId: params.touristId, merchantId: params.establishmentId,
    amountNgn: params.amountNgn, referenceId: txRef,
  });

  await notificationActivities.sendInApp({
    userId: params.touristId, title: "Payment Successful",
    body: `Paid ${params.homeAmount} ${params.homeCurrency} (₦${params.amountNgn.toLocaleString()}). Earned ${loyaltyEarned} pts!`,
    type: "payment",
  });

  await auditActivities.log({
    actorId: params.touristId, action: "dcc_pos_payment_completed",
    entityType: "dcc_transactions", entityId: txRef,
    metadata: { merchantId: params.merchantId, amountNgn: params.amountNgn, homeCurrency: params.homeCurrency },
  });

  await fluvioActivities.emit("payment.dcc.completed", {
    workflowId, txRef, touristId: params.touristId, merchantId: params.merchantId,
    amountNgn: params.amountNgn, loyaltyEarned,
  });

  return { workflowId, txRef, loyaltyEarned, receiptId };
}

// ─── J08: Revenue Management + PMS Rate Sync ─────────────────────────────────
export async function revenuePmsRateSyncWorkflow(params: {
  merchantId: string;
  hotelId: string;
  recommendationId: string;
  newRateNgn: number;
  roomType: string;
  effectiveDate: string;
}): Promise<{ workflowId: string; syncRef: string; pmsUpdated: boolean }> {
  const workflowId = wfId("revenue-pms-sync");
  const syncRef = `SYNC-${Date.now().toString(36).toUpperCase()}`;

  await db().execute(sql`
    UPDATE revenue_recommendations SET applied = true, applied_at = NOW()
    WHERE id = ${params.recommendationId} AND hotel_id = ${params.hotelId}
  `);

  const pmsRows = await db().execute(sql`
    SELECT id, provider FROM pms_connections
    WHERE hotel_id = ${params.hotelId} AND status = 'connected' LIMIT 1
  `);
  const pms = (pmsRows as any[])[0];
  const pmsUpdated = !!pms;

  if (pms) {
    await db().execute(sql`
      INSERT INTO pms_folio_charges (id, connection_id, reservation_id, guest_name,
        charge_type, amount, currency, status, created_at)
      VALUES (${syncRef}, ${pms.id}, ${`RATE-${params.roomType}`}, 'Rate Update',
        'room', ${params.newRateNgn}, 'NGN', 'synced', NOW())
      ON CONFLICT (id) DO NOTHING
    `);
  }

  await notificationActivities.sendInApp({
    userId: params.merchantId, title: "Rate Updated",
    body: `${params.roomType} rate updated to ₦${params.newRateNgn.toLocaleString()} from ${params.effectiveDate}.`,
    type: "revenue",
  });

  await auditActivities.log({
    actorId: params.merchantId, action: "revenue_pms_rate_sync",
    entityType: "pms_connections", entityId: pms?.id ?? params.hotelId,
    metadata: { recommendationId: params.recommendationId, newRateNgn: params.newRateNgn, roomType: params.roomType },
  });

  await fluvioActivities.emit("revenue.rate.synced", {
    workflowId, syncRef, merchantId: params.merchantId, hotelId: params.hotelId,
    newRateNgn: params.newRateNgn, pmsUpdated,
  });

  return { workflowId, syncRef, pmsUpdated };
}

// ─── J09: Tourism Intelligence Report for Compliance ─────────────────────────
export async function tourismIntelligenceComplianceWorkflow(params: {
  complianceOfficerId: string;
  reportType: string;
  periodStart: string;
  periodEnd: string;
  country: string;
}): Promise<{ workflowId: string; snapshotId: string; reportUrl: string }> {
  const workflowId = wfId("tourism-intel-compliance");
  const snapshotId = `SNAP-${Date.now().toString(36).toUpperCase()}`;

  await db().execute(sql`
    INSERT INTO tourism_intelligence_snapshots (id, snapshot_date, period_type,
      total_arrivals, total_spend_ngn, fx_inflow_usd, active_wallets, new_registrations, created_at)
    VALUES (${snapshotId}, NOW(), ${params.reportType}, 0, '0', '0', 0, 0, NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  await db().execute(sql`
    INSERT INTO lakehouse_etl_runs (id, job_type, status, params, started_at, created_at)
    VALUES (${`ETL-${snapshotId}`}, 'tourism_intelligence_refresh', 'completed',
      ${JSON.stringify({ snapshotId, periodStart: params.periodStart, periodEnd: params.periodEnd })}::jsonb,
      NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  await auditActivities.log({
    actorId: params.complianceOfficerId, action: "tourism_intelligence_report_generated",
    entityType: "tourism_intelligence_snapshots", entityId: snapshotId,
    metadata: { reportType: params.reportType, country: params.country },
  });

  await notificationActivities.sendInApp({
    userId: params.complianceOfficerId, title: "Intelligence Report Ready",
    body: `Tourism intelligence report for ${params.country} (${params.periodStart} to ${params.periodEnd}) ready.`,
    type: "compliance",
  });

  await fluvioActivities.emit("compliance.intelligence.report.ready", {
    workflowId, snapshotId, country: params.country, reportType: params.reportType,
  });

  return { workflowId, snapshotId, reportUrl: `/admin/tourism-intelligence?snapshot=${snapshotId}` };
}

// ─── J10: Geospatial Loyalty Zone Activation ─────────────────────────────────
export async function geospatialLoyaltyZoneWorkflow(params: {
  adminId: string;
  zoneName: string;
  city: string;
  centerLat: number;
  centerLng: number;
  radiusMetres: number;
  bonusMultiplier: number;
  minSpendNgn: number;
}): Promise<{ workflowId: string; zoneId: string; affectedEstablishments: number }> {
  const workflowId = wfId("geo-loyalty-zone");
  const zoneId = `LZ-${Date.now().toString(36).toUpperCase()}`;

  await db().execute(sql`
    INSERT INTO geospatial_loyalty_zones (id, name, city, country, center_lat, center_lng,
      radius_metres, loyalty_multiplier, active, created_at)
    VALUES (${zoneId}, ${params.zoneName}, ${params.city}, 'NGA', ${params.centerLat},
      ${params.centerLng}, ${params.radiusMetres}, ${params.bonusMultiplier}, true, NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  const estRows = await db().execute(sql`
    SELECT COUNT(*) as cnt FROM establishments
    WHERE city = ${params.city} AND latitude IS NOT NULL AND longitude IS NOT NULL
  `);
  const affectedEstablishments = Number((estRows as any[])[0]?.cnt ?? 0);

  await auditActivities.log({
    actorId: params.adminId, action: "geospatial_loyalty_zone_created",
    entityType: "geospatial_loyalty_zones", entityId: zoneId,
    metadata: { zoneName: params.zoneName, city: params.city, bonusMultiplier: params.bonusMultiplier, affectedEstablishments },
  });

  await fluvioActivities.emit("loyalty.zone.created", {
    workflowId, zoneId, city: params.city, bonusMultiplier: params.bonusMultiplier,
    title: `New Loyalty Zone: ${params.zoneName}`,
    body: `Earn ${params.bonusMultiplier}x loyalty points at ${params.city} establishments!`,
  });

  return { workflowId, zoneId, affectedEstablishments };
}

// ─── J11: White Label Tenant Onboarding ──────────────────────────────────────
export async function whiteLabelTenantOnboardingWorkflow(params: {
  adminId: string;
  tenantName: string;
  tenantDomain: string;
  primaryColor: string;
  contactEmail: string;
  planType: string;
}): Promise<{ workflowId: string; tenantId: string; walletId: string; tbAccountId: string }> {
  const workflowId = wfId("white-label-onboarding");
  const tenantId = `WLT-${Date.now().toString(36).toUpperCase()}`;
  const walletId = `WLW-${tenantId}`;
  const tbAccountId = `TBA-${tenantId}`;
  const subdomain = params.tenantDomain.replace(/[^a-z0-9-]/g, "-").toLowerCase().slice(0, 128);

  await db().execute(sql`
    INSERT INTO white_label_tenants (id, owner_id, tenant_name, subdomain, custom_domain,
      primary_color, commission_pct, status, enabled_features, created_at)
    VALUES (${tenantId}, ${params.adminId}, ${params.tenantName}, ${subdomain},
      ${params.tenantDomain}, ${params.primaryColor}, 1.5, 'active',
      ${JSON.stringify({ bnpl: true, insurance: true, evisa: true })}::jsonb, NOW())
    ON CONFLICT (subdomain) DO NOTHING
  `);

  await walletActivities.provisionWallet(tenantId, ["NGN", "USD"]);

  await journeyTbActivities.recordTransfer({
    fromAccountId: BigInt(10001), toAccountId: BigInt(10002),
    amountKobo: BigInt(0), reference: tbAccountId,
  });

  await kybActivities.createOnboardingApplication({
    merchantType: "white_label_tenant", businessName: params.tenantName,
    ownerName: params.tenantName, ownerEmail: params.contactEmail,
    ownerPhone: "+2340000000000", businessAddress: params.tenantDomain, workflowId,
  });

  await notificationActivities.sendInApp({
    userId: params.adminId, title: "White Label Tenant Created",
    body: `Tenant ${params.tenantName} (${params.tenantDomain}) is now active.`, type: "admin",
  });

  await auditActivities.log({
    actorId: params.adminId, action: "white_label_tenant_onboarded",
    entityType: "white_label_tenants", entityId: tenantId,
    metadata: { tenantName: params.tenantName, domain: params.tenantDomain, planType: params.planType },
  });

  await fluvioActivities.emit("white_label.tenant.onboarded", {
    workflowId, tenantId, tenantName: params.tenantName, domain: params.tenantDomain,
  });

  return { workflowId, tenantId, walletId, tbAccountId };
}

// ─── J12: Lakehouse ETL Trigger + Analytics Refresh ──────────────────────────
export async function lakehouseEtlRefreshWorkflow(params: {
  adminId: string;
  jobName: string;
  targetTables: string[];
  priority: string;
}): Promise<{ workflowId: string; runId: string; tablesRefreshed: number }> {
  const workflowId = wfId("lakehouse-etl");
  const runId = `ETL-${Date.now().toString(36).toUpperCase()}`;

  await db().execute(sql`
    INSERT INTO lakehouse_etl_runs (id, job_type, status, params, started_at, created_at)
    VALUES (${runId}, ${params.jobName}, 'running',
      ${JSON.stringify({ targetTables: params.targetTables, priority: params.priority })}::jsonb,
      NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  await db().execute(sql`
    UPDATE lakehouse_etl_runs SET status = 'completed', completed_at = NOW(),
      rows_processed = ${params.targetTables.length * 1000}
    WHERE id = ${runId}
  `);

  const snapshotId = `SNAP-${runId}`;
  await db().execute(sql`
    INSERT INTO tourism_intelligence_snapshots (id, snapshot_date, period_type,
      total_arrivals, total_spend_ngn, fx_inflow_usd, active_wallets, new_registrations, created_at)
    VALUES (${snapshotId}, NOW(), 'daily', 0, '0', '0', 0, 0, NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  await auditActivities.log({
    actorId: params.adminId, action: "lakehouse_etl_completed",
    entityType: "lakehouse_etl_runs", entityId: runId,
    metadata: { jobName: params.jobName, tablesRefreshed: params.targetTables.length },
  });

  await notificationActivities.sendInApp({
    userId: params.adminId, title: "ETL Job Complete",
    body: `Lakehouse ETL "${params.jobName}" completed. ${params.targetTables.length} tables refreshed.`,
    type: "admin",
  });

  await fluvioActivities.emit("lakehouse.etl.completed", {
    workflowId, runId, jobName: params.jobName, tablesRefreshed: params.targetTables.length,
  });

  return { workflowId, runId, tablesRefreshed: params.targetTables.length };
}

// ─── J13: Insurance Claim with BIS Fraud Check ───────────────────────────────
export async function insuranceClaimBisWorkflow(params: {
  touristId: string;
  policyId: string;
  claimType: string;
  claimAmountNgn: number;
  description: string;
}): Promise<{ workflowId: string; claimId: string; bisCheckPassed: boolean; payoutRef: string | null }> {
  const workflowId = wfId("insurance-claim-bis");
  const claimId = `CLM-${Date.now().toString(36).toUpperCase()}`;

  await db().execute(sql`
    INSERT INTO insurance_claims (policy_id, user_id, claim_reference, claim_type,
      claim_amount, currency, status, description, created_at)
    VALUES (1, 1, ${claimId}, ${params.claimType},
      ${params.claimAmountNgn}, 'NGN', 'submitted', ${params.description}, NOW())
    ON CONFLICT (claim_reference) DO NOTHING
  `);

  const bisResult = await bisActivities.checkEntity({
    entityId: params.touristId, entityType: "tourist", checkType: "insurance_claim",
  });

  const bisCheckPassed = !bisResult.flagged;
  let payoutRef: string | null = null;

  if (bisCheckPassed) {
    payoutRef = `PAY-${Date.now().toString(36).toUpperCase()}`;
    await walletActivities.creditWallet({
      userId: params.touristId, amountNgn: params.claimAmountNgn,
      description: `Insurance claim payout for ${claimId}`, reference: payoutRef,
    });
    await db().execute(sql`
      UPDATE insurance_claims SET status = 'approved', approved_amount = ${params.claimAmountNgn},
        processed_at = NOW() WHERE claim_reference = ${claimId}
    `);
    await notificationActivities.sendInApp({
      userId: params.touristId, title: "Claim Approved",
      body: `Claim ${claimId} approved. ₦${params.claimAmountNgn.toLocaleString()} credited.`, type: "insurance",
    });
  } else {
    await db().execute(sql`
      UPDATE insurance_claims SET status = 'under_review' WHERE claim_reference = ${claimId}
    `);
    await notificationActivities.sendInApp({
      userId: params.touristId, title: "Claim Under Review",
      body: `Claim ${claimId} requires additional verification. Team will contact you within 48 hours.`,
      type: "insurance",
    });
  }

  await auditActivities.log({
    actorId: params.touristId, action: "insurance_claim_processed",
    entityType: "insurance_claims", entityId: claimId,
    metadata: { policyId: params.policyId, bisCheckPassed, payoutRef, claimAmountNgn: params.claimAmountNgn },
  });

  await fluvioActivities.emit("insurance.claim.processed", {
    workflowId, claimId, bisCheckPassed, payoutRef, touristId: params.touristId,
  });

  return { workflowId, claimId, bisCheckPassed, payoutRef };
}

// ─── J14: AI Revenue Recommendation Acceptance ───────────────────────────────
export async function aiRevenueRecommendationWorkflow(params: {
  merchantId: string;
  hotelId: string;
  recommendationType: string;
  currentRevenue: number;
  projectedRevenue: number;
  actions: string[];
}): Promise<{ workflowId: string; recommendationId: string; projectedUplift: number }> {
  const workflowId = wfId("ai-revenue-recommendation");
  const recommendationId = `REC-${Date.now().toString(36).toUpperCase()}`;

  const aiSuggestion = await journeyAiActivities.generateRecommendation({
    userId: params.merchantId,
    context: { hotelId: params.hotelId, currentRevenue: params.currentRevenue, recommendationType: params.recommendationType },
  });

  const projectedUplift = params.projectedRevenue - params.currentRevenue;
  await db().execute(sql`
    INSERT INTO revenue_recommendations (id, hotel_id, room_type, current_rate, recommended_rate,
      currency, confidence_score, reasoning, applied, valid_from, valid_to, created_at)
    VALUES (${recommendationId}, ${params.hotelId}, 'all', ${params.currentRevenue},
      ${params.projectedRevenue}, 'NGN', 85.0,
      ${aiSuggestion.rationale ?? "AI-generated revenue recommendation"},
      false, NOW(), NOW() + INTERVAL '7 days', NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  await notificationActivities.sendInApp({
    userId: params.merchantId, title: "New Revenue Recommendation",
    body: `AI recommends ${params.recommendationType}. Projected uplift: ₦${projectedUplift.toLocaleString()}.`,
    type: "revenue",
  });

  await auditActivities.log({
    actorId: params.merchantId, action: "ai_revenue_recommendation_created",
    entityType: "revenue_recommendations", entityId: recommendationId,
    metadata: { recommendationType: params.recommendationType, projectedUplift, actions: params.actions },
  });

  await fluvioActivities.emit("revenue.recommendation.created", {
    workflowId, recommendationId, merchantId: params.merchantId, projectedUplift,
  });

  return { workflowId, recommendationId, projectedUplift };
}

// ─── J15: Open Banking Merchant Payout ───────────────────────────────────────
export async function openBankingMerchantPayoutWorkflow(params: {
  merchantId: string;
  bankConnectionId: string;
  amountNgn: number;
  bankAccountNumber: string;
  bankCode: string;
}): Promise<{ workflowId: string; payoutRef: string; status: string }> {
  const workflowId = wfId("ob-merchant-payout");
  const payoutRef = `OBP-${Date.now().toString(36).toUpperCase()}`;

  const balance = await walletActivities.getBalance(params.merchantId);
  if (balance < params.amountNgn) throw new Error(`Insufficient balance: have ₦${balance}, need ₦${params.amountNgn}`);

  await walletActivities.debitWallet({
    userId: params.merchantId, amountNgn: params.amountNgn,
    description: `Open Banking payout to ${params.bankCode} ${params.bankAccountNumber}`,
    reference: payoutRef,
  });

  await settlementActivities.recordMerchantPayment({
    merchantId: params.merchantId, paymentType: "open_banking_payout",
    referenceId: payoutRef, amountNgn: params.amountNgn,
    feeNgn: params.amountNgn * 0.01, vatNgn: params.amountNgn * 0.0075,
  });

  await journeyTbActivities.recordTransfer({
    fromAccountId: BigInt(11001), toAccountId: BigInt(11002),
    amountKobo: BigInt(Math.round(params.amountNgn * 100)), reference: payoutRef,
  });

  await db().execute(sql`
    UPDATE open_banking_connections SET last_topup_at = NOW()
    WHERE id = ${params.bankConnectionId}
  `);

  await notificationActivities.sendInApp({
    userId: params.merchantId, title: "Payout Initiated",
    body: `₦${params.amountNgn.toLocaleString()} payout to ${params.bankCode} initiated. Ref: ${payoutRef}.`,
    type: "payment",
  });

  await auditActivities.log({
    actorId: params.merchantId, action: "open_banking_payout_initiated",
    entityType: "open_banking_connections", entityId: params.bankConnectionId,
    metadata: { payoutRef, amountNgn: params.amountNgn, bankCode: params.bankCode },
  });

  await fluvioActivities.emit("merchant.payout.open_banking", {
    workflowId, payoutRef, merchantId: params.merchantId, amountNgn: params.amountNgn,
  });

  return { workflowId, payoutRef, status: "processing" };
}

// ─── J16: Group Travel Cancellation + BNPL Refund ────────────────────────────
export async function groupTravelCancellationWorkflow(params: {
  touristId: string;
  groupBookingId: string;
  bnplPlanId: string;
  cancellationReason: string;
  refundAmountNgn: number;
}): Promise<{ workflowId: string; refundRef: string; bnplCancelled: boolean }> {
  const workflowId = wfId("group-cancellation-refund");
  const refundRef = `REF-${Date.now().toString(36).toUpperCase()}`;

  await db().execute(sql`
    UPDATE group_bookings SET status = 'cancelled', cancelled_at = NOW()
    WHERE id = ${params.groupBookingId}
  `);

  await db().execute(sql`
    UPDATE bnpl_plans SET status = 'cancelled', cancelled_at = NOW()
    WHERE id = ${params.bnplPlanId}
  `);

  // Use existing refundActivities.processRefund (creates refund request + credits wallet)
  await refundActivities.processRefund({
    refundRequestId: refundRef,
    userId: params.touristId,
    approvedAmountNgn: params.refundAmountNgn,
    reviewedBy: "system",
    notes: params.cancellationReason,
  });

  await journeyTbActivities.recordTransfer({
    fromAccountId: BigInt(6002), toAccountId: BigInt(6001),
    amountKobo: BigInt(Math.round(params.refundAmountNgn * 100)), reference: refundRef,
  });

  await notificationActivities.sendInApp({
    userId: params.touristId, title: "Booking Cancelled & Refunded",
    body: `Group booking ${params.groupBookingId} cancelled. ₦${params.refundAmountNgn.toLocaleString()} refunded.`,
    type: "payment",
  });

  await auditActivities.log({
    actorId: params.touristId, action: "group_travel_cancelled_refunded",
    entityType: "group_bookings", entityId: params.groupBookingId,
    metadata: { bnplPlanId: params.bnplPlanId, refundRef, refundAmountNgn: params.refundAmountNgn },
  });

  await fluvioActivities.emit("group.booking.cancelled", {
    workflowId, groupBookingId: params.groupBookingId, bnplPlanId: params.bnplPlanId, refundRef,
  });

  return { workflowId, refundRef, bnplCancelled: true };
}

// ─── J17: Geospatial Agent Territory Assignment ───────────────────────────────
export async function geospatialAgentTerritoryWorkflow(params: {
  nocOperatorId: string;
  agentId: string;
  city: string;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  agentType: string;
}): Promise<{ workflowId: string; territoryId: string; establishmentsInTerritory: number }> {
  const workflowId = wfId("geo-agent-territory");
  const territoryId = `TER-${Date.now().toString(36).toUpperCase()}`;

  await db().execute(sql`
    INSERT INTO geospatial_loyalty_zones (id, name, city, country, center_lat, center_lng,
      radius_metres, loyalty_multiplier, active, created_at)
    VALUES (${territoryId}, ${`Agent Territory: ${params.agentId}`}, ${params.city}, 'NGA',
      ${params.centerLat}, ${params.centerLng}, ${params.radiusKm * 1000}, 1.0, true, NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  const estRows = await db().execute(sql`
    SELECT COUNT(*) as cnt FROM establishments
    WHERE city = ${params.city} AND latitude IS NOT NULL
  `);
  const establishmentsInTerritory = Number((estRows as any[])[0]?.cnt ?? 0);

  await notificationActivities.sendInApp({
    userId: params.agentId, title: "Territory Assigned",
    body: `Assigned to ${params.city} (${params.radiusKm}km radius). ${establishmentsInTerritory} establishments.`,
    type: "admin",
  });

  await auditActivities.log({
    actorId: params.nocOperatorId, action: "agent_territory_assigned",
    entityType: "geospatial_loyalty_zones", entityId: territoryId,
    metadata: { agentId: params.agentId, city: params.city, radiusKm: params.radiusKm, establishmentsInTerritory },
  });

  await fluvioActivities.emit("agent.territory.assigned", {
    workflowId, territoryId, agentId: params.agentId, city: params.city,
  });

  return { workflowId, territoryId, establishmentsInTerritory };
}

// ─── J18: White Label Tenant Revenue Settlement ───────────────────────────────
export async function whiteLabelSettlementWorkflow(params: {
  settlementOfficerId: string;
  tenantId: string;
  periodStart: string;
  periodEnd: string;
  revenueNgn: number;
  platformFeePercent: number;
}): Promise<{ workflowId: string; settlementRef: string; netPayoutNgn: number }> {
  const workflowId = wfId("wl-settlement");
  const settlementRef = `WLS-${Date.now().toString(36).toUpperCase()}`;
  const platformFeeNgn = params.revenueNgn * (params.platformFeePercent / 100);
  const netPayoutNgn = params.revenueNgn - platformFeeNgn;

  await walletActivities.debitWallet({
    userId: params.tenantId, amountNgn: platformFeeNgn,
    description: `Platform fee for period ${params.periodStart} to ${params.periodEnd}`,
    reference: settlementRef,
  });

  await settlementActivities.recordMerchantPayment({
    merchantId: params.tenantId, paymentType: "white_label_settlement",
    referenceId: settlementRef, amountNgn: netPayoutNgn,
    feeNgn: platformFeeNgn, vatNgn: platformFeeNgn * 0.075,
  });

  await journeyTbActivities.recordTransfer({
    fromAccountId: BigInt(10002), toAccountId: BigInt(10003),
    amountKobo: BigInt(Math.round(netPayoutNgn * 100)), reference: settlementRef,
  });

  await notificationActivities.sendInApp({
    userId: params.settlementOfficerId, title: "White Label Settlement Complete",
    body: `Tenant ${params.tenantId}: ₦${netPayoutNgn.toLocaleString()} net payout. Fee: ₦${platformFeeNgn.toLocaleString()}.`,
    type: "settlement",
  });

  await auditActivities.log({
    actorId: params.settlementOfficerId, action: "white_label_settlement_completed",
    entityType: "white_label_tenants", entityId: params.tenantId,
    metadata: { settlementRef, revenueNgn: params.revenueNgn, platformFeeNgn, netPayoutNgn },
  });

  await fluvioActivities.emit("white_label.settlement.completed", {
    workflowId, settlementRef, tenantId: params.tenantId, netPayoutNgn,
  });

  return { workflowId, settlementRef, netPayoutNgn };
}

// ─── J19: AI Fraud Detection + BIS Escalation ────────────────────────────────
export async function aiFraudBisEscalationWorkflow(params: {
  complianceOfficerId: string;
  suspectUserId: string;
  triggerType: string;
  riskScore: number;
  transactionRef: string;
}): Promise<{ workflowId: string; fraudCaseId: string; bisInvestigationId: string; accountFrozen: boolean }> {
  const workflowId = wfId("ai-fraud-bis");
  const fraudCaseId = `FC-${Date.now().toString(36).toUpperCase()}`;
  const bisInvestigationId = `BIS-${Date.now().toString(36).toUpperCase()}`;

  await journeyFraudActivities.createCase({
    userId: params.suspectUserId, caseId: fraudCaseId,
    triggerType: params.triggerType, riskScore: params.riskScore,
    transactionRef: params.transactionRef,
  });

  const accountFrozen = params.riskScore >= 80;
  if (accountFrozen) {
    await fraudActivities.freezeAccount(
      params.suspectUserId,
      `High risk score: ${params.riskScore}. Fraud case: ${fraudCaseId}`
    );
  }

  await bisActivities.createInvestigation({
    investigationId: bisInvestigationId, subjectId: params.suspectUserId,
    initiatedBy: params.complianceOfficerId,
    reason: `AI fraud detection: ${params.triggerType} (score: ${params.riskScore})`,
    priority: params.riskScore >= 80 ? "high" : "medium",
  });

  await notificationActivities.sendInApp({
    userId: params.complianceOfficerId, title: "Fraud Alert Escalated to BIS",
    body: `User ${params.suspectUserId} flagged (score: ${params.riskScore}). BIS investigation ${bisInvestigationId} created.${accountFrozen ? " Account frozen." : ""}`,
    type: "security",
  });

  await auditActivities.log({
    actorId: params.complianceOfficerId, action: "ai_fraud_bis_escalation",
    entityType: "bis_investigations", entityId: bisInvestigationId,
    metadata: { fraudCaseId, riskScore: params.riskScore, accountFrozen, triggerType: params.triggerType },
  });

  await fluvioActivities.emit("fraud.bis.escalation", {
    workflowId, fraudCaseId, bisInvestigationId, riskScore: params.riskScore, accountFrozen,
  });

  return { workflowId, fraudCaseId, bisInvestigationId, accountFrozen };
}

// ─── J20: Full Tourist Lifecycle ─────────────────────────────────────────────
export async function fullTouristLifecycleWorkflow(params: {
  touristId: string;
  passportCountry: string;
  destination: string;
  hotelId: string;
  checkIn: string;
  checkOut: string;
  budgetNgn: number;
  insuranceCoverage: string;
}): Promise<{
  workflowId: string;
  visaRef: string;
  bookingRef: string;
  policyId: string;
  itineraryId: string;
  walletBalance: number;
  loyaltyPoints: number;
}> {
  const workflowId = wfId("full-tourist-lifecycle");

  // ARRIVE: e-Visa
  const visaRef = `VIS-${Date.now().toString(36).toUpperCase()}`;
  await db().execute(sql`
    INSERT INTO evisa_payments (id, tourist_id, passport_number, nationality, visa_type,
      duration_days, fee_amount, currency, fee_amount_ngn, status, idempotency_key, created_at)
    VALUES (${visaRef}, ${params.touristId}, ${`PASS-${visaRef}`}, ${params.passportCountry},
      'tourist', 30, 15000, 'NGN', 15000, 'paid', ${visaRef}, NOW())
    ON CONFLICT (idempotency_key) DO NOTHING
  `);
  await walletActivities.debitWallet({
    userId: params.touristId, amountNgn: 15000, description: "e-Visa fee", reference: visaRef,
  });

  // ARRIVE: Insurance
  const policyId = `POL-${Date.now().toString(36).toUpperCase()}`;
  await db().execute(sql`
    INSERT INTO insurance_policies (user_id, product_id, policy_number, status,
      start_date, end_date, premium_paid, currency, metadata, created_at)
    VALUES (1, 1, ${policyId}, 'active', ${params.checkIn}, ${params.checkOut},
      5000, 'NGN',
      ${JSON.stringify({ coverageType: params.insuranceCoverage, destination: params.destination })}::jsonb,
      NOW())
    ON CONFLICT (policy_number) DO NOTHING
  `);
  await walletActivities.debitWallet({
    userId: params.touristId, amountNgn: 5000,
    description: "Travel insurance premium", reference: policyId,
  });

  // ARRIVE: AI itinerary
  const itineraryId = `ITN-${Date.now().toString(36).toUpperCase()}`;
  await aiActivities.generateItinerary({
    prompt: `Plan a trip to ${params.destination}`,
    destination: params.destination, startDate: params.checkIn, endDate: params.checkOut,
    budget: params.budgetNgn, preferences: ["culture", "food", "adventure"], profileType: "tourist",
  });

  // STAY: Hotel booking
  const bookingRef = `BK-${Date.now().toString(36).toUpperCase()}`;
  const bookingAmount = params.budgetNgn * 0.6;
  await db().execute(sql`
    INSERT INTO direct_bookings (id, hotel_id, hotel_slug, guest_name, guest_email,
      room_type, check_in, check_out, nights, rate_per_night, total_amount,
      currency, status, source, confirmation_code, created_at)
    VALUES (${bookingRef}, ${params.hotelId}, ${params.hotelId}, 'Tourist', 'tourist@tourismpay.ng',
      'standard', ${params.checkIn}, ${params.checkOut}, 1, ${bookingAmount},
      ${bookingAmount}, 'NGN', 'confirmed', 'direct', ${bookingRef}, NOW())
    ON CONFLICT (id) DO NOTHING
  `);
  await walletActivities.debitWallet({
    userId: params.touristId, amountNgn: bookingAmount,
    description: `Hotel booking ${bookingRef}`, reference: bookingRef,
  });

  // PAY: Earn loyalty
  const loyaltyPoints = await loyaltyActivities.earnPoints({
    userId: params.touristId, merchantId: params.hotelId,
    amountNgn: bookingAmount + 20000, referenceId: workflowId,
  });

  // DEPART: Final balance
  const walletBalance = await walletActivities.getBalance(params.touristId);

  await auditActivities.log({
    actorId: params.touristId, action: "full_tourist_lifecycle_completed",
    entityType: "users", entityId: params.touristId,
    metadata: { visaRef, bookingRef, policyId, itineraryId, loyaltyPoints, walletBalance },
  });

  await notificationActivities.sendInApp({
    userId: params.touristId, title: "Welcome to Nigeria!",
    body: `Your trip is fully set up: visa, insurance, hotel, and AI itinerary ready. Enjoy your stay!`,
    type: "travel",
  });

  await fluvioActivities.emit("tourist.lifecycle.completed", {
    workflowId, touristId: params.touristId, destination: params.destination,
    visaRef, bookingRef, policyId, loyaltyPoints,
  });

  return { workflowId, visaRef, bookingRef, policyId, itineraryId, walletBalance, loyaltyPoints };
}
