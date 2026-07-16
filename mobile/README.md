# InsurePortal Mobile Platform

Cross-platform mobile application for InsurePortal.

## Architecture
- Framework: React Native 0.73 (shared codebase)
- iOS: native-mobile-ios/ (Swift bridging for biometrics)
- Android: insurance-mobile-app/ (Kotlin bridging)
- State Management: Zustand + React Query
- Offline: SQLite + background sync queue

## Next-Gen Offline Features
- **Offline-First Architecture**: All data queries go through local SQLite cache first
- **Background Sync Queue**: Operations are queued when offline and synced when connectivity returns
- **Conflict Resolution**: Client-wins, server-wins, or manual merge strategies
- **Bandwidth-Aware**: Automatically detects 2G/3G/4G and adjusts sync frequency and data payload
- **Priority Queuing**: Critical operations (claims, payments) sync before normal operations
- **Incremental Sync**: Only changed data is transferred, minimizing bandwidth usage

## Screens
- Dashboard (KPIs, quick actions, recent activity)
- Policies (list, filter, search, detail, renewal)
- Claims (list, file new claim, timeline, evidence upload)
- Payments (due premiums, payment methods, history)
- Agent Locator (GPS-based nearby agent search)
- Emergency (contacts, quick claim filing)
- Profile (biometric toggle, language, preferences)
- Login (email/password + biometric authentication)

## Features
- Biometric authentication (fingerprint, face, iris)
- Offline-first with priority-based background sync
- Push notifications (FCM/APNS) — claims, renewals, payments
- Camera integration (claim evidence, document upload)
- Location services (agent geofencing)
- USSD fallback for feature phones
- Multi-language support (English, Hausa, Yoruba, Igbo)

## Communication Channels
- USSD Gateway: *384*100# (session-based, 4 languages)
- WhatsApp Bot: Conversational insurance assistant
- SMS Service: Multi-provider (Termii + Africa's Talking), templated notifications
- Telegram Bot: Full command set, inline keyboards, photo/document/location support

## API Backend
- customer-portal-full/server/ (tRPC)
- agent-mobile-app/ (REST — Go)
- insurance-mobile-app/ (REST — Go)
