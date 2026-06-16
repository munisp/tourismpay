/**
 * Search API — Property search, autocomplete, recommendations.
 * Proxies to Python OpenSearch service for full-text search.
 */
import { Router, Request, Response } from "express";
import { config } from "../config";

export const searchRouter = Router();

// Full-text property search
searchRouter.get("/", async (req: Request, res: Response) => {
  const {
    q, destination, country, checkIn, checkOut,
    guests = "2", rooms = "1", type, minPrice, maxPrice,
    starRating, mealPlan, sortBy = "relevance",
    page = "1", pageSize = "20", currency = "USD",
  } = req.query;

  // In production: proxy to Python search service
  res.json({
    results: [],
    total: 0,
    page: parseInt(page as string),
    pageSize: parseInt(pageSize as string),
    queryTimeMs: 0,
    filters: { q, destination, country, checkIn, checkOut, type, starRating, mealPlan },
    searchService: config.GDS_SEARCH_URL,
  });
});

// Autocomplete destinations
searchRouter.get("/suggest", async (req: Request, res: Response) => {
  const { q = "", limit = "8" } = req.query;
  const prefix = (q as string).toLowerCase();

  const destinations = [
    "Masai Mara, Kenya", "Serengeti, Tanzania", "Cape Town, South Africa",
    "Victoria Falls, Zimbabwe", "Marrakech, Morocco", "Zanzibar, Tanzania",
    "Kruger National Park, South Africa", "Nairobi, Kenya", "Lagos, Nigeria",
    "Accra, Ghana", "Kigali, Rwanda", "Diani Beach, Kenya",
    "Ngorongoro, Tanzania", "Okavango Delta, Botswana", "Sossusvlei, Namibia",
    "Lamu Island, Kenya", "Addis Ababa, Ethiopia", "Mauritius",
    "Seychelles", "Mozambique Coast", "Mount Kilimanjaro, Tanzania",
    "Lake Malawi, Malawi", "Bwindi, Uganda", "Volcanoes NP, Rwanda",
  ];

  const matches = destinations
    .filter((d) => d.toLowerCase().includes(prefix))
    .slice(0, parseInt(limit as string));

  res.json({ suggestions: matches, query: q });
});

// Property recommendations
searchRouter.get("/recommendations", async (req: Request, res: Response) => {
  const { userId, limit = "10" } = req.query;
  res.json({
    recommendations: [],
    userId: userId || req.gdsUser?.sub,
    type: "personalized",
    limit: parseInt(limit as string),
  });
});

// Similar properties
searchRouter.get("/similar/:propertyId", async (req: Request, res: Response) => {
  const { propertyId } = req.params;
  const { limit = "5" } = req.query;
  res.json({ propertyId, similar: [], limit: parseInt(limit as string) });
});

// Trending destinations
searchRouter.get("/trending", async (_req: Request, res: Response) => {
  res.json({
    trending: [
      { destination: "Masai Mara, Kenya", searches: 0, trend: "up" },
      { destination: "Zanzibar, Tanzania", searches: 0, trend: "up" },
      { destination: "Cape Town, South Africa", searches: 0, trend: "stable" },
      { destination: "Victoria Falls, Zimbabwe", searches: 0, trend: "up" },
      { destination: "Marrakech, Morocco", searches: 0, trend: "stable" },
    ],
  });
});
