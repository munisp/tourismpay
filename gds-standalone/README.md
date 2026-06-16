# Africa-first GDS — Standalone Deployment

A white-label Global Distribution System for African tourism properties. Deploy independently or alongside TourismPay.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      External Applications                          │
│   (Travel Agencies, OTAs, Tourism Boards, Fintech Platforms)        │
└─────────────────────────┬───────────────────────────────────────────┘
                          │  REST API / SDK / Webhooks
┌─────────────────────────▼───────────────────────────────────────────┐
│              APISIX API Gateway (port 9080)                          │
│   Routing • Rate Limiting • JWT Validation • CORS • Prometheus      │
├─────────────────────────────────────────────────────────────────────┤
│              OpenAppSec WAF                                          │
│   SQL Injection • XSS • SSRF • Bot Detection • API Abuse            │
├─────────────────────────────────────────────────────────────────────┤
│              Keycloak OIDC (port 8180)                               │
│   Agent Auth • Property Manager Auth • API Client Credentials       │
│   Multi-tenant Claims • Role-Based Access • Password Policy         │
├─────────────┬──────────────────┬────────────────────────────────────┤
│  Go Engine  │  Python Search   │  Python Analytics                  │
│  port 8080  │  port 8010       │  port 8011                         │
│ ─────────── │ ──────────────── │ ──────────────────                 │
│ Reservations│ OpenSearch       │ Lakehouse                          │
│ Settlement  │ ML Pricing       │ Revenue Forecast                   │
│ Distribution│ Recommendations  │ Market Intelligence                │
│ TigerBeetle │ Demand Forecast  │ Agent Performance                  │
│ Mojaloop    │                  │                                    │
├─────────────┴──────────────────┴────────────────────────────────────┤
│     Middleware: Kafka • Redis • PostgreSQL • Permify • Temporal      │
└─────────────────────────────────────────────────────────────────────┘
```

**Why APISIX + Keycloak + OpenAppSec (not Express):**
- **APISIX**: Purpose-built API gateway — native rate limiting, circuit breaker, load balancing, Prometheus metrics, plugin ecosystem (60+ plugins). No custom code needed for gateway concerns.
- **Keycloak**: Enterprise-grade identity server — OIDC/SAML, MFA, brute-force protection, realm isolation for multi-tenancy, admin console for user management.
- **OpenAppSec**: ML-powered WAF — protects against OWASP Top 10 without signature updates, learns API patterns, blocks zero-day attacks.

## Quick Start

```bash
# Start all services (APISIX + Keycloak + Go + Python + PostgreSQL + Redis + Kafka)
docker-compose up -d

# Wait for Keycloak to initialize (first boot takes ~30s)
docker-compose logs -f keycloak

# Health check (via APISIX)
curl http://localhost:9080/health

# Get access token from Keycloak
TOKEN=$(curl -s -X POST http://localhost:8180/realms/gds/protocol/openid-connect/token \
  -d "grant_type=client_credentials" \
  -d "client_id=gds-external-api" \
  -d "client_secret=your-client-secret" | jq -r .access_token)

# Search properties (authenticated)
curl -H "Authorization: Bearer $TOKEN" http://localhost:9080/api/v1/gds/search?destination=Masai+Mara

# Or use API Key (simpler for server-to-server)
curl -H "X-GDS-API-Key: gds_your_key_here" http://localhost:9080/api/v1/gds/properties
```

## Authentication

### 1. JWT Bearer Token (Keycloak OIDC)
Best for: Web/mobile apps, SPAs, user-facing applications.

```bash
# Agent login
curl -X POST http://localhost:8180/realms/gds/protocol/openid-connect/token \
  -d "grant_type=password" \
  -d "client_id=gds-agent-portal" \
  -d "username=agent@example.com" \
  -d "password=secret"

# Use the access_token
curl -H "Authorization: Bearer eyJ..." http://localhost:9080/api/v1/gds/properties
```

### 2. API Key (via APISIX key-auth plugin)
Best for: Server-to-server integrations, external platforms.

```bash
curl -H "X-GDS-API-Key: gds_abc123def456" http://localhost:9080/api/v1/gds/search
```

### 3. Client Credentials (OAuth2 M2M)
Best for: Backend services, automated systems.

```bash
TOKEN=$(curl -s -X POST http://localhost:8180/realms/gds/protocol/openid-connect/token \
  -d "grant_type=client_credentials" \
  -d "client_id=gds-external-api" \
  -d "client_secret=your-secret" | jq -r .access_token)
