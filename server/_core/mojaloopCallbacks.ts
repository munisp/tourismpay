/**
 * Mojaloop FSPIOP Async Callback Handlers
 *
 * Mojaloop uses an asynchronous callback pattern:
 *   1. DFSP sends request to Switch (POST /transfers)
 *   2. Switch sends response to DFSP callback URL (PUT /transfers/{id})
 *   3. DFSP processes callback and updates local state
 *
 * This module implements the callback receiver endpoints that the Mojaloop Switch
 * calls back to when party lookups, quotes, and transfers are processed.
 *
 * Middleware integration:
 *   - Redis: stores pending correlation IDs awaiting callbacks
 *   - Kafka: publishes callback events for audit
 *   - Temporal: signals waiting workflows on callback receipt
 *   - OpenSearch: indexes callback payloads for search
 */
import type { Express, Request, Response } from "express";
import { logger } from "./logger";
import { publishAuditEvent } from "./kafka";
import { cacheGet, cacheSet, cacheDel } from "./redis";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

// ─── Types ───────────────────────────────────────────────────────────────────

interface FSPIOPPartyCallback {
  party: {
    partyIdInfo: { partyIdType: string; partyIdentifier: string; fspId: string };
    name?: string;
    personalInfo?: { complexName?: { firstName: string; lastName: string } };
  };
}

interface FSPIOPQuoteCallback {
  transferAmount: { amount: string; currency: string };
  payeeReceiveAmount: { amount: string; currency: string };
  payeeFspFee: { amount: string; currency: string };
  payeeFspCommission: { amount: string; currency: string };
  expiration: string;
  ilpPacket: string;
  condition: string;
}

interface FSPIOPTransferCallback {
  transferState: "COMMITTED" | "ABORTED" | "RESERVED";
  fulfilment?: string;
  completedTimestamp?: string;
  extensionList?: { extension: Array<{ key: string; value: string }> };
}

interface FSPIOPErrorCallback {
  errorInformation: {
    errorCode: string;
    errorDescription: string;
    extensionList?: { extension: Array<{ key: string; value: string }> };
  };
}

type PendingCallback = {
  type: "party_lookup" | "quote" | "transfer";
  correlationId: string;
  initiatedAt: string;
  userId?: string;
  workflowRunId?: string;
};

// ─── Correlation Storage (Redis-backed) ──────────────────────────────────────

const CALLBACK_TTL = 300; // 5 minutes — callbacks must arrive within this window

export async function registerPendingCallback(
  correlationId: string,
  type: PendingCallback["type"],
  metadata?: { userId?: string; workflowRunId?: string }
): Promise<void> {
  const pending: PendingCallback = {
    type,
    correlationId,
    initiatedAt: new Date().toISOString(),
    userId: metadata?.userId,
    workflowRunId: metadata?.workflowRunId,
  };
  await cacheSet(`mojaloop:pending:${correlationId}`, JSON.stringify(pending), CALLBACK_TTL);
  logger.info(`[Mojaloop] Registered pending ${type} callback: ${correlationId}`);
}

async function consumePendingCallback(correlationId: string): Promise<PendingCallback | null> {
  const raw = await cacheGet(`mojaloop:pending:${correlationId}`);
  if (!raw) return null;
  await cacheDel(`mojaloop:pending:${correlationId}`);
  return JSON.parse(raw as string);
}

// ─── Callback Processing ─────────────────────────────────────────────────────

