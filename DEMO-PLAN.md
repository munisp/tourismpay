# TourismPay Nigeria Demo Plan

## Stakeholders & Demo Personas

| Stakeholder | Login Role | What They Care About |
|-------------|-----------|---------------------|
| **(a) Tourism Board** — planning Nigeria's upcoming "Destination Nigeria 2026" festival | `admin` | Event oversight, merchant registry, compliance (KYB/BIS), revenue analytics, tax collection, fraud monitoring |
| **(b) Tourist** — visiting Lagos for the festival | `tourist` | Wallet loading, FX rates (USD/EUR -> NGN), local payments (QR, NFC), trip planning, tipping, loyalty rewards |
| **(c) Merchant** — Lagos restaurant/tour operator | `merchant` | Revenue dashboard, QR payment acceptance, product catalog, payouts in NGN, booking inbox, staff management |
| **(d) Fintech Partner / PSSP** — payment processor integrating with TourismPay | `admin` (payment switch) | Payment gateway, settlement console, API developer portal, NOC dashboard, remittance corridors, rate alerts |

---

## Demo Flow (recommended order ~45 min)

### Act 1: Tourism Board Overview (10 min)
**Login as:** `admin@tourismpay.ng` (admin role)

| # | Page | Route | What to Show | Nigerian Data |
|---|------|-------|-------------|---------------|
| 1 | Dashboard | `/` | Total transaction volume (NGN 847M), active merchants (156), tourists served (12,400), event countdown | "Destination Nigeria 2026" event stats |
| 2 | Africa Registry | `/africa/registry` | Nigerian merchant registry with Lagos, Abuja, Calabar establishments | 30+ establishments across 6 Nigerian cities |
| 3 | KYB Applications | `/admin/kyb-applications` | Merchant verification pipeline — approved, under review, pending | 20+ applications with CAC numbers, Nigerian business types |
| 4 | BIS Dashboard | `/bis` | Anti-money laundering investigations, risk scoring | 10 investigations with Nigerian subjects |
| 5 | Fraud Monitor | `/security/fraud` | Real-time fraud alerts from Nigerian corridors | Velocity spikes, geo anomalies |
| 6 | Compliance Dashboard | `/compliance` | KYB compliance stats, AML screening results | Nigerian regulatory compliance data |
| 7 | Cross-Platform Analytics | `/analytics` | Revenue by corridor (NGN/USD, NGN/GBP, NGN/EUR) | Analytics with Nigerian payment data |
| 8 | Tourism Events | Dashboard widget | "Destination Nigeria 2026 — Lagos" event with dates, capacity | Lagos event data |

### Act 2: Tourist Experience (12 min)
**Login as:** `sarah.chen@tourist.com` (tourist role)

| # | Page | Route | What to Show | Nigerian Data |
|---|------|-------|-------------|---------------|
| 1 | Tourist Onboarding | `/tourist/onboarding` | Quick KYC verification, currency preferences | USD -> NGN preference, passport verification |
| 2 | Digital Wallet | `/wallet` | Multi-currency wallet with NGN, USD, EUR balances | NGN 245,000 balance, recent Lagos transactions |
| 3 | Load Wallet | `/wallet/loading` | Load via bank transfer, card, mobile money | Nigerian banks (GTBank, Access, Zenith), Flutterwave, Paystack |
| 4 | AI Trip Planner | `/tourist/trip-planner` | Plan "3 days in Lagos" with budget | Lagos attractions, Nigerian restaurants, pricing in NGN |
| 5 | Trip Itinerary | `/tourist/itinerary` | Day-by-day itinerary with bookings | Lekki Conservation, Nike Art Gallery, Eko Hotel |
| 6 | Local Payments | `/wallet/local-payments` | Pay at merchant via QR scan, NFC | Pay at "Mama Cass Restaurant" in NGN |
| 7 | Tipping & Tax | `/wallet/tipping-tax` | Leave tip, see VAT breakdown | Nigerian 7.5% VAT, optional 10% tip |
| 8 | Pre-Travel Readiness | `/wallet/pre-travel` | Checklist: visa, health, currency, insurance | Nigeria-specific requirements |
| 9 | Loyalty & Rewards | `/loyalty` | Points earned from Lagos transactions | Loyalty tiers, partner rewards |
| 10 | Tourist Portal | `/tourist-portal` | Full tourist hub — deals, reviews, bookings | Lagos deals and reviews |

### Act 3: Merchant Experience (10 min)
**Login as:** `chidi.okafor@mamacass.ng` (merchant role)

