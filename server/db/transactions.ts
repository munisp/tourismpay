/**
 * server/db/transactions.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Complex multi-step database transaction helpers.
 *
 * Each function wraps a business-critical multi-table operation in a single
 * ACID transaction, ensuring consistency even under partial failure.
 *
 * Transactions defined here:
 *  1. transferFunds          — atomic wallet-to-wallet transfer
 *  2. processBooking         — booking + inventory + loyalty points
 *  3. processRemittance      — remittance + wallet debit + audit log
 *  4. redeemLoyaltyPoints    — loyalty redemption + wallet credit
 *  5. onboardEstablishment   — establishment + wallet setup + audit
 *  6. processRefund          — refund + wallet credit + booking update
 *  7. processAgentCashLoad   — agent cash load + wallet credit + commission
 */

import crypto from "node:crypto";
import { eq, sql, and } from "drizzle-orm";
import type { DrizzleDb as DB } from "../db.js";
import {
  walletBalances,
  walletTransactions,
  touristBookings,
  loyaltyAccounts,
  loyaltyTransactions,
  remittances,
  auditLogs,
  establishments,
  cashLoadOrders,
} from "../../drizzle/schema.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TransferFundsInput {
  fromUserId: string;
  toUserId: string;
  amount: number;
  currency: string;
  type: string;
  reference?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface TransferFundsResult {
  debitTx: typeof walletTransactions.$inferSelect;
  creditTx: typeof walletTransactions.$inferSelect;
  fromBalance: typeof walletBalances.$inferSelect;
  toBalance: typeof walletBalances.$inferSelect;
}

export interface ProcessBookingInput {
  userId: number;
  establishmentId: number;
  productId?: number;
  serviceName: string;
  serviceType?: string;
  bookingDate: Date;
  partySize?: number;
  priceUsd: number;
  currency: string;
  walletTxId?: string;
  loyaltyPointsEarned?: number;
}

export interface ProcessRemittanceInput {
  userId: number;
  senderCurrency: string;
  recipientCurrency: string;
  senderAmount: number;
  recipientAmount: number;
  exchangeRate: number;
  fee: number;
  recipientName?: string;
  recipientAccount?: string;
  recipientBank?: string;
  externalRef?: string;
}

export interface RedeemLoyaltyInput {
  userId: string;
  pointsToRedeem: number;
  cashValue: number;
  currency: string;
  description?: string;
}

export interface OnboardEstablishmentInput {
  ownerId: number;
  name: string;
  type: string;
  country: string;
  currency?: string;
  address?: string;
}

export interface ProcessRefundInput {
  bookingId: number;
  userId: string;
  amount: number;
  currency: string;
  reason: string;
  refundedBy?: number;
}

// ─── 1. Transfer Funds ────────────────────────────────────────────────────────

/**
 * Atomically transfer funds between two wallets.
 */
