-- ============================================================================
-- TourismPay: Comprehensive Data Flow Seed Script
-- Ensures consistent data flow through ALL platform features — no orphans
-- ============================================================================

BEGIN;

-- ─── Phase 1: Redistribute establishment ownership to actual merchants ───────
UPDATE establishments SET owner_id = 2 WHERE id IN (1, 7);  -- Serena Safari + Nairobi Adventures → Amara (KE)
UPDATE establishments SET owner_id = 3 WHERE id = 2;         -- Cape Town Heritage → Thabo (ZA)
UPDATE establishments SET owner_id = 4 WHERE id = 3;         -- Riad Al-Andalus → Fatima (MA)
UPDATE establishments SET owner_id = 7 WHERE id = 4;         -- Zanzibar Beach → Baraka (TZ)
UPDATE establishments SET owner_id = 8 WHERE id = 5;         -- Pyramids View → Nour (EG)
UPDATE establishments SET owner_id = 2 WHERE id = 6;         -- Lagos Spice → Amara (multi-property)
UPDATE establishments SET owner_id = 2 WHERE id = 8;         -- Accra Craft → Amara

-- ─── Phase 2: Remove duplicate merchant_products from second seed ────────────
DELETE FROM merchant_products WHERE id IN (16, 17, 18, 19, 20, 21);

-- ─── Phase 3: Link tourist bookings to actual merchant products ──────────────
UPDATE tourist_bookings SET product_id = 1 WHERE id = 1;
UPDATE tourist_bookings SET product_id = 5 WHERE id = 2;
UPDATE tourist_bookings SET product_id = 10 WHERE id = 3;
UPDATE tourist_bookings SET product_id = 3 WHERE id = 4;
UPDATE tourist_bookings SET product_id = 8 WHERE id = 5;
UPDATE tourist_bookings SET product_id = 12 WHERE id = 6;
UPDATE tourist_bookings SET product_id = 14 WHERE id = 7;
UPDATE tourist_bookings SET product_id = 11 WHERE id = 8;
UPDATE tourist_bookings SET product_id = 13 WHERE id = 9;
UPDATE tourist_bookings SET product_id = 15 WHERE id = 10;

-- ─── Phase 4: Tourist profiles ───────────────────────────────────────────────
INSERT INTO tourist_profiles (user_id, home_currency, home_country, preferred_language, linked_card_last4, linked_card_brand, onboarding_completed)
VALUES
  (5, 'USD', 'US', 'en', '4242', 'visa', true),
  (6, 'GHS', 'GH', 'en', '8765', 'mastercard', true),
  (9, 'NGN', 'NG', 'en', '1234', 'visa', true)
ON CONFLICT DO NOTHING;

-- ─── Phase 5: Tourist reviews for completed bookings ─────────────────────────
INSERT INTO tourist_reviews (user_id, establishment_id, booking_id, rating, title, body, tags, photos, helpful_votes, is_verified_purchase)
VALUES
  (5, 6, 9, 5, 'Best Jollof Rice in Lagos!',
   'Absolutely incredible flavours. The chef came out to greet us and explained the spice blend. Will definitely return on my next trip to Nigeria.',
   '["authentic","friendly","value"]'::jsonb, '[]'::jsonb, 12, true),
  (9, 8, 10, 4, 'Beautiful Kente craftsmanship',
   'Amazing quality and the artisans were happy to explain the patterns and their meanings. Slightly pricey but worth it for authentic handmade goods.',
   '["authentic","cultural","quality"]'::jsonb, '[]'::jsonb, 8, true),
  (9, 5, 6, 5, 'Stunning Pyramid views',
   'Woke up to the most breathtaking view of the pyramids. Room was clean and staff were incredibly helpful with arranging tours.',
   '["views","clean","helpful_staff"]'::jsonb, '[]'::jsonb, 15, true),
  (5, 1, 1, 5, 'Safari of a lifetime at Serena',
   'The Deluxe Safari Tent was luxurious yet connected to nature. Saw the Big Five on our first game drive.',
   '["wildlife","luxury","guides"]'::jsonb, '[]'::jsonb, 22, true),
  (6, 2, 2, 4, 'Cape Town heritage charm',
   'Beautiful colonial architecture blended with modern comfort. The Table Mountain hike arranged by the lodge was spectacular.',
   '["architecture","location","breakfast"]'::jsonb, '[]'::jsonb, 9, true);

