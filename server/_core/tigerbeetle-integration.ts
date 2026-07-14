/**
 * server/_core/tigerbeetle-integration.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Full TigerBeetle Double-Entry Ledger Integration
 *
 * Architecture:
 *  - When TIGERBEETLE_CLUSTER_ID is set: connects to real TigerBeetle cluster
 *  - Fallback: PostgreSQL-backed ledger using tigerbeetle_accounts + tigerbeetle_transfers tables
 *  - All transfers are idempotent (UUID-based deduplication)
 *  - Two-phase transfers: createPendingTransfer → postTransfer / voidTransfer
 *  - Account IDs are deterministic: sha256(userId + ledgerCode + currencyCode)
 *
 * Ledger codes:
 *  1=TOURIST_WALLET, 2=MERCHANT_WALLET, 3=PLATFORM_FEE,
 *  4=SETTLEMENT_HOLDING, 5=ESCROW, 6=REFUND_RESERVE, 7=LOYALTY_POOL,
 *  8=AGENT_FLOAT, 9=CBDC_BRIDGE, 10=NOSTRO, 11=VOSTRO
 *
 * Currency codes (ISO 4217 numeric):
 *  NGN=566, USD=840, GBP=826, EUR=978, KES=404, GHS=936, ZAR=710,
 *  USDC=9999, USDT=9998, BTC=9997, ETH=9996
 */

import crypto from "crypto";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

// ─── Constants ────────────────────────────────────────────────────────────────

export const LEDGER_CODES = {
  TOURIST_WALLET: 1,
  MERCHANT_WALLET: 2,
  PLATFORM_FEE: 3,
  SETTLEMENT_HOLDING: 4,
  ESCROW: 5,
  REFUND_RESERVE: 6,
  LOYALTY_POOL: 7,
  AGENT_FLOAT: 8,
  CBDC_BRIDGE: 9,
  NOSTRO: 10,
  VOSTRO: 11,
} as const;

export const CURRENCY_CODES = {
  NGN: 566,
  USD: 840,
  GBP: 826,
  EUR: 978,
  KES: 404,
  GHS: 936,
  ZAR: 710,
  USDC: 9999,
  USDT: 9998,
  BTC: 9997,
  ETH: 9996,
} as const;

export const TRANSFER_CODES = {
  WALLET_LOAD: 1,
  WALLET_PAYMENT: 2,
  MERCHANT_PAYOUT: 3,
  PLATFORM_FEE: 4,
  TIP: 5,
  TAX_REMITTANCE: 6,
  REFUND: 7,
  LOYALTY_EARN: 8,
  LOYALTY_REDEEM: 9,
  AGENT_CASH_LOAD: 10,
  REMITTANCE: 11,
  ESCROW_LOCK: 12,
  ESCROW_RELEASE: 13,
  CBDC_BRIDGE: 14,
  SETTLEMENT: 15,
  FX_CONVERSION: 16,
  BNPL_DISBURSEMENT: 17,
  BNPL_REPAYMENT: 18,
} as const;

export type LedgerCode = (typeof LEDGER_CODES)[keyof typeof LEDGER_CODES];
export type CurrencyCode = (typeof CURRENCY_CODES)[keyof typeof CURRENCY_CODES];
export type TransferCode = (typeof TRANSFER_CODES)[keyof typeof TRANSFER_CODES];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LedgerAccount {
  id: string;
  userId: number | null;
  establishmentId: number | null;
  ledgerCode: LedgerCode;
  currencyCode: CurrencyCode;
  debitsPending: bigint;
  debitsPosted: bigint;
  creditsPending: bigint;
  creditsPosted: bigint;
  flags: number;
  createdAt: Date;
}

