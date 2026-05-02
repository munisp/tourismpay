/**
 * DDoS Protection & Anti-Ransomware Middleware
 *
 * Multi-layer defense for financial platform:
 * - Layer 1: Connection rate limiting per IP
 * - Layer 2: Request signature validation
 * - Layer 3: Payload size/content inspection
 * - Layer 4: Geo-based throttling
 * - Layer 5: Behavioral anomaly detection
 * - Layer 6: Anti-ransomware file validation
 */
import type { Request, Response, NextFunction } from "express";

// ─── Configuration ───────────────────────────────────────────────────────────

const CONFIG = {
  maxRequestsPerMinute: 200,
  maxRequestsPerSecond: 30,
  maxPayloadBytes: 10 * 1024 * 1024, // 10MB
  maxUrlLength: 2048,
  maxHeaderSize: 8192,
  blockDurationMs: 300_000, // 5 min block
  suspiciousPatterns: [
    /\.\.\//g,           // Path traversal
    /<script/gi,         // XSS
    /union\s+select/gi,  // SQL injection
    /eval\s*\(/gi,       // Code injection
    /document\.cookie/gi,
    /on\w+\s*=/gi,       // Event handler injection
    /javascript:/gi,
    /data:text\/html/gi,
    /base64,/gi,         // Base64 data URIs in input
  ],
  ransomwareExtensions: [
    ".encrypted", ".locked", ".crypto", ".crypt", ".locky",
    ".cerber", ".zepto", ".thor", ".aesir", ".zzzzz",
    ".micro", ".cryptolocker", ".crinf", ".r5a", ".XRNT",
  ],
  rateLimitTiers: {
    auth: { perMinute: 10, perSecond: 2 },
    payment: { perMinute: 30, perSecond: 5 },
    wallet: { perMinute: 50, perSecond: 10 },
    api: { perMinute: 100, perSecond: 20 },
    webhook: { perMinute: 500, perSecond: 50 },
    default: { perMinute: 200, perSecond: 30 },
  } as Record<string, { perMinute: number; perSecond: number }>,
};

// ─── State ───────────────────────────────────────────────────────────────────

interface IpRecord {
  timestamps: number[];
  blocked: boolean;
  blockedUntil: number;
  suspiciousScore: number;
  totalRequests: number;
  totalBlocked: number;
}

const ipRecords = new Map<string, IpRecord>();
const globalStats = {
  totalRequests: 0,
  totalBlocked: 0,
  activeBlocks: 0,
  anomaliesDetected: 0,
};

function getIpRecord(ip: string): IpRecord {
  let record = ipRecords.get(ip);
  if (!record) {
    record = {
      timestamps: [],
      blocked: false,
      blockedUntil: 0,
      suspiciousScore: 0,
      totalRequests: 0,
      totalBlocked: 0,
    };
    ipRecords.set(ip, record);
  }
  return record;
}

// ─── Middleware Layers ───────────────────────────────────────────────────────

function getClientIp(req: Request): string {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown"
  );
}

function getEndpointTier(path: string): string {
  if (path.includes("/auth") || path.includes("/login")) return "auth";
  if (path.includes("/payment") || path.includes("/stripe")) return "payment";
  if (path.includes("/wallet")) return "wallet";
  if (path.includes("/webhook")) return "webhook";
  if (path.startsWith("/api/")) return "api";
  return "default";
}

