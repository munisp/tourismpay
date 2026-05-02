/**
 * PBAC (Policy-Based Access Control) Middleware
 *
 * Integrates with the Rust PBAC engine for fine-grained access control.
 * Falls back to role-based checks if the PBAC engine is unavailable.
 */
import type { Request, Response, NextFunction } from "express";

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
};

function resolveResource(method: string, path: string): { resource: string; action: string } {
  // Try exact match first
  const key = `${method}:${path}`;
  if (ROUTE_RESOURCE_MAP[key]) return ROUTE_RESOURCE_MAP[key];

  // Try prefix match
  for (const [pattern, mapping] of Object.entries(ROUTE_RESOURCE_MAP)) {
    const [m, p] = pattern.split(":");
    if (m === method && path.startsWith(p)) return mapping;
  }

  // Default
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
  } catch {
    // PBAC engine unavailable — fall back to role-based
  }

  return fallbackRoleCheck(user, resource, action);
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
      resource.startsWith("tourist:");
  } else if (role === "merchant") {
    allowed = resource.includes("own") ||
      resource.startsWith("products:") ||
      resource.startsWith("bookings:") ||
      resource.startsWith("revenue:") ||
      resource.startsWith("staff:");
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

// ─── Express Middleware ──────────────────────────────────────────────────────

export function pbacMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip for public routes
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
  }).catch(() => {
    next();
  });
}

export { checkPbac, resolveResource };
