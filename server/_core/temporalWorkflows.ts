/**
 * Temporal Workflow Definitions for Fund Flow Scenarios
 *
 * These workflows provide durable execution guarantees:
 * - Automatic retry on transient failures
 * - Compensation (saga rollback) on permanent failures
 * - Execution history for audit (every step recorded)
 * - Timer-based scheduling (T+n settlements)
 * - Signal-based external event handling (approval gates)
 *
 * Workflows:
 * 1. RemittanceWorkflow — Cross-border fund transfer (Mojaloop ILP)
 * 2. SettlementWorkflow — Merchant payout batch processing (T+n)
 * 3. EscrowWorkflow — Booking hold → release/refund lifecycle
 * 4. ReconciliationWorkflow — Nightly ledger vs wallet comparison
 * 5. FraudInvestigationWorkflow — Freeze → investigate → release/confiscate
 */
import { logger } from "./logger";

// ─── Workflow Type Definitions ───────────────────────────────────────────────

export interface RemittanceWorkflowInput {
  remittanceId: string;
  senderId: number;
  recipientMsisdn: string;
  amount: number;
  sourceCurrency: string;
  destCurrency: string;
  corridor: string;
  idempotencyKey: string;
}

export interface RemittanceWorkflowResult {
  success: boolean;
  remittanceId: string;
  mojaloopTransferId?: string;
  fees?: number;
  convertedAmount?: number;
  failureReason?: string;
  compensated?: boolean;
}

export interface SettlementWorkflowInput {
  windowId: string;
  establishmentIds: number[];
  currency: string;
  tPlusDays: number;
  initiatedBy: string;
}

export interface SettlementWorkflowResult {
  success: boolean;
  windowId: string;
  totalSettled: number;
  totalFees: number;
  failedPayouts: Array<{ establishmentId: number; reason: string }>;
}

export interface EscrowWorkflowInput {
  bookingId: string;
  userId: number;
  establishmentId: number;
  amount: number;
  currency: string;
  holdDurationMs: number; // Max hold time before auto-release
  idempotencyKey: string;
}

export interface EscrowWorkflowResult {
  success: boolean;
  bookingId: string;
  outcome: "released" | "refunded" | "expired";
  pendingTransferId?: string;
}

export interface ReconciliationWorkflowInput {
  runId: string;
  type: "full" | "incremental";
  corridors?: string[];
}

export interface FraudInvestigationWorkflowInput {
  investigationId: string;
  userId: number;
  amount: number;
  currency: string;
  triggerType: string;
  evidence: Record<string, unknown>;
}

// ─── Workflow Activity Stubs ─────────────────────────────────────────────────
// These are the activities that workflows invoke. In a Temporal deployment,
// these would be registered as activity implementations.

export const WORKFLOW_ACTIVITIES = {
  // Remittance activities
  validateSenderBalance: "validateSenderBalance",
  acquireFundLock: "acquireFundLock",
  releaseFundLock: "releaseFundLock",
  debitSenderWallet: "debitSenderWallet",
  creditSenderWallet: "creditSenderWallet", // compensation
  lookupMojaloopParty: "lookupMojaloopParty",
  requestMojaloopQuote: "requestMojaloopQuote",
  executeMojaloopTransfer: "executeMojaloopTransfer",
  recordLedgerEntry: "recordLedgerEntry",
  voidLedgerEntry: "voidLedgerEntry", // compensation
  publishKafkaEvent: "publishKafkaEvent",
  streamToFluvio: "streamToFluvio",
  sendNotification: "sendNotification",

  // Settlement activities
  loadSettlementBatch: "loadSettlementBatch",
  calculateFees: "calculateFees",
  initiatePayoutBatch: "initiatePayoutBatch",
  confirmPayoutStatus: "confirmPayoutStatus",
  recordSettlementLedger: "recordSettlementLedger",
  reconcileSettlement: "reconcileSettlement",

  // Escrow activities
  holdFundsInEscrow: "holdFundsInEscrow",
  releaseFundsFromEscrow: "releaseFundsFromEscrow",
  refundFundsFromEscrow: "refundFundsFromEscrow",

  // Fraud investigation activities
  freezeUserFunds: "freezeUserFunds",
  unfreezeUserFunds: "unfreezeUserFunds",
  confiscateFunds: "confiscateFunds",
  notifyComplianceTeam: "notifyComplianceTeam",
  createBISInvestigation: "createBISInvestigation",
} as const;

// ─── Workflow Definitions (Pseudo-code for Temporal Worker) ──────────────────

/**
 * Remittance Workflow — durable cross-border fund transfer.
 * 
 * Saga steps:
 * 1. Validate sender balance
 * 2. Acquire distributed lock
 * 3. Debit sender wallet (+ ledger entry)
 * 4. Lookup recipient via Mojaloop
 * 5. Request quote (fees + FX)
 * 6. Execute ILP transfer
 * 7. Publish audit events
 * 8. Send notifications
 *
 * Compensation (any step fails):
 * - Void ledger entries
 * - Credit sender wallet (reverse debit)
 * - Release lock
 * - Publish failure event
 */
export const REMITTANCE_WORKFLOW_DEF = {
  name: "RemittanceWorkflow",
  taskQueue: "tourismpay-remittance",
  retryPolicy: {
    initialInterval: "1s",
    backoffCoefficient: 2.0,
    maximumInterval: "30s",
    maximumAttempts: 5,
  },
  executionTimeout: "5m",
  steps: [
    { activity: "validateSenderBalance", timeout: "5s" },
    { activity: "acquireFundLock", timeout: "10s" },
    { activity: "debitSenderWallet", timeout: "10s", compensation: "creditSenderWallet" },
    { activity: "recordLedgerEntry", timeout: "10s", compensation: "voidLedgerEntry" },
    { activity: "lookupMojaloopParty", timeout: "15s" },
    { activity: "requestMojaloopQuote", timeout: "30s" },
    { activity: "executeMojaloopTransfer", timeout: "60s" },
    { activity: "publishKafkaEvent", timeout: "5s" },
    { activity: "streamToFluvio", timeout: "5s" },
    { activity: "sendNotification", timeout: "5s" },
    { activity: "releaseFundLock", timeout: "5s" },
  ],
} as const;

