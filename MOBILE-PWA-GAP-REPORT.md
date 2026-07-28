# TourismPay Mobile App — Remaining PWA Gap Report

**Date:** July 28, 2026  
**Current Parity:** 95% (55 of 58 PWA routes covered)  
**Remaining Gap:** 8 routes across 5 categories  
**Status:** Routes exist in mobile but are significantly less feature-rich than their PWA counterparts

---

## Executive Summary

The native mobile app achieves 95% route-level parity with the PWA. The remaining 8 routes fall into two distinct categories:

1. **Depth gap (5 routes):** The route exists in mobile but the screen covers only 20–40% of the PWA's features. These are the highest-priority items to complete.
2. **Architecture gap (3 routes):** The PWA feature relies on hardware APIs (camera/AR), complex charting libraries, or admin workflows that require a fundamentally different mobile implementation approach.

---

## Gap 1 — Digital Wallet `/wallet` → `DigitalWallet`

### PWA Implementation
The PWA `DigitalWallet.tsx` is the largest page in the codebase at **1,716 lines** with **43 distinct tRPC procedures** wired across 12 functional modules.

| PWA Module | tRPC Procedures | Description |
|---|---|---|
| Multi-currency balances | `wallet.balances`, `wallet.balanceSummary`, `wallet.portfolioSummary` | Live balance cards with 7-day sparklines for USDC, CBDC-NG, XLM, KES, ZAR, NGN, GHS, EGP |
| Send funds | `wallet.send`, `wallet.sendCrossCurrency` | Single and cross-currency transfers with idempotency keys |
| Deposit / Top-up | `wallet.deposit`, `wallet.topUp`, `wallet.stripeCheckout` | Simulation deposit + Stripe card top-up |
| Currency swap | `wallet.swap`, `wallet.convertCurrency` | Real-time FX rate preview before swap |
| Transaction history | `wallet.transactions`, `wallet.searchTransactions`, `wallet.getTransactionCount` | Paginated, searchable, filterable by currency |
| Transaction receipt | `wallet.getTransaction`, `wallet.getTransactionReceipt` | Full receipt with PDF export |
| Spending limits | `wallet.getSpendingLimits`, `wallet.setSpendingLimit`, `wallet.toggleSpendingLimit`, `wallet.deleteSpendingLimit` | Per-currency daily/monthly caps |
| Balance alerts | `wallet.getBalanceAlerts`, `wallet.setBalanceAlert`, `wallet.toggleBalanceAlert`, `wallet.updateBalanceAlert`, `wallet.deleteBalanceAlert`, `wallet.activeAlertBreaches` | Threshold alerts with breach notifications |
| Scheduled payments | `wallet.getScheduledPayments`, `wallet.schedulePayment`, `wallet.pauseScheduledPayment`, `wallet.resumeScheduledPayment`, `wallet.cancelScheduledPayment` | One-time future-dated payments |
| Recurring payments | `wallet.getRecurringPayments`, `wallet.createRecurringPayment`, `wallet.updateRecurringPayment`, `wallet.deleteRecurringPayment` | Weekly/monthly standing orders |
| Spending analytics | `wallet.spendingAnalytics` | Category breakdown chart |
| Statement export | `wallet.exportTransactions`, `wallet.exportStatement`, `wallet.exportStatementPdf` | CSV and PDF export |

**PWA also has 30 TODOs** — primarily around Stripe integration edge cases and cross-currency settlement confirmation flows.

### Mobile Implementation
The mobile `WalletScreen.tsx` covers **5 of 43 tRPC procedures** (12% depth):

| Mobile Feature | Status |
|---|---|
| View balances (multi-currency) | ✅ Implemented |
| Send funds | ✅ Implemented |
| Currency swap with FX preview | ✅ Implemented |
| Transaction history (paginated) | ✅ Implemented |
| FX rate lookup | ✅ Implemented |
| Deposit / Top-up | ❌ Missing |
| Spending limits | ❌ Missing |
| Balance alerts | ❌ Missing |
| Scheduled payments | ❌ Missing |
| Recurring payments | ❌ Missing |
| Spending analytics chart | ❌ Missing |
| Statement export (CSV/PDF) | ❌ Missing |
| Transaction receipt / PDF | ❌ Missing |

### Gap Assessment
**Severity: HIGH.** The wallet is the core financial instrument for tourists. The missing features (scheduled payments, spending limits, balance alerts) are critical for travellers managing foreign currency budgets.

