/**
 * PNR Engine Route — Proxies to Go PNR service (port 8082).
 * Full PNR lifecycle: create, segments, remarks, ticketing, queue, history, search.
 */
import { Router, Request, Response } from "express";

export const pnrRouter = Router();

const PNR_SERVICE_URL = process.env.PNR_SERVICE_URL || "http://localhost:8082";

// Proxy helper
async function proxy(req: Request, res: Response, path: string, method: string = "GET") {
  try {
    const url = `${PNR_SERVICE_URL}${path}`;
    const options: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-GDS-Tenant-ID": req.headers["x-gds-tenant-id"] as string || "",
        "X-GDS-Agent-ID": req.headers["x-gds-agent-id"] as string || "",
      },
    };
    if (method !== "GET" && method !== "DELETE") {
      options.body = JSON.stringify(req.body);
    }
    const response = await fetch(url, options);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    res.status(503).json({ error: "PNR service unavailable" });
  }
}

// Create PNR
pnrRouter.post("/", (req, res) => proxy(req, res, "/api/v1/pnr/", "POST"));

// Get PNR by locator
pnrRouter.get("/:locator", (req, res) => proxy(req, res, `/api/v1/pnr/${req.params.locator}`));

// Add segment
pnrRouter.post("/:locator/segments", (req, res) => proxy(req, res, `/api/v1/pnr/${req.params.locator}/segments`, "POST"));

// Cancel segment
pnrRouter.delete("/:locator/segments/:segmentId", (req, res) =>
  proxy(req, res, `/api/v1/pnr/${req.params.locator}/segments/${req.params.segmentId}`, "DELETE"));

// Add remark
pnrRouter.post("/:locator/remarks", (req, res) => proxy(req, res, `/api/v1/pnr/${req.params.locator}/remarks`, "POST"));

// Ticket PNR
pnrRouter.post("/:locator/ticket", (req, res) => proxy(req, res, `/api/v1/pnr/${req.params.locator}/ticket`, "POST"));

// Queue PNR
pnrRouter.post("/:locator/queue", (req, res) => proxy(req, res, `/api/v1/pnr/${req.params.locator}/queue`, "POST"));

// Get history
pnrRouter.get("/:locator/history", (req, res) => proxy(req, res, `/api/v1/pnr/${req.params.locator}/history`));

// Search PNRs
pnrRouter.get("/search", (req, res) => {
  const params = new URLSearchParams(req.query as Record<string, string>);
  proxy(req, res, `/api/v1/pnr/search?${params.toString()}`);
});
