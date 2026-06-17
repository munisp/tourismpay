/**
 * Queue System Route — Proxies to Rust queue service (port 8083).
 * Agent work queues with priority, auto-assignment, SLA timers.
 */
import { Router, Request, Response } from "express";

export const queueRouter = Router();

const QUEUE_SERVICE_URL = process.env.QUEUE_SERVICE_URL || "http://localhost:8083";

async function proxy(req: Request, res: Response, path: string, method: string = "GET") {
  try {
    const url = `${QUEUE_SERVICE_URL}${path}`;
    const options: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-GDS-Tenant-ID": req.headers["x-gds-tenant-id"] as string || "",
      },
    };
    if (method !== "GET") {
      options.body = JSON.stringify(req.body);
    }
    const response = await fetch(url, options);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    res.status(503).json({ error: "Queue service unavailable" });
  }
}

// Create queue item
queueRouter.post("/", (req, res) => proxy(req, res, "/api/v1/queues", "POST"));

// List queue items
queueRouter.get("/", (req, res) => {
  const params = new URLSearchParams(req.query as Record<string, string>);
  proxy(req, res, `/api/v1/queues?${params.toString()}`);
});

// Get stats
queueRouter.get("/stats", (req, res) => proxy(req, res, "/api/v1/queues/stats"));

// Auto-assign
queueRouter.post("/auto-assign", (req, res) => proxy(req, res, "/api/v1/queues/auto-assign", "POST"));

// Register agent
queueRouter.post("/agents", (req, res) => proxy(req, res, "/api/v1/queues/agents", "POST"));

// Assign item
queueRouter.post("/:id/assign", (req, res) => proxy(req, res, `/api/v1/queues/${req.params.id}/assign`, "POST"));

// Complete item
queueRouter.post("/:id/complete", (req, res) => proxy(req, res, `/api/v1/queues/${req.params.id}/complete`, "POST"));
