# TourismPay Platform — User Journey Test Report

**Date:** July 28, 2026  
**Platform:** https://tourismpay.servers.upi.dev/  
**Test User:** Patrick Munis (admin@tourismpay.io) — Admin role  
**Commits:** `92f3df9`, `c570923`, `6b89547` on `munisp/tourismpay` `main` branch

---

## Executive Summary

A comprehensive audit of all 25+ user journeys on the TourismPay platform was conducted. Two critical bugs were identified and fixed in the source code, and three previously reported issues were confirmed fixed. The live site is running the previous build (`index-B5DBeNvG.js`); all fixes are committed to GitHub and will take effect on the next server rebuild.

---

## Bugs Found and Fixed

### Bug 1 — Critical: BIS Investigation Detail Page Crash (React Error #310)

**Severity:** Critical — page crashes with a white error screen after submitting any investigation.

**Root Cause:** In `BISInvestigationDetail.tsx`, React hooks (`useState`, `useQuery`, `useMutation`, `useAuth`, etc.) were declared **after** conditional early `return` statements. This violates React's Rules of Hooks, which require all hooks to be called unconditionally in the same order on every render. When the page transitioned from the loading state to the loaded state, React detected a different number of hooks and threw error #310.

**Fix Applied:** All hook declarations were moved to the top of the component function, before any early returns. The early returns (`if (!id)`, `if (isLoading)`, `if (!inv)`) were relocated to after all hooks. References to `inv.id` within hook arguments were updated to use optional chaining (`inv?.id ?? 0`) with `enabled: !!inv` guards to prevent queries from firing when `inv` is undefined.

**File:** `client/src/pages/bis/BISInvestigationDetail.tsx`  
**Commit:** `92f3df9`

---

### Bug 2 — High: Blank Page on Role-Protected Routes During Auth Loading

**Severity:** High — any role-protected page (Africa Registry, BIS pages, Merchant pages, Security pages) renders a completely blank white/dark page for 3–8 seconds after navigation, then loads correctly.

**Root Cause:** The `RoleGuard` component returned `null` while `loading` was `true` (i.e., while the `auth.me` tRPC query was resolving). This caused a blank viewport during the auth state determination window, which on the remote server takes 3–8 seconds due to network latency. Users would see nothing and assume the page was broken.

**Fix Applied:** Changed `if (loading) return null` to return a centered `<Loader2>` spinner, giving users clear visual feedback that the page is loading rather than a blank screen.

**File:** `client/src/components/RoleGuard.tsx`  
**Commit:** `92f3df9`

---

## Previously Fixed Issues (Confirmed Working)

The following issues were fixed in earlier commits (`6b89547`, `c570923`) and confirmed working during this test session:

| Issue | Fix | Status |
|---|---|---|
| Notification Settings stuck on "Loading preferences..." | Changed `isLoading` guard to `isFetched` pattern | **Confirmed Fixed** |
| Privacy Settings stuck on loading spinner | Same `isFetched` pattern | **Confirmed Fixed** |
| Biometric Settings stuck on loading spinner | Same `isFetched` pattern | **Confirmed Fixed** |
| Sidebar nav items truncated ("Stablecoin Ap", "Notificatio...") | Fixed `min-h-0` on sidebar flex container | **Confirmed Fixed** |
| Sidebar not scrollable on remote server | Added proper `overflow-y-auto` with height constraints | **Confirmed Fixed** |
| Stablecoin Swap tab bar overflow | Added `overflow-x-auto flex-nowrap min-w-0 flex-shrink-0` | **Confirmed Fixed** |
| Dashboard "Refreshing..." stuck permanently | Changed to `isFetched` check | **Confirmed Fixed** |

---

## Full Journey Test Results