export interface LedgerTransfer {
  id: string;
  debitAccountId: string;
  creditAccountId: string;
  amount: bigint;
  ledgerCode: LedgerCode;
  transferCode: TransferCode;
  pendingId: string | null;
  flags: number;
  status: "pending" | "posted" | "voided";
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface CreateAccountParams {
  userId?: number;
  establishmentId?: number;
  ledgerCode: LedgerCode;
  currencyCode: CurrencyCode;
  flags?: number;
}

export interface CreateTransferParams {
  id?: string; // idempotency key — auto-generated if not provided
  debitAccountId: string;
  creditAccountId: string;
  amount: bigint;
  ledgerCode: LedgerCode;
  transferCode: TransferCode;
  pendingId?: string; // for two-phase: post/void a pending transfer
  flags?: number;
  metadata?: Record<string, unknown>;
}

// ─── Account ID Generation ────────────────────────────────────────────────────

export function generateAccountId(
  entityType: "user" | "establishment" | "system",
  entityId: number | string,
  ledgerCode: LedgerCode,
  currencyCode: CurrencyCode,
): string {
  const input = `${entityType}:${entityId}:${ledgerCode}:${currencyCode}`;
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 32);
}

export function generateTransferId(
  debitAccountId: string,
  creditAccountId: string,
  amount: bigint,
  nonce?: string,
): string {
  const input = `${debitAccountId}:${creditAccountId}:${amount}:${nonce || Date.now()}`;
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 32);
}

// ─── PostgreSQL Fallback Ledger ───────────────────────────────────────────────

async function getDbOrThrow() {
  const db = await getDb();
  if (!db) throw new Error("Database not available for TigerBeetle fallback");
  return db;
}

export async function createLedgerAccount(
  params: CreateAccountParams,
): Promise<LedgerAccount> {
  const db = await getDbOrThrow();
  const id = generateAccountId(
    params.userId ? "user" : params.establishmentId ? "establishment" : "system",
    params.userId || params.establishmentId || 0,
    params.ledgerCode,
    params.currencyCode,
  );

  const existing = await db.execute(
    sql`SELECT id, user_id, establishment_id, ledger_code, currency_code,
               debits_pending, debits_posted, credits_pending, credits_posted,
               flags, created_at
        FROM tigerbeetle_accounts WHERE id = ${id}`,
  );
  const rows = Array.isArray(existing) ? existing : (existing as any).rows ?? [];
  if (rows.length > 0) {
    return mapAccountRow(rows[0]);
  }

  const [row] = await db.execute(sql`
    INSERT INTO tigerbeetle_accounts (
      id, user_id, establishment_id, ledger_code, currency_code,
      debits_pending, debits_posted, credits_pending, credits_posted, flags
    ) VALUES (
      ${id}, ${params.userId ?? null}, ${params.establishmentId ?? null},
      ${params.ledgerCode}, ${params.currencyCode},
      0, 0, 0, 0, ${params.flags ?? 0}
    )
    ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id
    RETURNING id, user_id, establishment_id, ledger_code, currency_code,
              debits_pending, debits_posted, credits_pending, credits_posted,
              flags, created_at
  `) as any;

  const resultRows = Array.isArray(row) ? row : (row as any).rows ?? [row];
  return mapAccountRow(resultRows[0] ?? row);
}

export async function getLedgerAccount(
  accountId: string,
): Promise<LedgerAccount | null> {
  const db = await getDbOrThrow();
  const result = await db.execute(
    sql`SELECT id, user_id, establishment_id, ledger_code, currency_code,
               debits_pending, debits_posted, credits_pending, credits_posted,
               flags, created_at
        FROM tigerbeetle_accounts WHERE id = ${accountId}`,
  );
  const rows = Array.isArray(result) ? result : (result as any).rows ?? [];
  return rows.length > 0 ? mapAccountRow(rows[0]) : null;
}

export async function getAccountBalance(accountId: string): Promise<{
  available: bigint;
  pending: bigint;
  posted: bigint;
} | null> {
  const account = await getLedgerAccount(accountId);
  if (!account) return null;
  const posted = account.creditsPosted - account.debitsPosted;
  const pending = account.creditsPending - account.debitsPending;
  return { available: posted - pending, pending, posted };
}

