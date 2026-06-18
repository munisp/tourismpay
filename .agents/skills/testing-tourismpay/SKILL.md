---
name: testing-tourismpay
description: Test TourismPay full-stack application end-to-end. Covers TypeScript frontend/backend, Go settlement service, and Python ML services. Use when verifying production-readiness, code quality, or service integration.
---

# Testing TourismPay

## Overview
TourismPay is a multi-service app: TypeScript (React + tRPC), Go (Gin settlement service), Python (FastAPI ML services). All share a PostgreSQL database.

## Devin Secrets Needed
- None required for local testing. All services use default local PostgreSQL credentials.

## Environment Setup

### Critical: `.env` Configuration
The `.env` file in the repo root **must** contain these variables for auth to work:
```
DATABASE_URL=postgresql://tourismpay_user:testpass123@localhost:5432/tourismpay
JWT_SECRET=tourismpay-test-jwt-secret-for-dev-32chars
OWNER_OPEN_ID=test-owner-id
VITE_APP_ID=tourismpay
```

**`VITE_APP_ID` is required** — without it, `sdk.ts:verifySession()` rejects all session tokens because it validates `appId` is a non-empty string (`isNonEmptyString(appId)` at sdk.ts:218). If auth.me returns null and server logs show `[Auth] Session payload missing required fields`, this is almost certainly the cause.

### PostgreSQL
PostgreSQL should be running on `localhost:5432`. Verify with:
```bash
pg_isready -h localhost -p 5432
```

Key databases:
- `tourismpay` — TypeScript app (Drizzle ORM) AND GDS standalone gateway. User: `postgres`, password: `postgres`
- `tourismpay_settlement` — Go + Python services. User: `tourismpay_user`, password: `testpass123`

### TypeScript Dev Server
```bash
cd /home/ubuntu/repos/tourismpay
pnpm install
npx tsc --noEmit          # Type check (0 errors expected)
pnpm run dev              # Dev server on port 3000 (auto-loads .env via dotenv)
```

**Do NOT pass `DATABASE_URL` as an inline env var** — let dotenv load `.env` naturally, otherwise other vars (JWT_SECRET, VITE_APP_ID) may not load.

### Authentication for Browser Testing
The dev server exposes a session token endpoint:
```
GET /api/dev/session-token?redirect=/target-page
```
This creates a JWT session cookie for the user specified by `OWNER_OPEN_ID` env var.

**Setup for admin access (required to see all sidebar sections):**
1. Ensure a user exists in DB with `open_id` matching `OWNER_OPEN_ID` and `role='admin'`:
```sql
INSERT INTO users (name, email, role, open_id, onboarding_completed)
VALUES ('Test Admin', 'admin@tourismpay.io', 'admin', 'test-owner-id', true)
ON CONFLICT (open_id) DO UPDATE SET role='admin', onboarding_completed=true;
```
2. Assign establishments to this user:
```sql
UPDATE establishments SET owner_id = (SELECT id FROM users WHERE open_id = 'test-owner-id');
```
3. Navigate browser to `/api/dev/session-token?redirect=/` to authenticate.

**If `onboarding_completed` is false**, the app redirects to `/admin` onboarding page instead of the target route.

### Role-Based Sidebar Navigation
The sidebar in `AppShell.tsx` filters nav items by `hasRole()`. Key sections:
- "Africa GDS" section: requires role `merchant` or `admin` (AppShell.tsx:86-88)
- Admin sections (KYB, BIS, Users): requires role `admin`
- Default "User" role shows only: Dashboard, Digital Finance, Settings

If the sidebar appears limited, check `auth.me` response — the user's role determines visible sections.

### Go Settlement Service
```bash
cd /home/ubuntu/repos/tourismpay/go-settlement-service
go build ./...            # Build check
go test -race ./internal/middleware/  # Auth middleware tests (8 tests)

# Run the service (auto-migrates tables on startup):
PORT=8081 \
DATABASE_URL=postgres://tourismpay_user:testpass123@localhost:5432/tourismpay_settlement \
JWT_SECRET=tourismpay-test-jwt-secret-for-dev-32chars \
SETTLEMENT_API_KEY=test-settlement-key \
go run .
```

The Go service auto-creates 15 tables on first startup. Verify via `/health` which should show `"database": "connected"`.

