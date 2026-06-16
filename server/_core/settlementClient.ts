import { logger } from "./logger";
/**
 * Settlement Service Client
 *
 * HTTP client for the TourismPay Settlement Service (Go microservice).
 * The Go service exposes TigerBeetle ledger operations and Mojaloop DFSP
 * integration on port 8081 (configurable via SETTLEMENT_SERVICE_URL env var).
 *
 * When the service is unavailable, all methods fall back gracefully to
 * returning null/empty results so the tRPC procedures can serve cached
 * or stub data instead of throwing 500 errors.
 */

// Only proxy to the settlement service when SETTLEMENT_SERVICE_URL is explicitly configured.
// When not set, all exported functions return null and tRPC procedures use DB fallbacks.
const SETTLEMENT_BASE_URL = process.env.SETTLEMENT_SERVICE_URL
  ? `${process.env.SETTLEMENT_SERVICE_URL.replace(/\/+$/, "")}/api/v1`
  : null;

const DEFAULT_TIMEOUT_MS = 5_000;

async function settlementFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T | null> {
  if (!SETTLEMENT_BASE_URL) return null; // Service not configured — use DB fallback
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(`${SETTLEMENT_BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Source": "tourismpay-pwa",
        ...(options?.headers ?? {}),
      },
    });
    clearTimeout(timer);
    if (!res.ok) {
      logger.warn(
        `[SettlementClient] ${options?.method ?? "GET"} ${path} → ${res.status}`
      );
      return null;
    }
    return (await res.json()) as T;
  } catch (err: unknown) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("abort")) {
      logger.warn(`[SettlementClient] Error: ${path} — ${msg}`);
    }
    return null;
  }
}

// ─── Health ──────────────────────────────────────────────────────────────────

export async function getSettlementHealth(): Promise<{
  status: string;
  service: string;
  version: string;
  timestamp: string;
} | null> {
  const base = process.env.SETTLEMENT_SERVICE_URL?.replace("/api/v1", "") ?? "http://localhost:8081";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/health`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return res.json();
  } catch {
    clearTimeout(timer);
    return null;
  }
}

// ─── Ledger (TigerBeetle) ────────────────────────────────────────────────────

export interface LedgerAccount {
  id: string;
  entity_type: string;
  entity_id: string;
  currency: string;
  debits_pending: number;
  debits_posted: number;
  credits_pending: number;
  credits_posted: number;
  balance: number;
}

export interface LedgerTransfer {
  id: string;
  debit_account_id: string;
  credit_account_id: string;
  amount: number;
  currency: string;
  reference: string;
  status: string;
  created_at: string;
}

