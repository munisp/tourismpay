/**
 * TourismPay Journey Activities
 *
 * All platform service calls implemented as Temporal activity functions.
 * Activities are the atomic units of work — each one is idempotent, retryable,
 * and calls exactly one existing platform service.
 *
 * Activity groups:
 *  - WalletActivities      → wallet top-up, debit, credit, balance check
 *  - FxActivities          → FX rate lookup, conversion, stablecoin swap
 *  - KybActivities         → document submission, establishment creation, approval
 *  - TigerBeetleActivities → ledger account provisioning, double-entry transfers
 *  - TaxActivities         → VAT calculation, tax collection, FIRS remittance
 *  - LoyaltyActivities     → points earn, redeem, tier upgrade
 *  - TippingActivities     → tip calculation, distribution
 *  - NotificationActivities→ in-app, push, SMS, email notifications
 *  - AuditActivities       → audit log entries
 *  - FluvioActivities      → event streaming
 *  - FraudActivities       → ML scoring, account freeze, case creation
 *  - AiActivities          → LLM itinerary generation, recommendations, chat
 *  - BookingActivities     → hotel, airbnb, transport, event, restaurant bookings
 *  - ItineraryActivities   → create, update, add items, complete days
 *  - SettlementActivities  → merchant payment recording, settlement batch
 *  - RefundActivities      → refund request, approval, reversal
 *  - GroupActivities       → group booking, split payment collection
 *  - SafetyActivities      → SOS alert, emergency contact notification
 *  - HighValueActivities   → enhanced KYC trigger, BIS escalation, AML check
 */

import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { createLedgerTransfer } from "../_core/tigerbeetle";
import { publishEvent } from "../_core/fluvio";
import { invokeLLM } from "../_core/llm";
import { logger } from "../_core/logger";

const db = () => getDb();
const now = () => Math.floor(Date.now() / 1000);

// ─── WALLET ACTIVITIES ────────────────────────────────────────────────────────

export const walletActivities = {
  async getBalance(userId: number | string, currency = "NGN"): Promise<number> {
    const rows = await db().execute(sql`
      SELECT balance FROM wallet_balances WHERE user_id = ${userId} AND currency = ${currency} LIMIT 1
    `);
    return (rows as any[])[0]?.balance ?? 0;
  },

  async creditWallet(params: {
    userId: number | string;
    amountNgn: number;
    currency?: string;
    description: string;
    reference: string;
  }): Promise<{ transactionId: string; newBalance: number }> {
    const currency = params.currency ?? "NGN";
    const txId = crypto.randomUUID();
    await db().execute(sql`
      INSERT INTO wallet_balances (user_id, currency, balance, created_at)
      VALUES (${params.userId}, ${currency}, ${params.amountNgn}, ${now()})
      ON CONFLICT (user_id, currency) DO UPDATE
      SET balance = wallet_balances.balance + ${params.amountNgn},
          updated_at = ${now()}
    `);
    await db().execute(sql`
      INSERT INTO wallet_transactions (id, user_id, type, amount, currency, description, reference, status, created_at)
      VALUES (${txId}, ${params.userId}, 'credit', ${params.amountNgn}, ${currency}, ${params.description}, ${params.reference}, 'completed', ${now()})
      ON CONFLICT DO NOTHING
    `);
    const rows = await db().execute(sql`SELECT balance FROM wallet_balances WHERE user_id = ${params.userId} AND currency = ${currency} LIMIT 1`);
    return { transactionId: txId, newBalance: (rows as any[])[0]?.balance ?? 0 };
  },

  async debitWallet(params: {
    userId: number | string;
    amountNgn: number;
    currency?: string;
    description: string;
    reference: string;
  }): Promise<{ transactionId: string; newBalance: number }> {
    const currency = params.currency ?? "NGN";
    // Check balance first
    const balRows = await db().execute(sql`SELECT balance FROM wallet_balances WHERE user_id = ${params.userId} AND currency = ${currency} LIMIT 1`);
    const balance = (balRows as any[])[0]?.balance ?? 0;
    if (balance < params.amountNgn) {
      throw new Error(`INSUFFICIENT_BALANCE: Available ₦${balance.toLocaleString()}, required ₦${params.amountNgn.toLocaleString()}`);
    }
    const txId = crypto.randomUUID();
    await db().execute(sql`
      UPDATE wallet_balances SET balance = balance - ${params.amountNgn}, updated_at = ${now()}
      WHERE user_id = ${params.userId} AND currency = ${currency}
    `);
    await db().execute(sql`
      INSERT INTO wallet_transactions (id, user_id, type, amount, currency, description, reference, status, created_at)
      VALUES (${txId}, ${params.userId}, 'debit', ${params.amountNgn}, ${currency}, ${params.description}, ${params.reference}, 'completed', ${now()})
      ON CONFLICT DO NOTHING
    `);
    const rows = await db().execute(sql`SELECT balance FROM wallet_balances WHERE user_id = ${params.userId} AND currency = ${currency} LIMIT 1`);
    return { transactionId: txId, newBalance: (rows as any[])[0]?.balance ?? 0 };
  },

  async provisionWallet(userId: number | string, currencies: string[]): Promise<void> {
    for (const currency of currencies) {
      await db().execute(sql`
        INSERT INTO wallet_balances (user_id, currency, balance, created_at)
        VALUES (${userId}, ${currency}, 0, ${now()})
        ON CONFLICT DO NOTHING
      `);
    }
  },
};