### Python ML Services
```bash
cd /home/ubuntu/repos/tourismpay/python-services
pip install fastapi uvicorn asyncpg pyjwt  # Install deps if needed

# Start individual service (e.g., fraud-ml):
cd fraud-ml-service
SERVICE_API_KEY=test-key-123 \
JWT_SECRET=tourismpay-test-jwt-secret-for-dev-32chars \
DATABASE_URL=postgresql://tourismpay_user:testpass123@localhost:5432/tourismpay_settlement \
python3 -m uvicorn main:app --host 0.0.0.0 --port 8091
```

Python services auto-create ML tables (fraud_scores, compliance_screenings, etc.) on startup.

## Common Testing Patterns

### Browser-Based UI Testing
For testing UI features (GDS pages, payment gateway, merchant dashboard):
1. Start dev server: `pnpm run dev` (port 3000)
2. Authenticate: navigate to `/api/dev/session-token?redirect=/target-page`
3. Use `navigate` actions (not `view`) to reach pages — `view` may trigger page reloads that lose session
4. Verify page content by inspecting HTML output for expected text (h1, tabs, data values)
5. Check for absence of error indicators ("Coming Soon", "No data", "$0", "404")

### Verifying Auth Works
```bash
# Get session cookie
curl -s -c /tmp/cookies.txt "http://localhost:3000/api/dev/session-token?redirect=/"
# Verify auth.me returns user
curl -s -b /tmp/cookies.txt "http://localhost:3000/api/trpc/auth.me"
```
If auth.me returns `{"result":{"data":{"json":null}}}`, check:
1. Server logs for `[Auth] Session payload missing required fields` → VITE_APP_ID not set
2. Server logs for `[Auth] Session verification failed` → JWT_SECRET mismatch
3. User exists in DB with matching `open_id`

### Code Quality Verification (shell-based, no recording needed)
These are the most common tests for production-readiness PRs:

```bash
# Zero unsafe randomness
grep -rn "Math\.random" server/ --include="*.ts" | wc -l  # should be 0
grep -rn "import random" python-services/ --include="*.py" | wc -l  # should be 0

# Zero console.log in frontend production code
grep -rn "console\.log(" client/src/ --include="*.ts" --include="*.tsx" | wc -l  # should be 0

# Logger utility used instead of bare console.error/warn
grep -rn "console\.\(error\|warn\)" client/src/ --include="*.ts" --include="*.tsx" | grep -v logger.ts | grep -v "eslint-disable"  # should be 0
```

### Auth Middleware Testing
Python services use `AuthMiddleware` (JWT + API key). Test pattern:
```bash
curl -s -w "%{http_code}" http://localhost:PORT/health      # → 200 (unprotected)
curl -s http://localhost:PORT/api/v1/... -X POST             # → 401 "Authorization required"
curl -s -H "X-API-Key: test-key-123" http://localhost:PORT/api/v1/...  # → 200
curl -s -H "X-API-Key: wrong" http://localhost:PORT/api/v1/...         # → 401 "Invalid API key"
```

### Database Persistence Testing
```bash
# Verify Go auto-migration
PGPASSWORD=testpass123 psql -h localhost -p 5432 -U tourismpay_user -d tourismpay_settlement -c "\dt"

# Verify Python table creation
cd python-services && python3 -c "
import asyncio, sys; sys.path.insert(0, '.')
import db as database
async def test():
    await database.ensure_tables()
    rows = await database.fetch(\"SELECT tablename FROM pg_tables WHERE schemaname='public'\")
    print(f'Tables: {len(rows)}')
    for r in rows: print(f'  - {r[\"tablename\"]}')
    await database.close_pool()
asyncio.run(test())
"
```

### Seed Script
```bash
# Requires Drizzle migrations for Phase 1 (TypeScript tables)
# Phase 2 (Go) and Phase 3 (Python ML) work if services have been started once
DATABASE_URL="postgresql://tourismpay_user:testpass123@localhost:5432/tourismpay" \
GO_DATABASE_URL="postgresql://tourismpay_user:testpass123@localhost:5432/tourismpay_settlement" \
node scripts/seed-all.mjs
```

**Note**: The seed script's default TypeScript DB credentials might not match your env. Always pass `DATABASE_URL` explicitly.

