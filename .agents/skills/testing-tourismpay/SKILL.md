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
# Expected: 87 tests pass (health, auth, wallet, bis, middleware, backend persistence)
```

### Graceful Degradation
All middleware (Redis, Kafka, Keycloak, Permify, Mojaloop) is optional. The app works without them:
- Redis unavailable -> in-memory rate limiting fallback
- Kafka unavailable -> events silently dropped (`.catch(() => {})`)
- Keycloak unavailable -> dev JWT mode
- Mojaloop unavailable -> simulation mode

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

## Permify Authorization Testing

Permify uses a role-based fallback matrix when `PERMIFY_URL` is not set (the common case in dev).

### Owner User Role Fix (PR #35+)
Previously, `sdk.ts:authenticateRequest()` called `upsertUser()` on every request, which force-reset the owner's role to "admin" via `db.ts:131-133`. This is now fixed — `touchUserSignIn()` only updates `lastSignedIn` and `loginCount` without touching `role`. You can now test role enforcement with ANY user, including the owner.

### Testing Permify Role Enforcement
1. **Create a tourist user** (see "Creating Test Users with Specific Roles" above)
2. **Test denial** — tourist lacks `system:edit`, `settlement:execute`:
```bash
# Get CSRF token first
curl -s -c /tmp/tourist-cookies.txt -b "app_session_id=${TOURIST_TOKEN}" \
  "http://localhost:3000/api/trpc/auth.me" > /dev/null
CSRF=$(grep csrf-token /tmp/tourist-cookies.txt | awk '{print $NF}')

# Attempt kill switch activation — should get FORBIDDEN
curl -s -b "app_session_id=${TOURIST_TOKEN}; csrf-token=${CSRF}" \
  -H "X-CSRF-Token: ${CSRF}" -H "Content-Type: application/json" \
  -X POST "http://localhost:3000/api/trpc/nocDashboard.activateKillSwitch" \
  -d '{"json":{"switchId":"test","reason":"test"}}'
# Expected: {"error":{"json":{"data":{"code":"FORBIDDEN"}}}}
```

**Note**: Some procedures (nocProcedure, bisProcedure, etc.) have their own role checks that fire BEFORE the Permify `requirePermission()` call. For example, `nocProcedure` blocks non-admin/non-noc_operator users at the tRPC middleware level. The result is still FORBIDDEN but the error message may differ.

### Role Permission Matrix (from `server/_core/permify.ts`)
- `admin`: ALL permissions (wallet, establishment, investigation, settlement, system, report, payment, identity, loyalty)
- `merchant`: wallet:view, establishment:view/edit, settlement:view, report:view, payment:view/create, loyalty:view
- `tourist`: wallet:view/create, establishment:view, report:view, payment:view/create, identity:view/create, loyalty:view/create
- `bis_analyst`: investigation:*, establishment:view, report:*
- `noc_operator`: system:*, wallet:view, settlement:view, report:view

### Permify-Protected Routes (PR #35+)
| Router | Mutation | Resource | Action |
|--------|----------|----------|--------|
| localPayments | pay | PAYMENT | CREATE |
| foreignTouristLoading | wireInitiate | PAYMENT | CREATE |
| identity | createDid | IDENTITY | CREATE |
| nocDashboard | activateKillSwitch | SYSTEM | EDIT |
| settlement | approve/reject | SETTLEMENT | EXECUTE |
| bis | create/updateStatus | INVESTIGATION | CREATE/EDIT |
| kyb | review | ESTABLISHMENT | APPROVE |
| wallet | send/swap | WALLET | EDIT |
| taxCollection | markRemitted | SYSTEM | EXECUTE |

### Kafka Audit Middleware (PR #35+)
The `kafkaAudit` middleware in `trpc.ts` fires on ALL mutations automatically. It's chained on all 10 procedure types (protectedProcedure, adminProcedure, settlementProcedure, bisProcedure, nocProcedure, kybProcedure, complianceProcedure, taxProcedure, merchantProcedure, touristProcedure). To verify:
```bash
grep -c "\.use(kafkaAudit)" server/_core/trpc.ts
# Expected: 10
```
When Kafka is not running, events are silently dropped via `.catch(() => {})`. The middleware doesn't log failures by default — check `publishAuditEvent` in kafka.ts which logs `[Kafka] Cannot publish` when the producer is unavailable.

### Redis Caching (PR #35+)
Stats routes use `cacheGet`/`cacheSet` with TTL:
- `settlement.stats`: 30s TTL
- `bis.stats`: 30s TTL  
- `kyb.stats`: 30s TTL
- `loyalty.rewards`: 60s TTL

When Redis is not running, `cacheGet()` returns null and queries fall through to PostgreSQL. This is tested via graceful degradation — verify stats routes return data without Redis.

## Backend Service DB Persistence Verification

To verify Go/Rust/Python services have real DB persistence (not in-memory):

```bash
# Source audit: all Go services should have database.DB refs and internal/database import
for f in go-settlement-service/internal/services/{agent_banking,bank_partner,bank_transfer_out,cbdc,crypto,offline_nfc,onramp_offramp,swift_wire,tax_engine,tipping_service,ussd_menu,virtual_card,bill_payment,multi_tip_service}.go; do
  name=$(basename $f .go)
  db_refs=$(grep -c "database.DB" $f)
  import_ok=$(grep -c "internal/database" $f)
  echo "$name: db_refs=$db_refs, import=$import_ok"
