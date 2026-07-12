---
name: testing-tourismpay
description: Test TourismPay full-stack application end-to-end. Covers TypeScript frontend/backend, Go settlement service, Rust KYC, and Python ML services. Use when verifying production-readiness, code quality, or service integration.
---

# Testing TourismPay

## Overview
TourismPay is a multi-service app: TypeScript (React + tRPC), Go (Gin settlement service), Rust (KYC service), Python (FastAPI ML services). All share a PostgreSQL database.

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

**Port auto-selection:** If port 3000 is busy, the server automatically selects port 3001 and logs `Port 3000 is busy, using port 3001 instead`. Always check server output for the actual port.

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

### Creating Test Users with Specific Roles
The dev session-token endpoint only creates sessions for the owner user. To test other roles (tourist, merchant, etc.), generate a JWT directly:

```bash
# Create user in DB
PGPASSWORD=testpass123 psql -h localhost -p 5432 -U tourismpay_user -d tourismpay -c "
INSERT INTO users (name, email, role, open_id, onboarding_completed)
VALUES ('Tourist Tester', 'tourist@test.ng', 'tourist', 'test-tourist-id', true)
ON CONFLICT (open_id) DO UPDATE SET role='tourist', onboarding_completed=true;"

# Generate JWT using jose (the lib used by sdk.ts)
TOURIST_TOKEN=$(node -e "
const { SignJWT } = require('jose');
const secret = new TextEncoder().encode('tourismpay-test-jwt-secret-for-dev-32chars');
new SignJWT({ openId: 'test-tourist-id', name: 'Tourist Tester', appId: 'tourismpay' })
  .setProtectedHeader({ alg: 'HS256' })
  .setExpirationTime('1h')
  .sign(secret)
  .then(t => console.log(t));
" 2>/dev/null | tail -1)

# Use the token in curl
curl -s -b "app_session_id=${TOURIST_TOKEN}" "http://localhost:3000/api/trpc/auth.me"
```

### CSRF Token for Mutations
All tRPC mutations require a CSRF token. To get one:
```bash
# 1. Make a GET request to set the csrf-token cookie
curl -s -c /tmp/cookies.txt -b "app_session_id=${TOKEN}" "http://localhost:3000/api/trpc/auth.me" > /dev/null

# 2. Extract CSRF token
CSRF=$(grep csrf-token /tmp/cookies.txt | awk '{print $NF}')

# 3. Include in POST requests
curl -s -b "app_session_id=${TOKEN}; csrf-token=${CSRF}" \
  -H "X-CSRF-Token: ${CSRF}" \
  -H "Content-Type: application/json" \
  -X POST "http://localhost:3000/api/trpc/some.mutation" \
  -d '{"json":{...}}'
```

Without the CSRF token, mutations return `{"error":"CSRF token mismatch"}`.

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

### Fund Flow / Temporal Workflow Testing

**Important:** There is NO `fundFlow.startWorkflow` tRPC procedure. The actual fund flow procedures are:
- `fundFlow.crossBorderRemittance` — uses `startFundFlowWorkflow("remittance", ...)`
- `fundFlow.p2pTransfer` — uses `startFundFlowWorkflow("p2p", ...)`
- `fundFlow.merchantSettlement` — uses `startFundFlowWorkflow("settlement", ...)`
- `fundFlow.signalWorkflow` — signals an existing workflow (requires `system:execute` permission)

Each procedure has its own Zod input schema. Check the router file for exact field names:
```bash
grep -A20 "crossBorderRemittance:" server/routers/fundFlow.ts | head -25
```

**Verifying Temporal workflows actually fire:**
1. Start the dev server
2. Call a fund flow mutation (e.g., `crossBorderRemittance`)
3. Check server logs for: `[Temporal] Starting <type> workflow: wf-<type>-<timestamp>-<random>`

