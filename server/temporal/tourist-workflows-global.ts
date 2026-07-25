/**
 * TourismPay Global Tourist Journey Workflows
 * Location-aware Temporal workflows for all tourist scenarios.
 * Nigeria is the primary destination hub but ALL journeys work
 * for any origin → destination country pair.
 */
import { startWorkflow, signalWorkflow, getWorkflowStatus } from "../_core/temporal-integration";
import {
  COUNTRIES, CURRENCIES, PAYMENT_RAILS, DIASPORA_CORRIDORS,
  calculateTax, getPaymentRails, getPrimaryAirport, getSettlementDays,
} from "../_core/global-registry";

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface GlobalWalletTopupInput {
  userId: number;
  touristProfileId: string;
  fromCurrency: string;        // e.g. "USD", "GBP", "USDC"
  fromCountryCode: string;     // e.g. "US", "GB"
  toCountryCode: string;       // Destination country (e.g. "NG", "KE", "GH")
  toCurrency: string;          // Destination currency (e.g. "NGN", "KES", "GHS")
  amount: number;              // Amount in fromCurrency
  paymentRail: string;         // e.g. "wise", "card", "stablecoin"
  paymentReference?: string;
}

export interface GlobalTouristPaymentInput {
  userId: number;
  touristProfileId: string;
  merchantId: string;
  merchantCountryCode: string;
  merchantType: string;
  amountInLocalCurrency: number;
  localCurrency: string;       // Merchant's local currency
  walletCurrency: string;      // Tourist's wallet currency
  isTourist: boolean;
  tipAmount?: number;
  tipCurrency?: string;
  description: string;
  itineraryItemId?: string;
}

export interface GlobalMerchantPaymentInput {
  merchantId: string;
  merchantCountryCode: string;
  merchantType: string;
  touristUserId: number;
  amountNgn?: number;          // If paying in NGN
  amountLocal?: number;        // If paying in merchant's local currency
  localCurrency?: string;
  description: string;
}

export interface GlobalArrivalInput {
  touristProfileId: string;
  userId: number;
  originCountryCode: string;   // Where tourist is flying from
  destinationCountryCode: string; // Where tourist is arriving
  destinationCity: string;
  arrivalAirportCode: string;
  flightNumber?: string;
  arrivalDateTime: number;
  needsTransfer: boolean;
  needsSimCard: boolean;
  preferredLanguage?: string;
}

export interface GlobalGroupBookingInput {
  organizerTouristProfileId: string;
  organizerUserId: number;
  bookingType: string;
  referenceId: string;
  destinationCountryCode: string;
  participants: Array<{ name: string; email: string; phone?: string }>;
  totalAmountLocal: number;
  localCurrency: string;
  splitMethod: "equal" | "custom";
  customSplits?: Record<string, number>;
}

// ─── GLOBAL WALLET TOP-UP WORKFLOW ───────────────────────────────────────────

export async function startGlobalWalletTopupWorkflow(input: GlobalWalletTopupInput): Promise<string> {
  const fromCurrency = CURRENCIES[input.fromCurrency];
  const toCurrency = CURRENCIES[input.toCurrency];
  const destinationCountry = COUNTRIES[input.toCountryCode];

  if (!fromCurrency) throw new Error(`Unsupported currency: ${input.fromCurrency}`);
  if (!toCurrency) throw new Error(`Unsupported currency: ${input.toCurrency}`);
  if (!destinationCountry) throw new Error(`Unsupported destination country: ${input.toCountryCode}`);

  // Validate payment rail is supported for this currency/country combination
  const availableRails = getPaymentRails(input.fromCurrency, input.toCurrency, input.fromCountryCode);
  const selectedRail = availableRails.find(r => r.rail === input.paymentRail);
  if (!selectedRail && availableRails.length > 0) {
    // Fall back to best available rail
    input.paymentRail = availableRails[0].rail;
  }

  const workflowId = `topup-${input.touristProfileId}-${Date.now()}`;

  await startWorkflow({
    workflowType: "BookingConfirmationWorkflow",
    workflowId,
    taskQueue: "tourismpay-journeys",
    input: {
      journeyType: "wallet_topup",
      userId: input.userId,
      touristProfileId: input.touristProfileId,
      fromCurrency: input.fromCurrency,
      fromCountryCode: input.fromCountryCode,
      toCountryCode: input.toCountryCode,
      toCurrency: input.toCurrency,
      amount: input.amount,
      paymentRail: input.paymentRail,
      paymentReference: input.paymentReference,
      isStablecoin: fromCurrency.isStablecoin ?? false,
      isCrypto: fromCurrency.isCrypto ?? false,
      destinationCountryName: destinationCountry.name,
      destinationCurrencySymbol: toCurrency.symbol,
      processingTimeMinutes: selectedRail?.processingTimeMinutes ?? 60,
      feePercent: selectedRail?.feePercent ?? 0.005,
      feeFixed: selectedRail?.feeFixed ?? 0,
    },
    searchAttributes: {
      "journey-type": "wallet_topup",
      "from-country": input.fromCountryCode,
      "to-country": input.toCountryCode,
      "currency-pair": `${input.fromCurrency}-${input.toCurrency}`,
    },
  });

  return workflowId;
}

