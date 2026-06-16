# TourismPay & Africa-First GDS
## The Complete Tourism Payment & Distribution Platform for Africa

---

# Slide 1: The Problem

### Africa's $200B Tourism Economy Has a Payment Crisis

- **70% of tourism revenue leaks offshore** through foreign OTAs, GDS platforms, and payment processors
- Sabre, Amadeus, and Expedia charge **3-8% commissions** that flow out of Africa
- Small safari operators, guesthouses, and tour guides are **excluded from global distribution** — they can't afford GDS fees
- **Mobile money is the #1 payment method** in Africa (M-Pesa, MTN, Airtel) — yet no major tourism platform supports it natively
- Tourists carry **USD/EUR cash** because digital payment infrastructure doesn't reach safari lodges, island resorts, or rural heritage sites
- **Cross-border payments between African countries** are slower and more expensive than sending money to Europe

> A tourist in Kenya paying a Tanzanian safari guide goes through SWIFT (2-5 days, $25+ fee).
> The same transaction on TourismPay settles in seconds for < 1%.

---

# Slide 2: The Solution — TourismPay

### Africa-Built. Africa-Owned. Africa-First.

TourismPay is a **full-stack tourism payment, compliance, and distribution platform** purpose-built for African tourism economies.

**Three pillars:**

1. **PAY** — Multi-currency digital wallets, CBDC bridges, offline NFC payments, cross-border mesh routing
2. **COMPLY** — KYB merchant onboarding, background investigations, AML screening, regulatory reporting
3. **DISTRIBUTE** — Africa-first GDS connecting properties directly to agents without Sabre/Amadeus middlemen

**The result:** Tourism revenue stays local. Merchants keep 97%+ of earnings. Tourists get seamless digital payments from booking to checkout.

---

# Slide 3: Who Benefits

| Stakeholder | Pain Today | TourismPay Solution |
|---|---|---|
| **Tourism Boards** | No visibility into spend data, can't enforce quality, revenue leaks offshore | Real-time analytics dashboard, compliance enforcement, local settlement |
| **African Diaspora** | Expensive remittances to family/businesses back home, can't easily book authentic African experiences | Low-cost mesh payments, direct booking with local operators, CBDC bridge |
| **International Travelers** | Cash-dependent in rural areas, no price transparency, overbooking risk | Digital wallet with offline NFC, transparent FX rates, verified merchants |
| **Merchants (Hotels/Safari/Tours)** | High OTA commissions (15-25%), slow payouts (30+ days), excluded from GDS | Direct distribution (2-5% fee), daily/weekly payouts, global visibility |
| **Travel Agents** | Sabre/Amadeus expensive, limited African inventory, no mobile money settlement | Africa-first GDS, tiered commissions (10-18%), local currency settlement |
| **Governments** | Tax leakage, informal tourism economy, no audit trail | KYB compliance, digital receipts, full audit log, regulatory exports |

---