-- ─── Phase 6: Tourist itineraries with items ─────────────────────────────────
-- Use DO block to capture generated itinerary IDs
DO $$
DECLARE
  itin1_id int;
  itin2_id int;
  itin3_id int;
BEGIN
  INSERT INTO tourist_itineraries (user_id, title, destination, start_date, end_date, items, budget_usd, is_public, status, currency, description)
  VALUES (5, 'East Africa Explorer', 'Kenya & Tanzania', '2025-08-01', '2025-08-10',
    '[]'::jsonb, 4500.00, true, 'confirmed', 'USD',
    'Safari in Masai Mara, explore Nairobi, cross to Zanzibar for beach days')
  RETURNING id INTO itin1_id;

  INSERT INTO tourist_itineraries (user_id, title, destination, start_date, end_date, items, budget_usd, is_public, status, currency, description)
  VALUES (6, 'West Africa Cultural Tour', 'Ghana & Morocco', '2025-09-15', '2025-09-22',
    '[]'::jsonb, 3200.00, false, 'draft', 'USD',
    'Accra markets, Cape Coast castle, then fly to Marrakech for the souks')
  RETURNING id INTO itin2_id;

  INSERT INTO tourist_itineraries (user_id, title, destination, start_date, end_date, items, budget_usd, is_public, status, currency, description)
  VALUES (9, 'North Africa Discovery', 'Egypt & Morocco', '2025-10-05', '2025-10-14',
    '[]'::jsonb, 5000.00, true, 'confirmed', 'USD',
    'Pyramids, Luxor temples, then Marrakech medina and Atlas Mountains')
  RETURNING id INTO itin3_id;

  INSERT INTO tourist_itinerary_items (itinerary_id, day_number, order_in_day, establishment_id, booking_id, title, notes, start_time, end_time, estimated_cost_usd, item_type, status)
  VALUES
    (itin1_id, 1, 1, 1, 1, 'Check in at Serena Safari Lodge', 'Deluxe tent booked', '14:00', '15:00', 450.00, 'accommodation', 'confirmed'),
    (itin1_id, 2, 1, 1, 4, 'Full Day Game Drive', 'Big Five game drive with guide', '06:00', '16:00', 150.00, 'activity', 'confirmed'),
    (itin1_id, 3, 1, 7, 7, '3-Day Masai Mara Safari', 'Extended safari package', '07:00', '18:00', 890.00, 'activity', 'confirmed'),
    (itin1_id, 6, 1, NULL, NULL, 'Flight to Zanzibar', 'Kenya Airways KQ450', '10:00', '13:00', 280.00, 'transport', 'planned'),
    (itin1_id, 7, 1, 6, 9, 'Lagos Spice Kitchen dinner', 'Jollof rice platter', '19:00', '21:00', 75.00, 'meal', 'completed'),
    (itin2_id, 1, 1, 8, NULL, 'Accra Craft Market visit', 'Browse kente cloth and beads', '10:00', '14:00', 150.00, 'activity', 'planned'),
    (itin2_id, 3, 1, 3, 5, 'Check in at Riad Al-Andalus', 'Royal Suite booked', '15:00', '16:00', 250.00, 'accommodation', 'planned'),
    (itin2_id, 4, 1, 3, NULL, 'Medina Walking Tour', 'Guided tour of Marrakech medina', '09:00', '13:00', 45.00, 'activity', 'planned'),
    (itin3_id, 1, 1, 5, 6, 'Check in at Pyramids View Hotel', 'Room with pyramid view', '14:00', '15:00', 200.00, 'accommodation', 'confirmed'),
    (itin3_id, 2, 1, NULL, NULL, 'Giza Pyramids & Sphinx Tour', 'Private guided tour', '08:00', '14:00', 120.00, 'activity', 'confirmed'),
    (itin3_id, 5, 1, 4, 3, 'Zanzibar Beachfront Villa', 'Beachfront relaxation', '12:00', '12:00', 550.00, 'accommodation', 'confirmed');
END;
$$;