```

## Multi-Tenancy

Keycloak handles tenant isolation via JWT claims:
- Each tenant gets a `tenant_id` user attribute mapped to the access token
- APISIX passes the JWT to backend services which enforce tenant data isolation
- All database tables include `tenant_id` with indexes

```
Agent registers → Keycloak assigns tenant_id → JWT contains tenant_id
→ APISIX validates JWT → Go engine filters by tenant_id
```

## Rate Limiting (APISIX)

Per-route rate limits enforced at the gateway:

| Route | Limit | Window |
|-------|-------|--------|
| `/api/v1/gds/search` | 500 req | 60s |
| `/api/v1/gds/properties` | 100 req | 60s |
| `/api/v1/gds/reservations` | 50 req | 60s |
| `/api/v1/gds/availability` | 200 req | 60s |
| `/api/v1/gds/rates` | 200 req | 60s |
| `/api/v1/gds/settlement` | 20 req | 60s |

Response headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

## WAF Protection (OpenAppSec)

Automatically protects against:
- SQL Injection
- Cross-Site Scripting (XSS)
- Server-Side Request Forgery (SSRF)
- Command Injection
- Path Traversal
- XML External Entity (XXE)
- Insecure Deserialization
- Bot/scraper traffic (unless authenticated with API key)
- Excessive date range queries (DoS)

## SDK Usage (TypeScript)

```typescript
import { GDSClient } from "@tourismpay/gds-sdk";

const gds = new GDSClient({
  baseUrl: "https://gds.yourdomain.com",  // APISIX endpoint
  apiKey: "gds_your_api_key_here",
  tenantId: "your-org",
});

// Search
const results = await gds.search({ destination: "Serengeti", checkIn: "2025-07-01", checkOut: "2025-07-05" });

// Book
const booking = await gds.createReservation({ propertyId: "prop_xxx", ... });

// Commission
const commission = await gds.getCommission();

// Webhooks (event-driven)
await gds.registerWebhook({ url: "https://your-app.com/gds-events", events: ["reservation.created"] });
```

## API Endpoints

| Method | Path | Description | Rate Limit |
|--------|------|-------------|-----------|
| GET | `/health` | Health check (no auth) | — |
| GET | `/api/v1/gds/search` | Full-text property search | 500/min |
| GET | `/api/v1/gds/search/suggest` | Autocomplete | 500/min |
| GET | `/api/v1/gds/properties` | List properties | 100/min |
| POST | `/api/v1/gds/properties` | Register property | 100/min |
| GET | `/api/v1/gds/availability/check` | Check availability | 200/min |
| POST | `/api/v1/gds/reservations` | Create booking | 50/min |
| POST | `/api/v1/gds/reservations/:id/cancel` | Cancel booking | 50/min |
| POST | `/api/v1/gds/agents/register` | Register agent | 100/min |
| GET | `/api/v1/gds/agents/commission` | Commission summary | 100/min |
| GET | `/api/v1/gds/rates` | Get rates | 200/min |
| GET | `/api/v1/gds/rates/dynamic` | ML dynamic pricing | 200/min |
| POST | `/api/v1/gds/distribution/webhooks` | Register webhook | 100/min |
| GET | `/api/v1/gds/analytics/bookings` | Booking metrics | 100/min |
| GET | `/api/v1/gds/analytics/market` | Market intelligence | 100/min |

Full OpenAPI spec: `openapi.yaml`

## Environment Variables

| Variable | Default | Used By |
|----------|---------|---------|
| `GDS_DB_PASSWORD` | gds_pass | PostgreSQL |
| `APISIX_ADMIN_KEY` | (random) | APISIX admin API |
| `KEYCLOAK_ADMIN_PASSWORD` | admin | Keycloak console |
| `KEYCLOAK_GDS_CLIENT_SECRET` | (generated) | APISIX ↔ Keycloak |
| `GDS_CORS_ORIGINS` | localhost | APISIX CORS plugin |
| `TIGERBEETLE_ADDRESSES` | localhost:3000 | Go engine |
| `MOJALOOP_HUB_URL` | localhost:4000 | Go engine |

## White-Label Deployment

External organizations deploy their own branded GDS:

1. Fork this repo or use the Docker images
2. Configure `gds-realm.json` with your Keycloak branding
3. Set `GDS_CORS_ORIGINS` to your domain
4. Customize the frontend (`frontend/src/App.tsx` — brand name, colors, logo)
5. `docker-compose up -d`

## Integration with External Applications

| Use Case | Integration Method |
|----------|-------------------|
| Travel agencies | API Key + REST API |
| OTA platforms | Client Credentials + Webhooks |
| Tourism boards | Keycloak service account + bulk API |
| Hotel chains | Property manager portal (Keycloak login) |
| Fintech platforms | SDK + settlement webhooks |
| Mobile apps | Keycloak PKCE flow + SDK |

## Supported Countries (20)

KE (Kenya), ZA (South Africa), TZ (Tanzania), NG (Nigeria), GH (Ghana), RW (Rwanda), UG (Uganda), ET (Ethiopia), MA (Morocco), EG (Egypt), BW (Botswana), NA (Namibia), ZW (Zimbabwe), MU (Mauritius), MZ (Mozambique), SN (Senegal), CI (Ivory Coast), CM (Cameroon), TN (Tunisia), MG (Madagascar)