### Stablecoin On-Ramp / Off-Ramp Testing
The `/wallet/stablecoin` page requires:
1. 4 stablecoin tables: `stablecoin_onramp_orders`, `stablecoin_offramp_requests`, `stablecoin_limit_orders`, `stablecoin_yield_positions`
2. Drizzle migration 0063 must be applied, or tables created manually to match `drizzle/schema.ts` (lines 2242-2406)
3. `wallet_balances` and `wallet_transactions` timestamp columns must be BIGINT (not INTEGER) — `Date.now()` returns ms timestamps (~1.78 trillion)

**Critical: CSRF on mutations.** The CSRF middleware (server/_core/index.ts:120-141) uses double-submit cookies. The tRPC client in `main.tsx` reads `csrf-token` cookie and sends it as `X-CSRF-Token` header. If mutations return 403 "CSRF token mismatch", verify:
- Cookie `csrf-token` exists (set on first GET request)
- `X-CSRF-Token` header is sent with POST requests
- Both values match

## TourismPay Production Infrastructure (PR #33+)

### Production Endpoints (port 3000)
```bash
# Cascading health check — probes pg, redis, kafka, tigerbeetle, mojaloop, keycloak
curl -s http://localhost:3000/health/deep | python3 -m json.tool

# Liveness probe (Kubernetes-style)
curl -s http://localhost:3000/livez
# Expected: {"status":"alive","pid":<number>}

# Readiness probe
curl -s http://localhost:3000/readyz
# Expected: {"status":"ready"}

# Prometheus metrics
curl -s http://localhost:3000/metrics | head -30
# Expected: # TYPE tourismpay_http_request_duration_seconds histogram
# Look for: histogram, counter, gauge types, >= 5 HELP lines

# Rate limiting headers (on any authenticated tRPC request)
curl -sD - -b /tmp/cookies.txt "http://localhost:3000/api/trpc/wallet.balances?input=%7B%22json%22%3Anull%7D" -o /dev/null | grep -i ratelimit
# Expected: RateLimit-Limit: 100, RateLimit-Remaining: <99, RateLimit-Reset: <60, RateLimit-Policy: 100;w=60
```

### Per-Route Rate Limits
| Route | Limit | Window |
|-------|-------|--------|
| General API | 100 req | 60s |
| Auth endpoints | 10 req | 60s |
| Wallet transactions | 30 req | 60s |
| BIS operations | 20 req | 60s |
| Settlement | 5 req | 60s |
| Public endpoints | 200 req | 60s |

### TigerBeetle Ledger Tables
The TigerBeetle integration uses PostgreSQL-backed tables (`ledger_accounts`, `ledger_transfers`). Verify with:
```bash
PGPASSWORD=postgres psql -h localhost -U postgres -d tourismpay -c "\d ledger_accounts"
PGPASSWORD=postgres psql -h localhost -U postgres -d tourismpay -c "\d ledger_transfers"
```

### Integer Timestamp Gotcha
`wallet_balances.createdAt` and `updatedAt` are `integer` columns (max ~2.1B). Code must use `Math.floor(Date.now() / 1000)` (seconds), NOT `Date.now()` (milliseconds, ~1.78T, causes overflow). If wallet operations return 500 with "value out of range for type integer", this is the cause.

Verify fix: check `createdAt` values in wallet.balances response — should be < 2,000,000,000 (seconds), not > 1,000,000,000,000 (milliseconds).

### Integration Test Suite
```bash
cd /home/ubuntu/repos/tourismpay
TEST_BASE_URL=http://localhost:3000 npx vitest run --reporter=verbose
# Expected: 30 tests pass (health, auth, wallet, bis, middleware)
```

### Graceful Degradation
All middleware (Redis, Kafka, Keycloak, Permify, Mojaloop) is optional. The app works without them:
- Redis unavailable → in-memory rate limiting fallback
- Kafka unavailable → events silently dropped (`.catch(() => {})`)
- Keycloak unavailable → dev JWT mode
- Mojaloop unavailable → simulation mode

To verify: check `/health/deep` — disconnected/not_configured statuses should NOT cause 500s on API routes.

### Security Headers
All responses include Helmet security headers. Verify with:
```bash
curl -sI http://localhost:3000/readyz | grep -iE "x-content-type|x-frame|strict-transport|x-request-id|cross-origin-opener"
```

