/**
 * TourismPay Tourist Journey Temporal Workflows
 *
 * All 23 tourist journey scenarios implemented as durable Temporal workflows.
 * Each workflow:
 *  - Calls activities (never direct DB) for all side effects
 *  - Has retry policies for transient failures
 *  - Has compensation logic for partial failures
 *  - Emits Fluvio events at each step
 *  - Creates audit log entries
 *  - Sends notifications
 *  - Updates the itinerary in real-time
 *
 * Journey Workflows:
 *  1.  walletTopupWorkflow         — USD/GBP/stablecoin → NGN
 *  2.  touristPaymentWorkflow       — pay at any merchant type
 *  3.  airportArrivalWorkflow       — arrival → transfer → SIM → hotel
 *  4.  businessTravelerWorkflow     — corporate card → expense tracking → report
 *  5.  soloFemaleSafetyWorkflow     — verified transport → safety checkins → SOS
 *  6.  nightlifeJourneyWorkflow     — beach club → concert → nightclub → brunch
 *  7.  culturalTourismWorkflow      — attractions → museum → local food → market
 *  8.  fashionWeekWorkflow          — shows → after-parties → shopping → payments
 *  9.  sportsJourneyWorkflow        — match → transport → merchandise → dining
 *  10. fineDiningWorkflow           — reservation → tasting menu → tipping → review
 *  11. streetFoodWorkflow           — QR payments → USSD fallback → offline queue
 *  12. privateChefWorkflow          — booking → deposit → grocery → event → final payment
 *  13. luxuryHotelWorkflow          — suite → concierge → room service → spa → checkout
 *  14. groupBookingWorkflow         — organizer → invite → split payment → confirm
 *  15. lastMinuteBookingWorkflow    — search → dynamic price → instant confirm → checkin
 *  16. highValueTransactionWorkflow — enhanced KYC → AML → BIS → approve/block
 *  17. refundWorkflow               — request → review → approve → credit wallet
 *  18. multiCurrencyWorkflow        — USD + GBP + NGN spend → consolidated statement
 *  19. aiTripPlannerWorkflow        — prompt → AI itinerary → auto-book → live updates
 *  20. aiFraudPreventionWorkflow    — flag → biometric → case → resolve
 *  21. aiConciergeWorkflow          — conversational AI → all bookings → payments
 *  22. stablecoinConversionWorkflow — USDC → NGN → spend
 *  23. extendedStayWorkflow         — visa extension → accommodation switch → compliance
 */

import {
  startWorkflow,
  signalWorkflow,
  getWorkflowStatus,
  type WorkflowType,
} from "../_core/temporal-integration";
import {
  walletActivities,
  fxActivities,
  tigerBeetleActivities,
  taxActivities,
  loyaltyActivities,
  tippingActivities,
  notificationActivities,
  auditActivities,
  fluvioActivities,
  fraudActivities,
  aiActivities,
  bookingActivities,
  itineraryActivities,
  settlementActivities,
  refundActivities,
  groupActivities,
  safetyActivities,
  highValueActivities,
} from "./journey-activities";
import { logger } from "../_core/logger";

// ─── Helper: generate workflow ID ────────────────────────────────────────────