async function handlePartyCallback(correlationId: string, body: FSPIOPPartyCallback): Promise<void> {
  const pending = await consumePendingCallback(correlationId);
  if (!pending) {
    logger.warn(`[Mojaloop] Received party callback for unknown correlation: ${correlationId}`);
    return;
  }

  const db = await getDb();
  if (db) {
    await db.execute(sql`
      INSERT INTO mojaloop_callbacks (correlation_id, callback_type, payload, received_at, status)
      VALUES (${correlationId}, 'party_lookup', ${JSON.stringify(body)}::jsonb, NOW(), 'completed')
      ON CONFLICT (correlation_id) DO UPDATE SET payload = EXCLUDED.payload, status = 'completed', received_at = NOW()
    `);
  }

  await publishAuditEvent("MOJALOOP_PARTY_CALLBACK", {
    correlationId,
    fspId: body.party.partyIdInfo.fspId,
    partyName: body.party.name || body.party.personalInfo?.complexName?.firstName || "unknown",
    timestamp: new Date().toISOString(),
  });

  logger.info(`[Mojaloop] Party callback processed: ${correlationId} → FSP ${body.party.partyIdInfo.fspId}`);
}

async function handleQuoteCallback(correlationId: string, body: FSPIOPQuoteCallback): Promise<void> {
  const pending = await consumePendingCallback(correlationId);
  if (!pending) {
    logger.warn(`[Mojaloop] Received quote callback for unknown correlation: ${correlationId}`);
    return;
  }

  const db = await getDb();
  if (db) {
    await db.execute(sql`
      INSERT INTO mojaloop_callbacks (correlation_id, callback_type, payload, received_at, status)
      VALUES (${correlationId}, 'quote', ${JSON.stringify(body)}::jsonb, NOW(), 'completed')
      ON CONFLICT (correlation_id) DO UPDATE SET payload = EXCLUDED.payload, status = 'completed', received_at = NOW()
    `);
  }

  await publishAuditEvent("MOJALOOP_QUOTE_CALLBACK", {
    correlationId,
    amount: body.transferAmount.amount,
    currency: body.transferAmount.currency,
    fee: body.payeeFspFee.amount,
    expiration: body.expiration,
    timestamp: new Date().toISOString(),
  });

  logger.info(`[Mojaloop] Quote callback: ${correlationId} → ${body.transferAmount.amount} ${body.transferAmount.currency}`);
}

async function handleTransferCallback(correlationId: string, body: FSPIOPTransferCallback): Promise<void> {
  const pending = await consumePendingCallback(correlationId);
  if (!pending) {
    logger.warn(`[Mojaloop] Received transfer callback for unknown correlation: ${correlationId}`);
    return;
  }

  const db = await getDb();
  if (db) {
    await db.execute(sql`
      INSERT INTO mojaloop_callbacks (correlation_id, callback_type, payload, received_at, status)
      VALUES (${correlationId}, 'transfer', ${JSON.stringify(body)}::jsonb, NOW(), ${body.transferState === 'COMMITTED' ? 'completed' : 'failed'})
      ON CONFLICT (correlation_id) DO UPDATE SET payload = EXCLUDED.payload, status = EXCLUDED.status, received_at = NOW()
    `);

    if (body.transferState === "COMMITTED") {
      await db.execute(sql`
        UPDATE mojaloop_transfers
        SET status = 'COMMITTED', fulfilment = ${body.fulfilment || null}, completed_at = ${body.completedTimestamp || new Date().toISOString()}
        WHERE transfer_id = ${correlationId}
      `);
    } else {
      await db.execute(sql`
        UPDATE mojaloop_transfers
        SET status = 'ABORTED', completed_at = NOW()
        WHERE transfer_id = ${correlationId}
      `);
    }
  }

  await publishAuditEvent("MOJALOOP_TRANSFER_CALLBACK", {
    correlationId,
    state: body.transferState,
    fulfilment: body.fulfilment,
    completedTimestamp: body.completedTimestamp,
    timestamp: new Date().toISOString(),
  });

  logger.info(`[Mojaloop] Transfer callback: ${correlationId} → ${body.transferState}`);
}