# Slide 4: Platform Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        APISIX Gateway                           │
│              (Rate Limiting, Routing, SSL, Plugins)             │
├─────────────────────────────────────────────────────────────────┤
│                     OpenAppSec WAF                              │
│              (OWASP Top 10, Bot Protection, DDoS)               │
├──────────┬──────────┬──────────┬──────────┬─────────────────────┤
│  React   │  React   │   Go     │  Python  │   Rust              │
│  PWA     │  Native  │ Services │ Services │   Services           │
│  (50+    │  Mobile  │          │          │                     │
│  pages)  │  (89     │ Settle-  │ ML FX    │  Property           │
│          │  screens)│ ment,    │ Predict, │  Registry,          │
│          │          │ GDS,     │ Search,  │  Content            │
│          │          │ Channels,│ Analytics│  Aggregation,       │
│          │          │ NFC,     │ Carbon,  │  Rate Engine        │
│          │          │ CBDC     │ Fraud ML │                     │
├──────────┴──────────┴──────────┴──────────┴─────────────────────┤
│                    Middleware Layer                              │
│  Kafka · Redis · PostgreSQL · Keycloak · Permify · Temporal     │
│  TigerBeetle · Mojaloop · OpenSearch · Dapr · Fluvio · Lakehouse│
└─────────────────────────────────────────────────────────────────┘
```

**Languages:** TypeScript (frontend + API), Go (settlement + GDS engine), Rust (registry + rate engine), Python (ML + analytics)

---

# Slide 5: Feature Overview — Payment Infrastructure

### Multi-Currency Digital Wallet

| Feature | Detail |
|---|---|
| **11 Currencies** | USD, USDC, NGN, KES, GHS, ZAR, XLM, CBDC-NG (eNaira), CBDC-KE, CBDC-GH, CBDC-ZA |
| **Send/Receive** | Instant peer-to-peer with 0.1% fee, atomic DB transactions with row-level locking |
| **Currency Swap** | Real-time FX with 0.2-0.5% spread, AI-powered "Smart Convert" for optimal timing |
| **Deposit/Withdraw** | Bank transfer, Stripe, CBDC bridge |
| **Balance Alerts** | Configurable low-balance notifications, daily critical breach dedup |
| **Spending Limits** | Per-currency daily/monthly limits with admin override |
| **Sparklines** | 7-day visual balance trends on dashboard |
| **Transaction Export** | CSV/PDF export with date range, currency, and type filters |
| **QR Payments** | Generate and scan QR codes for instant merchant payments |
| **Scheduled Payments** | Recurring payments (daily/weekly/monthly) with auto-execution |

### Rate Limiting & Security
- Per-user velocity controls: 10 sends/min, 5 swaps/min
- Biometric verification required for high-value transactions (configurable threshold)
- Kill switch for emergency corridor blocking
- AES-256-GCM encryption on all PII

---

# Slide 6: Feature Overview — Offline & CBDC Payments

### Offline NFC Tap-to-Pay (Go Service)

**The Problem:** Safari lodges, island resorts, and heritage sites have no internet.

**The Solution:** Cryptographic offline payment vouchers:
1. Tourist pre-loads vouchers while online (Ed25519 signed)
2. Taps NFC at merchant point-of-sale — no internet required
3. Vouchers queue locally and settle via TigerBeetle when connectivity returns
4. Double-spend protection via voucher serial numbers + Temporal reconciliation

### CBDC Bridge (Go Service)

| Network | Currency | Status |
|---|---|---|
| **eNaira** (Nigeria) | NGN | Live integration |
| **eCedi** (Ghana) | GHS | Live integration |
| **Digital Rand** (South Africa) | ZAR | Sandbox |

- Cross-CBDC atomic swaps via Mojaloop ILP
- Ed25519 keypair wallets per user per network
- Real-time settlement (< 2 seconds)
- Transaction finality guaranteed by central bank ledger

---

# Slide 7: Feature Overview — Cross-Border Mesh Payments

### Pan-African Payment Corridors

| Corridor | Route | Fee |
|---|---|---|
| NG-GH | Nigeria → Ghana | 0.5% |
| KE-TZ | Kenya → Tanzania | 0.4% |
| ZA-ZW | South Africa → Zimbabwe | 0.6% |
| GH-CI | Ghana → Côte d'Ivoire | 0.5% |
| NG-KE | Nigeria → Kenya | 0.7% |
| EG-NG | Egypt → Nigeria | 0.6% |

**vs. Traditional:**
- SWIFT: 2-5 days, $25-50 per transfer
- Western Union: 5-8% fee
- **TourismPay Mesh: < 1 minute, 0.4-0.7% fee**

**How it works:**
- Wallet-to-wallet transfer across corridors
- Automatic FX conversion at live rates
- Settlement via TigerBeetle double-entry ledger
- Mojaloop ILP for interbank routing
- Full audit trail per transaction

---

# Slide 8: Feature Overview — Merchant Ecosystem

### 5-Step KYB Onboarding Wizard
1. **Business Identity** — Name, registration number (encrypted), establishment type (18 categories: hotel, safari, restaurant, tour operator, etc.)
2. **Ownership & Directors** — Beneficial owners, UBO declarations
3. **Financial Profile** — Bank details, revenue range, tax ID (encrypted)
4. **Compliance/AML** — Source of funds, PEP screening, sanctions check
5. **Final Review** — BIS background investigation auto-triggered

### Merchant Tools
| Tool | What It Does |
|---|---|
| **Revenue Dashboard** | Real-time earnings, daily/weekly/monthly breakdown, trend charts |
| **QR Code Generator** | Unique QR per product/service for tourist scan-to-pay |
| **Cashier Terminal** | POS interface for walk-in tourists |
| **Product Catalog** | Full CRUD + image upload (S3), variants, bulk CSV import |
| **Booking Manager** | Status machine: pending → confirmed → completed/cancelled |
| **Availability Calendar** | Per-date slot management, weekday rules, block dates |
| **Dynamic Pricing** | Demand-based, seasonal, time-based, bundle pricing rules |
| **Payout Scheduler** | Configurable daily/weekly/monthly settlements |
| **Staff Management** | Invite staff, assign roles, employee BIS checks |
| **KPI Leaderboard** | Performance rankings across merchants |
| **Deal Marketplace** | Flash deals and promotions for tourists |
| **Stripe Connect** | Express account onboarding for international card payments |

---

# Slide 9: Feature Overview — Tourist Experience

### Traveler Journey: Discover → Book → Pay → Review

| Stage | Feature |
|---|---|
| **Discover** | Browse verified establishments by category, location, rating |
| **Search** | OpenSearch-powered with filters (price, availability, type, country) |
| **Book** | Real-time availability check, instant confirmation, calendar integration |
| **Pay** | Wallet (11 currencies), QR scan, NFC offline, Stripe cards |
| **Receipt** | Digital receipt with QR verification code |
| **Itinerary** | AI-powered trip planning with multi-day itineraries |
| **Share** | Public shareable itinerary links for travel companions |
| **Review** | Post-trip feedback and ratings |

### AI Copilot
- Local LLM (Ollama) with cloud fallback
- "Plan my 7-day Kenya trip" → generates full itinerary with bookings
- Real-time language translation
- Local recommendations based on current location
- Budget optimization suggestions

### Sustainability & Carbon Offsets
- Automatic carbon footprint calculation per trip (flights, transport, accommodation)
- One-tap offset purchase from verified African projects:
  - Kariba REDD+ Forest Protection (Zimbabwe)
  - Kenya Wind Energy
  - Nigeria Clean Cookstoves
  - Tanzania Mangrove Restoration
  - Ghana Solar Mini-Grids
- Impact tracking dashboard with total CO₂ offset

---

# Slide 10: Feature Overview — Africa-First GDS

### The World's First GDS Built for African Tourism

**Why not just use Sabre/Amadeus?**
- They charge $2-5 per booking segment + annual fees
- Limited African property inventory (focused on chain hotels)
- Don't support mobile money, CBDCs, or local currencies
- No integration with African tourism boards
- Commission structures favor large OTAs over local agents

### TourismPay GDS Architecture

| Component | Technology | Function |
|---|---|---|
| **Reservation Engine** | Go | Property registry (20 African countries), slot availability, rate plans, booking state machine |
| **Distribution Engine** | Go | Push rates/availability to agents via API, webhooks, Kafka streaming |
| **Content Aggregation** | Rust | Bedbank connectors (Hotelbeds, WebBeds, Bonotel), tourism board feeds, rate parity monitoring |
| **Search & Discovery** | Python (FastAPI) | OpenSearch-powered, ML dynamic pricing, demand forecasting, recommendation engine |
| **Analytics** | Python | Lakehouse pipeline, ADR/RevPAR/occupancy, agent performance scoring, market intelligence |
| **Agent Portal** | TypeScript + React | Search, book, modify, cancel, commission dashboard |
| **Property Manager** | TypeScript + React | Rate plans, availability, distribution channel config |

### Agent Commission Tiers
| Tier | Bookings/Month | Commission |
|---|---|---|
| Bronze | 0-50 | 10% |
| Silver | 51-200 | 12% |
| Gold | 201-500 | 15% |
| Platinum | 500+ | 18% |

---

# Slide 11: Channel Manager — Global Distribution

### Bidirectional Sync with Major Platforms

| Platform | Integration | Direction |
|---|---|---|
| **Sabre** | SynXis hotel rates, OTA_HotelRatePlanNotif, OTA_HotelAvailNotif | Push rates + Pull bookings |
| **Amadeus** | Self-Service APIs — rates, availability, Hotel Booking | Push + Pull |
| **Expedia** | EPC Connectivity Partner API, occupancy-based pricing | Push + Pull |
| **Booking.com** | Connectivity Partner JSON API | Push + Pull |
| **Little Emperors** | Luxury flash-sale deals, member/rack rates | Push + Pull |
| **Travelport** | Universal API (Galileo/Apollo/Worldspan) | Push + Pull |

**How it works:**
- Go sync engine pushes rates/availability every 5 minutes
- Inbound bookings from any channel auto-create reservations in TourismPay
- Rate parity monitoring alerts merchants of pricing discrepancies
- Merchant configures channel mapping (room types → GDS codes)

**Result:** A small safari lodge in Maasai Mara appears on Expedia, Booking.com, and Sabre — without paying Sabre's annual fee. TourismPay handles the distribution.

---

# Slide 12: Standalone GDS — White-Label for External Apps

### GDS-as-a-Service for Any Platform

The GDS is deployable independently from TourismPay:

| Component | Access |
|---|---|
| **REST API** | OpenAPI 3.1 spec, API key + JWT auth via APISIX |
| **SDKs** | Python, TypeScript, Go — all published |
| **Developer Sandbox** | 10 pre-seeded properties, test payment cards, 10K free tokens |
| **Metered Billing** | Sandbox (free) → Starter ($49/mo) → Pro ($199/mo) → Enterprise ($999/mo) |
| **Multi-Tenant** | `tenant_id` isolation on all 12 tables |
| **Docker Compose** | 7-service stack: APISIX + Go + Python×2 + PostgreSQL + Redis + Kafka |

**Who can use it:**
- African tourism boards running their own booking portal
- Other fintech platforms serving travel agents
- Hotel chains (Serena, Mantis) as their distribution backbone
- OTA startups needing a booking engine without building from scratch

```python
from gds_client import GDSClient
with GDSClient(base_url="https://gds.yourdomain.com", api_key="gds_xxx") as gds:
    results = gds.search(destination="Masai Mara", check_in="2025-08-01")
    booking = gds.create_reservation(property_id="prop_001", ...)