### Implementation Effort
**~400 lines** of additional React Native code. All 43 tRPC procedures already exist in `mobile/src/services/api.ts` (`walletAPI.*`). The work is purely UI — adding modals for each missing feature to the existing `WalletScreen.tsx`.

---

## Gap 2 — Loyalty & Rewards `/loyalty` → `LoyaltyRewards`

### PWA Implementation
The PWA `LoyaltyRewards.tsx` is **694 lines** with **15 tRPC procedures** across 7 sections:

| PWA Section | tRPC Procedures | Description |
|---|---|---|
| Account overview | `loyalty.account` | Points balance, tier (Bronze/Silver/Gold/Platinum), tier progress bar |
| Expiring points warning | `loyalty.getExpiringPoints`, `loyalty.getExpiringRewards` | Countdown banner for points expiring within 30 days |
| Redeem rewards | `loyalty.rewards`, `loyalty.redeem` | Catalogue of redeemable rewards with point costs |
| Partner earn | `loyalty.getPartners`, `loyalty.earnWithPartner` | Earn points at partner establishments |
| Referral programme | `loyalty.getReferrals`, `loyalty.createReferralCode`, `loyalty.applyReferral` | Generate and share referral codes |
| Leaderboard | `loyalty.getLeaderboard` | Top earners across the platform |
| Points history | `loyalty.transactions` | Full transaction log with earn/redeem entries |
| Trip summary reports | `tripSummary.list`, `tripSummary.generate` | AI-generated post-trip spending summaries |

### Mobile Implementation
The mobile `loyalty/LoyaltyScreen.tsx` covers **2 of 15 tRPC procedures** (13% depth):

| Mobile Feature | Status |
|---|---|
| Points balance | ✅ Implemented |
| Tier display | ✅ Implemented |
| Reward catalogue | ✅ Implemented (basic list only) |
| Tier progress bar | ❌ Missing |
| Expiring points warning | ❌ Missing |
| Redeem rewards (action) | ❌ Missing |
| Partner earn opportunities | ❌ Missing |
| Referral programme | ❌ Missing |
| Leaderboard | ❌ Missing |
| Points history / transactions | ❌ Missing |
| Trip summary reports | ❌ Missing |

### Gap Assessment
**Severity: HIGH.** Loyalty is a primary engagement driver for tourists. The referral programme and partner earn features are key commercial differentiators that are entirely absent from mobile.

### Implementation Effort
**~350 lines** of additional React Native code. All tRPC procedures are accessible via `loyaltyAPI.*` in the mobile API service. The work involves expanding `LoyaltyScreen.tsx` with tab navigation and additional sections.

---

## Gap 3 — Cross-Platform Analytics `/analytics` → `CrossPlatformAnalytics`

### PWA Implementation
The PWA `CrossPlatformAnalytics.tsx` is **542 lines** with **6 tRPC procedures** and **5 interactive charts** (Area, Bar, Line, Pie charts via Recharts):

| PWA Feature | tRPC Procedure | Chart Type |
|---|---|---|
| Platform summary KPIs (4 stat cards) | `analytics.crossPlatform` | Stat cards |
| Platform health scores | `analytics.platformHealth` | Horizontal bar chart |
| Daily Active Users by role | `analytics.dauByRole` | Stacked area chart |
| QR payment volume | `analytics.qrVolume` | Line chart |
| KYB completion rate | `analytics.kybRate` | Pie chart |
| Time-series trends (TX volume, revenue, users) | `analytics.timeSeries` | Area + Bar chart |

### Mobile Implementation
The newly created `other/AnalyticsScreen.tsx` is **64 lines** — a thin list wrapper calling `analytics.getCrossPlatformStats` (a single endpoint). It has **no charts** and covers only the KPI summary cards.

### Gap Assessment
**Severity: MEDIUM.** Analytics is an admin/operations tool. The absence of charts is a significant UX degradation but does not block any operational workflow. The data is accessible; it is the visualisation that is missing.

### Implementation Effort
**~200 lines** of additional React Native code using `react-native-svg` and `victory-native` (or `react-native-chart-kit`) for chart rendering. This requires adding a charting dependency to the Expo project.

---

## Gap 4 — Compliance Dashboard `/compliance` → `ComplianceDashboard`

### PWA Implementation
The PWA `ComplianceDashboard.tsx` is **386 lines** with **6 tRPC procedures** across 4 sections:

| PWA Section | tRPC Procedures | Description |
|---|---|---|
| Compliance score distribution | `kybApplications.complianceScoreDistribution` | Bar chart of score buckets |
| Audit log stream | `auditLogs.list` | Live feed of compliance events |
| Pending KYB applications | `kybApplications.listAll` | Quick-action list of submitted applications |
| Platform stats | `kybApplications.stats` | Total approved/rejected/pending counts |
| PDF compliance report | `pythonServices.pdfComplianceReport` | One-click PDF generation via Python ML service |

### Mobile Implementation
The newly created `other/ComplianceScreen.tsx` is **64 lines** — a thin list wrapper calling `compliance.getDashboard`. It has **no chart**, no audit log, no PDF export, and no KYB quick-actions.

### Gap Assessment
**Severity: MEDIUM.** Compliance is a back-office tool used by compliance officers. The thin mobile screen provides read-only access to compliance data but lacks the actionable workflows (PDF report, KYB quick-review) that make the PWA version operationally useful.

### Implementation Effort
**~180 lines** of additional React Native code. All tRPC procedures are available. The PDF export would require `expo-sharing` or `expo-file-system` to handle the download.

---

## Gap 5 — Exchange Rate Overrides `/admin/exchange-rates` → `ExchangeRateOverrides`

### PWA Implementation
The PWA `ExchangeRateOverrides.tsx` is **539 lines** with **5 tRPC procedures** and 3 interactive workflows:

| PWA Feature | tRPC Procedure | Description |
|---|---|---|
| View all rate overrides | `exchangeRateOverrides.list` | Table of active/inactive overrides |
| Create / update override | `exchangeRateOverrides.upsert` | Form with currency pair, rate, spread, validity window |
| Deactivate override | `exchangeRateOverrides.deactivate` | Toggle active/inactive |
| Delete override | `exchangeRateOverrides.delete` | Permanent removal |
| Deviation check | `exchangeRates.checkDeviation` | Validates proposed rate against live market rate |
| AI rate forecast | `pythonServices.ratesForecast` | ML-powered 7-day rate prediction |

### Mobile Implementation
The existing `admin/ExchangeRates.tsx` is a **53-line read-only** list screen using `useApiData` with endpoint `exchangeRates.list`. It has **no create, update, deactivate, delete, deviation check, or forecast** functionality.

### Gap Assessment
**Severity: LOW.** Exchange rate management is an admin-only workflow. The mobile screen provides read access, which is the primary use case for a mobile admin. Write operations (overrides, forecasts) are better suited to the desktop PWA.

### Implementation Effort
**~150 lines** to add a create/edit modal with the upsert mutation and deviation check. The AI forecast is a nice-to-have that can be deferred.

---

## Gap 6 — KYB Document Review `/admin/kyb-documents` → `KybDocumentReview`

### PWA Implementation
The PWA `KybDocumentReview.tsx` is **585 lines** with **2 tRPC mutations** and a document viewer:

| PWA Feature | tRPC Procedure | Description |
|---|---|---|
| Document list with filters | `kybDocuments.list` (via `kyb.listDocuments`) | Filterable by status, business type, date |
| Document viewer | — | In-browser PDF/image preview |
| Single document review | `kybDocuments.review` | Approve/reject with notes |
| Bulk review | `kybDocuments.bulkReview` | Select multiple documents and approve/reject in batch |
| 6 TODOs | — | Document download, signature verification, OCR status display |

### Mobile Implementation
The existing `admin/KYBDocuments.tsx` is a **64-line read-only** list screen. It has **no review actions** (approve/reject), **no document viewer**, and **no bulk operations**.

### Gap Assessment
**Severity: MEDIUM.** KYB document review is a compliance workflow. The inability to approve or reject documents from mobile means compliance officers cannot action KYB reviews on the go, which is a meaningful operational limitation.

### Implementation Effort
**~200 lines** to add approve/reject action buttons per document row with the `kybDocuments.review` mutation. Document preview would require `expo-web-browser` or a WebView for PDF rendering.

---

## Gap 7 — Loyalty Rewards Admin `/admin/loyalty-rewards` → `LoyaltyRewardsAdmin`

### PWA Implementation
The PWA `LoyaltyRewardsAdmin.tsx` is **449 lines** with **6 tRPC procedures**:

