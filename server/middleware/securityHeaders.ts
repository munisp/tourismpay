/**
 * Security headers middleware.
 *
 * Sets Content-Security-Policy, X-Frame-Options, HSTS, and other
 * headers that harden the platform against XSS, clickjacking, and
 * protocol downgrade attacks.
 */
import { Request, Response, NextFunction } from "express";
import { logger } from "../_core/logger";

export function securityHeaders() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Content Security Policy
    res.setHeader("Content-Security-Policy", [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https: blob:",
      "connect-src 'self' https://api.stripe.com https://*.tourismpay.com wss://*.tourismpay.com https://africastalking.com",
      "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
      "upgrade-insecure-requests",
    ].join("; "));

    // Prevent clickjacking
    res.setHeader("X-Frame-Options", "SAMEORIGIN");

    // Prevent MIME type sniffing
    res.setHeader("X-Content-Type-Options", "nosniff");

    // Referrer policy
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

    // Permissions policy — disable unused browser features
    res.setHeader("Permissions-Policy", [
      "camera=(self)",           // Needed for QR scanner
      "microphone=()",
      "geolocation=(self)",      // Needed for nearby merchants
      "payment=(self)",          // Needed for Payment Request API
      "usb=()",
      "magnetometer=()",
      "gyroscope=()",
      "accelerometer=()",
    ].join(", "));

    // HSTS (only in production — let reverse proxy handle in staging)
    if (process.env.NODE_ENV === "production") {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    }

    // Prevent browsers from caching sensitive API responses
    if (req.path.startsWith("/api/")) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
      res.setHeader("Pragma", "no-cache");
    }

    next();
  };
}

/**
 * Session fingerprinting — generates a device fingerprint from request headers.
 * Used to detect session hijacking (sudden fingerprint change = suspicious).
 */
export function generateSessionFingerprint(req: Request): string {
  const components = [
    req.headers["user-agent"] ?? "",
    req.headers["accept-language"] ?? "",
    req.headers["accept-encoding"] ?? "",
    req.ip ?? "",
  ];
  // Simple hash (in production use SHA-256)
  let hash = 0;
  const str = components.join("|");
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return `fp_${Math.abs(hash).toString(36)}`;
}

/**
 * Suspicious login detection — checks for impossible travel and new device.
 */
export interface LoginRiskAssessment {
  riskLevel: "low" | "medium" | "high";
  flags: string[];
  requireMfa: boolean;
}

export function assessLoginRisk(
  currentIp: string,
  currentFingerprint: string,
  lastLoginIp?: string,
  lastLoginFingerprint?: string,
  lastLoginTimestamp?: number,
): LoginRiskAssessment {
  const flags: string[] = [];
  let riskLevel: "low" | "medium" | "high" = "low";

  // New device detection
  if (lastLoginFingerprint && currentFingerprint !== lastLoginFingerprint) {
    flags.push("new_device");
    riskLevel = "medium";
  }

  // IP change detection
  if (lastLoginIp && currentIp !== lastLoginIp) {
    flags.push("new_ip");
    if (riskLevel === "low") riskLevel = "medium";
  }

  // Impossible travel: if last login was <2 hours ago and IP changed significantly
  if (lastLoginTimestamp && lastLoginIp && currentIp !== lastLoginIp) {
    const hoursSinceLastLogin = (Date.now() - lastLoginTimestamp) / (1000 * 60 * 60);
    if (hoursSinceLastLogin < 2) {
      flags.push("impossible_travel");
      riskLevel = "high";
    }
  }

  return {
    riskLevel,
    flags,
    requireMfa: riskLevel === "high" || flags.includes("impossible_travel"),
  };
}