```

---

# Slide 13: Security & Compliance

### Enterprise-Grade Security Stack

| Layer | Technology | Protection |
|---|---|---|
| **Gateway** | APISIX | Rate limiting (per-route, per-user), JWT validation, API key auth, circuit breaker |
| **WAF** | OpenAppSec | OWASP Top 10, anti-bot, SQL injection, XSS, SSRF |
| **Auth** | Keycloak | OIDC/OAuth2, MFA, brute-force protection, session management |
| **Authorization** | Permify | Relationship-based access control (ReBAC), maker-checker for settlements |
| **Data** | AES-256-GCM | All PII encrypted at rest (registration numbers, tax IDs, phone numbers) |
| **Transport** | TLS 1.3 | All inter-service communication encrypted |
| **Input** | Zod | 1,500+ validation calls across all tRPC endpoints |
| **Headers** | Helmet | CSP, HSTS, X-Frame-Options, X-Content-Type-Options |
| **CSRF** | Double-submit | Cookie + header token verification |
| **Cookies** | httpOnly + secure + sameSite | Session tokens immune to XSS theft |

### Compliance
- **KYB verification** — 5-step merchant onboarding with document upload
- **BIS investigations** — Automated background checks on all merchants and directors
- **AML screening** — PEP, sanctions, adverse media checks
- **Audit logging** — Every action logged with actor, timestamp, entity, before/after
- **Kill switch** — Emergency corridor blocking for high-risk transactions
- **Fraud ML** — Python ML service for anomaly detection and risk scoring
- **SAR generation** — Suspicious Activity Reports for regulatory submission

---

# Slide 14: How Payments Keep Earnings Local

### The Revenue Leakage Problem

```
TRADITIONAL FLOW (tourist pays $100 for safari):
Tourist → Expedia (25% commission) → Stripe (2.9%) → SWIFT ($25 fee) → Local bank
Merchant receives: ~$47  (53% leaked)