// ─── GLOBAL TOURIST PAYMENT WORKFLOW ─────────────────────────────────────────

export async function startGlobalTouristPaymentWorkflow(input: GlobalTouristPaymentInput): Promise<string> {
  const merchantCountry = COUNTRIES[input.merchantCountryCode] ?? COUNTRIES["NG"];

  // Calculate taxes based on merchant's country, not tourist's origin
  const taxCalc = calculateTax(
    input.amountInLocalCurrency,
    input.merchantCountryCode,
    input.merchantType,
    input.isTourist
  );

  const workflowId = `payment-${input.touristProfileId}-${Date.now()}`;

  await startWorkflow({
    workflowType: "BookingConfirmationWorkflow",
    workflowId,
    taskQueue: "tourismpay-journeys",
    input: {
      journeyType: "tourist_payment",
      userId: input.userId,
      touristProfileId: input.touristProfileId,
      merchantId: input.merchantId,
      merchantCountryCode: input.merchantCountryCode,
      merchantType: input.merchantType,
      amountInLocalCurrency: input.amountInLocalCurrency,
      localCurrency: input.localCurrency,
      walletCurrency: input.walletCurrency,
      isTourist: input.isTourist,
      tipAmount: input.tipAmount ?? 0,
      tipCurrency: input.tipCurrency ?? input.localCurrency,
      description: input.description,
      itineraryItemId: input.itineraryItemId,
      // Tax details from merchant's country rules
      vatRate: taxCalc.vatRate,
      vatAmount: taxCalc.vatAmount,
      vatName: merchantCountry.vatName,
      serviceChargeRate: taxCalc.serviceChargeRate,
      serviceChargeAmount: taxCalc.serviceChargeAmount,
      touristTaxRate: taxCalc.touristTaxRate,
      touristTaxAmount: taxCalc.touristTaxAmount,
      totalWithTax: taxCalc.totalWithTax,
      // Settlement
      settlementDays: getSettlementDays(input.merchantCountryCode, input.merchantType),
      regulatoryBody: merchantCountry.regulatoryBody,
    },
    searchAttributes: {
      "journey-type": "tourist_payment",
      "merchant-country": input.merchantCountryCode,
      "merchant-type": input.merchantType,
      "currency": input.localCurrency,
    },
  });

  return workflowId;
}

// ─── GLOBAL AIRPORT ARRIVAL WORKFLOW ─────────────────────────────────────────