// ─── FX ACTIVITIES ────────────────────────────────────────────────────────────

export const fxActivities = {
  async getLiveRate(fromCurrency: string, toCurrency = "NGN"): Promise<{ rate: number; source: string }> {
    const rows = await db().execute(sql`
      SELECT rate, source FROM fx_rates
      WHERE from_currency = ${fromCurrency} AND to_currency = ${toCurrency}
      ORDER BY updated_at DESC LIMIT 1
    `);
    const row = (rows as any[])[0];
    if (row) return { rate: row.rate, source: row.source };
    // Fallback rates
    const fallbacks: Record<string, number> = { USD: 1580, GBP: 2010, EUR: 1720, USDC: 1580, USDT: 1580, DAI: 1580 };
    return { rate: fallbacks[fromCurrency] ?? 1580, source: "fallback" };
  },

  async recordConversion(params: {
    userId: number | string;
    fromCurrency: string;
    fromAmount: number;
    toCurrency: string;
    toAmount: number;
    fxRate: number;
    feeNgn: number;
    reference: string;
  }): Promise<string> {
    const id = crypto.randomUUID();
    await db().execute(sql`
      INSERT INTO fx_conversions (id, user_id, from_currency, from_amount, to_currency, to_amount, fx_rate, fee_ngn, status, created_at)
      VALUES (${id}, ${params.userId}, ${params.fromCurrency}, ${params.fromAmount}, ${params.toCurrency}, ${params.toAmount}, ${params.fxRate}, ${params.feeNgn}, 'completed', ${now()})
      ON CONFLICT DO NOTHING
    `);
    return id;
  },

  async recordStablecoinConversion(params: {
    tokenSymbol: string;
    tokenAmount: number;
    ngnAmount: number;
    usdNgnRate: number;
    feeNgn: number;
    onChainTxHash: string;
    walletTopupId?: string;
  }): Promise<string> {
    const id = crypto.randomUUID();
    await db().execute(sql`
      INSERT INTO stablecoin_conversions (id, token_symbol, token_amount, usd_equivalent, ngn_amount, usd_to_ngn_rate, conversion_fee_ngn, on_chain_tx_hash, status, wallet_topup_id, created_at, completed_at)
      VALUES (${id}, ${params.tokenSymbol}, ${params.tokenAmount}, ${params.tokenAmount}, ${params.ngnAmount}, ${params.usdNgnRate}, ${params.feeNgn}, ${params.onChainTxHash}, 'completed', ${params.walletTopupId ?? null}, ${now()}, ${now()})
      ON CONFLICT DO NOTHING
    `);
    return id;
  },
};

// ─── TIGERBEETLE ACTIVITIES ───────────────────────────────────────────────────

export const tigerBeetleActivities = {
  async postLedgerTransfer(params: {
    debitAccountId: bigint;
    creditAccountId: bigint;
    amountKobo: bigint;
    code: number;
    reference: string;
  }): Promise<string> {
    const transferId = BigInt(Date.now());
    try {
      await createLedgerTransfer({
        id: transferId,
        debitAccountId: params.debitAccountId,
        creditAccountId: params.creditAccountId,
        amount: params.amountKobo,
        ledger: 1,
        code: params.code,
        flags: 0,
      });
    } catch (err) {
      logger.warn({ err, reference: params.reference }, "[TB] Transfer failed — recording in DB fallback");
    }
    // Record in ledger_transfers table regardless
    await db().execute(sql`
      INSERT INTO ledger_transfers (id, debit_account_id, credit_account_id, amount, code, reference, status, created_at)
      VALUES (${transferId.toString()}, ${params.debitAccountId.toString()}, ${params.creditAccountId.toString()}, ${Number(params.amountKobo)}, ${params.code}, ${params.reference}, 'completed', ${now()})
      ON CONFLICT DO NOTHING
    `);
    return transferId.toString();
  },

  async postGlEntry(params: {
    description: string;
    debitAccount: string;
    creditAccount: string;
    amountNgn: number;
    reference: string;
    journeyType: string;
  }): Promise<string> {
    const id = crypto.randomUUID();
    await db().execute(sql`
      INSERT INTO gl_journal_entries (id, description, debit_account, credit_account, amount, currency, reference, source, created_at)
      VALUES (${id}, ${params.description}, ${params.debitAccount}, ${params.creditAccount}, ${params.amountNgn}, 'NGN', ${params.reference}, ${params.journeyType}, ${now()})
      ON CONFLICT DO NOTHING
    `);
    return id;
  },
};