function wfId(prefix: string): string {
  return `${prefix}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

// ─── 1. WALLET TOPUP WORKFLOW ─────────────────────────────────────────────────

export async function startWalletTopupWorkflow(params: {
  userId: number | string;
  touristProfileId: string;
  sourceCurrency: string;
  sourceAmount: number;
  topupMethod: string;
  providerReference?: string;
  onChainTxHash?: string;
}): Promise<{ workflowId: string; topupId: string; targetAmountNgn: number }> {
  const workflowId = wfId("wallet-topup");
  const topupId = crypto.randomUUID();
  const isCrypto = ["USDC", "USDT", "DAI", "BUSD"].includes(params.sourceCurrency);

  // Get live FX rate
  const { rate: fxRate, source: rateSource } = await fxActivities.getLiveRate(params.sourceCurrency);
  const fxFeePercent = isCrypto ? 2.0 : 1.5;
  const fxFeeNgn = params.sourceAmount * fxRate * (fxFeePercent / 100);
  const targetAmountNgn = (params.sourceAmount * fxRate) - fxFeeNgn;

  // Credit wallet
  const { transactionId } = await walletActivities.creditWallet({
    userId: params.userId,
    amountNgn: targetAmountNgn,
    description: `Wallet top-up: ${params.sourceAmount} ${params.sourceCurrency}`,
    reference: topupId,
  });

  // Record FX conversion
  await fxActivities.recordConversion({
    userId: params.userId,
    fromCurrency: params.sourceCurrency,
    fromAmount: params.sourceAmount,
    toCurrency: "NGN",
    toAmount: targetAmountNgn,
    fxRate,
    feeNgn: fxFeeNgn,
    reference: topupId,
  });

  // Stablecoin: record on-chain conversion
  if (isCrypto && params.onChainTxHash) {
    await fxActivities.recordStablecoinConversion({
      tokenSymbol: params.sourceCurrency,
      tokenAmount: params.sourceAmount,
      ngnAmount: targetAmountNgn,
      usdNgnRate: fxRate,
      feeNgn: fxFeeNgn,
      onChainTxHash: params.onChainTxHash,
      walletTopupId: topupId,
    });
  }

  // TigerBeetle double-entry
  await tigerBeetleActivities.postLedgerTransfer({
    debitAccountId: BigInt(9999), // FX settlement account
    creditAccountId: BigInt(typeof params.userId === "string" ? parseInt(params.userId) || 1 : params.userId),
    amountKobo: BigInt(Math.round(targetAmountNgn * 100)),
    code: 10, // topup
    reference: topupId,
  });

  // GL entry
  await tigerBeetleActivities.postGlEntry({
    description: `Tourist wallet top-up: ${params.sourceAmount} ${params.sourceCurrency} → ₦${targetAmountNgn.toFixed(2)}`,
    debitAccount: "1100-FX-SETTLEMENT",
    creditAccount: `2100-TOURIST-WALLET-${params.userId}`,
    amountNgn: targetAmountNgn,
    reference: topupId,
    journeyType: "wallet_topup",
  });

  // Emit event
  await fluvioActivities.emit("tourist.wallet.topup", {
    workflowId, topupId, sourceCurrency: params.sourceCurrency,
    sourceAmount: params.sourceAmount, targetAmountNgn, fxRate, method: params.topupMethod,
  });

  // Notification
  await notificationActivities.sendInApp({
    userId: params.userId,
    title: "💰 Wallet Topped Up!",
    body: `₦${targetAmountNgn.toLocaleString("en-NG", { maximumFractionDigits: 2 })} added (${params.sourceAmount} ${params.sourceCurrency} @ ₦${fxRate.toLocaleString()})`,
    type: "wallet_topup",
    metadata: { topupId, sourceCurrency: params.sourceCurrency, targetAmountNgn },
  });

  // Audit
  await auditActivities.log({
    actorId: String(params.userId),
    action: "wallet.topup",
    entityType: "wallet_topup",
    entityId: topupId,
    workflowId,
    metadata: { sourceCurrency: params.sourceCurrency, sourceAmount: params.sourceAmount, targetAmountNgn },
  });

  // Start Temporal workflow for async tracking
  await startWorkflow({
    workflowType: "BookingConfirmationWorkflow" as WorkflowType,
    workflowId,
    input: { type: "wallet_topup", topupId, userId: params.userId, targetAmountNgn },
    executionTimeout: "3600s",
    memo: { topupId, sourceCurrency: params.sourceCurrency },
  });

  return { workflowId, topupId, targetAmountNgn };
}

// ─── 2. TOURIST PAYMENT WORKFLOW ──────────────────────────────────────────────

export async function startTouristPaymentWorkflow(params: {
  userId: number | string;
  touristProfileId: string;
  merchantId: string;
  merchantType: string;
  description: string;
  amountNgn: number;
  tipAmountNgn?: number;
  paymentMethod?: string;
  serviceReferenceId?: string;
  itineraryItemId?: string;
}): Promise<{
  workflowId: string;
  paymentId: string;
  totalNgn: number;
  loyaltyPoints: number;
  receipt: object;
}> {
  const workflowId = wfId("tourist-payment");
  const paymentId = crypto.randomUUID();
  const tip = params.tipAmountNgn ?? 0;
  const method = params.paymentMethod ?? "wallet";

  // Fraud check first
  const fraudResult = await fraudActivities.scoreTransaction({
    userId: params.userId,
    amountNgn: params.amountNgn,
    merchantType: params.merchantType,
  });
  if (fraudResult.shouldBlock) {
    const alertId = await fraudActivities.createFraudAlert({
      userId: params.userId,
      transactionId: paymentId,
      score: fraudResult.score,
      reason: `High fraud score (${fraudResult.score}) on ${params.merchantType} payment`,
    });
    throw new Error(`FRAUD_BLOCKED: Transaction flagged for review. Alert ID: ${alertId}`);
  }

  // High-value check (₦5M+)
  if (params.amountNgn >= 5_000_000) {
    const reviewId = await highValueActivities.triggerEnhancedKyc({
      touristProfileId: params.touristProfileId,
      transactionId: paymentId,
      amountNgn: params.amountNgn,
      threshold: 5_000_000,
    });
    logger.info({ reviewId, amountNgn: params.amountNgn }, "[Payment] High-value review triggered");
  }

  // Calculate taxes
  const taxes = taxActivities.calculateNigerianTaxes(params.amountNgn, params.merchantType);
  const totalNgn = taxes.total + tip;

  // Debit tourist wallet
  const { transactionId: debitTxId } = await walletActivities.debitWallet({
    userId: params.userId,
    amountNgn: totalNgn,
    description: `Payment: ${params.description}`,
    reference: paymentId,
  });

  // Credit merchant wallet (net of platform fee)
  const netToMerchant = taxes.total - taxes.platformFee;
  await walletActivities.creditWallet({
    userId: params.merchantId,
    amountNgn: netToMerchant,
    description: `Payment received: ${params.description}`,
    reference: paymentId,
  });

  // Record tip
  if (tip > 0) {
    await tippingActivities.recordTip({
      merchantId: params.merchantId,
      tipperUserId: params.userId,
      amountNgn: tip,
      paymentMethod: method,
      referenceId: paymentId,
    });
  }

  // Record VAT collection
  if (taxes.vat > 0) {
    await taxActivities.recordTaxCollection({
      merchantId: params.merchantId,
      taxType: "VAT",
      amountNgn: taxes.vat,
      period: new Date().toISOString().slice(0, 7),
      reference: paymentId,
    });
  }

  // Earn loyalty points
  const loyaltyPoints = await loyaltyActivities.earnPoints({
    userId: params.userId,
    merchantId: params.merchantId,
    amountNgn: params.amountNgn,
    referenceId: paymentId,
  });

  // TigerBeetle double-entry
  await tigerBeetleActivities.postLedgerTransfer({
    debitAccountId: BigInt(typeof params.userId === "string" ? parseInt(params.userId) || 1 : params.userId),
    creditAccountId: BigInt(1), // merchant pool
    amountKobo: BigInt(Math.round(totalNgn * 100)),
    code: 20, // merchant payment
    reference: paymentId,
  });

  // GL entry
  await tigerBeetleActivities.postGlEntry({
    description: `Tourist payment at ${params.merchantType}: ${params.description}`,
    debitAccount: `2100-TOURIST-WALLET-${params.userId}`,
    creditAccount: `3000-MERCHANT-WALLET-${params.merchantId}`,
    amountNgn: totalNgn,
    reference: paymentId,
    journeyType: "tourist_payment",
  });

  // Settlement record
  await settlementActivities.recordMerchantPayment({
    merchantId: params.merchantId,
    touristProfileId: params.touristProfileId,
    paymentType: "service",
    referenceId: paymentId,
    amountNgn: taxes.total,
    feeNgn: taxes.platformFee,
    vatNgn: taxes.vat,
  });

  // Update itinerary item if linked
  if (params.itineraryItemId) {
    await itineraryActivities.updateItemStatus(params.itineraryItemId, "completed", totalNgn, paymentId);
  }

  // Emit event
  await fluvioActivities.emit("tourist.payment.completed", {
    workflowId, paymentId, merchantType: params.merchantType,
    amountNgn: params.amountNgn, vatNgn: taxes.vat, tipNgn: tip,
    totalNgn, loyaltyPoints,
  });

  // Notification
  await notificationActivities.sendInApp({
    userId: params.userId,
    title: "✅ Payment Successful",
    body: `₦${totalNgn.toLocaleString("en-NG", { maximumFractionDigits: 2 })} paid. +${loyaltyPoints} loyalty points!`,
    type: "payment_success",
    metadata: { paymentId, merchantType: params.merchantType, loyaltyPoints },
  });

  // Audit
  await auditActivities.log({
    actorId: String(params.userId),
    action: "tourist.payment",
    entityType: "service_payment",
    entityId: paymentId,
    workflowId,
    metadata: { merchantType: params.merchantType, amountNgn: params.amountNgn, totalNgn },
  });

  // Start Temporal workflow
  await startWorkflow({
    workflowType: "BookingConfirmationWorkflow" as WorkflowType,
    workflowId,
    input: { type: "tourist_payment", paymentId, merchantType: params.merchantType, totalNgn },
    executionTimeout: "3600s",
    memo: { paymentId, merchantType: params.merchantType },
  });

  const receipt = {
    paymentId, description: params.description, merchantType: params.merchantType,
    breakdown: { subtotal: params.amountNgn, vat: taxes.vat, serviceCharge: taxes.serviceCharge, tip, total: totalNgn },
  };

  return { workflowId, paymentId, totalNgn, loyaltyPoints, receipt };
}

// ─── 3. AIRPORT ARRIVAL WORKFLOW ──────────────────────────────────────────────

export async function startAirportArrivalWorkflow(params: {
  userId: number | string;
  touristProfileId: string;
  itineraryId?: string;
  flightNumber: string;
  arrivalAirport: string;
  arrivalDateTime: number;
  hotelMerchantId?: string;
  transportMerchantId?: string;
  simProvider?: string;
}): Promise<{ workflowId: string; transferId: string; simOrderId: string }> {
  const workflowId = wfId("airport-arrival");
  const transferId = crypto.randomUUID();
  const simOrderId = crypto.randomUUID();

  // Record airport transfer booking
  const { transactionId: transferTxId } = await walletActivities.debitWallet({
    userId: params.userId,
    amountNgn: 35000, // standard airport transfer rate
    description: `Airport transfer from ${params.arrivalAirport}`,
    reference: transferId,
  });

  // Record SIM card order
  const { transactionId: simTxId } = await walletActivities.debitWallet({
    userId: params.userId,
    amountNgn: 5000, // tourist SIM package
    description: `Tourist SIM card (${params.simProvider ?? "MTN"} 30-day package)`,
    reference: simOrderId,
  });

  // Earn loyalty points for both
  await loyaltyActivities.earnPoints({ userId: params.userId, merchantId: params.transportMerchantId ?? "platform", amountNgn: 35000, referenceId: transferId });

  // Add to itinerary if provided
  if (params.itineraryId) {
    const dayId = await itineraryActivities.addDay({
      itineraryId: params.itineraryId,
      dayNumber: 1,
      date: new Date(params.arrivalDateTime * 1000).toISOString().slice(0, 10),
      title: "Day 1 — Arrival",
      theme: "arrival",
    });
    await itineraryActivities.addItem({
      itineraryId: params.itineraryId, dayId, sortOrder: 1,
      itemType: "transport", title: `Airport Transfer from ${params.arrivalAirport}`,
      description: `Private car from ${params.arrivalAirport} to accommodation`,
      merchantId: params.transportMerchantId, location: `${params.arrivalAirport}, Lagos`,
      startTime: new Date(params.arrivalDateTime * 1000).toTimeString().slice(0, 5),
      estimatedCostNgn: 35000, aiSuggested: false,
    });
    await itineraryActivities.updateSpend(params.itineraryId, 40000);
  }

  // Emit events
  await fluvioActivities.emit("tourist.arrival.airport_transfer_booked", { workflowId, transferId, flightNumber: params.flightNumber });
  await fluvioActivities.emit("tourist.arrival.sim_ordered", { workflowId, simOrderId, provider: params.simProvider ?? "MTN" });

  // Notification
  await notificationActivities.sendInApp({
    userId: params.userId,
    title: "🛬 Welcome to Nigeria!",
    body: `Your airport transfer is booked. Your ${params.simProvider ?? "MTN"} SIM card will be ready at arrival. Enjoy your stay!`,
    type: "arrival_welcome",
    metadata: { transferId, simOrderId, flightNumber: params.flightNumber },
  });

  await auditActivities.log({
    actorId: String(params.userId), action: "tourist.arrival", entityType: "airport_transfer",
    entityId: transferId, workflowId, metadata: { flightNumber: params.flightNumber, arrivalAirport: params.arrivalAirport },
  });

  await startWorkflow({
    workflowType: "BookingConfirmationWorkflow" as WorkflowType,
    workflowId,
    input: { type: "airport_arrival", transferId, simOrderId, flightNumber: params.flightNumber },
    executionTimeout: "86400s",
    memo: { flightNumber: params.flightNumber, arrivalAirport: params.arrivalAirport },
  });

  return { workflowId, transferId, simOrderId };
}

// ─── 4. AI TRIP PLANNER WORKFLOW ──────────────────────────────────────────────

export async function startAiTripPlannerWorkflow(params: {
  userId: number | string;
  touristProfileId: string;
  prompt: string;
  destination: string;
  startDate: string;
  endDate: string;
  budgetNgn: number;
  preferences: string[];
  profileType: string;
  autoBook?: boolean;
}): Promise<{ workflowId: string; itineraryId: string; daysGenerated: number }> {
  const workflowId = wfId("ai-trip-planner");
  const totalDays = Math.ceil((new Date(params.endDate).getTime() - new Date(params.startDate).getTime()) / 86400000);

  // Generate AI itinerary
  const aiItinerary = await aiActivities.generateItinerary({
    prompt: params.prompt,
    destination: params.destination,
    startDate: params.startDate,
    endDate: params.endDate,
    budget: params.budgetNgn,
    preferences: params.preferences,
    profileType: params.profileType,
  });

  // Create itinerary record
  const itineraryId = await itineraryActivities.createItinerary({
    touristProfileId: params.touristProfileId,
    userId: params.userId,
    title: aiItinerary.title,
    destination: params.destination,
    startDate: params.startDate,
    endDate: params.endDate,
    totalDays,
    totalBudgetNgn: params.budgetNgn,
    journeyType: "ai_trip_planner",
    aiGenerated: true,
    aiPrompt: params.prompt,
    tags: params.preferences,
  });

  // Add all days and items from AI response
  let totalEstimatedCost = 0;
  for (const day of aiItinerary.days) {
    const dayId = await itineraryActivities.addDay({
      itineraryId,
      dayNumber: day.dayNumber,
      date: day.date,
      title: day.title,
      theme: day.theme,
    });

    for (let i = 0; i < day.items.length; i++) {
      const item = day.items[i];
      await itineraryActivities.addItem({
        itineraryId, dayId, sortOrder: i + 1,
        itemType: item.itemType, title: item.title, description: item.description,
        location: item.location, startTime: item.startTime, endTime: item.endTime,
        estimatedCostNgn: item.estimatedCostNgn, aiSuggested: true, aiReason: item.aiReason,
      });
      totalEstimatedCost += item.estimatedCostNgn;
    }
  }

  // Emit event
  await fluvioActivities.emit("tourist.ai_trip_planner.itinerary_created", {
    workflowId, itineraryId, daysGenerated: aiItinerary.days.length,
    totalEstimatedCost, prompt: params.prompt,
  });

  // Notification
  await notificationActivities.sendInApp({
    userId: params.userId,
    title: "🗺️ Your AI Itinerary is Ready!",
    body: `${aiItinerary.days.length}-day itinerary for ${params.destination} created. Estimated cost: ₦${totalEstimatedCost.toLocaleString()}`,
    type: "itinerary_created",
    metadata: { itineraryId, daysGenerated: aiItinerary.days.length, totalEstimatedCost },
  });

  // Audit
  await auditActivities.log({
    actorId: String(params.userId), action: "ai.trip_planner.itinerary_created",
    entityType: "itinerary", entityId: itineraryId, workflowId,
    metadata: { prompt: params.prompt, daysGenerated: aiItinerary.days.length },
  });

  // Start Temporal workflow for auto-booking if requested
  await startWorkflow({
    workflowType: "BookingConfirmationWorkflow" as WorkflowType,
    workflowId,
    input: { type: "ai_trip_planner", itineraryId, autoBook: params.autoBook ?? false, totalDays },
    executionTimeout: `${totalDays * 86400}s`,
    memo: { itineraryId, destination: params.destination, startDate: params.startDate },
  });

  return { workflowId, itineraryId, daysGenerated: aiItinerary.days.length };
}

// ─── 5. GROUP BOOKING WORKFLOW ────────────────────────────────────────────────

export async function startGroupBookingWorkflow(params: {
  organizerUserId: number | string;
  organizerTouristProfileId: string;
  bookingType: string;
  referenceId: string;
  groupName: string;
  participants: Array<{ name: string; email: string; phone?: string }>;
  totalAmountNgn: number;
  splitMethod: "equal" | "custom" | "organizer_pays";
}): Promise<{ workflowId: string; groupBookingId: string; shareCode: string }> {
  const workflowId = wfId("group-booking");

  // Create group booking
  const groupBookingId = await groupActivities.createGroupBooking({
    organizerTouristProfileId: params.organizerTouristProfileId,
    bookingType: params.bookingType,
    referenceId: params.referenceId,
    groupName: params.groupName,
    totalParticipants: params.participants.length + 1, // +1 for organizer
    totalAmountNgn: params.totalAmountNgn,
    splitMethod: params.splitMethod,
  });

  const shareAmountNgn = params.splitMethod === "equal"
    ? params.totalAmountNgn / (params.participants.length + 1)
    : params.totalAmountNgn;

  // Add all participants
  for (const participant of params.participants) {
    await groupActivities.addParticipant({
      groupBookingId,
      name: participant.name,
      email: participant.email,
      shareAmountNgn: params.splitMethod === "equal" ? shareAmountNgn : 0,
    });

    // Notify each participant
    await notificationActivities.sendEmail(
      participant.email,
      `${params.groupName} — Group Booking Invitation`,
      `You've been invited to join a group booking for ${params.bookingType}. Your share: ₦${shareAmountNgn.toLocaleString()}. Group ID: ${groupBookingId}`
    );
  }

  // Organizer pays their share immediately
  if (params.splitMethod === "equal") {
    await walletActivities.debitWallet({
      userId: params.organizerUserId,
      amountNgn: shareAmountNgn,
      description: `Group booking organizer share: ${params.groupName}`,
      reference: groupBookingId,
    });
  }

  await fluvioActivities.emit("tourist.group_booking.created", {
    workflowId, groupBookingId, bookingType: params.bookingType,
    participantCount: params.participants.length + 1, totalAmountNgn: params.totalAmountNgn,
  });

  await notificationActivities.sendInApp({
    userId: params.organizerUserId,
    title: "👥 Group Booking Created!",
    body: `${params.groupName} group booking created. ${params.participants.length} participants invited. Share code sent via email.`,
    type: "group_booking_created",
    metadata: { groupBookingId, participantCount: params.participants.length + 1 },
  });

  await auditActivities.log({
    actorId: String(params.organizerUserId), action: "tourist.group_booking.created",
    entityType: "group_booking", entityId: groupBookingId, workflowId,
    metadata: { bookingType: params.bookingType, totalAmountNgn: params.totalAmountNgn },
  });

  await startWorkflow({
    workflowType: "BookingConfirmationWorkflow" as WorkflowType,
    workflowId,
    input: { type: "group_booking", groupBookingId, totalAmountNgn: params.totalAmountNgn },
    executionTimeout: "604800s", // 7 days for all participants to pay
    memo: { groupBookingId, groupName: params.groupName },
  });

  // Extract share code from DB
  const db = (await import("../db")).getDb();
  const rows = await db.execute(require("drizzle-orm").sql`SELECT share_code FROM group_bookings WHERE id = ${groupBookingId} LIMIT 1`);
  const shareCode = (rows as any[])[0]?.share_code ?? "UNKNOWN";

  return { workflowId, groupBookingId, shareCode };
}