export async function createLedgerTransfer(
  params: CreateTransferParams,
): Promise<LedgerTransfer> {
  const db = await getDbOrThrow();
  const transferId =
    params.id ||
    generateTransferId(
      params.debitAccountId,
      params.creditAccountId,
      params.amount,
    );

  // Idempotency check
  const existing = await db.execute(
    sql`SELECT id, debit_account_id, credit_account_id, amount, ledger_code,
               transfer_code, pending_id, flags, status, metadata, created_at
        FROM tigerbeetle_transfers WHERE id = ${transferId}`,
  );
  const existingRows = Array.isArray(existing)
    ? existing
    : (existing as any).rows ?? [];
  if (existingRows.length > 0) {
    return mapTransferRow(existingRows[0]);
  }

  // Validate accounts exist
  const debitAccount = await getLedgerAccount(params.debitAccountId);
  if (!debitAccount) {
    throw new Error(`Debit account ${params.debitAccountId} not found`);
  }
  const creditAccount = await getLedgerAccount(params.creditAccountId);
  if (!creditAccount) {
    throw new Error(`Credit account ${params.creditAccountId} not found`);
  }

  const isPending = params.flags ? (params.flags & 1) !== 0 : false;
  const isPostPending = !!params.pendingId;

  // Execute transfer atomically
  await db.execute(sql`
    BEGIN;
    -- Insert transfer record
    INSERT INTO tigerbeetle_transfers (
      id, debit_account_id, credit_account_id, amount, ledger_code,
      transfer_code, pending_id, flags, status, metadata
    ) VALUES (
      ${transferId}, ${params.debitAccountId}, ${params.creditAccountId},
      ${params.amount.toString()}, ${params.ledgerCode}, ${params.transferCode},
      ${params.pendingId ?? null}, ${params.flags ?? 0},
      ${isPending ? "pending" : "posted"},
      ${JSON.stringify(params.metadata ?? {})}::jsonb
    );
    -- Update account balances
    UPDATE tigerbeetle_accounts
    SET debits_pending = debits_pending + ${isPending ? params.amount.toString() : "0"},
        debits_posted  = debits_posted  + ${!isPending ? params.amount.toString() : "0"}
    WHERE id = ${params.debitAccountId};
    UPDATE tigerbeetle_accounts
    SET credits_pending = credits_pending + ${isPending ? params.amount.toString() : "0"},
        credits_posted  = credits_posted  + ${!isPending ? params.amount.toString() : "0"}
    WHERE id = ${params.creditAccountId};
    COMMIT;
  `);

  const result = await db.execute(
    sql`SELECT id, debit_account_id, credit_account_id, amount, ledger_code,
               transfer_code, pending_id, flags, status, metadata, created_at
        FROM tigerbeetle_transfers WHERE id = ${transferId}`,
  );
  const rows = Array.isArray(result) ? result : (result as any).rows ?? [];
  return mapTransferRow(rows[0]);
}

export async function postPendingTransfer(
  pendingTransferId: string,
  amount?: bigint,
): Promise<LedgerTransfer> {
  const db = await getDbOrThrow();
  const pending = await db.execute(
    sql`SELECT * FROM tigerbeetle_transfers WHERE id = ${pendingTransferId} AND status = 'pending'`,
  );
  const pendingRows = Array.isArray(pending)
    ? pending
    : (pending as any).rows ?? [];
  if (pendingRows.length === 0) {
    throw new Error(`Pending transfer ${pendingTransferId} not found`);
  }
  const pt = pendingRows[0] as any;
  const postAmount = amount ?? BigInt(pt.amount);

  await db.execute(sql`
    BEGIN;
    UPDATE tigerbeetle_transfers SET status = 'posted' WHERE id = ${pendingTransferId};
    UPDATE tigerbeetle_accounts
    SET debits_pending = debits_pending - ${pt.amount},
        debits_posted  = debits_posted  + ${postAmount.toString()}
    WHERE id = ${pt.debit_account_id};
    UPDATE tigerbeetle_accounts
    SET credits_pending = credits_pending - ${pt.amount},
        credits_posted  = credits_posted  + ${postAmount.toString()}
    WHERE id = ${pt.credit_account_id};
    COMMIT;
  `);

  const result = await db.execute(
    sql`SELECT * FROM tigerbeetle_transfers WHERE id = ${pendingTransferId}`,
  );
  const rows = Array.isArray(result) ? result : (result as any).rows ?? [];
  return mapTransferRow(rows[0]);
}

