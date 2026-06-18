-- Migration 003: Nigeria-focused seed data for all tables
-- Real Nigerian locations, NGN currency, FIRS/state tax authorities

-- ═══════════════════════════════════════════════════
-- PROPERTIES (Nigerian hotels, resorts, lodges)
-- ═══════════════════════════════════════════════════
INSERT INTO gds_properties (id, tenant_id, name, type, country_code, region, city, star_rating, latitude, longitude, currency, commission_pct, amenities, contact_email, contact_phone, property_code, status, source)
VALUES
  (uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', 'Eko Hotels & Suites', 'hotel', 'NG', 'Lagos', 'Victoria Island', 5, 6.4281, 3.4219, 'NGN', 12.00, ARRAY['pool','spa','wifi','restaurant','gym','conference','parking','bar'], 'reservations@ekohotels.com', '+2341271000', 'NG-EKO-001', 'active', 'direct'),
  (uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', 'Transcorp Hilton Abuja', 'hotel', 'NG', 'FCT', 'Abuja', 5, 9.0579, 7.4951, 'NGN', 10.00, ARRAY['pool','spa','wifi','restaurant','gym','conference','tennis','helipad'], 'info@transcorphilton.com', '+2349461300', 'NG-THI-002', 'active', 'direct'),
  (uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', 'Wheatbaker Hotel', 'boutique_hotel', 'NG', 'Lagos', 'Ikoyi', 5, 6.4499, 3.4347, 'NGN', 15.00, ARRAY['pool','wifi','restaurant','bar','art_gallery','gym'], 'stay@thewheatbaker.com', '+2347000800', 'NG-WHB-003', 'active', 'direct'),
  (uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', 'Le Meridien Ogeyi Place', 'hotel', 'NG', 'Rivers', 'Port Harcourt', 4, 4.8156, 7.0498, 'NGN', 12.00, ARRAY['pool','wifi','restaurant','conference','gym','parking'], 'reservations@lemeridienph.com', '+2348430000', 'NG-LMO-004', 'active', 'direct'),
  (uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', 'Tinapa Lakeside Hotel', 'resort', 'NG', 'Cross River', 'Calabar', 4, 4.9757, 8.3417, 'NGN', 14.00, ARRAY['pool','wifi','restaurant','water_sports','spa','conference'], 'book@tinapalakeside.com', '+2348700100', 'NG-TLH-005', 'active', 'direct'),
  (uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', 'Nike Art Gallery Guesthouse', 'guesthouse', 'NG', 'Lagos', 'Lekki', 3, 6.4349, 3.5432, 'NGN', 18.00, ARRAY['wifi','parking','art_gallery'], 'stay@nikeart.ng', '+2348051234567', 'NG-NAG-006', 'active', 'agent'),
  (uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', 'Yankari Game Reserve Lodge', 'lodge', 'NG', 'Bauchi', 'Bauchi', 3, 9.7500, 10.5000, 'NGN', 16.00, ARRAY['safari','restaurant','parking','guided_tours'], 'book@yankarilodge.ng', '+2347761234567', 'NG-YGR-007', 'active', 'direct'),
  (uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', 'Obudu Mountain Resort', 'resort', 'NG', 'Cross River', 'Obudu', 4, 6.3667, 9.3667, 'NGN', 13.00, ARRAY['pool','cable_car','restaurant','hiking','spa','golf'], 'reservations@obudu.com', '+2348031234567', 'NG-OMR-008', 'active', 'direct'),
  (uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', 'Ibom Hotel & Golf Resort', 'resort', 'NG', 'Akwa Ibom', 'Uyo', 5, 5.0377, 7.9128, 'NGN', 11.00, ARRAY['pool','golf','spa','wifi','restaurant','conference','tennis'], 'info@ibomhotel.com', '+2348500200', 'NG-IHG-009', 'active', 'direct'),
  (uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', 'Kano Durbar Hotel', 'hotel', 'NG', 'Kano', 'Kano', 3, 12.0022, 8.5920, 'NGN', 15.00, ARRAY['wifi','restaurant','parking','conference'], 'book@kanodurbar.ng', '+2346431234567', 'NG-KDH-010', 'pending', 'ussd')
ON CONFLICT (property_code) DO NOTHING;

-- ═══════════════════════════════════════════════════
-- ROOM TYPES
-- ═══════════════════════════════════════════════════
INSERT INTO gds_room_types (property_id, code, name, description, max_occupancy, bed_configuration, size_sqm, amenities)
SELECT p.id, rt.code, rt.name, rt.description, rt.max_occ, rt.bed, rt.sqm, rt.amenities
FROM gds_properties p
CROSS JOIN (VALUES
  ('STD', 'Standard Room', 'Comfortable room with city view', 2, 'Queen', 28.0, ARRAY['wifi','tv','minibar','safe']),
  ('DLX', 'Deluxe Room', 'Spacious room with premium amenities', 2, 'King', 38.0, ARRAY['wifi','tv','minibar','safe','balcony']),
  ('SUI', 'Executive Suite', 'Separate living area with workspace', 3, 'King + Sofa', 55.0, ARRAY['wifi','tv','minibar','safe','lounge','workspace'])
) AS rt(code, name, description, max_occ, bed, sqm, amenities)
WHERE p.country_code = 'NG' AND p.property_code = 'NG-EKO-001'
ON CONFLICT (property_id, code) DO NOTHING;

-- ═══════════════════════════════════════════════════
-- AGENTS (Nigerian travel agencies)
-- ═══════════════════════════════════════════════════
INSERT INTO gds_agents (tenant_id, agency_name, agent_name, email, phone, country_code, iata_code, preferred_currency, tier, commission_rate, total_bookings, status)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Wakanow Travel', 'Obinna Eze', 'obinna@wakanow.com', '+2348031112222', 'NG', 'WAK001', 'NGN', 'platinum', 18.00, 342, 'active'),
  ('00000000-0000-0000-0000-000000000001', 'Jumia Travel Nigeria', 'Aisha Bello', 'aisha@jumia.travel', '+2348052223333', 'NG', 'JTN002', 'NGN', 'gold', 15.00, 187, 'active'),
  ('00000000-0000-0000-0000-000000000001', 'Travelstart Nigeria', 'Chidi Okafor', 'chidi@travelstart.ng', '+2348073334444', 'NG', 'TSN003', 'NGN', 'gold', 15.00, 156, 'active'),
  ('00000000-0000-0000-0000-000000000001', 'Konga Travel', 'Fatima Abdullahi', 'fatima@konga.travel', '+2348094445555', 'NG', 'KTR004', 'NGN', 'silver', 12.00, 89, 'active'),
  ('00000000-0000-0000-0000-000000000001', 'Finchglow Travels', 'Bankole Adesanya', 'bankole@finchglow.com', '+2348015556666', 'NG', 'FGT005', 'NGN', 'platinum', 18.00, 421, 'active')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════
-- PNR RECORDS
-- ═══════════════════════════════════════════════════
INSERT INTO gds_pnr_records (tenant_id, record_locator, guest_name, contact_email, agency_id, agent_id, status, ticketing_status, segments, remarks)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'NGR7X2', 'Emeka Okonkwo', 'emeka@gmail.com', 'WAK001', 'AGT-001', 'CONFIRMED', 'ISSUED',
   '[{"type":"hotel","property":"Eko Hotels & Suites","check_in":"2026-07-15","check_out":"2026-07-18","status":"HK","rooms":1,"rate":85000},{"type":"transfer","from":"Murtala Muhammed Airport","to":"Eko Hotels VI","date":"2026-07-15","status":"HK"}]',
   '[{"type":"general","text":"VIP guest — early check-in requested"}]'),
  ('00000000-0000-0000-0000-000000000001', 'ABJ4M9', 'Pierre Dubois', 'pierre@voyageafrique.fr', 'FGT005', 'AGT-005', 'CONFIRMED', 'ISSUED',
   '[{"type":"hotel","property":"Transcorp Hilton Abuja","check_in":"2026-08-01","check_out":"2026-08-05","status":"HK","rooms":2,"rate":120000}]',
   '[{"type":"billing","text":"Corporate rate — Safaricom agreement"}]'),
  ('00000000-0000-0000-0000-000000000001', 'PHC3K7', 'Ngozi Adichie', 'ngozi@literature.ng', 'TSN003', 'AGT-003', 'CONFIRMED', 'ISSUED',
   '[{"type":"hotel","property":"Le Meridien Ogeyi Place","check_in":"2026-07-20","check_out":"2026-07-23","status":"HK","rooms":1,"rate":65000}]',
   '[{"type":"special","text":"Quiet room preferred — writing retreat"}]'),
  ('00000000-0000-0000-0000-000000000001', 'CLB9F2', 'Wole Soyinka', 'wole@arts.ng', 'JTN002', 'AGT-002', 'CONFIRMED', 'PENDING',
   '[{"type":"hotel","property":"Tinapa Lakeside Hotel","check_in":"2026-09-10","check_out":"2026-09-14","status":"HK","rooms":1,"rate":55000},{"type":"activity","name":"Calabar Carnival Preview","date":"2026-09-12","status":"HK"}]',
   '[{"type":"general","text":"Nobel laureate — VIP protocol"}]'),
  ('00000000-0000-0000-0000-000000000001', 'UYO5T1', 'Amaka Igwe', 'amaka@nollywood.ng', 'KTR004', 'AGT-004', 'WAITLISTED', 'PENDING',
   '[{"type":"hotel","property":"Ibom Hotel & Golf Resort","check_in":"2026-10-01","check_out":"2026-10-04","status":"HL","rooms":3,"rate":95000}]',
   '[{"type":"warning","text":"Peak season — waitlisted for suite upgrade"}]'),
  ('00000000-0000-0000-0000-000000000001', 'KAN2R8', 'Aliko Dangote', 'aliko@dangote.com', 'WAK001', 'AGT-001', 'CONFIRMED', 'ISSUED',
   '[{"type":"hotel","property":"Kano Durbar Hotel","check_in":"2026-12-20","check_out":"2026-12-25","status":"HK","rooms":5,"rate":45000},{"type":"activity","name":"Durbar Festival","date":"2026-12-22","status":"HK"}]',
   '[{"type":"billing","text":"Corporate account — Dangote Group"}]'),
  ('00000000-0000-0000-0000-000000000001', 'OBD8L5', 'Chimamanda Adichie', 'chimamanda@purple.ng', 'FGT005', 'AGT-005', 'CONFIRMED', 'ISSUED',
   '[{"type":"hotel","property":"Obudu Mountain Resort","check_in":"2026-08-15","check_out":"2026-08-20","status":"HK","rooms":2,"rate":75000}]',
   '[{"type":"special","text":"Cable car tour + hiking guide requested"}]'),
  ('00000000-0000-0000-0000-000000000001', 'LKI6N3', 'Fela Kuti Jr', 'fela@newafrika.ng', 'TSN003', 'AGT-003', 'CANCELLED', 'VOID',
   '[{"type":"hotel","property":"Nike Art Gallery Guesthouse","check_in":"2026-07-01","check_out":"2026-07-03","status":"XX","rooms":1,"rate":25000}]',
   '[{"type":"cancellation","text":"Guest cancelled — schedule conflict"}]')
ON CONFLICT (record_locator) DO NOTHING;

-- ═══════════════════════════════════════════════════
-- GUEST PROFILES (Nigerian guests)
-- ═══════════════════════════════════════════════════
INSERT INTO gds_guest_profiles (tenant_id, name, email, phone, country_code, loyalty_tier, loyalty_points, total_stays, total_spend, preferences)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Emeka Okonkwo', 'emeka@gmail.com', '+2348031112222', 'NG', 'gold', 4500, 12, 2850000, '{"room":"high_floor","diet":"halal","newspaper":"Guardian Nigeria"}'),
  ('00000000-0000-0000-0000-000000000001', 'Ngozi Adichie', 'ngozi@literature.ng', '+2348052223333', 'NG', 'platinum', 12000, 34, 8900000, '{"room":"quiet","diet":"vegetarian","newspaper":"none","late_checkout":true}'),
  ('00000000-0000-0000-0000-000000000001', 'Aliko Dangote', 'aliko@dangote.com', '+2348073334444', 'NG', 'platinum', 28000, 67, 45000000, '{"room":"presidential_suite","diet":"none","transport":"private_car"}'),
  ('00000000-0000-0000-0000-000000000001', 'Wole Soyinka', 'wole@arts.ng', '+2348094445555', 'NG', 'gold', 5200, 15, 3200000, '{"room":"garden_view","diet":"none","special":"writing_desk"}'),
  ('00000000-0000-0000-0000-000000000001', 'Amaka Igwe', 'amaka@nollywood.ng', '+2348015556666', 'NG', 'silver', 2100, 8, 1450000, '{"room":"standard","diet":"none"}'),
  ('00000000-0000-0000-0000-000000000001', 'Chimamanda Adichie', 'chimamanda@purple.ng', '+2348036667777', 'NG', 'platinum', 15000, 42, 12000000, '{"room":"suite","diet":"pescatarian","newspaper":"FT"}'),
  ('00000000-0000-0000-0000-000000000001', 'Femi Otedola', 'femi@geregu.ng', '+2348057778888', 'NG', 'gold', 6800, 19, 5600000, '{"room":"executive","diet":"none","transport":"helicopter"}'),
  ('00000000-0000-0000-0000-000000000001', 'Genevieve Nnaji', 'genny@nollywood.ng', '+2348078889999', 'NG', 'silver', 1800, 6, 980000, '{"room":"deluxe","diet":"none","spa":"morning_slot"}'),
  ('00000000-0000-0000-0000-000000000001', 'Burna Boy', 'burna@spaceship.ng', '+2348099990000', 'NG', 'gold', 3900, 11, 4200000, '{"room":"penthouse","diet":"none","noise":"soundproofed","late_checkout":true}'),
  ('00000000-0000-0000-0000-000000000001', 'Adesua Wellington', 'adesua@films.ng', '+2348010001111', 'NG', 'bronze', 800, 3, 450000, '{"room":"standard","diet":"none"}')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════
-- QUEUE ITEMS
-- ═══════════════════════════════════════════════════
INSERT INTO gds_queue_items (tenant_id, queue_type, priority, pnr_locator, title, details, status, sla_minutes)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'ticketing', 1, 'UYO5T1', 'Waitlisted PNR needs ticketing decision', '{"guest":"Amaka Igwe","property":"Ibom Hotel","action":"confirm_or_cancel"}', 'pending', 30),
  ('00000000-0000-0000-0000-000000000001', 'rate_change', 2, NULL, 'Eko Hotels peak season rate update', '{"property":"Eko Hotels & Suites","old_rate":85000,"new_rate":120000,"effective":"2026-12-15"}', 'pending', 60),
  ('00000000-0000-0000-0000-000000000001', 'schedule_change', 2, 'ABJ4M9', 'Corporate guest date change request', '{"guest":"Pierre Dubois","original":"Aug 1-5","requested":"Aug 8-12"}', 'pending', 45),
  ('00000000-0000-0000-0000-000000000001', 'special_request', 3, 'NGR7X2', 'VIP early check-in arrangement', '{"guest":"Emeka Okonkwo","request":"Early check-in 10am","property":"Eko Hotels"}', 'in_progress', 120),
  ('00000000-0000-0000-0000-000000000001', 'billing', 2, 'KAN2R8', 'Corporate billing setup — Dangote Group', '{"company":"Dangote Group","contact":"aliko@dangote.com","terms":"net_30"}', 'pending', 90),
  ('00000000-0000-0000-0000-000000000001', 'cancellation', 1, 'LKI6N3', 'Process cancellation refund — Fela Kuti Jr', '{"guest":"Fela Kuti Jr","amount":25000,"currency":"NGN","policy":"flexible"}', 'pending', 15),
  ('00000000-0000-0000-0000-000000000001', 'group', 2, NULL, 'ECOWAS Summit 2026 room block request', '{"event":"ECOWAS Summit","rooms":50,"dates":"2026-11-15 to 2026-11-20","property":"Transcorp Hilton"}', 'pending', 60),
  ('00000000-0000-0000-0000-000000000001', 'verification', 3, NULL, 'New property verification — Kano Durbar Hotel', '{"property":"Kano Durbar Hotel","status":"pending","documents_received":2,"documents_required":5}', 'pending', 1440),
  ('00000000-0000-0000-0000-000000000001', 'ticketing', 1, 'OBD8L5', 'Obudu resort cable car add-on ticketing', '{"guest":"Chimamanda Adichie","addon":"Cable car tour","cost":15000}', 'pending', 30),
  ('00000000-0000-0000-0000-000000000001', 'special_request', 3, 'CLB9F2', 'VIP protocol — Nobel laureate arrival', '{"guest":"Wole Soyinka","protocol":"VIP","airport_pickup":true,"property":"Tinapa Lakeside"}', 'in_progress', 240),
  ('00000000-0000-0000-0000-000000000001', 'rate_change', 2, NULL, 'Obudu Christmas rates — 40% premium', '{"property":"Obudu Mountain Resort","season":"christmas","premium_pct":40}', 'pending', 120),
  ('00000000-0000-0000-0000-000000000001', 'billing', 2, NULL, 'Monthly commission payout — Wakanow Travel', '{"agency":"Wakanow Travel","period":"June 2026","amount":1250000,"currency":"NGN"}', 'pending', 60)
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════
-- CONTENT / LANGUAGES
-- ═══════════════════════════════════════════════════
INSERT INTO gds_languages (code, name, native_name, direction, active)
VALUES
  ('en', 'English', 'English', 'ltr', true),
  ('ha', 'Hausa', 'Hausa', 'ltr', true),
  ('yo', 'Yoruba', 'Èdè Yorùbá', 'ltr', true),
  ('ig', 'Igbo', 'Asụsụ Igbo', 'ltr', true),
  ('pcm', 'Nigerian Pidgin', 'Naija', 'ltr', true),
  ('fr', 'French', 'Français', 'ltr', true),
  ('ar', 'Arabic', 'العربية', 'rtl', true),
  ('sw', 'Swahili', 'Kiswahili', 'ltr', true),
  ('ff', 'Fulfulde', 'Fulfulde', 'ltr', true),
  ('kr', 'Kanuri', 'Kanuri', 'ltr', true),
  ('ij', 'Ijaw', 'Izon', 'ltr', true),
  ('tiv', 'Tiv', 'Tiv', 'ltr', true),
  ('efi', 'Efik', 'Efik', 'ltr', true),
  ('edo', 'Edo', 'Ẹ̀dó', 'ltr', true),
  ('nup', 'Nupe', 'Nupe', 'ltr', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO gds_content (property_id, language_code, title, description, highlights, amenity_categories, completeness_score)
SELECT p.id, 'en', p.name, 'Premium Nigerian hospitality at ' || p.name || ' in ' || p.city, 
  ARRAY['Prime location','Nigerian cuisine','Cultural experiences'], 
  '{"facilities":["pool","gym","spa"],"dining":["restaurant","bar","room_service"],"business":["conference","wifi","business_center"]}'::jsonb,
  85.0
FROM gds_properties p WHERE p.country_code = 'NG'
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════
-- RESERVATIONS
-- ═══════════════════════════════════════════════════
INSERT INTO gds_reservations (tenant_id, confirmation_no, property_id, room_type_code, check_in, check_out, nights, guests, rooms, guest_name, guest_email, guest_phone, guest_country, total_amount, commission_amount, currency, status, source, special_requests)
SELECT 
  '00000000-0000-0000-0000-000000000001',
  'RES-NG-' || LPAD(row_number() OVER ()::text, 4, '0'),
  p.id, 'STD', '2026-08-01', '2026-08-04', 3, 2, 1,
  g.name, g.email, g.phone, 'NG',
  255000, 30600, 'NGN', 'confirmed', 'agent_portal', 'Standard booking'
FROM gds_properties p, gds_guest_profiles g
WHERE p.property_code = 'NG-EKO-001' AND g.name = 'Emeka Okonkwo'
ON CONFLICT (confirmation_no) DO NOTHING;

-- ═══════════════════════════════════════════════════
-- TAX JURISDICTIONS (Nigerian)
-- ═══════════════════════════════════════════════════
INSERT INTO gds_tax_jurisdictions (code, name, country, vat_rate, tourism_levy, service_charge, authority, filing_frequency)
VALUES
  ('NG-FED', 'Federal — FIRS', 'NG', 7.50, 5.00, 0, 'Federal Inland Revenue Service', 'monthly'),
  ('NG-LAG', 'Lagos State', 'NG', 7.50, 5.00, 5.00, 'Lagos State Internal Revenue Service (LIRS)', 'monthly'),
  ('NG-FCT', 'FCT Abuja', 'NG', 7.50, 5.00, 0, 'FCT Internal Revenue Service', 'monthly'),
  ('NG-RIV', 'Rivers State', 'NG', 7.50, 3.00, 0, 'Rivers State Internal Revenue Service', 'quarterly'),
  ('NG-CRS', 'Cross River State', 'NG', 7.50, 2.50, 0, 'Cross River State IRS', 'quarterly'),
  ('NG-AKI', 'Akwa Ibom State', 'NG', 7.50, 2.00, 0, 'Akwa Ibom State IRS', 'quarterly'),
  ('NG-KAN', 'Kano State', 'NG', 7.50, 3.00, 0, 'Kano State IRS', 'quarterly'),
  ('NG-BAU', 'Bauchi State', 'NG', 7.50, 2.00, 0, 'Bauchi State IRS', 'quarterly'),
  ('NG-OGU', 'Ogun State', 'NG', 7.50, 3.00, 0, 'Ogun State IRS', 'monthly'),
  ('NG-OYO', 'Oyo State', 'NG', 7.50, 2.50, 0, 'Oyo State IRS', 'monthly'),
  ('NG-EDO', 'Edo State', 'NG', 7.50, 2.00, 0, 'Edo State IRS', 'quarterly'),
  ('NG-ENU', 'Enugu State', 'NG', 7.50, 2.00, 0, 'Enugu State IRS', 'quarterly'),
  ('NG-KAD', 'Kaduna State', 'NG', 7.50, 3.00, 0, 'Kaduna State IRS', 'quarterly'),
  ('NG-ABJ', 'Abia State', 'NG', 7.50, 2.00, 0, 'Abia State IRS', 'quarterly'),
  ('NG-DEL', 'Delta State', 'NG', 7.50, 2.50, 0, 'Delta State IRS', 'quarterly')
ON CONFLICT (code) DO NOTHING;

-- ═══════════════════════════════════════════════════
-- TIPPING TEMPLATES (Nigerian service standards)
-- ═══════════════════════════════════════════════════
INSERT INTO gds_tipping_templates (country, service_type, suggested_pct, min_pct, max_pct)
VALUES
  ('NG', 'hotel_porter', 5.00, 2.00, 10.00),
  ('NG', 'room_service', 10.00, 5.00, 15.00),
  ('NG', 'restaurant', 10.00, 5.00, 15.00),
  ('NG', 'spa_therapist', 15.00, 10.00, 20.00),
  ('NG', 'tour_guide', 10.00, 5.00, 20.00),
  ('NG', 'driver', 10.00, 5.00, 15.00),
  ('NG', 'concierge', 5.00, 2.00, 10.00),
  ('NG', 'housekeeper', 5.00, 2.00, 10.00)
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════
-- REMITTANCE SCHEDULES
-- ═══════════════════════════════════════════════════
INSERT INTO gds_remittance_schedules (jurisdiction_code, tax_type, frequency, next_due, auto_file)
VALUES
  ('NG-FED', 'VAT', 'monthly', '2026-07-21', true),
  ('NG-LAG', 'tourism_levy', 'monthly', '2026-07-15', true),
  ('NG-LAG', 'consumption_tax', 'monthly', '2026-07-15', false),
  ('NG-FCT', 'VAT', 'monthly', '2026-07-21', true),
  ('NG-RIV', 'tourism_levy', 'quarterly', '2026-09-30', false),
  ('NG-CRS', 'tourism_levy', 'quarterly', '2026-09-30', false)
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════
-- REMITTANCE RECORDS (past filings)
-- ═══════════════════════════════════════════════════
INSERT INTO gds_remittance_records (tenant_id, jurisdiction_code, period, tax_type, amount, currency, status, due_date, filed_at, reference)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'NG-FED', '2026-05', 'VAT', 1250000, 'NGN', 'filed', '2026-06-21', '2026-06-18T10:00:00Z', 'FIRS-VAT-202605-001'),
  ('00000000-0000-0000-0000-000000000001', 'NG-LAG', '2026-05', 'tourism_levy', 450000, 'NGN', 'filed', '2026-06-15', '2026-06-12T14:00:00Z', 'LIRS-TL-202605-001'),
  ('00000000-0000-0000-0000-000000000001', 'NG-FED', '2026-06', 'VAT', 1380000, 'NGN', 'pending', '2026-07-21', NULL, NULL),
  ('00000000-0000-0000-0000-000000000001', 'NG-LAG', '2026-06', 'tourism_levy', 510000, 'NGN', 'pending', '2026-07-15', NULL, NULL),
  ('00000000-0000-0000-0000-000000000001', 'NG-FCT', '2026-Q2', 'VAT', 890000, 'NGN', 'filed', '2026-06-30', '2026-06-28T09:00:00Z', 'FCT-VAT-2026Q2-001')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════
-- LOYALTY CONFIG
-- ═══════════════════════════════════════════════════
INSERT INTO gds_loyalty_config (tier, min_points, multiplier, benefits)
VALUES
  ('bronze', 0, 1.0, ARRAY['10% restaurant discount','Late checkout (subject to availability)']),
  ('silver', 2000, 1.5, ARRAY['15% restaurant discount','Late checkout guaranteed','Free airport transfer']),
  ('gold', 5000, 2.0, ARRAY['20% restaurant discount','Suite upgrade when available','Free airport transfer','Spa credit ₦10,000']),
  ('platinum', 10000, 3.0, ARRAY['25% restaurant discount','Guaranteed suite upgrade','Private airport transfer','Spa credit ₦25,000','Personal concierge','Priority check-in'])
ON CONFLICT (tier) DO NOTHING;

-- ═══════════════════════════════════════════════════
-- LOYALTY REWARDS
-- ═══════════════════════════════════════════════════
INSERT INTO gds_loyalty_rewards (name, description, points_required, category, status)
VALUES
  ('Free Night — Standard Room', 'One complimentary night in a Standard room at any participating property', 5000, 'accommodation', 'active'),
  ('Suite Upgrade', 'Complimentary upgrade to next room category', 3000, 'accommodation', 'active'),
  ('₦25,000 Dining Credit', 'Credit for restaurant and bar at any participating property', 2500, 'dining', 'active'),
  ('Airport Lounge Access', 'Access to MMIA or Nnamdi Azikiwe airport lounge', 1500, 'travel', 'active'),
  ('Spa Treatment', 'Full body massage at participating hotel spa', 4000, 'wellness', 'active'),
  ('Cultural Tour', 'Guided tour to local cultural sites (Lagos, Calabar, or Kano)', 2000, 'experience', 'active'),
  ('₦50,000 Flight Voucher', 'Voucher for domestic flight booking via partner airlines', 8000, 'travel', 'active'),
  ('Golf Green Fee', 'Complimentary 18-hole round at Ibom or Ikoyi golf club', 3500, 'experience', 'active')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════
-- DEMAND EVENTS (Nigerian)
-- ═══════════════════════════════════════════════════
INSERT INTO gds_demand_events (name, country, start_date, end_date, demand_multiplier, category)
VALUES
  ('Lagos Fashion Week', 'NG', '2026-10-26', '2026-10-31', 1.40, 'fashion'),
  ('Calabar Carnival', 'NG', '2026-12-01', '2026-12-31', 1.60, 'cultural'),
  ('AFCON 2026 Nigeria', 'NG', '2026-01-15', '2026-02-15', 1.80, 'sports'),
  ('Durbar Festival Kano', 'NG', '2026-12-20', '2026-12-25', 1.50, 'cultural'),
  ('Lagos Boat Regatta', 'NG', '2026-03-15', '2026-03-17', 1.20, 'sports'),
  ('Osun-Osogbo Festival', 'NG', '2026-08-20', '2026-08-22', 1.35, 'religious'),
  ('GTBank Food & Drink Fair', 'NG', '2026-04-25', '2026-04-27', 1.25, 'food'),
  ('Nigeria Independence Day', 'NG', '2026-10-01', '2026-10-03', 1.30, 'national')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════
-- DISCOUNTS / PROMOS
-- ═══════════════════════════════════════════════════
INSERT INTO gds_discounts (code, type, value, min_amount, max_uses, used_count, valid_from, valid_until, applicable_countries, status)
VALUES
  ('NAIJA15', 'percentage', 15.00, 50000, 1000, 342, '2026-01-01', '2026-12-31', ARRAY['NG'], 'active'),
  ('LAGOS20', 'percentage', 20.00, 100000, 500, 89, '2026-06-01', '2026-08-31', ARRAY['NG'], 'active'),
  ('ABUJA10', 'percentage', 10.00, 80000, 300, 45, '2026-01-01', '2026-12-31', ARRAY['NG'], 'active'),
  ('FIRST5K', 'fixed', 5000.00, 30000, 200, 178, '2026-01-01', '2026-06-30', ARRAY['NG'], 'active'),
  ('CORP25', 'percentage', 25.00, 200000, 100, 12, '2026-01-01', '2026-12-31', ARRAY['NG'], 'active')
ON CONFLICT (code) DO NOTHING;

-- ═══════════════════════════════════════════════════
-- CANCELLATION POLICIES
-- ═══════════════════════════════════════════════════
INSERT INTO gds_cancellation_policies (property_id, policy_type, tiers, refund_waterfall)
SELECT p.id, v.ptype, v.tiers::jsonb, v.waterfall::jsonb
FROM gds_properties p
CROSS JOIN (VALUES
  ('flexible', '[{"days_before":0,"penalty_pct":100},{"days_before":1,"penalty_pct":50},{"days_before":3,"penalty_pct":0}]', '{"property":50,"platform":30,"agent":20}'),
  ('moderate', '[{"days_before":0,"penalty_pct":100},{"days_before":3,"penalty_pct":50},{"days_before":7,"penalty_pct":25},{"days_before":14,"penalty_pct":0}]', '{"property":50,"platform":30,"agent":20}'),
  ('strict', '[{"days_before":0,"penalty_pct":100},{"days_before":7,"penalty_pct":75},{"days_before":14,"penalty_pct":50},{"days_before":30,"penalty_pct":25}]', '{"property":60,"platform":25,"agent":15}'),
  ('non_refundable', '[{"days_before":0,"penalty_pct":100}]', '{"property":70,"platform":20,"agent":10}')
) AS v(ptype, tiers, waterfall)
WHERE p.property_code = 'NG-EKO-001';

-- ═══════════════════════════════════════════════════
-- NEGOTIATED RATES
-- ═══════════════════════════════════════════════════
INSERT INTO gds_negotiated_rates (corporate_id, corporate_name, agreement_type, discount_pct, valid_from, valid_until, status)
VALUES
  ('CORP-DAN-001', 'Dangote Group', 'corporate', 25.00, '2026-01-01', '2026-12-31', 'active'),
  ('CORP-MTN-002', 'MTN Nigeria', 'corporate', 20.00, '2026-01-01', '2026-12-31', 'active'),
  ('CORP-UBA-003', 'United Bank for Africa', 'corporate', 18.00, '2026-01-01', '2026-12-31', 'active'),
  ('CORP-ECO-004', 'ECOWAS Commission', 'government', 30.00, '2026-01-01', '2026-12-31', 'active'),
  ('CORP-NNPC-005', 'NNPC Limited', 'corporate', 22.00, '2026-01-01', '2026-12-31', 'active')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════
-- GROUP BOOKINGS
-- ═══════════════════════════════════════════════════
INSERT INTO gds_group_bookings (tenant_id, group_name, group_type, rooms_blocked, rooms_picked_up, check_in, check_out, contact_name, contact_email, status, attrition_schedule)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'ECOWAS Summit 2026', 'conference', 50, 38, '2026-11-15', '2026-11-20', 'Amb. Tulinabo Mushingi', 'protocol@ecowas.int', 'confirmed', '[{"days_before":90,"min_pickup_pct":80},{"days_before":60,"min_pickup_pct":60},{"days_before":30,"min_pickup_pct":40}]'),
  ('00000000-0000-0000-0000-000000000001', 'Nollywood Awards Gala', 'event', 30, 28, '2026-09-20', '2026-09-23', 'Peace Anyiam-Osigwe', 'events@amaa.org', 'confirmed', '[{"days_before":60,"min_pickup_pct":80},{"days_before":30,"min_pickup_pct":60}]'),
  ('00000000-0000-0000-0000-000000000001', 'GTBank Lagos Marathon', 'sports', 25, 15, '2026-02-10', '2026-02-13', 'Segun Agbaje', 'marathon@gtbank.com', 'provisional', '[{"days_before":90,"min_pickup_pct":80},{"days_before":60,"min_pickup_pct":60},{"days_before":30,"min_pickup_pct":40}]'),
  ('00000000-0000-0000-0000-000000000001', 'Nigeria Bar Association AGM', 'conference', 40, 22, '2026-08-25', '2026-08-29', 'Yakubu Maikyau SAN', 'agm@nba.org.ng', 'confirmed', '[{"days_before":60,"min_pickup_pct":80},{"days_before":30,"min_pickup_pct":60}]'),
  ('00000000-0000-0000-0000-000000000001', 'Calabar Carnival VIP Package', 'tour', 20, 18, '2026-12-26', '2026-12-31', 'Ben Ayade', 'carnival@crossriver.gov.ng', 'confirmed', '[{"days_before":60,"min_pickup_pct":80}]'),
  ('00000000-0000-0000-0000-000000000001', 'Dangote Group Retreat', 'corporate', 15, 15, '2026-07-05', '2026-07-08', 'Aliko Dangote', 'retreat@dangote.com', 'confirmed', '[{"days_before":30,"min_pickup_pct":100}]')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════
-- ESTABLISHMENTS (Onboarding data)
-- ═══════════════════════════════════════════════════
INSERT INTO gds_establishments (tenant_id, name, type, country, city, address, contact_name, contact_email, contact_phone, rooms, star_rating, tier, status, onboarding_step, onboarding_channel, amenities, currency, base_rate, verified)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Eko Hotels & Suites', 'hotel', 'NG', 'Victoria Island', '1415 Adetokunbo Ademola St, VI', 'Ade Oshodi', 'ade@ekohotels.com', '+2341271000', 180, 5, 'full', 'active', 5, 'web', ARRAY['pool','spa','wifi','restaurant'], 'NGN', 85000, true),
  ('00000000-0000-0000-0000-000000000001', 'Transcorp Hilton Abuja', 'hotel', 'NG', 'Abuja', '1 Aguiyi Ironsi St, Maitama', 'Ibrahim Musa', 'ibrahim@transcorphilton.com', '+2349461300', 670, 5, 'full', 'active', 5, 'web', ARRAY['pool','spa','wifi','restaurant','conference'], 'NGN', 120000, true),
  ('00000000-0000-0000-0000-000000000001', 'Wheatbaker Hotel', 'boutique_hotel', 'NG', 'Ikoyi', '4 Lawrence Rd, Ikoyi', 'Mosun Belo-Olusoga', 'mosun@wheatbaker.com', '+2347000800', 72, 5, 'full', 'active', 5, 'web', ARRAY['pool','wifi','restaurant','art_gallery'], 'NGN', 95000, true),
  ('00000000-0000-0000-0000-000000000001', 'Le Meridien Ogeyi Place', 'hotel', 'NG', 'Port Harcourt', 'Trans Amadi', 'Ada Obi', 'ada@lemeridienph.com', '+2348430000', 106, 4, 'web_lite', 'active', 5, 'web', ARRAY['pool','wifi','restaurant','conference'], 'NGN', 65000, true),
  ('00000000-0000-0000-0000-000000000001', 'Tinapa Lakeside Hotel', 'resort', 'NG', 'Calabar', 'Tinapa Resort, MCC Road', 'Ekpe Bassey', 'ekpe@tinapa.com', '+2348700100', 96, 4, 'whatsapp', 'active', 5, 'agent', ARRAY['pool','water_sports','restaurant'], 'NGN', 55000, true),
  ('00000000-0000-0000-0000-000000000001', 'Kano Durbar Hotel', 'hotel', 'NG', 'Kano', '15 Bompai Rd, Kano', 'Musa Abdullahi', 'musa@kanodurbar.ng', '+2346431234567', 45, 3, 'sms_only', 'pending_verification', 3, 'ussd', ARRAY['wifi','parking','restaurant'], 'NGN', 25000, false),
  ('00000000-0000-0000-0000-000000000001', 'Mama Put Beach Hut', 'guesthouse', 'NG', 'Badagry', 'Badagry Beach Road', 'Mama Tunde', 'mamaput@gmail.com', '+2348051234567', 6, 1, 'sms_only', 'registered', 1, 'ussd', ARRAY['parking'], 'NGN', 8000, false)
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════
-- FIELD AGENTS
-- ═══════════════════════════════════════════════════
INSERT INTO gds_field_agents (tenant_id, name, phone, email, region, country, status, kyc_verified, training_completed, properties_onboarded, commission_earned)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Chinedu Eze', '+2348031112222', 'chinedu@gdsagents.ng', 'South-West', 'NG', 'active', true, true, 23, 345000),
  ('00000000-0000-0000-0000-000000000001', 'Amina Bello', '+2348052223333', 'amina@gdsagents.ng', 'North-Central', 'NG', 'active', true, true, 18, 270000),
  ('00000000-0000-0000-0000-000000000001', 'Obi Nwosu', '+2348073334444', 'obi@gdsagents.ng', 'South-East', 'NG', 'active', true, true, 15, 225000),
  ('00000000-0000-0000-0000-000000000001', 'Hauwa Sani', '+2348094445555', 'hauwa@gdsagents.ng', 'North-West', 'NG', 'pending_kyc', false, false, 0, 0),
  ('00000000-0000-0000-0000-000000000001', 'Tunde Adeyemi', '+2348015556666', 'tunde@gdsagents.ng', 'South-South', 'NG', 'training', true, false, 0, 0)
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════
-- ONBOARDING APPLICATIONS
-- ═══════════════════════════════════════════════════
INSERT INTO gds_onboarding_applications (tenant_id, establishment_name, contact_name, contact_email, contact_phone, country, city, property_type, rooms, channel, status, step, notes)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Kano Durbar Hotel', 'Musa Abdullahi', 'musa@kanodurbar.ng', '+2346431234567', 'NG', 'Kano', 'hotel', 45, 'ussd', 'documents_pending', 3, 'Rates set: NGN 25,000/night — awaiting star certificate'),
  ('00000000-0000-0000-0000-000000000001', 'Mama Put Beach Hut', 'Mama Tunde', 'mamaput@gmail.com', '+2348051234567', 'NG', 'Badagry', 'guesthouse', 6, 'ussd', 'registered', 1, 'Application submitted via USSD *384*GDS#'),
  ('00000000-0000-0000-0000-000000000001', 'Jos Plateau View Lodge', 'Danladi Bako', 'danladi@plateauview.ng', '+2348061234567', 'NG', 'Jos', 'lodge', 18, 'whatsapp', 'rate_setup', 2, 'Property details captured — setting rates'),
  ('00000000-0000-0000-0000-000000000001', 'Ogbomoso Heritage Inn', 'Chief Adisa', 'adisa@ogbomosoinn.ng', '+2348071234567', 'NG', 'Ogbomoso', 'guesthouse', 12, 'agent', 'in_review', 4, 'Documents submitted — under review')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════
-- DISTRIBUTION CHANNELS
-- ═══════════════════════════════════════════════════
INSERT INTO gds_distribution_channels (tenant_id, name, type, endpoint, countries, status, bookings_count, revenue)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Wakanow API', 'ota', 'https://api.wakanow.com/v2/gds', ARRAY['NG','GH','KE'], 'active', 342, 48500000),
  ('00000000-0000-0000-0000-000000000001', 'Jumia Travel Connect', 'ota', 'https://connect.jumia.travel/gds', ARRAY['NG','TZ','UG'], 'active', 187, 28200000),
  ('00000000-0000-0000-0000-000000000001', 'Hotels.ng Direct', 'direct', 'https://api.hotels.ng/v1/inventory', ARRAY['NG'], 'active', 256, 35800000),
  ('00000000-0000-0000-0000-000000000001', 'Travelstart Feed', 'xml_feed', 'https://feeds.travelstart.ng/gds.xml', ARRAY['NG','ZA','EG'], 'active', 156, 22100000),
  ('00000000-0000-0000-0000-000000000001', 'USSD Channel (*384*GDS#)', 'ussd', 'internal://ussd-gateway:8100', ARRAY['NG'], 'active', 89, 4500000)
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════
-- SANDBOX TEST CARDS
-- ═══════════════════════════════════════════════════
INSERT INTO gds_sandbox_test_cards (card_number, brand, scenario, expected_result)
VALUES
  ('5399 8300 0000 0001', 'Verve', 'successful_payment', 'approved'),
  ('5399 8300 0000 0002', 'Verve', 'insufficient_funds', 'declined'),
  ('5061 2400 0000 0001', 'Verve', 'successful_ngn_payment', 'approved'),
  ('4000 0000 0000 0119', 'Visa', 'successful_usd_payment', 'approved'),
  ('4000 0000 0000 0127', 'Visa', 'card_expired', 'declined'),
  ('5200 0000 0000 0007', 'Mastercard', 'successful_payment', 'approved'),
  ('5200 0000 0000 0015', 'Mastercard', '3ds_challenge', 'challenge'),
  ('0000 0000 0000 0001', 'Paystack Test', 'successful_paystack', 'approved'),
  ('0000 0000 0000 0002', 'Flutterwave Test', 'successful_flw', 'approved'),
  ('0000 0000 0000 0003', 'Interswitch Test', 'successful_isw', 'approved')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════
-- SANDBOX KEYS (default dev key)
-- ═══════════════════════════════════════════════════
INSERT INTO gds_sandbox_keys (tenant_id, name, api_key, environment, rate_limit, status)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Default Sandbox Key', 'sk_sandbox_gds_ng_test_' || md5(random()::text), 'sandbox', 100, 'active')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════
-- AVAILABILITY (next 30 days for Eko Hotels)
-- ═══════════════════════════════════════════════════
INSERT INTO gds_availability (property_id, room_type_code, date, total_rooms, booked_rooms)
SELECT p.id, rt.code, d::date, 
  CASE rt.code WHEN 'STD' THEN 80 WHEN 'DLX' THEN 40 ELSE 15 END,
  CASE rt.code WHEN 'STD' THEN (random()*60)::int WHEN 'DLX' THEN (random()*30)::int ELSE (random()*12)::int END
FROM gds_properties p
CROSS JOIN (VALUES ('STD'), ('DLX'), ('SUI')) AS rt(code)
CROSS JOIN generate_series(CURRENT_DATE, CURRENT_DATE + 30, '1 day') AS d
WHERE p.property_code = 'NG-EKO-001'
ON CONFLICT (property_id, room_type_code, date) DO NOTHING;

-- ═══════════════════════════════════════════════════
-- RATE PLANS (Eko Hotels)
-- ═══════════════════════════════════════════════════
INSERT INTO gds_rate_plans (property_id, room_type_code, rate_plan_code, date, rate, currency, meal_plan, min_stay)
SELECT p.id, rt.code, 'BAR', d::date,
  CASE rt.code WHEN 'STD' THEN 85000 WHEN 'DLX' THEN 135000 ELSE 250000 END,
  'NGN', 'BB', 1
FROM gds_properties p
CROSS JOIN (VALUES ('STD'), ('DLX'), ('SUI')) AS rt(code)
CROSS JOIN generate_series(CURRENT_DATE, CURRENT_DATE + 30, '1 day') AS d
WHERE p.property_code = 'NG-EKO-001'
ON CONFLICT DO NOTHING;