TOURISMPAY FLOW (tourist pays $100 for safari):
Tourist → TourismPay Wallet → TigerBeetle Ledger → Merchant Wallet
Merchant receives: ~$97  (3% platform fee, 0% offshore leakage)
```

### How TourismPay Keeps Money in Africa

| Mechanism | How It Works | Impact |
|---|---|---|
| **Local Settlement** | TigerBeetle double-entry ledger settles locally — no SWIFT, no correspondent banks | Eliminates $25+ per-transaction offshore fees |
| **Direct Distribution** | GDS connects merchants to agents directly — no Sabre/Amadeus middleman | Saves 3-8% GDS commission per booking |
| **Low OTA Commission** | 2-5% vs. Expedia's 15-25% | Merchant keeps 20%+ more per booking |
| **CBDC Bridge** | Settlements in eNaira/eCedi — central bank money, not commercial bank money | Zero conversion spread on local currency |
| **Mesh Payments** | Intra-African corridors at 0.4-0.7% vs. SWIFT 5-8% | Cross-border tourism payments stay affordable |
| **Mojaloop ILP** | Interoperable real-time settlement between African payment systems | Connects M-Pesa, MTN, Airtel without intermediaries |
| **Offline NFC** | No POS terminal rental, no Visa/Mastercard processing fees | Rural merchants accept digital payments at zero hardware cost |
| **Daily Payouts** | Configurable settlement frequency (daily/weekly/monthly) | Merchant cash flow improved vs. OTA 30-day holdbacks |

### Economic Impact Per $1M Tourism Spend

| Metric | Traditional | TourismPay |
|---|---|---|
| Retained by merchant | $470,000 | $970,000 |
| Payment processing fees | $79,000 | $10,000 |
| GDS/OTA commissions | $250,000 | $30,000 |
| Cross-border fees | $50,000 | $5,000 |
| **Net local retention** | **47%** | **97%** |

---

# Slide 15: Tourism Board Benefits

### Real-Time Visibility Into the Tourism Economy

| Capability | What Tourism Boards Get |
|---|---|
| **Admin Dashboard** | Live transaction volume, active merchants, booking trends |
| **KYB Oversight** | Every merchant verified — business identity, directors, financials, BIS |
| **Finance Dashboard** | Total tourism revenue by country, currency, merchant type |
| **Audit Log** | Every transaction, approval, and status change logged immutably |
| **Exchange Rate Management** | Override and monitor FX rates applied to tourist transactions |
| **User Management** | Role-based access for tourism board staff |
| **Service Health** | Real-time monitoring of all platform services |
| **Africa Registry** | Centralized registry of all verified tourism establishments |
| **Compliance Dashboard** | AML flags, SAR reports, PEP screening results |
| **ML Analytics** | Demand forecasting, RevPAR trends, occupancy predictions |

### Policy Levers
- **Kill switch** — Block specific corridors or currencies instantly
- **Exchange rate overrides** — Set floor/ceiling rates for tourist protection
- **BIS enforcement** — No merchant goes live without background verification
- **Document expiration** — Auto-flag merchants with expired licenses
- **Sustainability tracking** — Carbon offset adoption rates across the sector

---

# Slide 16: Diaspora Benefits

### Connecting the African Diaspora to Home

| Feature | Diaspora Use Case |
|---|---|
| **Multi-Currency Wallet** | Hold USD + NGN + KES simultaneously — convert at AI-optimized rates |
| **Mesh Payments** | Send money to family/business partners in 6 African corridors at 0.4-0.7% |
| **CBDC Bridge** | Direct eNaira/eCedi payments — bypasses commercial bank markup |
| **Smart FX Convert** | ML predicts optimal conversion windows — "Convert your $500 to KES tomorrow for 2.3% savings" |
| **Direct Booking** | Book authentic local experiences directly from diaspora community — no Expedia markup |
| **GDS Agent Access** | Diaspora travel agents get tiered commissions (10-18%) selling African tourism |
| **Gift & Support** | Send wallet credits to family members for tourism business capital |
| **Itinerary Builder** | AI Copilot plans homecoming trips with local recommendations |
| **Carbon Offsets** | Offset flight emissions through verified African conservation projects |
| **Verifiable Identity** | DID-based identity that works across all TourismPay services |

### Remittance Comparison
| Method | $200 Nigeria → Kenya | Time |
|---|---|---|
| Western Union | $12-16 fee (6-8%) | 1-3 days |
| Bank wire (SWIFT) | $25-50 fee | 2-5 days |
| **TourismPay Mesh** | **$1.40 fee (0.7%)** | **< 1 minute** |

---

# Slide 17: Traveler Benefits

### From Booking to Checkout — All Digital

| Journey Stage | Feature |
|---|---|
| **Plan** | AI Copilot generates personalized itineraries, shared trip planning |
| **Book** | Search verified merchants, real-time availability, instant confirmation |
| **Pay** | 11 currencies, QR scan, NFC tap (even offline), scheduled payments |
| **Experience** | Digital receipts, loyalty points, deal marketplace |
| **Review** | Rate and review merchants, contribute to trust scores |
| **Offset** | One-tap carbon offset for entire trip |

### Why Travelers Choose TourismPay
- **No more cash dependency** — pay digitally even at remote safari lodges (offline NFC)
- **Transparent pricing** — see exact FX rates, fees, and merchant ratings before paying
- **Verified merchants** — every business KYB-checked with background investigation
- **Loyalty rewards** — earn points on every transaction, redeem for discounts
- **AI travel assistant** — "What should I do in Zanzibar for 3 days on a $500 budget?"
- **Sustainability** — know and offset your carbon footprint
- **Decentralized identity** — DID wallet for reusable travel credentials

---

# Slide 18: Technical Differentiators

### What Makes TourismPay Unique

| Capability | TourismPay | Sabre/Amadeus | Expedia | Flutterwave |
|---|---|---|---|---|
| African CBDC support | eNaira, eCedi, Digital Rand | No | No | No |
| Offline NFC payments | Ed25519 signed vouchers | No | No | No |
| Cross-border mesh (intra-Africa) | 6 corridors, < 1 min | No | No | Limited |
| Africa-first GDS | 20 countries, local agents | Global (weak Africa) | OTA only | No |
| Mobile money native | M-Pesa, MTN, Airtel ready | No | Limited | Yes |
| Carbon offset integration | 5 African projects | No | No | No |
| TigerBeetle ledger | Double-entry, ACID | Proprietary | Proprietary | No |
| Mojaloop ILP | Interoperable real-time | No | No | No |
| KYB + BIS compliance | 5-step + background check | Minimal | Minimal | KYC only |
| AI FX optimization | ML prediction + limit orders | No | No | No |
| White-label GDS SDK | Python, Go, TypeScript | No | Affiliate only | No |
| Open-source middleware | Kafka, Redis, OpenSearch | Proprietary | Proprietary | Proprietary |

---

# Slide 19: Country-by-Country Impact

### 20 African Countries Supported

| Country | Key Tourism Assets | TourismPay Features |
|---|---|---|
| **Kenya** | Maasai Mara, Amboseli, Diani Beach | M-Pesa integration, KES wallet, safari operator onboarding |
| **Tanzania** | Serengeti, Zanzibar, Kilimanjaro | Mesh payments (KE-TZ corridor), offline NFC for parks |
| **South Africa** | Cape Town, Kruger, Garden Route | Digital Rand CBDC, ZAR wallet, Stripe Connect |
| **Nigeria** | Lagos, Calabar, Yankari | eNaira CBDC, NGN wallet, BIS compliance for hospitality |
| **Ghana** | Cape Coast, Accra, Volta Region | eCedi CBDC, GHS wallet, GH-CI corridor |
| **Rwanda** | Gorilla trekking, Kigali | Cross-border with KE/TZ, USD/RWF support |
| **Morocco** | Marrakech, Fes, Atlas Mountains | EUR/MAD corridors, French language support |
| **Egypt** | Pyramids, Luxor, Red Sea | EG-NG corridor, tourism board dashboard |
| **Ethiopia** | Lalibela, Simien Mountains, Addis | Birr integration roadmap, offline NFC for remote sites |
| **Uganda** | Bwindi (gorillas), Murchison Falls | EAC corridors, mobile money |
| **Zimbabwe** | Victoria Falls, Hwange | ZA-ZW corridor, USD/ZWL dual wallet |
| **Botswana** | Okavango Delta, Chobe | Premium safari operator tools, BWP wallet |
| **Namibia** | Etosha, Sossusvlei, Skeleton Coast | NAD wallet, SA corridor |
| **Mozambique** | Bazaruto, Tofo Beach | MZN wallet, ZA-MZ corridor |
| **Senegal** | Dakar, Saint-Louis, Gorée Island | XOF wallet, Francophone agent portal |
| **Côte d'Ivoire** | Abidjan, Grand-Bassam | GH-CI corridor, XOF settlement |
| **Mauritius** | Beach resorts, nature reserves | MUR wallet, EUR corridor |
| **Seychelles** | Island tourism, marine parks | SCR wallet, premium positioning |
| **Madagascar** | Lemurs, rainforest, beaches | MGA wallet, offline NFC critical |
| **Cape Verde** | Island hopping, beach tourism | CVE wallet, EUR corridor |

---

# Slide 20: Platform at a Glance — By the Numbers

| Metric | Count |
|---|---|
| **Total PWA pages** | 50+ |
| **Native mobile screens** | 89 |
| **tRPC API endpoints** | 200+ |
| **Zod validations** | 1,500+ |
| **Supported currencies** | 11 |
| **African countries** | 20 |
| **Mesh payment corridors** | 6 |
| **GDS channel connectors** | 6 (Sabre, Amadeus, Expedia, Booking.com, Little Emperors, Travelport) |
| **Middleware integrations** | 14 (Kafka, Redis, PostgreSQL, Keycloak, Permify, TigerBeetle, Mojaloop, OpenSearch, APISIX, OpenAppSec, Dapr, Fluvio, Temporal, Lakehouse) |
| **Languages** | 4 (TypeScript, Go, Rust, Python) |
| **Merchant establishment types** | 18 |
| **KYB onboarding steps** | 5 |
| **Carbon offset projects** | 5 |
| **GDS SDK languages** | 3 (Python, TypeScript, Go) |
| **Security audit score** | 100/100 |

---

# Slide 21: Go-to-Market Strategy

### Phase 1: East Africa (Months 1-6)
- Launch in Kenya + Tanzania (largest safari market)
- Onboard 500 properties (lodges, tour operators, restaurants)
- Enable KE-TZ mesh corridor
- Tourism board partnership for compliance enforcement

### Phase 2: Southern + West Africa (Months 6-12)
- Expand to South Africa, Ghana, Nigeria
- Enable CBDC bridge (eNaira + eCedi)
- Onboard 2,000+ properties
- Launch GDS agent portal for African travel agencies

### Phase 3: Pan-African + Diaspora (Months 12-24)
- All 20 countries live
- Diaspora remittance marketing (UK, US, Canada diaspora communities)
- White-label GDS licensing to tourism boards
- Channel manager sync with Sabre/Amadeus/Expedia

### Phase 4: Global Distribution (Months 24-36)
- GDS-as-a-Service for external platforms
- Enterprise API tier
- 50,000+ properties on platform
- $1B+ annual transaction volume target

---

# Slide 22: Revenue Model

| Revenue Stream | How | Target |
|---|---|---|
| **Transaction fees** | 0.1-0.7% on wallet operations (send, swap, mesh) | 60% of revenue |
| **GDS booking fees** | $1-3 per reservation (vs. Sabre's $2-5) | 20% of revenue |
| **Channel manager** | $29-99/month per connected property | 10% of revenue |
| **GDS SDK metering** | Starter $49/mo → Pro $199/mo → Enterprise $999/mo | 5% of revenue |
| **White-label licensing** | Tourism board deployments, annual license | 5% of revenue |

### Unit Economics (Per $100 Tourist Transaction)
- **TourismPay revenue:** $1-3 (1-3%)
- **Merchant receives:** $97-99
- **vs. Traditional:** Merchant receives $47-70

---

# Slide 23: The Vision

### Making Africa the Most Digitally Accessible Tourism Destination in the World

**Today:** A tourist at a Maasai Mara safari lodge pays with cash. The lodge owner deposits at a bank 50km away. Booking was through Expedia (25% commission). The money takes 30 days to settle.

**With TourismPay:** The tourist taps their phone (offline NFC). Payment settles in seconds via TigerBeetle. The lodge appears on global distribution channels at 3% commission. The owner sees revenue in their digital wallet immediately. The tourism board sees the transaction in their dashboard. The tourist's carbon footprint is automatically offset through a Kenyan wind energy project.

> **Every dollar spent on African tourism should benefit African communities first.**
> TourismPay makes that a technical reality.

---

# Slide 24: Contact & Resources

| Resource | Link |
|---|---|
| **Platform** | tourismpay.com |
| **GDS API Docs** | OpenAPI 3.1 specification included |
| **Developer Sandbox** | Self-service signup, 10K free tokens |
| **SDKs** | Python, TypeScript, Go — published packages |
| **Source** | Full-stack: TypeScript + Go + Rust + Python |

### Technology Partners
Kafka · Redis · PostgreSQL · Keycloak · Permify · TigerBeetle · Mojaloop · OpenSearch · APISIX · OpenAppSec · Temporal · Dapr · Fluvio · Stripe

---

*TourismPay — Africa's Tourism Payment & Distribution Platform*
*Built in Africa. For Africa. By Africa.*