export async function startGlobalArrivalWorkflow(input: GlobalArrivalInput): Promise<string> {
  const originCountry = COUNTRIES[input.originCountryCode];
  const destinationCountry = COUNTRIES[input.destinationCountryCode];

  if (!destinationCountry) throw new Error(`Unsupported destination: ${input.destinationCountryCode}`);

  const workflowId = `arrival-${input.touristProfileId}-${Date.now()}`;

  await startWorkflow({
    workflowType: "BookingConfirmationWorkflow",
    workflowId,
    taskQueue: "tourismpay-journeys",
    input: {
      journeyType: "airport_arrival",
      userId: input.userId,
      touristProfileId: input.touristProfileId,
      originCountryCode: input.originCountryCode,
      originCountryName: originCountry?.name ?? "Unknown",
      originCurrency: originCountry?.currency ?? "USD",
      destinationCountryCode: input.destinationCountryCode,
      destinationCountryName: destinationCountry.name,
      destinationCurrency: destinationCountry.currency,
      destinationCity: input.destinationCity,
      arrivalAirportCode: input.arrivalAirportCode,
      flightNumber: input.flightNumber,
      arrivalDateTime: input.arrivalDateTime,
      needsTransfer: input.needsTransfer,
      needsSimCard: input.needsSimCard,
      preferredLanguage: input.preferredLanguage ?? "English",
      availablePaymentMethods: destinationCountry.paymentMethods,
      timezone: destinationCountry.timezone,
    },
    searchAttributes: {
      "journey-type": "airport_arrival",
      "origin-country": input.originCountryCode,
      "destination-country": input.destinationCountryCode,
      "destination-city": input.destinationCity,
    },
  });

  return workflowId;
}

// ─── GLOBAL GROUP BOOKING WORKFLOW ────────────────────────────────────────────

export async function startGlobalGroupBookingWorkflow(input: GlobalGroupBookingInput): Promise<string> {
  const destinationCountry = COUNTRIES[input.destinationCountryCode] ?? COUNTRIES["NG"];
  const shareCode = `GRP-${Date.now().toString(36).toUpperCase().slice(-6)}`;

  // Calculate per-person share
  const participantCount = input.participants.length + 1; // +1 for organizer
  const equalShare = input.totalAmountLocal / participantCount;

  const workflowId = `group-${input.organizerTouristProfileId}-${Date.now()}`;

  await startWorkflow({
    workflowType: "BookingConfirmationWorkflow",
    workflowId,
    taskQueue: "tourismpay-journeys",
    input: {
      journeyType: "group_booking",
      organizerTouristProfileId: input.organizerTouristProfileId,
      organizerUserId: input.organizerUserId,
      bookingType: input.bookingType,
      referenceId: input.referenceId,
      destinationCountryCode: input.destinationCountryCode,
      destinationCountryName: destinationCountry.name,
      destinationCurrency: destinationCountry.currency,
      participants: input.participants,
      totalAmountLocal: input.totalAmountLocal,
      localCurrency: input.localCurrency,
      splitMethod: input.splitMethod,
      customSplits: input.customSplits,
      equalShareAmount: equalShare,
      shareCode,
      participantCount,
    },
    searchAttributes: {
      "journey-type": "group_booking",
      "destination-country": input.destinationCountryCode,
      "booking-type": input.bookingType,
    },
  });

  return workflowId;
}

// ─── GLOBAL STABLECOIN CONVERSION WORKFLOW ────────────────────────────────────

export async function startGlobalStablecoinConversionWorkflow(input: {
  userId: number;
  touristProfileId: string;
  fromStablecoin: string;      // e.g. "USDC", "USDT", "DAI", "CNGN"
  toFiatCurrency: string;      // e.g. "NGN", "KES", "GHS", "USD"
  toCountryCode: string;
  amount: number;
  walletAddress?: string;
  network?: string;            // e.g. "ethereum", "polygon", "tron"
}): Promise<string> {
  const fromCurrency = CURRENCIES[input.fromStablecoin];
  const toCurrency = CURRENCIES[input.toFiatCurrency];
  const toCountry = COUNTRIES[input.toCountryCode];

  if (!fromCurrency?.isStablecoin) throw new Error(`${input.fromStablecoin} is not a supported stablecoin`);
  if (!toCurrency) throw new Error(`Unsupported fiat currency: ${input.toFiatCurrency}`);

  const workflowId = `stable-${input.touristProfileId}-${Date.now()}`;

  await startWorkflow({
    workflowType: "CbdcBridgeWorkflow",
    workflowId,
    taskQueue: "tourismpay-journeys",
    input: {
      journeyType: "stablecoin_conversion",
      userId: input.userId,
      touristProfileId: input.touristProfileId,
      fromStablecoin: input.fromStablecoin,
      toFiatCurrency: input.toFiatCurrency,
      toCountryCode: input.toCountryCode,
      toCountryName: toCountry?.name ?? "Unknown",
      amount: input.amount,
      walletAddress: input.walletAddress,
      network: input.network ?? CURRENCIES[input.fromStablecoin].paymentRails[0],
      feePercent: PAYMENT_RAILS.stablecoin.feePercent,
    },
    searchAttributes: {
      "journey-type": "stablecoin_conversion",
      "from-stablecoin": input.fromStablecoin,
      "to-currency": input.toFiatCurrency,
      "to-country": input.toCountryCode,
    },
  });

  return workflowId;
}

