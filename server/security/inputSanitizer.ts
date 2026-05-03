/**
 * Input Sanitizer — defense against XSS, SQL injection, and malicious payloads.
 * Applied at the API gateway level before reaching route handlers.
 */
import type { Request, Response, NextFunction } from "express";

const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|EXEC|EXECUTE|UNION|TRUNCATE)\b)/gi,
  /(-{2}|\/\*|\*\/)/g,
  /(;|\||`)/g,
  /(\bOR\b\s+\d+\s*=\s*\d+)/gi,
  /(\bAND\b\s+\d+\s*=\s*\d+)/gi,
];

const XSS_PATTERNS = [
  /<script[\s>]/gi,
  /javascript:/gi,
  /on\w+\s*=/gi,
  /data:text\/html/gi,
  /<iframe/gi,
  /<object/gi,
  /<embed/gi,
  /<form/gi,
];

function sanitizeString(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
}

function isMalicious(value: string): boolean {
  for (const pattern of [...SQL_INJECTION_PATTERNS, ...XSS_PATTERNS]) {
    if (pattern.test(value)) return true;
  }
  return false;
}

function deepSanitize(obj: any, depth = 0): any {
  if (depth > 10) return obj;
  if (typeof obj === "string") {
    return sanitizeString(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => deepSanitize(item, depth + 1));
  }
  if (obj && typeof obj === "object") {
    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      const sanitizedKey = sanitizeString(key);
      sanitized[sanitizedKey] = deepSanitize(value, depth + 1);
    }
    return sanitized;
  }
  return obj;
}

function checkForMaliciousInput(obj: any, path = ""): string | null {
  if (typeof obj === "string") {
    if (isMalicious(obj)) return `${path}: suspicious pattern detected`;
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const result = checkForMaliciousInput(obj[i], `${path}[${i}]`);
      if (result) return result;
    }
  }
  if (obj && typeof obj === "object") {
    for (const [key, value] of Object.entries(obj)) {
      if (isMalicious(key)) return `key ${key}: suspicious pattern`;
      const result = checkForMaliciousInput(value, `${path}.${key}`);
      if (result) return result;
    }
  }
  return null;
}

// Routes where SQL-keyword detection is relaxed (to avoid false positives
// on legitimate business content like BIS investigation notes, compliance
// reports, and developer portal documentation).
const TRUSTED_ROUTE_PREFIXES = [
  "/api/trpc/bis.",
  "/api/trpc/compliance.",
  "/api/trpc/audit.",
  "/api/trpc/admin.",
  "/api/trpc/middlewareHub.",
  "/api/trpc/devPortal.",
];

function isTrustedRoute(path: string): boolean {
  return TRUSTED_ROUTE_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export function inputSanitizerMiddleware(req: Request, res: Response, next: NextFunction): void {
  const trusted = isTrustedRoute(req.path);

  // Check query params (always check XSS, skip SQL on trusted routes)
  if (req.query) {
    const queryCheck = trusted
      ? checkForXssOnly(req.query, "query")
      : checkForMaliciousInput(req.query, "query");
    if (queryCheck) {
      res.status(400).json({ error: "Invalid input", code: "MALICIOUS_INPUT" });
      return;
    }
  }

  // Check body (for JSON payloads)
  if (req.body && typeof req.body === "object") {
    const bodyCheck = trusted
      ? checkForXssOnly(req.body, "body")
      : checkForMaliciousInput(req.body, "body");
    if (bodyCheck) {
      res.status(400).json({ error: "Invalid input", code: "MALICIOUS_INPUT" });
      return;
    }
  }

  next();
}

function checkForXssOnly(obj: any, path = ""): string | null {
  if (typeof obj === "string") {
    for (const pattern of XSS_PATTERNS) {
      if (pattern.test(obj)) return `${path}: XSS pattern detected`;
    }
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const result = checkForXssOnly(obj[i], `${path}[${i}]`);
      if (result) return result;
    }
  }
  if (obj && typeof obj === "object") {
    for (const [key, value] of Object.entries(obj)) {
      const result = checkForXssOnly(value, `${path}.${key}`);
      if (result) return result;
    }
  }
  return null;
}

export { sanitizeString, deepSanitize, isMalicious };
