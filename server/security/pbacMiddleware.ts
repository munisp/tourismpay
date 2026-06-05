/**
 * PBAC (Policy-Based Access Control) Middleware
 *
 * Integrates with the Rust PBAC engine for fine-grained access control.
 * Falls back to role-based checks if the PBAC engine is unavailable.
 *
 * Implemented as a tRPC middleware (not Express middleware) so that
 * it runs AFTER authentication and has access to ctx.user.
 */
import { TRPCError } from "@trpc/server";
import { withCircuitBreaker } from "../middleware/circuitBreaker";

const PBAC_ENGINE_URL = process.env.PBAC_ENGINE_URL || "http://localhost:8090";

interface PbacDecision {
  allowed: boolean;
  reason: string;
  matched_policy: string | null;
  evaluated_policies: number;
  evaluation_time_us: number;
  audit_id: string;
}

interface PbacUser {
  id: number | string;
  role: string;
  email?: string;
}

// ─── Resource Mapping ────────────────────────────────────────────────────────

const ROUTE_RESOURCE_MAP: Record<string, { resource: string; action: string }> = {
  // Admin routes
  "GET:/api/admin": { resource: "admin:dashboard", action: "read" },
  "POST:/api/admin": { resource: "admin:settings", action: "update" },
  "GET:/api/users-admin": { resource: "admin:users", action: "read" },
  "POST:/api/users-admin": { resource: "admin:users", action: "update" },
  "DELETE:/api/users-admin": { resource: "admin:users", action: "delete" },

  // KYB
  "GET:/api/kyb": { resource: "kyb:applications", action: "read" },
  "POST:/api/kyb": { resource: "kyb:applications", action: "create" },
  "PUT:/api/kyb": { resource: "kyb:applications", action: "update" },

  // Wallet
  "GET:/api/wallet": { resource: "wallet:own", action: "read" },
  "POST:/api/wallet/topup": { resource: "wallet:topup", action: "create" },
  "POST:/api/wallet/transfer": { resource: "wallet:transfer", action: "create" },

  // Payments
  "POST:/api/payment": { resource: "payment:create", action: "create" },
  "POST:/api/qr-payment": { resource: "payment:qr", action: "create" },

  // BIS
  "GET:/api/bis": { resource: "bis:inspections", action: "read" },
  "POST:/api/bis": { resource: "bis:process", action: "execute" },

  // Settlement
  "GET:/api/settlement": { resource: "settlement:cycles", action: "read" },
  "POST:/api/settlement": { resource: "settlement:execute", action: "execute" },

  // Merchant
  "GET:/api/merchant-products": { resource: "products:own", action: "read" },
  "POST:/api/merchant-products": { resource: "products:own", action: "create" },
  "GET:/api/merchant-bookings": { resource: "bookings:own", action: "read" },
  "GET:/api/merchant-revenue": { resource: "revenue:own", action: "read" },

  // NOC
  "GET:/api/noc-dashboard": { resource: "noc:dashboard", action: "read" },
  "POST:/api/kill-switch": { resource: "kill_switch:toggle", action: "update" },

  // Remittance
  "POST:/api/remittance": { resource: "remittance:transfer", action: "create" },
  "GET:/api/remittance": { resource: "remittance:history", action: "read" },

  // tRPC - Wallet (accessible by tourist and merchant)
  "GET:/api/trpc/wallet.": { resource: "wallet:own", action: "read" },
  "POST:/api/trpc/wallet.": { resource: "wallet:own", action: "write" },
  // tRPC - Loyalty (accessible by tourist and merchant)
  "GET:/api/trpc/loyalty.": { resource: "wallet:own", action: "read" },
  "POST:/api/trpc/loyalty.": { resource: "wallet:own", action: "write" },
  // tRPC - Notifications (accessible by all authenticated)
  "GET:/api/trpc/notifications.": { resource: "tourist:notifications", action: "read" },
  "POST:/api/trpc/notifications.": { resource: "tourist:notifications", action: "write" },
  "GET:/api/trpc/notifPrefs.": { resource: "tourist:notifications", action: "read" },
  "POST:/api/trpc/notifPrefs.": { resource: "tourist:notifications", action: "write" },
  // tRPC - Sustainability
  "GET:/api/trpc/sustainability.": { resource: "tourist:sustainability", action: "read" },
  // tRPC - Embedded Finance
  "GET:/api/trpc/embeddedFinance.": { resource: "wallet:own", action: "read" },
  "POST:/api/trpc/embeddedFinance.": { resource: "wallet:own", action: "write" },
  // tRPC - Tourist Portal
  "GET:/api/trpc/touristPortal.": { resource: "tourist:portal", action: "read" },
  "POST:/api/trpc/touristPortal.": { resource: "tourist:portal", action: "write" },
  // tRPC - Itinerary
  "GET:/api/trpc/itinerary.": { resource: "tourist:itinerary", action: "read" },
  "POST:/api/trpc/itinerary.": { resource: "tourist:itinerary", action: "write" },
  // tRPC - Trip Summary
  "GET:/api/trpc/tripSummary.": { resource: "tourist:itinerary", action: "read" },
  // tRPC - Tourist Onboarding
  "GET:/api/trpc/touristOnboarding.": { resource: "tourist:onboarding", action: "read" },
  "POST:/api/trpc/touristOnboarding.": { resource: "tourist:onboarding", action: "write" },
  // tRPC - Biometric
  "GET:/api/trpc/biometric.": { resource: "tourist:biometric", action: "read" },
  "POST:/api/trpc/biometric.": { resource: "tourist:biometric", action: "write" },
  // tRPC - QR Payment
  "GET:/api/trpc/qrPayment.": { resource: "payment:qr", action: "read" },
  "POST:/api/trpc/qrPayment.": { resource: "payment:qr", action: "write" },
  // tRPC - Exchange Rates (read by all)
  "GET:/api/trpc/exchangeRates.": { resource: "wallet:own", action: "read" },
  // tRPC - Merchant routes
  "GET:/api/trpc/merchantRevenue.": { resource: "revenue:own", action: "read" },
  "GET:/api/trpc/merchantProducts.": { resource: "products:own", action: "read" },
  "POST:/api/trpc/merchantProducts.": { resource: "products:own", action: "write" },
  "GET:/api/trpc/merchantBookings.": { resource: "bookings:own", action: "read" },
  "POST:/api/trpc/merchantBookings.": { resource: "bookings:own", action: "write" },
  "GET:/api/trpc/staffInvites.": { resource: "staff:own", action: "read" },
  "POST:/api/trpc/staffInvites.": { resource: "staff:own", action: "write" },
  // tRPC - Search (accessible by all)
  "GET:/api/trpc/search.": { resource: "tourist:search", action: "read" },

  // tRPC - Tourist services
  "POST:/api/trpc/copilot.chat": { resource: "tourist:copilot", action: "write" },
  "GET:/api/trpc/copilot.chat": { resource: "tourist:copilot", action: "read" },
  "GET:/api/trpc/arTourism.list": { resource: "tourist:ar", action: "read" },
  "GET:/api/trpc/arTourism.nearby": { resource: "tourist:ar", action: "read" },
  "GET:/api/trpc/identity.getDid": { resource: "tourist:identity", action: "read" },
  "GET:/api/trpc/identity.stats": { resource: "tourist:identity", action: "read" },
  "POST:/api/trpc/identity.createDid": { resource: "tourist:identity", action: "write" },
  "GET:/api/trpc/identity.resolve": { resource: "tourist:identity", action: "read" },
  "GET:/api/trpc/identity.listCredentials": { resource: "tourist:identity", action: "read" },
  "POST:/api/trpc/identity.issueCredential": { resource: "tourist:identity", action: "write" },
  "POST:/api/trpc/identity.revokeCredential": { resource: "tourist:identity", action: "write" },
  "POST:/api/trpc/identity.verifyPresentation": { resource: "tourist:identity", action: "write" },
  "GET:/api/trpc/mapLocation.config": { resource: "tourist:map", action: "read" },
  "GET:/api/trpc/mapLocation.geocode": { resource: "tourist:map", action: "read" },
  "GET:/api/trpc/mapLocation.reverseGeocode": { resource: "tourist:map", action: "read" },
  "GET:/api/trpc/mapLocation.directions": { resource: "tourist:map", action: "read" },
  "GET:/api/trpc/paymentRails.providers": { resource: "payment:providers", action: "read" },
  "POST:/api/trpc/paymentRails.initiate": { resource: "payment:create", action: "create" },
  "GET:/api/trpc/paymentRails.verify": { resource: "payment:verify", action: "read" },

  // tRPC - Middleware health (accessible by all authenticated users)
  "GET:/api/trpc/middlewareHub.healthCheck": { resource: "service_health:read", action: "read" },
  "GET:/api/trpc/middlewareHub.serviceMesh": { resource: "service_health:read", action: "read" },
};