-- ─── Phase 7: Tourist budgets (matches actual table schema) ──────────────────
INSERT INTO tourist_budgets (user_id, daily_limit_usd, weekly_limit_usd, trip_limit_usd, alert_at_80_percent, alert_at_100_percent, categories)
VALUES
  (5, 300.00, 1800.00, 4500.00, true, true, '{"accommodation": 2000, "activities": 1500, "food": 500, "transport": 500}'::jsonb),
  (6, 250.00, 1500.00, 3200.00, true, true, '{"accommodation": 1200, "activities": 800, "food": 600, "shopping": 600}'::jsonb),
  (9, 350.00, 2100.00, 5000.00, true, true, '{"accommodation": 2500, "activities": 1200, "food": 700, "transport": 600}'::jsonb)
ON CONFLICT (user_id) DO NOTHING;

-- ─── Phase 8: Tourist deal redemptions ───────────────────────────────────────
INSERT INTO tourist_deal_redemptions (user_id, deal_id, establishment_id, redemption_code, status, redeemed_at, confirmed_at, confirmed_by)
VALUES
  (5, 1, 1, 'MARA-2025-XK7P', 'confirmed', NOW() - interval '5 days', NOW() - interval '4 days', 2),
  (6, 2, 2, 'CAPE-2025-QR3M', 'confirmed', NOW() - interval '3 days', NOW() - interval '2 days', 3),
  (9, 3, 4, 'ZNZ-2025-DV8N', 'redeemed', NOW() - interval '1 day', NULL, NULL);

-- Update deal redemption counts
UPDATE tourist_deals SET redemption_count = redemption_count + 1 WHERE id IN (1, 2, 3);

-- ─── Phase 9: Tourist deal wishlists ─────────────────────────────────────────
INSERT INTO tourist_deal_wishlists (user_id, deal_id)
VALUES (5, 3), (5, 4), (6, 1), (6, 4), (9, 2);

-- ─── Phase 10: Tourist trip summaries (matches actual columns) ───────────────
INSERT INTO tourist_trip_summaries (user_id, date_from, date_to, total_spent_usd, total_points_earned, payment_count, establishment_count)
VALUES
  (5, '2025-06-01', '2025-06-03', 375.00, 150, 3, 1),
  (9, '2025-05-10', '2025-05-17', 1850.00, 800, 5, 2);

-- ─── Phase 11: Tourist top-ups (matches actual columns) ─────────────────────
INSERT INTO tourist_topups (user_id, amount_usd, target_currency, fx_rate, credited_amount, stripe_session_id, status)
VALUES
  (5, 500.00, 'USD', 1.0, 500.00, 'cs_test_james_001', 'completed'),
  (5, 200.00, 'KES', 129.50, 25900.00, NULL, 'completed'),
  (6, 300.00, 'USD', 1.0, 300.00, 'cs_test_aisha_001', 'completed'),
  (6, 150.00, 'GHS', 14.80, 2220.00, NULL, 'completed'),
  (9, 1000.00, 'USD', 1.0, 1000.00, 'cs_test_kwame_001', 'completed'),
  (9, 250.00, 'NGN', 1550.00, 387500.00, NULL, 'completed');

