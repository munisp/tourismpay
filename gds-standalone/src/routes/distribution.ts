/**
 * Distribution API — Manage how rates/availability are pushed to agents.
 */
import { Router, Request, Response } from "express";
import { requireRole } from "../auth";

export const distributionRouter = Router();

// Get distribution channels
distributionRouter.get("/channels", async (req: Request, res: Response) => {
  res.json({ channels: [], total: 0 });
});

// Connect a distribution channel
distributionRouter.post("/channels", async (req: Request, res: Response) => {
  const { type, endpoint, properties, countries } = req.body;

  const validTypes = ["api", "webhook", "streaming", "batch"];
  if (!type || !validTypes.includes(type)) {
    res.status(400).json({ error: "Valid channel type required", valid: validTypes });
    return;
  }

  res.status(201).json({
    channel: {
      id: `dist_${Date.now().toString(36)}`,
      agentId: req.gdsUser?.agentId || req.gdsUser?.sub,
      type,
      endpoint: endpoint || null,
      properties: properties || [],
      countries: countries || [],
      status: "active",
      createdAt: new Date().toISOString(),
    },
  });
});

// Disconnect channel
distributionRouter.delete("/channels/:id", async (req: Request, res: Response) => {
  res.json({ disconnected: true, channelId: req.params.id });
});

// Get distribution stats
distributionRouter.get("/stats", async (_req: Request, res: Response) => {
  res.json({
    totalChannels: 0,
    activeChannels: 0,
    lastPush: null,
    ratesPushed: 0,
    availabilityPushed: 0,
  });
});

// Manual rate push trigger (admin)
distributionRouter.post("/push/rates", requireRole("admin"), async (req: Request, res: Response) => {
  const { propertyId, channelId } = req.body;
  res.json({
    pushed: true,
    propertyId,
    channelId: channelId || "all",
    timestamp: new Date().toISOString(),
  });
});

// Manual availability push trigger (admin)
distributionRouter.post("/push/availability", requireRole("admin"), async (req: Request, res: Response) => {
  const { propertyId, channelId } = req.body;
  res.json({
    pushed: true,
    propertyId,
    channelId: channelId || "all",
    timestamp: new Date().toISOString(),
  });
});

// Webhook subscription for external apps
distributionRouter.post("/webhooks", async (req: Request, res: Response) => {
  const { url, events } = req.body;

  if (!url) {
    res.status(400).json({ error: "Webhook URL required" });
    return;
  }

  const validEvents = [
    "property.registered", "property.updated",
    "availability.changed", "rate.updated",
    "reservation.created", "reservation.cancelled",
    "settlement.completed",
  ];

  res.status(201).json({
    webhook: {
      id: `wh_${Date.now().toString(36)}`,
      url,
      events: events || validEvents,
      status: "active",
      secret: `whsec_${Date.now().toString(36)}`,
    },
    message: "Webhook registered. Events will be signed with the secret.",
  });
});

// List webhooks
distributionRouter.get("/webhooks", async (_req: Request, res: Response) => {
  res.json({ webhooks: [] });
});
