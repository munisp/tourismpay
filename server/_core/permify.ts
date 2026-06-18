/**
 * Permify ReBAC (Relationship-Based Access Control)
 *
 * Provides fine-grained authorization beyond role-based access.
 * Relationships: user -> role -> resource -> action
 *
 * When PERMIFY_URL is not set, falls back to role-based checks
 * using the existing user.role field from the session.
 *
 * Permissions model:
 *  - tourist: can view own wallet, transactions, bookings
 *  - merchant: can manage own establishment, view transactions, run KYB
 *  - bis_analyst: can view/manage investigations, run risk scoring
 *  - noc_operator: can view system health, manage kill switches
 *  - admin: full access to all resources
 */
import { logger } from "./logger";
import { TRPCError } from "@trpc/server";

// ─── Configuration ───────────────────────────────────────────────────────────

interface PermifyConfig {
  url: string;
  tenantId: string;
}

function getConfig(): PermifyConfig | null {
  const url = process.env.PERMIFY_URL;
  if (!url) return null;
  return {
    url: url.replace(/\/+$/, ""),
    tenantId: process.env.PERMIFY_TENANT_ID || "tourismpay",
  };
}

// ─── Permission Definitions ──────────────────────────────────────────────────

export const RESOURCES = {
  WALLET: "wallet",
  ESTABLISHMENT: "establishment",
  INVESTIGATION: "investigation",
  SETTLEMENT: "settlement",
  SYSTEM: "system",
  REPORT: "report",
  PAYMENT: "payment",
  IDENTITY: "identity",
  LOYALTY: "loyalty",
} as const;

export const ACTIONS = {
  VIEW: "view",
  CREATE: "create",
  EDIT: "edit",
  DELETE: "delete",
  APPROVE: "approve",
  EXECUTE: "execute",
} as const;

// Role-based permission matrix (fallback when Permify is not configured)
const ROLE_PERMISSIONS: Record<string, Set<string>> = {
  admin: new Set([
    "wallet:view", "wallet:create", "wallet:edit", "wallet:delete",
    "establishment:view", "establishment:create", "establishment:edit", "establishment:delete", "establishment:approve",
    "investigation:view", "investigation:create", "investigation:edit", "investigation:approve",
    "settlement:view", "settlement:execute",
    "system:view", "system:edit",
    "report:view", "report:create",
    "payment:view", "payment:create", "payment:edit", "payment:approve",
    "identity:view", "identity:create", "identity:edit", "identity:approve",
    "loyalty:view", "loyalty:create", "loyalty:edit", "loyalty:delete",
  ]),
  merchant: new Set([
    "wallet:view",
    "establishment:view", "establishment:edit",
    "settlement:view",
    "report:view",
    "payment:view", "payment:create",
    "loyalty:view",
  ]),
  tourist: new Set([
    "wallet:view", "wallet:create",
    "establishment:view",
    "report:view",
    "payment:view", "payment:create",
    "identity:view", "identity:create",
    "loyalty:view", "loyalty:create",
  ]),
  bis_analyst: new Set([
    "investigation:view", "investigation:create", "investigation:edit", "investigation:approve",
    "establishment:view",
    "report:view", "report:create",
  ]),
  noc_operator: new Set([
    "system:view", "system:edit",
    "wallet:view",
    "settlement:view",
    "report:view",
  ]),
};

// ─── Permission Check ────────────────────────────────────────────────────────

export async function checkPermission(
  userId: string,
  userRole: string,
  resource: string,
  action: string,
  resourceId?: string,
): Promise<boolean> {
  const config = getConfig();

  // If Permify is configured, use it
  if (config) {
    try {
      const res = await fetch(`${config.url}/v1/tenants/${config.tenantId}/permissions/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metadata: { depth: 5 },
          entity: { type: resource, id: resourceId || "*" },
          permission: action,
          subject: { type: "user", id: userId },
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const body = await res.json() as { can: string };
        return body.can === "CHECK_RESULT_ALLOWED";
      }
    } catch (err) {
      logger.warn(`[Permify] Check failed, falling back to role-based: ${(err as Error).message}`);
    }
  }

  // Fallback: role-based permission check
  const permissions = ROLE_PERMISSIONS[userRole] || ROLE_PERMISSIONS.tourist;
  return permissions.has(`${resource}:${action}`);
}

/**
 * Require a specific permission — throws TRPCError if denied.
 */
export async function requirePermission(
  userId: string,
  userRole: string,
  resource: string,
  action: string,
  resourceId?: string,
): Promise<void> {
  const allowed = await checkPermission(userId, userRole, resource, action, resourceId);
  if (!allowed) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Access denied: ${action} on ${resource} requires ${userRole === "tourist" ? "merchant or admin" : "admin"} role`,
    });
  }
}

// ─── Write Relationships (for Permify) ───────────────────────────────────────

export async function writeRelationship(
  subject: { type: string; id: string },
  relation: string,
  resource: { type: string; id: string },
): Promise<boolean> {
  const config = getConfig();
  if (!config) return true; // No-op without Permify

  try {
    const res = await fetch(`${config.url}/v1/tenants/${config.tenantId}/relationships/write`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        metadata: {},
        tuples: [{
          entity: resource,
          relation,
          subject,
        }],
      }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch (err) {
    logger.warn(`[Permify] Write relationship failed: ${(err as Error).message}`);
    return false;
  }
}

export function isPermifyEnabled(): boolean {
  return !!process.env.PERMIFY_URL;
}
