# TourismPay User Manual Update
**Platform Version:** 2.0 (100/100 Production Readiness)  
**Date:** 2026-07-25  

This manual details the new features and administrative capabilities introduced in the latest platform update. Six new core modules have been integrated, providing advanced AI capabilities, cross-border remittance, disaster recovery management, and granular user preferences.

---

## 1. AI Co-Pilot & Chat Widget

The platform now features a persistent, context-aware AI assistant powered by the new `aiChat` module.

**How to Use:**
1. Click the floating AI icon in the bottom right corner of any dashboard.
2. The AI is context-aware. If you are on the **Fraud Monitor** page, you can ask, *"Summarize the latest anomalies,"* and it will analyze recent data.
3. If you are on the **Trip Planner**, you can ask for itinerary recommendations, and it will query the database for local Nigerian tourist attractions.

**Behind the Scenes:** The AI automatically routes your queries to the appropriate Large Language Model (LLM). It uses the cloud-based Forge API for complex reasoning and falls back to local, privacy-preserving CPU inference (via Ollama) for sensitive data.

---

## 2. Cross-Border Remittance

A dedicated portal for managing international money transfers is now available under **Wallet > Remittance**.

**Features:**
* **Partner Rates:** View real-time exchange rates and fees from integrated partners (Wise, Remitly, WorldRemit, Sendwave, MoneyGram).
* **Transfer History:** Track the status of all inbound and outbound wire transfers across specific corridors (e.g., NG-GB, KE-US).
* **Analytics:** View interactive charts detailing your total remittance volume and fees paid over 7-day, 30-day, and 90-day periods.

---

## 3. Advanced Audit Trail Export

For compliance officers and administrators, the Audit Trail has been significantly upgraded.

**How to Access:** Navigate to **Admin Panel > Security > Audit Trail**.
**Features:**
* **Granular Filtering:** Filter thousands of system events by Actor ID, Action Type (e.g., `wallet.topup.request`, `fraud.status.update`), or Resource Type.
* **Compliance Export:** Export filtered audit logs to CSV or PDF formats for regulatory submission.
* **Activity Analytics:** View high-level metrics, including the top 10 most frequent actions and the most accessed resources.

---

## 4. Backup & Disaster Recovery (DR)

Administrators now have direct control over database snapshots and failover testing.

**How to Access:** Navigate to **Admin Panel > Infrastructure > Backup & DR**.
**Features:**
* **Manual Snapshots:** Trigger immediate full, incremental, or snapshot backups of the PostgreSQL database.
* **Failover Testing:** Initiate a non-disruptive, read-only failover test to the secondary replica region (e.g., `eu-west-1`). The system will provide an estimated Recovery Time Objective (RTO) and a test ID for tracking.

---

## 5. System Configuration

Global platform settings can now be managed without code deployments.

**How to Access:** Navigate to **Admin Panel > System Settings**.
**Features:**
* **Feature Toggles:** Enable or disable major platform features (e.g., Crypto Wallets, eNaira Integration, Loyalty Programs).
* **Compliance Thresholds:** Adjust critical risk parameters, such as the CBN CTR (Currency Transaction Report) threshold or the AI Fraud Score threshold.
* **Operational Limits:** Modify daily transaction limits or commission percentages globally.

---

## 6. Granular Notification Preferences

Users now have complete control over how and when they receive alerts.

**How to Access:** Navigate to **Settings > Notifications**.
**Features:**
* **Channel Toggles:** Independently enable or disable Email, Push, SMS, and In-App notifications for 7 distinct categories (Payments, Security, KYB, Fraud, Payouts, Promotions, System).
* **Quiet Hours:** Set a "Do Not Disturb" window (e.g., 10:00 PM to 6:00 AM) during which non-critical alerts are suppressed.
* **Digest Mode:** Switch from real-time alerts to hourly, daily, or weekly summaries to reduce notification fatigue.