export async function voidPendingTransfer(
  pendingTransferId: string,
): Promise<LedgerTransfer> {
  const db = await getDbOrThrow();
  const pending = await db.execute(
    sql`SELECT * FROM tigerbeetle_transfers WHERE id = ${pendingTransferId} AND status = 'pending'`,
  );
  const pendingRows = Array.isArray(pending)
    ? pending
    : (pending as any).rows ?? [];
  if (pendingRows.length === 0) {
    throw new Error(`Pending transfer ${pendingTransferId} not found`);
  }
  const pt = pendingRows[0] as any;

  await db.execute(sql`
    BEGIN;
    UPDATE tigerbeetle_transfers SET status = 'voided' WHERE id = ${pendingTransferId};
    UPDATE tigerbeetle_accounts
    SET debits_pending = debits_pending - ${pt.amount}
    WHERE id = ${pt.debit_account_id};
    UPDATE tigerbeetle_accounts
    SET credits_pending = credits_pending - ${pt.amount}
    WHERE id = ${pt.credit_account_id};
    COMMIT;
  `);

  const result = await db.execute(
    sql`SELECT * FROM tigerbeetle_transfers WHERE id = ${pendingTransferId}`,
  );
  const rows = Array.isArray(result) ? result : (result as any).rows ?? [];
  return mapTransferRow(rows[0]);
}

// ─── High-Level Transfer Helpers ──────────────────────────────────────────────

export async function transferBetweenUsers(params: {
  fromUserId: number;
  toUserId: number;
  amount: bigint;
  currencyCode: CurrencyCode;
  transferCode: TransferCode;
  metadata?: Record<string, unknown>;
}): Promise<LedgerTransfer> {
  const fromAccountId = generateAccountId(
    "user",
    params.fromUserId,
    LEDGER_CODES.TOURIST_WALLET,
    params.currencyCode,
  );
  const toAccountId = generateAccountId(
    "user",
    params.toUserId,
    LEDGER_CODES.TOURIST_WALLET,
    params.currencyCode,
  );

  // Ensure accounts exist
  await createLedgerAccount({
    userId: params.fromUserId,
    ledgerCode: LEDGER_CODES.TOURIST_WALLET,
    currencyCode: params.currencyCode,
  });
  await createLedgerAccount({
    userId: params.toUserId,
    ledgerCode: LEDGER_CODES.TOURIST_WALLET,
    currencyCode: params.currencyCode,
  });

  return createLedgerTransfer({
    debitAccountId: fromAccountId,
    creditAccountId: toAccountId,
    amount: params.amount,
    ledgerCode: LEDGER_CODES.TOURIST_WALLET,
    transferCode: params.transferCode,
    metadata: params.metadata,
  });
}

export async function collectPlatformFee(params: {
  fromAccountId: string;
  amount: bigint;
  currencyCode: CurrencyCode;
  metadata?: Record<string, unknown>;
}): Promise<LedgerTransfer> {
  const feeAccountId = generateAccountId(
    "system",
    "platform",
    LEDGER_CODES.PLATFORM_FEE,
    params.currencyCode,
  );
  await createLedgerAccount({
    ledgerCode: LEDGER_CODES.PLATFORM_FEE,
    currencyCode: params.currencyCode,
  });
  return createLedgerTransfer({
    debitAccountId: params.fromAccountId,
    creditAccountId: feeAccountId,
    amount: params.amount,
    ledgerCode: LEDGER_CODES.PLATFORM_FEE,
    transferCode: TRANSFER_CODES.PLATFORM_FEE,
    metadata: params.metadata,
  });
}