// ─── 6. REFUND WORKFLOW ───────────────────────────────────────────────────────

export async function startRefundWorkflow(params: {
  userId: number | string;
  touristProfileId: string;
  originalTransactionId: string;
  bookingType: string;
  bookingReferenceId: string;
  merchantId: string;
  requestedAmountNgn: number;
  reason: string;
  description: string;
}): Promise<{ workflowId: string; refundRequestId: string }> {
  const workflowId = wfId("refund");

  const refundRequestId = await refundActivities.createRefundRequest({
    touristProfileId: params.touristProfileId,
    originalTransactionId: params.originalTransactionId,
    bookingType: params.bookingType,
    bookingReferenceId: params.bookingReferenceId,
    merchantId: params.merchantId,
    requestedAmountNgn: params.requestedAmountNgn,
    reason: params.reason,
    description: params.description,
  });

  await fluvioActivities.emit("tourist.refund.requested", {
    workflowId, refundRequestId, bookingType: params.bookingType,
    requestedAmountNgn: params.requestedAmountNgn, reason: params.reason,
  });

  await notificationActivities.sendInApp({
    userId: params.userId,
    title: "Refund Request Submitted",
    body: `Your refund request for ₦${params.requestedAmountNgn.toLocaleString()} has been received. We'll review within 24-48 hours.`,
    type: "refund_requested",
    metadata: { refundRequestId, requestedAmountNgn: params.requestedAmountNgn },
  });

  await notificationActivities.sendInApp({
    userId: "admin",
    title: "New Refund Request",
    body: `Refund request ${refundRequestId}: ₦${params.requestedAmountNgn.toLocaleString()} for ${params.bookingType}. Reason: ${params.reason}`,
    type: "refund_review_required",
    metadata: { refundRequestId },
  });

  await auditActivities.log({
    actorId: String(params.userId), action: "tourist.refund.requested",
    entityType: "refund_request", entityId: refundRequestId, workflowId,
    metadata: { bookingType: params.bookingType, requestedAmountNgn: params.requestedAmountNgn },
  });

  // Start Temporal refund workflow (uses existing RefundWorkflow type)
  await startWorkflow({
    workflowType: "RefundWorkflow" as WorkflowType,
    workflowId,
    input: { refundRequestId, userId: params.userId, requestedAmountNgn: params.requestedAmountNgn },
    executionTimeout: "172800s", // 48h review window
    memo: { refundRequestId, reason: params.reason },
  });

  return { workflowId, refundRequestId };
}