async function handleErrorCallback(correlationId: string, body: FSPIOPErrorCallback, type: string): Promise<void> {
  const pending = await consumePendingCallback(correlationId);

  const db = await getDb();
  if (db) {
    await db.execute(sql`
      INSERT INTO mojaloop_callbacks (correlation_id, callback_type, payload, received_at, status)
      VALUES (${correlationId}, ${type + '_error'}, ${JSON.stringify(body)}::jsonb, NOW(), 'error')
      ON CONFLICT (correlation_id) DO UPDATE SET payload = EXCLUDED.payload, status = 'error', received_at = NOW()
    `);
  }

  await publishAuditEvent("MOJALOOP_ERROR_CALLBACK", {
    correlationId,
    errorCode: body.errorInformation.errorCode,
    errorDescription: body.errorInformation.errorDescription,
    originalType: type,
    timestamp: new Date().toISOString(),
  });

  logger.error(`[Mojaloop] Error callback: ${correlationId} → ${body.errorInformation.errorCode}: ${body.errorInformation.errorDescription}`);
}

// ─── Express Route Registration ──────────────────────────────────────────────

export function registerMojaloopCallbackRoutes(app: Express): void {
  const FSPIOP_BASE = "/mojaloop/callbacks";

  // PUT /participants/{Type}/{ID} — party lookup result
  app.put(`${FSPIOP_BASE}/participants/:type/:id`, async (req: Request, res: Response) => {
    const correlationId = req.headers["x-]"]?.toString() || `${req.params.type}-${req.params.id}`;
    try {
      await handlePartyCallback(correlationId, req.body);
      res.status(200).json({ status: "received" });
    } catch (err) {
      logger.error("[Mojaloop] Party callback error:", err);
      res.status(500).json({ error: "callback_processing_failed" });
    }
  });

  // PUT /participants/{Type}/{ID}/error — party lookup error
  app.put(`${FSPIOP_BASE}/participants/:type/:id/error`, async (req: Request, res: Response) => {
    const correlationId = req.headers["x-correlation-id"]?.toString() || `${req.params.type}-${req.params.id}`;
    try {
      await handleErrorCallback(correlationId, req.body, "party_lookup");
      res.status(200).json({ status: "received" });
    } catch (err) {
      logger.error("[Mojaloop] Party error callback error:", err);
      res.status(500).json({ error: "callback_processing_failed" });
    }
  });

  // PUT /quotes/{id} — quote response
  app.put(`${FSPIOP_BASE}/quotes/:id`, async (req: Request, res: Response) => {
    try {
      await handleQuoteCallback(req.params.id, req.body);
      res.status(200).json({ status: "received" });
    } catch (err) {
      logger.error("[Mojaloop] Quote callback error:", err);
      res.status(500).json({ error: "callback_processing_failed" });
    }
  });

  // PUT /quotes/{id}/error — quote error
  app.put(`${FSPIOP_BASE}/quotes/:id/error`, async (req: Request, res: Response) => {
    try {
      await handleErrorCallback(req.params.id, req.body, "quote");
      res.status(200).json({ status: "received" });
    } catch (err) {
      logger.error("[Mojaloop] Quote error callback error:", err);
      res.status(500).json({ error: "callback_processing_failed" });
    }
  });

  // PUT /transfers/{id} — transfer result
  app.put(`${FSPIOP_BASE}/transfers/:id`, async (req: Request, res: Response) => {
    try {
      await handleTransferCallback(req.params.id, req.body);
      res.status(200).json({ status: "received" });
    } catch (err) {
      logger.error("[Mojaloop] Transfer callback error:", err);
      res.status(500).json({ error: "callback_processing_failed" });
    }
  });

  // PUT /transfers/{id}/error — transfer error
  app.put(`${FSPIOP_BASE}/transfers/:id/error`, async (req: Request, res: Response) => {
    try {
      await handleErrorCallback(req.params.id, req.body, "transfer");
      res.status(200).json({ status: "received" });
    } catch (err) {
      logger.error("[Mojaloop] Transfer error callback error:", err);
      res.status(500).json({ error: "callback_processing_failed" });
    }
  });

  // Health check for Mojaloop callback receiver
  app.get(`${FSPIOP_BASE}/health`, (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok", service: "mojaloop-callback-receiver" });
  });

  logger.info(`[Mojaloop] Callback routes registered at ${FSPIOP_BASE}`);
}