/**
 * Settlement Workflow — T+n batch merchant payout.
 * Waits for T+n days, then processes all pending settlements.
 */
export const SETTLEMENT_WORKFLOW_DEF = {
  name: "SettlementWorkflow",
  taskQueue: "tourismpay-settlement",
  retryPolicy: {
    initialInterval: "5s",
    backoffCoefficient: 2.0,
    maximumInterval: "5m",
    maximumAttempts: 3,
  },
  executionTimeout: "30m",
  steps: [
    { activity: "loadSettlementBatch", timeout: "30s" },
    { activity: "calculateFees", timeout: "10s" },
    { activity: "recordSettlementLedger", timeout: "30s" },
    { activity: "initiatePayoutBatch", timeout: "5m" },
    { activity: "confirmPayoutStatus", timeout: "10m" },
    { activity: "reconcileSettlement", timeout: "60s" },
    { activity: "publishKafkaEvent", timeout: "5s" },
  ],
} as const;

/**
 * Escrow Workflow — hold funds until booking confirmation or timeout.
 * Uses Temporal timer for auto-release on expiry.
 */
export const ESCROW_WORKFLOW_DEF = {
  name: "EscrowWorkflow",
  taskQueue: "tourismpay-settlement",
  retryPolicy: {
    initialInterval: "2s",
    backoffCoefficient: 2.0,
    maximumInterval: "30s",
    maximumAttempts: 3,
  },
  executionTimeout: "72h", // Max 3 days hold
  signals: ["confirmBooking", "cancelBooking"],
  steps: [
    { activity: "holdFundsInEscrow", timeout: "15s" },
    // Wait for signal OR timer expiry
    { type: "signal_or_timer", signalName: "confirmBooking", timerDuration: "holdDurationMs" },
    // Branch: confirmed → release; cancelled/expired → refund
    { activity: "releaseFundsFromEscrow", condition: "signal=confirmBooking", timeout: "15s" },
    { activity: "refundFundsFromEscrow", condition: "signal=cancelBooking|timer_expired", timeout: "15s" },
    { activity: "publishKafkaEvent", timeout: "5s" },
  ],
} as const;

/**
 * Fraud Investigation Workflow — freeze → investigate → outcome.
 * Uses human-in-the-loop signal for compliance team decision.
 */
export const FRAUD_INVESTIGATION_WORKFLOW_DEF = {
  name: "FraudInvestigationWorkflow",
  taskQueue: "tourismpay-fraud-investigation",
  retryPolicy: {
    initialInterval: "5s",
    backoffCoefficient: 2.0,
    maximumInterval: "1m",
    maximumAttempts: 3,
  },
  executionTimeout: "30d", // Max 30 days investigation
  signals: ["clearUser", "confiscateFunds", "extendInvestigation"],
  steps: [
    { activity: "freezeUserFunds", timeout: "15s" },
    { activity: "createBISInvestigation", timeout: "30s" },
    { activity: "notifyComplianceTeam", timeout: "10s" },
    { activity: "publishKafkaEvent", timeout: "5s" },
    // Wait for compliance decision (signal)
    { type: "signal_or_timer", signalName: "clearUser|confiscateFunds", timerDuration: "7d" },
    // Branch based on decision
    { activity: "unfreezeUserFunds", condition: "signal=clearUser", timeout: "15s" },
    { activity: "confiscateFunds", condition: "signal=confiscateFunds", timeout: "15s" },
  ],
} as const;

// ─── Workflow Starter Helpers ─────────────────────────────────────────────────

import { getTemporalClient } from "./temporal";

export async function startFundFlowWorkflow(
  workflowType: "remittance" | "settlement" | "escrow" | "fraud",
  input: unknown,
): Promise<string | null> {
  const tc = await getTemporalClient();
  if (!tc) {
    logger.warn(`[Temporal] Client unavailable — ${workflowType} workflow will run synchronously`);
    return null;
  }

  const configs = {
    remittance: { taskQueue: "tourismpay-remittance", workflowId: `rem-${Date.now()}` },
    settlement: { taskQueue: "tourismpay-settlement", workflowId: `stl-${Date.now()}` },
    escrow: { taskQueue: "tourismpay-settlement", workflowId: `esc-${Date.now()}` },
    fraud: { taskQueue: "tourismpay-fraud-investigation", workflowId: `fraud-${Date.now()}` },
  };

  const config = configs[workflowType];
  try {
    const workflowId = await tc.start(config.workflowId, config.taskQueue, `${workflowType}Workflow`, [input]);
    logger.info(`[Temporal] Started ${workflowType} workflow: ${workflowId}`);
    return workflowId;
  } catch (err) {
    logger.error(`[Temporal] Failed to start ${workflowType} workflow: ${(err as Error).message}`);
    return null;
  }
}

export async function signalWorkflow(workflowId: string, signalName: string, payload?: unknown): Promise<boolean> {
  const tc = await getTemporalClient();
  if (!tc) return false;

  try {
    await tc.signal(workflowId, signalName, payload ? [payload] : []);
    return true;
  } catch (err) {
    logger.error(`[Temporal] Signal failed: ${(err as Error).message}`);
    return false;
  }
}
