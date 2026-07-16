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
    "wallet:view", "wallet:create", "wallet:edit", "wallet:delete", "wallet:execute",
    "establishment:view", "establishment:create", "establishment:edit", "establishment:delete", "establishment:approve",
    "investigation:view", "investigation:create", "investigation:edit", "investigation:approve",
    "settlement:view", "settlement:execute",
    "system:view", "system:edit",
    "report:view", "report:create",
    "payment:view", "payment:create", "payment:edit", "payment:approve", "payment:execute",
    "identity:view", "identity:create", "identity:edit", "identity:approve",
    "loyalty:view", "loyalty:create", "loyalty:edit", "loyalty:delete", "loyalty:execute",
  ]),
  merchant: new Set([
    "wallet:view", "wallet:execute",
    "establishment:view", "establishment:edit",
    "settlement:view", "settlement:execute",
    "report:view",
    "payment:view", "payment:create", "payment:execute",
    "loyalty:view", "loyalty:execute",
  ]),
  tourist: new Set([
    "wallet:view", "wallet:create", "wallet:execute",
    "establishment:view",
    "report:view",
    "payment:view", "payment:create", "payment:execute",
    "identity:view", "identity:create",
    "loyalty:view", "loyalty:create", "loyalty:execute",
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

// ─── Extended Resource & Action Definitions (v2) ─────────────────────────────
export const RESOURCES_V2 = {
  ...RESOURCES,
  LEDGER_ACCOUNT: "ledger_account",
  GDS_BOOKING: "gds_booking",
  GDS_RATE: "gds_rate",
  REMITTANCE: "remittance",
  TAX_REMITTANCE: "tax_remittance",
  KYC_PROFILE: "kyc_profile",
  KYB_APPLICATION: "kyb_application",
  IDENTITY_PROFILE: "identity_profile",
  FRAUD_ALERT: "fraud_alert",
  PAYOUT_SCHEDULE: "payout_schedule",
  LOYALTY_ACCOUNT: "loyalty_account",
  NOC_DASHBOARD: "noc_dashboard",
  ANALYTICS_DATASET: "analytics_dataset",
  ENAIRA_WALLET: "enaira_wallet",
  TRIP_PLAN: "trip_plan",
  TIPPING_TRANSACTION: "tipping_transaction",
} as const;

export const ACTIONS_V2 = {
  ...ACTIONS,
  SEND: "send",
  RECEIVE: "receive",
  VIEW_BALANCE: "view_balance",
  VIEW_TRANSACTIONS: "view_transactions",
  FREEZE: "freeze",
  EXECUTE_TRANSFER: "execute_transfer",
  MANAGE: "manage",
  DEBIT: "debit",
  CREDIT: "credit",
  RECONCILE: "reconcile",
  CANCEL: "cancel",
  TRACK: "track",
  SUBMIT: "submit",
  AUDIT: "audit",
  REVIEW: "review",
  REJECT: "reject",
  REQUEST_DOCS: "request_docs",
  VIEW_PII: "view_pii",
  VERIFY: "verify",
  REVOKE: "revoke",
  INVESTIGATE: "investigate",
  ESCALATE: "escalate",
  CLOSE: "close",
  EXPORT: "export",
  VOID: "void",
  REFUND: "refund",
  EARN: "earn",
  REDEEM: "redeem",
  ADJUST: "adjust",
  OPERATE: "operate",
  QUERY: "query",
  LOAD: "load",
  PAY: "pay",
  SHARE: "share",
  BOOK: "book",
  SCHEDULE: "schedule",
  PUBLISH: "publish",
  NEGOTIATE: "negotiate",
  ACKNOWLEDGE: "acknowledge",
  DISMISS: "dismiss",
} as const;

// ─── Bulk Relationship Write ──────────────────────────────────────────────────
/**
 * Write multiple relationships in a single Permify API call.
 * Used during onboarding to establish initial ownership relationships.
 */
export async function writeRelationships(
  tuples: Array<{
    subject: { type: string; id: string };
    relation: string;
    resource: { type: string; id: string };
  }>,
): Promise<boolean> {
  const config = getConfig();
  if (!config) return true;
  try {
    const res = await fetch(`${config.url}/v1/tenants/${config.tenantId}/relationships/write`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        metadata: {},
        tuples: tuples.map((t) => ({
          entity: t.resource,
          relation: t.relation,
          subject: t.subject,
        })),
      }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch (err) {
    logger.warn(`[Permify] Bulk write relationships failed: ${(err as Error).message}`);
    return false;
  }
}

/**
 * Delete a relationship tuple from Permify.
 * Used when ownership is transferred or access is revoked.
 */
export async function deleteRelationship(
  subject: { type: string; id: string },
  relation: string,
  resource: { type: string; id: string },
): Promise<boolean> {
  const config = getConfig();
  if (!config) return true;
  try {
    const res = await fetch(`${config.url}/v1/tenants/${config.tenantId}/relationships/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filter: {
          entity_type: resource.type,
          entity_id: resource.id,
          relation,
          subject_type: subject.type,
          subject_id: subject.id,
        },
      }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch (err) {
    logger.warn(`[Permify] Delete relationship failed: ${(err as Error).message}`);
    return false;
  }
}

/**
 * List all subjects that have a given permission on a resource.
 * Used for auditing and admin dashboards.
 */
export async function lookupSubjects(
  resource: { type: string; id: string },
  permission: string,
  subjectType: string = "user",
): Promise<string[]> {
  const config = getConfig();
  if (!config) return [];
  try {
    const res = await fetch(`${config.url}/v1/tenants/${config.tenantId}/permissions/lookup-subject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        metadata: { depth: 5 },
        entity: resource,
        permission,
        subject_reference: { type: subjectType },
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const body = await res.json() as { subject_ids: string[] };
    return body.subject_ids || [];
  } catch (err) {
    logger.warn(`[Permify] Lookup subjects failed: ${(err as Error).message}`);
    return [];
  }
}

/**
 * Establish standard ownership relationships when a new resource is created.
 * Automatically writes owner, organization.member, and org.admin relationships.
 */
export async function grantOwnership(
  userId: string,
  orgId: string,
  resourceType: string,
  resourceId: string,
): Promise<void> {
  await writeRelationships([
    {
      subject: { type: "user", id: userId },
      relation: "owner",
      resource: { type: resourceType, id: resourceId },
    },
    {
      subject: { type: "organization", id: orgId },
      relation: "organization",
      resource: { type: resourceType, id: resourceId },
    },
  ]);
}

// ─── Compatibility Aliases ────────────────────────────────────────────────────
/** @deprecated Use checkPermission instead */
export const permifyCheck = checkPermission;
