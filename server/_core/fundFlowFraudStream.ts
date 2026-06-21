/**
 * Fund Flow Fraud Streaming — Fluvio Real-Time Detection Pipeline
 *
 * Streams ALL fund-flow transactions to Fluvio for real-time anomaly detection.
 * The ML fraud service consumes from these topics and triggers:
 *   - Velocity checks (too many txns in short window)
 *   - Amount anomaly detection (unusual amounts for user profile)
 *   - Geography mismatch (transaction from unexpected location)
 *   - Network analysis (linked fraudulent accounts)
 *   - Pattern recognition (structured deposits, rapid cash-out)
 *
 * Actions on detection:
 *   - Score < 0.3: Allow (low risk)
 *   - Score 0.3-0.7: Flag for review, allow
 *   - Score 0.7-0.9: Require step-up auth (biometric)
 *   - Score > 0.9: Block transaction, freeze funds
 */
import { logger } from "./logger";
import { produceToFluvio, FLUVIO_TOPICS } from "./fluvio";
import { publishEvent, TOPICS } from "./kafka";
import type { FundFlowContext, TransferParams } from "./fundFlowOrchestrator";

// ─── Risk Scoring Configuration ──────────────────────────────────────────────

const RISK_THRESHOLDS = {
  ALLOW: 0.3,
  FLAG: 0.7,
  STEP_UP: 0.9,
  BLOCK: 1.0,
} as const;

const VELOCITY_LIMITS = {
  MAX_TXN_PER_MINUTE: 5,
  MAX_TXN_PER_HOUR: 30,
  MAX_AMOUNT_PER_DAY_USD: 10_000,
  MAX_UNIQUE_RECIPIENTS_PER_HOUR: 10,
} as const;

export interface FraudStreamEvent {
  eventId: string;
  timestamp: number;
  userId: number;
  transferType: string;
  amount: number;
  currency: string;
  fromEntity: string;
  toEntity: string;
  ipAddress?: string;
  deviceFingerprint?: string;
  sessionId: string;
  riskSignals: RiskSignal[];
}

interface RiskSignal {
  type: string;
  score: number;
  details: string;
}

export interface FraudDecision {
  action: "allow" | "flag" | "step_up" | "block";
  score: number;
  signals: RiskSignal[];
  requiresBiometric: boolean;
}

// ─── Stream to Fraud Detection ───────────────────────────────────────────────

export async function streamFundFlowToFraudPipeline(
  ctx: FundFlowContext,
  params: TransferParams,
  transactionId: string,
): Promise<FraudDecision> {
  const event: FraudStreamEvent = {
    eventId: transactionId,
    timestamp: Date.now(),
    userId: ctx.userId,
    transferType: params.transferType,
    amount: params.amount,
    currency: params.currency,
    fromEntity: `${params.fromUserId || "platform"}`,
    toEntity: `${params.toUserId || params.toEstablishmentId || "external"}`,
    ipAddress: ctx.ipAddress,
    deviceFingerprint: ctx.deviceFingerprint,
    sessionId: ctx.sessionId,
    riskSignals: [],
  };

  // Stream to Fluvio for real-time ML processing
  try {
    await produceToFluvio(FLUVIO_TOPICS.TRANSACTION_EVENTS, `user:${ctx.userId}`, event as unknown as Record<string, unknown>);
  } catch (err) {
    logger.warn(`[FraudStream] Fluvio publish failed (non-blocking): ${(err as Error).message}`);
  }

  // Perform local velocity/heuristic checks (pre-ML layer)
  const signals = await computeLocalRiskSignals(ctx, params);
  event.riskSignals = signals;

  const score = signals.reduce((max, s) => Math.max(max, s.score), 0);

  let action: FraudDecision["action"] = "allow";
  if (score >= RISK_THRESHOLDS.STEP_UP) action = "block";
  else if (score >= RISK_THRESHOLDS.FLAG) action = "step_up";
  else if (score >= RISK_THRESHOLDS.ALLOW) action = "flag";

  const decision: FraudDecision = {
    action,
    score,
    signals,
    requiresBiometric: action === "step_up",
  };

  // If flagged/blocked, also publish to Kafka fraud_alerts topic
  if (action !== "allow") {
    try {
      await publishEvent(TOPICS.FRAUD_ALERTS, {
        type: `fraud.${action}`,
        payload: { userId: ctx.userId, entityId: transactionId, entityType: "fund_flow", decision, event },
        timestamp: new Date().toISOString(),
      });
    } catch {
      // Non-blocking
    }
  }

  return decision;
}

// ─── Local Risk Signal Computation (Pre-ML) ──────────────────────────────────

async function computeLocalRiskSignals(
  ctx: FundFlowContext,
  params: TransferParams,
): Promise<RiskSignal[]> {
  const signals: RiskSignal[] = [];

  // High-value transaction signal
  const HIGH_VALUE_THRESHOLD = 500_000; // in smallest unit (5000 USD/NGN equivalent)
  if (params.amount > HIGH_VALUE_THRESHOLD) {
    signals.push({
      type: "high_value",
      score: Math.min(0.5 + (params.amount / HIGH_VALUE_THRESHOLD - 1) * 0.1, 0.8),
      details: `Amount ${params.amount} exceeds threshold ${HIGH_VALUE_THRESHOLD}`,
    });
  }

  // Cross-border signal (higher risk)
  if (params.transferType === "FX_CONVERSION" || params.transferType === "SETTLEMENT") {
    signals.push({
      type: "cross_border",
      score: 0.3,
      details: `Cross-border transfer type: ${params.transferType}`,
    });
  }

  // New recipient signal
  if (params.toUserId && params.metadata?.newRecipient) {
    signals.push({
      type: "new_recipient",
      score: 0.25,
      details: `First transaction to user ${params.toUserId}`,
    });
  }

  // Multiple rapid transactions (velocity)
  // This is a simplified check — in production, Redis INCR with TTL
  if (params.metadata?.transactionsInLastMinute && (params.metadata.transactionsInLastMinute as number) > 3) {
    signals.push({
      type: "velocity",
      score: 0.6,
      details: `${params.metadata.transactionsInLastMinute} transactions in last minute`,
    });
  }

  return signals;
}

// ─── Kafka Consumer for Fraud Decisions (ML Service Response) ─────────────────

export async function handleFraudDecisionFromML(event: {
  transactionId: string;
  userId: number;
  decision: "allow" | "block" | "freeze";
  score: number;
  model: string;
}): Promise<void> {
  if (event.decision === "freeze") {
    // Trigger fund freeze via Python service
    logger.warn(`[FraudStream] ML model ${event.model} triggered freeze for user ${event.userId} on txn ${event.transactionId}`);
    // The actual freeze is handled by the Python fund_flow_guard.freeze_funds()
    // via Dapr service invocation
    await publishEvent(TOPICS.FRAUD_ALERTS, {
      type: "fraud.ml_freeze_triggered",
      payload: { userId: event.userId, entityId: event.transactionId, entityType: "fund_flow", event },
      timestamp: new Date().toISOString(),
    });
  }
}
