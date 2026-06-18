/**
 * Properties API — Full CRUD for African tourism properties.
 * Uses in-memory store with seed data. In production, queries PostgreSQL.
 */
import { Router, Request, Response } from "express";
import { requireRole } from "../auth";
import { establishments, generateId } from "../lib/store";

export const propertiesRouter = Router();

const africanCountries = ["KE", "ZA", "TZ", "NG", "GH", "RW", "UG", "ET", "MA", "EG", "BW", "NA", "ZW", "MU", "MZ", "SN", "CI", "CM", "TN", "MG"];

// List properties
propertiesRouter.get("/", (req: Request, res: Response) => {
  let results = [...establishments];
  const { country, type, star_rating, status, tier } = req.query;
  if (country) results = results.filter(e => e.country === country);
  if (type) results = results.filter(e => e.type === type);
  if (star_rating) results = results.filter(e => e.star_rating >= Number(star_rating));
  if (status) results = results.filter(e => e.status === status);
  if (tier) results = results.filter(e => e.tier === tier);

  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.page_size as string) || 20;
  const start = (page - 1) * pageSize;

  res.json({
    properties: results.slice(start, start + pageSize),
    total: results.length,
    page, pageSize,
  });
});

// Get single property
propertiesRouter.get("/:id", (req: Request, res: Response) => {
  const prop = establishments.find(e => e.id === req.params.id);
  if (!prop) return res.status(404).json({ error: "Property not found" });
  res.json(prop);
});

// Create property
propertiesRouter.post("/", requireRole("property_manager", "admin"), (req: Request, res: Response) => {
  const { name, type, country, currency, contact_name, contact_email } = req.body;
  const missing = ["name", "type", "country"].filter(f => !req.body[f]);
  if (missing.length > 0) return res.status(400).json({ error: "Missing required fields", missing });
  if (!africanCountries.includes(country)) {
    return res.status(400).json({ error: "GDS supports African countries only", supported: africanCountries });
  }

  const property = {
    id: generateId("EST"),
    name, type, country, city: req.body.city || "", address: req.body.address || "",
    contact_name: contact_name || "", contact_email: contact_email || "",
    contact_phone: req.body.contact_phone || "", rooms: req.body.rooms || 0,
    star_rating: req.body.star_rating || 0, tier: "sms_only",
    status: "pending_verification", onboarding_step: 1, onboarding_channel: "web",
    amenities: req.body.amenities || [], currency: currency || "USD",
    base_rate: req.body.base_rate || 0, verified: false,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
  establishments.push(property);
  res.status(201).json(property);
});

// Update property
propertiesRouter.put("/:id", requireRole("property_manager", "admin"), (req: Request, res: Response) => {
  const idx = establishments.findIndex(e => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Property not found" });
  establishments[idx] = { ...establishments[idx], ...req.body, id: establishments[idx].id, updated_at: new Date().toISOString() };
  res.json(establishments[idx]);
});

// Delete property
propertiesRouter.delete("/:id", requireRole("admin"), (req: Request, res: Response) => {
  const idx = establishments.findIndex(e => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Property not found" });
  establishments.splice(idx, 1);
  res.json({ deleted: true, id: req.params.id });
});

// Get room types for a property
propertiesRouter.get("/:id/room-types", (req: Request, res: Response) => {
  const prop = establishments.find(e => e.id === req.params.id);
  if (!prop) return res.status(404).json({ error: "Property not found" });
  res.json({
    propertyId: req.params.id,
    roomTypes: [
      { id: "RT-STD", name: "Standard", max_occupancy: 2, base_rate: prop.base_rate },
      { id: "RT-DLX", name: "Deluxe", max_occupancy: 2, base_rate: Math.round(prop.base_rate * 1.4) },
      { id: "RT-STE", name: "Suite", max_occupancy: 3, base_rate: Math.round(prop.base_rate * 2.0) },
    ],
  });
});