// ─── GLOBAL MULTI-CURRENCY STATEMENT WORKFLOW ─────────────────────────────────

export async function startGlobalMultiCurrencyStatementWorkflow(input: {
  userId: number;
  touristProfileId: string;
  periodStart: string;
  periodEnd: string;
  currencies: string[];        // All currencies the tourist spent in
  countriesVisited: string[];  // All countries visited
}): Promise<string> {
  const workflowId = `statement-${input.touristProfileId}-${Date.now()}`;

  await startWorkflow({
    workflowType: "SettlementBatchWorkflow",
    workflowId,
    taskQueue: "tourismpay-journeys",
    input: {
      journeyType: "multi_currency_statement",
      userId: input.userId,
      touristProfileId: input.touristProfileId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      currencies: input.currencies,
      countriesVisited: input.countriesVisited,
      countryDetails: input.countriesVisited.map(code => ({
        code,
        name: COUNTRIES[code]?.name ?? code,
        currency: COUNTRIES[code]?.currency ?? "USD",
        vatName: COUNTRIES[code]?.vatName ?? "VAT",
      })),
    },
    searchAttributes: {
      "journey-type": "multi_currency_statement",
      "countries-count": String(input.countriesVisited.length),
    },
  });

  return workflowId;
}

// ─── GLOBAL HIGH-VALUE TRANSACTION WORKFLOW ───────────────────────────────────

export async function startGlobalHighValueTransactionWorkflow(input: {
  userId: number;
  touristProfileId: string;
  transactionId: string;
  amountLocal: number;
  localCurrency: string;
  countryCode: string;
  merchantId: string;
  merchantType: string;
}): Promise<string> {
  const country = COUNTRIES[input.countryCode] ?? COUNTRIES["NG"];

  // Convert to USD equivalent for AML threshold check
  // AML threshold varies by country
  const isHighValue = input.amountLocal >= country.amlThreshold;

  const workflowId = `hvt-${input.touristProfileId}-${Date.now()}`;

  await startWorkflow({
    workflowType: "ComplianceCheckWorkflow",
    workflowId,
    taskQueue: "tourismpay-journeys",
    input: {
      journeyType: "high_value_transaction",
      userId: input.userId,
      touristProfileId: input.touristProfileId,
      transactionId: input.transactionId,
      amountLocal: input.amountLocal,
      localCurrency: input.localCurrency,
      countryCode: input.countryCode,
      countryName: country.name,
      amlThreshold: country.amlThreshold,
      regulatoryBody: country.regulatoryBody,
      merchantId: input.merchantId,
      merchantType: input.merchantType,
      isHighValue,
      requiresBiometric: isHighValue,
      requiresEnhancedKyc: input.amountLocal >= country.amlThreshold * 2,
    },
    searchAttributes: {
      "journey-type": "high_value_transaction",
      "country": input.countryCode,
      "currency": input.localCurrency,
    },
  });

  return workflowId;
}

// ─── GLOBAL REFUND WORKFLOW ───────────────────────────────────────────────────