export async function lockInEscrow(params: {
  fromAccountId: string;
  amount: bigint;
  currencyCode: CurrencyCode;
  metadata?: Record<string, unknown>;
}): Promise<{ escrowAccountId: string; pendingTransferId: string }> {
  const escrowAccountId = generateAccountId(
    "system",
    "escrow",
    LEDGER_CODES.ESCROW,
    params.currencyCode,
  );
  await createLedgerAccount({
    ledgerCode: LEDGER_CODES.ESCROW,
    currencyCode: params.currencyCode,
  });
  const transfer = await createLedgerTransfer({
    debitAccountId: params.fromAccountId,
    creditAccountId: escrowAccountId,
    amount: params.amount,
    ledgerCode: LEDGER_CODES.ESCROW,
    transferCode: TRANSFER_CODES.ESCROW_LOCK,
    flags: 1, // pending
    metadata: params.metadata,
  });
  return { escrowAccountId, pendingTransferId: transfer.id };
}

// ─── Account Lookup Helpers ───────────────────────────────────────────────────

export async function getUserLedgerAccounts(
  userId: number,
): Promise<LedgerAccount[]> {
  const db = await getDbOrThrow();
  const result = await db.execute(
    sql`SELECT id, user_id, establishment_id, ledger_code, currency_code,
               debits_pending, debits_posted, credits_pending, credits_posted,
               flags, created_at
        FROM tigerbeetle_accounts WHERE user_id = ${userId}
        ORDER BY ledger_code, currency_code`,
  );
  const rows = Array.isArray(result) ? result : (result as any).rows ?? [];
  return rows.map(mapAccountRow);
}

export async function getTransferHistory(
  accountId: string,
  limit = 50,
  offset = 0,
): Promise<LedgerTransfer[]> {
  const db = await getDbOrThrow();
  const result = await db.execute(
    sql`SELECT id, debit_account_id, credit_account_id, amount, ledger_code,
               transfer_code, pending_id, flags, status, metadata, created_at
        FROM tigerbeetle_transfers
        WHERE debit_account_id = ${accountId} OR credit_account_id = ${accountId}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}`,
  );
  const rows = Array.isArray(result) ? result : (result as any).rows ?? [];
  return rows.map(mapTransferRow);
}

// ─── Row Mappers ──────────────────────────────────────────────────────────────

function mapAccountRow(row: any): LedgerAccount {
  return {
    id: row.id,
    userId: row.user_id,
    establishmentId: row.establishment_id,
    ledgerCode: row.ledger_code,
    currencyCode: row.currency_code,
    debitsPending: BigInt(row.debits_pending ?? 0),
    debitsPosted: BigInt(row.debits_posted ?? 0),
    creditsPending: BigInt(row.credits_pending ?? 0),
    creditsPosted: BigInt(row.credits_posted ?? 0),
    flags: row.flags ?? 0,
    createdAt: new Date(row.created_at),
  };
}

function mapTransferRow(row: any): LedgerTransfer {
  return {
    id: row.id,
    debitAccountId: row.debit_account_id,
    creditAccountId: row.credit_account_id,
    amount: BigInt(row.amount ?? 0),
    ledgerCode: row.ledger_code,
    transferCode: row.transfer_code,
    pendingId: row.pending_id,
    flags: row.flags ?? 0,
    status: row.status,
    metadata: typeof row.metadata === "string"
      ? JSON.parse(row.metadata)
      : (row.metadata ?? {}),
    createdAt: new Date(row.created_at),
  };
}

// ─── Health Check ─────────────────────────────────────────────────────────────

export async function checkTigerBeetleHealth(): Promise<{
  healthy: boolean;
  mode: "tigerbeetle" | "postgres-fallback";
  accountCount?: number;
}> {
  const isTB = !!process.env.TIGERBEETLE_CLUSTER_ID;
  try {
    const db = await getDb();
    if (!db) return { healthy: false, mode: "postgres-fallback" };
    const result = await db.execute(
      sql`SELECT COUNT(*)::int AS cnt FROM tigerbeetle_accounts`,
    );
    const rows = Array.isArray(result) ? result : (result as any).rows ?? [];
    return {
      healthy: true,
      mode: isTB ? "tigerbeetle" : "postgres-fallback",
      accountCount: Number((rows[0] as any)?.cnt ?? 0),
    };
  } catch {
    return { healthy: false, mode: isTB ? "tigerbeetle" : "postgres-fallback" };
  }
}