The workflow may fail downstream (e.g., ledger query fails because TigerBeetle/Redis isn't running), but the log line proves the Temporal integration is wired correctly.

### Kafka Schema Registry Testing

Use `npx tsx -e` (not `node -e`) to test TypeScript modules directly:
```bash
cd /home/ubuntu/repos/tourismpay
npx tsx -e "
const { validateMessage } = require('./server/_core/kafkaSchemaRegistry');
// Valid message
const r1 = validateMessage('tourismpay.remittances', {
  transferId: 'txn-001', eventType: 'initiated', amount: 100,
  currency: 'USD', timestamp: new Date().toISOString(),
  senderId: 'u1', recipientId: 'u2', corridor: 'US-NG'
});
console.log('Valid:', JSON.stringify(r1));
// Missing required field
const r2 = validateMessage('tourismpay.remittances', { eventType: 'initiated' });
console.log('Missing field:', JSON.stringify(r2));
// Unknown topic (no schema = no validation)
const r3 = validateMessage('unknown.topic', { anything: true });
console.log('Unknown topic:', JSON.stringify(r3));
"
```

### Module Wiring Audit (Dead Code Detection)

To verify new modules are actually integrated (not just defined):
```bash
# Search for function CALLS (not definitions)
# A function is "wired" if it appears in a file that isn't its own definition file
grep -rn "registerMojaloopCallbackRoutes" server/ --include="*.ts" | grep -v "export"
grep -rn "initializeSchemaRegistry" server/ --include="*.ts" | grep -v "export"
grep -rn "startFundFlowWorkflow" server/ --include="*.ts" | grep -v "export function"
```

If a module has 0 call sites outside its own file, it's dead code — structurally correct but never executed at runtime.

### Browser-Based UI Testing
For testing UI features (GDS pages, payment gateway, merchant dashboard):
1. Start dev server: `pnpm run dev` (port 3000 or 3001)
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
1. Server logs for `[Auth] Session payload missing required fields` -> VITE_APP_ID not set
2. Server logs for `[Auth] Session verification failed` -> JWT_SECRET mismatch
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
curl -s -w "%{http_code}" http://localhost:PORT/health      # -> 200 (unprotected)
curl -s http://localhost:PORT/api/v1/... -X POST             # -> 401 "Authorization required"
curl -s -H "X-API-Key: test-key-123" http://localhost:PORT/api/v1/...  # -> 200
curl -s -H "X-API-Key: wrong" http://localhost:PORT/api/v1/...         # -> 401 "Invalid API key"
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

## TourismPay Production Infrastructure

### Production Endpoints (port 3000)
```bash
# Cascading health check — probes pg, redis, kafka, tigerbeetle, mojaloop, keycloak
curl -s http://localhost:3000/health | python3 -m json.tool

# Readiness probe
curl -s http://localhost:3000/readyz
# Expected: {"status":"ready"}

# Prometheus metrics
curl -s http://localhost:3000/metrics | head -30
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

### Integration Test Suite
```bash
cd /home/ubuntu/repos/tourismpay
TEST_BASE_URL=http://localhost:3000 npx vitest run --reporter=verbose
# Expected: 87+ tests pass (health, auth, wallet, bis, middleware, backend persistence)
```

### Graceful Degradation
All middleware (Redis, Kafka, Keycloak, Permify, Mojaloop) is optional. The app works without them:
- Redis unavailable -> in-memory rate limiting fallback
- Kafka unavailable -> events silently dropped (`.catch(() => {})`)
- Keycloak unavailable -> dev JWT mode
- Mojaloop unavailable -> simulation mode

To verify: check `/health` — disconnected/not_configured statuses should NOT cause 500s on API routes.

### Permify Authorization / Permission Matrix

```
admin: wallet:*, establishment:*, investigation:*, settlement:*, system:view/edit, report:*, payment:*, identity:*, loyalty:*
merchant: wallet:view/execute, establishment:view/edit, settlement:view, report:view, payment:view/create/execute, loyalty:view/execute
tourist: wallet:view/create/execute, establishment:view, report:view, payment:view/create/execute, identity:view/create, loyalty:view/create/execute
bis_analyst: investigation:*, establishment:view, report:*
noc_operator: system:*, wallet:view, settlement:view, report:view
```

**Known gap:** Admin lacks `system:execute` — `signalWorkflow` returns FORBIDDEN for admin. This needs to be added to the fallback matrix.

### Kafka Audit Middleware
The `kafkaAudit` middleware in `trpc.ts` fires on ALL mutations automatically. It's chained on all 10 procedure types. When Kafka is not running, events are silently dropped.

## Mobile API Testing

### Procedure Names (Important!)
Mobile uses standardized names (`getBalances`, `getProducts`, `getRevenue`) but backend originally used shorter names (`balances`, `list`, `summary`). Aliases bridge this gap.

When testing mobile endpoints resolve correctly:
```bash
# Start dev server, authenticate, then test each endpoint
curl -s -b /tmp/cookies.txt "http://localhost:3000/api/trpc/wallet.getBalances" | python3 -c "
import sys,json; d=json.load(sys.stdin); print('OK' if 'result' in d else d.get('error',{}).get('json',{}).get('data',{}).get('code','UNKNOWN'))
"
```

**Key namespace routers (from `mobileAggregates.ts`):**
- `merchant.*` — aggregates merchantProducts, merchantRevenue, merchantAnalytics
- `tourist.*` — aggregates tourist discovery, bookings, rewards
- `paymentSwitch.*` — aggregates payment processing procedures
- `bookings.*` — aggregates booking CRUD

### Mobile Screen Wiring Verification
```bash
# Count screens using real API hook (should be 50+)
grep -rl "useApiData" mobile/src/screens/ | wc -l

# Verify no screens still show hardcoded "$0"
grep -rn '"\$0"' mobile/src/screens/ | grep -v "useApiData" | wc -l  # should be 0
```

## Dockerfile & Docker Compose Verification

```bash
# 1. Verify production CMD uses pre-built bundle (not tsx/ts-node devDeps)
grep "CMD" Dockerfile
# Expected: CMD ["node", "dist/index.js"] — NOT tsx or ts-node

# 2. Verify no COPY references outside build context
grep -c "COPY \.\." python-services/Dockerfile  # should be 0

# 3. Test the actual production bundle runs
node dist/index.js  # Should NOT fail with "Cannot find module 'tsx'"
curl http://localhost:3000/health  # Should return HTTP 200
```

## Troubleshooting

- **Port already in use**: `fuser -k PORT/tcp` (not `lsof`, which may not be installed)
- **Server uses port 3001**: If 3000 is busy, server auto-selects 3001. Check startup logs.
- **Go service exits immediately**: Usually a port conflict. Check with `fuser PORT/tcp`
- **auth.me returns null**: Check `.env` has `VITE_APP_ID` set (most common cause). Also check `JWT_SECRET` and that a user with matching `open_id` exists in DB.
- **Sidebar missing sections (e.g., "Africa GDS")**: User role is wrong. Verify with `auth.me` response.
- **Onboarding redirect loop**: Set `onboarding_completed=true` on the test user.
- **Redis/OpenSearch warnings in logs**: These are non-fatal — app operates without them in dev mode.
- **`%VITE_ANALYTICS_ENDPOINT%` errors**: Harmless — analytics env vars not configured in dev.
- **Kafka/Redis connection errors in logs**: Non-fatal. App degrades gracefully. Both are optional in dev mode.
- **CSRF token mismatch on mutations**: Must make a GET request first to set `csrf-token` cookie, then include it as `X-CSRF-Token` header on POST requests.
- **`fundFlow.startWorkflow` NOT_FOUND**: This procedure doesn't exist. Use `crossBorderRemittance`, `p2pTransfer`, `merchantSettlement` etc. which internally call `startFundFlowWorkflow`.
- **Drizzle `db.execute()` returns `[]`**: Raw SQL via `db.execute()` always returns empty array. Use `RETURNING` clause to get affected rows, then check `.length`.
- **`npx tsx -e` for testing TS modules**: Use `npx tsx -e` instead of `node -e` when importing TypeScript modules directly.