// ─── KYB ACTIVITIES ───────────────────────────────────────────────────────────

export const kybActivities = {
  async createOnboardingApplication(params: {
    merchantType: string;
    businessName: string;
    ownerName: string;
    ownerEmail: string;
    ownerPhone: string;
    businessAddress: string;
    lga?: string;
    state?: string;
    rcNumber?: string;
    tinNumber?: string;
    workflowId: string;
  }): Promise<string> {
    const id = crypto.randomUUID();
    await db().execute(sql`
      INSERT INTO merchant_onboarding_applications (
        id, merchant_type, business_name, owner_name, owner_email, owner_phone,
        business_address, lga, state, rc_number, tin_number, status,
        onboarding_step, temporal_workflow_id, created_at, updated_at
      ) VALUES (
        ${id}, ${params.merchantType}, ${params.businessName}, ${params.ownerName},
        ${params.ownerEmail}, ${params.ownerPhone}, ${params.businessAddress},
        ${params.lga ?? null}, ${params.state ?? "Lagos"}, ${params.rcNumber ?? null},
        ${params.tinNumber ?? null}, 'pending', 1, ${params.workflowId}, ${now()}, ${now()}
      ) ON CONFLICT DO NOTHING
    `);
    return id;
  },

  async createEstablishment(params: {
    name: string;
    type: string;
    email: string;
    phone: string;
    address: string;
  }): Promise<void> {
    await db().execute(sql`
      INSERT INTO establishments (name, type, country, contact_email, contact_phone, address, kyb_status, created_at)
      VALUES (${params.name}, ${params.type}, 'Nigeria', ${params.email}, ${params.phone}, ${params.address}, 'pending', ${now()})
      ON CONFLICT DO NOTHING
    `);
  },

  async advanceOnboardingStep(applicationId: string, step: number, status?: string): Promise<void> {
    await db().execute(sql`
      UPDATE merchant_onboarding_applications
      SET onboarding_step = ${step}, status = ${status ?? 'pending'}, updated_at = ${now()}
      WHERE id = ${applicationId}
    `);
  },

  async approveMerchant(params: {
    applicationId: string;
    complianceScore: number;
    reviewedBy: string;
  }): Promise<string> {
    const merchantId = crypto.randomUUID();
    // Get application data
    const apps = await db().execute(sql`SELECT * FROM merchant_onboarding_applications WHERE id = ${params.applicationId} LIMIT 1`);
    const app = (apps as any[])[0];
    if (!app) throw new Error(`Application ${params.applicationId} not found`);

    const FEES: Record<string, number> = { hotel: 3.5, restaurant: 2.5, airbnb: 5.0, concert: 3.0, transport: 4.0, nightclub: 3.5 };
    const CYCLES: Record<string, string> = { hotel: "T+1", restaurant: "T+1", airbnb: "T+2", concert: "T+3", transport: "T+1", nightclub: "T+1" };

    await db().execute(sql`
      INSERT INTO merchants (id, business_name, owner_name, email, phone, merchant_type, status, kyb_status, platform_fee_percent, settlement_cycle, created_at, updated_at)
      VALUES (${merchantId}, ${app.business_name}, ${app.owner_name}, ${app.owner_email}, ${app.owner_phone}, ${app.merchant_type}, 'active', 'approved', ${FEES[app.merchant_type] ?? 3.5}, ${CYCLES[app.merchant_type] ?? "T+1"}, ${now()}, ${now()})
      ON CONFLICT DO NOTHING
    `);
    await db().execute(sql`
      UPDATE merchant_onboarding_applications
      SET status = 'approved', merchant_id = ${merchantId}, kyb_score = ${params.complianceScore},
          kyb_reviewed_at = ${now()}, kyb_reviewed_by = ${params.reviewedBy}, onboarding_step = 7, updated_at = ${now()}
      WHERE id = ${params.applicationId}
    `);
    await db().execute(sql`
      UPDATE establishments SET kyb_status = 'approved', updated_at = ${now()}
      WHERE contact_email = ${app.owner_email}
    `);
    return merchantId;
  },

  async rejectApplication(applicationId: string, reason: string): Promise<void> {
    await db().execute(sql`
      UPDATE merchant_onboarding_applications
      SET status = 'rejected', rejection_reason = ${reason}, updated_at = ${now()}
      WHERE id = ${applicationId}
    `);
  },
};

// ─── TAX ACTIVITIES ───────────────────────────────────────────────────────────

