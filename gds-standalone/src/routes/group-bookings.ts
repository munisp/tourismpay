/**
 * Group Bookings Route — Proxies to Go group-bookings service (port 8087).
 * Block allocation, rooming lists, attrition management.
 */
import { Router, Request, Response } from "express";

export const groupBookingsRouter = Router();

const GROUP_SERVICE_URL = process.env.GROUP_SERVICE_URL || "http://localhost:8087";

async function proxy(req: Request, res: Response, path: string, method: string = "GET") {
  try {
    const url = `${GROUP_SERVICE_URL}${path}`;
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
    res.status(503).json({ error: "Group bookings service unavailable" });
  }
}

// Create group
groupBookingsRouter.post("/", (req, res) => proxy(req, res, "/api/v1/groups/", "POST"));

// List groups
groupBookingsRouter.get("/", (req, res) => {
  const params = new URLSearchParams(req.query as Record<string, string>);
  proxy(req, res, `/api/v1/groups/?${params.toString()}`);
});

// Get group
groupBookingsRouter.get("/:id", (req, res) => proxy(req, res, `/api/v1/groups/${req.params.id}`));

// Add rooming entry
groupBookingsRouter.post("/:id/rooming", (req, res) => proxy(req, res, `/api/v1/groups/${req.params.id}/rooming`, "POST"));

// Get attrition status
groupBookingsRouter.get("/:id/attrition", (req, res) => proxy(req, res, `/api/v1/groups/${req.params.id}/attrition`));

// Washdown (release rooms)
groupBookingsRouter.post("/:id/washdown", (req, res) => proxy(req, res, `/api/v1/groups/${req.params.id}/washdown`, "POST"));