function resolveResource(method: string, path: string): { resource: string; action: string } {
  const key = `${method}:${path}`;
  if (ROUTE_RESOURCE_MAP[key]) return ROUTE_RESOURCE_MAP[key];

  for (const [pattern, mapping] of Object.entries(ROUTE_RESOURCE_MAP)) {
    const [m, p] = pattern.split(":");
    if (m === method && path.startsWith(p)) return mapping;
  }

  return { resource: `api:${path}`, action: method.toLowerCase() === "get" ? "read" : "write" };
}

// ─── PBAC Check ──────────────────────────────────────────────────────────────

async function checkPbac(
  user: PbacUser,
  resource: string,
  action: string,
  context?: Record<string, unknown>
): Promise<PbacDecision> {
  try {
    return await withCircuitBreaker("pbac-engine", async () => {
      const response = await fetch(`${PBAC_ENGINE_URL}/api/v1/access/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: {
            id: String(user.id),
            roles: [user.role],
            attributes: { email: user.email },
          },
          resource,
          action,
          context: context || {},
        }),
        signal: AbortSignal.timeout(2000),
      });

      if (response.ok) {
        return await response.json() as PbacDecision;
      }
      throw new Error(`PBAC engine returned ${response.status}`);
    });
  } catch {
    return fallbackRoleCheck(user, resource, action);
  }
}

function fallbackRoleCheck(
  user: PbacUser,
  resource: string,
  _action: string
): PbacDecision {
  const role = user.role;
  let allowed = false;

  if (role === "admin") {
    allowed = true;
  } else if (role === "tourist") {
    allowed = resource.startsWith("wallet:") ||
      resource.startsWith("payment:") ||
      resource.startsWith("booking:") ||
      resource.includes("own") ||
      resource.startsWith("tourist:") ||
      resource.startsWith("service_health:");
  } else if (role === "merchant") {
    allowed = resource.includes("own") ||
      resource.startsWith("products:") ||
      resource.startsWith("bookings:") ||
      resource.startsWith("revenue:") ||
      resource.startsWith("staff:") ||
      resource.startsWith("wallet:") ||
      resource.startsWith("payment:");
  } else if (role === "compliance_officer") {
    allowed = resource.startsWith("kyb:") ||
      resource.startsWith("bis:") ||
      resource.startsWith("fraud:") ||
      resource.startsWith("audit");
  } else if (role === "settlement_officer") {
    allowed = resource.startsWith("settlement:") ||
      resource.startsWith("ledger:") ||
      resource.startsWith("payout:");
  } else if (role === "noc_operator") {
    allowed = resource.startsWith("noc:") ||
      resource.startsWith("service_health:") ||
      resource.startsWith("kill_switch:");
  }

  return {
    allowed,
    reason: allowed ? "Fallback role check: allowed" : "Fallback role check: denied",
    matched_policy: null,
    evaluated_policies: 0,
    evaluation_time_us: 0,
    audit_id: `fallback-${Date.now()}`,
  };
}

// ─── tRPC Middleware Factory ─────────────────────────────────────────────────

/**
 * Creates a tRPC middleware that enforces PBAC.
 * This runs AFTER auth, so ctx.user is available.
 */
export function createPbacMiddleware(t: any) {
  return t.middleware(async (opts: any) => {
    const { ctx, next, path } = opts;
    const user = ctx.user;

    if (!user) {
      return next();
    }

    // Determine the HTTP method from the tRPC procedure type
    const method = opts.type === "mutation" ? "POST" : "GET";
    const apiPath = `/api/trpc/${path}`;
    const { resource, action } = resolveResource(method, apiPath);

    const decision = await checkPbac(user, resource, action, {
      ip: ctx.req?.ip,
      user_agent: ctx.req?.headers?.["user-agent"],
      timestamp: Date.now(),
    });

    if (!decision.allowed) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Access denied: ${decision.reason}`,
      });
    }

    // Attach audit ID for downstream logging
    return next({
      ctx: {
        ...ctx,
        pbacAuditId: decision.audit_id,
      },
    });
  });
}

// ─── Legacy Express Middleware (kept for non-tRPC routes) ─────────────────────

import type { Request, Response, NextFunction } from "express";

export function pbacMiddleware(req: Request, res: Response, next: NextFunction): void {
  const publicPaths = ["/health", "/api/demo-login", "/api/auth/login", "/api/system"];
  if (publicPaths.some((p) => req.path.startsWith(p))) {
    next();
    return;
  }

  const user = (req as any).user;
  if (!user) {
    next();
    return;
  }

  const { resource, action } = resolveResource(req.method, req.path);

  checkPbac(user, resource, action, {
    ip: req.ip,
    user_agent: req.headers["user-agent"],
    timestamp: Date.now(),
  }).then((decision) => {
    if (decision.allowed) {
      (req as any).pbacAuditId = decision.audit_id;
      next();
    } else {
      res.status(403).json({
        error: "Access denied",
        reason: decision.reason,
        auditId: decision.audit_id,
        code: "PBAC_DENIED",
      });
    }
  }).catch((err) => {
    const { logger } = require("../_core/logger");
    logger.warn("PBAC middleware error, allowing request (fail-open)", {
      error: err instanceof Error ? err.message : String(err),
    });
    next();
  });
}

export { checkPbac, resolveResource };
