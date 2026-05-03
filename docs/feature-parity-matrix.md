# TourismPay Cross-Platform Feature Parity Matrix

Last updated: 2026-05-02

## Legend
- Y = Implemented
- P = Partial
- N = Not implemented
- N/A = Not applicable

## Core Features

| Feature | PWA | React Native | Flutter |
|---------|-----|--------------|---------|
| **Authentication** | | | |
| OAuth/SSO Login | Y | Y | Y |
| Demo Login | Y | Y | Y |
| Biometric Auth | Y | Y | Y |
| 2FA (TOTP) | Y | P | P |
| Session Management | Y | Y | Y |
| **Tourist Features** | | | |
| Onboarding Wizard | Y | Y | Y |
| Tourist Portal | Y | Y | Y |
| Trip Itinerary | Y | P | P |
| AR Tourism | Y | N | N |
| DID Identity | Y | P | P |
| Sustainability Tracker | Y | P | P |
| **Wallet & Payments** | | | |
| Digital Wallet | Y | Y | Y |
| QR Code Payments | Y | Y | Y |
| Send/Receive | Y | Y | Y |
| Currency Swap | Y | Y | Y |
| Top Up | Y | Y | Y |
| Spending Limits | Y | P | P |
| Balance Alerts | Y | P | P |
| **Remittance** | | | |
| Create Transfer | Y | Y | Y |
| Corridor Rates | Y | Y | Y |
| Bank Verification | Y | P | P |
| Crypto Remittance | Y | N | N |
| Transaction Export | Y | N | N |
| **Merchant Features** | | | |
| Business Onboarding | Y | P | P |
| Revenue Dashboard | Y | P | P |
| Product Catalog | Y | P | P |
| Staff Management | Y | P | P |
| Cashier Terminal | Y | N | N |
| Booking Inbox | Y | P | P |
| QR Code Generation | Y | Y | Y |
| **Loyalty & Rewards** | | | |
| Points Tracking | Y | Y | Y |
| Tier Progress | Y | Y | Y |
| Referral Program | Y | P | P |
| Leaderboard | Y | P | P |
| **AI & Intelligence** | | | |
| AI Co-Pilot Chat | Y | P | P |
| Exchange Rate ML | Y | N/A | N/A |
| Fraud Detection ML | Y | N/A | N/A |
| **Admin Features** | | | |
| Admin Panel | Y | N/A | N/A |
| User Management | Y | N/A | N/A |
| KYB Applications | Y | N/A | N/A |
| Audit Log | Y | N/A | N/A |
| Service Health | Y | N/A | N/A |
| **Compliance** | | | |
| KYB Document Upload | Y | P | P |
| Compliance Dashboard | Y | N/A | N/A |
| BIS Investigation | Y | N/A | N/A |
| **PaymentSwitch** | | | |
| NOC Dashboard | Y | N/A | N/A |
| Settlement Console | Y | N/A | N/A |
| Kill Switch | Y | N/A | N/A |
| Rate Limits | Y | N/A | N/A |
| **Offline Support** | | | |
| Service Worker Cache | Y | N/A | N/A |
| IndexedDB Queue | Y | N/A | N/A |
| Background Sync | Y | N/A | N/A |
| SQLite Offline DB | N/A | Y | Y |
| Connectivity Monitor | Y | Y | Y |
| **Notifications** | | | |
| Push Notifications | Y | Y | Y |
| In-App Notifications | Y | Y | Y |
| Email Notifications | Y | Y | Y |
| SMS Alerts | Y | P | P |
| **i18n** | | | |
| English | Y | Y | Y |
| French | Y | P | P |
| Portuguese | Y | P | P |
| Swahili | Y | P | P |
| Arabic (RTL) | Y | N | N |
| **Accessibility** | | | |
| Screen Reader | Y | P | P |
| Keyboard Navigation | Y | N/A | N/A |
| Skip Navigation | Y | N/A | N/A |
| ARIA Labels | Y | N/A | N/A |

## Coverage Summary

| Platform | Implemented | Partial | Not Implemented | Total | Coverage |
|----------|-------------|---------|-----------------|-------|----------|
| PWA | 52 | 0 | 0 | 52 | 100% |
| React Native | 22 | 18 | 5 | 45 | 49% |
| Flutter | 22 | 16 | 7 | 45 | 49% |

## Priority Gaps for Mobile

1. **Trip Itinerary** — Full CRUD on mobile (currently read-only)
2. **Remittance Export** — PDF/Excel generation on mobile
3. **Merchant Cashier** — POS terminal mode for tablets
4. **AR Tourism** — Camera-based AR features for native apps
5. **i18n Arabic** — RTL layout support for React Native/Flutter
