# TourismPay — Tourism Payment Platform for Africa

A full-stack tourism payment PWA designed for African markets with multi-currency wallets, QR payments, merchant onboarding, and compliance features.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Tailwind CSS 4, Radix UI, Recharts |
| Backend | Express, tRPC 11, Drizzle ORM |
| Database | PostgreSQL |
| Payments | Stripe Connect |
| Auth | JWT (jose), OAuth |
| PWA | Vite PWA (Workbox) |
| Ancillary | Go settlement service, Python ML services |

## Quick Start

```bash
# Prerequisites: Node.js 20+, pnpm 10+, PostgreSQL 16
cp .env.example .env          # configure DATABASE_URL, STRIPE keys, etc.
pnpm install
pnpm run db:push
pnpm run dev                  # http://localhost:3000
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm run dev` | Start dev server (hot-reload) |
| `pnpm run build` | Production build (Vite + esbuild) |
| `pnpm run start` | Run production server |
| `pnpm run check` | TypeScript type checking |
| `pnpm run test` | Run tests (Vitest) |
| `pnpm run format` | Format code (Prettier) |
| `pnpm run db:push` | Generate + run Drizzle migrations |

## Project Structure

```
├── client/                  # React PWA frontend
│   ├── src/
│   │   ├── components/      # Shared UI components
│   │   ├── pages/           # Route pages
│   │   │   ├── admin/       # Admin panel, KYB review, audit logs
│   │   │   ├── merchant/    # Revenue, products, bookings, payouts
│   │   │   ├── tourist/     # Onboarding, itinerary, catalog
│   │   │   ├── bis/         # Business Inspection System
│   │   │   ├── paymentswitch/ # Payment switch portal
│   │   │   ├── tier1-3/     # Feature tiers (biometric, wallet, mesh, etc.)
│   │   │   └── settings/    # User settings
│   │   ├── hooks/           # Custom React hooks
│   │   ├── contexts/        # React contexts (theme)
│   │   └── lib/             # Utilities (tRPC client, PDF export)
│   └── public/              # Static assets, PWA icons, service worker
├── server/                  # Express + tRPC backend
│   ├── _core/               # Server bootstrap, auth, env, email, stripe, etc.
│   ├── routers/             # tRPC route handlers (~50 routers)
│   ├── jobs/                # Background cron jobs
│   └── ha/                  # HA config stubs (Kafka, Redis, Temporal, etc.)
├── drizzle/                 # Database schema + migrations (62 migrations)
├── shared/                  # Shared types and constants
├── go-settlement-service/   # Go-based settlement & ledger service
├── python-services/         # Python ML services (BIS AI, fraud, FX, PDF)
├── scripts/                 # Seed scripts, demo token generation
├── infra/                   # Infrastructure config (HA setup)
└── patches/                 # pnpm patches
```

## Key Features

### Tourist
- Digital wallet (multi-currency), QR code payments
- Trip itinerary builder, booking & deal discovery
- AI concierge chatbot, sustainability tracking

### Merchant
- Product/service catalog, QR code generation
- Revenue analytics, staff management, payout scheduling
- Booking management, KYB onboarding, Stripe Connect

### Admin
- KYB application review, BIS management
- User management (role-based), settlement console
- Exchange rate management, NOC dashboard, audit logs

## License

MIT
