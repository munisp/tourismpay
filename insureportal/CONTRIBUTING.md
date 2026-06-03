# Contributing to InsurePortal

## Getting Started

### Prerequisites
- Node.js 20+
- Go 1.21+
- Python 3.11+
- Docker & Docker Compose
- PostgreSQL 15+

### Setup
```bash
cd insureportal
npm install
cp .env.example .env  # Edit with your local credentials
npm run db:push       # Create database tables
npm run seed          # Populate with demo data
npm run dev           # Start development server
```

### Middleware (Docker Compose)
```bash
docker-compose -f infrastructure/docker-compose.staging.yml up -d
```
This starts: PostgreSQL, Redis, Kafka, Keycloak, Temporal, OpenSearch.

## Architecture

```
insureportal/
├── client/src/       # React frontend (430 pages)
│   ├── pages/        # Route-based page components
│   ├── components/   # Shared UI components
│   ├── hooks/        # Custom React hooks
│   └── store/        # Zustand state management
├── server/           # tRPC backend (449 routers)
│   ├── _core/        # Server bootstrap, tRPC setup
│   ├── routers/      # Domain-specific route handlers
│   ├── middleware/    # Auth, rate limiting
│   └── db.ts         # Database procedures
├── services/         # Polyglot microservices
│   ├── */main.go     # Go services
│   ├── */main.py     # Python services
│   └── */src/        # TypeScript/Rust services
├── shared/           # Shared types, schema, utilities
├── drizzle/          # Database schema & migrations
├── infrastructure/   # Helm, K8s, Docker, monitoring
└── docs/             # Architecture, deployment, API docs
```

## Development Workflow

### Frontend
- Framework: React 19 + TypeScript + Tailwind CSS 4
- Routing: wouter
- State: Zustand + React Query (TanStack)
- API: tRPC client
- UI: Radix UI + shadcn/ui patterns

### Backend
- API: tRPC v11 on Express
- DB: PostgreSQL via Drizzle ORM
- Auth: Keycloak OpenID Connect
- Queue: Kafka (kafkajs)
- Cache: Redis (ioredis)
- Workflow: Temporal

### Microservices
- **Go services**: `cd services/<name> && go build ./...`
- **Python services**: `cd services/<name> && python main.py`
- **TypeScript services**: Import from `services/<name>/src/index.ts`

## Testing
```bash
npm test              # Run all tests
npm run test:coverage # With coverage report
```

## Code Style
- TypeScript: Strict mode, no `any` (use `@ts-nocheck` only for legacy files)
- Go: Standard `go fmt` + `go vet`
- Python: PEP 8
- Commits: Conventional commits (`feat:`, `fix:`, `chore:`)

## NAICOM Compliance
All insurance features must comply with NAICOM regulations:
- Product codes: `NIC/<TYPE>/<YEAR>/<SEQ>` format
- Minimum capital requirements per license class
- Solvency margin calculations
- Quarterly return filing deadlines
- AML/CFT reporting thresholds (CBN ₦5M single / ₦10M cumulative)

## Environment Variables
See `.env.example` for all required variables. Key groups:
- `DATABASE_URL` — PostgreSQL connection
- `REDIS_URL` — Redis cache
- `KAFKA_BROKERS` — Kafka cluster
- `KEYCLOAK_*` — Auth configuration
- `SERVICE_DISCOVERY_HOST` — Microservice hostname (K8s DNS or localhost)