-- ─── Phase 12: KYB Documents ─────────────────────────────────────────────────
INSERT INTO kyb_documents (application_id, establishment_id, uploaded_by, document_type, status, file_name, file_key, file_url, mime_type, file_size_bytes)
VALUES
  (1, 1, 2, 'certificate_of_incorporation', 'verified', 'serena_cert.pdf', 'docs/est_1/cert.pdf', '/storage/docs/est_1/cert.pdf', 'application/pdf', 245000),
  (1, 1, 2, 'business_license', 'verified', 'serena_license.pdf', 'docs/est_1/license.pdf', '/storage/docs/est_1/license.pdf', 'application/pdf', 180000),
  (1, 1, 2, 'tax_certificate', 'verified', 'serena_tax.pdf', 'docs/est_1/tax.pdf', '/storage/docs/est_1/tax.pdf', 'application/pdf', 120000),
  (2, 2, 3, 'certificate_of_incorporation', 'verified', 'capetown_cert.pdf', 'docs/est_2/cert.pdf', '/storage/docs/est_2/cert.pdf', 'application/pdf', 210000),
  (2, 2, 3, 'business_license', 'verified', 'capetown_license.pdf', 'docs/est_2/license.pdf', '/storage/docs/est_2/license.pdf', 'application/pdf', 195000),
  (3, 3, 4, 'certificate_of_incorporation', 'verified', 'riad_cert.pdf', 'docs/est_3/cert.pdf', '/storage/docs/est_3/cert.pdf', 'application/pdf', 230000),
  (3, 3, 4, 'tax_certificate', 'verified', 'riad_tax.pdf', 'docs/est_3/tax.pdf', '/storage/docs/est_3/tax.pdf', 'application/pdf', 155000),
  (4, 4, 7, 'certificate_of_incorporation', 'verified', 'zanzibar_cert.pdf', 'docs/est_4/cert.pdf', '/storage/docs/est_4/cert.pdf', 'application/pdf', 198000),
  (4, 4, 7, 'business_license', 'verified', 'zanzibar_license.pdf', 'docs/est_4/license.pdf', '/storage/docs/est_4/license.pdf', 'application/pdf', 175000),
  (4, 4, 7, 'bank_statement', 'verified', 'zanzibar_bank.pdf', 'docs/est_4/bank.pdf', '/storage/docs/est_4/bank.pdf', 'application/pdf', 340000),
  (6, 6, 2, 'certificate_of_incorporation', 'pending', 'lagos_cert.pdf', 'docs/est_6/cert.pdf', '/storage/docs/est_6/cert.pdf', 'application/pdf', 225000),
  (6, 6, 2, 'business_license', 'pending', 'lagos_license.pdf', 'docs/est_6/license.pdf', '/storage/docs/est_6/license.pdf', 'application/pdf', 190000);

-- ─── Phase 13: Notification preferences ──────────────────────────────────────
INSERT INTO notification_preferences (user_id, bis_enabled, kyb_enabled, fraud_enabled, soc_enabled, system_enabled, report_enabled, wishlist_expiry_alerts, in_app_enabled, email_enabled)
VALUES
  (1, true, true, true, true, true, true, false, true, true),
  (2, true, true, true, false, true, true, false, true, true),
  (3, true, true, true, false, true, true, false, true, false),
  (5, false, false, false, false, true, false, true, true, true),
  (6, false, false, false, false, true, false, true, true, false),
  (9, false, false, false, false, true, false, true, true, true),
  (10, true, true, true, true, true, true, false, true, true),
  (11, true, true, true, true, true, true, false, true, true)
ON CONFLICT (user_id) DO NOTHING;

-- ─── Phase 14: Merchant payout schedules ─────────────────────────────────────
INSERT INTO merchant_payout_schedules (merchant_id, frequency, preferred_day, is_active, next_run_at, last_run_at)
VALUES
  (2, 'weekly', 1, true, NOW() + interval '3 days', NOW() - interval '4 days'),
  (3, 'monthly', 15, true, NOW() + interval '20 days', NOW() - interval '10 days'),
  (4, 'weekly', 5, true, NOW() + interval '1 day', NOW() - interval '6 days'),
  (7, 'daily', 0, true, NOW() + interval '1 day', NOW() - interval '1 day'),
  (8, 'monthly', 1, true, NOW() + interval '25 days', NULL);