export async function startGlobalRefundWorkflow(input: {
  userId: number;
  touristProfileId: string;
  originalTransactionId: string;
  bookingType: string;
  bookingReferenceId: string;
  merchantId: string;
  merchantCountryCode: string;
  requestedAmountLocal: number;
  localCurrency: string;
  walletCurrency: string;
  reason: string;
  description: string;
  evidenceUrls?: string[];
}): Promise<string> {
  const merchantCountry = COUNTRIES[input.merchantCountryCode] ?? COUNTRIES["NG"];
  const workflowId = `refund-${input.touristProfileId}-${Date.now()}`;

  await startWorkflow({
    workflowType: "RefundWorkflow",
    workflowId,
    taskQueue: "tourismpay-journeys",
    input: {
      journeyType: "refund",
      userId: input.userId,
      touristProfileId: input.touristProfileId,
      originalTransactionId: input.originalTransactionId,
      bookingType: input.bookingType,
      bookingReferenceId: input.bookingReferenceId,
      merchantId: input.merchantId,
      merchantCountryCode: input.merchantCountryCode,
      merchantCountryName: merchantCountry.name,
      requestedAmountLocal: input.requestedAmountLocal,
      localCurrency: input.localCurrency,
      walletCurrency: input.walletCurrency,
      reason: input.reason,
      description: input.description,
      evidenceUrls: input.evidenceUrls ?? [],
      regulatoryBody: merchantCountry.regulatoryBody,
    },
    searchAttributes: {
      "journey-type": "refund",
      "merchant-country": input.merchantCountryCode,
      "booking-type": input.bookingType,
    },
  });

  return workflowId;
}

// ─── GLOBAL AI TRIP PLANNER WORKFLOW ─────────────────────────────────────────

export async function startGlobalAiTripPlannerWorkflow(input: {
  userId: number;
  touristProfileId: string;
  originCountryCode: string;
  destinationCountryCode: string;
  destinationCity: string;
  startDate: string;
  endDate: string;
  budget: number;
  budgetCurrency: string;
  interests: string[];
  groupSize: number;
  accommodationType: string;
  prompt?: string;
}): Promise<string> {
  const originCountry = COUNTRIES[input.originCountryCode];
  const destinationCountry = COUNTRIES[input.destinationCountryCode] ?? COUNTRIES["NG"];

  const workflowId = `ai-trip-${input.touristProfileId}-${Date.now()}`;

  await startWorkflow({
    workflowType: "BookingConfirmationWorkflow",
    workflowId,
    taskQueue: "tourismpay-journeys",
    input: {
      journeyType: "ai_trip_planner",
      userId: input.userId,
      touristProfileId: input.touristProfileId,
      originCountryCode: input.originCountryCode,
      originCountryName: originCountry?.name ?? "Unknown",
      originCurrency: originCountry?.currency ?? "USD",
      destinationCountryCode: input.destinationCountryCode,
      destinationCountryName: destinationCountry.name,
      destinationCurrency: destinationCountry.currency,
      destinationCity: input.destinationCity,
      startDate: input.startDate,
      endDate: input.endDate,
      budget: input.budget,
      budgetCurrency: input.budgetCurrency,
      interests: input.interests,
      groupSize: input.groupSize,
      accommodationType: input.accommodationType,
      prompt: input.prompt ?? `Plan a ${input.groupSize}-person trip to ${input.destinationCity}, ${destinationCountry.name} from ${input.startDate} to ${input.endDate} with a budget of ${input.budget} ${input.budgetCurrency}. Interests: ${input.interests.join(", ")}.`,
      vatRate: destinationCountry.vatRate,
      vatName: destinationCountry.vatName,
      timezone: destinationCountry.timezone,
      languages: destinationCountry.languages,
      paymentMethods: destinationCountry.paymentMethods,
    },
    searchAttributes: {
      "journey-type": "ai_trip_planner",
      "origin-country": input.originCountryCode,
      "destination-country": input.destinationCountryCode,
      "destination-city": input.destinationCity,
    },
  });

  return workflowId;
}

// ─── GLOBAL AI CONCIERGE WORKFLOW ─────────────────────────────────────────────