done
# All should show db_refs>=2, import=1

# Vitest verification suite (87 tests)
npx vitest run --reporter=verbose
```

### Adversarial Kill-Restart Test (THE key test for DB persistence)

This is the most important test for any PR claiming to replace in-memory with DB. It proves `Get*`/`List*` methods read from PostgreSQL, not empty maps.

```bash
# 1. Start Go service
cd go-settlement-service
PORT=8081 DATABASE_URL="postgres://tourismpay_user:testpass123@localhost:5432/tourismpay_settlement" \
JWT_SECRET=tourismpay-test-jwt-secret-for-dev-32chars SETTLEMENT_API_KEY=test-settlement-key go run . &
sleep 4

# 2. Insert test data directly via SQL (bypassing the service)
PGPASSWORD=testpass123 psql -h localhost -U tourismpay_user -d tourismpay_settlement -c "
INSERT INTO crypto_transactions (id, user_id, tx_type, amount, token, chain, status, created_at)
VALUES ('test-wallet-kill', 'user-kill', 'wallet_created', 0, 'NGN', 'fiat', 'completed', NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO bank_transfers (id, user_id, beneficiary_name, bank_code, account_number, amount, currency, reference, status, created_at)
VALUES ('xfer-kill', 'user-kill', 'Test', 'gtbank', '0123456789', 50000, 'NGN', 'REF-KILL', 'completed', NOW())
ON CONFLICT (id) DO NOTHING;"

# 3. Kill the service (SIGKILL = crash, no graceful shutdown)
kill -9 $(fuser 8081/tcp 2>/dev/null | awk '{print $1}')
sleep 1

# 4. Restart with fresh process (all in-memory maps are empty)
PORT=8081 DATABASE_URL="postgres://tourismpay_user:testpass123@localhost:5432/tourismpay_settlement" \
JWT_SECRET=tourismpay-test-jwt-secret-for-dev-32chars SETTLEMENT_API_KEY=test-settlement-key go run . &
sleep 4

# 5. Query the API — if reads come from DB, data is returned; if from maps, it's empty/null
curl -s -H "X-API-Key: test-settlement-key" http://localhost:8081/api/v1/crypto/wallets/test-wallet-kill
# Expected: {"wallet_id":"test-wallet-kill","user_id":"user-kill",...}
# If broken (still in-memory): null or 404

curl -s -H "X-API-Key: test-settlement-key" http://localhost:8081/api/v1/bank-partner/xfer-kill
# Expected: {"id":"xfer-kill","provider":"gtbank","source_amount":50000,...}
# If broken: null or 404
```

**Key insight:** The `bank_transfers` table requires `account_number` (NOT NULL). Always include it in test inserts.

### Struct Audit for Removed Map Fields

After removing in-memory maps from Go service structs, verify no map reads remain:

```bash
# These should ALL return 0 matches (fields were removed from structs)
grep -c 's\.wallets\[' go-settlement-service/internal/services/crypto.go       # 0
grep -c 's\.ibans\[' go-settlement-service/internal/services/bank_partner.go    # 0
grep -c 's\.vouchers\[' go-settlement-service/internal/services/offline_nfc.go  # 0
grep -c 's\.onrampOrders\[' go-settlement-service/internal/services/onramp_offramp.go  # 0
grep -c 's\.offrampReqs\[' go-settlement-service/internal/services/onramp_offramp.go   # 0
grep -c 's\.pendingSwaps\[' go-settlement-service/internal/services/crypto.go   # 0

# These are ACCEPTABLE (transient/reference data):
# s.sessions[ in ussd_menu.go — transient 5-min session cache (also written to DB)
# s.agents[ in agent_banking.go — seed reference data
# s.transfers[ in mojaloop.go/tigerbeetle.go — separate services, out of scope
```

### Rust NFC Persistence Audit

```bash
# Verify HashMap/RwLock removed from nfc_payment.rs
grep -c 'std::collections::HashMap' rust-kyc-service/src/nfc_payment.rs  # 0
grep -c 'std::sync::RwLock' rust-kyc-service/src/nfc_payment.rs          # 0
grep -c 'sqlx::PgPool' rust-kyc-service/src/nfc_payment.rs               # 1 (import)

# Verify NfcTokenStore holds PgPool
sed -n '/pub struct NfcTokenStore/,/^}/p' rust-kyc-service/src/nfc_payment.rs
# Expected: pub pool: PgPool

# Verify sqlx queries exist (INSERT, SELECT, UPDATE)
grep -c 'sqlx::query' rust-kyc-service/src/nfc_payment.rs  # >= 3
```

### SQL Injection Audit

```bash
# Check for sql.raw (injectable) — should be 0 across all routers
grep -c 'sql\.raw' server/routers/*.ts

# Fixed in PR #37: crypto.go countFromDB() now uses parameterized $1
# Verify: grep -c "tx_type=\$1" go-settlement-service/internal/services/crypto.go  # >= 1
# The 2 remaining tx_type='...' matches are hardcoded literals in prepared statements (safe)
```

### Kill-Restart Tests for All 4 Core Go Services (PR #37+)

After PR #37, inventory, settlement, mojaloop, and tigerbeetle all read from DB. Use these targeted kill-restart patterns:

```bash
# --- Inventory ---
PGPASSWORD=testpass123 psql -h localhost -U tourismpay_user -d tourismpay_settlement -c "
INSERT INTO inventory_items (item_id, provider_id, item_type, name, available_quantity, reserved_quantity, price, currency, last_synced, sync_source)
VALUES ('test-inv-kill', 'provider-kill', 'accommodation', 'Kill Test Hotel', 10, 0, 15000, 'NGN', NOW(), 'manual')
ON CONFLICT (item_id) DO NOTHING;"
curl -s -H "X-API-Key: test-settlement-key" http://localhost:8081/api/v1/inventory/test-inv-kill
# Expected: 200 with {"item_id":"test-inv-kill","name":"Kill Test Hotel",...}

# --- TigerBeetle Ledger ---
# Account ID must match SHA256("TOURIST_WALLET:kill-test-user:USD") first 8 bytes as uint64
ACCOUNT_ID=$(python3 -c "import hashlib,struct; print(struct.unpack('>Q',hashlib.sha256(b'TOURIST_WALLET:kill-test-user:USD').digest()[:8])[0])")
PGPASSWORD=testpass123 psql -h localhost -U tourismpay_user -d tourismpay_settlement -c "
INSERT INTO ledger_accounts (id, entity_type, entity_id, currency, credits_posted, ledger_code, account_code, flags)
VALUES ($ACCOUNT_ID, 'TOURIST_WALLET', 'kill-test-user', 'USD', 5000000, 1, 840, 1)
ON CONFLICT (id) DO UPDATE SET credits_posted = 5000000;"
# GetAccountBalance handler uses c.Param() — path params match Gin route:
curl -s -H "X-API-Key: test-settlement-key" "http://localhost:8081/api/v1/ledger/accounts/TOURIST_WALLET/kill-test-user/USD"
# Expected: {"available":5000000,"pending":0,"total":5000000}

# --- Settlement Batch ---
# Column is 'id' not 'batch_id'
PGPASSWORD=testpass123 psql -h localhost -U tourismpay_user -d tourismpay_settlement -c "
INSERT INTO settlement_batches (id, provider_id, settlement_date, transaction_count, total_amount, fee_amount, net_amount, currency, status)
VALUES ('batch-kill-test', 'provider-kill', '2026-06-18', 5, 75000, 2500, 72500, 'NGN', 'pending')
ON CONFLICT (id) DO NOTHING;"
curl -s -H "X-API-Key: test-settlement-key" http://localhost:8081/api/v1/settlement/batches/batch-kill-test
# Expected: 200 with {"batch_id":"batch-kill-test","net_amount":72500,...}
```

**Gotchas:**
- `lsof` may not be installed — use `fuser -k 8081/tcp` to kill by port
- `GetAccountBalance` handler uses `c.Param()` for path params — use path `/api/v1/ledger/accounts/:entity_type/:entity_id/:currency`
- `settlement_batches` primary key column is `id`, not `batch_id`
- `mojaloop_quotes` and `mojaloop_settlement_windows` tables exist but have no GET-by-ID handler — verify via source audit instead of API

### Rust biometric_pay DB Pattern (PR #37+)

```bash
# Verify tokio::spawn removed (was fire-and-forget)
grep -c 'tokio::spawn' rust-kyc-service/src/biometric_pay.rs  # 0
# Verify synchronous DB writes
grep -c 'block_in_place' rust-kyc-service/src/biometric_pay.rs  # >= 3
# Verify startup hydration from DB
grep -c 'hydrate_from_db' rust-kyc-service/src/biometric_pay.rs  # >= 1
```

### Dockerfile & Docker Compose Verification

When verifying Docker build fixes, these patterns catch common issues:

```bash
# 1. Verify production CMD uses pre-built bundle (not tsx/ts-node devDeps)
grep "CMD" Dockerfile
# Expected: CMD ["node", "dist/index.js"] — NOT tsx or ts-node
# Verify dist/index.js exists and is >100KB (real bundle)
ls -la dist/index.js

# 2. Verify no COPY references outside build context
grep -c "COPY \.\." python-services/Dockerfile  # should be 0
# Docker COPY cannot access files outside the build context

# 3. Verify docker-compose build contexts align with Dockerfiles
# Parse each service's context + dockerfile — the dockerfile path
# must be relative to the context, and COPY paths in the Dockerfile
# must reference files within the context
grep -A5 "build:" docker-compose.yml | grep -E "context:|dockerfile:"

# 4. Verify production image doesn't need source files
# The Dockerfile should NOT COPY server/ or shared/ if esbuild bundles them into dist/
grep -E "COPY.*server|COPY.*shared" Dockerfile  # should be 0 for bundled apps

# 5. Test the actual production bundle runs without devDeps
node dist/index.js  # Should NOT fail with "Cannot find module 'tsx'"
curl http://localhost:3000/health  # Should return HTTP 200
```

**Key insight:** A common deployment bug is the Dockerfile CMD referencing a dev-only transpiler (tsx, ts-node) that isn't in the production image. Always verify CMD uses pre-built artifacts.

### Python requirements.txt Completeness Audit

```bash
# AST-based import audit (more reliable than grep)
python3 -c "
import os, ast
external = set()
stdlib = {'os','sys','json','asyncio','typing','datetime','pathlib','uuid',
  'hashlib','hmac','base64','time','re','io','logging','collections','enum',
  'dataclasses','abc','functools','math','random','secrets','copy','itertools'}
for root, _, files in os.walk('python-services'):
    for f in files:
        if f.endswith('.py'):
            try:
                tree = ast.parse(open(os.path.join(root,f)).read())
                for n in ast.walk(tree):
                    if isinstance(n, ast.Import):
                        for a in n.names:
                            t = a.name.split('.')[0]
                            if t not in stdlib: external.add(t)
                    elif isinstance(n, ast.ImportFrom) and n.module and n.level==0:
                        t = n.module.split('.')[0]
                        if t not in stdlib: external.add(t)
            except: pass
print(f'External imports: {len(external)}')
for i in sorted(external): print(f'  {i}')
"
# Cross-reference output against requirements.txt
# Common false positives: local modules, import-name != pip-name
# (cv2→opencv-python, PIL→pillow, sklearn→scikit-learn)
```

### Cache-Busting / HTTP Header Verification

Cache headers only apply in **production mode** (`serveStatic()` in `vite.ts`), NOT in dev mode (`setupVite()`). To test:

```bash
# Build + start in production mode
pnpm run build
NODE_ENV=production node dist/index.js &
sleep 3

# Verify index.html gets no-cache (should see: no-cache, no-store, must-revalidate)
curl -sI http://localhost:3000/ | grep -E "Cache-Control|Pragma|Expires"

# Verify hashed JS assets get immutable (should see: max-age=31536000, immutable)
curl -sI http://localhost:3000/assets/$(ls dist/public/assets/*.js | head -1 | xargs basename) | grep Cache-Control

# Verify sw.js gets no-cache
curl -sI http://localhost:3000/sw.js | grep -E "Cache-Control|Pragma|Expires"

# Verify SPA fallback routes also get no-cache
curl -sI http://localhost:3000/any/spa/route | grep Cache-Control

# Kill server when done
fuser -k 3000/tcp
```

**Key assertions:**
- HTML + sw.js → `Cache-Control: no-cache, no-store, must-revalidate` + `Pragma: no-cache` + `Expires: 0`
- Hashed assets (`.js`, `.css`) → `Cache-Control: public, max-age=31536000, immutable`
- Meta tags in `client/index.html` → `http-equiv="Cache-Control"`, `Pragma`, `Expires` (before `<title>`)
- SW: `CACHE_VERSION` dynamic (not hardcoded), `updateViaCache: 'none'` on registration, `CACHE_PURGED` message on activate

## Mobile API Alias Testing

When testing mobile-backend endpoint alignment (procedure-name aliases), use this pattern to verify all mobile endpoints resolve:

```bash
# 1. Extract all mobile endpoint names from api.ts
grep -oP 'request<[^>]*>\("([^"]+)"' mobile/src/services/api.ts | sed 's/.*"//;s/".*//' | sort

# 2. Extract all appRouter procedure paths
# The appRouter keys are in server/routers.ts — each top-level key is a namespace.
# Each router file exports procedures. Combine namespace + procedure = endpoint path.

# 3. Cross-reference: for each mobile endpoint, verify it exists in the backend
# Start the dev server, then curl each endpoint:
curl -s -b /tmp/cookies.txt "http://localhost:3000/api/trpc/NAMESPACE.PROCEDURE" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('OK' if 'result' in d else 'FAIL')"

# 4. For mutations, remember CSRF:
curl -s -c /tmp/cookies.txt -b /tmp/cookies.txt "http://localhost:3000/api/trpc/auth.me" > /dev/null
CSRF=$(grep csrf-token /tmp/cookies.txt | awk '{print $NF}')
curl -s -b /tmp/cookies.txt -b "csrf-token=$CSRF" \
  -H "X-CSRF-Token: $CSRF" -H "Content-Type: application/json" \
  -X POST "http://localhost:3000/api/trpc/NAMESPACE.PROCEDURE" \
  -d '{"json":{...}}'
```

**Key gotchas:**
- Mobile uses standardized names (`getBalances`, `getProducts`, `getRevenue`) but backend originally used shorter names (`balances`, `list`, `summary`). Aliases bridge this gap.
- tRPC HTTP accepts both GET and POST for queries, so mobile using `method: "POST"` for queries works fine.
- When a procedure returns NOT_FOUND with `path: "namespace.procedure"` in the stack trace, the procedure itself resolved — it's a business logic error (e.g., product ID doesn't exist). A namespace-level NOT_FOUND means the router key doesn't exist in `appRouter`.
- The `mobileAggregates.ts` file contains unified routers (`merchant`, `tourist`, `paymentSwitch`, `bookings`) that aggregate procedures from multiple sub-routers under mobile-friendly namespaces.

## TypeScript Module-Level Persistence Testing (PR #56+)

For testing Drizzle ORM persistence in TypeScript `_core/` modules, write a tsx script that imports functions directly:

```bash
# Create test-persistence.ts that imports module functions and pg for direct SQL
cat > test-persistence.ts << 'EOF'
import { purchasePolicy, getUserPolicies } from "./server/_core/parametricInsurance";
import pg from "pg";

const DB_URL = process.env.DATABASE_URL!;
async function directQuery(sql: string, params: any[] = []) {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  const res = await client.query(sql, params);
  await client.end();
  return res.rows;
}

async function main() {
  const userId = `test-${Date.now()}`;
  const policy = await purchasePolicy(userId, "trip-1", "flight_delay");
  const dbRows = await directQuery("SELECT * FROM insurance_policies WHERE id = $1", [policy.id]);
  console.log(dbRows.length === 1 ? "PASS" : "FAIL", `DB write: ${dbRows.length} rows`);
  const policies = await getUserPolicies(userId);
  console.log(policies.find(p => p.id === policy.id) ? "PASS" : "FAIL", "DB read");
}
main().catch(e => { console.error(e); process.exit(1); });
EOF

# Run with DATABASE_URL
DATABASE_URL="postgresql://tourismpay_user:testpass123@localhost:5432/tourismpay" \
KAFKAJS_NO_PARTITIONER_WARNING=1 npx tsx test-persistence.ts
```

**Critical: Table schema must match Drizzle schema exactly.** If tables were created manually (e.g., via SQL instead of `drizzle-kit push`), column names/types may not match. The Drizzle schema is the source of truth — compare `drizzle/schema.ts` definitions against `\d tablename` output. Common mismatches:
- `loyalty_balances`: Drizzle uses `user_id` as primary key (no separate `id`), `tourismpay_credits` (not `balance`), `partner_balances` JSONB, `total_value_usd` NUMERIC
- `social_posts`: Drizzle uses `media` JSONB (not `media_urls`), `verified` BOOLEAN, `transaction_id` TEXT, `merchant_id` TEXT
- `data_export_requests`: Drizzle uses `expires_at` (not `data_size`)

**Install `pg` if needed:** `pnpm add -D pg` — it's not a default dependency but needed for direct SQL verification.

**Suppress noise:** Set `KAFKAJS_NO_PARTITIONER_WARNING=1` to suppress Kafka warnings when Kafka isn't running.

## Troubleshooting

- **Port already in use**: `fuser -k PORT/tcp` (not `lsof`, which may not be installed)
- **Go service exits immediately**: Usually a port conflict. Check with `fuser PORT/tcp`
- **auth.me returns null**: Check `.env` has `VITE_APP_ID` set (most common cause). Also check `JWT_SECRET` and that a user with matching `open_id` exists in DB.
- **Sidebar missing sections (e.g., "Africa GDS")**: User role is wrong. Verify with `auth.me` response. Admin role sees all sections. Create admin user with SQL if needed.
- **Onboarding redirect loop**: Set `onboarding_completed=true` on the test user.
- **Redis/OpenSearch warnings in logs**: These are non-fatal — app operates without them in dev mode.
- **`%VITE_ANALYTICS_ENDPOINT%` errors**: Harmless — analytics env vars not configured in dev.
- **Availability route returns 400**: Requires `property_id` query parameter. Use `/api/v1/gds/availability/room-types` for a param-free test.
- **Kafka/Redis connection errors in logs**: Non-fatal. Gateway degrades gracefully. Both are optional in dev mode.
- **CSRF token mismatch on mutations**: Must make a GET request first to set `csrf-token` cookie, then include it as `X-CSRF-Token` header on POST requests.
