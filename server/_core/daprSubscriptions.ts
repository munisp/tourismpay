/**
 * Dapr Pub/Sub Subscription Endpoint Handler
 *
 * Dapr requires every app to expose:
 *   GET  /dapr/subscribe  → returns list of topics this app subscribes to
 *   POST /<topic-route>   → handles incoming messages for each subscription
 *
 * This module registers those routes on the Express app so Dapr's sidecar
 * can discover and deliver events to the TypeScript server.
 */
import type { Express, Request, Response } from "express";
import { publishEvent, TOPICS } from "./kafka";
import { logger } from "./logger";

// ─── Subscription Manifest ───────────────────────────────────────────────────
const SUBSCRIPTIONS = [
  {
    pubsubname: "tourismpay-pubsub",
    topic: "settlement-completed",
    route: "/dapr/events/settlement-completed",
  },
  {
    pubsubname: "tourismpay-pubsub",
    topic: "fraud-alert",
    route: "/dapr/events/fraud-alert",
  },
  {
    pubsubname: "tourismpay-pubsub",
    topic: "kyc-status-changed",
    route: "/dapr/events/kyc-status-changed",
  },
  {
    pubsubname: "tourismpay-pubsub",
    topic: "enaira-transaction-confirmed",
    route: "/dapr/events/enaira-transaction-confirmed",
  },
  {
    pubsubname: "tourismpay-pubsub",
    topic: "tax-remittance-confirmed",
    route: "/dapr/events/tax-remittance-confirmed",
  },
  {
    pubsubname: "tourismpay-pubsub",
    topic: "wallet-balance-updated",
    route: "/dapr/events/wallet-balance-updated",
  },
];

// ─── Event Handlers ──────────────────────────────────────────────────────────
async function handleSettlementCompleted(data: Record<string, unknown>) {
  logger.info(`[Dapr] Settlement completed: ${JSON.stringify(data)}`);
  await publishEvent(TOPICS.SETTLEMENT_EVENTS, { ...data, source: "dapr" });
}

async function handleFraudAlert(data: Record<string, unknown>) {
  logger.warn(`[Dapr] Fraud alert received: ${JSON.stringify(data)}`);
  await publishEvent(TOPICS.FRAUD_EVENTS, { ...data, source: "dapr" });
}

async function handleKycStatusChanged(data: Record<string, unknown>) {
  logger.info(`[Dapr] KYC status changed: ${JSON.stringify(data)}`);
  await publishEvent(TOPICS.KYC_EVENTS, { ...data, source: "dapr" });
}

async function handleEnairaTransactionConfirmed(data: Record<string, unknown>) {
  logger.info(`[Dapr] eNaira transaction confirmed: ${JSON.stringify(data)}`);
  await publishEvent(TOPICS.PAYMENT_EVENTS, { ...data, type: "enaira_confirmed", source: "dapr" });
}

async function handleTaxRemittanceConfirmed(data: Record<string, unknown>) {
  logger.info(`[Dapr] Tax remittance confirmed: ${JSON.stringify(data)}`);
  await publishEvent(TOPICS.TAX_EVENTS, { ...data, source: "dapr" });
}

async function handleWalletBalanceUpdated(data: Record<string, unknown>) {
  logger.info(`[Dapr] Wallet balance updated: ${JSON.stringify(data)}`);
  // No-op: balance updates are handled by direct DB writes; this is for audit
}

const ROUTE_HANDLERS: Record<string, (data: Record<string, unknown>) => Promise<void>> = {
  "/dapr/events/settlement-completed": handleSettlementCompleted,
  "/dapr/events/fraud-alert": handleFraudAlert,
  "/dapr/events/kyc-status-changed": handleKycStatusChanged,
  "/dapr/events/enaira-transaction-confirmed": handleEnairaTransactionConfirmed,
  "/dapr/events/tax-remittance-confirmed": handleTaxRemittanceConfirmed,
  "/dapr/events/wallet-balance-updated": handleWalletBalanceUpdated,
};

// ─── Registration ─────────────────────────────────────────────────────────────
export function registerDaprRoutes(app: Express): void {
  // Dapr subscription discovery endpoint
  app.get("/dapr/subscribe", (_req: Request, res: Response) => {
    res.json(SUBSCRIPTIONS);
  });

  // Register each event handler route
  for (const sub of SUBSCRIPTIONS) {
    app.post(sub.route, async (req: Request, res: Response) => {
      try {
        const { data } = req.body as { data: Record<string, unknown> };
        const handler = ROUTE_HANDLERS[sub.route];
        if (handler) {
          await handler(data ?? req.body);
        }
        // Dapr expects HTTP 200 to acknowledge successful processing
        res.status(200).json({ success: true });
      } catch (err) {
        logger.error(`[Dapr] Handler error for ${sub.route}: ${(err as Error).message}`);
        // Return 500 so Dapr retries the message
        res.status(500).json({ error: (err as Error).message });
      }
    });
  }

  // Dapr health check endpoint
  app.get("/dapr/health", (_req: Request, res: Response) => {
    res.status(204).send();
  });

  logger.info(`[Dapr] Registered ${SUBSCRIPTIONS.length} pub/sub subscriptions`);
}
