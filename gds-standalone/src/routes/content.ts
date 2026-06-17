/**
 * Content Management Route — Proxies to Python content service (port 8085).
 * Rich property content, images, amenities, policies, multilingual.
 */
import { Router, Request, Response } from "express";

export const contentRouter = Router();

const CONTENT_SERVICE_URL = process.env.CONTENT_SERVICE_URL || "http://localhost:8085";

async function proxy(req: Request, res: Response, path: string, method: string = "GET") {
  try {
    const url = `${CONTENT_SERVICE_URL}${path}`;
    const options: RequestInit = {
      method,
      headers: { "Content-Type": "application/json" },
    };
    if (method !== "GET") {
      options.body = JSON.stringify(req.body);
    }
    const response = await fetch(url, options);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    res.status(503).json({ error: "Content service unavailable" });
  }
}

// Create content
contentRouter.post("/", (req, res) => proxy(req, res, "/api/v1/content", "POST"));

// Get content
contentRouter.get("/languages", (req, res) => proxy(req, res, "/api/v1/content/languages"));
contentRouter.get("/amenities", (req, res) => proxy(req, res, "/api/v1/content/amenities"));
contentRouter.get("/completeness", (req, res) => {
  const params = new URLSearchParams(req.query as Record<string, string>);
  proxy(req, res, `/api/v1/content/completeness?${params.toString()}`);
});
contentRouter.get("/search", (req, res) => {
  const params = new URLSearchParams(req.query as Record<string, string>);
  proxy(req, res, `/api/v1/content/search?${params.toString()}`);
});
contentRouter.get("/:id", (req, res) => {
  const lang = req.query.lang || "en";
  proxy(req, res, `/api/v1/content/${req.params.id}?lang=${lang}`);
});

// Update content
contentRouter.put("/:id/descriptions", (req, res) => proxy(req, res, `/api/v1/content/${req.params.id}/descriptions`, "PUT"));
contentRouter.put("/:id/amenities", (req, res) => proxy(req, res, `/api/v1/content/${req.params.id}/amenities`, "PUT"));
contentRouter.put("/:id/policies", (req, res) => proxy(req, res, `/api/v1/content/${req.params.id}/policies`, "PUT"));
contentRouter.post("/:id/images", (req, res) => proxy(req, res, `/api/v1/content/${req.params.id}/images`, "POST"));
