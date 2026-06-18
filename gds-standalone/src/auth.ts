/**
 * GDS Authentication Middleware
 * Supports both JWT (Keycloak/OIDC) and API Key authentication.
 * External applications can use either method.
 *
 * Production: Verifies JWT signature using JWKS endpoint.
 * Development: Decodes JWT without verification (for local testing).
 */
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import { config } from "./config";

const jwks = jwksClient({
  jwksUri: config.AUTH_JWKS_URI,
  cache: true,
  cacheMaxAge: 600000,
  rateLimit: true,
  jwksRequestsPerMinute: 10,
});

function getSigningKey(header: jwt.JwtHeader): Promise<string> {
  return new Promise((resolve, reject) => {
    jwks.getSigningKey(header.kid, (err, key) => {
      if (err) return reject(err);
      const signingKey = key?.getPublicKey();
      if (!signingKey) return reject(new Error("No signing key found"));
      resolve(signingKey);
    });
  });
}

export interface GDSUser {
  sub: string;
  email?: string;
  name?: string;
  tenantId: string;
  role: "agent" | "property_manager" | "admin" | "api_client";
  agentId?: string;
  propertyIds?: string[];
}

declare global {
  namespace Express {
    interface Request {
      gdsUser?: GDSUser;
    }
  }
}

// In-memory API key store (in production: Redis or database)
const apiKeys = new Map<string, GDSUser>();

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  const apiKey = req.headers["x-gds-api-key"] as string;

  // API Key authentication
  if (apiKey && config.AUTH_API_KEY_ENABLED) {
    const user = apiKeys.get(apiKey);
    if (user) {
      req.gdsUser = user;
      return next();
    }
    // In production: look up API key in database
    // For now: allow with default user for development
    if (config.NODE_ENV === "development") {
      req.gdsUser = {
        sub: "dev-api-client",
        tenantId: config.DEFAULT_TENANT,
        role: "api_client",
        name: "Development API Client",
      };
      return next();
    }
    res.status(401).json({ error: "Invalid API key" });
    return;
  }

  // JWT Bearer token authentication
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      // In production: verify against JWKS endpoint
      // For development: decode without verification
      if (config.NODE_ENV === "development") {
        const decoded = jwt.decode(token) as any;
        if (decoded) {
          req.gdsUser = {
            sub: decoded.sub || "unknown",
            email: decoded.email,
            name: decoded.name || decoded.preferred_username,
            tenantId: decoded.tenant_id || config.DEFAULT_TENANT,
            role: decoded.gds_role || "agent",
            agentId: decoded.agent_id,
          };
          return next();
        }
      }

      // Production: verify with JWKS
      try {
        const decoded = jwt.decode(token, { complete: true });
        if (!decoded || !decoded.header) {
          res.status(401).json({ error: "Malformed token" });
          return;
        }
        const key = await getSigningKey(decoded.header);
        const verified = jwt.verify(token, key, {
          audience: config.AUTH_AUDIENCE,
          issuer: config.AUTH_ISSUER,
        }) as any;
        req.gdsUser = {
          sub: verified.sub || "unknown",
          email: verified.email,
          name: verified.name || verified.preferred_username,
          tenantId: verified.tenant_id || config.DEFAULT_TENANT,
          role: verified.gds_role || "agent",
          agentId: verified.agent_id,
        };
        return next();
      } catch (jwksErr) {
        res.status(401).json({ error: "Token verification failed" });
        return;
      }
    } catch {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }
  }

  // No credentials provided
  if (config.NODE_ENV === "development") {
    req.gdsUser = {
      sub: "dev-user",
      tenantId: config.DEFAULT_TENANT,
      role: "admin",
      name: "Development User",
    };
    return next();
  }

  res.status(401).json({
    error: "Authentication required",
    methods: ["Bearer token (JWT)", "X-GDS-API-Key header"],
    docs: "/api/v1/gds/docs",
  });
}

export function requireRole(...roles: GDSUser["role"][]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.gdsUser) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    if (!roles.includes(req.gdsUser.role)) {
      res.status(403).json({ error: "Insufficient permissions", required: roles });
      return;
    }
    next();
  };
}

export function registerApiKey(key: string, user: GDSUser): void {
  apiKeys.set(key, user);
}