| # | Journey | URL | Status | Notes |
|---|---|---|---|---|
| 1 | **Login (Admin)** | `/login` | **PASS** | Pre-filled credentials, one-click sign in, redirects to dashboard |
| 2 | **Dashboard** | `/` | **PASS** | FX ticker live, Quick Actions work, Platform Health shows OK |
| 3 | **AI Co-Pilot** | `/copilot` | **PARTIAL** | UI renders correctly; chat fails with "internal error" — `BUILT_IN_FORGE_API_KEY` not set in server environment (config issue, not code bug) |
| 4 | **Digital Wallet** | `/wallet` | **PASS** | $800 USDC balance, 1 transaction, Send/Receive/Swap/Deposit buttons all open correct modals |
| 5 | **Send Funds (Wallet)** | `/wallet` → Send modal | **PASS** | Currency selector, amount, recipient, note fields all functional |
| 6 | **Stablecoin Swap** | `/wallet/stablecoin` | **PASS** | All 10 tabs scroll correctly, Buy/Sell/Swap forms render |
| 7 | **Loyalty & Rewards** | `/loyalty` | **PASS** | Points balance, tier progress, referral code generator, leaderboard all render |
| 8 | **Tourist Experience** | `/tourist` | **PASS** | "Hello, Patrick" greeting, category filters, Discover/Map/History tabs |
| 9 | **Tourist Onboarding Wizard** | `/tourist/onboarding` | **PASS** | 4-step wizard (Profile → Card → Wallet → Done), step 2 renders with card form |
| 10 | **Embedded Finance** | `/finance` | **PASS** | Payouts/Loans/Insurance tabs, payout request form, history table |
| 11 | **Merchant Revenue Dashboard** | `/merchant/revenue` | **PASS** | KYB status banner, onboarding progress (2/6), revenue charts, KPI cards |
| 12 | **Merchant QR Codes** | `/merchant/qr` | **PASS** | Generate QR Code button opens modal, QR created successfully with toast notification |
| 13 | **BIS Investigation Create** | `/bis/new` | **PASS** | 3-step form (Subject Details → Tier → Consent), investigation submitted as BIS-2026-2927 |
| 14 | **BIS Investigation Detail** | `/bis/50` | **FIXED** | Was crashing with React error #310; fix committed to GitHub, pending server rebuild |
| 15 | **BIS Dashboard** | `/bis` | **PASS** | Risk trend chart, risk distribution chart, status summary, investigations table |
| 16 | **Africa Registry** | `/africa/registry` | **PASS** | 12 active countries, 1,266 establishments, 41 tourism events, 94.2% compliance rate |
| 17 | **Compliance Dashboard** | `/compliance` | **PASS** | KYB queue link, audit log link, compliance score distribution, quick actions |
| 18 | **KYB Applications** | `/admin/kyb-applications` | **PASS** | Search, filter tabs (All/Draft/Submitted/Under Review/Approved/Rejected), applications table |
| 19 | **Fraud Monitor** | `/security/fraud` | **PASS** | LIVE SSE stream, alert timeline chart, severity breakdown, 0 alerts |
| 20 | **Admin Panel** | `/admin` | **PASS** | User table with 3 users (admin, merchant, tourist), search, role filter |
| 21 | **Service Health** | `/admin/service-health` | **PASS** | Configured services stat cards, response time history chart, time range selector |
| 22 | **Notification Settings** | `/settings/notifications` | **PASS** | All 6 category toggles, 3 delivery channels, tourist/merchant alerts, quiet hours |
| 23 | **Privacy Settings** | `/settings/privacy` | **PASS** | Privacy toggles render without spinner |
| 24 | **Biometric Security** | `/settings/biometric` | **PASS** | Biometric settings render without spinner |
| 25 | **Global Search** | Header search bar | **PASS** | Search input opens dropdown, accepts text input |

---

## Issues Requiring Server-Side Action

The following issues cannot be fixed by frontend code changes alone:

| Issue | Root Cause | Action Required |
|---|---|---|
| AI Co-Pilot chat fails | `BUILT_IN_FORGE_API_KEY` environment variable not set on the server | Set `BUILT_IN_FORGE_API_KEY` in the server's `.env` file |
| BIS Investigation Detail crash (live site) | Live site running old bundle `index-B5DBeNvG.js` | Run `./deploy.sh` or rebuild Docker container to pick up commit `92f3df9` |
| Auth loading delay (3–8s blank/spinner) | `auth.me` tRPC query latency on remote server | Partially mitigated by RoleGuard spinner fix; further improvement possible with session caching |

---

## UI/UX Observations

The platform's dark-mode PWA aesthetic is consistent across all pages. The FX rate ticker in the header provides real-time market data and is visually engaging. The sidebar navigation correctly shows role-appropriate sections for the admin user. The Emergency SOS button is present on all pages. The notification bell correctly shows unread count (10 notifications). The language selector and theme toggle both function correctly.

One minor UX improvement opportunity: the sidebar "KYB Onboarding2" label in the Africa Expansion section has a stray "2" suffix that should be removed. This appears to be a label typo in the nav items definition.

---

## Recommendation

Run `./deploy.sh` on the production server to rebuild the Docker container from the latest `main` branch. This will activate all fixes including the BIS Investigation Detail crash fix and the RoleGuard loading spinner improvement.