export async function transferFunds(
  db: DB,
  input: TransferFundsInput,
): Promise<TransferFundsResult> {
  return db.transaction(async (tx: any) => {
    // Lock and check sender balance
    const [fromWallet] = await tx
      .select()
      .from(walletBalances)
      .where(
        and(
          eq(walletBalances.userId, input.fromUserId),
          eq(walletBalances.currency, input.currency),
        ),
      )
      .for("update");

    if (!fromWallet) {
      throw new Error(`Wallet not found: user=${input.fromUserId} currency=${input.currency}`);
    }

    const currentBalance = Number(fromWallet.balance);
    if (currentBalance < input.amount) {
      throw new Error(
        `Insufficient balance: available=${currentBalance} required=${input.amount} currency=${input.currency}`,
      );
    }

    const now = Math.floor(Date.now() / 1000);
    const ref = input.reference ?? `TXF-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    // Debit sender
    const [fromBalanceUpdated] = await tx
      .update(walletBalances)
      .set({
        balance: sql`${walletBalances.balance} - ${input.amount}`,
        updatedAt: now,
      })
      .where(
        and(
          eq(walletBalances.userId, input.fromUserId),
          eq(walletBalances.currency, input.currency),
        ),
      )
      .returning();

    // Credit receiver (upsert)
    await tx
      .insert(walletBalances)
      .values({
        userId: input.toUserId,
        currency: input.currency,
        balance: String(input.amount),
        updatedAt: now,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: [walletBalances.userId, walletBalances.currency],
        set: {
          balance: sql`${walletBalances.balance} + ${input.amount}`,
          updatedAt: now,
        },
      });

    const [toBalanceUpdated] = await tx
      .select()
      .from(walletBalances)
      .where(
        and(
          eq(walletBalances.userId, input.toUserId),
          eq(walletBalances.currency, input.currency),
        ),
      );

    // Create debit transaction record
    const [debitTx] = await tx
      .insert(walletTransactions)
      .values({
        userId: input.fromUserId,
        type: input.type,
        status: "completed",
        fromCurrency: input.currency,
        toCurrency: input.currency,
        amount: String(input.amount),
        fee: "0",
        reference: ref,
        note: input.description ?? `Transfer to ${input.toUserId}`,
        createdAt: now,
      })
      .returning();

    // Create credit transaction record
    const [creditTx] = await tx
      .insert(walletTransactions)
      .values({
        userId: input.toUserId,
        type: "credit",
        status: "completed",
        fromCurrency: input.currency,
        toCurrency: input.currency,
        amount: String(input.amount),
        fee: "0",
        reference: ref,
        note: input.description ?? `Transfer from ${input.fromUserId}`,
        createdAt: now,
      })
      .returning();

    return {
      debitTx,
      creditTx,
      fromBalance: fromBalanceUpdated,
      toBalance: toBalanceUpdated,
    };
  });
}

// ─── 2. Process Booking ───────────────────────────────────────────────────────

/**
 * Create a booking and optionally credit loyalty points in a single transaction.
 */
export async function processBooking(
  db: DB,
  input: ProcessBookingInput,
): Promise<typeof touristBookings.$inferSelect> {
  return db.transaction(async (tx: any) => {
    // Insert booking
    const [booking] = await tx
      .insert(touristBookings)
      .values({
        userId: input.userId,
        establishmentId: input.establishmentId,
        productId: input.productId,
        serviceName: input.serviceName,
        serviceType: input.serviceType ?? "general",
        bookingDate: input.bookingDate,
        partySize: input.partySize ?? 1,
        priceUsd: String(input.priceUsd),
        currency: input.currency,
        walletTxId: input.walletTxId,
        status: "confirmed",
      })
      .returning();

    // Credit loyalty points if applicable
    if (input.loyaltyPointsEarned && input.loyaltyPointsEarned > 0) {
      const userId = String(input.userId);
      const nowSec = Math.floor(Date.now() / 1000);

      // Upsert loyalty account
      await tx
        .insert(loyaltyAccounts)
        .values({
          userId,
          tier: "BRONZE",
          pointsBalance: input.loyaltyPointsEarned,
          lifetimePoints: input.loyaltyPointsEarned,
          createdAt: nowSec,
          updatedAt: nowSec,
        })
        .onConflictDoUpdate({
          target: [loyaltyAccounts.userId],
          set: {
            pointsBalance: sql`${loyaltyAccounts.pointsBalance} + ${input.loyaltyPointsEarned}`,
            lifetimePoints: sql`${loyaltyAccounts.lifetimePoints} + ${input.loyaltyPointsEarned}`,
            updatedAt: nowSec,
          },
        });

      // Record loyalty transaction
      await tx.insert(loyaltyTransactions).values({
        userId,
        type: "earn",
        points: input.loyaltyPointsEarned,
        description: `Booking #${booking.id} — earned points`,
        referenceId: String(booking.id),
        createdAt: nowSec,
      });
    }

    return booking;
  });
}

// ─── 3. Process Remittance ────────────────────────────────────────────────────

/**
 * Create a remittance and debit the sender's wallet atomically.
 */
