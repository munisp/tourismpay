/**
 * Map & Location Services — Mapbox integration for geocoding,
 * directions, and place search.
 *
 * Falls back to OpenStreetMap Nominatim when Mapbox is not configured.
 */
import { logger } from "../_core/logger";

// ─── Configuration ───────────────────────────────────────────────────────────

const MAPBOX_TOKEN = process.env.MAPBOX_ACCESS_TOKEN || "";
const MAPBOX_BASE = "https://api.mapbox.com";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GeocodingResult {
  id: string;
  name: string;
  fullAddress: string;
  latitude: number;
  longitude: number;
  country: string;
  region?: string;
  city?: string;
  postcode?: string;
  provider: "mapbox" | "nominatim";
}

export interface DirectionsResult {
  distance: number; // meters
  duration: number; // seconds
  geometry: string; // GeoJSON or polyline
  steps: Array<{ instruction: string; distance: number; duration: number }>;
  provider: "mapbox" | "osrm";
}

export interface PlaceSearchResult {
  id: string;
  name: string;
  category: string;
  address: string;
  latitude: number;
  longitude: number;
  distance?: number;
  provider: "mapbox" | "nominatim";
}

// ─── Mapbox Geocoding ────────────────────────────────────────────────────────

async function mapboxGeocode(query: string, options?: { country?: string; types?: string }): Promise<GeocodingResult[]> {
  const params = new URLSearchParams({
    access_token: MAPBOX_TOKEN,
    limit: "5",
    ...(options?.country ? { country: options.country } : {}),
    ...(options?.types ? { types: options.types } : {}),
  });

  const res = await fetch(`${MAPBOX_BASE}/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?${params}`);
  if (!res.ok) throw new Error(`Mapbox geocode error: ${res.status}`);

  const data = await res.json() as {
    features: Array<{
      id: string;
      place_name: string;
      center: [number, number];
      context?: Array<{ id: string; text: string }>;
      text: string;
    }>;
  };

  return data.features.map((f) => {
    const country = f.context?.find((c) => c.id.startsWith("country"))?.text || "";
    const region = f.context?.find((c) => c.id.startsWith("region"))?.text;
    const city = f.context?.find((c) => c.id.startsWith("place"))?.text;
    const postcode = f.context?.find((c) => c.id.startsWith("postcode"))?.text;
    return {
      id: f.id,
      name: f.text,
      fullAddress: f.place_name,
      longitude: f.center[0],
      latitude: f.center[1],
      country,
      region,
      city,
      postcode,
      provider: "mapbox" as const,
    };
  });
}

async function mapboxReverseGeocode(lat: number, lng: number): Promise<GeocodingResult | null> {
  const res = await fetch(`${MAPBOX_BASE}/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}&limit=1`);
  if (!res.ok) return null;
  const data = await res.json() as { features: Array<{ id: string; place_name: string; center: [number, number]; text: string; context?: Array<{ id: string; text: string }> }> };
  const f = data.features[0];
  if (!f) return null;
  return {
    id: f.id,
    name: f.text,
    fullAddress: f.place_name,
    longitude: f.center[0],
    latitude: f.center[1],
    country: f.context?.find((c) => c.id.startsWith("country"))?.text || "",
    region: f.context?.find((c) => c.id.startsWith("region"))?.text,
    city: f.context?.find((c) => c.id.startsWith("place"))?.text,
    provider: "mapbox",
  };
}

// ─── Nominatim Fallback ──────────────────────────────────────────────────────

