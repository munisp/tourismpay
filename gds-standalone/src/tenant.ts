/**
 * Multi-Tenant Middleware
 * Enables multiple organizations to share a single GDS deployment.
 * Each tenant has isolated data (properties, agents, reservations).
 */
import { Request, Response, NextFunction } from "express";
import { config } from "./config";

export interface TenantContext {
  tenantId: string;
  tenantName: string;
  plan: "free" | "starter" | "professional" | "enterprise";
  limits: {
    maxProperties: number;
    maxAgents: number;
    maxBookingsPerMonth: number;
    apiRateLimit: number;
  };
}

// Tenant registry (in production: database table)
const tenants = new Map<string, TenantContext>([
  ["default", {
    tenantId: "default",
    tenantName: "Default Tenant",
    plan: "enterprise",
    limits: { maxProperties: 10000, maxAgents: 1000, maxBookingsPerMonth: 100000, apiRateLimit: 1000 },
  }],
]);

export function tenantMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!config.MULTI_TENANT) {
    // Single-tenant mode: skip tenant resolution
    (req as any).tenant = tenants.get("default");
    return next();
  }

  // Resolve tenant from: user context > header > subdomain
  const tenantId = req.gdsUser?.tenantId
    || (req.headers["x-gds-tenant-id"] as string)
    || config.DEFAULT_TENANT;

  const tenant = tenants.get(tenantId);
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found", tenantId });
    return;
  }

  (req as any).tenant = tenant;
  next();
}

export function registerTenant(ctx: TenantContext): void {
  tenants.set(ctx.tenantId, ctx);
}

export function getTenant(tenantId: string): TenantContext | undefined {
  return tenants.get(tenantId);
}