### tRPC Field Names
When testing wallet FX rates via curl, use `fromCurrency`/`toCurrency` (not `from`/`to`):
```bash
curl -s -b /tmp/cookies.txt "http://localhost:3000/api/trpc/wallet.getFxRate?input=%7B%22json%22%3A%7B%22fromCurrency%22%3A%22USDC%22%2C%22toCurrency%22%3A%22NGN%22%2C%22amount%22%3A100%7D%7D"
```

## GDS Standalone Platform

The GDS has its own standalone frontend and gateway, separate from the main TourismPay app.

### Architecture
- **Gateway** (TypeScript Express, port 8090): Single entry point with 28 route files. All routes query PostgreSQL directly via `query()`/`queryOne()` from `lib/database.ts`. Kafka event publishing on writes, Redis caching on reads — both degrade gracefully when unavailable.
- **Frontend** (Vite React, port 4100): 28 views organized in 7 collapsible sidebar sections.
- **Auth**: "Dev Login as Admin" button on login page — no credentials needed.
- **Database**: PostgreSQL with 46+ tables. Migrations auto-run on first start. Nigeria-focused seed data (Lagos, Abuja, Port Harcourt, Calabar; NGN currency).
- **Keycloak**: OIDC provider at port 8180, realm `gds`. 4 test users with realm roles. JWKS verification in production, dev-mode bypass for testing.

### Starting the GDS
```bash
# Gateway (must start first — requires PostgreSQL)
cd /home/ubuntu/repos/tourismpay/gds-standalone
GDS_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/tourismpay" npx tsx src/index.ts
# → "[DB] PostgreSQL connected"
# → "[Migrations] All 5 migrations already applied" (or "Applied migration: ...")
# → "[GDS Standalone] Africa-first GDS running on port 8090"

# Frontend
cd /home/ubuntu/repos/tourismpay/gds-standalone/frontend
npx vite --port 4100 --host
# → "Local: http://localhost:4100/"
```

### Running Automated Test Suite
```bash
cd /home/ubuntu/repos/tourismpay/gds-standalone
npx vitest run --config vitest.config.ts
# Expected: 46 tests pass (42 gateway route + 4 persistence)
# vitest.config.ts sets GDS_DATABASE_URL and NODE_ENV automatically
```

### CORS
The gateway's CORS config is in `gds-standalone/src/config.ts` line 22. Port 4100 must be in `CORS_ORIGINS`. If browser requests fail with CORS errors, verify:
```bash
curl -s -H "Origin: http://localhost:4100" http://localhost:8090/health -v 2>&1 | grep -i "access-control"
```

### Backend Microservice Ports (All Use PostgreSQL)
| Service | Lang | Port | Gateway Route | DB Library |
|---------|------|------|---------------|------------|
| PNR Engine | Go | 8082 | `/api/v1/gds/pnr/*` | database/sql + lib/pq |
| Queue System | Rust | 8083 | `/api/v1/gds/queue/*` | tokio-postgres + deadpool |
| Guest CRM | Go | 8084 | `/api/v1/gds/guest-profile/*` | database/sql + lib/pq |
| Content Mgmt | Python | 8085 | `/api/v1/gds/content/*` | asyncpg |
| Revenue Mgmt | Python | 8086 | `/api/v1/gds/revenue/*` | asyncpg |
| Group Bookings | Go | 8087 | `/api/v1/gds/group-bookings/*` | database/sql + lib/pq |
| Commission | Rust | 8110 | `/api/v1/gds/commission/*` | tokio-postgres + deadpool |
| Discounts | Python | 8111 | `/api/v1/gds/discount/*` | asyncpg |
| Cancellation | Go | 8112 | `/api/v1/gds/cancellation/*` | database/sql + lib/pq |
| Neg. Rates | Go | 8113 | `/api/v1/gds/negotiated-rates/*` | database/sql + lib/pq |
| Settlement | Python | 8114 | `/api/v1/gds/settlement/*` | asyncpg |

All services have `/health` endpoints. The gateway now handles all business logic directly via PostgreSQL — backend services are optional proxies.

### Proving Real DB Persistence (Not In-Memory)

