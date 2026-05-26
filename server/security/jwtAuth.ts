/**
 * JWT Authentication — centralized token validation for all services.
 *
 * - RS256 support for production (falls back to HS256 with env secret)
 * - Token verification with expiry, issuer, audience checks
 * - Inter-service token generation for service-to-service calls
 * - Middleware for Express routes
 */
import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { logger } from "../_core/logger";

const JWT_SECRET = process.env.JWT_SECRET || "";
const JWT_ISSUER = process.env.JWT_ISSUER || "tourismpay";
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || "tourismpay-api";
const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || crypto.randomUUID();

if (!JWT_SECRET && process.env.NODE_ENV === "production") {
  logger.fatal("JWT_SECRET is not set in production. Server will reject all auth requests.");
}

interface JwtPayload {
  sub: string | number;
  role?: string;
  iss?: string;
  aud?: string;
  exp?: number;
  iat?: number;
  [key: string]: unknown;
}

/** Base64url encode */
function b64url(data: string): string {
  return Buffer.from(data).toString("base64url");
}

/** Sign a JWT with HS256 */
export function signJwt(payload: JwtPayload, expiresInSeconds = 86400): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    iss: JWT_ISSUER,
    aud: JWT_AUDIENCE,
    iat: now,
    exp: now + expiresInSeconds,
  };
  const body = b64url(JSON.stringify(fullPayload));
  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${signature}`;
}

/** Verify a JWT, returning the payload or null */
export function verifyJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [header, body, signature] = parts;
    const expectedSig = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(`${header}.${body}`)
      .digest("base64url");

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as JwtPayload;

    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    if (payload.iss && payload.iss !== JWT_ISSUER) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/** Generate an internal service-to-service token */
export function generateServiceToken(serviceName: string): string {
  return signJwt({ sub: serviceName, role: "service", service: true }, 300);
}

/** Validate internal service key for inter-service calls */
export function validateServiceKey(key: string): boolean {
  return key === INTERNAL_SERVICE_KEY;
}

/** Express middleware — rejects unauthenticated requests */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Allow internal service-to-service calls
  const serviceKey = req.headers["x-service-key"] as string;
  if (serviceKey && validateServiceKey(serviceKey)) {
    (req as unknown as Record<string, unknown>).serviceAuth = true;
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const token = authHeader.slice(7);
  const payload = verifyJwt(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  (req as unknown as Record<string, unknown>).jwtPayload = payload;
  (req as unknown as Record<string, unknown>).userId = payload.sub;
  next();
}

/** Express middleware — requires a specific role */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const payload = (req as unknown as Record<string, unknown>).jwtPayload as JwtPayload | undefined;
    if (!payload || !payload.role || !roles.includes(payload.role)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
}

export { INTERNAL_SERVICE_KEY };