| # | Page | Route | What to Show | Nigerian Data |
|---|------|-------|-------------|---------------|
| 1 | Business Onboarding | `/restaurant-onboarding` | KYB submission with CAC registration | Mama Cass Restaurant, Lagos |
| 2 | Revenue Dashboard | `/merchant/revenue` | Daily/weekly/monthly revenue in NGN | NGN 2.3M this month, 847 transactions |
| 3 | QR Codes | `/merchant/qr` | Generate and display payment QR codes | QR for "Mama Cass - Table 7" |
| 4 | Product Catalog | `/merchant/products` | Menu items with NGN pricing | Jollof Rice NGN 3,500, Suya NGN 2,000 |
| 5 | Booking Inbox | `/merchant/bookings` | Incoming tourist reservations | Sarah Chen dinner reservation |
| 6 | Payout History | `/merchant/payouts` | Settlement history in NGN | Weekly payouts to GTBank account |
| 7 | Staff Management | `/merchant/staff` | Invite/manage staff with roles | 5 staff members with POS access |
| 8 | Cashier Terminal | `/merchant/cashier` | POS interface for accepting payments | Accept QR payment from tourist |
| 9 | Deal Leaderboard | `/merchant/deals/leaderboard` | Top-performing deals and promotions | "Festival Special: 20% off for tourists" |
| 10 | BIS Compliance | `/merchant/bis-status` | Merchant's own compliance status | Green checkmarks, no flags |

### Act 4: Fintech / PSSP Partner (13 min)
**Login as:** `admin@tourismpay.ng` (admin role, payment switch section)

| # | Page | Route | What to Show | Nigerian Data |
|---|------|-------|-------------|---------------|
| 1 | PS Dashboard | `/paymentswitch` | Transaction volume, success rates, latency | Nigerian corridor stats |
| 2 | Payment Gateway | `/paymentswitch/gateway` | Active payment rails: Flutterwave, Paystack, Interswitch, NIBSS | Nigerian PSSP integrations |
| 3 | Settlement Console | `/settlement` | Settlement batches, net amounts, fees | Batches in NGN, weekly settlement cycle |
| 4 | NOC Dashboard | `/paymentswitch/noc` | Live system health, error rates, uptime | All services green |
| 5 | Remittance | `/paymentswitch/remittance` | Cross-border corridors: USD->NGN, GBP->NGN, EUR->NGN | Live FX rates, compliance checks |
| 6 | Rate Alerts | `/paymentswitch/rate-alerts` | FX rate monitoring and alerts | NGN/USD volatility alerts |
| 7 | Developer Portal | `/paymentswitch/developer` | API docs, sandbox keys, webhook config | TourismPay API v2 endpoints |
| 8 | Onboarding Portal | `/paymentswitch/onboarding` | PSSP integration onboarding flow | Technical requirements, certification |
| 9 | Analytics | `/paymentswitch/analytics` | Deep analytics: conversion rates, corridors, transaction types | Nigeria-specific analytics |
| 10 | Admin Dashboard | `/paymentswitch/admin` | Kill switch, fraud rules, participant management | Nigerian participant list |

---

## Nigerian Data Seeding Summary

### Users (32 total)
- 1 admin (Tourism Board of Nigeria)
- 5 compliance/operations staff
- 15 merchants (restaurants, hotels, tour operators across Lagos, Abuja, Calabar, Port Harcourt, Enugu, Kano)
- 10 international tourists (US, UK, Germany, France, China, Japan, UAE, Brazil, South Korea, India)
- 1 BIS analyst

### Establishments (20 total)
- 6 Lagos (Mama Cass, Eko Hotel, Nike Art Gallery, Lekki Tours, Terra Kulture, Jazz Hole)
- 4 Abuja (Transcorp Hilton, National Mosque Tours, Millennium Park Cafe, Jabi Lake Mall)
- 3 Calabar (Tinapa Resort, Calabar Festival Tours, Obudu Ranch)
- 3 Port Harcourt (Genesis Restaurant, Rivers Tours, Bonny Island Excursions)
- 2 Enugu (Nike Lake Resort, Coal City Tours)
- 2 Kano (Gidan Makama Museum, Kurmi Market Tours)

### Transactions & Financial Data
- 200+ wallet transactions in NGN/USD/EUR/GBP
- 50+ merchant payments with Nigerian payment methods (Paystack, Flutterwave, bank transfer, USSD)
- 30+ settlement batches with real NGN amounts
- FX rates: USD/NGN ~1,550, EUR/NGN ~1,700, GBP/NGN ~1,950

### Compliance & Security
- 15 KYB applications with CAC registration numbers
- 10 BIS investigations (AML, PEP screening)
- 20 fraud alerts across Nigerian corridors
- Nigerian tax rules (7.5% VAT, WHT rates)

### Tourism-Specific
- "Destination Nigeria 2026" event (Lagos, Aug 15-22, 2026)
- 50+ products/experiences with NGN pricing
- Tourist itineraries for Lagos, Abuja, Calabar
- Deal promotions: festival specials, early bird discounts
- Reviews and ratings from tourists
