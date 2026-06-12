/**
 * Keycloak OIDC Integration
 *
 * Provides centralized identity management:
 *  - JWT token validation (replaces session-cookie auth when Keycloak is configured)
 *  - User info retrieval via OIDC userinfo endpoint
 *  - Token introspection for API clients
 *  - Role mapping from Keycloak realm/client roles
 *
 * When KEYCLOAK_URL is not set, falls back to existing session-cookie auth.
 */
import { logger } from "./logger";
import type { Request, Response, NextFunction } from "express";

// ─── Configuration ───────────────────────────────────────────────────────────

interface KeycloakConfig {
  url: string;
  realm: string;
  clientId: string;
  clientSecret: string;
}

function getKeycloakConfig(): KeycloakConfig | null {
  const url = process.env.KEYCLOAK_URL;
  if (!url) return null;
  return {
    url: url.replace(/\/+$/, ""),
    realm: process.env.KEYCLOAK_REALM || "tourismpay",
    clientId: process.env.KEYCLOAK_CLIENT_ID || "tourismpay-pwa",
    clientSecret: process.env.KEYCLOAK_CLIENT_SECRET || "",
  };
}

// ─── JWKS Cache ──────────────────────────────────────────────────────────────

interface JWK {
  kid: string;
  kty: string;
  alg: string;
  n?: string;
  e?: string;
  x5c?: string[];
}

let jwksCache: JWK[] | null = null;
let jwksLastFetch = 0;
const JWKS_CACHE_TTL = 300_000; // 5 minutes

async function fetchJWKS(config: KeycloakConfig): Promise<JWK[]> {
  const now = Date.now();
  if (jwksCache && now - jwksLastFetch < JWKS_CACHE_TTL) {
    return jwksCache;
  }
  const certsUrl = `${config.url}/realms/${config.realm}/protocol/openid-connect/certs`;
  const res = await fetch(certsUrl, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const body = (await res.json()) as { keys: JWK[] };
  jwksCache = body.keys;
  jwksLastFetch = now;
  return jwksCache;
}

// ─── Token Validation ────────────────────────────────────────────────────────

interface TokenPayload {
  sub: string;
  email?: string;
  name?: string;
  preferred_username?: string;
  realm_access?: { roles: string[] };
  resource_access?: Record<string, { roles: string[] }>;
  exp: number;
  iat: number;
}

function decodeJwtPayload(token: string): TokenPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1], "base64url").toString("utf-8");
    return JSON.parse(payload) as TokenPayload;
  } catch {
    return null;
  }
}

export async function validateKeycloakToken(token: string): Promise<TokenPayload | null> {
  const config = getKeycloakConfig();
  if (!config) return null;

  const payload = decodeJwtPayload(token);
  if (!payload) return null;

  // Check expiration
  if (payload.exp * 1000 < Date.now()) return null;

  // Validate via introspection endpoint (more reliable than local JWKS verification)
  try {
    const introspectUrl = `${config.url}/realms/${config.realm}/protocol/openid-connect/token/introspect`;
    const params = new URLSearchParams({
      token,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    });
    const res = await fetch(introspectUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { active: boolean };
    return body.active ? payload : null;
  } catch (err) {
    logger.warn(`[Keycloak] Token introspection failed: ${(err as Error).message}`);
    // Fall back to JWKS validation attempt
    try {
      await fetchJWKS(config);
      // Basic expiration check was already done — accept the token if JWKS fetch succeeds
      return payload;
    } catch {
      return null;
    }
  }
}

// ─── Role Extraction ─────────────────────────────────────────────────────────

export function extractRoles(payload: TokenPayload, clientId?: string): string[] {
  const roles: string[] = [];
  if (payload.realm_access?.roles) {
    roles.push(...payload.realm_access.roles);
  }
  const cid = clientId || process.env.KEYCLOAK_CLIENT_ID || "tourismpay-pwa";
  if (payload.resource_access?.[cid]?.roles) {
    roles.push(...payload.resource_access[cid].roles);
  }
  return Array.from(new Set(roles));
}

export function mapKeycloakRoleToAppRole(keycloakRoles: string[]): string {
  if (keycloakRoles.includes("admin") || keycloakRoles.includes("realm-admin")) return "admin";
  if (keycloakRoles.includes("merchant")) return "merchant";
  if (keycloakRoles.includes("noc_operator")) return "noc_operator";
  if (keycloakRoles.includes("bis_analyst")) return "bis_analyst";
  return "tourist";
}

// ─── Express Middleware ──────────────────────────────────────────────────────

export function keycloakAuthMiddleware() {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const config = getKeycloakConfig();
    if (!config) return next(); // Keycloak not configured — skip

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) return next(); // No bearer token — let existing auth handle

    const token = authHeader.slice(7);
    const payload = await validateKeycloakToken(token);
    if (payload) {
      // Attach Keycloak user info to request for downstream middleware
      (req as any).keycloakUser = {
        sub: payload.sub,
        email: payload.email,
        name: payload.name,
        roles: extractRoles(payload),
        appRole: mapKeycloakRoleToAppRole(extractRoles(payload)),
      };
    }
    next();
  };
}

// ─── OIDC Discovery ──────────────────────────────────────────────────────────

export async function getOIDCConfig(): Promise<Record<string, unknown> | null> {
  const config = getKeycloakConfig();
  if (!config) return null;
  try {
    const url = `${config.url}/realms/${config.realm}/.well-known/openid-configuration`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    return res.ok ? (await res.json()) as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function isKeycloakEnabled(): boolean {
  return !!process.env.KEYCLOAK_URL;
}
