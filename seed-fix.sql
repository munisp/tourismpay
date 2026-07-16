-- Fix seed for tables with different column names

-- AGENTS (has userId, agentCode, licenseNumber, agencyName, region, tier, commissionRate, totalPoliciesSold, totalPremiumCollected, status)
INSERT INTO agents (id, "userId", "agentCode", "licenseNumber", "agencyName", region, tier, "commissionRate", "totalPoliciesSold", "totalPremiumCollected", status, "createdAt", "updatedAt") VALUES
(1, 1, 'AGT-LAG-001', 'NAICOM/AG/2024/001', 'Kayode Adeniyi Insurance Agency', 'Lagos', 'Gold', 0.1500, 347, 45000000, 'active', NOW() - INTERVAL '2 years', NOW()),
(2, 2, 'AGT-ABJ-001', 'NAICOM/AG/2024/002', 'Zainab Usman Associates', 'Abuja', 'Silver', 0.1200, 234, 28000000, 'active', NOW() - INTERVAL '18 months', NOW()),
(3, 3, 'AGT-KAN-001', 'NAICOM/AG/2024/003', 'Suleiman Balarabe Insurance', 'Kano', 'Gold', 0.1500, 456, 52000000, 'active', NOW() - INTERVAL '20 months', NOW()),
(4, 4, 'AGT-PH-001', 'NAICOM/AG/2025/001', 'Comfort Amadi Insurance', 'Rivers', 'Bronze', 0.1000, 87, 8500000, 'active', NOW() - INTERVAL '8 months', NOW()),
(5, 5, 'AGT-IBD-001', 'NAICOM/AG/2023/001', 'Adewale Ojo & Partners', 'Oyo', 'Platinum', 0.1800, 621, 78000000, 'active', NOW() - INTERVAL '3 years', NOW()),
(6, 6, 'AGT-ENU-001', 'NAICOM/AG/2024/004', 'Obioma Nwachukwu Insurance', 'Enugu', 'Silver', 0.1200, 192, 19000000, 'active', NOW() - INTERVAL '14 months', NOW())
ON CONFLICT (id) DO NOTHING;

-- CLAIM EVIDENCE (has userId, claimId, evidenceType, fileName, fileUrl, description, status)
INSERT INTO claim_evidence (id, "userId", "claimId", "evidenceType", "fileName", "fileUrl", description, status, "createdAt") VALUES
(1, 1, 1, 'police_report', 'police_report.pdf', '/documents/claims/1/police_report.pdf', 'Police report AR/2026/LAG/1234', 'verified', NOW() - INTERVAL '2 weeks'),
(2, 1, 1, 'photo', 'accident_photo.jpg', '/documents/claims/1/photo_front.jpg', 'Accident scene photograph', 'verified', NOW() - INTERVAL '2 weeks'),
(3, 2, 2, 'invoice', 'hospital_invoice.pdf', '/documents/claims/2/hospital_invoice.pdf', 'Reddington Hospital invoice', 'verified', NOW() - INTERVAL '1 month'),
(4, 9, 3, 'assessment', 'plumber_report.pdf', '/documents/claims/3/plumber_report.pdf', 'Plumber assessment of burst pipe damage', 'pending', NOW() - INTERVAL '3 days'),
(5, 12, 7, 'certificate', 'death_certificate.pdf', '/documents/claims/7/death_certificate.pdf', 'Death certificate from Lagos State', 'verified', NOW() - INTERVAL '2 months'),
(6, 5, 9, 'weather_data', 'nimet_flood_alert.pdf', '/documents/claims/9/nimet_alert.pdf', 'NiMet flood alert NM/FL/2026/0234', 'verified', NOW() - INTERVAL '2 days'),
(7, 7, 11, 'satellite_data', 'ndvi_data.pdf', '/documents/claims/11/ndvi_data.pdf', 'NDVI satellite vegetation stress data', 'pending', NOW() - INTERVAL '3 weeks'),
(8, 7, 11, 'veterinary', 'vet_certificates.pdf', '/documents/claims/11/vet_certificates.pdf', 'Veterinary death certificates x8', 'pending', NOW() - INTERVAL '3 weeks')
ON CONFLICT (id) DO NOTHING;

