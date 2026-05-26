/**
 * Keycloak Client — real connection to Keycloak for identity & access management.
 *
 * Manages: user creation, role assignment, token validation,
 * realm configuration, and social login federation.
 */
import { logger } from "../_core/logger";

// ─── Configuration ───────────────────────────────────────────────────────────

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || "http://localhost:8080";
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || "tourismpay";
const KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID || "tourismpay-app";
const KEYCLOAK_CLIENT_SECRET = process.env.KEYCLOAK_CLIENT_SECRET || "";
const KEYCLOAK_ADMIN_USER = process.env.KEYCLOAK_ADMIN_USER || "admin";
const KEYCLOAK_ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD || "admin";
const KEYCLOAK_ADMIN_URL = process.env.KEYCLOAK_ADMIN_SERVICE_URL || "http://localhost:8102";

// ─── Token Management ────────────────────────────────────────────────────────

let adminToken: { token: string; expiresAt: number } | null = null;

async function getAdminToken(): Promise<string | null> {
  if (adminToken && adminToken.expiresAt > Date.now()) return adminToken.token;

  try {
    const params = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: KEYCLOAK_CLIENT_ID,
      client_secret: KEYCLOAK_CLIENT_SECRET,
    });

    // Try client credentials first
    let res = await fetch(`${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      // Fall back to master realm admin credentials
      const adminParams = new URLSearchParams({
        grant_type: "password",
        client_id: "admin-cli",
        username: KEYCLOAK_ADMIN_USER,
        password: KEYCLOAK_ADMIN_PASSWORD,
      });
      res = await fetch(`${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: adminParams.toString(),
        signal: AbortSignal.timeout(5000),
      });
    }

    if (!res.ok) return null;

    const data = await res.json() as { access_token: string; expires_in: number };
    adminToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 - 30000 };
    return adminToken.token;
  } catch (err) {
    logger.warn("[Keycloak] Failed to get admin token", { error: (err as Error).message });
    return null;
  }
}

// ─── Connection Check ────────────────────────────────────────────────────────

let keycloakAvailable: boolean | null = null;

export async function checkKeycloak(): Promise<boolean> {
  if (keycloakAvailable !== null) return keycloakAvailable;
  try {
    const res = await fetch(`${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}`, { signal: AbortSignal.timeout(3000) });
    keycloakAvailable = res.ok;
  } catch {
    keycloakAvailable = false;
  }
  setTimeout(() => { keycloakAvailable = null; }, 60000);
  return keycloakAvailable;
}

// ─── User Management ─────────────────────────────────────────────────────────

export async function createUser(user: {
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  enabled?: boolean;
  emailVerified?: boolean;
  attributes?: Record<string, string[]>;
}): Promise<{ id: string } | null> {
  const token = await getAdminToken();
  if (!token) {
    // Try Go Keycloak admin proxy
    try {
      const res = await fetch(`${KEYCLOAK_ADMIN_URL}/api/v1/keycloak/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(user),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return await res.json() as { id: string };
    } catch { /* fall through */ }
    return null;
  }

  const res = await fetch(`${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...user, enabled: user.enabled ?? true }),
    signal: AbortSignal.timeout(10000),
  });

  if (res.status === 201) {
    const location = res.headers.get("Location");
    const id = location?.split("/").pop() || "";
    return { id };
  }

  return null;
}

export async function assignRole(userId: string, roleName: string): Promise<boolean> {
  const token = await getAdminToken();
  if (!token) return false;

  // Get role ID
  const rolesRes = await fetch(`${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/roles/${roleName}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!rolesRes.ok) return false;
  const role = await rolesRes.json() as { id: string; name: string };

  // Assign role
  const res = await fetch(`${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users/${userId}/role-mappings/realm`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify([role]),
    signal: AbortSignal.timeout(5000),
  });

  return res.status === 204;
}

export async function validateToken(token: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/userinfo`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return await res.json() as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function getUser(userId: string): Promise<Record<string, unknown> | null> {
  const token = await getAdminToken();
  if (!token) return null;
  const res = await fetch(`${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users/${userId}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return null;
  return await res.json() as Record<string, unknown>;
}

export function getKeycloakStatus(): {
  available: boolean;
  url: string;
  realm: string;
  hasAdminToken: boolean;
} {
  return {
    available: keycloakAvailable ?? false,
    url: KEYCLOAK_URL,
    realm: KEYCLOAK_REALM,
    hasAdminToken: !!adminToken && adminToken.expiresAt > Date.now(),
  };
}