export async function startGlobalAiConciergeWorkflow(input: {
  userId: number;
  touristProfileId: string;
  currentCountryCode: string;
  currentCity: string;
  sessionType: string;
  context?: Record<string, unknown>;
}): Promise<string> {
  const currentCountry = COUNTRIES[input.currentCountryCode] ?? COUNTRIES["NG"];
  const workflowId = `concierge-${input.touristProfileId}-${Date.now()}`;

  await startWorkflow({
    workflowType: "BookingConfirmationWorkflow",
    workflowId,
    taskQueue: "tourismpay-journeys",
    input: {
      journeyType: "ai_concierge",
      userId: input.userId,
      touristProfileId: input.touristProfileId,
      currentCountryCode: input.currentCountryCode,
      currentCountryName: currentCountry.name,
      currentCurrency: currentCountry.currency,
      currentCity: input.currentCity,
      sessionType: input.sessionType,
      context: input.context ?? {},
      vatRate: currentCountry.vatRate,
      vatName: currentCountry.vatName,
      languages: currentCountry.languages,
      paymentMethods: currentCountry.paymentMethods,
      timezone: currentCountry.timezone,
      systemPrompt: `You are TourismPay's AI Concierge for ${input.currentCity}, ${currentCountry.name}. 
You help tourists with bookings, payments, recommendations, and local information.
Local currency: ${currentCountry.currency}. VAT rate: ${(currentCountry.vatRate * 100).toFixed(1)}% (${currentCountry.vatName}).
Available payment methods: ${currentCountry.paymentMethods.join(", ")}.
Regulatory body: ${currentCountry.regulatoryBody}.
Always provide prices in ${currentCountry.currency} and convert to tourist's home currency when asked.`,
    },
    searchAttributes: {
      "journey-type": "ai_concierge",
      "current-country": input.currentCountryCode,
      "current-city": input.currentCity,
    },
  });

  return workflowId;
}

// ─── GLOBAL SOS ALERT WORKFLOW ────────────────────────────────────────────────

export async function startGlobalSosAlertWorkflow(input: {
  touristProfileId: string;
  userId: number;
  currentCountryCode: string;
  currentCity: string;
  latitude?: number;
  longitude?: number;
  alertType: string;
  description: string;
  emergencyContactIds: string[];
}): Promise<string> {
  const currentCountry = COUNTRIES[input.currentCountryCode] ?? COUNTRIES["NG"];
  const workflowId = `sos-${input.touristProfileId}-${Date.now()}`;

  await startWorkflow({
    workflowType: "FraudInvestigationWorkflow",
    workflowId,
    taskQueue: "tourismpay-journeys",
    input: {
      journeyType: "sos_alert",
      touristProfileId: input.touristProfileId,
      userId: input.userId,
      currentCountryCode: input.currentCountryCode,
      currentCountryName: currentCountry.name,
      currentCity: input.currentCity,
      latitude: input.latitude,
      longitude: input.longitude,
      alertType: input.alertType,
      description: input.description,
      emergencyContactIds: input.emergencyContactIds,
      localEmergencyNumber: getLocalEmergencyNumber(input.currentCountryCode),
      localEmbassyInfo: getEmbassyInfo(input.currentCountryCode),
    },
    searchAttributes: {
      "journey-type": "sos_alert",
      "country": input.currentCountryCode,
      "city": input.currentCity,
    },
  });

  return workflowId;
}

// ─── HELPER: LOCAL EMERGENCY NUMBERS ─────────────────────────────────────────

function getLocalEmergencyNumber(countryCode: string): string {
  const numbers: Record<string, string> = {
    NG: "199 (Police) / 112 (Emergency) / 123 (Fire)",
    GH: "191 (Police) / 192 (Fire) / 193 (Ambulance)",
    KE: "999 (Police) / 112 (Emergency)",
    ZA: "10111 (Police) / 10177 (Ambulance) / 112 (Emergency)",
    EG: "122 (Police) / 123 (Ambulance) / 180 (Fire)",
    MA: "19 (Police) / 15 (Ambulance) / 150 (Fire)",
    TZ: "112 (Emergency) / 111 (Police)",
    RW: "112 (Emergency) / 113 (Police)",
    US: "911",
    GB: "999 / 112",
    EU: "112",
    AE: "999 (Police) / 998 (Ambulance) / 997 (Fire)",
    IN: "100 (Police) / 102 (Ambulance) / 101 (Fire)",
  };
  return numbers[countryCode] ?? "112 (International Emergency)";
}

function getEmbassyInfo(hostCountryCode: string): string {
  // Returns general embassy contact guidance
  return `Contact your country's embassy in ${COUNTRIES[hostCountryCode]?.name ?? hostCountryCode}. Visit embassy.com or call your home country's 24-hour consular emergency line.`;
}
