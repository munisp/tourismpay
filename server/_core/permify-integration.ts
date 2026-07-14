/**
 * server/_core/permify-integration.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Full Permify ReBAC (Relationship-Based Access Control) Integration
 *
 * Provides:
 *  1. Permission check middleware for tRPC procedures
 *  2. Relationship write helpers (grant/revoke access)
 *  3. Schema synchronization (push schema to Permify on startup)
 *  4. Bulk permission checks for list endpoints
 *  5. Permission-aware query filters
 *
 * Resource types:
 *  - establishment: owner, staff, viewer
 *  - booking: owner, establishment_owner
 *  - wallet: owner
 *  - kyb_application: owner, compliance_officer, admin
 *  - bis_investigation: analyst, supervisor, admin
 *  - settlement: settlement_officer, admin
 *  - tax_collection: compliance_officer, admin
 *  - kill_switch: noc_operator, admin
 *  - noc_dashboard: noc_operator, admin
 *  - smart_contract: deployer, admin
 *  - liquidity_pool: provider, admin
 */

import { logger } from "./logger";

// ─── Config ───────────────────────────────────────────────────────────────────

interface PermifyConfig {
  host: string;
  port: number;
  tenantId: string;
  apiKey?: string;
}

function getPermifyConfig(): PermifyConfig | null {
  const host = process.env.PERMIFY_HOST;
  if (!host) return null;
  return {
    host,
    port: parseInt(process.env.PERMIFY_PORT || "3476"),
    tenantId: process.env.PERMIFY_TENANT_ID || "t1",
    apiKey: process.env.PERMIFY_API_KEY,
  };
}

export function isPermifyEnabled(): boolean {
  return !!process.env.PERMIFY_HOST;
}

// ─── HTTP Client ──────────────────────────────────────────────────────────────