async function nominatimGeocode(query: string): Promise<GeocodingResult[]> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`,
    { headers: { "User-Agent": "TourismPay/1.0" } },
  );
  if (!res.ok) return [];
  const data = await res.json() as Array<{
    place_id: number;
    display_name: string;
    lat: string;
    lon: string;
    address?: { country?: string; state?: string; city?: string; postcode?: string };
  }>;

  return data.map((r) => ({
    id: String(r.place_id),
    name: r.display_name.split(",")[0],
    fullAddress: r.display_name,
    latitude: parseFloat(r.lat),
    longitude: parseFloat(r.lon),
    country: r.address?.country || "",
    region: r.address?.state,
    city: r.address?.city,
    postcode: r.address?.postcode,
    provider: "nominatim" as const,
  }));
}

// ─── Directions ──────────────────────────────────────────────────────────────

async function mapboxDirections(
  from: [number, number],
  to: [number, number],
  profile: "driving" | "walking" | "cycling" = "driving",
): Promise<DirectionsResult | null> {
  const coords = `${from[1]},${from[0]};${to[1]},${to[0]}`;
  const res = await fetch(
    `${MAPBOX_BASE}/directions/v5/mapbox/${profile}/${coords}?access_token=${MAPBOX_TOKEN}&geometries=geojson&steps=true`,
  );
  if (!res.ok) return null;
  const data = await res.json() as {
    routes: Array<{
      distance: number;
      duration: number;
      geometry: unknown;
      legs: Array<{ steps: Array<{ maneuver: { instruction: string }; distance: number; duration: number }> }>;
    }>;
  };
  const route = data.routes[0];
  if (!route) return null;
  return {
    distance: route.distance,
    duration: route.duration,
    geometry: JSON.stringify(route.geometry),
    steps: route.legs[0]?.steps.map((s) => ({
      instruction: s.maneuver.instruction,
      distance: s.distance,
      duration: s.duration,
    })) || [],
    provider: "mapbox",
  };
}

async function osrmDirections(
  from: [number, number],
  to: [number, number],
  profile: "driving" | "walking" | "cycling" = "driving",
): Promise<DirectionsResult | null> {
  const profileMap = { driving: "car", walking: "foot", cycling: "bicycle" };
  const coords = `${from[1]},${from[0]};${to[1]},${to[0]}`;
  const res = await fetch(
    `https://router.project-osrm.org/route/v1/${profileMap[profile]}/${coords}?steps=true&geometries=geojson`,
  );
  if (!res.ok) return null;
  const data = await res.json() as {
    routes: Array<{
      distance: number;
      duration: number;
      geometry: unknown;
      legs: Array<{ steps: Array<{ maneuver: { instruction: string }; distance: number; duration: number }> }>;
    }>;
  };
  const route = data.routes[0];
  if (!route) return null;
  return {
    distance: route.distance,
    duration: route.duration,
    geometry: JSON.stringify(route.geometry),
    steps: route.legs[0]?.steps.map((s) => ({
      instruction: s.maneuver.instruction,
      distance: s.distance,
      duration: s.duration,
    })) || [],
    provider: "osrm",
  };
}

// ─── Unified API ─────────────────────────────────────────────────────────────

export async function geocode(query: string, options?: { country?: string }): Promise<GeocodingResult[]> {
  if (MAPBOX_TOKEN) {
    try { return await mapboxGeocode(query, options); }
    catch (err) { logger.warn("[Map] Mapbox geocode failed, falling back", { error: (err as Error).message }); }
  }
  return nominatimGeocode(query);
}

export async function reverseGeocode(lat: number, lng: number): Promise<GeocodingResult | null> {
  if (MAPBOX_TOKEN) {
    try { return await mapboxReverseGeocode(lat, lng); }
    catch { /* fall through */ }
  }
  const results = await nominatimGeocode(`${lat},${lng}`);
  return results[0] || null;
}

export async function getDirections(
  from: [number, number],
  to: [number, number],
  profile: "driving" | "walking" | "cycling" = "driving",
): Promise<DirectionsResult | null> {
  if (MAPBOX_TOKEN) {
    try { return await mapboxDirections(from, to, profile); }
    catch { /* fall through */ }
  }
  return osrmDirections(from, to, profile);
}

export function getMapConfig(): { provider: string; configured: boolean; token?: string } {
  return {
    provider: MAPBOX_TOKEN ? "mapbox" : "openstreetmap",
    configured: !!MAPBOX_TOKEN,
    // Only expose public token for frontend map rendering
    token: MAPBOX_TOKEN.startsWith("pk.") ? MAPBOX_TOKEN : undefined,
  };
}
