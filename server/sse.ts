/**
 * Server-Sent Events (SSE) module for real-time alert streaming.
 * Provides live feeds for:
 *  - /api/sse/fraud        → Fraud Monitor live alerts
 *  - /api/sse/soc          → SOC Dashboard live alerts
 *  - /api/sse/bis          → BIS investigation status updates
 *  - /api/sse/settlements  → Settlement batch status changes
 */
import type { Express, Request, Response } from "express";
import { getFraudAlerts, getSocAlerts, getBisInvestigations } from "./db";
import { getDb } from "./db";
import { psSettlements } from "../drizzle/schema";
import { desc } from "drizzle-orm";
import { logger } from "./_core/logger";

// ─── Connection Registry ──────────────────────────────────────────────────────

type SSEClient = {
  id: string;
  res: Response;
  channel: "fraud" | "soc" | "bis" | "settlements";
  connectedAt: Date;
};

const clients = new Map<string, SSEClient>();

function generateClientId(): string {
  return `${Date.now()}-${crypto.randomUUID().replace(/-/g, "").substring(0, 7)}`;
}

function sendToClient(client: SSEClient, event: string, data: unknown): void {
  try {
    client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    // Client disconnected — remove from registry
    clients.delete(client.id);
  }
}

function broadcastToChannel(channel: SSEClient["channel"], event: string, data: unknown): void {
  for (const client of Array.from(clients.values())) {
    if (client.channel === channel) {
      sendToClient(client, event, data);
    }
  }
}

// ─── SSE Connection Handler ───────────────────────────────────────────────────

function createSSEHandler(channel: SSEClient["channel"]) {
  return async (req: Request, res: Response) => {
    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const clientId = generateClientId();
    const client: SSEClient = { id: clientId, res, channel, connectedAt: new Date() };
    clients.set(clientId, client);

    // Send connection confirmation
    sendToClient(client, "connected", {
      clientId,
      channel,
      timestamp: new Date().toISOString(),
    });

    // Send initial snapshot of recent data
    try {
      if (channel === "fraud") {
        const since = new Date(Date.now() - 60 * 60 * 1000); // last 1 hour
        const alerts = await getFraudAlerts({ since, limit: 20 });
        sendToClient(client, "snapshot", { alerts, timestamp: new Date().toISOString() });
      } else if (channel === "soc") {
        const since = new Date(Date.now() - 60 * 60 * 1000);
        const alerts = await getSocAlerts({ since, limit: 20 });
        sendToClient(client, "snapshot", { alerts, timestamp: new Date().toISOString() });
      } else if (channel === "bis") {
        const investigations = await getBisInvestigations({ limit: 10 });
        sendToClient(client, "snapshot", { investigations, timestamp: new Date().toISOString() });
      } else if (channel === "settlements") {
        const db = await getDb();
        if (db) {
          const recent = await db
            .select({
              id: psSettlements.id,
              batchId: psSettlements.batchId,
              status: psSettlements.status,
              totalAmount: psSettlements.totalAmount,
              currency: psSettlements.currency,
              updatedAt: psSettlements.updatedAt,
            })
            .from(psSettlements)
            .orderBy(desc(psSettlements.updatedAt))
            .limit(20);
          sendToClient(client, "snapshot", { settlements: recent, timestamp: new Date().toISOString() });
        } else {
          sendToClient(client, "snapshot", { settlements: [], timestamp: new Date().toISOString() });
        }
      }
    } catch {
      // DB not available yet — send empty snapshot
      sendToClient(client, "snapshot", { alerts: [], investigations: [], settlements: [], timestamp: new Date().toISOString() });
    }

    // Heartbeat every 30 seconds to keep connection alive
    const heartbeat = setInterval(() => {
      try {
        res.write(`: heartbeat ${new Date().toISOString()}\n\n`);
      } catch {
        clearInterval(heartbeat);
        clients.delete(clientId);
      }
    }, 30_000);

    // Cleanup on disconnect
    req.on("close", () => {
      clearInterval(heartbeat);
      clients.delete(clientId);
    });
  };
}

// ─── Polling Loop — Push new alerts to connected clients ─────────────────────

