# TourismPay — Tourism Payment Platform for Africa

A production-grade, full-stack tourism payment platform designed for African markets with offline-first resilience, multi-currency support, and comprehensive compliance features.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        API Gateway (APISIX)                     │
├───────────┬───────────┬───────────┬───────────┬─────────────────┤
│  PWA      │ React     │ Flutter   │           │                 │
│  (React)  │ Native    │ Mobile    │ USSD/SMS  │  Admin Portal   │
├───────────┴───────────┴───────────┴───────────┴─────────────────┤
│                    tRPC API Layer (TypeScript)                   │
├─────────┬──────────┬──────────┬──────────┬──────────────────────┤
│ PBAC    │ Rate     │ Crypto   │ Offline  │                      │
│ Engine  │ Limiter  │ Engine   │ Sync     │  Go Settlement       │
│ (Rust)  │ (Rust)   │ (Rust)   │ (Rust)   │  Service             │
├─────────┴──────────┴──────────┴──────────┴──────────────────────┤
│                   Python ML Services                            │
│  BIS AI │ Fraud ML │ Compliance │ FX ML │ PDF Generator         │
├─────────────────────────────────────────────────────────────────┤
│                    Middleware Layer                              │
│  Kafka │ Temporal │ Dapr │ Redis │ Keycloak │ Permify │ Fluvio │
├─────────────────────────────────────────────────────────────────┤
│  PostgreSQL  │  TigerBeetle  │  OpenSearch  │  Lakehouse        │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# Prerequisites: Node.js 20+, pnpm 10+, PostgreSQL 16
cp .env.example .env
pnpm install
pnpm run db:push
npx tsx scripts/seed-production.ts
pnpm run dev
```

### Docker (full stack)

```bash
docker compose up -d                          # Core services
docker compose --profile middleware up -d     # With middleware
```

## Services

| Service | Port | Language | Description |
|---------|------|----------|-------------|
| PWA/API | 3000 | TypeScript | Main application + tRPC API |
| Go Settlement | 8081 | Go | TigerBeetle ledger + Mojaloop |
| Python ML (BIS AI) | 8001 | Python | Business inspection AI |
| Python ML (Fraud) | 8002 | Python | Fraud detection ML |
| Python ML (Compliance) | 8003 | Python | Compliance risk engine |
| Python ML (FX) | 8004 | Python | Exchange rate ML |
| Python ML (PDF) | 8005 | Python | PDF report generator |
| PBAC Engine | 8090 | Rust | Policy-based access control |
| Rate Limiter | 8091 | Rust | Distributed rate limiting |
| Crypto Engine | 8092 | Rust | Key management & signing |
| Offline Sync | 8093 | Rust | Offline-first sync engine |

## Key Features

### Tourist Features
- Digital wallet with multi-currency support
- QR code payments at merchants
- Trip itinerary builder
- Cross-border remittance (Mojaloop)
- AI concierge chatbot
- Booking & deal discovery
- Sustainability tracking

### Merchant Features
- Product/service catalog management
- QR code generation for payments
- Revenue analytics & dashboards
- Staff management & invites
- Payout scheduling
- Booking management
- KYB onboarding

### Admin Features
- KYB application review
- BIS (Business Inspection System) management
- User management with role-based access
- Settlement console
- Exchange rate management
- NOC dashboard & kill switches
- Audit logs & compliance

### Security
- PBAC (Policy-Based Access Control) with Rust engine
- DDoS protection with adaptive rate limiting
- Anti-ransomware file validation
- Input sanitization (XSS, SQL injection)
- Security headers (CSP, HSTS, X-Frame-Options)
- Biometric authentication
- 2FA with TOTP
- Webhook signature verification (HMAC-SHA256)
- Key rotation & crypto engine

### Offline Resilience
- CRDT-inspired vector clock sync
- Bandwidth-adaptive behavior (2G → 5G)
- USSD text interface for zero-bandwidth
- SMS transaction confirmations
- Delta sync for minimal data transfer
- Service Worker pre-caching
- SQLite offline queue (mobile)
- Automatic conflict resolution

### Middleware
- **Kafka**: Event streaming for transactions, fraud alerts, audit logs
- **Temporal**: Long-running workflow orchestration (KYB, settlement, remittance)
- **Dapr**: Service mesh with mTLS, circuit breakers
- **Redis**: Caching, sessions, rate limiting
- **Keycloak**: Identity & access management
- **Permify**: Fine-grained authorization
- **OpenSearch**: Full-text search & analytics
- **TigerBeetle**: Double-entry accounting
- **APISIX**: API gateway with plugins
- **Fluvio**: Real-time data streaming
- **Lakehouse**: Data lake analytics

## Development

```bash
pnpm run dev          # Start dev server (port 3000)
pnpm run check        # TypeScript type checking
pnpm run test         # Run tests
pnpm run build        # Production build
pnpm run format       # Format code
```

### Demo Accounts
- **Tourist**: GET `/api/dev/demo-tourist-login`
- **Merchant**: GET `/api/dev/demo-merchant-login`
- **Admin**: GET `/api/demo-login?role=admin`

## Mobile Apps

### React Native (Expo)
```bash
cd mobile-react-native
npm install
npx expo start
```

### Flutter
```bash
cd flutter-mobile
flutter pub get
flutter run
```

## Testing

```bash
# Smoke test all services
./scripts/smoke-test.sh

# Unit tests
pnpm run test

# Type checking
pnpm run check
```
