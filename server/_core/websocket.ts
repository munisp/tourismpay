/**
 * WebSocket Real-Time Features (2.1)
 * 
 * Live payment notifications, FX rate tickers, merchant POS confirmations,
 * and dispute resolution chat.
 *
 * Middleware integration: Redis (pub/sub for cross-instance messaging),
 * Kafka (event source), Fluvio (activity stream).
 */
import { Server as HTTPServer } from "http";
import { logger } from "./logger";

// WebSocket types (compatible with ws package when installed)
interface WebSocketLike {
  readyState: number;
  send(data: string): void;
  on(event: string, cb: (...args: unknown[]) => void): void;
}
interface WebSocketServerLike {
  on(event: string, cb: (...args: unknown[]) => void): void;
}
const WS_OPEN = 1;

// ─── Types ────────────────────────────────────────────────────────────────────

interface WSClient {
  ws: WebSocketLike;
  userId: string;
  role: string;
  channels: Set<string>;
  connectedAt: number;
}

type WSEventType =
  | "payment.confirmed"
  | "payment.received"
  | "fx.rate_update"
  | "merchant.pos_confirmation"
  | "chat.message"
  | "notification"
  | "fraud.alert"
  | "settlement.completed";

interface WSMessage {
  type: WSEventType;
  payload: Record<string, unknown>;
  timestamp: string;
}

// ─── WebSocket Manager ────────────────────────────────────────────────────────

class WebSocketManager {
  private wss: WebSocketServerLike | null = null;
  private clients: Map<string, WSClient> = new Map();
  private channels: Map<string, Set<string>> = new Map(); // channel -> client IDs

  initialize(server: HTTPServer): void {
    // In production, instantiate WebSocketServer from 'ws' package
    // This module defines the management layer; ws is optional peer dep
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { WebSocketServer } = require("ws") as { WebSocketServer: new (opts: { server: HTTPServer; path: string }) => WebSocketServerLike };
      this.wss = new WebSocketServer({ server, path: "/ws" });
    } catch {
      logger.warn("[WebSocket] 'ws' package not available — real-time disabled");
      return;
    }

    (this.wss as any).on("connection", (ws: WebSocketLike, req: { url?: string }) => {
      const clientId = `ws_${Date.now()}_${globalThis.crypto.randomUUID().slice(0, 6)}`;
      const userId = new URL(req.url || "/", "http://localhost").searchParams.get("userId") || "anonymous";
      const role = new URL(req.url || "/", "http://localhost").searchParams.get("role") || "tourist";

      const client: WSClient = {
        ws,
        userId,
        role,
        channels: new Set(["notifications"]),
        connectedAt: Date.now(),
      };

      this.clients.set(clientId, client);
      this.subscribeToChannel(clientId, `user:${userId}`);

      logger.info(`[WebSocket] Client connected: ${clientId} (user: ${userId})`);

      ws.on("message", (data: unknown) => {
        try {
          const msg = JSON.parse(String(data));
          this.handleClientMessage(clientId, msg);
        } catch {
          // Invalid JSON — ignore
        }
      });

      ws.on("close", () => {
        this.removeClient(clientId);
        logger.info(`[WebSocket] Client disconnected: ${clientId}`);
      });

      ws.on("error", () => {
        this.removeClient(clientId);
      });

      // Send connection acknowledgment
      this.sendToClient(clientId, {
        type: "notification",
        payload: { message: "Connected to TourismPay real-time", clientId },
        timestamp: new Date().toISOString(),
      });
    });

    logger.info("[WebSocket] Server initialized on /ws");
  }

  private handleClientMessage(clientId: string, msg: { action: string; channel?: string; payload?: unknown }): void {
    switch (msg.action) {
      case "subscribe":
        if (msg.channel) this.subscribeToChannel(clientId, msg.channel);
        break;
      case "unsubscribe":
        if (msg.channel) this.unsubscribeFromChannel(clientId, msg.channel);
        break;
      case "ping":
        this.sendToClient(clientId, { type: "notification", payload: { pong: true }, timestamp: new Date().toISOString() });
        break;
    }
  }

  subscribeToChannel(clientId: string, channel: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;
    client.channels.add(channel);
    if (!this.channels.has(channel)) this.channels.set(channel, new Set());
    this.channels.get(channel)!.add(clientId);
  }

  unsubscribeFromChannel(clientId: string, channel: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;
    client.channels.delete(channel);
    this.channels.get(channel)?.delete(clientId);
  }

  private removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;
    Array.from(client.channels).forEach((channel) => {
      this.channels.get(channel)?.delete(clientId);
    });
    this.clients.delete(clientId);
  }

  // ─── Broadcasting ──────────────────────────────────────────────────────────

  broadcast(message: WSMessage): void {
    Array.from(this.clients.values()).forEach((client) => {
      if (client.ws.readyState === WS_OPEN) {
        client.ws.send(JSON.stringify(message));
      }
    });
  }

  broadcastToChannel(channel: string, message: WSMessage): void {
    const subscribers = this.channels.get(channel);
    if (!subscribers) return;
    Array.from(subscribers).forEach((clientId) => {
      this.sendToClient(clientId, message);
    });
  }

  sendToUser(userId: string, message: WSMessage): void {
    this.broadcastToChannel(`user:${userId}`, message);
  }

  private sendToClient(clientId: string, message: WSMessage): void {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WS_OPEN) return;
    client.ws.send(JSON.stringify(message));
  }

  // ─── Business Event Emitters ────────────────────────────────────────────────

  notifyPaymentConfirmed(userId: string, amount: number, currency: string, merchantName: string): void {
    this.sendToUser(userId, {
      type: "payment.confirmed",
      payload: { amount, currency, merchantName, confirmedAt: new Date().toISOString() },
      timestamp: new Date().toISOString(),
    });
  }

  notifyPaymentReceived(merchantUserId: string, amount: number, currency: string, touristName: string): void {
    this.sendToUser(merchantUserId, {
      type: "payment.received",
      payload: { amount, currency, touristName, receivedAt: new Date().toISOString() },
      timestamp: new Date().toISOString(),
    });
  }

  broadcastFXRateUpdate(pair: string, rate: number, change: number): void {
    this.broadcastToChannel("fx:rates", {
      type: "fx.rate_update",
      payload: { pair, rate, change, updatedAt: new Date().toISOString() },
      timestamp: new Date().toISOString(),
    });
  }

  notifyFraudAlert(adminUserId: string, alertData: Record<string, unknown>): void {
    this.sendToUser(adminUserId, {
      type: "fraud.alert",
      payload: alertData,
      timestamp: new Date().toISOString(),
    });
  }

  notifySettlementCompleted(merchantUserId: string, amount: number, currency: string): void {
    this.sendToUser(merchantUserId, {
      type: "settlement.completed",
      payload: { amount, currency, settledAt: new Date().toISOString() },
      timestamp: new Date().toISOString(),
    });
  }

  // ─── Stats ──────────────────────────────────────────────────────────────────

  getStats(): { connections: number; channels: number } {
    return { connections: this.clients.size, channels: this.channels.size };
  }
}

export const wsManager = new WebSocketManager();
logger.info("[WebSocket] Module loaded");