let lastFraudCheck = new Date();
let lastSocCheck = new Date();
let lastBisCheck = new Date();

async function pollAndBroadcast(): Promise<void> {
  const now = new Date();

  // Only poll if there are connected clients for the channel
  const allClients = Array.from(clients.values());
  const fraudClients = allClients.filter((c) => c.channel === "fraud");
  const socClients = allClients.filter((c) => c.channel === "soc");
  const bisClients = allClients.filter((c) => c.channel === "bis");
  const settlementClients = allClients.filter((c) => c.channel === "settlements");

  try {
    if (fraudClients.length > 0) {
      const newAlerts = await getFraudAlerts({ since: lastFraudCheck, limit: 50 });
      if (newAlerts.length > 0) {
        broadcastToChannel("fraud", "new_alerts", {
          alerts: newAlerts,
          count: newAlerts.length,
          timestamp: now.toISOString(),
        });
      }
      lastFraudCheck = now;
    }

    if (socClients.length > 0) {
      const newAlerts = await getSocAlerts({ since: lastSocCheck, limit: 50 });
      if (newAlerts.length > 0) {
        broadcastToChannel("soc", "new_alerts", {
          alerts: newAlerts,
          count: newAlerts.length,
          timestamp: now.toISOString(),
        });
      }
      lastSocCheck = now;
    }

    if (bisClients.length > 0) {
      const updates = await getBisInvestigations({ limit: 20 });
      if (updates.length > 0) {
        broadcastToChannel("bis", "status_updates", {
          investigations: updates,
          count: updates.length,
          timestamp: now.toISOString(),
        });
      }
      lastBisCheck = now;
    }

    if (settlementClients.length > 0) {
      const db = await getDb();
      if (db) {
        const recent = await db
          .select({
            id: psSettlements.id,
            batchId: psSettlements.batchId,
            status: psSettlements.status,
            totalAmount: psSettlements.totalAmount,
            currency: psSettlements.currency,
            updatedAt: psSettlements.updatedAt,
          })
          .from(psSettlements)
          .orderBy(desc(psSettlements.updatedAt))
          .limit(50);
        if (recent.length > 0) {
          broadcastToChannel("settlements", "status_updates", {
            settlements: recent,
            count: recent.length,
            timestamp: now.toISOString(),
          });
        }
      }
    }
  } catch {
    // DB temporarily unavailable — skip this poll cycle
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Register SSE routes on the Express app and start the polling loop.
 */
export function registerSSERoutes(app: Express): void {
  app.get("/api/sse/fraud", createSSEHandler("fraud"));
  app.get("/api/sse/soc", createSSEHandler("soc"));
  app.get("/api/sse/bis", createSSEHandler("bis"));
  app.get("/api/sse/settlements", createSSEHandler("settlements"));

  // Stats endpoint for monitoring
  app.get("/api/sse/stats", (_req, res) => {
    const allC = Array.from(clients.values());
    const stats = {
      totalClients: clients.size,
      fraudClients: allC.filter((c) => c.channel === "fraud").length,
      socClients: allC.filter((c) => c.channel === "soc").length,
      bisClients: allC.filter((c) => c.channel === "bis").length,
      settlementClients: allC.filter((c) => c.channel === "settlements").length,
    };
    res.json(stats);
  });

  // Start polling loop — check every 5 seconds
  setInterval(pollAndBroadcast, 5_000);

  logger.info("[SSE] Real-time event streams registered: /api/sse/{fraud,soc,bis,settlements}");
}

/**
 * Manually push an alert to all connected clients on a channel.
 * Called from tRPC mutations when a new alert is created.
 */
export function pushAlertToClients(
  channel: SSEClient["channel"],
  event: string,
  data: unknown
): void {
  broadcastToChannel(channel, event, data);
}

/**
 * Push a settlement status change event to all connected settlement clients.
 * Call this from settlement mutations after status changes.
 */
export function pushSettlementUpdate(data: {
  ids: string[];
  newStatus: string;
  count: number;
  actorName?: string;
}): void {
  broadcastToChannel("settlements", "status_change", {
    ...data,
    timestamp: new Date().toISOString(),
  });
}