-- PREMIUM RISK FACTORS (tableId not rateTableId, name not factorName, category not factorType, weight not factorValue)
INSERT INTO premium_risk_factors (id, "tableId", name, category, weight, "minValue", "maxValue", "createdAt", "updatedAt") VALUES
(1, 1, 'Vehicle Age >10yr', 'vehicle', 1.15, 10, 30, NOW(), NOW()),
(2, 1, 'Driver Under 25', 'driver', 1.25, 18, 25, NOW(), NOW()),
(3, 1, 'Lagos Zone', 'geography', 1.20, 0, 0, NOW(), NOW()),
(4, 2, 'No Claims 3yr', 'discount', 0.85, 3, 99, NOW(), NOW()),
(5, 2, 'GPS Tracker', 'discount', 0.90, 0, 0, NOW(), NOW()),
(6, 3, 'Age 50+', 'age', 1.30, 50, 100, NOW(), NOW()),
(7, 3, 'Pre-existing Conditions', 'medical', 1.50, 0, 0, NOW(), NOW()),
(8, 4, 'Group 50+ Employees', 'group_size', 0.80, 50, 9999, NOW(), NOW()),
(9, 5, 'Sprinkler System', 'fire_protection', 0.85, 0, 0, NOW(), NOW()),
(10, 5, 'Flood Zone A', 'geography', 1.40, 0, 0, NOW(), NOW()),
(11, 7, 'Smoker', 'lifestyle', 1.45, 0, 0, NOW(), NOW()),
(12, 7, 'BMI >30', 'health', 1.20, 30, 100, NOW(), NOW()),
(13, 8, 'Irrigated Land', 'agriculture', 0.90, 0, 0, NOW(), NOW()),
(14, 8, 'Flood Prone Area', 'geography', 1.35, 0, 0, NOW(), NOW()),
(15, 10, 'Urban Area', 'geography', 0.80, 0, 0, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ERPNEXT TRANSACTIONS - fix syncStatus enum value ('synced' -> check valid values)
INSERT INTO erpnext_transactions (id, "userId", "erpDocType", "erpDocId", "localEntityType", "localEntityId", "syncStatus", amount, currency, "lastSyncAt", "createdAt", "updatedAt") VALUES
(1, 1, 'Sales Invoice', 'SI-2026-00001', 'policy', '1', 'Synced', 25000, 'NGN', NOW() - INTERVAL '5 months', NOW() - INTERVAL '5 months', NOW()),
(2, 1, 'Sales Invoice', 'SI-2026-00002', 'policy', '2', 'Synced', 185000, 'NGN', NOW() - INTERVAL '4 months', NOW() - INTERVAL '4 months', NOW()),
(3, 2, 'Sales Invoice', 'SI-2026-00003', 'policy', '5', 'Synced', 85000, 'NGN', NOW() - INTERVAL '6 months', NOW() - INTERVAL '6 months', NOW()),
(4, 3, 'Payment Entry', 'PE-2026-00001', 'claim', '2', 'Synced', 175000, 'NGN', NOW() - INTERVAL '1 month', NOW() - INTERVAL '1 month', NOW()),
(5, 3, 'Payment Entry', 'PE-2026-00002', 'claim', '4', 'Synced', 92000, 'NGN', NOW() - INTERVAL '3 months', NOW() - INTERVAL '3 months', NOW()),
(6, 7, 'Journal Entry', 'JE-2026-00001', 'treaty', '1', 'Synced', 245000000, 'NGN', NOW() - INTERVAL '6 months', NOW() - INTERVAL '6 months', NOW()),
(7, 14, 'Sales Invoice', 'SI-2026-00004', 'policy', '12', 'Pending', 15000000, 'NGN', NULL, NOW() - INTERVAL '6 months', NOW()),
(8, 6, 'Payment Entry', 'PE-2026-00005', 'claim', '12', 'Synced', 100000, 'NGN', NOW() - INTERVAL '1 week', NOW() - INTERVAL '1 week', NOW())
ON CONFLICT (id) DO NOTHING;

-- DOCUMENTS (entityType, entityId, documentType, fileName, fileUrl, fileSize, mimeType)
INSERT INTO documents (id, "userId", "entityType", "entityId", "documentType", "fileName", "fileUrl", "fileSize", "mimeType", status, "createdAt", "updatedAt") VALUES
(1, 1, 'policy', '1', 'certificate', 'motor_certificate.pdf', '/documents/certificates/POL-2026-MTR-00001.pdf', 245000, 'application/pdf', 'active', NOW() - INTERVAL '5 months', NOW()),
(2, 2, 'policy', '5', 'id_card', 'health_insurance_card.pdf', '/documents/cards/POL-2026-HLT-00001.pdf', 180000, 'application/pdf', 'active', NOW() - INTERVAL '6 months', NOW()),
(3, 9, 'policy', '8', 'schedule', 'property_schedule.pdf', '/documents/schedules/POL-2026-PRP-00001.pdf', 350000, 'application/pdf', 'active', NOW() - INTERVAL '6 months', NOW()),
(4, 1, 'policy', '10', 'policy_document', 'life_policy.pdf', '/documents/policies/POL-2026-LIF-00001.pdf', 520000, 'application/pdf', 'active', NOW() - INTERVAL '12 months', NOW()),
(5, 14, 'policy', '12', 'policy_document', 'group_life_master.pdf', '/documents/policies/POL-2026-GRP-00001.pdf', 780000, 'application/pdf', 'active', NOW() - INTERVAL '6 months', NOW()),
(6, 5, 'filing', '1', 'regulatory', 'naicom_q1_2026.pdf', '/documents/naicom/QR_Q1_2026.pdf', 1200000, 'application/pdf', 'submitted', NOW() - INTERVAL '2 months', NOW()),
(7, 7, 'treaty', '1', 'treaty_document', 'africa_re_treaty.pdf', '/documents/reinsurance/TREATY_2026_001.pdf', 450000, 'application/pdf', 'active', NOW() - INTERVAL '6 months', NOW()),
(8, 6, 'report', '1', 'actuarial_report', 'valuation_2025.pdf', '/documents/actuarial/VALUATION_2025.pdf', 2100000, 'application/pdf', 'active', NOW() - INTERVAL '3 months', NOW())
ON CONFLICT (id) DO NOTHING;

-- ANALYTICS EVENTS (entityType, entityId, properties, sessionId, ipAddress)
INSERT INTO analytics_events (id, "userId", "eventType", "entityType", "entityId", properties, "sessionId", "ipAddress", "createdAt") VALUES
(1, 1, 'policy_purchase', 'policy', '1', '{"productType":"Motor","premium":25000,"channel":"web"}', 'sess-001', '197.210.45.32', NOW() - INTERVAL '5 months'),
(2, 2, 'policy_purchase', 'policy', '5', '{"productType":"Health","premium":85000,"channel":"web"}', 'sess-002', '197.210.45.33', NOW() - INTERVAL '6 months'),
(3, 1, 'claim_filed', 'claim', '1', '{"amount":450000,"channel":"web"}', 'sess-003', '197.210.45.32', NOW() - INTERVAL '2 weeks'),
(4, 2, 'claim_filed', 'claim', '2', '{"amount":180000,"channel":"mobile"}', 'sess-004', '197.210.45.33', NOW() - INTERVAL '1 month'),
(5, 9, 'policy_purchase', 'policy', '4', '{"productType":"Motor Fleet","premium":450000,"channel":"agent"}', 'sess-005', '197.210.45.50', NOW() - INTERVAL '3 months'),
(6, 9, 'policy_purchase', 'policy', '8', '{"productType":"Property","premium":350000,"channel":"web"}', 'sess-006', '197.210.45.50', NOW() - INTERVAL '6 months'),
(7, 12, 'claim_filed', 'claim', '7', '{"amount":50000000,"channel":"agent"}', 'sess-007', '197.210.45.60', NOW() - INTERVAL '2 months'),
(8, 6, 'policy_purchase', 'policy', '17', '{"productType":"Parametric","premium":8000,"channel":"ussd"}', 'sess-008', '197.210.45.70', NOW() - INTERVAL '1 month'),
(9, 8, 'policy_purchase', 'policy', '13', '{"productType":"Microinsurance","premium":3500,"channel":"ussd"}', 'sess-009', '197.210.45.80', NOW() - INTERVAL '1 month'),
(10, 5, 'naicom_filing', 'filing', '1', '{"filingType":"Quarterly Returns","period":"Q1 2026"}', 'sess-010', '197.210.45.35', NOW() - INTERVAL '2 months')
ON CONFLICT (id) DO NOTHING;

-- FRAUD ALERTS (alertId, severity, entityType, entityId, message, resolved)
INSERT INTO fraud_alerts (id, "userId", "alertId", severity, "entityType", "entityId", message, resolved, "createdAt", "resolvedAt") VALUES
(1, 1, 'FRD-2026-001', 'high', 'claim', '1', '2 claims in 60 days on same policy. Staged accident pattern suspected.', false, NOW() - INTERVAL '4 months', NULL),
(2, 9, 'FRD-2026-002', 'medium', 'claim', '10', 'Fleet claim filed 3 weeks after policy inception. Short seasoning.', true, NOW() - INTERVAL '1 month', NOW() - INTERVAL '2 weeks'),
(3, 7, 'FRD-2026-003', 'high', 'claim', '11', 'Veterinary certificates same signature across different clinics.', false, NOW() - INTERVAL '3 weeks', NULL),
(4, 12, 'FRD-2026-004', 'critical', 'claim', '7', 'Beneficiary changed 30 days before death claim filed.', false, NOW() - INTERVAL '2 months', NULL),
(5, 3, 'FRD-2026-005', 'medium', 'claim', '8', 'Hospital invoice in 2 claims from different policyholders.', true, NOW() - INTERVAL '3 months', NOW() - INTERVAL '2 months')
ON CONFLICT (id) DO NOTHING;

-- BANCASSURANCE PARTNERS (bankName, bankCode, commissionRate, products, status, apiEndpoint)
INSERT INTO bancassurance_partners (id, "bankName", "bankCode", "commissionRate", products, status, "apiEndpoint", "createdAt", "updatedAt") VALUES
(1, 'First Bank of Nigeria', 'FBN', 0.1250, ARRAY['Motor','Life','Health'], 'active', 'https://api.firstbanknigeria.com/insurance', NOW() - INTERVAL '18 months', NOW()),
(2, 'Access Bank Plc', 'ACCESS', 0.1100, ARRAY['Health','Agricultural'], 'active', 'https://api.accessbankplc.com/insurance', NOW() - INTERVAL '12 months', NOW()),
(3, 'United Bank for Africa', 'UBA', 0.1200, ARRAY['Motor','Property'], 'active', 'https://api.ubagroup.com/insurance', NOW() - INTERVAL '6 months', NOW()),
(4, 'Zenith Bank Plc', 'ZENITH', 0.1300, ARRAY['Life','Group_Life'], 'pending', 'https://api.zenithbank.com/insurance', NOW() - INTERVAL '1 month', NOW()),
(5, 'GTBank (Guaranty Trust)', 'GTB', 0.1150, ARRAY['Property','Motor'], 'active', 'https://api.gtbank.com/insurance', NOW() - INTERVAL '15 months', NOW())
ON CONFLICT (id) DO NOTHING;

-- BANCASSURANCE OFFERS (userId, partnerId, offerType, premium, sumAssured, status, expiresAt)
INSERT INTO bancassurance_offers (id, "userId", "partnerId", "offerType", premium, "sumAssured", status, "expiresAt", "createdAt") VALUES
(1, 1, 1, 'Motor Shield', 15000, 5000000, 'active', '2027-12-31', NOW() - INTERVAL '12 months'),
(2, 9, 1, 'Life Secure', 10000, 20000000, 'active', '2027-12-31', NOW() - INTERVAL '12 months'),
(3, 2, 2, 'Health Plus', 20000, 2000000, 'active', '2027-05-31', NOW() - INTERVAL '10 months'),
(4, 14, 5, 'Property Guard', 25000, 50000000, 'active', '2027-02-28', NOW() - INTERVAL '15 months'),
(5, 5, 2, 'Agri Shield', 3000, 500000, 'active', '2027-05-31', NOW() - INTERVAL '8 months')
ON CONFLICT (id) DO NOTHING;

-- CUSTOMER FEEDBACK (subject + message instead of comment)
INSERT INTO customer_feedback (id, "userId", "feedbackType", subject, message, rating, status, "createdAt", "updatedAt") VALUES
(1, 1, 'claims_process', 'Quick Claim Processing', 'Claim processed quickly. Adjuster was professional.', 4, 'resolved', NOW() - INTERVAL '3 months', NOW()),
(2, 4, 'customer_service', 'WhatsApp Bot', 'WhatsApp bot helped check policy instantly.', 5, 'resolved', NOW() - INTERVAL '2 months', NOW()),
(3, 2, 'policy_purchase', 'Premium Calculator', 'Good coverage but calculator was confusing.', 3, 'open', NOW() - INTERVAL '4 months', NOW()),
(4, 9, 'agent_service', 'Excellent Agent', 'Agent Kayode was extremely helpful with fleet policy.', 5, 'resolved', NOW() - INTERVAL '3 months', NOW()),
(5, 6, 'claims_process', 'Fast Parametric Payout', 'Parametric payout arrived within 72 hours as promised.', 4, 'resolved', NOW() - INTERVAL '1 week', NOW()),
(6, 8, 'product', 'Crop Shield Review', 'Crop Shield is exactly what small farmers need.', 5, 'resolved', NOW() - INTERVAL '1 month', NOW()),
(7, 3, 'claims_process', 'Slow Property Claim', 'Property claim taking too long. 2 weeks no update.', 2, 'escalated', NOW() - INTERVAL '5 days', NOW()),
(8, 12, 'customer_service', 'USSD Works Well', 'USSD channel works well without internet.', 4, 'resolved', NOW() - INTERVAL '2 months', NOW())
ON CONFLICT (id) DO NOTHING;

-- AUDIT TRAIL (entityType not entity, oldValues/newValues not details)
INSERT INTO audit_trail (id, "userId", action, "entityType", "entityId", "oldValues", "newValues", "ipAddress", "createdAt") VALUES
(1, 1, 'LOGIN', 'user', '1', NULL, '{"method":"email_password"}', '197.210.45.32', NOW() - INTERVAL '1 day'),
(2, 2, 'POLICY_APPROVED', 'policy', '1', '{"status":"Pending"}', '{"status":"Active","premium":25000}', '197.210.45.33', NOW() - INTERVAL '5 months'),
(3, 3, 'CLAIM_REVIEWED', 'claim', '2', '{"status":"Submitted"}', '{"status":"Approved","settlementAmount":175000}', '197.210.45.34', NOW() - INTERVAL '1 month'),
(4, 5, 'NAICOM_FILED', 'filing', '1', NULL, '{"filingType":"Quarterly Returns","period":"Q1 2026"}', '197.210.45.35', NOW() - INTERVAL '2 months'),
(5, 7, 'TREATY_CREATED', 'treaty', '1', NULL, '{"treatyName":"Property Surplus Treaty 2026","reinsurer":"Africa Re"}', '197.210.45.36', NOW() - INTERVAL '6 months'),
(6, 1, 'SETTINGS_CHANGED', 'system', 'config', '{"auto_renewal":false}', '{"auto_renewal":true}', '197.210.45.32', NOW() - INTERVAL '2 weeks'),
(7, 3, 'CLAIM_REJECTED', 'claim', '5', '{"status":"Under Review"}', '{"status":"Rejected","reason":"No police report within 24 hours"}', '197.210.45.34', NOW() - INTERVAL '4 months'),
(8, 2, 'UNDERWRITING_DECISION', 'application', '3', '{"status":"submitted"}', '{"status":"referred","reason":"Medical history requires review"}', '197.210.45.33', NOW() - INTERVAL '3 days')
ON CONFLICT (id) DO NOTHING;

-- DYNAMIC PRICING (userId, productType, basePremium, adjustedPremium, riskScore, quoteId)
INSERT INTO dynamic_pricing_history (id, "userId", "productType", "basePremium", "adjustedPremium", "riskScore", "quoteId", "createdAt") VALUES
(1, 1, 'Motor Third Party', 20000, 25000, 65, 'QT-2026-00001', NOW() - INTERVAL '5 months'),
(2, 2, 'Health Individual', 70000, 85000, 72, 'QT-2026-00002', NOW() - INTERVAL '6 months'),
(3, 9, 'Motor Fleet', 380000, 450000, 55, 'QT-2026-00003', NOW() - INTERVAL '3 months'),
(4, 9, 'Property Commercial', 280000, 350000, 48, 'QT-2026-00004', NOW() - INTERVAL '6 months'),
(5, 5, 'Agricultural Multi-Peril', 60000, 75000, 78, 'QT-2026-00005', NOW() - INTERVAL '2 months'),
(6, 6, 'Parametric Weather', 6000, 8000, 42, 'QT-2026-00006', NOW() - INTERVAL '1 month'),
(7, 14, 'Group Life', 12000000, 15000000, 35, 'QT-2026-00007', NOW() - INTERVAL '6 months'),
(8, 12, 'Life Whole', 200000, 250000, 58, 'QT-2026-00008', NOW() - INTERVAL '30 months')
ON CONFLICT (id) DO NOTHING;

-- EMERGENCY INCIDENTS (incidentType not type)
INSERT INTO emergency_incidents (id, "userId", "incidentType", latitude, longitude, description, status, "createdAt") VALUES
(1, 1, 'Motor Accident', 6.4281, 3.5023, 'Collision on Lekki-Epe Expressway near Chevron', 'resolved', NOW() - INTERVAL '2 weeks'),
(2, 4, 'Medical Emergency', 4.8156, 7.0498, 'Severe allergic reaction requiring ambulance dispatch', 'resolved', NOW() - INTERVAL '1 month'),
(3, 9, 'Property Fire', 6.4311, 3.4197, 'Office fire on 3rd floor. Fire service dispatched.', 'active', NOW() - INTERVAL '3 days')
ON CONFLICT (id) DO NOTHING;

-- MICROINSURANCE POLICIES (productId, productName, premium, coverage, duration, status, expiresAt)
INSERT INTO microinsurance_policies (id, "userId", "productId", "productName", premium, coverage, duration, status, "expiresAt", "createdAt") VALUES
(1, 8, 'MIC-CROP-001', 'Crop Shield - Maize', 3500, 150000, 180, 'active', NOW() + INTERVAL '5 months', NOW() - INTERVAL '1 month'),
(2, 13, 'MIC-MARKET-001', 'Market Women Shield', 2000, 500000, 365, 'active', NOW() + INTERVAL '10 months', NOW() - INTERVAL '2 months'),
(3, 15, 'MIC-OKADA-001', 'Okada Rider Cover', 1500, 300000, 365, 'active', NOW() + INTERVAL '9 months', NOW() - INTERVAL '3 months'),
(4, 11, 'MIC-ARTISAN-001', 'Artisan Shield', 2500, 400000, 365, 'pending', NULL, NOW() - INTERVAL '1 week'),
(5, 7, 'MIC-LIVE-001', 'Livestock Basic - Goats', 1800, 200000, 365, 'active', NOW() + INTERVAL '10 months', NOW() - INTERVAL '2 months')
ON CONFLICT (id) DO NOTHING;

-- SME POLICIES (productId, businessName, businessType, annualPremium, coverageAmount, status)
INSERT INTO sme_policies (id, "userId", "productId", "businessName", "businessType", "annualPremium", "coverageAmount", status, "createdAt", "updatedAt") VALUES
(1, 9, 'SME-LOGISTICS-01', 'Obasanjo Logistics Ltd', 'Logistics & Transport', 450000, 50000000, 'active', NOW() - INTERVAL '6 months', NOW()),
(2, 14, 'SME-LEGAL-01', 'Williams & Partners Law', 'Professional Services', 120000, 25000000, 'active', NOW() - INTERVAL '3 months', NOW()),
(3, 12, 'SME-RETAIL-01', 'Adesanya Fashion House', 'Retail & Fashion', 85000, 15000000, 'active', NOW() - INTERVAL '4 months', NOW()),
(4, 10, 'SME-TECH-01', 'TechHub Enugu', 'Technology', 65000, 10000000, 'active', NOW() - INTERVAL '2 months', NOW())
ON CONFLICT (id) DO NOTHING;

-- REINSURANCE CESSIONS (cedingAmount, retainedAmount, reinsurerPremium)
INSERT INTO reinsurance_cessions (id, "treatyId", "policyId", "cedingAmount", "retainedAmount", "reinsurerPremium", status, "cessionDate", "createdAt") VALUES
(1, 2, 1, 2000000, 3000000, 10000, 'active', '2026-01-15', NOW() - INTERVAL '5 months'),
(2, 2, 2, 18000000, 27000000, 74000, 'active', '2026-02-01', NOW() - INTERVAL '4 months'),
(3, 1, 8, 175000000, 75000000, 245000, 'active', '2026-01-01', NOW() - INTERVAL '6 months'),
(4, 4, 10, 25000000, 25000000, 60000, 'active', '2025-06-01', NOW() - INTERVAL '12 months'),
(5, 4, 11, 50000000, 50000000, 125000, 'active', '2024-01-01', NOW() - INTERVAL '30 months'),
(6, 4, 12, 1250000000, 1250000000, 7500000, 'active', '2026-01-01', NOW() - INTERVAL '6 months'),
(7, 5, 5, 5000000, 5000000, 42500, 'active', '2026-01-01', NOW() - INTERVAL '6 months'),
(8, 5, 7, 250000000, 250000000, 1250000, 'active', '2026-04-01', NOW() - INTERVAL '2 months'),
(9, 6, 15, 2500000, 2500000, 37500, 'active', '2026-04-01', NOW() - INTERVAL '2 months'),
(10, 6, 16, 7500000, 7500000, 60000, 'active', '2026-03-01', NOW() - INTERVAL '3 months')
ON CONFLICT (id) DO NOTHING;

-- FAMILY MEMBERS (memberName not name, coveredPolicyId not policyId, gender)
INSERT INTO family_members (id, "userId", "memberName", relationship, "dateOfBirth", gender, "coveredPolicyId", status, "createdAt") VALUES
(1, 2, 'Emeka Nnamdi', 'Spouse', '1988-03-10', 'male', 5, 'active', NOW() - INTERVAL '6 months'),
(2, 2, 'Ada Nnamdi', 'Child', '2015-09-22', 'female', 5, 'active', NOW() - INTERVAL '6 months'),
(3, 2, 'Chukwuemeka Nnamdi', 'Child', '2018-12-05', 'male', 5, 'active', NOW() - INTERVAL '6 months'),
(4, 2, 'Obiageli Nnamdi', 'Child', '2021-04-18', 'female', 5, 'active', NOW() - INTERVAL '6 months'),
(5, 1, 'Kemi Ogundimu', 'Spouse', '1987-08-20', 'female', 10, 'active', NOW() - INTERVAL '12 months'),
(6, 1, 'Tunde Ogundimu', 'Child', '2012-01-15', 'male', 10, 'active', NOW() - INTERVAL '12 months')
ON CONFLICT (id) DO NOTHING;

-- Fix: policies with sumAssured overflow - some values need to fit in the numeric column
-- The group life policy (id=12) had 2500000000 which may overflow depending on precision
UPDATE policies SET "sumAssured" = 999999999 WHERE id = 12 AND "sumAssured" > 999999999;

-- Reset additional sequences
SELECT setval(pg_get_serial_sequence('agents', 'id'), COALESCE((SELECT MAX(id) FROM agents), 1));
SELECT setval(pg_get_serial_sequence('claim_evidence', 'id'), COALESCE((SELECT MAX(id) FROM claim_evidence), 1));
SELECT setval(pg_get_serial_sequence('premium_risk_factors', 'id'), COALESCE((SELECT MAX(id) FROM premium_risk_factors), 1));
SELECT setval(pg_get_serial_sequence('erpnext_transactions', 'id'), COALESCE((SELECT MAX(id) FROM erpnext_transactions), 1));
SELECT setval(pg_get_serial_sequence('documents', 'id'), COALESCE((SELECT MAX(id) FROM documents), 1));
SELECT setval(pg_get_serial_sequence('analytics_events', 'id'), COALESCE((SELECT MAX(id) FROM analytics_events), 1));
SELECT setval(pg_get_serial_sequence('fraud_alerts', 'id'), COALESCE((SELECT MAX(id) FROM fraud_alerts), 1));
SELECT setval(pg_get_serial_sequence('bancassurance_partners', 'id'), COALESCE((SELECT MAX(id) FROM bancassurance_partners), 1));
SELECT setval(pg_get_serial_sequence('bancassurance_offers', 'id'), COALESCE((SELECT MAX(id) FROM bancassurance_offers), 1));
SELECT setval(pg_get_serial_sequence('customer_feedback', 'id'), COALESCE((SELECT MAX(id) FROM customer_feedback), 1));
SELECT setval(pg_get_serial_sequence('audit_trail', 'id'), COALESCE((SELECT MAX(id) FROM audit_trail), 1));
SELECT setval(pg_get_serial_sequence('dynamic_pricing_history', 'id'), COALESCE((SELECT MAX(id) FROM dynamic_pricing_history), 1));
SELECT setval(pg_get_serial_sequence('emergency_incidents', 'id'), COALESCE((SELECT MAX(id) FROM emergency_incidents), 1));
SELECT setval(pg_get_serial_sequence('microinsurance_policies', 'id'), COALESCE((SELECT MAX(id) FROM microinsurance_policies), 1));
SELECT setval(pg_get_serial_sequence('sme_policies', 'id'), COALESCE((SELECT MAX(id) FROM sme_policies), 1));
SELECT setval(pg_get_serial_sequence('reinsurance_cessions', 'id'), COALESCE((SELECT MAX(id) FROM reinsurance_cessions), 1));
SELECT setval(pg_get_serial_sequence('family_members', 'id'), COALESCE((SELECT MAX(id) FROM family_members), 1));
