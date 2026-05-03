/**
 * CSRF Protection — Double-submit cookie pattern for tRPC mutations.
 *
 * How it works:
 * 1. Server sets a random CSRF token in a cookie (readable by JS)
 * 2. Client reads the cookie and sends it in X-CSRF-Token header
 * 3. Server verifies cookie value matches header value
 *
 * This is applied to all state-changing requests (POST/PUT/DELETE/PATCH).
 * GET/HEAD/OPTIONS are exempt (safe methods).
 */
import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";

const CSRF_COOKIE = "csrf_token";
const CSRF_HEADER = "x-csrf-token";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Sets a CSRF cookie if one doesn't exist yet.
 */
function ensureCsrfCookie(req: Request, res: Response): string {
  const existing = req.cookies?.[CSRF_COOKIE];
  if (existing && typeof existing === "string" && existing.length >= 32) {
    return existing;
  }
  const token = crypto.randomBytes(32).toString("hex");
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false, // Must be readable by client JS
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 86400 * 1000, // 24 hours
  });
  return token;
}

/**
 * CSRF protection middleware.
 * Exempt: safe methods, /api/dev/* endpoints, /api/stripe-webhook, SSE.
 */
export function csrfMiddleware(req: Request, res: Response, next: NextFunction) {
  const cookieToken = ensureCsrfCookie(req, res);

  // Safe methods don't need CSRF verification
  if (SAFE_METHODS.has(req.method)) return next();

  // Exempt dev endpoints and webhooks
  const path = req.path;
  if (
    path.startsWith("/api/dev/") ||
    path.startsWith("/api/stripe-webhook") ||
    path.startsWith("/api/sse") ||
    path.startsWith("/api/demo-login")
  ) {
    return next();
  }

  // Verify CSRF token
  const headerToken = req.headers[CSRF_HEADER] as string | undefined;
  if (!headerToken || headerToken !== cookieToken) {
    res.status(403).json({ error: "CSRF token mismatch" });
    return;
  }

  next();
}

/**
 * Client-side helper to get the CSRF token from cookie.
 * Usage: fetch('/api/trpc/...', { headers: { 'X-CSRF-Token': getCsrfToken() } })
 */
export const CSRF_CLIENT_SNIPPET = `
function getCsrfToken() {
  const match = document.cookie.match(/(?:^|;)\\s*csrf_token=([^;]+)/);
  return match ? match[1] : '';
}
`;