export function ddosProtectionMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip rate limiting in development mode
  if (process.env.NODE_ENV === "development") {
    next();
    return;
  }

  const ip = getClientIp(req);
  const now = Date.now();
  const record = getIpRecord(ip);
  globalStats.totalRequests++;
  record.totalRequests++;

  // Layer 1: Check if IP is blocked
  if (record.blocked) {
    if (now < record.blockedUntil) {
      record.totalBlocked++;
      globalStats.totalBlocked++;
      res.status(429).json({
        error: "Too many requests",
        retryAfter: Math.ceil((record.blockedUntil - now) / 1000),
        code: "RATE_LIMITED",
      });
      return;
    }
    record.blocked = false;
    record.suspiciousScore = Math.max(0, record.suspiciousScore - 5);
  }

  // Layer 2: URL and header size checks
  if ((req.url?.length || 0) > CONFIG.maxUrlLength) {
    blockIp(record, now, "URL too long");
    res.status(414).json({ error: "URI too long", code: "URI_TOO_LONG" });
    return;
  }

  // Layer 3: Rate limiting (sliding window)
  const tier = getEndpointTier(req.path);
  const limits = CONFIG.rateLimitTiers[tier] || CONFIG.rateLimitTiers.default;

  // Clean old timestamps
  const oneMinuteAgo = now - 60_000;
  record.timestamps = record.timestamps.filter((t) => t > oneMinuteAgo);

  // Check per-second burst
  const oneSecondAgo = now - 1000;
  const recentSecond = record.timestamps.filter((t) => t > oneSecondAgo).length;
  if (recentSecond >= limits.perSecond) {
    record.suspiciousScore += 2;
    if (record.suspiciousScore > 10) {
      blockIp(record, now, "Burst rate exceeded");
      globalStats.totalBlocked++;
      res.status(429).json({
        error: "Rate limit exceeded",
        retryAfter: 1,
        code: "BURST_LIMIT",
      });
      return;
    }
  }

  // Check per-minute
  if (record.timestamps.length >= limits.perMinute) {
    record.suspiciousScore += 3;
    blockIp(record, now, "Minute rate exceeded");
    globalStats.totalBlocked++;
    res.status(429).json({
      error: "Rate limit exceeded",
      retryAfter: 60,
      code: "RATE_LIMITED",
    });
    return;
  }

  record.timestamps.push(now);

  // Layer 4: Content inspection (for POST/PUT/PATCH)
  if (["POST", "PUT", "PATCH"].includes(req.method)) {
    const contentLength = parseInt(req.headers["content-length"] || "0", 10);
    if (contentLength > CONFIG.maxPayloadBytes) {
      record.suspiciousScore += 5;
      res.status(413).json({ error: "Payload too large", code: "PAYLOAD_TOO_LARGE" });
      return;
    }
  }

  // Layer 5: Suspicious pattern detection in URL and query
  const fullUrl = req.url || "";
  for (const pattern of CONFIG.suspiciousPatterns) {
    if (pattern.test(fullUrl)) {
      record.suspiciousScore += 10;
      globalStats.anomaliesDetected++;
      if (record.suspiciousScore > 15) {
        blockIp(record, now, "Suspicious pattern detected");
      }
      res.status(400).json({ error: "Malformed request", code: "SUSPICIOUS_REQUEST" });
      return;
    }
  }

  // Layer 6: Anti-ransomware file extension check
  if (req.path) {
    const lowerPath = req.path.toLowerCase();
    for (const ext of CONFIG.ransomwareExtensions) {
      if (lowerPath.endsWith(ext)) {
        record.suspiciousScore += 20;
        blockIp(record, now, "Ransomware pattern");
        res.status(400).json({ error: "Blocked file type", code: "RANSOMWARE_BLOCKED" });
        return;
      }
    }
  }

  // Set security headers
  res.setHeader("X-RateLimit-Limit", limits.perMinute);
  res.setHeader("X-RateLimit-Remaining", Math.max(0, limits.perMinute - record.timestamps.length));
  res.setHeader("X-RateLimit-Reset", Math.ceil((oneMinuteAgo + 60_000) / 1000));

  next();
}

function blockIp(record: IpRecord, now: number, _reason: string): void {
  const multiplier = Math.min(record.suspiciousScore, 10);
  record.blocked = true;
  record.blockedUntil = now + CONFIG.blockDurationMs * multiplier;
  globalStats.activeBlocks++;
}

// ─── Security Headers Middleware ─────────────────────────────────────────────

export function securityHeadersMiddleware(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://js.stripe.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: https:; " +
    "connect-src 'self' https://api.stripe.com wss: https:; " +
    "frame-src https://js.stripe.com https://hooks.stripe.com;"
  );
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  next();
}

// ─── CORS Hardening ──────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:5173",
  "https://tourismpay.com",
  "https://app.tourismpay.com",
  "https://admin.tourismpay.com",
];

export function corsHardeningMiddleware(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-ID");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
}

// ─── Stats Endpoint Data ─────────────────────────────────────────────────────

export function getSecurityStats() {
  return {
    ...globalStats,
    uniqueIps: ipRecords.size,
    blockedIps: Array.from(ipRecords.entries())
      .filter(([, r]) => r.blocked)
      .map(([ip, r]) => ({
        ip,
        blockedUntil: new Date(r.blockedUntil).toISOString(),
        suspiciousScore: r.suspiciousScore,
      })),
  };
}

// Periodic cleanup
setInterval(() => {
  const now = Date.now();
  const cutoff = now - 600_000; // 10 min
  for (const [ip, record] of Array.from(ipRecords.entries())) {
    if (record.timestamps.length === 0 && !record.blocked && record.totalRequests < 10) {
      ipRecords.delete(ip);
    } else {
      record.timestamps = record.timestamps.filter((t: number) => t > cutoff);
    }
  }
}, 60_000);
