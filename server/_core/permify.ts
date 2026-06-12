/**
 * Permify Authorization Client
 *
 * Relationship-based access control (ReBAC) via Permify gRPC/REST API.
 * Replaces simple role-string RBAC with fine-grained relationship checks:
 *  - User → Establishment ownership
 *  - User → Document access
 *  - Role → Permission mapping
 *  - Merchant → Settlement window access
 *
 * Falls back to role-based checks when Permify is unavailable.
 */
import { logger } from "./logger";

// ─── Configuration ───────────────────────────────────────────────────────────

interface PermifyConfig {
  endpoint: string;
  tenantId: string;
  apiKey?: string;
}

function getPermifyConfig(): PermifyConfig | null {
  const endpoint = process.env.PERMIFY_ENDPOINT;
  if (!endpoint) return null;
  return {
    endpoint: endpoint.replace(/\/+$/, ""),
    tenantId: process.env.PERMIFY_TENANT_ID || "tourismpay",
    apiKey: process.env.PERMIFY_API_KEY,
  };
}

// ─── HTTP Client ─────────────────────────────────────────────────────────────

async function permifyRequest(path: string, body: unknown): Promise<Record<string, unknown> | null> {
  const config = getPermifyConfig();
  if (!config) return null;
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (config.apiKey) headers["Authorization"] = `Bearer ${config.apiKey}`;
    const res = await fetch(`${config.endpoint}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(Object.assign({ tenant_id: config.tenantId }, body as Record<string, unknown>)),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      logger.warn(`[Permify] Request to ${path} failed: ${res.status}`);
      return null;
    }
    return (await res.json()) as Record<string, unknown>;
  } catch (err) {
    logger.warn(`[Permify] Request to ${path} error: ${(err as Error).message}`);
    return null;
  }
}

// ─── Permission Check ────────────────────────────────────────────────────────

export interface PermissionCheckInput {
  entity: { type: string; id: string };
  permission: string;
  subject: { type: string; id: string; relation?: string };
}

export async function checkPermission(input: PermissionCheckInput): Promise<boolean> {
  const result = await permifyRequest("/v1/tenants/{tenant_id}/permissions/check".replace("{tenant_id}", getPermifyConfig()?.tenantId || "tourismpay"), {
    metadata: { depth: 5 },
    entity: input.entity,
    permission: input.permission,
    subject: input.subject,
  });
  if (!result) return true; // Fallback: allow (use role-based check upstream)
  return (result as any).can === "CHECK_RESULT_ALLOWED";
}

// ─── Relationship Management ─────────────────────────────────────────────────

export interface Relationship {
  entity: { type: string; id: string };
  relation: string;
  subject: { type: string; id: string; relation?: string };
}

export async function writeRelationship(relationship: Relationship): Promise<boolean> {
  const config = getPermifyConfig();
  if (!config) return false;
  const result = await permifyRequest(`/v1/tenants/${config.tenantId}/relationships/write`, {
    metadata: {},
    tuples: [{
      entity: relationship.entity,
      relation: relationship.relation,
      subject: relationship.subject,
    }],
  });
  return result !== null;
}

export async function deleteRelationship(relationship: Relationship): Promise<boolean> {
  const config = getPermifyConfig();
  if (!config) return false;
  const result = await permifyRequest(`/v1/tenants/${config.tenantId}/relationships/delete`, {
    tuples: [{
      entity: relationship.entity,
      relation: relationship.relation,
      subject: relationship.subject,
    }],
  });
  return result !== null;
}

// ─── Lookup ──────────────────────────────────────────────────────────────────

export async function lookupEntities(
  entityType: string,
  permission: string,
  subject: { type: string; id: string },
): Promise<string[]> {
  const config = getPermifyConfig();
  if (!config) return [];
  const result = await permifyRequest(`/v1/tenants/${config.tenantId}/permissions/lookup-entity`, {
    metadata: { depth: 5 },
    entity_type: entityType,
    permission,
    subject,
  });
  if (!result) return [];
  return ((result as any).entity_ids || []) as string[];
}

export async function lookupSubjects(
  entity: { type: string; id: string },
  permission: string,
  subjectType: string,
): Promise<string[]> {
  const config = getPermifyConfig();
  if (!config) return [];
  const result = await permifyRequest(`/v1/tenants/${config.tenantId}/permissions/lookup-subject`, {
    metadata: { depth: 5 },
    entity,
    permission,
    subject_reference: { type: subjectType },
  });
  if (!result) return [];
  return ((result as any).subject_ids || []) as string[];
}

// ─── Schema (TourismPay Entity Model) ────────────────────────────────────────

export const TOURISMPAY_SCHEMA = `
entity user {}

entity establishment {
  relation owner @user
  relation staff @user
  relation viewer @user

  permission edit = owner
  permission view = owner or staff or viewer
  permission manage_products = owner or staff
  permission view_analytics = owner
  permission manage_kyb = owner
}

entity document {
  relation owner @user
  relation establishment @establishment

  permission view = owner or establishment.owner or establishment.staff
  permission delete = owner or establishment.owner
}

entity settlement_window {
  relation corridor_admin @user

  permission view = corridor_admin
  permission close = corridor_admin
}

entity wallet {
  relation owner @user

  permission view = owner
  permission transact = owner
}

entity fraud_alert {
  relation investigator @user
  relation escalated_to @user

  permission investigate = investigator or escalated_to
  permission resolve = investigator
}
`;

export async function writeSchema(): Promise<boolean> {
  const config = getPermifyConfig();
  if (!config) return false;
  const result = await permifyRequest(`/v1/tenants/${config.tenantId}/schemas/write`, {
    schema: TOURISMPAY_SCHEMA,
  });
  return result !== null;
}

// ─── Convenience Helpers ─────────────────────────────────────────────────────

export async function grantEstablishmentOwnership(userId: string, establishmentId: string): Promise<boolean> {
  return writeRelationship({
    entity: { type: "establishment", id: establishmentId },
    relation: "owner",
    subject: { type: "user", id: userId },
  });
}

export async function canEditEstablishment(userId: string, establishmentId: string): Promise<boolean> {
  return checkPermission({
    entity: { type: "establishment", id: establishmentId },
    permission: "edit",
    subject: { type: "user", id: userId },
  });
}

export async function canViewEstablishment(userId: string, establishmentId: string): Promise<boolean> {
  return checkPermission({
    entity: { type: "establishment", id: establishmentId },
    permission: "view",
    subject: { type: "user", id: userId },
  });
}

export function isPermifyEnabled(): boolean {
  return !!process.env.PERMIFY_ENDPOINT;
}