| PWA Feature | tRPC Procedure | Description |
|---|---|---|
| Programme list | `loyaltyAdmin.getPrograms` | All active loyalty programmes |
| Create programme | `loyaltyAdmin.createProgram` | New programme with tier thresholds |
| Update programme | `loyaltyAdmin.updateProgram` | Edit tiers, multipliers, expiry rules |
| Deactivate programme | `loyaltyAdmin.deactivateProgram` | Soft-delete |
| Reward catalogue management | `loyaltyAdmin.getRewards`, `loyaltyAdmin.createReward` | Add/remove redeemable rewards |

### Mobile Implementation
The existing `admin/LoyaltyAdmin.tsx` is a **64-line read-only** list screen. It has **no create, update, or deactivate** functionality.

### Gap Assessment
**Severity: LOW.** Programme management is an infrequent admin operation. Read access is sufficient for mobile monitoring. Write operations are better suited to the desktop PWA.

### Implementation Effort
**~150 lines** to add a create/edit modal with the create and update mutations.

---

## Gap 8 — AR Tourism `/ar` → `ARTourism`

### PWA Implementation
The PWA `ARTourism.tsx` is **81 lines** — a relatively thin page that:
- Lists AR-enabled African destinations from `trpc.africa.countries`
- Lists upcoming AR events from `trpc.africa.events`
- Has a "Launch AR" button that calls `window.alert("AR experience launching...")` — **this is a stub** (the actual AR engine is not implemented in the PWA either)

### Mobile Implementation
**No equivalent screen exists.** The mobile app has no AR screen at all.

### Gap Assessment
**Severity: LOW.** The PWA AR feature is itself a stub — the "Launch AR" button shows an alert rather than launching a real AR experience. Neither platform has a functional AR implementation. The data layer (countries, events from `africa.*`) is available.

### Implementation Effort
**~80 lines** to create a simple `ARTourism.tsx` screen that lists AR-enabled destinations and events (matching the PWA's current implementation level). A true AR experience would require `expo-camera` + a WebGL/AR framework such as `ViroReact` or `expo-gl`, which is a multi-week engineering effort beyond the current scope.

---

## Summary Table

| # | PWA Route | Mobile Screen | PWA Lines | Mobile Lines | Depth | Severity | Est. Effort |
|---|---|---|---|---|---|---|---|
| 1 | `/wallet` | `finance/WalletScreen.tsx` | 1,716 | 356 | 12% | **HIGH** | ~400 lines |
| 2 | `/loyalty` | `loyalty/LoyaltyScreen.tsx` | 694 | 57 | 13% | **HIGH** | ~350 lines |
| 3 | `/analytics` | `other/AnalyticsScreen.tsx` | 542 | 64 | 15% | MEDIUM | ~200 lines + charting lib |
| 4 | `/compliance` | `other/ComplianceScreen.tsx` | 386 | 64 | 20% | MEDIUM | ~180 lines |
| 5 | `/admin/kyb-documents` | `admin/KYBDocuments.tsx` | 585 | 64 | 11% | MEDIUM | ~200 lines |
| 6 | `/admin/exchange-rates` | `admin/ExchangeRates.tsx` | 539 | 53 | 10% | LOW | ~150 lines |
| 7 | `/admin/loyalty-rewards` | `admin/LoyaltyAdmin.tsx` | 449 | 64 | 14% | LOW | ~150 lines |
| 8 | `/ar` | *(missing)* | 81 | 0 | 0% | LOW | ~80 lines |

**Total estimated effort to reach 100% parity: ~1,710 lines of React Native code**

---

## Recommended Implementation Order

The following order maximises user-facing value first:

1. **Digital Wallet depth** (Gap 1) — Spending limits, balance alerts, scheduled/recurring payments, statement export. Affects every tourist user on every session.
2. **Loyalty & Rewards depth** (Gap 2) — Referral programme, partner earn, leaderboard. Primary engagement and retention driver.
3. **KYB Document Review actions** (Gap 5) — Approve/reject mutations. Unblocks compliance officers from actioning reviews on mobile.
4. **Analytics charts** (Gap 3) — Add charting library and render the 5 existing chart types.
5. **Compliance Dashboard depth** (Gap 4) — Audit log stream, PDF report, KYB quick-actions.
6. **Exchange Rate Overrides write** (Gap 6) — Create/edit/deactivate modal.
7. **Loyalty Admin write** (Gap 7) — Create/edit programme modal.
8. **AR Tourism screen** (Gap 8) — Destination/event list matching PWA stub level.

---

*Report generated: July 28, 2026 | Repository: munisp/tourismpay | Commit: e93b292*
