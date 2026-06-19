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

## Nigeria Demo Seed Script Testing (PR #39-40)

### Running the Nigeria Demo Seed Script
```bash
cd /home/ubuntu/repos/tourismpay
OWNER_OPEN_ID=test-owner-id \
DATABASE_URL="postgresql://tourismpay_user:testpass123@localhost:5432/tourismpay" \
node scripts/seed-nigeria-demo.mjs
```

### Timestamp Unit Mismatch (Critical Gotcha)
Different tables use different timestamp units:
- **Seconds (integer columns):** `wallet_balances`, `wallet_transactions`, `loyalty_accounts`, `loyalty_transactions` — use `Math.floor(Date.now() / 1000)`
- **Milliseconds (bigint columns):** `ps_settlements`, `ps_participants`, `noc_events`, `remittances`, `rate_alerts`, `exchange_rate_overrides` — use `Date.now()`

If pages show empty data despite rows existing in the DB, check whether the seed script used the wrong timestamp unit. Server routers filter with `Date.now()` (milliseconds) for payment-switch tables, so seeding in seconds produces timestamps that look like 1970 dates to the server.

### Owner User Data Linkage (Critical Gotcha)
Most pages filter by `ctx.user.id` (the authenticated user's DB id). If you seed data linked to a different user than the one logged in, pages will render empty even though the DB has data.

- The `OWNER_OPEN_ID` env var (default: `test-owner-id`) controls which user gets demo access
- The seed script must create wallet balances, loyalty accounts, remittances, and establishment ownership records linked to the owner user's DB id
- Verify with: `curl -s -b /tmp/cookies.txt "http://localhost:3000/api/trpc/wallet.balances?input=%7B%22json%22%3Anull%7D"` — should return non-empty array

### Browser Testing the Demo Pages
Navigate to each page as the admin owner user. Key pages and expected data:

| Page | Route | Expected |
|------|-------|----------|
| Dashboard | `/` | 16 establishments, 10 BIS, fraud alerts, NG in country list |
| Wallet | `/wallet` | NGN 2,450,000 + USD 3,200 + EUR 1,500, 20+ transactions |
| Loyalty | `/loyalty` | GOLD tier, 4,200 points, 6 Nigerian rewards |
| Merchant Revenue | `/merchant/revenue` | 3 establishments (Nike Art Gallery, Mama Cass, Eko Hotel) |
| Fraud Monitor | `/security/fraud` | 20 alerts with NGN amounts and NG country codes |
| BIS Dashboard | `/bis` | 10 investigations with Nigerian entity names |
| Integration Overview | `/integration-overview` | PS shows "(External API)" subtitle, BIS/PS/TourismPay modules |

### Known Display Issues
- **PaymentSwitch routes are 404:** After PR #41, all `/paymentswitch/*` routes were removed. PS is now an external API integration — use `/integration-overview` to verify PS status instead
- **Merchant Revenue $0:** The revenue page queries a separate merchant payment/booking table, not wallet transactions. Establishments render but revenue stats show $0 unless merchant-specific payments are seeded

### Verifying Seed Data via API (without browser)
```bash
# Get session cookie
curl -s -c /tmp/cookies.txt "http://localhost:3000/api/dev/session-token?redirect=/"

# Wallet balances (should show NGN, USD, EUR)
curl -s -b /tmp/cookies.txt "http://localhost:3000/api/trpc/wallet.balances?input=%7B%22json%22%3Anull%7D"

# Loyalty account (should show GOLD tier)
curl -s -b /tmp/cookies.txt "http://localhost:3000/api/trpc/loyalty.account?input=%7B%22json%22%3Anull%7D"

# Dashboard real data (txVolume from wallet_transactions, countryBreakdown from establishments)
curl -s -b /tmp/cookies.txt "http://localhost:3000/api/trpc/africa.txVolume?input=%7B%22json%22%3Anull%7D"
curl -s -b /tmp/cookies.txt "http://localhost:3000/api/trpc/africa.countryBreakdown?input=%7B%22json%22%3Anull%7D"

# BIS investigations (should show 10)
curl -s -b /tmp/cookies.txt "http://localhost:3000/api/trpc/bis.list?input=%7B%22json%22%3A%7B%22page%22%3A1%2C%22limit%22%3A20%7D%7D"
```

## ML/AI Stack Testing (PR #42+)

### Overview
The ML stack lives in `python-services/ml-platform/` with 4 trained PyTorch models, a DuckDB feature store, NetworkX/Neo4j graph analyzer, and a continuous training pipeline. All testing is **shell-based** (no browser/GUI) — do NOT record.

### Model Checkpoints
Trained model weights are stored in `python-services/ml-platform/training/checkpoints/`:
```
fraud_gnn/best_model.pt       — GraphSAGE, 9,009 params
fx_forecaster/best_model.pt   — BiLSTM+Attention, 270,664 params
anomaly_detector/best_model.pt — VAE, 29,912 params
risk_scorer/best_model.pt     — Multi-task MLP, 125,605 params
```

Each checkpoint contains: `model_state_dict`, `config`, `optimizer_state_dict`, plus model-specific keys (`threshold`, `scaler_mean`, `scaler_scale` for anomaly/risk).

### Running the ML Test Suite
```bash
cd /home/ubuntu/repos/tourismpay/python-services/ml-platform
python3 -m tests.test_models
# Expected: 24/24 passed
```

### Loading Models for Manual Testing
```python
import torch, sys
sys.path.insert(0, 'python-services/ml-platform')

# Load any model
from models.fraud_gnn.model import build_model
ckpt = torch.load('python-services/ml-platform/training/checkpoints/fraud_gnn/best_model.pt',
                   weights_only=False, map_location='cpu')
model = build_model(ckpt.get('config'))
model.load_state_dict(ckpt['model_state_dict'])
model.eval()
```

### Adversarial Inference Pattern
To prove models do real computation (not hardcoded returns), feed different inputs and verify different outputs:
```python
# Anomaly Detector — most discriminative model
x_normal = torch.zeros(10, 24) + 0.3
x_outlier = torch.ones(10, 24) * 50.0
s_normal = vae.anomaly_score(x_normal)    # ~10.8
s_outlier = vae.anomaly_score(x_outlier)  # ~58,621
assert s_outlier.mean() > s_normal.mean() * 100  # orders of magnitude higher
```

### API Return Types (Gotchas)
- **GraphAnalyzer.compute_pagerank()** returns `list[dict]` with keys `entity_id`, `score` — NOT tuples
- **GraphAnalyzer.extract_node_features()** requires a `node_id` argument — it's per-node, not batch
- **RiskScorer.predict()** returns `{"risk_score": Tensor, "tier": list[str], "tier_probs": Tensor}`
- **detect_data_drift()** requires 3 args: `(current_data, reference_data, feature_cols)` — feature_cols is required
- **DuckDB user_features** table has specific columns (country, account_age_days, total_txn_count, fraud_alert_count, risk_score) — NOT generic feature_name/feature_value

### Service Integration Testing
Each Python service loads models at startup via `_load_trained_models()` or similar. To test integration without starting FastAPI:
```python
import sys
sys.path.insert(0, 'python-services')
sys.path.insert(0, 'python-services/ml-platform')

# Simulate fraud-ml-service model loading
from models.fraud_gnn.model import build_model as build_gnn
from models.anomaly_detector.model import build_model as build_vae
# Load both models, verify globals are not None
```

### Fallback Behavior Test
Rename a checkpoint file, verify the service's load function handles it gracefully (no exception, model stays None), then restore:
```bash
mv training/checkpoints/fraud_gnn/best_model.pt training/checkpoints/fraud_gnn/best_model.pt.bak
# Run load test — should see "model not found" log, no crash
mv training/checkpoints/fraud_gnn/best_model.pt.bak training/checkpoints/fraud_gnn/best_model.pt
```

### Continuous Training Drift Detection
```python
from training.continuous_training import detect_data_drift
import pandas as pd, numpy as np

# Identical distributions → PSI < 0.1, needs_retrain=False
ref = pd.DataFrame({'feat': np.random.normal(0, 1, 1000)})
cur = pd.DataFrame({'feat': np.random.normal(0, 1, 1000)})
result = detect_data_drift(cur, ref, feature_cols=['feat'])
assert result['needs_retrain'] == False

# Shifted distribution → PSI > 0.1, needs_retrain=True
shifted = pd.DataFrame({'feat': np.random.normal(5, 3, 1000)})
result = detect_data_drift(shifted, ref, feature_cols=['feat'])
assert result['needs_retrain'] == True
```

### Known Observations
- **Risk Scorer tier calibration**: Model trained on synthetic data may classify low-risk inputs as "critical" — the scaler normalization shifts thresholds. The relative ordering (high-risk > low-risk) holds, but absolute tier assignment needs recalibration on real data.
- **Fraud GNN limited differentiation**: Trained on small graph (37K edges), early stopping at epoch 1. Benign vs risky inputs produce very similar scores (~0.488 vs ~0.489). Would improve with more training data.
- **Neo4j not available in dev**: All graph tests use NetworkX fallback. Neo4j integration code is present but untested at runtime.
- **PageRank convergence**: With very small graphs (<5 nodes), NetworkX PageRank may fail to converge. Use >=10 nodes for reliable testing.

### Business Logic Testing (PR #43+)

When testing business logic fixes (swap rates, idempotency, validation, DB-driven configs):

**Swap Rate Verification:**
```bash
# Verify swap uses APPROX_USD_RATES cross-rate, NOT hardcoded rate=1.0
curl -s -b /tmp/cookies.txt "http://localhost:3000/api/trpc/wallet.getFxRate?input=%7B%22json%22%3A%7B%22fromCurrency%22%3A%22USD%22%2C%22toCurrency%22%3A%22NGN%22%2C%22amount%22%3A100%7D%7D"
# Expected: rate≈1538.46, effectiveRate≈1530.77, spread=0.005
# If broken (old bug): rate=1.0 — catastrophic financial loss
```

**Idempotency Testing (requires Redis):**
Idempotency features on `wallet.send`, `wallet.swap`, and `stablecoinSwap` use `cacheGet`/`cacheSet` from `server/_core/redis.ts`. When Redis is not running, `cacheGet` returns null and `cacheSet` is a no-op — idempotency is silently disabled. To runtime-test idempotency, Redis must be available. Without Redis, verify via source audit:
```bash
grep -n "idem:send:\|idem:swap:\|idem:stableswap:" server/routers/wallet.ts server/routers/stablecoinSwap.ts
# Each should have both cacheGet (entry) and cacheSet with 3600s TTL (exit)
```

**Split Bill Validation:**
```bash
# Custom split amounts must sum to totalAmount (±0.01 tolerance)
curl -s -b "app_session_id=${TOKEN}; csrf-token=${CSRF}" \
  -H "X-CSRF-Token: ${CSRF}" -H "Content-Type: application/json" \
  -X POST "http://localhost:3000/api/trpc/localPayments.splitBill.create" \
  -d '{"json":{"totalAmount":1000,"currency":"NGN","description":"test","splitType":"custom","participants":[{"name":"A","amount":400},{"name":"B","amount":400}]}}'
# Expected: BAD_REQUEST "Custom split amounts must sum to the total (1000). Got 800.00."
```

**DB-Driven Config Fallback (KNOWN ISSUE):**
`getTaxRulesForJurisdiction()` in `taxCollection.ts` queries `tax_rules` table WITHOUT try-catch on the primary query. If migration `0074_business_logic_fixes.sql` hasn't been applied, tax calculations fail with 500 instead of falling back to hardcoded `JURISDICTION_TAX_RULES`. The analogous `getTipConfigForJurisdiction()` in `tipping.ts` correctly has try-catch. This may be fixed in a future PR — check if the try-catch has been added before reporting it as a bug.

## KYC AI Engine Testing (PR #44+)

### Overview
The KYC AI engine lives in `python-services/kyc-ai-engine/` with 5 modules: OCR (PaddleOCR), VLM (Florence-2), Docling (business docs), Liveness (MediaPipe+MiniFAS+MiDaS), Face Matching (InsightFace/ArcFace). All testing is **shell-based** (no browser/GUI) — do NOT record.

### Dependencies
```bash
pip install opencv-python-headless scikit-image  # Required for VLM and liveness modules
# numpy and scipy should already be available
```

### Module Import Verification
```python
import sys
sys.path.insert(0, 'python-services/kyc-ai-engine')
from ocr.paddle_ocr import DocumentType, OCRResult, _parse_mrz_td3, _check_digit
from vlm.document_vlm import _detect_fraud_signals, FraudSignal
from docling_parser.business_docs import _extract_entity_from_text, _classify_business_doc, BusinessDocType
from liveness.detector import _detect_blink, _detect_smile, _lbp_texture_analysis, generate_challenge_sequence
from face_matching.matcher import _cosine_similarity, MatchResult
```

### MRZ Parsing (OCR Module)
TD3 passport MRZ lines must be **exactly 44 characters each**. Common mistake: 43 chars → parser returns empty fields with `valid=False`.
```python
# Valid TD3: 2 lines of 44 chars
line1 = 'P<GBRSMITH<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<<<'  # 44 chars
line2 = 'AB12345671GBR9001011M30123112345678901234560'  # 44 chars
mrz = _parse_mrz_td3([line1, line2])
# Returns: surname='SMITH', given_names='JOHN', document_number='AB1234567'
# NOTE: date_of_birth returns ISO format '1990-01-01' NOT raw MRZ '900101'
```

### Fraud Detection (VLM Module)
Scoring formula: `authenticity_score = 1.0 - len(signals) * 0.2`. Differentiation is in signal TYPE, not just score.
```python
import numpy as np
from vlm.document_vlm import _detect_fraud_signals
# Uniform gray → SUSPICIOUS_EDGES + DIGITAL_FORGERY + SCREEN_CAPTURE (score=0.4)
# Random noise → PHOTO_MANIPULATION (score=0.8)
# Different images produce different signal sets, proving real computation
```

### Blink Detection (Liveness Module)
`_detect_blink(landmarks)` returns `tuple[bool, float]` (NOT a dict). EAR threshold is 0.21.
```python
# Key: P1-P5 and P2-P4 landmark pairs must share X coordinate for accurate EAR
# Otherwise 3D distance includes horizontal component, inflating EAR
landmarks[33] = [0.0, 0.5, 0.0]     # P0 (outer corner)
landmarks[133] = [1.0, 0.5, 0.0]    # P3 (inner corner) — h=1.0
landmarks[160] = [0.3, 0.1, 0.0]    # P1 (upper) — same X as P5
landmarks[144] = [0.3, 0.9, 0.0]    # P5 (lower) — |P1-P5|=0.8
# Open eyes: EAR=0.8. Closed (Y gap=0.02): EAR=0.02
```

`_detect_smile(landmarks)` also returns `tuple[bool, float]`. Uses landmarks[61], [291], [13], [14], [39], [269].

### LBP Texture Analysis (Liveness Module)
```python
from liveness.detector import _lbp_texture_analysis
# Natural random texture: lbp_score≈0.4, Flat uniform: lbp_score≈0.09
# Flat triggers spoof_indicators: ["Low LBP entropy", "Low high-frequency content"]
```

### Face Matching Cosine Similarity
```python
from face_matching.matcher import _cosine_similarity
# Identical→1.0, Orthogonal→0.0, Similar→0.99, Opposite→-1.0
```

### Challenge Generation
```python
import asyncio
from liveness.detector import generate_challenge_sequence
easy = asyncio.run(generate_challenge_sequence("easy"))    # 2 challenges, 8000ms timeout
medium = asyncio.run(generate_challenge_sequence("medium")) # 3 challenges, 6000ms
hard = asyncio.run(generate_challenge_sequence("hard"))     # 4 challenges, 5000ms
# Each challenge has keys: type, instruction, timeout_ms, order
```

### Docling Entity Extraction
```python
from docling_parser.business_docs import _extract_entity_from_text, BusinessEntity
entity = _extract_entity_from_text("...CAC text with RC: 123456...")
# BusinessEntity fields: company_name, rc_number, tin_number, registration_date,
#   business_type, registered_address, nature_of_business, share_capital, directors, shareholders
# NOTE: 'incorporation_date' does NOT exist — use 'registration_date'
# NOTE: directors list may be empty when using regex fallback (without Docling library)
```

### Integration Compilation
```bash
cd rust-kyc-service && cargo check          # Should pass (ai_engine.rs compiles)
cd .. && npx tsc --noEmit                   # Should pass (kyc.ts + kyb.ts type-check)
python3 -m py_compile python-services/kyc-ai-engine/main.py  # All 6 modules
npx vitest run                               # 87/87 tests
```

### Known Observations
- **Model-dependent features untested in dev**: PaddleOCR, Florence-2, InsightFace, MediaPipe, MiniFAS, MiDaS all require model downloads (~5GB total). Code paths verified via py_compile but actual inference untested without models.
- **Directors extraction**: Regex fallback does not extract director names from CAC text. Needs Docling structured parser.
- **KYC AI Engine port**: Runs on port 8100 (configurable via `KYC_AI_PORT`). Rust service connects via `KYC_AI_ENGINE_URL` env var (default `http://localhost:8100`).

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
