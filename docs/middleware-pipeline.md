# Middleware Pipeline Architecture

## Express Middleware Execution Order

The order of middleware in `server/_core/index.ts` is critical for security.
Each layer depends on the layers before it.

```
Request
  │
  ├─ 1. Stripe Webhook (raw body access, before JSON parsing)
  │
  ├─ 2. Response Compression (gzip, threshold: 1KB)
  │     Compresses API responses to reduce bandwidth.
  │     Must be early so it wraps all downstream responses.
  │
  ├─ 3. Request Logger (assigns X-Request-Id UUID)
  │     Every request gets a correlation ID for distributed tracing.
  │     Must be before everything else to log all requests.
  │
  ├─ 4. Security Headers (CSP, HSTS, X-Frame-Options, etc.)
  │     Static headers set on every response.
  │
  ├─ 5. CORS Hardening (origin whitelist, credentials, max-age)
  │     Must be before any route handlers for preflight OPTIONS.
  │
  ├─ 6. DDoS Protection (content inspection, anomaly detection)
  │     - URL length checks (always)
  │     - Suspicious pattern detection (always)
  │     - Anti-ransomware file extension check (always)
  │     - Rate limiting (production only, dev uses rateLimiter.ts)
  │     Must be before body parsing to reject malicious requests early.
  │
  ├─ 7. Rate Limiter (per-IP, per-route sliding window)
  │     Route-specific limits:
  │       - /api/demo-login: 10/min
  │       - /api/dev/*: 20/min
  │       - /api/trpc/auth.*: 15/min
  │       - /api/trpc/qrPayment.*: 30/min
  │       - /api/trpc/wallet.*: 50/min
  │       - /api/trpc/remittance.create: 20/min
  │       - /api/*: 120/min (default)
  │     Sets X-RateLimit-* headers.
  │
  ├─ 8. Cookie Parser (cookie-parser)
  │     Parses Cookie header into req.cookies.
  │     MUST be before CSRF middleware (CSRF reads cookies).
  │
  ├─ 9. Body Parser (express.json)
  │     Route-specific size limits:
  │       - /api/trpc/kybDocuments: 50MB (document uploads)
  │       - /api/trpc/kybApplication: 10MB
  │       - /api/trpc/touristOnboarding: 10MB
  │       - /api/stripe-webhook: 5MB
  │       - Default: 1MB
  │     Must be before input sanitizer and CSRF.
  │
  ├─ 10. Input Sanitizer (XSS + SQL injection detection)
  │      Checks query params and body for malicious patterns.
  │      Trusted routes (BIS, compliance, admin) skip SQL detection
  │      to avoid false positives on legitimate business content.
  │      Must be after body parsing so req.body is available.
  │
  ├─ 11. CSRF Protection (double-submit cookie pattern)
  │      Sets csrf_token cookie, verifies X-CSRF-Token header.
  │      Exempt: GET/HEAD/OPTIONS, /api/dev/*, webhooks, SSE.
  │      Must be after cookie parser and body parser.
  │
  ├─ 12. ETag Support (conditional responses)
  │      Strong ETags for cacheable responses.
  │
  ├─ 13. Health Endpoints (/api/health/live, /ready, /startup)
  │
  ├─ 14. OAuth Routes
  │
  ├─ 15. Demo Login Routes (dev only)
  │
  ├─ 16. SSE Streams (fraud monitor, SOC dashboard, BIS)
  │
  ├─ 17. tRPC API (/api/trpc)
  │      createContext() → authenticates user from JWT
  │      └─ tRPC Middleware Pipeline:
  │         ├─ requireUser (auth check)
  │         ├─ PBAC enforcement (policy-based access control)
  │         └─ Route handler
  │
  └─ 18. Static Files / Vite Dev Server
```

## Security Middleware Details

| Middleware | File | Purpose |
|---|---|---|
| Security Headers | `security/ddosProtection.ts` | 7 headers: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, X-XSS-Protection, Permissions-Policy |
| CORS | `security/ddosProtection.ts` | Origin whitelist, credentials support |
| DDoS Protection | `security/ddosProtection.ts` | 6-layer defense: IP blocking, URL checks, rate limiting, payload inspection, pattern detection, ransomware extension check |
| Rate Limiter | `security/rateLimiter.ts` | Per-IP, per-route sliding window with fixed-window buckets |
| CSRF | `security/csrf.ts` | Double-submit cookie pattern, 32-byte random token, 24h expiry |
| Input Sanitizer | `security/inputSanitizer.ts` | XSS pattern detection, SQL injection detection (with trusted route bypass) |
| PBAC | `security/pbacMiddleware.ts` | Policy-based access control via Rust engine (with role-based fallback) |

## Infrastructure Middleware

| Service | Port | Purpose | Integration |
|---|---|---|---|
| Redis | 6379 | Session cache, rate limit counters | In-memory fallback when unavailable |
| Kafka | 9092 | Event streaming (13 topics) | Via Dapr sidecar pub/sub |
| Temporal | 7233 | Workflow orchestration (5 workflows) | HTTP API with typed client |
| OpenSearch | 9200 | Full-text search, audit log indexing | Batch indexer with circuit breaker |
| Permify | 3476 | Fine-grained authorization | REST API check |
| APISIX | 9180 | API gateway | Admin API for route management |
| TigerBeetle | 3000 | Double-entry accounting | Go settlement service |
| Keycloak | 8080 | Identity management | OAuth/OIDC |
| Fluvio | 9003 | Real-time streaming | Lakehouse pipeline |
| Lakehouse | 8070 | Data lake analytics | 7 materialized views |

## Circuit Breaker

All downstream service calls go through a circuit breaker (`middleware/circuitBreaker.ts`):
- **CLOSED**: Normal operation
- **OPEN**: Service down → fail fast (no call attempt)
- **HALF_OPEN**: Testing recovery → limited probe requests

Default config: 5 failures → OPEN for 30s → 3 half-open probes.

## Graceful Shutdown

On SIGTERM/SIGINT:
1. Stop accepting new connections
2. Stop all background job timers (20 scheduled jobs)
3. Stop OpenSearch batch flusher
4. Stop Fluvio stream flusher
5. Wait for in-flight requests (max 10s timeout)
6. Close database connection pool
7. Exit