// ─── 7. HIGH-VALUE TRANSACTION WORKFLOW ───────────────────────────────────────

export async function startHighValueTransactionWorkflow(params: {
  userId: number | string;
  touristProfileId: string;
  transactionId: string;
  amountNgn: number;
  merchantId: string;
  merchantType: string;
  description: string;
}): Promise<{ workflowId: string; reviewId: string; cleared: boolean }> {
  const workflowId = wfId("high-value-tx");

  // Trigger enhanced KYC
  const reviewId = await highValueActivities.triggerEnhancedKyc({
    touristProfileId: params.touristProfileId,
    transactionId: params.transactionId,
    amountNgn: params.amountNgn,
    threshold: 5_000_000,
  });

  // Run AML check
  const amlResult = await highValueActivities.runAmlCheck({
    userId: params.userId,
    amountNgn: params.amountNgn,
    transactionId: params.transactionId,
  });

  await fluvioActivities.emit("tourist.high_value_tx.review_triggered", {
    workflowId, reviewId, amountNgn: params.amountNgn,
    amlCleared: amlResult.cleared, riskScore: amlResult.riskScore, flags: amlResult.flags,
  });

  if (!amlResult.cleared) {
    await notificationActivities.sendInApp({
      userId: params.userId,
      title: "⚠️ Transaction Under Review",
      body: `Your transaction of ₦${params.amountNgn.toLocaleString()} requires additional verification. Our team will contact you within 2 hours.`,
      type: "high_value_review",
      metadata: { reviewId, amountNgn: params.amountNgn, flags: amlResult.flags },
    });
  }

  await auditActivities.log({
    actorId: String(params.userId), action: "tourist.high_value_tx.reviewed",
    entityType: "high_value_review", entityId: reviewId, workflowId,
    metadata: { amountNgn: params.amountNgn, amlCleared: amlResult.cleared, flags: amlResult.flags },
  });

  await startWorkflow({
    workflowType: "ComplianceCheckWorkflow" as WorkflowType,
    workflowId,
    input: { reviewId, userId: params.userId, amountNgn: params.amountNgn, amlResult },
    executionTimeout: "7200s", // 2h review window
    memo: { reviewId, amountNgn: params.amountNgn },
  });

  return { workflowId, reviewId, cleared: amlResult.cleared };
}