export async function processRemittance(
  db: DB,
  input: ProcessRemittanceInput,
): Promise<typeof remittances.$inferSelect> {
  return db.transaction(async (tx: any) => {
    const userId = String(input.userId);
    const now = Date.now();
    const nowSec = Math.floor(now / 1000);

    // Lock and check sender wallet balance
    const [wallet] = await tx
      .select()
      .from(walletBalances)
      .where(
        and(
          eq(walletBalances.userId, userId),
          eq(walletBalances.currency, input.senderCurrency),
        ),
      )
      .for("update");

    const totalDebit = input.senderAmount + input.fee;
    if (!wallet || Number(wallet.balance) < totalDebit) {
      throw new Error(
        `Insufficient balance for remittance: required=${totalDebit} ${input.senderCurrency}`,
      );
    }

    // Debit sender wallet
    await tx
      .update(walletBalances)
      .set({
        balance: sql`${walletBalances.balance} - ${totalDebit}`,
        updatedAt: nowSec,
      })
      .where(
        and(
          eq(walletBalances.userId, userId),
          eq(walletBalances.currency, input.senderCurrency),
        ),
      );

    // Create remittance record (id must be provided or generated)
    const remittanceId = `REM-${now}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const [remittance] = await tx
      .insert(remittances)
      .values({
        id: remittanceId,
        userId: input.userId,
        senderCurrency: input.senderCurrency as any,
        recipientCurrency: input.recipientCurrency as any,
        senderAmount: String(input.senderAmount),
        recipientAmount: String(input.recipientAmount),
        exchangeRate: String(input.exchangeRate),
        fee: String(input.fee),
        recipientName: input.recipientName,
        recipientAccount: input.recipientAccount,
        recipientBank: input.recipientBank,
        externalRef: input.externalRef,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    // Create wallet transaction record
    await tx.insert(walletTransactions).values({
      userId,
      type: "remittance",
      status: "completed",
      fromCurrency: input.senderCurrency,
      toCurrency: input.recipientCurrency,
      amount: String(input.senderAmount),
      fee: String(input.fee),
      reference: remittance.id,
      note: `Remittance to ${input.recipientName ?? "recipient"} (${input.recipientCurrency})`,
      createdAt: nowSec,
    });

    // Audit log
    await tx.insert(auditLogs).values({
      actorId: input.userId,
      action: "remittance.created",
      entityType: "remittance",
      entityId: remittance.id,
      after: {
        amount: input.senderAmount,
        currency: input.senderCurrency,
        recipient: input.recipientName,
      },
    });

    return remittance;
  });
}

// ─── 4. Redeem Loyalty Points ─────────────────────────────────────────────────

/**
 * Redeem loyalty points and credit the equivalent cash value to the user's wallet.
 */
export async function redeemLoyaltyPoints(
  db: DB,
  input: RedeemLoyaltyInput,
): Promise<{
  loyaltyTx: typeof loyaltyTransactions.$inferSelect;
  walletTx: typeof walletTransactions.$inferSelect;
}> {
  return db.transaction(async (tx: any) => {
    // Lock and check loyalty account
    const [account] = await tx
      .select()
      .from(loyaltyAccounts)
      .where(eq(loyaltyAccounts.userId, input.userId))
      .for("update");

    if (!account) {
      throw new Error(`Loyalty account not found for user: ${input.userId}`);
    }

    if (Number(account.pointsBalance) < input.pointsToRedeem) {
      throw new Error(
        `Insufficient loyalty points: available=${account.pointsBalance} required=${input.pointsToRedeem}`,
      );
    }

    const nowSec = Math.floor(Date.now() / 1000);

    // Deduct points
    await tx
      .update(loyaltyAccounts)
      .set({
        pointsBalance: sql`${loyaltyAccounts.pointsBalance} - ${input.pointsToRedeem}`,
        updatedAt: nowSec,
      })
      .where(eq(loyaltyAccounts.userId, input.userId));

    // Record loyalty transaction
    const [loyaltyTx] = await tx
      .insert(loyaltyTransactions)
      .values({
        userId: input.userId,
        type: "redeem",
        points: -input.pointsToRedeem,
        description:
          input.description ??
          `Redeemed ${input.pointsToRedeem} points for ${input.cashValue} ${input.currency}`,
        createdAt: nowSec,
      })
      .returning();

    const now = nowSec;

    // Credit wallet (upsert)
    await tx
      .insert(walletBalances)
      .values({
        userId: input.userId,
        currency: input.currency,
        balance: String(input.cashValue),
        updatedAt: now,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: [walletBalances.userId, walletBalances.currency],
        set: {
          balance: sql`${walletBalances.balance} + ${input.cashValue}`,
          updatedAt: now,
        },
      });

    // Create wallet transaction record
    const [walletTx] = await tx
      .insert(walletTransactions)
      .values({
        userId: input.userId,
        type: "loyalty_redemption",
        status: "completed",
        fromCurrency: "POINTS",
        toCurrency: input.currency,
        amount: String(input.cashValue),
        fee: "0",
        reference: loyaltyTx.id,
        note: `Loyalty redemption: ${input.pointsToRedeem} pts → ${input.cashValue} ${input.currency}`,
        createdAt: now,
      })
      .returning();

    return { loyaltyTx, walletTx };
  });
}

// ─── 5. Onboard Establishment ─────────────────────────────────────────────────

/**
 * Onboard a new establishment and initialize its owner's wallet.
 */
export async function onboardEstablishment(
  db: DB,
  input: OnboardEstablishmentInput,
): Promise<typeof establishments.$inferSelect> {
  return db.transaction(async (tx: any) => {
    // Create establishment
    const [establishment] = await tx
      .insert(establishments)
      .values({
        ownerId: input.ownerId,
        name: input.name,
        type: input.type as any,
        country: input.country,
        address: input.address,
        currency: input.currency ?? "USD",
        kybStatus: "draft",
      })
      .returning();

    // Initialize owner wallet balance (zero)
    const nowSec = Math.floor(Date.now() / 1000);
    await tx
      .insert(walletBalances)
      .values({
        userId: String(input.ownerId),
        currency: input.currency ?? "USD",
        balance: "0",
        updatedAt: nowSec,
        createdAt: nowSec,
      })
      .onConflictDoNothing();

    // Audit log
    await tx.insert(auditLogs).values({
      actorId: input.ownerId,
      action: "establishment.created",
      entityType: "establishment",
      entityId: String(establishment.id),
      after: {
        name: input.name,
        type: input.type,
        country: input.country,
      },
    });

    return establishment;
  });
}

// ─── 6. Process Refund ────────────────────────────────────────────────────────

/**
 * Process a booking refund: update booking status and credit wallet.
 */
export async function processRefund(
  db: DB,
  input: ProcessRefundInput,
): Promise<typeof walletTransactions.$inferSelect> {
  return db.transaction(async (tx: any) => {
    // Update booking status
    await tx
      .update(touristBookings)
      .set({ status: "cancelled" as any })
      .where(eq(touristBookings.id, input.bookingId));

    const nowSec = Math.floor(Date.now() / 1000);

    // Credit refund to wallet (upsert)
    await tx
      .insert(walletBalances)
      .values({
        userId: input.userId,
        currency: input.currency,
        balance: String(input.amount),
        updatedAt: nowSec,
        createdAt: nowSec,
      })
      .onConflictDoUpdate({
        target: [walletBalances.userId, walletBalances.currency],
        set: {
          balance: sql`${walletBalances.balance} + ${input.amount}`,
          updatedAt: nowSec,
        },
      });

    // Create refund transaction record
    const [walletTx] = await tx
      .insert(walletTransactions)
      .values({
        userId: input.userId,
        type: "refund",
        status: "completed",
        fromCurrency: input.currency,
        toCurrency: input.currency,
        amount: String(input.amount),
        fee: "0",
        reference: `REFUND-BOOKING-${input.bookingId}`,
        note: `Refund for booking #${input.bookingId}: ${input.reason}`,
        createdAt: nowSec,
      })
      .returning();

    // Audit log
    await tx.insert(auditLogs).values({
      actorId: input.refundedBy ?? null,
      action: "booking.refunded",
      entityType: "booking",
      entityId: String(input.bookingId),
      after: {
        amount: input.amount,
        currency: input.currency,
        reason: input.reason,
        refundedUserId: input.userId,
      },
    });

    return walletTx;
  });
}

