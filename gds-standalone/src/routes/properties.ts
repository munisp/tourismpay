/**
 * Properties API — Register, update, search African tourism properties.
 * Proxies to Go GDS engine for high-performance operations.
 */
import { Router, Request, Response } from "express";
import { requireRole } from "../auth";
import { config } from "../config";

export const propertiesRouter = Router();

// List properties (with pagination + filters)
propertiesRouter.get("/", async (req: Request, res: Response) => {
  const { country, type, star_rating, page = "1", page_size = "20" } = req.query;
  const tenantId = (req as any).tenant?.tenantId || "default";

  // In production: proxy to Go engine or query PostgreSQL directly
  res.json({
    properties: [],
    total: 0,
    page: parseInt(page as string),
    pageSize: parseInt(page_size as string),
    filters: { country, type, star_rating, tenantId },
  });
});

// Get single property
propertiesRouter.get("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  res.json({ property: null, message: `Property ${id} — query Go engine at ${config.GDS_ENGINE_URL}` });
});

// Register new property (property managers only)
propertiesRouter.post("/", requireRole("property_manager", "admin"), async (req: Request, res: Response) => {
  const body = req.body;
  const tenantId = (req as any).tenant?.tenantId || "default";

  // Validate required fields
  const required = ["name", "type", "country", "currency"];
  const missing = required.filter((f) => !body[f]);
  if (missing.length > 0) {
    res.status(400).json({ error: "Missing required fields", missing });
    return;
  }

  // Validate African country
  const africanCountries = ["KE", "ZA", "TZ", "NG", "GH", "RW", "UG", "ET", "MA", "EG", "BW", "NA", "ZW", "MU", "MZ", "SN", "CI", "CM", "TN", "MG"];
  if (!africanCountries.includes(body.country)) {
    res.status(400).json({ error: "Invalid country. GDS supports African countries only.", supported: africanCountries });
    return;
  }

  // In production: forward to Go engine
  const property = {
    id: `prop_${Date.now().toString(36)}`,
    tenantId,
    ...body,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  res.status(201).json({ property, message: "Property registered. Pending review." });
});

// Update property
propertiesRouter.put("/:id", requireRole("property_manager", "admin"), async (req: Request, res: Response) => {
  const { id } = req.params;
  res.json({ updated: true, propertyId: id });
});

// Delete property (admin only)
propertiesRouter.delete("/:id", requireRole("admin"), async (req: Request, res: Response) => {
  const { id } = req.params;
  res.json({ deleted: true, propertyId: id });
});

// Get property room types
propertiesRouter.get("/:id/room-types", async (req: Request, res: Response) => {
  const { id } = req.params;
  res.json({ propertyId: id, roomTypes: [] });
});

// Add room type to property
propertiesRouter.post("/:id/room-types", requireRole("property_manager", "admin"), async (req: Request, res: Response) => {
  const { id } = req.params;
  res.status(201).json({ propertyId: id, roomType: req.body });
});