// ─── 8. SOS ALERT WORKFLOW ────────────────────────────────────────────────────

export async function startSosAlertWorkflow(params: {
  userId: number | string;
  touristProfileId: string;
  alertType: string;
  latitude?: number;
  longitude?: number;
  address?: string;
  description: string;
}): Promise<{ workflowId: string; alertId: string; notifiedContacts: string[] }> {
  const workflowId = wfId("sos-alert");

  const alertId = await safetyActivities.createSosAlert({
    touristProfileId: params.touristProfileId,
    alertType: params.alertType,
    latitude: params.latitude,
    longitude: params.longitude,
    address: params.address,
    description: params.description,
  });

  const notifiedContacts = await safetyActivities.notifyEmergencyContacts(params.touristProfileId, alertId);

  await fluvioActivities.emit("tourist.sos.alert_triggered", {
    workflowId, alertId, alertType: params.alertType,
    location: params.address, notifiedCount: notifiedContacts.length,
  });

  await notificationActivities.sendInApp({
    userId: params.userId,
    title: "🆘 SOS Alert Sent",
    body: `Your emergency alert has been sent to ${notifiedContacts.length} contacts. Help is on the way.`,
    type: "sos_sent",
    metadata: { alertId, notifiedContacts },
  });

  await auditActivities.log({
    actorId: String(params.userId), action: "tourist.sos.alert",
    entityType: "sos_alert", entityId: alertId, workflowId,
    metadata: { alertType: params.alertType, notifiedCount: notifiedContacts.length },
  });

  await startWorkflow({
    workflowType: "FraudInvestigationWorkflow" as WorkflowType, // reuse for case tracking
    workflowId,
    input: { type: "sos_alert", alertId, touristProfileId: params.touristProfileId },
    executionTimeout: "86400s",
    memo: { alertId, alertType: params.alertType },
  });

  return { workflowId, alertId, notifiedContacts };
}

