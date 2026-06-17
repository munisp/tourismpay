-- Migration: Add missing indices on user_id and status columns for production performance
-- 77 indices across all tables that query by user_id or status
-- Without these, sequential scans on high-traffic tables cause latency spikes at scale

-- ─── Biometric / Auth ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_biometric_enrollments_user_id ON biometric_enrollments (user_id);
CREATE INDEX IF NOT EXISTS idx_login_history_user_id ON login_history (user_id);
CREATE INDEX IF NOT EXISTS idx_pin_lockout_history_user_id ON pin_lockout_history (user_id);
CREATE INDEX IF NOT EXISTS idx_trusted_devices_user_id ON trusted_devices (user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions (user_id);

-- ─── Wallet / Finance ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_wallet_balances_user_id ON wallet_balances (user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_id ON wallet_transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_status ON wallet_transactions (status);
CREATE INDEX IF NOT EXISTS idx_wallet_balance_alerts_user_id ON wallet_balance_alerts (user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_spending_limits_user_id ON wallet_spending_limits (user_id);
CREATE INDEX IF NOT EXISTS idx_finance_requests_user_id ON finance_requests (user_id);
CREATE INDEX IF NOT EXISTS idx_finance_requests_status ON finance_requests (status);
CREATE INDEX IF NOT EXISTS idx_carbon_offsets_user_id ON carbon_offsets (user_id);

-- ─── Stablecoin ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_stablecoin_onramp_orders_user_id ON stablecoin_onramp_orders (user_id);
CREATE INDEX IF NOT EXISTS idx_stablecoin_onramp_orders_status ON stablecoin_onramp_orders (status);
CREATE INDEX IF NOT EXISTS idx_stablecoin_offramp_requests_user_id ON stablecoin_offramp_requests (user_id);
CREATE INDEX IF NOT EXISTS idx_stablecoin_offramp_requests_status ON stablecoin_offramp_requests (status);
CREATE INDEX IF NOT EXISTS idx_stablecoin_limit_orders_user_id ON stablecoin_limit_orders (user_id);
CREATE INDEX IF NOT EXISTS idx_stablecoin_limit_orders_status ON stablecoin_limit_orders (status);
CREATE INDEX IF NOT EXISTS idx_stablecoin_yield_positions_user_id ON stablecoin_yield_positions (user_id);
CREATE INDEX IF NOT EXISTS idx_stablecoin_yield_positions_status ON stablecoin_yield_positions (status);
CREATE INDEX IF NOT EXISTS idx_stablecoin_disputes_user_id ON stablecoin_disputes (user_id);
CREATE INDEX IF NOT EXISTS idx_stablecoin_disputes_status ON stablecoin_disputes (status);
CREATE INDEX IF NOT EXISTS idx_stablecoin_recurring_buys_user_id ON stablecoin_recurring_buys (user_id);
CREATE INDEX IF NOT EXISTS idx_stablecoin_recurring_buys_status ON stablecoin_recurring_buys (status);
CREATE INDEX IF NOT EXISTS idx_stablecoin_price_alerts_user_id ON stablecoin_price_alerts (user_id);
CREATE INDEX IF NOT EXISTS idx_stablecoin_price_alerts_status ON stablecoin_price_alerts (status);
CREATE INDEX IF NOT EXISTS idx_stablecoin_travel_rule_records_user_id ON stablecoin_travel_rule_records (user_id);
CREATE INDEX IF NOT EXISTS idx_stablecoin_user_freezes_user_id ON stablecoin_user_freezes (user_id);

-- ─── Tourist ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tourist_bookings_user_id ON tourist_bookings (user_id);
CREATE INDEX IF NOT EXISTS idx_tourist_bookings_status ON tourist_bookings (status);
CREATE INDEX IF NOT EXISTS idx_tourist_profiles_user_id ON tourist_profiles (user_id);
CREATE INDEX IF NOT EXISTS idx_tourist_reviews_user_id ON tourist_reviews (user_id);
CREATE INDEX IF NOT EXISTS idx_tourist_itineraries_user_id ON tourist_itineraries (user_id);
CREATE INDEX IF NOT EXISTS idx_tourist_itineraries_status ON tourist_itineraries (status);
CREATE INDEX IF NOT EXISTS idx_tourist_itinerary_items_status ON tourist_itinerary_items (status);
CREATE INDEX IF NOT EXISTS idx_tourist_topups_user_id ON tourist_topups (user_id);
CREATE INDEX IF NOT EXISTS idx_tourist_topups_status ON tourist_topups (status);
CREATE INDEX IF NOT EXISTS idx_tourist_deal_redemptions_user_id ON tourist_deal_redemptions (user_id);
CREATE INDEX IF NOT EXISTS idx_tourist_deal_redemptions_status ON tourist_deal_redemptions (status);
CREATE INDEX IF NOT EXISTS idx_tourist_deal_wishlists_user_id ON tourist_deal_wishlists (user_id);
CREATE INDEX IF NOT EXISTS idx_tourist_concierge_sessions_user_id ON tourist_concierge_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_tourist_trip_summaries_user_id ON tourist_trip_summaries (user_id);
CREATE INDEX IF NOT EXISTS idx_itinerary_changelog_user_id ON itinerary_changelog (user_id);
CREATE INDEX IF NOT EXISTS idx_itinerary_collaborators_user_id ON itinerary_collaborators (user_id);

-- ─── Loyalty ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_user_id ON loyalty_transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_referrals_status ON loyalty_referrals (status);
CREATE INDEX IF NOT EXISTS idx_rate_alerts_user_id ON rate_alerts (user_id);
CREATE INDEX IF NOT EXISTS idx_rate_alerts_status ON rate_alerts (status);

-- ─── Liquidity Provider ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_lp_applications_user_id ON lp_applications (user_id);
CREATE INDEX IF NOT EXISTS idx_lp_applications_status ON lp_applications (status);
CREATE INDEX IF NOT EXISTS idx_lp_providers_user_id ON lp_providers (user_id);
CREATE INDEX IF NOT EXISTS idx_lp_providers_status ON lp_providers (status);
CREATE INDEX IF NOT EXISTS idx_lp_positions_user_id ON lp_positions (user_id);
CREATE INDEX IF NOT EXISTS idx_lp_positions_status ON lp_positions (status);
CREATE INDEX IF NOT EXISTS idx_lp_withdrawals_user_id ON lp_withdrawals (user_id);
CREATE INDEX IF NOT EXISTS idx_lp_withdrawals_status ON lp_withdrawals (status);
CREATE INDEX IF NOT EXISTS idx_lp_rebalance_events_status ON lp_rebalance_events (status);

-- ─── Merchant / Settlement ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_settlement_batches_status ON settlement_batches (status);
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_status ON inventory_reservations (status);

-- ─── QR Payments ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_qr_payment_tokens_status ON qr_payment_tokens (status);
CREATE INDEX IF NOT EXISTS idx_qr_payment_receipts_status ON qr_payment_receipts (status);

-- ─── Payment Switch ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ps_api_keys_user_id ON ps_api_keys (user_id);
CREATE INDEX IF NOT EXISTS idx_ps_notification_channels_user_id ON ps_notification_channels (user_id);
CREATE INDEX IF NOT EXISTS idx_ps_reminder_emails_user_id ON ps_reminder_emails (user_id);
CREATE INDEX IF NOT EXISTS idx_ps_reminder_emails_status ON ps_reminder_emails (status);
CREATE INDEX IF NOT EXISTS idx_ps_account_recovery_user_id ON ps_account_recovery (user_id);
CREATE INDEX IF NOT EXISTS idx_ps_account_recovery_status ON ps_account_recovery (status);

-- ─── Mesh / Cross-border ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_mesh_transactions_user_id ON mesh_transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_mesh_transactions_status ON mesh_transactions (status);

-- ─── KYC / KYB / Compliance ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_kyc_verification_records_user_id ON kyc_verification_records (user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_verification_records_status ON kyc_verification_records (status);
CREATE INDEX IF NOT EXISTS idx_verifiable_credentials_user_id ON verifiable_credentials (user_id);
CREATE INDEX IF NOT EXISTS idx_verifiable_credentials_status ON verifiable_credentials (status);

-- ─── BIS / NOC / Smart Contracts ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bis_auto_flags_status ON bis_auto_flags (status);
CREATE INDEX IF NOT EXISTS idx_service_health_history_status ON service_health_history (status);
CREATE INDEX IF NOT EXISTS idx_smart_contract_deployments_status ON smart_contract_deployments (status);