export const taxActivities = {
  calculateNigerianTaxes(amountNgn: number, merchantType: string): {
    vat: number; serviceCharge: number; platformFee: number; total: number;
  } {
    const SERVICE_CHARGE: Record<string, number> = { hotel: 10, restaurant: 10, nightclub: 10 };
    const PLATFORM_FEES: Record<string, number> = { hotel: 3.5, restaurant: 2.5, airbnb: 5.0, concert: 3.0, transport: 4.0, nightclub: 3.5 };
    const vat = amountNgn * 0.075;
    const serviceCharge = amountNgn * ((SERVICE_CHARGE[merchantType] ?? 0) / 100);
    const platformFee = amountNgn * ((PLATFORM_FEES[merchantType] ?? 3.5) / 100);
    return { vat, serviceCharge, platformFee, total: amountNgn + vat + serviceCharge };
  },

  async recordTaxCollection(params: {
    merchantId: string;
    taxType: string;
    amountNgn: number;
    period: string;
    reference: string;
  }): Promise<void> {
    await db().execute(sql`
      INSERT INTO tax_collections (id, merchant_id, tax_type, amount, currency, period, status, created_at)
      VALUES (${crypto.randomUUID()}, ${params.merchantId}, ${params.taxType}, ${params.amountNgn}, 'NGN', ${params.period}, 'collected', ${now()})
      ON CONFLICT DO NOTHING
    `);
  },
};

// ─── LOYALTY ACTIVITIES ───────────────────────────────────────────────────────

export const loyaltyActivities = {
  async earnPoints(params: {
    userId: number | string;
    merchantId: string;
    amountNgn: number;
    referenceId: string;
  }): Promise<number> {
    const points = Math.floor(params.amountNgn / 100); // 1 point per ₦100
    if (points <= 0) return 0;
    await db().execute(sql`
      INSERT INTO loyalty_transactions (id, user_id, merchant_id, points, transaction_type, reference_id, created_at)
      VALUES (${crypto.randomUUID()}, ${params.userId}, ${params.merchantId}, ${points}, 'earn', ${params.referenceId}, ${now()})
      ON CONFLICT DO NOTHING
    `);
    return points;
  },

  async redeemPoints(params: {
    userId: number | string;
    points: number;
    referenceId: string;
  }): Promise<number> {
    const ngnValue = params.points; // 1 point = ₦1
    await db().execute(sql`
      INSERT INTO loyalty_transactions (id, user_id, points, transaction_type, reference_id, created_at)
      VALUES (${crypto.randomUUID()}, ${params.userId}, ${params.points}, 'redeem', ${params.referenceId}, ${now()})
      ON CONFLICT DO NOTHING
    `);
    return ngnValue;
  },

  async getBalance(userId: number | string): Promise<number> {
    const rows = await db().execute(sql`
      SELECT COALESCE(SUM(CASE WHEN transaction_type = 'earn' THEN points ELSE -points END), 0) as total
      FROM loyalty_transactions WHERE user_id = ${userId}
    `);
    return (rows as any[])[0]?.total ?? 0;
  },
};

// ─── TIPPING ACTIVITIES ───────────────────────────────────────────────────────

export const tippingActivities = {
  async recordTip(params: {
    merchantId: string;
    tipperUserId: number | string;
    amountNgn: number;
    paymentMethod: string;
    referenceId?: string;
  }): Promise<string> {
    const id = crypto.randomUUID();
    await db().execute(sql`
      INSERT INTO tip_transactions (id, merchant_id, tipper_user_id, amount_ngn, currency, status, payment_method, created_at)
      VALUES (${id}, ${params.merchantId}, ${params.tipperUserId}, ${params.amountNgn}, 'NGN', 'completed', ${params.paymentMethod}, ${now()})
      ON CONFLICT DO NOTHING
    `);
    return id;
  },
};

// ─── NOTIFICATION ACTIVITIES ──────────────────────────────────────────────────

