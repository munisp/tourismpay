/**
 * Centralized Security Configuration
 * Single source of truth for all security-related settings.
 */

export const SECURITY_CONFIG = {
  /** CORS allowed origins */
  cors: {
    allowedOrigins: process.env.CORS_ORIGINS?.split(",") ?? [
      "http://localhost:3000",
      "http://localhost:5173",
      "https://tourismpay.com",
      "https://app.tourismpay.com",
    ],
    maxAge: 86400,
    credentials: true,
  },

  /** Rate limiting */
  rateLimit: {
    global: { windowMs: 60_000, maxRequests: 100 },
    auth: { windowMs: 60_000, maxRequests: 10 },
    api: { windowMs: 60_000, maxRequests: 60 },
    payment: { windowMs: 60_000, maxRequests: 20 },
  },

  /** Session / JWT */
  jwt: {
    algorithm: "HS256" as const,
    accessTokenExpiry: "15m",
    refreshTokenExpiry: "7d",
    issuer: "tourismpay",
    audience: "tourismpay-api",
  },

  /** Content Security Policy */
  csp: {
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'", "'unsafe-inline'"],
      "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      "font-src": ["'self'", "https://fonts.gstatic.com"],
      "img-src": ["'self'", "data:", "https:"],
      "connect-src": ["'self'", "https://api.tourismpay.com", "wss://api.tourismpay.com"],
      "frame-ancestors": ["'none'"],
      "base-uri": ["'self'"],
      "form-action": ["'self'"],
    },
  },

  /** Security headers */
  headers: {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "0",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(self)",
  },

  /** DDoS protection */
  ddos: {
    maxPayloadBytes: 1_048_576,
    suspiciousPatterns: [
      /\.\.\//g,
      /<script/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
    ],
    blockedUserAgents: [
      /sqlmap/i,
      /nikto/i,
      /masscan/i,
      /zgrab/i,
    ],
  },

  /** File upload */
  upload: {
    maxFileSizeMB: 10,
    allowedMimeTypes: [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ],
    scanForMalware: true,
  },

  /** Password policy */
  password: {
    minLength: 12,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecial: true,
    maxLoginAttempts: 5,
    lockoutDurationMinutes: 15,
  },

  /** Audit */
  audit: {
    logAllRequests: process.env.NODE_ENV === "production",
    retentionDays: 90,
    sensitiveFields: ["password", "secret", "token", "apiKey", "cardNumber"],
  },
} as const;

export type SecurityConfig = typeof SECURITY_CONFIG;
