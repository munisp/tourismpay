/**
 * Guest Profile CRM Route — Proxies to Go guest-profile service (port 8084).
 * Preferences, stay history, corporate accounts, travel policies.
 */
import { Router, Request, Response } from "express";

export const guestProfileRouter = Router();

const GUEST_SERVICE_URL = process.env.GUEST_SERVICE_URL || "http://localhost:8084";

async function proxy(req: Request, res: Response, path: string, method: string = "GET") {
  try {
    const url = `${GUEST_SERVICE_URL}${path}`;
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
    res.status(503).json({ error: "Guest profile service unavailable" });
  }
}

// Create profile
guestProfileRouter.post("/", (req, res) => proxy(req, res, "/api/v1/guests/", "POST"));

// Search profiles
guestProfileRouter.get("/search", (req, res) => {
  const params = new URLSearchParams(req.query as Record<string, string>);
  proxy(req, res, `/api/v1/guests/search?${params.toString()}`);
});

// Get profile
guestProfileRouter.get("/:id", (req, res) => proxy(req, res, `/api/v1/guests/${req.params.id}`));

// Update preferences
guestProfileRouter.put("/:id/preferences", (req, res) => proxy(req, res, `/api/v1/guests/${req.params.id}/preferences`, "PUT"));

// Add stay record
guestProfileRouter.post("/:id/stays", (req, res) => proxy(req, res, `/api/v1/guests/${req.params.id}/stays`, "POST"));

// Corporate accounts
guestProfileRouter.post("/corporates", (req, res) => proxy(req, res, "/api/v1/corporates/", "POST"));
guestProfileRouter.get("/corporates", (req, res) => proxy(req, res, "/api/v1/corporates/"));