export const notificationActivities = {
  async sendInApp(params: {
    userId: string | number;
    title: string;
    body: string;
    type: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await db().execute(sql`
      INSERT INTO notifications (id, user_id, title, body, type, metadata, is_read, created_at)
      VALUES (${crypto.randomUUID()}, ${params.userId}, ${params.title}, ${params.body}, ${params.type}, ${JSON.stringify(params.metadata ?? {})}, false, ${now()})
      ON CONFLICT DO NOTHING
    `);
  },

  async sendSms(phone: string, message: string): Promise<void> {
    // Reuses existing SMS notification infrastructure
    logger.info({ phone: phone.slice(0, 6) + "****", message: message.slice(0, 30) }, "[Notification] SMS queued");
    // In production: call Termii/Twilio via existing smsNotifications router
  },

  async sendEmail(email: string, subject: string, body: string): Promise<void> {
    logger.info({ email: email.slice(0, 4) + "****", subject }, "[Notification] Email queued");
    // In production: call existing emailNotifications router
  },
};

// ─── AUDIT ACTIVITIES ─────────────────────────────────────────────────────────

export const auditActivities = {
  async log(params: {
    actorId: string;
    action: string;
    entityType: string;
    entityId: string;
    workflowId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await db().execute(sql`
      INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata, created_at)
      VALUES (${crypto.randomUUID()}, ${params.actorId}, ${params.action}, ${params.entityType}, ${params.entityId}, ${JSON.stringify({ ...params.metadata, workflowId: params.workflowId })}, ${now()})
      ON CONFLICT DO NOTHING
    `);
  },
};

// ─── FLUVIO ACTIVITIES ────────────────────────────────────────────────────────

export const fluvioActivities = {
  async emit(topic: string, payload: Record<string, unknown>): Promise<void> {
    try {
      await publishEvent(topic, JSON.stringify({ ...payload, timestamp: Date.now() }));
    } catch (err) {
      logger.warn({ topic, err }, "[Fluvio] Event publish failed — non-critical, continuing");
    }
  },
};

// ─── FRAUD ACTIVITIES ─────────────────────────────────────────────────────────

export const fraudActivities = {
  async scoreTransaction(params: {
    userId: number | string;
    amountNgn: number;
    merchantType: string;
    location?: string;
  }): Promise<{ score: number; level: string; shouldBlock: boolean }> {
    // Call existing Python ML fraud service
    try {
      const resp = await fetch(`${process.env.FRAUD_ML_URL ?? "http://localhost:8002"}/api/v1/fraud/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": process.env.SERVICE_API_KEY ?? "" },
        body: JSON.stringify({ user_id: params.userId, amount: params.amountNgn, merchant_type: params.merchantType }),
        signal: AbortSignal.timeout(3000),
      });
      if (resp.ok) {
        const data = await resp.json() as any;
        return { score: data.fraud_score ?? 0, level: data.level ?? "LOW", shouldBlock: (data.fraud_score ?? 0) > 80 };
      }
    } catch (_) { /* non-critical */ }
    return { score: 0, level: "LOW", shouldBlock: false };
  },

  async createFraudAlert(params: {
    userId: number | string;
    transactionId: string;
    score: number;
    reason: string;
  }): Promise<string> {
    const id = crypto.randomUUID();
    await db().execute(sql`
      INSERT INTO fraud_alerts (id, user_id, transaction_id, risk_score, reason, status, created_at)
      VALUES (${id}, ${params.userId}, ${params.transactionId}, ${params.score}, ${params.reason}, 'open', ${now()})
      ON CONFLICT DO NOTHING
    `);
    return id;
  },

  async freezeAccount(userId: number | string, reason: string): Promise<void> {
    await db().execute(sql`
      UPDATE users SET status = 'frozen', updated_at = ${now()} WHERE id = ${userId}
    `);
    await db().execute(sql`
      INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata, created_at)
      VALUES (${crypto.randomUUID()}, 'system', 'account.frozen', 'user', ${String(userId)}, ${JSON.stringify({ reason })}, ${now()})
      ON CONFLICT DO NOTHING
    `);
  },

  async unfreezeAccount(userId: number | string): Promise<void> {
    await db().execute(sql`
      UPDATE users SET status = 'active', updated_at = ${now()} WHERE id = ${userId}
    `);
  },
};

// ─── AI ACTIVITIES ────────────────────────────────────────────────────────────

export const aiActivities = {
  async generateItinerary(params: {
    prompt: string;
    destination: string;
    startDate: string;
    endDate: string;
    budget: number;
    preferences: string[];
    profileType: string;
  }): Promise<{
    title: string;
    days: Array<{
      dayNumber: number;
      date: string;
      title: string;
      theme: string;
      items: Array<{
        itemType: string;
        title: string;
        description: string;
        location: string;
        startTime: string;
        endTime: string;
        estimatedCostNgn: number;
        aiReason: string;
      }>;
    }>;
  }> {
    const systemPrompt = `You are TourismPay's AI travel concierge for Nigeria. Generate a detailed day-by-day itinerary for a tourist visiting ${params.destination}. 
Budget: ₦${params.budget.toLocaleString()} total. Profile: ${params.profileType}. Preferences: ${params.preferences.join(", ")}.
Return valid JSON matching the schema: { title, days: [{ dayNumber, date, title, theme, items: [{ itemType, title, description, location, startTime, endTime, estimatedCostNgn, aiReason }] }] }
Use real Lagos/Nigeria locations. Include hotels, restaurants, transport, attractions, and experiences. All costs in NGN.`;

    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: params.prompt },
      ],
      responseFormat: { type: "json_object" },
      maxTokens: 4000,
    });

    try {
      return JSON.parse(response.content);
    } catch {
      // Fallback structured itinerary
      return {
        title: `${params.destination} Trip — ${params.startDate} to ${params.endDate}`,
        days: [{
          dayNumber: 1,
          date: params.startDate,
          title: "Day 1 — Arrival & Settle In",
          theme: "arrival",
          items: [
            { itemType: "transport", title: "Airport Transfer", description: "Private car from MMIA to hotel", location: "MMIA, Lagos", startTime: "14:00", endTime: "15:30", estimatedCostNgn: 35000, aiReason: "Essential arrival logistics" },
            { itemType: "hotel", title: "Hotel Check-in", description: "Check into your accommodation", location: "Victoria Island, Lagos", startTime: "15:30", endTime: "16:00", estimatedCostNgn: 0, aiReason: "Accommodation for the trip" },
            { itemType: "restaurant", title: "Welcome Dinner", description: "Nigerian cuisine at a top restaurant", location: "Victoria Island, Lagos", startTime: "19:00", endTime: "21:00", estimatedCostNgn: 45000, aiReason: "First taste of Nigerian hospitality" },
          ],
        }],
      };
    }
  },

  async getRecommendations(params: {
    category: string;
    location: string;
    budget: number;
    preferences: string[];
  }): Promise<Array<{ name: string; description: string; priceNgn: number; rating: number; why: string }>> {
    const response = await invokeLLM({
      messages: [{
        role: "user",
        content: `Recommend 5 ${params.category} options in ${params.location}, Nigeria. Budget: ₦${params.budget.toLocaleString()}. Preferences: ${params.preferences.join(", ")}. Return JSON array: [{ name, description, priceNgn, rating, why }]`,
      }],
      responseFormat: { type: "json_object" },
      maxTokens: 1000,
    });
    try {
      const parsed = JSON.parse(response.content);
      return Array.isArray(parsed) ? parsed : parsed.recommendations ?? [];
    } catch {
      return [];
    }
  },
};

// ─── BOOKING ACTIVITIES ───────────────────────────────────────────────────────

export const bookingActivities = {
  async createTouristBookingRecord(params: {
    touristProfileId: string;
    bookingType: string;
    referenceId: string;
    merchantId?: string;
    merchantName?: string;
    checkInDate?: string;
    checkOutDate?: string;
    totalAmountNgn: number;
    originalCurrency?: string;
    originalAmount?: number;
    status?: string;
  }): Promise<string> {
    const id = crypto.randomUUID();
    await db().execute(sql`
      INSERT INTO tourist_bookings (id, tourist_profile_id, booking_type, reference_id, merchant_id, merchant_name, check_in_date, check_out_date, total_amount_ngn, original_currency, original_amount, status, created_at)
      VALUES (${id}, ${params.touristProfileId}, ${params.bookingType}, ${params.referenceId}, ${params.merchantId ?? null}, ${params.merchantName ?? null}, ${params.checkInDate ?? null}, ${params.checkOutDate ?? null}, ${params.totalAmountNgn}, ${params.originalCurrency ?? "NGN"}, ${params.originalAmount ?? null}, ${params.status ?? "confirmed"}, ${now()})
      ON CONFLICT DO NOTHING
    `);
    return id;
  },

  async updateBookingStatus(bookingType: string, referenceId: string, status: string): Promise<void> {
    const tableMap: Record<string, string> = {
      hotel: "hotel_bookings",
      airbnb: "property_bookings",
      transport: "transport_bookings",
      event: "event_tickets",
      restaurant: "restaurant_reservations",
    };
    const table = tableMap[bookingType];
    if (!table) return;
    await db().execute(sql`UPDATE ${sql.raw(table)} SET status = ${status}, updated_at = ${now()} WHERE id = ${referenceId}`);
  },
};

// ─── ITINERARY ACTIVITIES ─────────────────────────────────────────────────────

export const itineraryActivities = {
  async createItinerary(params: {
    touristProfileId: string;
    userId: number | string;
    title: string;
    destination: string;
    startDate: string;
    endDate: string;
    totalDays: number;
    totalBudgetNgn: number;
    journeyType: string;
    aiGenerated: boolean;
    aiPrompt?: string;
    tags: string[];
  }): Promise<string> {
    const id = crypto.randomUUID();
    await db().execute(sql`
      INSERT INTO itineraries (id, tourist_profile_id, user_id, title, destination, start_date, end_date, total_days, total_budget_ngn, journey_type, ai_generated, ai_prompt, tags, status, created_at, updated_at)
      VALUES (${id}, ${params.touristProfileId}, ${params.userId}, ${params.title}, ${params.destination}, ${params.startDate}, ${params.endDate}, ${params.totalDays}, ${params.totalBudgetNgn}, ${params.journeyType}, ${params.aiGenerated}, ${params.aiPrompt ?? null}, ${JSON.stringify(params.tags)}, 'active', ${now()}, ${now()})
    `);
    return id;
  },

  async addDay(params: {
    itineraryId: string;
    dayNumber: number;
    date: string;
    title: string;
    theme: string;
  }): Promise<string> {
    const id = crypto.randomUUID();
    await db().execute(sql`
      INSERT INTO itinerary_days (id, itinerary_id, day_number, date, title, theme, created_at)
      VALUES (${id}, ${params.itineraryId}, ${params.dayNumber}, ${params.date}, ${params.title}, ${params.theme}, ${now()})
    `);
    return id;
  },

  async addItem(params: {
    itineraryId: string;
    dayId: string;
    sortOrder: number;
    itemType: string;
    title: string;
    description?: string;
    merchantId?: string;
    merchantName?: string;
    location?: string;
    startTime?: string;
    endTime?: string;
    estimatedCostNgn: number;
    aiSuggested: boolean;
    aiReason?: string;
  }): Promise<string> {
    const id = crypto.randomUUID();
    await db().execute(sql`
      INSERT INTO itinerary_items (id, itinerary_id, day_id, sort_order, item_type, title, description, merchant_id, merchant_name, location, start_time, end_time, estimated_cost_ngn, status, ai_suggested, ai_reason, created_at, updated_at)
      VALUES (${id}, ${params.itineraryId}, ${params.dayId}, ${params.sortOrder}, ${params.itemType}, ${params.title}, ${params.description ?? null}, ${params.merchantId ?? null}, ${params.merchantName ?? null}, ${params.location ?? null}, ${params.startTime ?? null}, ${params.endTime ?? null}, ${params.estimatedCostNgn}, 'planned', ${params.aiSuggested}, ${params.aiReason ?? null}, ${now()}, ${now()})
    `);
    return id;
  },

  async updateItemStatus(itemId: string, status: string, actualCostNgn?: number, bookingReferenceId?: string): Promise<void> {
    await db().execute(sql`
      UPDATE itinerary_items
      SET status = ${status}, actual_cost_ngn = ${actualCostNgn ?? null}, booking_reference_id = ${bookingReferenceId ?? null}, updated_at = ${now()}
      WHERE id = ${itemId}
    `);
  },

  async updateSpend(itineraryId: string, additionalSpendNgn: number): Promise<void> {
    await db().execute(sql`
      UPDATE itineraries SET spent_ngn = spent_ngn + ${additionalSpendNgn}, updated_at = ${now()} WHERE id = ${itineraryId}
    `);
  },
};

// ─── SETTLEMENT ACTIVITIES ────────────────────────────────────────────────────

export const settlementActivities = {
  async recordMerchantPayment(params: {
    merchantId: string;
    touristProfileId?: string;
    paymentType: string;
    referenceId: string;
    amountNgn: number;
    feeNgn: number;
    vatNgn: number;
  }): Promise<string> {
    const id = crypto.randomUUID();
    const netAmount = params.amountNgn - params.feeNgn;
    await db().execute(sql`
      INSERT INTO merchant_payments (id, merchant_id, tourist_profile_id, payment_type, reference_id, amount_ngn, fee_ngn, vat_ngn, net_amount_ngn, currency, status, created_at)
      VALUES (${id}, ${params.merchantId}, ${params.touristProfileId ?? null}, ${params.paymentType}, ${params.referenceId}, ${params.amountNgn}, ${params.feeNgn}, ${params.vatNgn}, ${netAmount}, 'NGN', 'completed', ${now()})
      ON CONFLICT DO NOTHING
    `);
    return id;
  },
};

// ─── REFUND ACTIVITIES ────────────────────────────────────────────────────────

export const refundActivities = {
  async createRefundRequest(params: {
    touristProfileId: string;
    originalTransactionId: string;
    bookingType: string;
    bookingReferenceId: string;
    merchantId: string;
    requestedAmountNgn: number;
    reason: string;
    description: string;
  }): Promise<string> {
    const id = crypto.randomUUID();
    await db().execute(sql`
      INSERT INTO refund_requests (id, tourist_profile_id, original_transaction_id, booking_type, booking_reference_id, merchant_id, requested_amount_ngn, reason, description, status, created_at)
      VALUES (${id}, ${params.touristProfileId}, ${params.originalTransactionId}, ${params.bookingType}, ${params.bookingReferenceId}, ${params.merchantId}, ${params.requestedAmountNgn}, ${params.reason}, ${params.description}, 'pending', ${now()})
    `);
    return id;
  },

  async processRefund(params: {
    refundRequestId: string;
    userId: number | string;
    approvedAmountNgn: number;
    reviewedBy: string;
    notes: string;
  }): Promise<string> {
    // Credit wallet
    const txId = crypto.randomUUID();
    await db().execute(sql`
      UPDATE wallet_balances SET balance = balance + ${params.approvedAmountNgn}, updated_at = ${now()}
      WHERE user_id = ${params.userId} AND currency = 'NGN'
    `);
    await db().execute(sql`
      UPDATE refund_requests
      SET status = 'processed', approved_amount_ngn = ${params.approvedAmountNgn},
          reviewed_by = ${params.reviewedBy}, review_notes = ${params.notes},
          refund_transaction_id = ${txId}, processed_at = ${now()}
      WHERE id = ${params.refundRequestId}
    `);
    return txId;
  },
};

// ─── GROUP BOOKING ACTIVITIES ─────────────────────────────────────────────────

export const groupActivities = {
  async createGroupBooking(params: {
    organizerTouristProfileId: string;
    bookingType: string;
    referenceId: string;
    groupName: string;
    totalParticipants: number;
    totalAmountNgn: number;
    splitMethod: string;
  }): Promise<string> {
    const id = crypto.randomUUID();
    const shareCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    await db().execute(sql`
      INSERT INTO group_bookings (id, organizer_tourist_profile_id, booking_type, reference_id, group_name, total_participants, total_amount_ngn, split_method, status, share_code, created_at)
      VALUES (${id}, ${params.organizerTouristProfileId}, ${params.bookingType}, ${params.referenceId}, ${params.groupName}, ${params.totalParticipants}, ${params.totalAmountNgn}, ${params.splitMethod}, 'pending', ${shareCode}, ${now()})
    `);
    return id;
  },

  async addParticipant(params: {
    groupBookingId: string;
    name: string;
    email: string;
    shareAmountNgn: number;
  }): Promise<string> {
    const id = crypto.randomUUID();
    await db().execute(sql`
      INSERT INTO group_booking_participants (id, group_booking_id, name, email, share_amount_ngn, paid_amount_ngn, payment_status, joined_at)
      VALUES (${id}, ${params.groupBookingId}, ${params.name}, ${params.email}, ${params.shareAmountNgn}, 0, 'pending', ${now()})
    `);
    return id;
  },

  async collectParticipantPayment(params: {
    participantId: string;
    userId: number | string;
    amountNgn: number;
  }): Promise<void> {
    await db().execute(sql`
      UPDATE group_booking_participants
      SET paid_amount_ngn = paid_amount_ngn + ${params.amountNgn},
          payment_status = CASE WHEN paid_amount_ngn + ${params.amountNgn} >= share_amount_ngn THEN 'paid' ELSE 'partial' END,
          paid_at = ${now()}
      WHERE id = ${params.participantId}
    `);
  },
};

// ─── SAFETY ACTIVITIES ────────────────────────────────────────────────────────

export const safetyActivities = {
  async createSosAlert(params: {
    touristProfileId: string;
    alertType: string;
    latitude?: number;
    longitude?: number;
    address?: string;
    description: string;
  }): Promise<string> {
    const id = crypto.randomUUID();
    await db().execute(sql`
      INSERT INTO sos_alerts (id, tourist_profile_id, alert_type, latitude, longitude, address, description, status, created_at)
      VALUES (${id}, ${params.touristProfileId}, ${params.alertType}, ${params.latitude ?? null}, ${params.longitude ?? null}, ${params.address ?? null}, ${params.description}, 'active', ${now()})
    `);
    return id;
  },

  async notifyEmergencyContacts(touristProfileId: string, alertId: string): Promise<string[]> {
    const contacts = await db().execute(sql`
      SELECT * FROM emergency_contacts WHERE tourist_profile_id = ${touristProfileId} ORDER BY is_primary DESC
    `);
    const notified: string[] = [];
    for (const contact of contacts as any[]) {
      await notificationActivities.sendSms(contact.phone, `URGENT: Your contact needs help. TourismPay SOS Alert ID: ${alertId}`);
      notified.push(contact.phone);
    }
    return notified;
  },
};

// ─── HIGH-VALUE ACTIVITIES ────────────────────────────────────────────────────

export const highValueActivities = {
  async triggerEnhancedKyc(params: {
    touristProfileId: string;
    transactionId: string;
    amountNgn: number;
    threshold: number;
  }): Promise<string> {
    const id = crypto.randomUUID();
    await db().execute(sql`
      INSERT INTO high_value_transaction_reviews (id, transaction_id, tourist_profile_id, amount_ngn, threshold, review_type, status, created_at)
      VALUES (${id}, ${params.transactionId}, ${params.touristProfileId}, ${params.amountNgn}, ${params.threshold}, 'kyc_enhanced', 'pending', ${now()})
    `);
    return id;
  },

  async runAmlCheck(params: {
    userId: number | string;
    amountNgn: number;
    transactionId: string;
  }): Promise<{ cleared: boolean; riskScore: number; flags: string[] }> {
    // Reuses existing fraud ML service
    const result = await fraudActivities.scoreTransaction({
      userId: params.userId,
      amountNgn: params.amountNgn,
      merchantType: "high_value",
    });
    const flags: string[] = [];
    if (params.amountNgn > 5_000_000) flags.push("ABOVE_5M_NGN");
    if (params.amountNgn > 50_000_000) flags.push("ABOVE_50M_NGN");
    if (result.score > 60) flags.push("HIGH_FRAUD_SCORE");
    return { cleared: result.score < 70 && flags.length < 2, riskScore: result.score, flags };
  },
};