**The adversarial kill-restart test is the gold standard:**
```bash
# 1. Write data via API
curl -s -X POST http://localhost:8090/api/v1/gds/pnr \
  -H "Content-Type: application/json" \
  -d '{"guest_name":"PERSIST-TEST","contact_email":"test@ng"}'
# Save the record_locator from the response

# 2. Verify row exists in psql
PGPASSWORD=postgres psql -U postgres -h localhost -d tourismpay -c \
  "SELECT record_locator FROM gds_pnr_records WHERE guest_name = 'PERSIST-TEST';"

# 3. Kill and restart the server
pkill -f "tsx src/index.ts"
sleep 2
cd /home/ubuntu/repos/tourismpay/gds-standalone
GDS_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/tourismpay" npx tsx src/index.ts &
sleep 5

# 4. Verify data survived restart
curl -s http://localhost:8090/api/v1/gds/pnr | python3 -c "
import json,sys
d=json.load(sys.stdin)
matches = [p for p in d['pnrs'] if p['guest_name'] == 'PERSIST-TEST']
print('PASSED: data survived restart' if matches else 'FAILED: data lost (in-memory!)')
"
```

**Source code audit (verify no in-memory stubs remain):**
```bash
# Go: must have 0 sync.RWMutex/map patterns, >0 SQL patterns
for svc in pnr-engine guest-profile group-bookings cancellation-policy negotiated-rates; do
  BAD=$(grep -c "sync\.RWMutex\|var.*=.*map\[string\]" gds-standalone/services/$svc/main.go)
  GOOD=$(grep -c "db\.QueryRow\|db\.Exec\|\\\$1" gds-standalone/services/$svc/main.go)
  echo "$svc: in-memory=$BAD, sql=$GOOD"
done
# All should show in-memory=0, sql>0

# Rust: must have tokio_postgres, not Vec<Mutex>
# Python: must have asyncpg, not = [] or = {}
```

### Verifying Backend Service Compilation
```bash
# Go services (all 5 must compile)
for svc in pnr-engine guest-profile group-bookings cancellation-policy negotiated-rates; do
  cd /home/ubuntu/repos/tourismpay/gds-standalone/services/$svc && go build -o /dev/null .
done

# Rust services (both must pass cargo check)
cd /home/ubuntu/repos/tourismpay/gds-standalone/services/queue-system && cargo check
cd /home/ubuntu/repos/tourismpay/gds-standalone/services/commission-engine && cargo check

# Python services (all 4 must parse without syntax errors)
for svc in content-mgmt revenue-mgmt discount-promo settlement-saga; do
  python3 -c "import ast; ast.parse(open('/home/ubuntu/repos/tourismpay/gds-standalone/services/$svc/main.py').read())"
done
```

### Nigeria-Focused Seed Data
Discount codes use Nigerian names (NAIJA15, LAGOS20, ABUJA10, FIRST5K, CORP25). Tax jurisdictions use NG-FED, NG-LAG, NG-FCT etc.

### Key API Test Patterns (PR #30+)
```bash
# PNR creation (field names: guest_name, contact_email)
curl -s -X POST http://localhost:8090/api/v1/gds/pnr \
  -H "Content-Type: application/json" \
  -d '{"guest_name":"Test Guest","contact_email":"guest@test.ng"}'

# Commission calculation (field names: booking_id, amount, currency, country_code, agent_tier)
curl -s -X POST http://localhost:8090/api/v1/gds/commission/calculate \
  -H "Content-Type: application/json" \
  -d '{"booking_id":"BK001","amount":100000,"currency":"NGN","country_code":"NG","agent_tier":"platinum"}'

# Tax calculation (field names: jurisdiction_code, amount)
curl -s -X POST http://localhost:8090/api/v1/gds/tax/calculate \
  -H "Content-Type: application/json" \
  -d '{"jurisdiction_code":"NG-FED","amount":200000}'

# Discount validation (field names: code, amount)
curl -s -X POST http://localhost:8090/api/v1/gds/discount/validate \
  -H "Content-Type: application/json" \
  -d '{"code":"NAIJA15","amount":50000}'

# Settlement saga (field names: booking_id, amount, country)
curl -s -X POST http://localhost:8090/api/v1/gds/settlement-saga/execute \
  -H "Content-Type: application/json" \
  -d '{"booking_id":"BK002","amount":50000,"country":"NG"}'

# Cancellation simulate (field names: policy_type, amount, days_before)
curl -s -X POST http://localhost:8090/api/v1/gds/cancellation/simulate \
  -H "Content-Type: application/json" \
  -d '{"policy_type":"moderate","amount":100000,"days_before":5}'

# Onboarding establishment (field names: name, type, country, contact_name, contact_email)
curl -s -X POST http://localhost:8090/api/v1/gds/onboarding/establishments \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Hotel","type":"hotel","country":"NG","contact_name":"Owner","contact_email":"owner@test.ng"}'
```