-- ─── Phase 15: Exchange rate overrides ───────────────────────────────────────
INSERT INTO exchange_rate_overrides (base_currency, target_currency, rate, reason, is_active, created_by_user_id, created_at, updated_at)
VALUES
  ('USD', 'NGN', 1550.00, 'Stabilized corridor rate for Nigerian tourism payments', true, 1, (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint, (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint),
  ('USD', 'KES', 129.50, 'Kenya tourism season promotional rate', true, 1, (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint, (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint),
  ('USD', 'ZAR', 18.25, 'South Africa bilateral agreement rate', true, 1, (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint, (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint),
  ('USD', 'GHS', 14.80, 'Ghana mobile money corridor rate', true, 1, (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint, (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint),
  ('USD', 'TZS', 2650.00, 'Tanzania tourism board partnership rate', false, 1, (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint, (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint);

-- ─── Phase 16: Remittances ───────────────────────────────────────────────────
INSERT INTO remittances (id, user_id, sender_currency, sender_amount, recipient_currency, recipient_amount, exchange_rate, fee, status, delivery_option, recipient_phone, recipient_name, recipient_bank, recipient_account, mojaloop_ref, created_at, updated_at, completed_at)
VALUES
  ('rem-001', 5, 'USD', 500.00, 'KES', 64750.00, 129.50, 2.50, 'completed', 'mobile_money', '+254712345678', 'Grace Wanjiku', NULL, NULL, 'MOJA-KE-001', (EXTRACT(EPOCH FROM NOW() - interval '20 days') * 1000)::bigint, (EXTRACT(EPOCH FROM NOW() - interval '20 days') * 1000)::bigint, (EXTRACT(EPOCH FROM NOW() - interval '20 days') * 1000)::bigint),
  ('rem-002', 9, 'USD', 1000.00, 'NGN', 1550000.00, 1550.00, 5.00, 'completed', 'bank_transfer', NULL, 'Chinedu Okafor', 'First Bank Nigeria', '0123456789', 'MOJA-NG-001', (EXTRACT(EPOCH FROM NOW() - interval '15 days') * 1000)::bigint, (EXTRACT(EPOCH FROM NOW() - interval '15 days') * 1000)::bigint, (EXTRACT(EPOCH FROM NOW() - interval '15 days') * 1000)::bigint),
  ('rem-003', 6, 'USD', 300.00, 'GHS', 4440.00, 14.80, 1.50, 'completed', 'mobile_money', '+233201234567', 'Ama Mensah', NULL, NULL, 'MOJA-GH-001', (EXTRACT(EPOCH FROM NOW() - interval '10 days') * 1000)::bigint, (EXTRACT(EPOCH FROM NOW() - interval '10 days') * 1000)::bigint, (EXTRACT(EPOCH FROM NOW() - interval '10 days') * 1000)::bigint),
  ('rem-004', 5, 'USD', 200.00, 'KES', 25900.00, 129.50, 1.00, 'processing', 'bank_transfer', NULL, 'John Mwalimu', 'CRDB Bank', '987654321', NULL, (EXTRACT(EPOCH FROM NOW() - interval '1 day') * 1000)::bigint, (EXTRACT(EPOCH FROM NOW() - interval '1 day') * 1000)::bigint, NULL),
  ('rem-005', 9, 'NGN', 750000.00, 'USD', 483.87, 0.000645, 3.00, 'pending', 'wallet', NULL, 'Self Transfer', NULL, NULL, NULL, (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint, (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint, NULL);

-- ─── Phase 17: Wallet balances for admin user (id=11) ────────────────────────
INSERT INTO wallet_balances (id, user_id, currency, balance, locked_balance, wallet_address, network, created_at, updated_at)
VALUES
  (gen_random_uuid()::text, '11', 'USDC', '25000.000000', '0', 'tp_usdc_11_admin', 'Stellar / Ethereum', EXTRACT(EPOCH FROM NOW())::int, EXTRACT(EPOCH FROM NOW())::int),
  (gen_random_uuid()::text, '11', 'USD', '45000.000000', '0', 'tp_usd_11_admin', 'SWIFT', EXTRACT(EPOCH FROM NOW())::int, EXTRACT(EPOCH FROM NOW())::int),
  (gen_random_uuid()::text, '11', 'CBDC-NG', '5000000.000000', '0', 'tp_cbdc_ng_11_admin', 'CBN Digital', EXTRACT(EPOCH FROM NOW())::int, EXTRACT(EPOCH FROM NOW())::int),
  (gen_random_uuid()::text, '11', 'NGN', '8500000.000000', '0', 'tp_ngn_11_admin', 'CBN', EXTRACT(EPOCH FROM NOW())::int, EXTRACT(EPOCH FROM NOW())::int),
  (gen_random_uuid()::text, '11', 'KES', '2500000.000000', '0', 'tp_kes_11_admin', 'CBK', EXTRACT(EPOCH FROM NOW())::int, EXTRACT(EPOCH FROM NOW())::int),
  (gen_random_uuid()::text, '11', 'ZAR', '350000.000000', '0', 'tp_zar_11_admin', 'SARB', EXTRACT(EPOCH FROM NOW())::int, EXTRACT(EPOCH FROM NOW())::int)
ON CONFLICT DO NOTHING;

-- Wallet transactions for admin
INSERT INTO wallet_transactions (id, user_id, type, status, from_currency, to_currency, amount, to_amount, fee, counterparty, reference, note, completed_at, created_at)
VALUES
  (gen_random_uuid()::text, '11', 'deposit', 'completed', 'USD', NULL, '10000.000000', NULL, '0', 'Stripe Top-up', 'dep-admin-001', 'Initial platform funding', EXTRACT(EPOCH FROM NOW() - interval '30 days')::int, EXTRACT(EPOCH FROM NOW() - interval '30 days')::int),
  (gen_random_uuid()::text, '11', 'swap', 'completed', 'USD', 'NGN', '5000.000000', '7750000.000000', '25.000000', NULL, 'swap-admin-001', 'USD to NGN conversion', EXTRACT(EPOCH FROM NOW() - interval '20 days')::int, EXTRACT(EPOCH FROM NOW() - interval '20 days')::int),
  (gen_random_uuid()::text, '11', 'send', 'completed', 'USDC', NULL, '2500.000000', NULL, '1.250000', 'merchant-grant@tourismpay.io', 'send-admin-001', 'Merchant onboarding grant', EXTRACT(EPOCH FROM NOW() - interval '15 days')::int, EXTRACT(EPOCH FROM NOW() - interval '15 days')::int),
  (gen_random_uuid()::text, '11', 'deposit', 'completed', 'KES', NULL, '2500000.000000', NULL, '0', 'M-Pesa Collection', 'dep-admin-002', 'Kenya corridor liquidity', EXTRACT(EPOCH FROM NOW() - interval '10 days')::int, EXTRACT(EPOCH FROM NOW() - interval '10 days')::int),
  (gen_random_uuid()::text, '11', 'send', 'completed', 'USD', NULL, '1200.000000', NULL, '6.000000', 'settlement@mojaloop.io', 'send-admin-002', 'Cross-border settlement', EXTRACT(EPOCH FROM NOW() - interval '5 days')::int, EXTRACT(EPOCH FROM NOW() - interval '5 days')::int);

-- ─── Phase 18: Loyalty account for admin user ────────────────────────────────
INSERT INTO loyalty_accounts (id, user_id, points_balance, tier, lifetime_points, created_at, updated_at)
VALUES (gen_random_uuid()::text, '11', 12500, 'GOLD', 24800, EXTRACT(EPOCH FROM NOW())::int, EXTRACT(EPOCH FROM NOW())::int)
ON CONFLICT (user_id) DO UPDATE SET points_balance = 12500, tier = 'GOLD', lifetime_points = 24800;

-- ─── Phase 19: Scheduled payments ────────────────────────────────────────────
INSERT INTO scheduled_payments (id, user_id, to_address, counterparty_name, amount, currency, recurrence, note, reference, status, scheduled_at, next_run_at, run_count, created_at, updated_at)
VALUES
  (gen_random_uuid()::text, '5', 'tp_kes_grace_wanjiku', 'Grace Wanjiku', 200.00, 'USD', 'monthly', 'Monthly family support', 'sched-james-001', 'active', (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint, (EXTRACT(EPOCH FROM NOW() + interval '30 days') * 1000)::bigint, 3, (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint, (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint),
  (gen_random_uuid()::text, '9', 'tp_ngn_chinedu', 'Chinedu Okafor', 500.00, 'USD', 'weekly', 'Business expenses', 'sched-kwame-001', 'active', (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint, (EXTRACT(EPOCH FROM NOW() + interval '7 days') * 1000)::bigint, 8, (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint, (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint),
  (gen_random_uuid()::text, '6', 'tp_ghs_charity', 'Hope Foundation Ghana', 50.00, 'GHS', 'monthly', 'Charity donation', 'sched-aisha-001', 'active', (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint, (EXTRACT(EPOCH FROM NOW() + interval '30 days') * 1000)::bigint, 1, (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint, (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint);

-- ─── Phase 20: Wallet spending limits (actual columns: period, limit_amount) ─
INSERT INTO wallet_spending_limits (id, user_id, currency, period, limit_amount, is_active, created_at, updated_at)
VALUES
  (gen_random_uuid()::text, '5', 'USD', 'daily', 500.00, true, EXTRACT(EPOCH FROM NOW())::int, EXTRACT(EPOCH FROM NOW())::int),
  (gen_random_uuid()::text, '5', 'USD', 'monthly', 8000.00, true, EXTRACT(EPOCH FROM NOW())::int, EXTRACT(EPOCH FROM NOW())::int),
  (gen_random_uuid()::text, '6', 'GHS', 'daily', 5000.00, true, EXTRACT(EPOCH FROM NOW())::int, EXTRACT(EPOCH FROM NOW())::int),
  (gen_random_uuid()::text, '9', 'NGN', 'daily', 500000.00, true, EXTRACT(EPOCH FROM NOW())::int, EXTRACT(EPOCH FROM NOW())::int),
  (gen_random_uuid()::text, '11', 'USD', 'daily', 10000.00, true, EXTRACT(EPOCH FROM NOW())::int, EXTRACT(EPOCH FROM NOW())::int);

-- ─── Phase 21: Carbon offsets ────────────────────────────────────────────────
INSERT INTO carbon_offsets (id, user_id, amount, project_name, project_country, cost_usd, certificate_url, vintage_year, created_at)
VALUES
  (gen_random_uuid()::text, '5', 2.400, 'Kijani Forest Restoration', 'KE', 36.00, '/certificates/kijani-james.pdf', 2025, EXTRACT(EPOCH FROM NOW() - interval '20 days')::int),
  (gen_random_uuid()::text, '6', 1.800, 'Sahara Solar Cookstoves', 'GH', 27.00, '/certificates/sahara-aisha.pdf', 2025, EXTRACT(EPOCH FROM NOW() - interval '15 days')::int),
  (gen_random_uuid()::text, '9', 3.200, 'Niger Delta Mangrove Planting', 'NG', 48.00, '/certificates/mangrove-kwame.pdf', 2025, EXTRACT(EPOCH FROM NOW() - interval '10 days')::int),
  (gen_random_uuid()::text, '5', 1.500, 'Kilimanjaro Reforestation', 'TZ', 22.50, '/certificates/kilimanjaro-james.pdf', 2025, EXTRACT(EPOCH FROM NOW() - interval '5 days')::int);

-- ─── Phase 22: Link fraud alerts to wallet transactions ──────────────────────
UPDATE fraud_alerts SET transaction_id = (
  SELECT id FROM wallet_transactions WHERE user_id = '5' AND type = 'send' LIMIT 1
) WHERE id = 1 AND transaction_id IS NULL;
UPDATE fraud_alerts SET transaction_id = (
  SELECT id FROM wallet_transactions WHERE user_id = '9' AND type = 'send' LIMIT 1
) WHERE id = 2 AND transaction_id IS NULL;

-- ─── Phase 23: Fix loyalty transaction partner links for merchantRevenue ─────
UPDATE loyalty_transactions SET partner = 'est:1' WHERE description LIKE '%Serena%';
UPDATE loyalty_transactions SET partner = 'est:2' WHERE description LIKE '%Cape Town%';
UPDATE loyalty_transactions SET partner = 'est:4' WHERE description LIKE '%Zanzibar%';
UPDATE loyalty_transactions SET partner = 'est:6' WHERE description LIKE '%Lagos%';

-- ─── Phase 24: Staff invites (correct column names) ─────────────────────────
INSERT INTO staff_invites (establishment_id, inviter_user_id, email, role, token, status, expires_at)
VALUES
  (1, 2, 'guide@serenasafari.ke', 'cashier', 'inv-' || gen_random_uuid()::text, 'pending', NOW() + interval '14 days'),
  (1, 2, 'receptionist@serenasafari.ke', 'cashier', 'inv-' || gen_random_uuid()::text, 'accepted', NOW() + interval '14 days'),
  (2, 3, 'concierge@capelodge.za', 'cashier', 'inv-' || gen_random_uuid()::text, 'pending', NOW() + interval '14 days'),
  (4, 7, 'diving@zanzibar.tz', 'cashier', 'inv-' || gen_random_uuid()::text, 'accepted', NOW() + interval '14 days'),
  (5, 8, 'front-desk@pyramids.eg', 'cashier', 'inv-' || gen_random_uuid()::text, 'pending', NOW() + interval '14 days');

-- ─── Phase 25: Review sentiment cache ────────────────────────────────────────
INSERT INTO review_sentiment_cache (establishment_id, positive_percent, themes, summary, review_count)
VALUES
  (1, 95, '["wildlife","luxury","guides","nature"]'::jsonb, 'Guests consistently praise the wildlife experiences and knowledgeable safari guides.', 1),
  (2, 88, '["architecture","location","breakfast","views"]'::jsonb, 'Heritage architecture and mountain views receive high marks. Breakfast buffet frequently mentioned as excellent.', 1),
  (5, 96, '["views","clean","helpful_staff"]'::jsonb, 'Pyramid views create unforgettable experiences. Staff helpfulness and room cleanliness consistently praised.', 1),
  (6, 98, '["authentic","friendly","value","flavours"]'::jsonb, 'Authentic Jollof rice and friendly chef interactions make this a standout dining experience.', 1),
  (8, 85, '["authentic","cultural","quality","handmade"]'::jsonb, 'Authentic handmade kente craftsmanship with cultural explanations, though some find pricing above average.', 1)
ON CONFLICT (establishment_id) DO UPDATE SET
  positive_percent = EXCLUDED.positive_percent, themes = EXCLUDED.themes,
  summary = EXCLUDED.summary, review_count = EXCLUDED.review_count, generated_at = NOW();

-- ─── Phase 26: Update BIS investigations to match new ownership ──────────────
UPDATE bis_investigations SET requested_by = 2 WHERE establishment_id IN (1, 7, 8);
UPDATE bis_investigations SET requested_by = 3 WHERE establishment_id = 2;
UPDATE bis_investigations SET requested_by = 4 WHERE establishment_id = 3;
UPDATE bis_investigations SET requested_by = 7 WHERE establishment_id = 4;
UPDATE bis_investigations SET requested_by = 8 WHERE establishment_id = 5;
UPDATE bis_investigations SET requested_by = 2 WHERE establishment_id = 6;

-- ─── Phase 27: Update KYB applications submitted_by ─────────────────────────
UPDATE kyb_applications SET submitted_by = 2 WHERE establishment_id IN (1, 6, 7, 8);
UPDATE kyb_applications SET submitted_by = 3 WHERE establishment_id = 2;
UPDATE kyb_applications SET submitted_by = 4 WHERE establishment_id = 3;
UPDATE kyb_applications SET submitted_by = 7 WHERE establishment_id = 4;
UPDATE kyb_applications SET submitted_by = 8 WHERE establishment_id = 5;

-- ─── Phase 28: Additional notifications for realistic feed ───────────────────
INSERT INTO user_notifications (user_id, category, title, content, action_url, is_read)
VALUES
  (5, 'wallet', 'Remittance Completed', 'Your $500 transfer to Grace Wanjiku (Kenya) has been completed. Recipient received KES 64,750.', '/wallet', true),
  (5, 'system', 'New Deal Available', 'Mara Migration Special: 30% off at Serena Safari Lodge. Valid through August.', '/tourist/deals', false),
  (5, 'system', 'Booking Reminder', 'Your safari at Serena Safari Lodge starts in 3 days.', '/tourist/bookings', false),
  (6, 'wallet', 'Top-up Successful', '$300 has been added to your wallet via Stripe.', '/wallet', true),
  (6, 'system', 'Deal Expiring Soon', 'Cape Town Winter Escape deal expires in 5 days. 25% off!', '/tourist/deals', false),
  (9, 'wallet', 'Remittance Completed', 'Your $1,000 transfer to Chinedu Okafor (Nigeria) has been completed.', '/wallet', true),
  (2, 'kyb', 'KYB Approved', 'KYB for Serena Safari Lodge has been approved. You can now accept payments.', '/merchant/revenue', true),
  (2, 'system', 'New Booking', 'James Wilson booked a Deluxe Safari Tent at Serena Safari Lodge for $450.', '/merchant/bookings', false),
  (2, 'system', 'Staff Invite Accepted', 'receptionist@serenasafari.ke accepted your staff invitation.', '/merchant/staff', true),
  (3, 'system', 'New Review', 'Aisha Diallo left a 4-star review for Cape Town Heritage Lodge.', '/merchant/revenue', false),
  (7, 'bis', 'BIS Investigation Flagged', 'Zanzibar Beach Resort flagged for additional review. Ref: BIS-2024-00004', '/admin/bis', false),
  (11, 'fraud', 'High-Value Alert', 'Suspicious transaction: $8,500 from unverified account.', '/security/fraud', false),
  (11, 'system', 'Platform Milestone', 'TourismPay processed $100,000 in cross-border payments this month.', '/admin', true),
  (10, 'bis', 'Investigation Assigned', 'BIS-2024-00004 for Zanzibar Beach Resort assigned to you.', '/admin/bis', false);

COMMIT;