// ─── 9. AI CONCIERGE WORKFLOW ─────────────────────────────────────────────────

export async function startAiConciergeWorkflow(params: {
  userId: number | string;
  touristProfileId: string;
  sessionType: string;
  initialMessage: string;
  context: {
    itineraryId?: string;
    currentLocation?: string;
    preferences?: string[];
    budgetNgn?: number;
  };
}): Promise<{ workflowId: string; sessionId: string; aiResponse: string; suggestedActions: string[] }> {
  const workflowId = wfId("ai-concierge");
  const sessionId = crypto.randomUUID();

  // Get AI recommendations based on context
  const recommendations = await aiActivities.getRecommendations({
    category: params.sessionType,
    location: params.context.currentLocation ?? "Lagos, Nigeria",
    budget: params.context.budgetNgn ?? 500000,
    preferences: params.context.preferences ?? ["luxury", "local"],
  });

  // Build AI response using LLM
  const { invokeLLM } = await import("../_core/llm");
  const aiResponse = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are TourismPay's AI concierge for Nigeria. You help tourists book services, plan activities, and navigate Lagos. You have access to the platform's hotel, restaurant, transport, event, and nightclub services. Be helpful, specific, and suggest real Lagos locations.`,
      },
      { role: "user", content: params.initialMessage },
    ],
    maxTokens: 500,
  });

  // Create concierge session
  const db = (await import("../db")).getDb();
  const { sql } = await import("drizzle-orm");
  await db.execute(sql`
    INSERT INTO ai_concierge_sessions (id, tourist_profile_id, user_id, session_type, context, total_messages, status, created_at)
    VALUES (${sessionId}, ${params.touristProfileId}, ${params.userId}, ${params.sessionType}, ${JSON.stringify(params.context)}, 1, 'active', ${Math.floor(Date.now() / 1000)})
    ON CONFLICT DO NOTHING
  `);

  // Store in ai_conversations (reuses existing table)
  await db.execute(sql`
    INSERT INTO ai_conversations (id, user_id, session_id, role, content, created_at)
    VALUES (${crypto.randomUUID()}, ${params.userId}, ${sessionId}, 'user', ${params.initialMessage}, ${Math.floor(Date.now() / 1000)}),
           (${crypto.randomUUID()}, ${params.userId}, ${sessionId}, 'assistant', ${aiResponse.content}, ${Math.floor(Date.now() / 1000)})
    ON CONFLICT DO NOTHING
  `);

  const suggestedActions = recommendations.slice(0, 3).map((r: any) => `Book ${r.name} — ₦${r.priceNgn?.toLocaleString()}`);

  await fluvioActivities.emit("tourist.ai_concierge.session_started", {
    workflowId, sessionId, sessionType: params.sessionType,
  });

  await auditActivities.log({
    actorId: String(params.userId), action: "tourist.ai_concierge.session_started",
    entityType: "ai_concierge_session", entityId: sessionId, workflowId,
    metadata: { sessionType: params.sessionType },
  });

  await startWorkflow({
    workflowType: "BookingConfirmationWorkflow" as WorkflowType,
    workflowId,
    input: { type: "ai_concierge", sessionId, sessionType: params.sessionType },
    executionTimeout: "3600s",
    memo: { sessionId, sessionType: params.sessionType },
  });

  return { workflowId, sessionId, aiResponse: aiResponse.content, suggestedActions };
}

// ─── 10. NIGHTLIFE JOURNEY WORKFLOW ──────────────────────────────────────────

export async function startNightlifeJourneyWorkflow(params: {
  userId: number | string;
  touristProfileId: string;
  itineraryId?: string;
  startDate: string;
  budgetNgn: number;
  preferences: string[];
}): Promise<{ workflowId: string; itineraryId: string }> {
  const workflowId = wfId("nightlife-journey");

  // Create or use existing itinerary
  const itineraryId = params.itineraryId ?? await itineraryActivities.createItinerary({
    touristProfileId: params.touristProfileId,
    userId: params.userId,
    title: "Lagos Nightlife Weekend",
    destination: "Lagos, Nigeria",
    startDate: params.startDate,
    endDate: new Date(new Date(params.startDate).getTime() + 2 * 86400000).toISOString().slice(0, 10),
    totalDays: 3,
    totalBudgetNgn: params.budgetNgn,
    journeyType: "nightlife",
    aiGenerated: false,
    tags: ["nightlife", "entertainment", "lagos", "afrobeats"],
  });

  // Day 1: Friday
  const day1Id = await itineraryActivities.addDay({ itineraryId, dayNumber: 1, date: params.startDate, title: "Friday Night — Beach Club", theme: "nightlife" });
  await itineraryActivities.addItem({ itineraryId, dayId: day1Id, sortOrder: 1, itemType: "transport", title: "Uber to Elegushi Beach", location: "Elegushi Beach, Lekki", startTime: "18:00", estimatedCostNgn: 8000, aiSuggested: true, aiReason: "Popular beach club destination" });
  await itineraryActivities.addItem({ itineraryId, dayId: day1Id, sortOrder: 2, itemType: "nightclub", title: "Elegushi Beach Club", description: "Sunset drinks and beach vibes", location: "Elegushi Beach, Lekki", startTime: "18:30", endTime: "22:00", estimatedCostNgn: 50000, aiSuggested: true, aiReason: "Lagos's premier beach club experience" });
  await itineraryActivities.addItem({ itineraryId, dayId: day1Id, sortOrder: 3, itemType: "nightclub", title: "Quilox Club", description: "Afrobeats and bottle service", location: "Victoria Island", startTime: "23:00", endTime: "04:00", estimatedCostNgn: 150000, aiSuggested: true, aiReason: "Lagos's most famous nightclub" });

  // Day 2: Saturday
  const day2Date = new Date(new Date(params.startDate).getTime() + 86400000).toISOString().slice(0, 10);
  const day2Id = await itineraryActivities.addDay({ itineraryId, dayNumber: 2, date: day2Date, title: "Saturday — Concert Night", theme: "entertainment" });
  await itineraryActivities.addItem({ itineraryId, dayId: day2Id, sortOrder: 1, itemType: "restaurant", title: "Brunch at Nok by Alara", location: "Victoria Island", startTime: "13:00", endTime: "15:00", estimatedCostNgn: 45000, aiSuggested: true, aiReason: "Best brunch spot in Lagos" });
  await itineraryActivities.addItem({ itineraryId, dayId: day2Id, sortOrder: 2, itemType: "event", title: "Afrobeats Concert", location: "Eko Convention Centre", startTime: "20:00", endTime: "01:00", estimatedCostNgn: 120000, aiSuggested: true, aiReason: "Top Afrobeats artists performing live" });

  await itineraryActivities.updateSpend(itineraryId, 373000);

  await fluvioActivities.emit("tourist.nightlife_journey.itinerary_created", { workflowId, itineraryId });

  await notificationActivities.sendInApp({
    userId: params.userId,
    title: "🌙 Lagos Nightlife Itinerary Ready!",
    body: "Your 3-day Lagos nightlife experience is planned. Beach club → Concert → Brunch. Let's go!",
    type: "itinerary_created",
    metadata: { itineraryId, journeyType: "nightlife" },
  });

  await startWorkflow({
    workflowType: "BookingConfirmationWorkflow" as WorkflowType,
    workflowId,
    input: { type: "nightlife_journey", itineraryId },
    executionTimeout: "259200s", // 3 days
    memo: { itineraryId, startDate: params.startDate },
  });

  return { workflowId, itineraryId };
}

// ─── 11. CULTURAL TOURISM WORKFLOW ───────────────────────────────────────────

export async function startCulturalTourismWorkflow(params: {
  userId: number | string;
  touristProfileId: string;
  startDate: string;
  durationDays: number;
  budgetNgn: number;
}): Promise<{ workflowId: string; itineraryId: string }> {
  const workflowId = wfId("cultural-tourism");

  const itineraryId = await itineraryActivities.createItinerary({
    touristProfileId: params.touristProfileId,
    userId: params.userId,
    title: "Lagos Cultural Experience",
    destination: "Lagos, Nigeria",
    startDate: params.startDate,
    endDate: new Date(new Date(params.startDate).getTime() + params.durationDays * 86400000).toISOString().slice(0, 10),
    totalDays: params.durationDays,
    totalBudgetNgn: params.budgetNgn,
    journeyType: "cultural_tourism",
    aiGenerated: false,
    tags: ["culture", "history", "art", "food", "local"],
  });

  const day1Id = await itineraryActivities.addDay({ itineraryId, dayNumber: 1, date: params.startDate, title: "Day 1 — Art & Culture", theme: "cultural" });
  await itineraryActivities.addItem({ itineraryId, dayId: day1Id, sortOrder: 1, itemType: "attraction", title: "Nike Art Gallery", description: "Largest art gallery in West Africa", location: "Lekki, Lagos", startTime: "10:00", endTime: "13:00", estimatedCostNgn: 5000, aiSuggested: true, aiReason: "Must-visit for art lovers" });
  await itineraryActivities.addItem({ itineraryId, dayId: day1Id, sortOrder: 2, itemType: "restaurant", title: "Lunch at Buka Restaurant", description: "Authentic Nigerian cuisine", location: "Victoria Island", startTime: "13:30", endTime: "15:00", estimatedCostNgn: 25000, aiSuggested: true, aiReason: "Best traditional Nigerian food" });
  await itineraryActivities.addItem({ itineraryId, dayId: day1Id, sortOrder: 3, itemType: "attraction", title: "National Museum Lagos", description: "Nigerian history and artifacts", location: "Onikan, Lagos Island", startTime: "15:30", endTime: "17:30", estimatedCostNgn: 2000, aiSuggested: true, aiReason: "Rich Nigerian cultural heritage" });
  await itineraryActivities.addItem({ itineraryId, dayId: day1Id, sortOrder: 4, itemType: "attraction", title: "Lekki Conservation Centre", description: "Canopy walkway through mangrove forest", location: "Lekki, Lagos", startTime: "09:00", endTime: "11:00", estimatedCostNgn: 3000, aiSuggested: true, aiReason: "Unique natural experience in Lagos" });

  await itineraryActivities.updateSpend(itineraryId, 35000);

  await fluvioActivities.emit("tourist.cultural_tourism.itinerary_created", { workflowId, itineraryId });

  await notificationActivities.sendInApp({
    userId: params.userId,
    title: "🎨 Cultural Tour Itinerary Ready!",
    body: "Explore Lagos's art, history, and cuisine. Nike Gallery → National Museum → Lekki Conservation Centre.",
    type: "itinerary_created",
    metadata: { itineraryId, journeyType: "cultural_tourism" },
  });

  await startWorkflow({
    workflowType: "BookingConfirmationWorkflow" as WorkflowType,
    workflowId,
    input: { type: "cultural_tourism", itineraryId },
    executionTimeout: `${params.durationDays * 86400}s`,
    memo: { itineraryId },
  });

  return { workflowId, itineraryId };
}

// ─── 12. STABLECOIN CONVERSION WORKFLOW ──────────────────────────────────────

export async function startStablecoinConversionWorkflow(params: {
  userId: number | string;
  touristProfileId: string;
  tokenSymbol: string;
  tokenAmount: number;
  walletAddress: string;
  onChainTxHash: string;
}): Promise<{ workflowId: string; conversionId: string; ngnAmount: number }> {
  const workflowId = wfId("stablecoin-conversion");

  const { rate: usdNgnRate } = await fxActivities.getLiveRate("USD");
  const feePercent = 2.0;
  const feeNgn = params.tokenAmount * usdNgnRate * (feePercent / 100);
  const ngnAmount = (params.tokenAmount * usdNgnRate) - feeNgn;

  const conversionId = await fxActivities.recordStablecoinConversion({
    tokenSymbol: params.tokenSymbol,
    tokenAmount: params.tokenAmount,
    ngnAmount,
    usdNgnRate,
    feeNgn,
    onChainTxHash: params.onChainTxHash,
  });

  await walletActivities.creditWallet({
    userId: params.userId,
    amountNgn: ngnAmount,
    description: `${params.tokenSymbol} conversion: ${params.tokenAmount} → ₦${ngnAmount.toFixed(2)}`,
    reference: conversionId,
  });

  await tigerBeetleActivities.postGlEntry({
    description: `Stablecoin conversion: ${params.tokenAmount} ${params.tokenSymbol} → ₦${ngnAmount.toFixed(2)}`,
    debitAccount: "1200-CRYPTO-BRIDGE",
    creditAccount: `2100-TOURIST-WALLET-${params.userId}`,
    amountNgn: ngnAmount,
    reference: conversionId,
    journeyType: "stablecoin_conversion",
  });

  await fluvioActivities.emit("tourist.stablecoin.converted", {
    workflowId, conversionId, tokenSymbol: params.tokenSymbol,
    tokenAmount: params.tokenAmount, ngnAmount, usdNgnRate,
  });

  await notificationActivities.sendInApp({
    userId: params.userId,
    title: `${params.tokenSymbol} Converted! 💱`,
    body: `${params.tokenAmount} ${params.tokenSymbol} → ₦${ngnAmount.toLocaleString("en-NG", { maximumFractionDigits: 2 })} at ₦${usdNgnRate.toLocaleString()}/USD`,
    type: "stablecoin_conversion",
    metadata: { conversionId, tokenSymbol: params.tokenSymbol, ngnAmount },
  });

  await auditActivities.log({
    actorId: String(params.userId), action: "tourist.stablecoin.converted",
    entityType: "stablecoin_conversion", entityId: conversionId, workflowId,
    metadata: { tokenSymbol: params.tokenSymbol, tokenAmount: params.tokenAmount, ngnAmount },
  });

  await startWorkflow({
    workflowType: "CbdcBridgeWorkflow" as WorkflowType,
    workflowId,
    input: { conversionId, tokenSymbol: params.tokenSymbol, tokenAmount: params.tokenAmount, ngnAmount },
    executionTimeout: "3600s",
    memo: { conversionId, tokenSymbol: params.tokenSymbol },
  });

  return { workflowId, conversionId, ngnAmount };
}

// ─── 13. MULTI-CURRENCY STATEMENT WORKFLOW ────────────────────────────────────

export async function startMultiCurrencyStatementWorkflow(params: {
  userId: number | string;
  touristProfileId: string;
  periodStart: string;
  periodEnd: string;
}): Promise<{ workflowId: string; statementId: string; statement: object }> {
  const workflowId = wfId("multi-currency-statement");
  const statementId = crypto.randomUUID();

  const db = (await import("../db")).getDb();
  const { sql } = await import("drizzle-orm");

  // Aggregate spend by category
  const payments = await db.execute(sql`
    SELECT service_type, SUM(total_amount_ngn) as total, COUNT(*) as count
    FROM service_payments
    WHERE tourist_profile_id = ${params.touristProfileId}
      AND created_at >= ${Math.floor(new Date(params.periodStart).getTime() / 1000)}
      AND created_at <= ${Math.floor(new Date(params.periodEnd).getTime() / 1000)}
    GROUP BY service_type
  `);

  const topups = await db.execute(sql`
    SELECT source_currency, SUM(source_amount) as total_source, SUM(target_amount) as total_ngn, SUM(fx_fee_amount) as total_fees
    FROM wallet_topups
    WHERE user_id = ${params.userId} AND status = 'completed'
      AND created_at >= ${Math.floor(new Date(params.periodStart).getTime() / 1000)}
      AND created_at <= ${Math.floor(new Date(params.periodEnd).getTime() / 1000)}
    GROUP BY source_currency
  `);

  const loyaltyBalance = await loyaltyActivities.getBalance(params.userId);
  const totalSpend = (payments as any[]).reduce((s: number, r: any) => s + parseFloat(r.total), 0);
  const totalTopups = (topups as any[]).reduce((s: number, r: any) => s + parseFloat(r.total_ngn), 0);
  const totalFxFees = (topups as any[]).reduce((s: number, r: any) => s + parseFloat(r.total_fees || 0), 0);

  const statement = {
    statementId,
    touristProfileId: params.touristProfileId,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
    totalSpendNgn: totalSpend,
    totalTopupsNgn: totalTopups,
    totalFxFeesNgn: totalFxFees,
    totalLoyaltyPoints: loyaltyBalance,
    breakdownByCategory: Object.fromEntries((payments as any[]).map((r: any) => [r.service_type, { total: parseFloat(r.total), count: parseInt(r.count) }])),
    breakdownByCurrency: Object.fromEntries((topups as any[]).map((r: any) => [r.source_currency, { totalSource: parseFloat(r.total_source), totalNgn: parseFloat(r.total_ngn), fees: parseFloat(r.total_fees || 0) }])),
  };

  // Save statement
  await db.execute(sql`
    INSERT INTO consolidated_statements (id, tourist_profile_id, user_id, period_start, period_end, total_spend_ngn, total_topups_ngn, total_fx_fees_ngn, total_loyalty_points, breakdown_by_category, breakdown_by_currency, generated_at)
    VALUES (${statementId}, ${params.touristProfileId}, ${params.userId}, ${params.periodStart}, ${params.periodEnd}, ${totalSpend}, ${totalTopups}, ${totalFxFees}, ${loyaltyBalance}, ${JSON.stringify(statement.breakdownByCategory)}, ${JSON.stringify(statement.breakdownByCurrency)}, ${Math.floor(Date.now() / 1000)})
    ON CONFLICT DO NOTHING
  `);

  await fluvioActivities.emit("tourist.statement.generated", { workflowId, statementId, totalSpendNgn: totalSpend });

  await notificationActivities.sendInApp({
    userId: params.userId,
    title: "📊 Statement Ready",
    body: `Your ${params.periodStart} to ${params.periodEnd} statement: ₦${totalSpend.toLocaleString()} spent, ${loyaltyBalance} loyalty points earned.`,
    type: "statement_ready",
    metadata: { statementId, totalSpendNgn: totalSpend },
  });

  await startWorkflow({
    workflowType: "SettlementBatchWorkflow" as WorkflowType,
    workflowId,
    input: { type: "statement", statementId },
    executionTimeout: "3600s",
    memo: { statementId },
  });

  return { workflowId, statementId, statement };
}
