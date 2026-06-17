# Africa GDS Platform — Standalone

A standalone Global Distribution System for African hospitality, integrated with TourismPay via REST API.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    GDS Platform (Port 4000)              │
│                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ React Client│  │ Express/tRPC │  │ Go Service    │  │
│  │ (Port 4001) │──│ Server       │  │ (Port 4002)   │  │
│  └─────────────┘  └──────┬───────┘  └───────────────┘  │
│                           │          ┌───────────────┐  │
│                           │          │ Python ML     │  │
│                           │          │ (Port 4003)   │  │
│                           │          └───────────────┘  │
└───────────────────────────┼─────────────────────────────┘
                            │ REST API Calls
                            ▼
              ┌──────────────────────────┐
              │  TourismPay (Port 3000)  │
              │  - Tax Calculation       │
              │  - Tipping Processing    │
              │  - Loyalty Points        │
              │  - Trip Planner          │
              │  - Remittance            │
              └──────────────────────────┘
```

## Quick Start

```bash
# Install dependencies
cd gds-platform
npm install

# Start GDS server (port 4000)
npm run dev

# Start GDS client (port 4001, proxies API to 4000)
npm run dev:client

# Start Go microservice (optional, port 4002)
cd go-service && go run main.go

# Start Python ML service (optional, port 4003)
cd python-service && pip install -r requirements.txt && python main.py
```

## Services

| Service | Port | Tech | Purpose |
|---------|------|------|---------|
| GDS Server | 4000 | Express/tRPC | Main API, auth, routing |
| GDS Client | 4001 | React/Vite | Dashboard UI |
| Go Service | 4002 | Go | Tax calculation, tipping engine |
| Python ML | 4003 | FastAPI | Demand forecasting, recommendations |
| TourismPay | 3000 | (external) | Upstream API integration |

## Features

- **15 African Tax Jurisdictions** — compound taxation, per-authority remittance
- **Multi-Recipient Staff Tipping** — role-based suggestions per property type
- **Loyalty Points** — 15 pts/USD, tier × property × booking multipliers
- **Trip Planner → GDS** — natural language itinerary → real reservations
- **Budget Comparison** — 3-tier cost analysis with tax overlay
- **RBAC** — gds_admin, revenue_manager, property_manager, gds_agent, front_desk
- **Government Tax Remittance** — auto-batch, compliance scoring

## API Integration

The GDS platform calls TourismPay's REST API for all financial operations:

```typescript
// Example: Calculate tax for a booking in Nigeria
const tax = await tourismPayClient.tax.calculate("NG", 500, "USD", "accommodation");
// → { totalTax: 87.50, grandTotal: 587.50, effectiveRate: 17.5, components: [...] }

// Example: Process multi-recipient tip
const tip = await tourismPayClient.tipping.process({
  reservationId: "res_123",
  totalAmount: 5000,
  currency: "NGN",
  recipients: [{ staffRole: "guide", percentage: 60 }, { staffRole: "driver", percentage: 40 }],
  splitMode: "custom_percent"
});
```

## Dev Accounts

| Email | Password | Role |
|-------|----------|------|
| admin@gds.tourismpay.com | gds123 | gds_admin |
| revenue@gds.tourismpay.com | gds123 | revenue_manager |
| agent@safarilink.co.ke | gds123 | gds_agent |
| manager@ekohotels.ng | gds123 | property_manager |

## Environment Variables

See `.env.example` for all configuration options.