### Sidebar Navigation (PR #29+)
The sidebar uses **7 collapsible sections** with domain-specific names instead of a flat list. Each section has a toggle arrow.

| Section | Items |
|---------|-------|
| **Operations** | Overview, Property Search, Market Analytics |
| **Onboarding & Partners** | Establishment Setup, Property Portfolio, Field Agents, Travel Agents |
| **Booking & Inventory** | PNR Records, Reservations, Room Availability, Service Queues, Guest Profiles, Group Bookings |
| **Revenue & Pricing** | Yield Management, Negotiated Rates, Commission Splits, Promotions, Channel Distribution |
| **Financial Operations** | Settlement, Tax Compliance, Staff Tipping, Tax Remittance, Cancellation Policies |
| **Content & Loyalty** | Content Library, Loyalty Program |
| **Developer Tools** | API Usage & Metering, Testing Sandbox |

### Keycloak Auth Configuration
- Realm: `gds` (config.ts AUTH_ISSUER points to `http://localhost:8180/realms/gds`)
- JWKS URI: `http://localhost:8180/realms/gds/protocol/openid-connect/certs`
- 4 test users: admin@tourismpay.ng (gds_admin), agent@safaricom.ke (gds_agent), property@ekohotels.ng (gds_property_manager), api-client@external.com (gds_api_client)
- Dev mode: bypasses JWT verification (decodes without signature check)
- Production mode: verifies JWT signature against JWKS endpoint

### Production Infrastructure Endpoints
```bash
# Cascading health check
curl -s http://localhost:8090/health/deep | jq .

# Readiness probe
curl -s http://localhost:8090/health/ready | jq .

# Prometheus metrics
curl -s http://localhost:8090/metrics

# API versioning headers
curl -sI http://localhost:8090/api/v1/gds/search | grep -i x-api-

# Rate limit headers (default: 100 req/60s)
curl -sI http://localhost:8090/api/v1/gds/search | grep -i x-ratelimit

# 404 handler with traceId
curl -s http://localhost:8090/api/v1/gds/nonexistent | jq .
```

### Rate Limiting Gotcha
The default rate limit is 100 requests per 60-second window. If you're running rapid API tests (especially in a loop), you may exhaust the limit and get 429 responses. Wait 60 seconds for the window to reset, or reduce GDS_RATE_LIMIT_MAX env var for testing.

## Troubleshooting

- **Port already in use**: `fuser -k PORT/tcp` (not `lsof`, which may not be installed)
- **Go service exits immediately**: Usually a port conflict. Check with `fuser PORT/tcp`
- **auth.me returns null**: Check `.env` has `VITE_APP_ID` set (most common cause). Also check `JWT_SECRET` and that a user with matching `open_id` exists in DB.
- **Sidebar missing sections (e.g., "Africa GDS")**: User role is wrong. Verify with `auth.me` response. Admin role sees all sections. Create admin user with SQL if needed.
- **Onboarding redirect loop**: Set `onboarding_completed=true` on the test user.
- **Redis/OpenSearch warnings in logs**: These are non-fatal — app operates without them in dev mode.
- **`%VITE_ANALYTICS_ENDPOINT%` errors**: Harmless — analytics env vars not configured in dev.
- **GDS vitest tests failing on persistence**: Ensure `GDS_DATABASE_URL` env var is set to `postgresql://postgres:postgres@localhost:5432/tourismpay` — the vitest.config.ts sets this automatically but CI environments may need it explicit.
- **Availability route returns 400**: Requires `property_id` query parameter. Use `/api/v1/gds/availability/room-types` for a param-free test.
- **Kafka/Redis connection errors in logs**: Non-fatal. Gateway degrades gracefully. Both are optional in dev mode.
