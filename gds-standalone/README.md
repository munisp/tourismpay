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
│                 GDS API Gateway (TypeScript/Express)                 │
│              port 8090 — Auth, Rate Limit, Multi-Tenant             │
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
│           Middleware: Kafka • Redis • PostgreSQL                     │
│     Optional: Temporal • Keycloak • Permify • APISIX • Dapr        │
└─────────────────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# Start all services
docker-compose up -d

# Health check
curl http://localhost:8090/health

# Search properties
curl http://localhost:8090/api/v1/gds/search?destination=Masai+Mara

# Register as an agent
curl -X POST http://localhost:8090/api/v1/gds/agents/register \
  -H "Content-Type: application/json" \
  -d '{"agencyName":"SafariLink","agentName":"John","email":"john@safarilink.co.ke","country":"KE"}'
```

## Authentication

Two methods supported:

### API Key
```bash
curl -H "X-GDS-API-Key: gds_your_key_here" \
  http://localhost:8090/api/v1/gds/properties
```

### JWT Bearer (Keycloak / OIDC)
```bash
curl -H "Authorization: Bearer eyJ..." \
  http://localhost:8090/api/v1/gds/properties
```

## SDK Usage (TypeScript)

```typescript
import { GDSClient } from "@tourismpay/gds-sdk";

const gds = new GDSClient({
  baseUrl: "https://gds-api.tourismpay.com",
  apiKey: "gds_your_api_key_here",
  tenantId: "your-tenant-id", // for multi-tenant deployments
});

// Search African properties
const results = await gds.search({
  destination: "Masai Mara",
  checkIn: "2025-06-01",
  checkOut: "2025-06-05",
  guests: 2,
  propertyType: "safari_camp",
});

// Book a property
const booking = await gds.createReservation({
  propertyId: "prop_abc123",
  roomTypeCode: "DLX",
  checkIn: "2025-06-01",
  checkOut: "2025-06-05",
  guests: 2,
  guestName: "Jane Doe",
  guestEmail: "jane@example.com",
  guestCountry: "US",
});

// Track commissions
const commission = await gds.getCommission();

// Register for webhooks
await gds.registerWebhook({
  url: "https://your-app.com/webhooks/gds",
  events: ["reservation.created", "reservation.cancelled", "rate.updated"],
});
```

## Multi-Tenancy

Enable multi-tenant mode to allow multiple organizations to share one GDS deployment:

```env
GDS_MULTI_TENANT=true
GDS_DEFAULT_TENANT=default
```

Each tenant gets isolated:
- Properties and room types
- Agents and API keys
- Reservations and settlements
- Rate plans and availability
- Webhooks and distribution channels

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/api/v1/gds/search` | Full-text property search |
| GET | `/api/v1/gds/search/suggest` | Autocomplete destinations |
| GET | `/api/v1/gds/search/trending` | Trending destinations |
| GET | `/api/v1/gds/properties` | List properties |
| POST | `/api/v1/gds/properties` | Register property |
| GET | `/api/v1/gds/availability/check` | Check availability |
| POST | `/api/v1/gds/availability/bulk-check` | Bulk availability |
| POST | `/api/v1/gds/reservations` | Create booking |
| PATCH | `/api/v1/gds/reservations/:id` | Modify booking |
| POST | `/api/v1/gds/reservations/:id/cancel` | Cancel booking |
| POST | `/api/v1/gds/agents/register` | Register agent |
| GET | `/api/v1/gds/agents/commission` | Commission summary |
| GET | `/api/v1/gds/rates` | Get rates |
| GET | `/api/v1/gds/rates/dynamic` | ML dynamic pricing |
| POST | `/api/v1/gds/distribution/webhooks` | Register webhook |
| GET | `/api/v1/gds/analytics/bookings` | Booking metrics |
| GET | `/api/v1/gds/analytics/market` | Market intelligence |

Full OpenAPI spec: `openapi.yaml`

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GDS_PORT` | 8090 | Gateway port |
| `GDS_MULTI_TENANT` | false | Enable multi-tenancy |
| `GDS_DATABASE_URL` | postgresql://... | PostgreSQL connection |
| `GDS_REDIS_URL` | redis://... | Redis cache |
| `GDS_KAFKA_BROKERS` | localhost:9092 | Kafka brokers |
| `GDS_ENGINE_URL` | http://localhost:8080 | Go engine URL |
| `GDS_SEARCH_URL` | http://localhost:8010 | Python search URL |
| `GDS_ANALYTICS_URL` | http://localhost:8011 | Python analytics URL |
| `GDS_AUTH_ISSUER` | (Keycloak URL) | OIDC token issuer |
| `GDS_AUTH_JWKS_URI` | (JWKS URL) | JWT signing keys |
| `GDS_AUTH_API_KEY_ENABLED` | true | Enable API key auth |
| `GDS_BRAND_NAME` | Africa GDS | White-label name |
| `GDS_BRAND_PRIMARY_COLOR` | #6366f1 | Brand color |
| `GDS_CORS_ORIGINS` | localhost | Allowed origins |

## Supported Countries (20)

KE (Kenya), ZA (South Africa), TZ (Tanzania), NG (Nigeria), GH (Ghana), RW (Rwanda), UG (Uganda), ET (Ethiopia), MA (Morocco), EG (Egypt), BW (Botswana), NA (Namibia), ZW (Zimbabwe), MU (Mauritius), MZ (Mozambique), SN (Senegal), CI (Ivory Coast), CM (Cameroon), TN (Tunisia), MG (Madagascar)

## Integration with External Applications

### For Travel Agencies
Register as an agent, get an API key, search/book properties, earn tiered commissions (10-18%).

### For Tourism Boards
Register your country's properties in bulk, manage rates/availability, distribute to all connected agents.

### For OTA Startups
Use the SDK to embed African property search and booking into your app. Webhook notifications keep your system in sync.

### For Hotel Chains
Register multiple properties, manage rates centrally, monitor rate parity across distribution channels.

### For Fintech Platforms
Integrate settlement (TigerBeetle/Mojaloop) to process cross-border payments for tourism transactions.
