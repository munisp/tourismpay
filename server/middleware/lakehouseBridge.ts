/**
 * Lakehouse Bridge — wires platform events to the ML feature store.
 *
 * Hooks into key platform operations (transactions, fraud alerts, BIS investigations,
 * FX rate changes, wallet events) and streams them to:
 * 1. Fluvio/Lakehouse streaming pipeline → Lakehouse Analytics Service (port 8121)
 * 2. Directly to feature store Parquet files for ML training
 *
 * This is the missing link between the platform's PostgreSQL data and the ML pipeline.
 */
import { streamTransaction, streamFraudAlert, streamExchangeRate, streamToLakehouse } from "./fluvioLakehouse";
import { logger } from "../_core/logger";

/**
 * Called after a transaction is created/completed.
 * Streams the transaction to the lakehouse for fraud feature materialization.
 */
export function onTransactionCreated(txn: {
  id?: string | number;
  transaction_id?: string;
  amount: number | string;
  currency?: string;
  user_id?: string | number;
  merchant_id?: string | number;
  payment_method?: string;
  country?: string;
  status?: string;
  [key: string]: unknown;
}): void {
  try {
    streamTransaction({
      transaction_id: String(txn.transaction_id || txn.id || ""),
      user_id: String(txn.user_id || ""),
      merchant_id: String(txn.merchant_id || ""),
      amount: Number(txn.amount) || 0,
      currency: txn.currency || "USD",
      payment_method: txn.payment_method || "card",
      country: txn.country || "XX",
      status: txn.status || "completed",
    });
  } catch (err) {
    logger.warn("Lakehouse bridge: failed to stream transaction", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Called when a fraud alert is raised.
 * Streams to lakehouse for fraud detection model feedback loop.
 */
export function onFraudAlertCreated(alert: {
  alert_id?: string;
  transaction_id?: string;
  severity?: string;
  amount?: number | string;
  country?: string;
  gnn_score?: number | string;
  rule_triggered?: string;
  [key: string]: unknown;
}): void {
  try {
    streamFraudAlert({
      alert_id: alert.alert_id || "",
      transaction_id: alert.transaction_id || "",
      severity: alert.severity || "medium",
      amount: Number(alert.amount) || 0,
      country: alert.country || "XX",
      gnn_score: Number(alert.gnn_score) || 0,
      rule_triggered: alert.rule_triggered || "",
      is_fraud: 1,
    });
  } catch (err) {
    logger.warn("Lakehouse bridge: failed to stream fraud alert", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Called when exchange rates are updated.
 * Streams to lakehouse for FX forecasting model.
 */
export function onExchangeRateUpdated(
  corridor: string,
  rate: number,
  volume?: number,
): void {
  try {
    streamExchangeRate(corridor, rate, volume);
  } catch (err) {
    logger.warn("Lakehouse bridge: failed to stream FX rate", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Called when a BIS investigation is created/updated.
 * Streams to lakehouse for BIS risk model training.
 */
export function onBisInvestigationUpdated(investigation: {
  reference_id?: string;
  subject_type?: string;
  country?: string;
  risk_level?: string;
  risk_score?: number;
  industry?: string;
  status?: string;
  [key: string]: unknown;
}): void {
  try {
    streamToLakehouse("tourismpay.bis.events", {
      reference_id: investigation.reference_id || "",
      subject_type: investigation.subject_type || "entity",
      country: investigation.country || "XX",
      risk_level: investigation.risk_level || "low",
      risk_score: Number(investigation.risk_score) || 0,
      industry: investigation.industry || "unknown",
      status: investigation.status || "pending",
      streamed_at: new Date().toISOString(),
    });
  } catch (err) {
    logger.warn("Lakehouse bridge: failed to stream BIS investigation", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Called on wallet events (deposit, withdrawal, transfer).
 */
export function onWalletEvent(event: {
  wallet_id?: string;
  user_id?: string | number;
  event_type?: string;
  amount?: number | string;
  currency?: string;
  [key: string]: unknown;
}): void {
  try {
    streamToLakehouse("tourismpay.wallet.events", {
      wallet_id: event.wallet_id || "",
      user_id: String(event.user_id || ""),
      event_type: event.event_type || "unknown",
      amount: Number(event.amount) || 0,
      currency: event.currency || "USD",
      streamed_at: new Date().toISOString(),
    });
  } catch (err) {
    logger.warn("Lakehouse bridge: failed to stream wallet event", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Called on settlement events.
 */
export function onSettlementEvent(event: {
  settlement_id?: string;
  amount?: number | string;
  currency?: string;
  status?: string;
  [key: string]: unknown;
}): void {
  try {
    streamToLakehouse("tourismpay.settlements", {
      settlement_id: event.settlement_id || "",
      amount: Number(event.amount) || 0,
      currency: event.currency || "USD",
      status: event.status || "pending",
      streamed_at: new Date().toISOString(),
    });
  } catch (err) {
    logger.warn("Lakehouse bridge: failed to stream settlement event", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
