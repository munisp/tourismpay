# Mobile Platform

Cross-platform mobile application for InsurePortal.

## Architecture
- Framework: React Native (shared codebase)
- iOS: native-mobile-ios/ (Swift bridging for biometrics)
- Android: insurance-mobile-app/ (Kotlin bridging)
- Flutter: For agent app variant

## Features
- Biometric authentication (fingerprint, face)
- Offline-first with background sync
- Push notifications (FCM/APNS)
- Camera integration (document upload, liveness)
- Location services (agent geofencing)
- USSD fallback for feature phones

## API Backend
- customer-portal-full/server/ (tRPC)
- agent-mobile-app/ (REST)
- insurance-mobile-app/ (REST)