async function permifyRequest<T>(
  path: string,
  method: "GET" | "POST",
  body?: unknown,
): Promise<T | null> {
  const config = getPermifyConfig();
  if (!config) return null;
  const url = `http://${config.host}:${config.port}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiKey) headers["Authorization"] = `Bearer ${config.apiKey}`;
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      const text = await res.text();
      logger.warn({ path, status: res.status, text }, "Permify request failed");
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    logger.error({ err, path }, "Permify request error");
    return null;
  }
}

// ─── Schema Definition ────────────────────────────────────────────────────────

export const PERMIFY_SCHEMA = `
entity user {}

entity establishment {
  relation owner @user
  relation staff @user
  relation viewer @user

  action view   = owner or staff or viewer
  action edit   = owner or staff
  action delete = owner
  action manage_staff = owner
  action view_revenue = owner or staff
}

entity booking {
  relation owner @user
  relation establishment_owner @user

  action view   = owner or establishment_owner
  action cancel = owner
  action manage = establishment_owner
}

entity wallet {
  relation owner @user

  action view     = owner
  action transfer = owner
  action load     = owner
}

entity kyb_application {
  relation owner @user
  relation compliance_officer @user
  relation admin @user

  action view    = owner or compliance_officer or admin
  action submit  = owner
  action approve = compliance_officer or admin
  action reject  = compliance_officer or admin
}

entity kyc_record {
  relation owner @user
  relation compliance_officer @user
  relation admin @user

  action view    = owner or compliance_officer or admin
  action submit  = owner
  action approve = compliance_officer or admin
  action reject  = compliance_officer or admin
}

entity bis_investigation {
  relation analyst @user
  relation supervisor @user
  relation admin @user

  action view    = analyst or supervisor or admin
  action edit    = analyst or supervisor
  action close   = supervisor or admin
  action escalate = analyst or supervisor or admin
}

entity settlement_batch {
  relation settlement_officer @user
  relation admin @user

  action view    = settlement_officer or admin
  action process = settlement_officer or admin
  action approve = admin
}

entity tax_collection {
  relation compliance_officer @user
  relation admin @user

  action view   = compliance_officer or admin
  action file   = compliance_officer or admin
  action audit  = admin
}

entity kill_switch {
  relation noc_operator @user
  relation admin @user

  action view     = noc_operator or admin
  action activate = noc_operator or admin
  action deactivate = admin
}

entity noc_dashboard {
  relation noc_operator @user
  relation admin @user

  action view   = noc_operator or admin
  action manage = admin
}

entity smart_contract {
  relation deployer @user
  relation admin @user

  action view   = deployer or admin
  action deploy = deployer or admin
  action pause  = admin
}

entity liquidity_pool {
  relation provider @user
  relation admin @user

  action view     = provider or admin
  action deposit  = provider or admin
  action withdraw = provider or admin
  action manage   = admin
}

entity audit_log {
  relation admin @user
  relation compliance_officer @user

  action view = admin or compliance_officer
}

entity remittance {
  relation owner @user
  relation compliance_officer @user
  relation admin @user

  action view   = owner or compliance_officer or admin
  action cancel = owner
  action review = compliance_officer or admin
}
`;

// ─── Schema Sync ──────────────────────────────────────────────────────────────

export async function syncPermifySchema(): Promise<boolean> {
  const config = getPermifyConfig();
  if (!config) return false;
  const result = await permifyRequest<{ schema_version: string }>(
    `/v1/tenants/${config.tenantId}/schemas/write`,
    "POST",
    { schema: PERMIFY_SCHEMA },
  );
  if (result) {
    logger.info(
      { schemaVersion: result.schema_version },
      "Permify schema synced",
    );
    return true;
  }
  return false;
}

// ─── Permission Check ─────────────────────────────────────────────────────────

export interface PermissionCheckParams {
  subject: { type: "user"; id: string };
  permission: string;
  entity: { type: string; id: string };
  snapToken?: string;
}

export async function checkPermission(
  params: PermissionCheckParams,
): Promise<boolean> {
  const config = getPermifyConfig();
  if (!config) return true; // Permify not configured — allow all (degrade gracefully)
  const result = await permifyRequest<{ can: "CHECK_RESULT_ALLOWED" | "CHECK_RESULT_DENIED" }>(
    `/v1/tenants/${config.tenantId}/permissions/check`,
    "POST",
    {
      metadata: { snap_token: params.snapToken, depth: 20 },
      entity: { type: params.entity.type, id: params.entity.id },
      permission: params.permission,
      subject: { type: params.subject.type, id: params.subject.id },
    },
  );
  return result?.can === "CHECK_RESULT_ALLOWED";
}

export async function checkPermissionOrThrow(
  params: PermissionCheckParams,
): Promise<void> {
  const allowed = await checkPermission(params);
  if (!allowed) {
    throw new Error(
      `Permission denied: ${params.subject.id} cannot ${params.permission} on ${params.entity.type}:${params.entity.id}`,
    );
  }
}

// ─── Bulk Permission Check ────────────────────────────────────────────────────

export async function checkPermissions(
  checks: PermissionCheckParams[],
): Promise<boolean[]> {
  if (!isPermifyEnabled()) return checks.map(() => true);
  const results = await Promise.all(checks.map(checkPermission));
  return results;
}

// ─── Relationship Management ──────────────────────────────────────────────────

export interface RelationshipTuple {
  entity: { type: string; id: string };
  relation: string;
  subject: { type: string; id: string; relation?: string };
}

export async function writeRelationship(
  tuple: RelationshipTuple,
): Promise<string | null> {
  const config = getPermifyConfig();
  if (!config) return null;
  const result = await permifyRequest<{ snap_token: string }>(
    `/v1/tenants/${config.tenantId}/relationships/write`,
    "POST",
    {
      metadata: { schema_version: "" },
      tuples: [
        {
          entity: { type: tuple.entity.type, id: tuple.entity.id },
          relation: tuple.relation,
          subject: {
            type: tuple.subject.type,
            id: tuple.subject.id,
            relation: tuple.subject.relation,
          },
        },
      ],
    },
  );
  return result?.snap_token ?? null;
}

export async function deleteRelationship(
  tuple: RelationshipTuple,
): Promise<boolean> {
  const config = getPermifyConfig();
  if (!config) return false;
  const result = await permifyRequest<{ snap_token: string }>(
    `/v1/tenants/${config.tenantId}/relationships/delete`,
    "POST",
    {
      filter: {
        entity: { type: tuple.entity.type, id: tuple.entity.id },
        relation: tuple.relation,
        subject: {
          type: tuple.subject.type,
          id: tuple.subject.id,
        },
      },
    },
  );
  return !!result;
}

// ─── Domain-Specific Helpers ──────────────────────────────────────────────────

export async function grantEstablishmentAccess(
  establishmentId: string,
  userId: string,
  role: "owner" | "staff" | "viewer",
): Promise<string | null> {
  return writeRelationship({
    entity: { type: "establishment", id: establishmentId },
    relation: role,
    subject: { type: "user", id: userId },
  });
}

export async function revokeEstablishmentAccess(
  establishmentId: string,
  userId: string,
  role: "owner" | "staff" | "viewer",
): Promise<boolean> {
  return deleteRelationship({
    entity: { type: "establishment", id: establishmentId },
    relation: role,
    subject: { type: "user", id: userId },
  });
}

export async function grantBookingAccess(
  bookingId: string,
  userId: string,
  role: "owner" | "establishment_owner",
): Promise<string | null> {
  return writeRelationship({
    entity: { type: "booking", id: bookingId },
    relation: role,
    subject: { type: "user", id: userId },
  });
}

export async function grantKybAccess(
  kybApplicationId: string,
  userId: string,
  role: "owner" | "compliance_officer" | "admin",
): Promise<string | null> {
  return writeRelationship({
    entity: { type: "kyb_application", id: kybApplicationId },
    relation: role,
    subject: { type: "user", id: userId },
  });
}

export async function grantBisInvestigationAccess(
  investigationId: string,
  userId: string,
  role: "analyst" | "supervisor" | "admin",
): Promise<string | null> {
  return writeRelationship({
    entity: { type: "bis_investigation", id: investigationId },
    relation: role,
    subject: { type: "user", id: userId },
  });
}

// ─── tRPC Permission Guard ────────────────────────────────────────────────────

/**
 * Creates a permission guard for use in tRPC middleware.
 * Usage:
 *   const canViewEstablishment = permifyGuard("establishment", "view");
 *   const procedure = protectedProcedure.use(canViewEstablishment);
 */
export function permifyGuard(
  entityType: string,
  permission: string,
  getEntityId: (input: any) => string,
) {
  return async (opts: {
    ctx: { userId?: number | string };
    input: unknown;
    next: () => Promise<unknown>;
  }) => {
    const userId = String(opts.ctx.userId ?? "");
    const entityId = getEntityId(opts.input);
    if (userId && entityId) {
      await checkPermissionOrThrow({
        subject: { type: "user", id: userId },
        permission,
        entity: { type: entityType, id: entityId },
      });
    }
    return opts.next();
  };
}

// ─── Health Check ─────────────────────────────────────────────────────────────

export async function checkPermifyHealth(): Promise<{
  healthy: boolean;
  tenantId?: string;
}> {
  const config = getPermifyConfig();
  if (!config) return { healthy: false };
  const result = await permifyRequest<{ tenant_id: string }>(
    `/v1/tenants/${config.tenantId}`,
    "GET",
  );
  return {
    healthy: !!result,
    tenantId: result?.tenant_id,
  };
}
