# InsurePortal Architecture

## System Overview

InsurePortal is a comprehensive insurance technology platform built for the Nigerian market. It uses a microservices architecture with a React frontend, tRPC API layer, and polyglot backend services (Go, Python, TypeScript, Rust).

```
┌─────────────────────────────────────────────────────────────┐
│                    Client Layer                              │
│  React + Vite + Tailwind CSS 4 (PWA)                        │
│  469 pages · Customer/Agent/Admin/Underwriter portals       │
└───────────────────────┬─────────────────────────────────────┘
                        │ HTTPS / WebSocket
┌───────────────────────▼─────────────────────────────────────┐
│                 API Gateway (APISIX)                         │
│  Rate limiting · Auth routing · SSL termination              │
└───────────────────────┬─────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────┐
│               tRPC Application Server                        │
│  449 routers · Express · TypeScript                          │
│  Keycloak OIDC · Permify RBAC · OpenTelemetry               │
└───┬──────────┬──────────┬──────────┬───────────┬────────────┘
    │          │          │          │           │
    ▼          ▼          ▼          ▼           ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│Postgres│ │ Redis  │ │ Kafka  │ │Temporal│ │OpenSrch│
│  DB    │ │ Cache  │ │ Events │ │Workflow│ │  Logs  │
└────────┘ └────────┘ └────────┘ └────────┘ └────────┘
    ▲          ▲          ▲
    │          │          │
┌───┴──────────┴──────────┴───────────────────────────────────┐
│              Microservices Layer (55 services)                │
│                                                              │
│  Go (40):   Claims, Underwriting, Fraud, Policy Lifecycle,  │
│             Reinsurance, Settlement, KYC/KYB, NAICOM        │
│                                                              │
│  Python (5): AI Claims Engine, Fraud Detection Neural,      │
│              KYC/KYB System, Actuarial Analytics,           │
│              Document OCR                                    │
│                                                              │
│  TypeScript (2): Product Builder, Embedded SDK              │
│                                                              │
│  Rust (2): Parametric Engine, Blockchain Transparency       │
└─────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
insureportal/
├── client/                  # React frontend (Vite + Tailwind)
│   ├── src/
│   │   ├── components/      # Shared UI components
│   │   ├── pages/           # 469 page components
│   │   ├── hooks/           # Custom React hooks
│   │   ├── store/           # Zustand state management
│   │   └── lib/             # Utilities, tRPC client
│   ├── index.html           # Entry point
│   └── public/              # Static assets, PWA manifest
├── server/                  # tRPC backend
│   ├── routers/             # 449 tRPC routers
│   ├── middleware/          # Auth, rate limiting, audit
│   ├── _core/               # Core services (Keycloak, Vault, KYC)
│   ├── instrumentation.ts   # OpenTelemetry setup
│   ├── db.ts                # Drizzle ORM database connection
│   └── seed-comprehensive.mjs # Seed data script
├── services/                # Polyglot microservices
│   ├── claims-adjudication-engine/  # Go
│   ├── underwriting-engine/         # Go
│   ├── fraud-detection-go/          # Go
│   ├── ai-claims-engine/            # Python
│   ├── product-builder/             # TypeScript
│   └── ... (55 total)
├── shared/                  # Shared Go packages
│   ├── auth/                # Keycloak + Permify clients
│   ├── config/              # Service configuration
│   ├── database/            # Postgres + Redis clients
│   └── events/              # Kafka event schemas
├── drizzle/                 # Database schema + migrations
│   ├── schema.ts            # 176 tables (Drizzle ORM)
│   ├── relations.ts         # Table relationships
│   └── 0000-0042*.sql       # 42 migration files
├── infrastructure/          # Deployment configs
│   ├── helm/                # Helm charts (2)
│   ├── monitoring/          # Prometheus + Grafana
│   ├── logging/             # Fluentd + OpenSearch
│   └── deploy/              # Docker Compose (staging)
├── tests/                   # Test suites
│   ├── routers/             # 11 router test files
│   └── integration/         # Service integration tests
├── e2e/                     # Playwright E2E tests
│   ├── playwright.config.ts
│   └── tests/
├── docs/                    # Documentation
└── .env.example             # Environment variable reference
```

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | React 19, Vite, Tailwind CSS 4 | PWA with offline support |
| API | tRPC v11, Express | Type-safe RPC |
| Database | PostgreSQL + Drizzle ORM | 176 tables, typed queries |
| Cache | Redis | Session, rate limiting, hot data |
| Events | Apache Kafka | Async event processing |
| Workflows | Temporal | Long-running business processes |
| Search | OpenSearch | Full-text search, log aggregation |
| Auth | Keycloak (OIDC) | SSO, MFA, federation |
| AuthZ | Permify | Fine-grained RBAC/ABAC |
| Secrets | HashiCorp Vault | Secret management |
| Metrics | Prometheus + Grafana | Observability dashboards |
| Tracing | OpenTelemetry + OTLP | Distributed tracing |
| Gateway | Apache APISIX | Rate limiting, routing |
| Containers | Docker + Kubernetes | Orchestration |
| CI/CD | GitHub Actions | Build, test, deploy |

## Data Flow

### Policy Issuance
```
Agent → Frontend → tRPC Router → Underwriting Engine (Go)
                                  → Risk Assessment
                                  → Premium Calculation
                                  → Policy Lifecycle Service (Go)
                                  → Database (policy record)
                                  → Kafka (policy.created event)
                                  → Notification Service (Go)
```

### Claims Processing
```
Policyholder → Frontend → tRPC Router → Claims Adjudication Engine (Go)
                                         → Fraud Detection (Go/Python)
                                         → AI Claims Engine (Python)
                                         → Auto-adjudication decision
                                         → Settlement Service (Go)
                                         → Kafka (claim.processed event)
```

### Regulatory Reporting
```
Scheduled Job → Temporal Workflow → NAICOM Compliance Module (Go)
                                    → Database (aggregate data)
                                    → Generate NAICOM returns
                                    → CBN Reporting Router
                                    → Audit Trail System (Go)
```

## Security Architecture

- **Authentication**: Keycloak OIDC with MFA support
- **Authorization**: Permify for role-based and attribute-based access control
- **Secrets**: HashiCorp Vault for all sensitive configuration
- **Network**: Kubernetes NetworkPolicies isolate service communication
- **Data**: NDPR/NDPA compliant data handling with encryption at rest
- **Scanning**: SAST (Semgrep), secret scanning, dependency audit, license compliance in CI

## Deployment

See [deployment documentation](docs/DEPLOYMENT.md) for detailed instructions.

- **Staging**: Docker Compose with full middleware stack
- **Production**: Kubernetes (Helm charts) with managed services
- **CI/CD**: GitHub Actions with 58-job pipeline (50 Go builds + security scans)
