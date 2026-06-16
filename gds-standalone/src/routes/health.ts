import { Router } from "express";
import { config } from "../config";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.json({
    status: "healthy",
    service: config.BRAND_NAME,
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    tenant_mode: config.MULTI_TENANT ? "multi" : "single",
    services: {
      gds_engine: config.GDS_ENGINE_URL,
      search: config.GDS_SEARCH_URL,
      analytics: config.GDS_ANALYTICS_URL,
    },
  });
});