// ─── 7. Process Agent Cash Load ───────────────────────────────────────────────

/**
 * Process an agent cash load: credit user wallet, credit agent commission.
 */
export async function processAgentCashLoad(
  db: DB,
  orderId: number,
  agentId: string,
  userId: string,
  amount: number,
  currency: string,
  commissionRate: number,
): Promise<typeof cashLoadOrders.$inferSelect> {
  return db.transaction(async (tx: any) => {
    const commission = Math.round(amount * commissionRate * 100) / 100;
    const nowSec = Math.floor(Date.now() / 1000);

    // Update cash load order status
    const [order] = await tx
      .update(cashLoadOrders)
      .set({ status: "completed" as any, completedAt: new Date() })
      .where(eq(cashLoadOrders.id, String(orderId)))
      .returning();

    // Credit user wallet
    await tx
      .insert(walletBalances)
      .values({
        userId,
        currency,
        balance: String(amount),
        updatedAt: nowSec,
        createdAt: nowSec,
      })
      .onConflictDoUpdate({
        target: [walletBalances.userId, walletBalances.currency],
        set: {
          balance: sql`${walletBalances.balance} + ${amount}`,
          updatedAt: nowSec,
        },
      });

    // Credit agent commission
    if (commission > 0) {
      await tx
        .insert(walletBalances)
        .values({
          userId: agentId,
          currency,
          balance: String(commission),
          updatedAt: nowSec,
          createdAt: nowSec,
        })
        .onConflictDoUpdate({
          target: [walletBalances.userId, walletBalances.currency],
          set: {
            balance: sql`${walletBalances.balance} + ${commission}`,
            updatedAt: nowSec,
          },
        });
    }

    // Record user credit transaction
    await tx.insert(walletTransactions).values({
      userId,
      type: "cash_load",
      status: "completed",
      fromCurrency: currency,
      toCurrency: currency,
      amount: String(amount),
      fee: "0",
      reference: `CASHLOAD-${orderId}`,
      note: `Cash load via agent ${agentId}`,
      createdAt: nowSec,
    });

    return order;
  });
}
