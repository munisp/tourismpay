# TourismPay — Nigeria Market Rollout Plan

**Prepared:** June 2026  
**Target Launch:** Q4 2026  
**Market:** Federal Republic of Nigeria  
**Population:** 230M+ | Tourism Revenue (2024): ~$4.7B | Diaspora Remittances: ~$20B/yr

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Licensing & Regulatory Requirements](#2-licensing--regulatory-requirements)
3. [Nigerian Tourism Board Integration](#3-nigerian-tourism-board-integration)
4. [Payment Infrastructure & Rails](#4-payment-infrastructure--rails)
5. [Technical Infrastructure](#5-technical-infrastructure)
6. [Go-to-Market Strategy](#6-go-to-market-strategy)
7. [Partnerships](#7-partnerships)
8. [Compliance & Risk Management](#8-compliance--risk-management)
9. [Financial Projections](#9-financial-projections)
10. [Timeline & Milestones](#10-timeline--milestones)
11. [Risks & Mitigations](#11-risks--mitigations)

---

## 1. Executive Summary

TourismPay is positioned to capture Nigeria's underserved tourism payment market. The platform already supports NGN, Nigerian NUBAN bank validation, eNaira CBDC bridge, OPay, Flutterwave, 10 Nigerian banks, Mojaloop settlement, and BIS fraud monitoring with Nigeria-specific thresholds.

**What's needed to go live:**
- 3 regulatory licenses (PSSP, eNaira integration, NDPR compliance)
- Partnership with NTDC and 3 state tourism boards
- Integration with NIBSS (NIP) for instant bank transfers
- Cloud infrastructure in Lagos (AWS Africa or Azure South Africa + CDN)
- 100 initial merchant onboardings across Lagos, Abuja, and Cross River State

**Estimated timeline:** 6-9 months from commencement  
**Estimated pre-launch cost:** ₦180M–₦350M ($112K–$220K)

---

## 2. Licensing & Regulatory Requirements

### 2.1 Central Bank of Nigeria (CBN) — Payment Service Solution Provider (PSSP) License

**Required:** Yes — mandatory for any entity processing electronic payments in Nigeria.

| Item | Detail |
|------|--------|
| **License type** | PSSP (Payment Service Solution Provider) |
| **Regulator** | CBN, Payment System Management Department |
| **Minimum capital** | ₦100M ($62K) — must be maintained at all times |
| **Application fee** | ₦5M ($3.1K) non-refundable |
| **Timeline** | 3-6 months from submission |
| **Key requirements** | Nigerian-incorporated company (CAC), audited financials, directors' fit-and-proper declarations, compliance officer appointment, IT infrastructure audit by CBN-approved assessor, AML/CFT policy, business plan |
| **Platform readiness** | ✅ KYB onboarding, ✅ AML screening (BIS), ✅ Transaction monitoring, ✅ Audit logging |

**Action items:**
- [ ] Incorporate TourismPay Nigeria Ltd with CAC (Corporate Affairs Commission)
- [ ] Appoint 2 Nigerian resident directors + 1 compliance officer
- [ ] Engage CBN-approved IT assessor (e.g., Digital Encode, ControlRisks Nigeria)
- [ ] Deposit ₦100M share capital with CBN-designated bank
- [ ] Submit PSSP application with full documentation package
- [ ] Obtain CBN "Approval in Principle" (AIP) before any live transactions

### 2.2 CBN — eNaira Integration License

**Required:** Yes — for CBDC-NG on-ramp/off-ramp functionality.

| Item | Detail |
|------|--------|
| **License type** | eNaira Merchant/PSP Integration |
| **Regulator** | CBN Digital Currency Unit |
| **Requirements** | Valid PSSP license (prerequisite), API integration certification, sandbox testing (3 months minimum), speed wallet + merchant wallet setup |
| **Platform readiness** | ✅ CBDC-NG support in stablecoin swap, ✅ Wallet system supports eNaira, ⚠️ Need live API integration (currently simulated) |

**Action items:**
- [ ] Apply for eNaira sandbox access after PSSP AIP
- [ ] Integrate eNaira SDK (speed wallet for tourists, merchant wallet for businesses)
- [ ] Complete 3-month sandbox testing with CBN oversight
- [ ] Pass CBN eNaira compliance audit
- [ ] Go-live certification

### 2.3 Nigeria Data Protection Commission (NDPC) — NDPA Compliance

**Required:** Yes — mandatory for any entity processing personal data of Nigerians.

| Item | Detail |
|------|--------|
| **Regulation** | Nigeria Data Protection Act 2023 (NDPA) |
| **Regulator** | NDPC (formerly NITDA-NDPR) |
| **Requirements** | Data Protection Impact Assessment (DPIA), appoint Data Protection Officer (DPO), register as Data Controller with NDPC, annual compliance audit by licensed DPCO, data localization (primary copy of Nigerian user data must reside in Nigeria) |
| **Platform readiness** | ✅ PII encryption (AES-256-GCM), ✅ Audit logging, ⚠️ Need Nigerian data residency (data localization), ⚠️ Need DPIA document |

**Action items:**
- [ ] Appoint DPO (can be same as compliance officer if qualified)
- [ ] Complete DPIA for all data processing activities
- [ ] Register with NDPC as Data Controller
- [ ] Engage licensed DPCO for annual audit (e.g., Paradigm Initiative, Digital Rights Foundation)
- [ ] Configure PostgreSQL primary replica in Nigeria (see §5)

### 2.4 Securities and Exchange Commission (SEC) — Digital Assets

**Required:** Conditional — only if stablecoin swap/yield features are offered to Nigerian residents.

| Item | Detail |
|------|--------|
| **Regulation** | SEC Rules on Digital Assets (2022, amended 2024) |
| **Trigger** | Offering USDC/USDT/DAI swap, yield, or limit orders to Nigerian users |
| **Requirements** | Virtual Asset Service Provider (VASP) registration, enhanced AML/CFT controls, quarterly reporting, segregated client funds |
| **Platform readiness** | ✅ KYC tiers, ✅ Travel Rule (FATF Rec. 16), ✅ Sanctions screening, ⚠️ Need VASP registration |

**Action items:**
- [ ] Determine if stablecoin features will be available to Nigerian residents at launch
- [ ] If yes: apply for SEC VASP registration (6-12 months)
- [ ] If no: geo-fence stablecoin swap page for Nigerian IP addresses at launch, apply for VASP concurrently

### 2.5 National Identity Management Commission (NIMC)

**Required:** Yes — for KYC identity verification.

| Item | Detail |
|------|--------|
| **Integration** | NIMC NIN Verification API |
| **Purpose** | Verify National Identification Number (NIN) for KYC Tier 2-3 |
| **Requirements** | Licensed data consumer agreement with NIMC, or via verified aggregator (e.g., Smile Identity, VerifyMe, Youverify) |
| **Platform readiness** | ✅ KYC router exists, ✅ 4-tier system, ⚠️ Need live NIN verification API |

**Action items:**
- [ ] Contract KYC aggregator (Smile Identity recommended — pan-African, supports NIN + BVN + face match)
- [ ] Integrate NIMC NIN verification in Rust KYC service
- [ ] Add BVN verification via NIBSS BVN validation API

### 2.6 Summary License Timeline

```
Month 1-2:  Incorporate company, appoint directors/officers
Month 2-3:  Submit PSSP application, begin NDPC registration
Month 3-6:  CBN review period, eNaira sandbox, DPIA completion
Month 4-6:  IT infrastructure audit by CBN assessor
Month 6:    CBN Approval in Principle (target)
Month 6-9:  Final compliance checks, go-live certification
Month 7+:   SEC VASP application (if stablecoin features)
```

---

## 3. Nigerian Tourism Board Integration

### 3.1 Nigeria Tourism Development Corporation (NTDC)

The NTDC is the federal body responsible for tourism promotion. Integration is **strategic, not regulatory** — but critical for market access and credibility.

**Partnership structure:**
| Component | Detail |
|-----------|--------|
| **BIS Dashboard** | Provide NTDC read-only access to TourismPay's Business Intelligence System — tourist spending patterns, popular destinations, seasonal trends, revenue by state |
| **Data sharing** | Anonymized tourism flow data (arrivals, spending, duration) — NTDC currently lacks real-time data |
| **Digital tourism registry** | Onboard NTDC-registered tourism establishments via bulk KYB import |
| **Co-marketing** | NTDC endorsement on TourismPay platform for Nigerian market |
| **Revenue share** | 0.1% of transaction volume as tourism development levy (feeds into Tourism Development Fund) |

**Value proposition for NTDC:**
- First real-time digital dashboard of Nigeria's tourism economy
- Automated tourism data collection (currently manual/survey-based)
- Trackable revenue from diaspora visitors
- Evidence-based policy making with BIS analytics

**Action items:**
- [ ] Formal presentation to NTDC Director General
- [ ] Draft MOU for data sharing + BIS dashboard access
- [ ] Pilot with NTDC-registered establishments in Lagos + Calabar
- [ ] Participate in NTDC's "Tourism Month" (September) for visibility

### 3.2 State Tourism Boards

Target the 3 states with highest tourism activity for initial rollout:

| State | Tourism Board | Key Attractions | Priority |
|-------|---------------|-----------------|----------|
| **Lagos** | Lagos State Ministry of Tourism, Arts & Culture | Lekki Conservation Centre, Nike Art Gallery, Tarkwa Bay, Freedom Park, Eko Hotel district | P0 — highest volume |
| **Cross River** | Cross River State Tourism Bureau | Obudu Mountain Resort, Calabar Carnival, Cross River National Park, Tinapa Business Resort | P0 — established tourism infrastructure |
| **FCT Abuja** | FCT Tourism Board | Aso Rock, National Mosque/Cathedral, Jabi Lake, Millennium Park | P1 — government/business tourism |

**Per-state integration:**
- [ ] Sign cooperation agreement with each state tourism board
- [ ] Bulk onboard registered hotels/attractions via KYB fast-track
- [ ] Deploy QR payment codes at top 10 tourist sites per state
- [ ] Provide state-level analytics dashboard (subset of BIS)
- [ ] Co-host merchant onboarding workshops

### 3.3 Federal Ministry of Information & National Orientation (Tourism Division)

- [ ] Align with Nigeria's National Tourism Policy goals
- [ ] Position TourismPay in "Project ACE" (Accelerating Competitiveness and Efficiency in Tourism)
- [ ] Participate in Nigeria Tourism Awards for visibility

---

## 4. Payment Infrastructure & Rails

### 4.0 How Foreign Tourists Load Their Wallets

This is the critical question for the Nigeria launch. A tourist arriving at Murtala Muhammed International Airport with USD/EUR/GBP needs to get money into their TourismPay wallet within minutes. Here are all the channels, what's built, and what's missing:

#### Pre-Arrival Loading (Tourist's Home Country)

| Channel | Status | How It Works | Fee | Time |
|---------|--------|-------------|-----|------|
| **Visa/Mastercard (Stripe)** | ✅ Built | Tourist opens TourismPay PWA → "Add Funds" → Stripe Checkout → card charged in USD/EUR/GBP → wallet credited in USDC or NGN | 2.5% | ~2 min |
| **Stablecoin deposit (USDC/USDT/DAI)** | ✅ Built | Tourist already holds crypto → on-ramp page → paste wallet address → deposit confirmed on-chain → wallet credited | 0.3% | ~5 min (Stellar) / ~15 min (Ethereum) |
| **Apple Pay / Google Pay** | ⚠️ UI shown | PaymentGateway shows "Digital Wallets — Apple Pay, Google Pay" as live, but backend routes through Stripe Checkout which supports both. Works if Stripe is configured with Apple/Google Pay. | 2.5% | ~2 min |
| **SWIFT bank wire** | ❌ **Gap** | Currently `wallet.ts` maps USD→"SWIFT" as the network label, but there's no actual SWIFT integration. Tourist cannot wire funds from a US/UK bank account. | — | — |
| **Wise / Revolut / Remitly** | ❌ **Gap** | No integration with popular remittance apps that tourists already use. | — | — |

#### On-Arrival Loading (At Nigerian Airport/Hotel)

| Channel | Status | How It Works | Fee | Time |
|---------|--------|-------------|-----|------|
| **Card top-up via Stripe** | ✅ Built | `touristPortal.createTopupSession` → Stripe Checkout → wallet credited | 2.5% | ~2 min |
| **OPay (if tourist installs)** | ✅ Built | On-ramp via OPay mobile money (Nigerian residents primarily) | 0.8% | ~5 min |
| **Flutterwave card** | ✅ Built | On-ramp via Flutterwave card processing (supports int'l cards) | 1.4% | ~3 min |
| **Cash → Agent** | ❌ **Gap** | Tourist hands cash (USD/EUR/NGN) to airport kiosk/agent → agent loads wallet. No agent banking feature built. | — | — |
| **ATM → Bank transfer** | ⚠️ Partial | Tourist withdraws NGN from ATM → bank transfer to TourismPay wallet. NIP integration needed (§4.2). | TBD | 1-3 days |
| **eNaira** | ⚠️ Simulated | Tourist downloads eNaira app → funds CBDC-NG wallet directly. Needs live CBN API. | 0% | ~30 sec |
| **USSD (feature phone)** | ❌ **Gap** | Tourist dials *shortcode# → selects "Load Wallet" → enters amount. Needs USSD menu. | TBD | ~2 min |

#### Stablecoin-Specific Loading Paths

| Path | Status | How It Works |
|------|--------|-------------|
| **Buy USDC/USDT/DAI with Visa/Mastercard** | ✅ Built | Stablecoin Swap page → "Buy" tab → select card → Stripe charges tourist → USDC minted to wallet |
| **Buy USDC with USD bank transfer** | ⚠️ Partial | Rail exists (`bank_transfer`) but no SWIFT routing. Only works for Nigerian NUBAN accounts currently. |
| **Buy USDC via M-Pesa** | ✅ Built | On-ramp rail for Kenyan tourists visiting Nigeria (cross-border M-Pesa) |
| **Buy USDC via OPay/Flutterwave** | ✅ Built | On-ramp rails for Nigerian-banked tourists |
| **Swap between stablecoins** | ✅ Built | USDC↔USDT↔DAI↔CBDC at 15bps fee |
| **CBDC-NG (eNaira) → USDC** | ✅ Built | On-ramp rail `cbdc_bridge`, ~30 sec settlement |
| **Yield on idle stablecoins** | ✅ Built | Deposit USDC → earn yield from LP pool rewards |
| **Limit orders** | ✅ Built | Set target rate → auto-buy when rate hits threshold |
| **DCA (recurring buys)** | ✅ Built | Daily/weekly/monthly auto-purchases |

#### SWIFT Integration Plan (New — Needed for Foreign Tourists)

SWIFT is the primary way business travelers and high-value tourists move money internationally. Current gap: the platform labels USD network as "SWIFT" but has no actual SWIFT integration.

**Implementation approach (3 options, ranked by time-to-market):**

| Option | Effort | Cost | Recommended? |
|--------|--------|------|-------------|
| **A. Partner with licensed IMTO** (e.g., Flutterwave International, LemFi, or TransferGo) | 4-6 weeks | Revenue share | ✅ **Yes — fastest path** |
| **B. SWIFT gpi integration via correspondent bank** (GTBank, Access Bank, FirstBank — all have SWIFT gpi) | 3-6 months | $50K setup + per-msg fees | Phase 2 |
| **C. Direct SWIFT membership** | 12-18 months | $250K+ setup + annual fees | No — too expensive for startup |

**Recommended approach (Option A):**
1. Partner with Flutterwave International or LemFi — they already have SWIFT/SEPA/ACH rails
2. Tourist initiates "Wire Transfer" in TourismPay → redirected to partner's collection page
3. Partner collects USD/EUR/GBP via SWIFT/SEPA → settles to TourismPay's NGN pooled account
4. TourismPay credits tourist's wallet in USDC or NGN
5. Settlement T+1 (same-day for SEPA/UK Faster Payments)

**Action items:**
- [ ] Negotiate IMTO partnership (Flutterwave International preferred — already have rail integration)
- [ ] Build "Wire Transfer" loading option in tourist wallet UI
- [ ] Add SEPA/UK Faster Payments/ACH collection accounts for EU/UK/US tourists
- [ ] Implement webhook listener for partner settlement confirmation
- [ ] Phase 2: Apply for correspondent banking relationship for direct SWIFT gpi

#### Agent Banking / Airport Kiosk Loading (New — Needed for Cash Tourists)

Not all tourists carry cards or use crypto. Cash-to-wallet conversion is essential.

**Implementation:**
1. **Airport kiosk partnership** — Partner with Bureau de Change (BDC) operators at MMIA and Nnamdi Azikiwe airports
2. **Agent app** — BDC operator uses TourismPay Agent App → scans tourist's QR → enters cash amount → loads wallet
3. **KYC for cash loading** — Tourist shows passport → agent enters passport number → KYC Tier 1 instant ($500/day limit)
4. **Float management** — Agent pre-funds digital float via bank transfer → deducts from float on each cash load

**Action items:**
- [ ] Build Agent Loading module (agent-facing UI + tRPC procedures)
- [ ] Partner with MMIA BDC operators (Travelex, Bureau de Change Association of Nigeria)
- [ ] Implement agent float management and reconciliation
- [ ] Deploy at Calabar airport for Cross River pilot

### 4.1 Current Platform Support (Already Built)

| Rail | Status | Nigeria-Specific |
|------|--------|------------------|
| **OPay** | ✅ On-ramp + off-ramp | NG-only, 0.8% fee |
| **Flutterwave** | ✅ On-ramp + off-ramp | Pan-African, 1.4% fee |
| **Chipper Cash** | ✅ On-ramp + off-ramp | Pan-African, 1.0% fee |
| **Bank transfer** | ✅ Via NUBAN validation | 10 Nigerian banks with codes |
| **Stripe (card)** | ✅ On-ramp | International cards |
| **eNaira CBDC** | ✅ Wallet support | Simulated — need live API |
| **Mojaloop** | ✅ Interbank settlement | Quote/Prepare/Commit flow |
| **NGN currency** | ✅ Full support | FX rates, corridors, limits |

### 4.2 Additional Rails Needed for Nigeria Launch

| Rail | Priority | Integration Effort | Notes |
|------|----------|-------------------|-------|
| **NIBSS Instant Payment (NIP)** | **P0 — Critical** | 4-6 weeks | Primary bank-to-bank transfer. Every Nigerian bank account accessible via NIP. Must connect via NIBSS-licensed switch or aggregator. |
| **NIBSS BVN Validation** | **P0 — Critical** | 2 weeks | Bank Verification Number — required for KYC Tier 2+. API validates BVN against biometric records. |
| **Paystack** | **P1 — Important** | 2 weeks | Stripe's Nigerian subsidiary. Dominant card processor. Already has Stripe integration — Paystack uses similar API. |
| **USSD (shortcode)** | **P1 — Important** | 3-4 weeks | Feature phone access. Obtain USSD shortcode (e.g., *555#) from NCC/telco. Enables wallet check, QR confirmation for unbanked tourists. |
| **PalmPay** | **P2 — Nice-to-have** | 2 weeks | Growing mobile money platform. API similar to OPay. |
| **SANEF (agent banking)** | **P2 — Nice-to-have** | 4 weeks | Shared Agent Network Expansion Facility. Cash-in/cash-out at 500,000+ agent locations. |

**Action items:**
- [ ] Apply for NIBSS membership (requires PSSP license + ₦50M processing bond)
- [ ] Alternatively: integrate via NIBSS-licensed aggregator (Paystack, Flutterwave, or Interswitch) for faster time-to-market
- [ ] Obtain USSD shortcode from Nigerian Communications Commission (NCC) — ₦25M/yr
- [ ] Integrate Paystack card payments alongside Stripe
- [ ] Build USSD menu system for feature phone tourists

### 4.3 FX & Cross-Border

| Feature | Status |
|---------|--------|
| USD→NGN corridor | ✅ Built (rate: 1600 NGN/USD configurable) |
| GBP→NGN corridor | ✅ Supported via FX engine |
| EUR→NGN corridor | ✅ Supported via FX engine |
| Diaspora remittance | ✅ Built (0.5% fee, persists to DB) |
| Travel Rule (>$1K) | ✅ FATF Rec. 16 compliant |
| Corridor rate limits | ✅ Defined for NGN |
| eNaira on/off-ramp | ⚠️ Simulated — need CBN sandbox |

**CBN FX compliance:**
- [ ] Register with CBN as Authorized Dealer (Category B) for FX transactions, OR
- [ ] Partner with licensed IMTOs (International Money Transfer Operators) for remittance corridors
- [ ] Implement CBN daily FX reporting (autonomous system for ₦5M+ equivalent)
- [ ] Comply with CBN Circular on Diaspora Remittances (mandatory NGN settlement within 24h)

---

## 5. Technical Infrastructure

### 5.1 Data Localization (NDPA Requirement)

Nigerian user data must have primary storage in Nigeria. Architecture:

```
┌─────────────────────┐    ┌──────────────────────┐
│  Lagos Data Center   │    │  Backup (South Africa)│
│  (Primary)           │◄──►│  (DR / Read Replica)  │
│                      │    │                        │
│  PostgreSQL Primary  │    │  PostgreSQL Replica    │
│  Redis Primary       │    │  Redis Replica         │
│  Kafka Brokers (3)   │    │  Kafka MirrorMaker     │
│  TigerBeetle (3)     │    │  TigerBeetle Replica   │
│  OpenSearch          │    │  OpenSearch Cross-Clust│
│  Object Storage      │    │  Object Storage Sync   │
└─────────────────────┘    └──────────────────────┘
```

**Cloud options:**
| Provider | Nigeria PoP | Latency | Cost Estimate (monthly) |
|----------|------------|---------|------------------------|
| **AWS (via Lagos CloudFront)** | CDN only — closest compute: Cape Town `af-south-1` | 40-60ms | $3,500-5,000 |
| **Azure (South Africa North)** | CDN Lagos + Johannesburg compute | 35-50ms | $3,200-4,500 |
| **MainOne/Rack Centre (Lagos)** | Physical colocation in Lagos | <5ms | $2,000-3,500 |
| **Google Cloud (Johannesburg)** | CDN Lagos + Johannesburg compute | 35-50ms | $3,000-4,500 |

**Recommended approach:**
1. **Primary DB + financial ledger:** Colocation in Lagos (Rack Centre or MainOne) — meets NDPA data localization, lowest latency for Nigerian users
2. **Application compute:** AWS `af-south-1` or Azure `South Africa North` — Kubernetes cluster
3. **CDN:** CloudFront or Akamai with Lagos edge
4. **DR:** Replicate to South Africa region for disaster recovery

**Action items:**
- [ ] Contract with Lagos colocation provider (Rack Centre: Tier III, $2K/month for 2 racks)
- [ ] Deploy PostgreSQL primary + TigerBeetle cluster in Lagos
- [ ] Configure Kafka MirrorMaker for cross-region replication
- [ ] Set up AWS EKS or Azure AKS in South Africa for app tier
- [ ] Configure KEDA ScaledObjects for Nigerian traffic patterns (peak: 9am-9pm WAT)

### 5.2 Network & Connectivity

| Requirement | Solution |
|-------------|----------|
| Internet transit | MainOne submarine cable (Lagos landing) + WACS backup |
| DDoS protection | Cloudflare Enterprise (Lagos PoP) or APISIX + OpenAppSec (already configured) |
| SSL certificates | Let's Encrypt + Cloudflare managed |
| DNS | Route53 or Cloudflare DNS with Lagos failover |
| VPN (ops) | WireGuard between Lagos DC and cloud region |

### 5.3 Nigerian-Specific Technical Adaptations

| Feature | Current | Needed |
|---------|---------|--------|
| **Offline payments** | ✅ Service worker + offline queue | Add USSD fallback for no-internet scenarios |
| **Low bandwidth** | ✅ PWA with offline support | Optimize images to <50KB, lazy load non-critical assets |
| **Feature phones** | ❌ Not supported | USSD menu (*shortcode#) for basic wallet operations |
| **SMS notifications** | ✅ Africa's Talking + Twilio | Configure with Nigerian sender ID |
| **WhatsApp Business** | ✅ API configured | Enable WhatsApp banking (receipt sharing, balance check) |
| **Language** | ✅ i18n module (435 lines) | Add Yoruba, Hausa, Igbo translations |

---

## 6. Go-to-Market Strategy

### 6.1 Phase 1: Soft Launch (Month 7-9)

**Geography:** Lagos + Cross River (Calabar)  
**Target:** 100 merchants, 1,000 tourists

| Segment | Target | Channel |
|---------|--------|---------|
| **Hotels (Lagos)** | Eko Hotels, Federal Palace, Radisson Blu, 20 boutique hotels in Victoria Island/Ikoyi | Direct sales + NTDC referral |
| **Tour operators** | Top 15 Lagos tour operators (e.g., Tripflip, TVP Adventures, Badagry heritage tours) | Partnership |
| **Attractions (Cross River)** | Obudu Mountain Resort, Calabar Museum, Drill Monkey Ranch, Kwa Falls | Cross River Tourism Bureau |
| **Restaurants** | Top 30 tourist-facing restaurants in V.I. and Lekki | QR code deployment |
| **Diaspora tourists** | Nigerian diaspora visiting during December/festive season | Digital marketing (UK/US Nigerian communities) |

**Launch strategy:**
1. Onboard merchants with zero setup fees for first 6 months
2. QR payment codes at every merchant location
3. Tourist welcome kit at Lagos airport (Murtala Muhammed International — MMIA)
4. Partner with airline lounges for awareness
5. December "Detty December" campaign targeting diaspora visitors

### 6.2 Phase 2: Expansion (Month 10-15)

**Geography:** Add FCT Abuja, Oyo (Ibadan), Ogun (Abeokuta)  
**Target:** 500 merchants, 10,000 tourists

| Initiative | Detail |
|-----------|--------|
| **GDS integration** | Connect TourismPay GDS with Nigerian Hotel Association (NHA) member properties |
| **Agent network** | Recruit 50 travel agents via GDS Agent Portal (10% commission) |
| **Government tourism** | Integrate with Abuja conference/MICE tourism |
| **Channel Manager** | Connect 5 Nigerian hotel chains to Sabre/Amadeus/Booking.com |
| **Remittance corridors** | Activate UK→NG, US→NG, CA→NG corridors for diaspora |

### 6.3 Phase 3: Scale (Month 16-24)

**Geography:** All 36 states + FCT  
**Target:** 2,000 merchants, 50,000 tourists

| Initiative | Detail |
|-----------|--------|
| **USSD launch** | Feature phone access for rural tourism (Osun Sacred Grove, Sukur Cultural Landscape) |
| **eNaira integration** | Full CBDC on/off-ramp live |
| **Stablecoin swap** | VASP-licensed, available to Nigerian residents |
| **White-label GDS** | Offer to state tourism boards as their digital booking platform |
| **SANEF agent banking** | Cash-in/cash-out at 500,000+ agent locations |

---

## 7. Partnerships

### 7.1 Critical Partnerships (Must-Have)

| Partner | Type | Purpose | Status |
|---------|------|---------|--------|
| **NIBSS** | Payment rail | NIP instant transfers, BVN validation | To negotiate |
| **NTDC** | Government | Tourism data, establishment registry, endorsement | To negotiate |
| **Smile Identity** | KYC provider | NIN + BVN + face match verification | To integrate |
| **Flutterwave or Paystack** | Payment aggregator | Card processing, bank transfers (while awaiting direct NIBSS) | ✅ Flutterwave rail built |
| **OPay** | Mobile money | Wallet top-up, merchant payouts | ✅ Rail built |
| **Lagos State Tourism** | Government | Merchant onboarding, co-marketing | To negotiate |
| **Cross River Tourism** | Government | Pilot destination, merchant onboarding | To negotiate |

### 7.2 Strategic Partnerships (Nice-to-Have)

| Partner | Type | Purpose |
|---------|------|---------|
| **GTBank / FirstBank / Access Bank** | Banking | Correspondent banking, FX settlement |
| **MTN Nigeria / Glo** | Telco | USSD shortcode, SMS gateway |
| **Nigeria Hotel Association** | Industry | Bulk merchant onboarding |
| **NANTA (travel agents)** | Industry | Agent network, GDS distribution |
| **Mastercard / Visa** | Card scheme | Tourist card acceptance, virtual cards |
| **FAAN (airport authority)** | Government | Airport kiosk placement, tourist welcome |
| **Nigerian Immigration Service** | Government | Arrival data integration for tourist analytics |

### 7.3 Technology Partners

| Partner | Purpose |
|---------|---------|
| **Rack Centre Lagos** | Colocation for NDPA compliance |
| **Cloudflare** | CDN + DDoS + WAF (Lagos PoP) |
| **Africa's Talking** | SMS gateway (already configured) |
| **Twilio** | WhatsApp Business API (already configured) |
| **Temporal Cloud** | Managed workflow orchestration (optional vs self-hosted) |

---

## 8. Compliance & Risk Management

### 8.1 AML/CFT (Anti-Money Laundering / Counter-Financing of Terrorism)

| Requirement | Platform Status | Gap |
|-------------|----------------|-----|
| Customer Due Diligence (CDD) | ✅ 4-tier KYC system | Need NIN/BVN live verification |
| Enhanced Due Diligence (EDD) | ✅ KYC Tier 3 enhanced checks | None |
| Transaction monitoring | ✅ BIS fraud detection + GNN scoring | None |
| Suspicious Activity Reports (SAR) | ✅ BIS investigation lifecycle | Need integration with NFIU (Nigerian Financial Intelligence Unit) reporting format |
| PEP screening | ✅ Sanctions screening module | Need Nigerian PEP list integration |
| Record keeping (5+ years) | ✅ Audit log with immutable records | Need archival policy document |

**Action items:**
- [ ] Register with NFIU as reporting entity
- [ ] Integrate NFIU STR/SAR electronic reporting format
- [ ] Obtain/integrate Nigerian PEP list (via World-Check or local provider)
- [ ] Document record retention policy (minimum 5 years per CBN directive)
- [ ] Conduct initial ML/TF risk assessment for Nigeria operations

### 8.2 Consumer Protection (CBN Consumer Protection Framework 2019)

| Requirement | Action |
|-------------|--------|
| Transparent pricing | Display all fees before transaction confirmation |
| Dispute resolution | ✅ Built — stablecoin disputes + refund flow |
| Data breach notification | Notify CBN + affected customers within 72 hours |
| Complaint handling | Set up dedicated complaint channel + 48h SLA |
| Accessibility | USSD access for feature phone users |

### 8.3 CBN Cybersecurity Framework

| Requirement | Platform Status |
|-------------|----------------|
| Annual penetration testing | ⚠️ Need to engage CBN-approved pentester |
| Incident response plan | ⚠️ Need formal IRP document |
| Security Operations Center (SOC) | ✅ SOC alerts, NOC dashboard |
| Multi-factor authentication | ✅ Biometric + TOTP support |
| Encryption at rest | ✅ AES-256-GCM |
| Encryption in transit | ✅ TLS 1.3 |
| Business continuity plan | ⚠️ Need formal BCP document |

---

## 9. Financial Projections

### 9.1 Pre-Launch Costs

| Category | Estimate (₦) | Estimate ($) | Notes |
|----------|-------------|-------------|-------|
| Company incorporation (CAC) | ₦500K | $310 | Legal + registration |
| PSSP license capital | ₦100M | $62,500 | Refundable share capital |
| PSSP application fee | ₦5M | $3,125 | Non-refundable |
| IT infrastructure audit | ₦15M | $9,375 | CBN-approved assessor |
| Legal & compliance | ₦20M | $12,500 | Lawyers, compliance docs |
| Lagos colocation (12 months) | ₦38M | $24,000 | 2 racks @ Rack Centre |
| Cloud infrastructure (12 months) | ₦72M | $45,000 | AWS/Azure compute |
| NIBSS membership + bond | ₦55M | $34,375 | Processing bond |
| USSD shortcode (annual) | ₦25M | $15,625 | NCC license |
| KYC provider setup | ₦5M | $3,125 | Smile Identity annual |
| Staff (6 engineers, 2 compliance, 2 BD) | ₦90M | $56,250 | 12 months |
| Marketing & launch | ₦30M | $18,750 | Detty December campaign |
| **Total** | **₦455.5M** | **~$285K** | |

*Note: ₦100M share capital is maintained as equity, not spent. Effective cash outlay: ~₦355M ($222K).*

### 9.2 Revenue Projections (Year 1)

| Revenue Stream | Assumption | Annual (₦) | Annual ($) |
|----------------|-----------|------------|------------|
| Transaction fees (1.5% avg) | 500 merchants × ₦200K avg monthly volume | ₦180M | $112.5K |
| FX spread (0.5%) | 5,000 diaspora transactions × ₦100K avg | ₦25M | $15.6K |
| GDS commissions (10%) | 200 bookings/month × ₦150K avg | ₦36M | $22.5K |
| API/SDK subscriptions | 20 developer accounts × ₦500K/yr | ₦10M | $6.25K |
| Channel Manager fees | 50 properties × ₦100K/month | ₦60M | $37.5K |
| **Total Year 1** | | **₦311M** | **~$194K** |

Break-even: Month 14-18 (depending on merchant acquisition pace).

---

## 10. Timeline & Milestones

```
2026 Q3 (Jul-Sep):
├── Month 1: Incorporate TourismPay Nigeria Ltd (CAC)
├── Month 1: Appoint directors, compliance officer, DPO
├── Month 2: Submit PSSP application to CBN
├── Month 2: Begin NDPC registration + DPIA
├── Month 2: Contract Lagos colocation (Rack Centre)
├── Month 3: Deploy Nigerian data center (PostgreSQL + TigerBeetle)
├── Month 3: NTDC initial presentation
└── Month 3: Begin NIBSS aggregator integration (via Paystack/Flutterwave)

2026 Q4 (Oct-Dec):
├── Month 4: CBN IT infrastructure audit
├── Month 4: eNaira sandbox access
├── Month 5: KYC integration (Smile Identity — NIN + BVN)
├── Month 5: Sign Lagos + Cross River tourism board MOUs
├── Month 5: Onboard first 50 merchants (Lagos)
├── Month 6: CBN Approval in Principle (target)
├── Month 6: USSD shortcode application
└── Month 6: "Detty December" soft launch — 100 merchants, Lagos + Calabar

2027 Q1 (Jan-Mar):
├── Month 7: Full PSSP license granted
├── Month 7: Live NIP bank transfers
├── Month 8: Onboard 200 more merchants (Lagos + Abuja)
├── Month 8: GDS agent recruitment (50 agents)
├── Month 9: eNaira live integration
└── Month 9: SEC VASP application submitted

2027 Q2 (Apr-Jun):
├── Month 10: Expand to Abuja + Oyo
├── Month 11: USSD launch
├── Month 12: 500 merchants, 10,000 tourist transactions
└── Month 12: Break-even target
```

---

## 11. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **CBN PSSP license delayed beyond 6 months** | Medium | High | Start with licensed aggregator (Flutterwave/Paystack) for processing; apply for own license concurrently |
| **CBN FX policy changes** | Medium | High | Maintain 30-day FX buffer, implement real-time CBN rate feed, build corridor kill switch (already exists) |
| **NDPA enforcement on data localization** | High | Medium | Lagos colocation from day 1 — no gap |
| **Low merchant adoption** | Medium | Medium | Zero setup fees for 6 months, QR code deployment team, NTDC endorsement |
| **eNaira adoption lower than expected** | High | Low | eNaira is supplementary — core business runs on NGN bank transfers + OPay |
| **Competition from existing PSPs (Flutterwave, Paystack)** | High | Medium | Tourism-specific features (GDS, BIS, loyalty, channel manager) not available from generic PSPs |
| **Network infrastructure unreliability** | Medium | Medium | Multi-path internet (MainOne + WACS), offline queue + USSD fallback |
| **Naira depreciation impact on USD-denominated costs** | High | Medium | Price in NGN, keep revenue in NGN, hedge USD costs quarterly |
| **Security breach / fraud** | Low | Critical | BIS fraud detection, GNN scoring, kill switch, 24-alert monitoring, pentesting |

---

## Appendix A: Regulatory Contact List

| Entity | Department | Contact Method |
|--------|-----------|---------------|
| CBN | Payment System Management | psmd@cbn.gov.ng |
| CBN | eNaira Unit | enaira@cbn.gov.ng |
| NDPC | Registration | compliance@ndpc.gov.ng |
| SEC | Digital Assets | digitalassets@sec.gov.ng |
| NIBSS | Membership | membership@nibss-plc.com.ng |
| NFIU | Reporting Entity | registration@nfiu.gov.ng |
| NCC | USSD Shortcode | numbering@ncc.gov.ng |
| NIMC | Data Consumer | api@nimc.gov.ng |
| NTDC | Director General | info@tourism.gov.ng |
| CAC | Registration | https://pre.cac.gov.ng |

## Appendix B: Platform Nigeria Readiness Scorecard

| Feature | Ready | Gap |
|---------|-------|-----|
| NGN currency support | ✅ | — |
| Nigerian bank codes (10 banks) | ✅ | — |
| NUBAN account validation | ✅ | — |
| eNaira CBDC support | ⚠️ | Need live CBN API |
| OPay payment rail | ✅ | — |
| Flutterwave rail | ✅ | — |
| NIP (NIBSS) bank transfer | ❌ | Need NIBSS integration |
| BVN/NIN KYC verification | ❌ | Need Smile Identity |
| USSD feature phone | ❌ | Need USSD menu system |
| Nigerian PEP screening | ❌ | Need PEP list provider |
| NFIU SAR reporting | ❌ | Need NFIU format integration |
| Data localization (Lagos) | ❌ | Need Lagos colocation |
| Yoruba/Hausa/Igbo i18n | ❌ | Need translations |
| Diaspora remittance corridors | ✅ | — |
| Travel Rule compliance | ✅ | — |
| Fraud detection (BIS/GNN) | ✅ | — |
| KYC 4-tier system | ✅ | — |
| AES-256-GCM encryption | ✅ | — |
| Audit logging | ✅ | — |
| Kill switch | ✅ | — |

**Score: 13/20 features ready (65%) — 7 gaps require 3-6 months of work**