export async function createLedgerAccount(payload: {
  entity_type: string;
  entity_id: string;
  currency: string;
  ledger?: number;
  code?: number;
}): Promise<{ account_id: string; success: boolean } | null> {
  return settlementFetch("/ledger/accounts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getLedgerBalance(
  entityType: string,
  entityId: string,
  currency: string
): Promise<LedgerAccount | null> {
  return settlementFetch(`/ledger/accounts/${entityType}/${entityId}/${currency}`);
}

export async function createLedgerTransfer(payload: {
  debit_account_id: string;
  credit_account_id: string;
  amount: number;
  currency: string;
  reference?: string;
  pending?: boolean;
  ledger?: number;
  code?: number;
}): Promise<{ transfer_id: string; success: boolean } | null> {
  return settlementFetch("/ledger/transfers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function postPendingTransfer(
  transferId: string
): Promise<{ success: boolean } | null> {
  return settlementFetch(`/ledger/transfers/${transferId}/post`, {
    method: "POST",
  });
}

export async function voidPendingTransfer(
  transferId: string
): Promise<{ success: boolean } | null> {
  return settlementFetch(`/ledger/transfers/${transferId}/void`, {
    method: "POST",
  });
}

export async function getLedgerStatus(): Promise<{
  connected: boolean;
  cluster_id: number;
  accounts_count: number;
  transfers_count: number;
} | null> {
  return settlementFetch("/ledger/status");
}

// ─── Mojaloop ────────────────────────────────────────────────────────────────

export interface MojaloopParticipant {
  fsp_id: string;
  name: string;
  currency: string;
  account_id: string;
  is_active: boolean;
}

export interface MojaloopQuote {
  quote_id: string;
  transaction_id: string;
  payer_fsp: string;
  payee_fsp: string;
  amount: number;
  currency: string;
  condition: string;
  ilp_packet: string;
  expiration: string;
}

export interface MojaloopTransfer {
  transfer_id: string;
  quote_id: string;
  payer_fsp: string;
  payee_fsp: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  committed_at?: string;
}

export async function listMojaloopParticipants(): Promise<
  MojaloopParticipant[] | null
> {
  return settlementFetch("/mojaloop/participants");
}

export async function lookupMojaloopParticipant(
  identifier: string
): Promise<MojaloopParticipant | null> {
  return settlementFetch(`/mojaloop/participants/${encodeURIComponent(identifier)}`);
}

export async function createMojaloopQuote(payload: {
  payer_fsp: string;
  payee_fsp: string;
  payer_identifier: string;
  payee_identifier: string;
  amount: number;
  currency: string;
  transaction_type?: string;
  note?: string;
}): Promise<MojaloopQuote | null> {
  return settlementFetch("/mojaloop/quotes", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function prepareMojaloopTransfer(payload: {
  quote_id: string;
  payer_fsp: string;
  payee_fsp: string;
  amount: number;
  currency: string;
  condition: string;
  ilp_packet: string;
  expiration?: string;
}): Promise<MojaloopTransfer | null> {
  return settlementFetch("/mojaloop/transfers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function commitMojaloopTransfer(
  transferId: string,
  fulfilment: string
): Promise<{ success: boolean; committed_at: string } | null> {
  return settlementFetch(`/mojaloop/transfers/${transferId}/commit`, {
    method: "POST",
    body: JSON.stringify({ fulfilment }),
  });
}

export async function listSettlementWindows(): Promise<
  {
    window_id: string;
    state: string;
    currency: string;
    created_at: string;
    closed_at?: string;
    net_settlement_amount: number;
  }[]
  | null
> {
  return settlementFetch("/mojaloop/settlement-windows");
}

export async function closeSettlementWindow(
  windowId: string
): Promise<{ success: boolean; closed_at: string } | null> {
  return settlementFetch(`/mojaloop/settlement-windows/${windowId}/close`, {
    method: "POST",
  });
}

export async function getMojaloopStatus(): Promise<{
  connected: boolean;
  dfsp_id: string;
  hub_url: string;
  participants_count: number;
  active_transfers: number;
} | null> {
  return settlementFetch("/mojaloop/status");
}

// ─── Settlement ──────────────────────────────────────────────────────────────

export async function recordBookingPayment(payload: {
  booking_id: string;
  provider_id: string;
  tourist_id: string;
  amount: number;
  currency: string;
  payment_method: string;
  reference?: string;
}): Promise<{
  payment_id: string;
  ledger_transfer_id: string;
  mojaloop_transfer_id: string;
  status: string;
} | null> {
  return settlementFetch("/settlement/record-payment", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createSettlementBatch(payload: {
  provider_id: string;
  currency: string;
  period_start: string;
  period_end: string;
}): Promise<{
  batch_id: string;
  total_amount: number;
  transaction_count: number;
  status: string;
} | null> {
  return settlementFetch("/settlement/batches", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function processSettlementBatch(
  batchId: string
): Promise<{
  success: boolean;
  processed_count: number;
  total_amount: number;
  mojaloop_transfer_id: string;
} | null> {
  return settlementFetch(`/settlement/batches/${batchId}/process`, {
    method: "POST",
  });
}

export async function listSettlementBatches(): Promise<
  {
    batch_id: string;
    provider_id: string;
    currency: string;
    total_amount: number;
    transaction_count: number;
    status: string;
    created_at: string;
  }[]
  | null
> {
  return settlementFetch("/settlement/batches");
}

export async function getProviderBalance(
  providerId: string
): Promise<{
  provider_id: string;
  currency: string;
  available_balance: number;
  pending_balance: number;
  total_earned: number;
  total_settled: number;
} | null> {
  return settlementFetch(`/settlement/providers/${encodeURIComponent(providerId)}/balance`);
}

export async function runDailySettlements(): Promise<{
  processed: number;
  total_amount: number;
  errors: number;
} | null> {
  return settlementFetch("/settlement/run-daily", { method: "POST" });
}

export async function getSettlementStatus(): Promise<{
  pending_batches: number;
  pending_amount: number;
  last_settlement_at: string;
  settlement_window_open: boolean;
} | null> {
  return settlementFetch("/settlement/status");
}

// ─── Reconciliation ──────────────────────────────────────────────────────────

export async function generateReconciliationReport(payload: {
  provider_id?: string;
  period_start: string;
  period_end: string;
  currency?: string;
}): Promise<{
  report_id: string;
  total_transactions: number;
  total_amount: number;
  discrepancies: number;
  status: string;
} | null> {
  return settlementFetch("/reconciliation/reports", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listReconciliationReports(): Promise<
  {
    report_id: string;
    provider_id: string;
    period_start: string;
    period_end: string;
    total_amount: number;
    discrepancies: number;
    status: string;
    created_at: string;
  }[]
  | null
> {
  return settlementFetch("/reconciliation/reports");
}

// ─── Infrastructure ──────────────────────────────────────────────────────────

export async function getInfrastructureStatus(): Promise<{
  tigerbeetle: { connected: boolean; cluster_id: number };
  mojaloop: { connected: boolean; dfsp_id: string };
  database: { connected: boolean };
} | null> {
  return settlementFetch("/infrastructure/status");
}
