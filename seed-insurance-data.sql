-- InsurePortal Comprehensive Database Seed — Realistic Nigerian Insurance Data
-- Each section is independent (no transaction wrapper) so individual failures don't cascade

-- 1. USERS
INSERT INTO users (id, name, email, role, "createdAt", "updatedAt") VALUES
(1, 'Patrick Munis', 'demo@insureportal.ng', 'admin', NOW() - INTERVAL '2 years', NOW()),
(2, 'Amara Okafor', 'amara.okafor@insureportal.ng', 'admin', NOW() - INTERVAL '18 months', NOW()),
(3, 'Chidi Eze', 'chidi.eze@insureportal.ng', 'admin', NOW() - INTERVAL '1 year', NOW()),
(4, 'Fatima Bello', 'fatima.bello@insureportal.ng', 'admin', NOW() - INTERVAL '14 months', NOW()),
(5, 'Emeka Nwosu', 'emeka.nwosu@insureportal.ng', 'admin', NOW() - INTERVAL '10 months', NOW()),
(6, 'Ngozi Adeyemi', 'ngozi.adeyemi@insureportal.ng', 'admin', NOW() - INTERVAL '8 months', NOW()),
(7, 'Tunde Afolabi', 'tunde.afolabi@insureportal.ng', 'admin', NOW() - INTERVAL '6 months', NOW())
ON CONFLICT (id) DO NOTHING;

-- 2. CUSTOMERS
INSERT INTO customers (id, "externalId", "firstName", "lastName", email, phone, bvn, nin, "dateOfBirth", address, status, "kycLevel", "walletBalance", "dailyLimit", "monthlyLimit", "createdAt", "updatedAt") VALUES
(1, 'CUST-NG-001', 'Adebayo', 'Ogundimu', 'adebayo.ogundimu@gmail.com', '+2348012345678', '22345678901', '12345678901', '1985-03-15', '24 Admiralty Way, Lekki Phase 1, Lagos', 'active', 3, 150000, 500000, 5000000, NOW() - INTERVAL '18 months', NOW()),
(2, 'CUST-NG-002', 'Chioma', 'Nnamdi', 'chioma.nnamdi@yahoo.com', '+2348023456789', '33456789012', '23456789012', '1990-07-22', '15 Gana Street, Maitama, Abuja', 'active', 3, 250000, 500000, 5000000, NOW() - INTERVAL '14 months', NOW()),
(3, 'CUST-NG-003', 'Abdullahi', 'Ibrahim', 'abdullahi.ibrahim@outlook.com', '+2348034567890', '44567890123', '34567890123', '1978-11-03', '8 Ahmadu Bello Way, Kaduna', 'active', 2, 80000, 300000, 3000000, NOW() - INTERVAL '12 months', NOW()),
(4, 'CUST-NG-004', 'Blessing', 'Uchenna', 'blessing.uchenna@gmail.com', '+2348045678901', '55678901234', '45678901234', '1992-01-18', '42 Trans Amadi Road, Port Harcourt', 'active', 3, 320000, 500000, 5000000, NOW() - INTERVAL '10 months', NOW()),
(5, 'CUST-NG-005', 'Olumide', 'Fashola', 'olumide.fashola@hotmail.com', '+2348056789012', '66789012345', '56789012345', '1988-09-07', '7 Ring Road, Ibadan', 'active', 2, 45000, 200000, 2000000, NOW() - INTERVAL '8 months', NOW()),
(6, 'CUST-NG-006', 'Hadiza', 'Sani', 'hadiza.sani@gmail.com', '+2348067890123', '77890123456', '67890123456', '1995-04-25', '3 Sultan Abubakar Road, Sokoto', 'active', 3, 190000, 500000, 5000000, NOW() - INTERVAL '7 months', NOW()),
(7, 'CUST-NG-007', 'Tochukwu', 'Obi', 'tochukwu.obi@gmail.com', '+2348078901234', '88901234567', '78901234567', '1982-12-10', '19 New Market Road, Onitsha', 'active', 2, 110000, 300000, 3000000, NOW() - INTERVAL '6 months', NOW()),
(8, 'CUST-NG-008', 'Aisha', 'Mohammed', 'aisha.mohammed@yahoo.com', '+2348089012345', '99012345678', '89012345678', '1997-06-30', '5 Murtala Mohammed Way, Kano', 'active', 1, 25000, 100000, 1000000, NOW() - INTERVAL '3 months', NOW()),
(9, 'CUST-NG-009', 'Segun', 'Obasanjo', 'segun.obasanjo@gmail.com', '+2348090123456', '10123456789', '90123456789', '1975-08-14', '33 Akin Adesola Street, Victoria Island, Lagos', 'active', 3, 500000, 1000000, 10000000, NOW() - INTERVAL '20 months', NOW()),
(10, 'CUST-NG-010', 'Ngozi', 'Eze', 'ngozi.eze@outlook.com', '+2348011234567', '21234567890', '01234567890', '1993-02-28', '12 Independence Layout, Enugu', 'active', 3, 175000, 500000, 5000000, NOW() - INTERVAL '15 months', NOW()),
(11, 'CUST-NG-011', 'Yakubu', 'Gowon', 'yakubu.gowon@gmail.com', '+2348022345678', '32345678901', '12345098765', '1980-05-20', '27 Sabon Gari, Zaria', 'pending_kyc', 0, 0, 50000, 500000, NOW() - INTERVAL '1 week', NOW()),
(12, 'CUST-NG-012', 'Funmi', 'Adesanya', 'funmi.adesanya@yahoo.com', '+2348033456789', '43456789012', '23456098765', '1991-10-12', '88 Allen Avenue, Ikeja, Lagos', 'active', 3, 420000, 500000, 5000000, NOW() - INTERVAL '22 months', NOW()),
(13, 'CUST-NG-013', 'Musa', 'Danladi', 'musa.danladi@gmail.com', '+2348044567890', '54567890123', '34567098765', '1970-03-01', '14 Lamido Crescent, Yola', 'active', 2, 60000, 200000, 2000000, NOW() - INTERVAL '9 months', NOW()),
(14, 'CUST-NG-014', 'Adeola', 'Williams', 'adeola.williams@gmail.com', '+2348055678901', '65678901234', '45678098765', '1986-07-19', '50 Broad Street, Lagos Island', 'active', 3, 680000, 1000000, 10000000, NOW() - INTERVAL '24 months', NOW()),
(15, 'CUST-NG-015', 'Ifeanyi', 'Okechukwu', 'ifeanyi.okechukwu@outlook.com', '+2348066789012', '76789012345', '56789098765', '1994-11-05', '6 Ogui Road, Enugu', 'active', 2, 95000, 300000, 3000000, NOW() - INTERVAL '5 months', NOW())
ON CONFLICT (id) DO NOTHING;

-- 3. AGENTS
INSERT INTO agents (id, "agentCode", name, email, phone, region, status, tier, "floatBalance", "totalTransactions", "lastActiveDate", "createdAt") VALUES
(1, 'AGT-LAG-001', 'Kayode Adeniyi', 'kayode.adeniyi@insureportal.ng', '+2348091234567', 'Lagos', 'active', 'Gold', 2500000, 1847, NOW() - INTERVAL '1 day', NOW() - INTERVAL '2 years'),
(2, 'AGT-ABJ-001', 'Zainab Usman', 'zainab.usman@insureportal.ng', '+2348092345678', 'Abuja', 'active', 'Silver', 1800000, 1234, NOW() - INTERVAL '2 days', NOW() - INTERVAL '18 months'),
(3, 'AGT-KAN-001', 'Suleiman Balarabe', 'suleiman.balarabe@insureportal.ng', '+2348093456789', 'Kano', 'active', 'Gold', 3100000, 2156, NOW() - INTERVAL '1 day', NOW() - INTERVAL '20 months'),
(4, 'AGT-PH-001', 'Comfort Amadi', 'comfort.amadi@insureportal.ng', '+2348094567890', 'Rivers', 'active', 'Bronze', 950000, 567, NOW() - INTERVAL '3 days', NOW() - INTERVAL '8 months'),
(5, 'AGT-IBD-001', 'Adewale Ojo', 'adewale.ojo@insureportal.ng', '+2348095678901', 'Oyo', 'active', 'Platinum', 4200000, 3421, NOW() - INTERVAL '1 day', NOW() - INTERVAL '3 years'),
(6, 'AGT-ENU-001', 'Obioma Nwachukwu', 'obioma.nwachukwu@insureportal.ng', '+2348096789012', 'Enugu', 'active', 'Silver', 1200000, 892, NOW() - INTERVAL '4 days', NOW() - INTERVAL '14 months')
ON CONFLICT (id) DO NOTHING;

-- 4. POLICIES
INSERT INTO policies (id, "userId", "policyNumber", name, type, premium, status, "startDate", "expiryDate", "sumAssured", "coverageDetails", "createdAt", "updatedAt") VALUES
(1, 1, 'POL-2026-MTR-00001', 'Motor Third Party - Toyota Camry 2022', 'Auto', 25000, 'Active', '2026-01-15', '2027-01-14', 5000000, '{"vehicleReg":"LAG-234-XY","vehicleType":"Sedan","thirdPartyLimit":5000000,"personalAccident":500000}', NOW() - INTERVAL '5 months', NOW()),
(2, 1, 'POL-2026-MTR-00002', 'Motor Comprehensive - Range Rover Sport 2025', 'Auto', 185000, 'Active', '2026-02-01', '2027-01-31', 45000000, '{"vehicleReg":"ABJ-789-CD","vehicleType":"SUV","comprehensive":true,"excess":250000}', NOW() - INTERVAL '4 months', NOW()),
(3, 2, 'POL-2026-MTR-00003', 'Motor Third Party - Honda Civic 2021', 'Auto', 18000, 'Active', '2025-11-01', '2026-10-31', 3000000, '{"vehicleReg":"LAG-567-EF","vehicleType":"Sedan","thirdPartyLimit":3000000}', NOW() - INTERVAL '7 months', NOW()),
(4, 9, 'POL-2026-MTR-00004', 'Motor Fleet - 12 Delivery Vehicles', 'Auto', 450000, 'Active', '2026-03-01', '2027-02-28', 120000000, '{"fleetSize":12,"vehicleTypes":["Van","Truck"],"fleetDiscount":15}', NOW() - INTERVAL '3 months', NOW()),
(5, 2, 'POL-2026-HLT-00001', 'Health Premier Plan - Family', 'Health', 85000, 'Active', '2026-01-01', '2026-12-31', 10000000, '{"planLevel":"Premier","dependents":3,"inPatient":true,"outPatient":true,"dental":true,"optical":true}', NOW() - INTERVAL '6 months', NOW()),
(6, 4, 'POL-2026-HLT-00002', 'Health Basic Plan - Individual', 'Health', 25000, 'Active', '2026-02-15', '2027-02-14', 2000000, '{"planLevel":"Basic","dependents":0,"inPatient":true,"outPatient":true}', NOW() - INTERVAL '4 months', NOW()),
(7, 10, 'POL-2026-HLT-00003', 'Health Corporate Plan - 50 employees', 'Health', 2500000, 'Active', '2026-04-01', '2027-03-31', 500000000, '{"planLevel":"Corporate","employees":50,"inPatient":true,"outPatient":true,"dental":true}', NOW() - INTERVAL '2 months', NOW()),
(8, 9, 'POL-2026-PRP-00001', 'Commercial Property - Victoria Island Office', 'Property', 350000, 'Active', '2026-01-01', '2026-12-31', 250000000, '{"propertyType":"Commercial","address":"33 Akin Adesola, VI, Lagos","constructionType":"Reinforced Concrete","perils":["Fire","Flood","Burglary","Riot"]}', NOW() - INTERVAL '6 months', NOW()),
(9, 3, 'POL-2026-PRP-00002', 'Residential Property - Kaduna Home', 'Property', 45000, 'Active', '2025-12-01', '2026-11-30', 35000000, '{"propertyType":"Residential","address":"8 Ahmadu Bello Way, Kaduna","perils":["Fire","Flood","Burglary"]}', NOW() - INTERVAL '7 months', NOW()),
(10, 1, 'POL-2026-LIF-00001', 'Term Life 20-Year', 'Life', 120000, 'Active', '2025-06-01', '2045-05-31', 50000000, '{"policyTerm":20,"beneficiaries":[{"name":"Kemi Ogundimu","relationship":"Spouse","pct":60},{"name":"Tunde Ogundimu","relationship":"Child","pct":40}]}', NOW() - INTERVAL '12 months', NOW()),
(11, 12, 'POL-2026-LIF-00002', 'Whole Life - 100M Cover', 'Life', 250000, 'Active', '2024-01-01', '2099-12-31', 100000000, '{"policyTerm":"Whole Life","cashValue":1850000}', NOW() - INTERVAL '30 months', NOW()),
(12, 14, 'POL-2026-GRP-00001', 'Group Life - Dangote Industries 500 employees', 'Group_Life', 15000000, 'Active', '2026-01-01', '2026-12-31', 2500000000, '{"employeeCount":500,"averageSalary":450000,"multiplier":3}', NOW() - INTERVAL '6 months', NOW()),
(13, 8, 'POL-2026-MIC-00001', 'Crop Shield - Maize 2ha', 'Microinsurance', 3500, 'Active', '2026-05-01', '2026-11-30', 150000, '{"cropType":"Maize","area":2,"unit":"hectares","triggerCondition":"Rainfall below 20mm in 30 days","payoutModel":"Parametric"}', NOW() - INTERVAL '1 month', NOW()),
(14, 13, 'POL-2026-MIC-00002', 'Market Women Shield - Inventory', 'Microinsurance', 2000, 'Active', '2026-04-15', '2027-04-14', 500000, '{"businessType":"Retail Trade","perils":["Fire","Theft","Flood"]}', NOW() - INTERVAL '2 months', NOW()),
(15, 5, 'POL-2026-AGR-00001', 'Agricultural Multi-Peril - Rice 10ha', 'Agricultural', 75000, 'Active', '2026-04-01', '2026-12-31', 5000000, '{"cropType":"Rice","area":10,"unit":"hectares","perils":["Drought","Flood","Pest","Disease"],"yieldGuarantee":"70%"}', NOW() - INTERVAL '2 months', NOW()),
(16, 7, 'POL-2026-AGR-00002', 'IBLI Livestock Index - 50 Cattle', 'Agricultural', 120000, 'Active', '2026-03-01', '2027-02-28', 15000000, '{"livestockType":"Cattle","headCount":50,"indexType":"NDVI Satellite","triggerThreshold":"NDVI < 0.25"}', NOW() - INTERVAL '3 months', NOW()),
(17, 6, 'POL-2026-PAR-00001', 'ClimaCash FloodCash - Sokoto', 'Parametric', 8000, 'Active', '2026-05-01', '2027-04-30', 100000, '{"triggerType":"Rainfall","threshold":"380mm/week","payoutAmount":100000,"dataSource":"NiMet","payoutSpeed":"72 hours"}', NOW() - INTERVAL '1 month', NOW()),
(18, 5, 'POL-2025-MTR-00099', 'Motor Third Party - Expired', 'Auto', 20000, 'Expired', '2024-12-01', '2025-11-30', 3000000, '{"expired":true}', NOW() - INTERVAL '18 months', NOW()),
(19, 3, 'POL-2025-HLT-00088', 'Health Plan - Cancelled', 'Health', 35000, 'Cancelled', '2025-06-01', '2026-05-31', 5000000, '{"cancelledReason":"Switched provider","refundAmount":17500}', NOW() - INTERVAL '12 months', NOW()),
(20, 11, 'POL-2026-LIF-00099', 'Term Life - Pending Underwriting', 'Life', 95000, 'Pending', '2026-06-01', '2046-05-31', 30000000, '{"pendingDocuments":["Medical Report","Income Proof"],"uwStatus":"Awaiting Medical"}', NOW() - INTERVAL '1 week', NOW())
ON CONFLICT (id) DO NOTHING;

-- 5. CLAIMS
INSERT INTO claims (id, "userId", "policyId", "claimNumber", amount, status, "incidentDate", description, "fraudScore", "adjudicatorId", "settlementAmount", "createdAt", "updatedAt") VALUES
(1, 1, 1, 'CLM-2026-00001', 450000, 'Under Review', '2026-05-15', 'Rear-end collision at Lekki-Epe Expressway. Police report filed AR/2026/LAG/1234.', 12.5, 3, NULL, NOW() - INTERVAL '2 weeks', NOW()),
(2, 2, 5, 'CLM-2026-00002', 180000, 'Approved', '2026-04-20', 'Emergency appendectomy at Reddington Hospital. 3-day admission.', 5.0, 3, 175000, NOW() - INTERVAL '1 month', NOW()),
(3, 9, 8, 'CLM-2026-00003', 2500000, 'Submitted', '2026-05-28', 'Water damage from burst pipe - server room and reception flooded.', 8.2, NULL, NULL, NOW() - INTERVAL '3 days', NOW()),
(4, 4, 6, 'CLM-2026-00004', 95000, 'Paid', '2026-03-10', 'Fracture right arm - X-ray and casting at EKO Hospital.', 3.1, 3, 92000, NOW() - INTERVAL '3 months', NOW()),
(5, 1, 2, 'CLM-2026-00005', 1200000, 'Rejected', '2026-02-14', 'Vehicle accessories theft claim rejected - no police report within 24hrs.', 78.5, 3, 0, NOW() - INTERVAL '4 months', NOW()),
(6, 10, 7, 'CLM-2026-00006', 3500000, 'Approved', '2026-05-01', 'Employee cardiac event - 5 day ICU admission at LUTH.', 2.0, 3, 3450000, NOW() - INTERVAL '1 month', NOW()),
(7, 12, 11, 'CLM-2026-00007', 50000000, 'Escalated', '2026-04-15', 'Life claim - policyholder deceased (natural causes). High value requires senior review.', 15.0, NULL, NULL, NOW() - INTERVAL '2 months', NOW()),
(8, 3, 9, 'CLM-2026-00008', 850000, 'Under Review', '2026-05-20', 'Fire damage to kitchen and living room. Electrical fault from power surge.', 22.0, 3, NULL, NOW() - INTERVAL '1 week', NOW()),
(9, 5, 15, 'CLM-2026-00009', 3200000, 'Submitted', '2026-06-01', 'Rice crop loss - 6 of 10 hectares destroyed by flooding in Kebbi State.', 5.5, NULL, NULL, NOW() - INTERVAL '2 days', NOW()),
(10, 9, 4, 'CLM-2026-00010', 750000, 'Approved', '2026-04-28', 'Fleet vehicle #7 total loss on Lagos-Ibadan Expressway.', 10.0, 3, 720000, NOW() - INTERVAL '1 month', NOW()),
(11, 7, 16, 'CLM-2026-00011', 2400000, 'Under Review', '2026-05-10', 'Livestock loss - 8 cattle died during drought. NDVI confirms vegetation stress.', 7.8, NULL, NULL, NOW() - INTERVAL '3 weeks', NOW()),
(12, 6, 17, 'CLM-2026-00012', 100000, 'Paid', '2026-05-22', 'Parametric trigger: rainfall exceeded 380mm Sokoto. Auto payout in 72hrs.', 0.0, NULL, 100000, NOW() - INTERVAL '1 week', NOW())
ON CONFLICT (id) DO NOTHING;

-- 6. CLAIM EVIDENCE
INSERT INTO claim_evidence (id, "claimId", "fileName", "fileType", "fileUrl", "uploadedAt") VALUES
(1, 1, 'police_report.pdf', 'application/pdf', '/documents/claims/1/police_report.pdf', NOW() - INTERVAL '2 weeks'),
(2, 1, 'accident_photo_front.jpg', 'image/jpeg', '/documents/claims/1/photo_front.jpg', NOW() - INTERVAL '2 weeks'),
(3, 2, 'hospital_invoice.pdf', 'application/pdf', '/documents/claims/2/hospital_invoice.pdf', NOW() - INTERVAL '1 month'),
(4, 3, 'plumber_report.pdf', 'application/pdf', '/documents/claims/3/plumber_report.pdf', NOW() - INTERVAL '3 days'),
(5, 7, 'death_certificate.pdf', 'application/pdf', '/documents/claims/7/death_certificate.pdf', NOW() - INTERVAL '2 months'),
(6, 9, 'nimet_flood_alert.pdf', 'application/pdf', '/documents/claims/9/nimet_alert.pdf', NOW() - INTERVAL '2 days'),
(7, 11, 'ndvi_satellite_data.pdf', 'application/pdf', '/documents/claims/11/ndvi_data.pdf', NOW() - INTERVAL '3 weeks'),
(8, 11, 'vet_death_certificates.pdf', 'application/pdf', '/documents/claims/11/vet_certificates.pdf', NOW() - INTERVAL '3 weeks')
ON CONFLICT (id) DO NOTHING;

-- 7. PREMIUM RATE TABLES
INSERT INTO premium_rate_tables (id, "userId", name, "productType", "effectiveDate", "expiryDate", status, "baseRate", "createdAt", "updatedAt") VALUES
(1, 2, 'Motor Third Party 2026', 'Auto', '2026-01-01', '2026-12-31', 'active', 0.50, NOW() - INTERVAL '6 months', NOW()),
(2, 2, 'Motor Comprehensive 2026', 'Auto', '2026-01-01', '2026-12-31', 'active', 3.50, NOW() - INTERVAL '6 months', NOW()),
(3, 2, 'Health Individual 2026', 'Health', '2026-01-01', '2026-12-31', 'active', 4.25, NOW() - INTERVAL '6 months', NOW()),
(4, 2, 'Health Corporate 2026', 'Health', '2026-01-01', '2026-12-31', 'active', 3.80, NOW() - INTERVAL '6 months', NOW()),
(5, 2, 'Property Commercial 2026', 'Property', '2026-01-01', '2026-12-31', 'active', 0.15, NOW() - INTERVAL '6 months', NOW()),
(6, 2, 'Property Residential 2026', 'Property', '2026-01-01', '2026-12-31', 'active', 0.10, NOW() - INTERVAL '6 months', NOW()),
(7, 2, 'Term Life 2026', 'Life', '2026-01-01', '2026-12-31', 'active', 0.24, NOW() - INTERVAL '6 months', NOW()),
(8, 2, 'Agricultural Multi-Peril 2026', 'Agricultural', '2026-01-01', '2026-12-31', 'active', 1.50, NOW() - INTERVAL '6 months', NOW()),
(9, 2, 'Microinsurance Crop 2026', 'Microinsurance', '2026-01-01', '2026-12-31', 'active', 2.30, NOW() - INTERVAL '6 months', NOW()),
(10, 2, 'Parametric Weather 2026', 'Parametric', '2026-01-01', '2026-12-31', 'active', 8.00, NOW() - INTERVAL '6 months', NOW())
ON CONFLICT (id) DO NOTHING;

-- 8. PREMIUM RISK FACTORS
INSERT INTO premium_risk_factors (id, "rateTableId", "factorName", "factorType", "factorValue", description, "createdAt") VALUES
(1, 1, 'Vehicle Age >10yr', 'multiplier', 1.15, '15% loading for vehicles older than 10 years', NOW()),
(2, 1, 'Driver Under 25', 'multiplier', 1.25, 'Young driver surcharge 25%', NOW()),
(3, 1, 'Lagos Zone', 'multiplier', 1.20, 'High-traffic zone loading', NOW()),
(4, 2, 'No Claims 3yr', 'discount', 0.85, '15% NCB discount', NOW()),
(5, 2, 'GPS Tracker', 'discount', 0.90, '10% discount for GPS tracking', NOW()),
(6, 3, 'Age 50+', 'multiplier', 1.30, 'Age-related health loading', NOW()),
(7, 3, 'Pre-existing', 'multiplier', 1.50, 'Pre-existing condition loading', NOW()),
(8, 4, 'Group 50+', 'discount', 0.80, '20% group discount for 50+ employees', NOW()),
(9, 5, 'Sprinkler System', 'discount', 0.85, '15% discount for fire protection', NOW()),
(10, 5, 'Flood Zone A', 'multiplier', 1.40, '40% flood risk loading', NOW()),
(11, 7, 'Smoker', 'multiplier', 1.45, '45% smoker loading', NOW()),
(12, 7, 'BMI >30', 'multiplier', 1.20, '20% high BMI loading', NOW()),
(13, 8, 'Irrigated Land', 'discount', 0.90, '10% discount for irrigated farmland', NOW()),
(14, 8, 'Flood Zone', 'multiplier', 1.35, '35% flood-prone area loading', NOW()),
(15, 10, 'Urban Area', 'multiplier', 0.80, '20% discount urban parametric', NOW())
ON CONFLICT (id) DO NOTHING;

-- 9. NAICOM FILINGS
INSERT INTO naicom_filings (id, "userId", "filingType", period, status, "submittedAt", "dueDate", "filingRef", "createdAt", "updatedAt") VALUES
(1, 5, 'Quarterly Returns', 'Q1 2026', 'Submitted', '2026-04-10', '2026-04-30', 'NAICOM/QR/2026/Q1/IP-001', NOW() - INTERVAL '2 months', NOW()),
(2, 5, 'Annual Financial Statement', '2025', 'Approved', '2026-03-15', '2026-03-31', 'NAICOM/AFS/2025/IP-001', NOW() - INTERVAL '3 months', NOW()),
(3, 5, 'Solvency Margin Report', 'Q1 2026', 'Submitted', '2026-04-12', '2026-04-30', 'NAICOM/SMR/2026/Q1/IP-001', NOW() - INTERVAL '2 months', NOW()),
(4, 5, 'Risk-Based Capital Report', 'Q1 2026', 'Under Review', '2026-04-15', '2026-04-30', 'NAICOM/RBCR/2026/Q1/IP-001', NOW() - INTERVAL '2 months', NOW()),
(5, 5, 'Claims Experience Report', '2025', 'Approved', '2026-02-28', '2026-03-31', 'NAICOM/CER/2025/IP-001', NOW() - INTERVAL '4 months', NOW()),
(6, 5, 'Reinsurance Arrangement', '2026', 'Submitted', '2026-01-31', '2026-02-28', 'NAICOM/RAR/2026/IP-001', NOW() - INTERVAL '5 months', NOW()),
(7, 5, 'Investment Report', 'Q2 2026', 'Pending', NULL, '2026-07-31', 'NAICOM/IR/2026/Q2/IP-001', NOW() - INTERVAL '1 week', NOW()),
(8, 5, 'AML Report', 'Q1 2026', 'Submitted', '2026-04-28', '2026-04-30', 'NAICOM/AML/2026/Q1/IP-001', NOW() - INTERVAL '2 months', NOW()),
(9, 5, 'Market Conduct Report', '2025', 'Approved', '2026-02-15', '2026-03-31', 'NAICOM/MCR/2025/IP-001', NOW() - INTERVAL '4 months', NOW()),
(10, 5, 'Quarterly Returns', 'Q2 2026', 'Draft', NULL, '2026-07-31', NULL, NOW() - INTERVAL '1 day', NOW())
ON CONFLICT (id) DO NOTHING;

-- 10. COMPLIANCE REPORTS
INSERT INTO compliance_reports (id, "reportType", period, status, "periodStart", "periodEnd", "totalAlerts", "highAlerts", "mediumAlerts", "lowAlerts", "escalatedAlerts", "resolvedAlerts", "generatedBy", "createdAt", "updatedAt") VALUES
(1, 'AML/CFT Compliance', 'Q1 2026', 'Published', '2026-01-01', '2026-03-31', 47, 3, 12, 32, 2, 45, 'compliance_engine', NOW() - INTERVAL '2 months', NOW()),
(2, 'KYC Verification', 'May 2026', 'Published', '2026-05-01', '2026-05-31', 156, 8, 34, 114, 5, 148, 'kyc_system', NOW() - INTERVAL '1 month', NOW()),
(3, 'NAICOM Score', 'Q1 2026', 'Published', '2026-01-01', '2026-03-31', 12, 0, 4, 8, 0, 12, 'naicom_module', NOW() - INTERVAL '2 months', NOW()),
(4, 'Sanctions Screening', 'Q1 2026', 'Published', '2026-01-01', '2026-03-31', 8, 1, 2, 5, 1, 7, 'sanctions_engine', NOW() - INTERVAL '2 months', NOW()),
(5, 'NDPR Data Privacy', 'Q1 2026', 'Published', '2026-01-01', '2026-03-31', 23, 2, 7, 14, 1, 22, 'ndpr_module', NOW() - INTERVAL '2 months', NOW()),
(6, 'Claims Audit', 'Q1 2026', 'Draft', '2026-01-01', '2026-03-31', 34, 5, 11, 18, 3, 28, 'claims_audit', NOW() - INTERVAL '1 month', NOW()),
(7, 'Agent Conduct', 'Q1 2026', 'Published', '2026-01-01', '2026-03-31', 19, 1, 6, 12, 1, 18, 'agent_compliance', NOW() - INTERVAL '2 months', NOW())
ON CONFLICT (id) DO NOTHING;

-- 11. REINSURANCE TREATIES
INSERT INTO reinsurance_treaties (id, "userId", "treatyName", "treatyType", reinsurer, "reinsurerShare", "retentionLimit", "coverLimit", "commissionRate", "effectiveDate", "expiryDate", status, "linesOfBusiness", "createdAt", "updatedAt") VALUES
(1, 7, 'Property Surplus Treaty 2026', 'Surplus', 'Africa Re', 70.00, 50000000, 500000000, 32.50, '2026-01-01', '2026-12-31', 'active', ARRAY['Property', 'Fire'], NOW() - INTERVAL '6 months', NOW()),
(2, 7, 'Motor Quota Share 2026', 'Quota Share', 'Continental Re', 40.00, 0, 200000000, 30.00, '2026-01-01', '2026-12-31', 'active', ARRAY['Motor'], NOW() - INTERVAL '6 months', NOW()),
(3, 7, 'Catastrophe XL Treaty', 'Excess of Loss', 'Swiss Re Africa', 0, 100000000, 1000000000, 15.00, '2026-01-01', '2026-12-31', 'active', ARRAY['Property', 'Agricultural', 'Parametric'], NOW() - INTERVAL '6 months', NOW()),
(4, 7, 'Life Quota Share 2026', 'Quota Share', 'Munich Re Africa', 50.00, 0, 500000000, 28.00, '2026-01-01', '2026-12-31', 'active', ARRAY['Life', 'Group_Life'], NOW() - INTERVAL '6 months', NOW()),
(5, 7, 'Health Stop Loss', 'Stop Loss', 'Hannover Re', 0, 50000000, 300000000, 20.00, '2026-01-01', '2026-12-31', 'active', ARRAY['Health'], NOW() - INTERVAL '6 months', NOW()),
(6, 7, 'Agricultural Weather XL', 'Excess of Loss', 'CICA Re', 0, 20000000, 200000000, 18.00, '2026-01-01', '2026-12-31', 'active', ARRAY['Agricultural', 'Parametric', 'Microinsurance'], NOW() - INTERVAL '6 months', NOW())
ON CONFLICT (id) DO NOTHING;

-- 12. ACTUARIAL CALCULATIONS
INSERT INTO actuarial_calculations (id, "userId", "calculationType", "policyType", "inputParams", result, breakdown, "createdAt") VALUES
(1, 6, 'Loss Ratio', 'All Lines', '{"period":"Q1 2026","earnedPremium":2400000000,"incurredClaims":1495200000}', 62.30, '{"motor":58.2,"health":71.5,"property":45.8,"life":32.1,"agricultural":89.3,"parametric":15.0}', NOW() - INTERVAL '1 month'),
(2, 6, 'Combined Ratio', 'All Lines', '{"period":"Q1 2026","lossRatio":62.3,"expenseRatio":28.5}', 90.80, '{"underwritingProfit":9.2,"investmentIncome":4.8,"operatingRatio":86.0}', NOW() - INTERVAL '1 month'),
(3, 6, 'Solvency Margin', 'All Lines', '{"admittedAssets":18500000000,"totalLiabilities":10000000000,"minimumCapital":3000000000}', 185.00, '{"riskBasedCapital":8500000000,"regulatoryMinimum":3000000000,"surplus":5500000000}', NOW() - INTERVAL '1 month'),
(4, 6, 'IBNR Reserve', 'Motor', '{"method":"Chain Ladder","developmentFactors":[1.25,1.12,1.05,1.02,1.01]}', 212500000, '{"ultimateClaims":1062500000,"paidToDate":850000000,"ibnr":212500000}', NOW() - INTERVAL '2 weeks'),
(5, 6, 'Technical Provisions', 'Health', '{"method":"Bornhuetter-Ferguson","expectedLossRatio":0.72}', 864000000, '{"expectedClaims":864000000,"reportedClaims":720000000,"unreported":144000000}', NOW() - INTERVAL '2 weeks'),
(6, 6, 'Premium Adequacy', 'Auto', '{"claimsFrequency":0.08,"averageClaimSize":350000,"expenses":0.285,"profitMargin":0.05}', 40702, '{"purePremium":28000,"expenseLoading":11402,"profitLoading":2035,"recommendedPremium":41437}', NOW() - INTERVAL '1 week')
ON CONFLICT (id) DO NOTHING;

-- 13. INSURANCE APPLICATIONS
INSERT INTO insurance_applications (id, "userId", "applicationId", "productType", status, "currentStep", "totalSteps", "submittedAt", "createdAt", "updatedAt") VALUES
(1, 11, 'APP-2026-00001', 'Life', 'pending_documents', 'medical_exam', 5, NULL, NOW() - INTERVAL '1 week', NOW()),
(2, 8, 'APP-2026-00002', 'Microinsurance', 'approved', 'complete', 3, NOW() - INTERVAL '2 months', NOW() - INTERVAL '2 months', NOW()),
(3, 15, 'APP-2026-00003', 'Health', 'underwriting', 'risk_assessment', 4, NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days', NOW()),
(4, 13, 'APP-2026-00004', 'Agricultural', 'approved', 'complete', 4, NOW() - INTERVAL '3 months', NOW() - INTERVAL '3 months', NOW()),
(5, 3, 'APP-2026-00005', 'Auto', 'pending_payment', 'payment', 3, NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day', NOW()),
(6, 14, 'APP-2026-00006', 'Group_Life', 'underwriting', 'group_census', 6, NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days', NOW()),
(7, 9, 'APP-2026-00007', 'Property', 'approved', 'complete', 4, NOW() - INTERVAL '1 month', NOW() - INTERVAL '1 month', NOW()),
(8, 6, 'APP-2026-00008', 'Parametric', 'approved', 'complete', 3, NOW() - INTERVAL '2 months', NOW() - INTERVAL '2 months', NOW())
ON CONFLICT (id) DO NOTHING;

-- 14. ERP CONFIG (ERPNext)
INSERT INTO erp_config (id, "erpType", name, "baseUrl", "apiKey", "syncEnabled", "lastSyncAt", "createdAt", "updatedAt") VALUES
(1, 'custom', 'ERPNext Production', 'https://erp.insureportal.ng', 'erp_api_key_placeholder', true, NOW() - INTERVAL '1 hour', NOW() - INTERVAL '1 year', NOW())
ON CONFLICT (id) DO NOTHING;

-- 15. ERPNEXT TRANSACTIONS
INSERT INTO erpnext_transactions (id, "userId", "erpDocType", "erpDocId", "localEntityType", "localEntityId", "syncStatus", amount, currency, "lastSyncAt", "createdAt", "updatedAt") VALUES
(1, 1, 'Sales Invoice', 'SI-2026-00001', 'policy', '1', 'synced', 25000, 'NGN', NOW() - INTERVAL '5 months', NOW() - INTERVAL '5 months', NOW()),
(2, 1, 'Sales Invoice', 'SI-2026-00002', 'policy', '2', 'synced', 185000, 'NGN', NOW() - INTERVAL '4 months', NOW() - INTERVAL '4 months', NOW()),
(3, 2, 'Sales Invoice', 'SI-2026-00003', 'policy', '5', 'synced', 85000, 'NGN', NOW() - INTERVAL '6 months', NOW() - INTERVAL '6 months', NOW()),
(4, 3, 'Payment Entry', 'PE-2026-00001', 'claim', '2', 'synced', 175000, 'NGN', NOW() - INTERVAL '1 month', NOW() - INTERVAL '1 month', NOW()),
(5, 3, 'Payment Entry', 'PE-2026-00002', 'claim', '4', 'synced', 92000, 'NGN', NOW() - INTERVAL '3 months', NOW() - INTERVAL '3 months', NOW()),
(6, 7, 'Journal Entry', 'JE-2026-00001', 'treaty', '1', 'synced', 245000000, 'NGN', NOW() - INTERVAL '6 months', NOW() - INTERVAL '6 months', NOW()),
(7, 14, 'Sales Invoice', 'SI-2026-00004', 'policy', '12', 'pending', 15000000, 'NGN', NULL, NOW() - INTERVAL '6 months', NOW()),
(8, 6, 'Payment Entry', 'PE-2026-00005', 'claim', '12', 'synced', 100000, 'NGN', NOW() - INTERVAL '1 week', NOW() - INTERVAL '1 week', NOW())
ON CONFLICT (id) DO NOTHING;

-- 16. AGENT COMMISSIONS
INSERT INTO agent_commissions (id, "agentId", "policyId", "commissionAmount", "commissionRate", status, "paidAt", "createdAt") VALUES
(1, 1, 1, 3750, 15.00, 'paid', NOW() - INTERVAL '4 months', NOW() - INTERVAL '5 months'),
(2, 1, 2, 27750, 15.00, 'paid', NOW() - INTERVAL '3 months', NOW() - INTERVAL '4 months'),
(3, 2, 5, 8500, 10.00, 'paid', NOW() - INTERVAL '5 months', NOW() - INTERVAL '6 months'),
(4, 3, 3, 2700, 15.00, 'paid', NOW() - INTERVAL '6 months', NOW() - INTERVAL '7 months'),
(5, 5, 15, 5625, 7.50, 'pending', NULL, NOW() - INTERVAL '2 months'),
(6, 1, 4, 45000, 10.00, 'paid', NOW() - INTERVAL '2 months', NOW() - INTERVAL '3 months'),
(7, 4, 6, 2500, 10.00, 'paid', NOW() - INTERVAL '3 months', NOW() - INTERVAL '4 months'),
(8, 6, 7, 75000, 3.00, 'pending', NULL, NOW() - INTERVAL '2 months')
ON CONFLICT (id) DO NOTHING;

-- 17. DOCUMENTS
INSERT INTO documents (id, "userId", name, type, "fileUrl", status, "createdAt") VALUES
(1, 1, 'Motor Certificate POL-2026-MTR-00001', 'certificate', '/documents/certificates/POL-2026-MTR-00001.pdf', 'active', NOW() - INTERVAL '5 months'),
(2, 2, 'Health Insurance Card', 'id_card', '/documents/cards/POL-2026-HLT-00001.pdf', 'active', NOW() - INTERVAL '6 months'),
(3, 9, 'Commercial Property Schedule', 'schedule', '/documents/schedules/POL-2026-PRP-00001.pdf', 'active', NOW() - INTERVAL '6 months'),
(4, 1, 'Life Insurance Policy', 'policy', '/documents/policies/POL-2026-LIF-00001.pdf', 'active', NOW() - INTERVAL '12 months'),
(5, 14, 'Group Life Master Policy', 'policy', '/documents/policies/POL-2026-GRP-00001.pdf', 'active', NOW() - INTERVAL '6 months'),
(6, 5, 'NAICOM Q1 2026 Returns', 'regulatory', '/documents/naicom/QR_Q1_2026.pdf', 'submitted', NOW() - INTERVAL '2 months'),
(7, 7, 'Africa Re Treaty Document', 'treaty', '/documents/reinsurance/TREATY_2026_001.pdf', 'active', NOW() - INTERVAL '6 months'),
(8, 6, 'Actuarial Valuation 2025', 'report', '/documents/actuarial/VALUATION_2025.pdf', 'final', NOW() - INTERVAL '3 months')
ON CONFLICT (id) DO NOTHING;

-- 18. ANALYTICS EVENTS
INSERT INTO analytics_events (id, "userId", "eventType", "eventData", "createdAt") VALUES
(1, 1, 'policy_purchase', '{"policyId":1,"productType":"Motor","premium":25000,"channel":"web"}', NOW() - INTERVAL '5 months'),
(2, 2, 'policy_purchase', '{"policyId":5,"productType":"Health","premium":85000,"channel":"web"}', NOW() - INTERVAL '6 months'),
(3, 1, 'claim_filed', '{"claimId":1,"policyId":1,"amount":450000,"channel":"web"}', NOW() - INTERVAL '2 weeks'),
(4, 2, 'claim_filed', '{"claimId":2,"policyId":5,"amount":180000,"channel":"mobile"}', NOW() - INTERVAL '1 month'),
(5, 9, 'policy_purchase', '{"policyId":4,"productType":"Motor Fleet","premium":450000,"channel":"agent"}', NOW() - INTERVAL '3 months'),
(6, 9, 'policy_purchase', '{"policyId":8,"productType":"Property","premium":350000,"channel":"web"}', NOW() - INTERVAL '6 months'),
(7, 12, 'claim_filed', '{"claimId":7,"policyId":11,"amount":50000000,"channel":"agent"}', NOW() - INTERVAL '2 months'),
(8, 6, 'policy_purchase', '{"policyId":17,"productType":"Parametric","premium":8000,"channel":"ussd"}', NOW() - INTERVAL '1 month'),
(9, 8, 'policy_purchase', '{"policyId":13,"productType":"Microinsurance","premium":3500,"channel":"ussd"}', NOW() - INTERVAL '1 month'),
(10, 5, 'naicom_filing', '{"filingId":1,"filingType":"Quarterly Returns","period":"Q1 2026"}', NOW() - INTERVAL '2 months')
ON CONFLICT (id) DO NOTHING;

-- 19. FRAUD ALERTS
INSERT INTO fraud_alerts (id, "userId", "transactionId", "alertType", description, severity, "fraudScore", status, "createdAt", "resolvedAt") VALUES
(1, 1, NULL, 'Claims Velocity', '2 claims in 60 days on same policy. Staged accident pattern.', 'high', 78.5, 'investigating', NOW() - INTERVAL '4 months', NULL),
(2, 9, NULL, 'Short Seasoning', 'Fleet claim filed 3 weeks after policy inception.', 'medium', 45.2, 'cleared', NOW() - INTERVAL '1 month', NOW() - INTERVAL '2 weeks'),
(3, 7, NULL, 'Document Anomaly', 'Veterinary certificates show same signature across clinics.', 'high', 65.0, 'investigating', NOW() - INTERVAL '3 weeks', NULL),
(4, 12, NULL, 'Beneficiary Change', 'Beneficiary changed 30 days before death claim.', 'critical', 82.0, 'investigating', NOW() - INTERVAL '2 months', NULL),
(5, 3, NULL, 'Duplicate Invoice', 'Hospital invoice in 2 claims from different policyholders.', 'medium', 55.0, 'resolved', NOW() - INTERVAL '3 months', NOW() - INTERVAL '2 months')
ON CONFLICT (id) DO NOTHING;

-- 20. BANCASSURANCE
INSERT INTO bancassurance_partners (id, "partnerName", "partnerType", "bankCode", status, "commissionRate", "integrationStatus", "contractStart", "contractEnd", "createdAt") VALUES
(1, 'First Bank of Nigeria', 'Tier 1 Bank', 'FBN', 'active', 12.50, 'live', '2025-01-01', '2027-12-31', NOW() - INTERVAL '18 months'),
(2, 'Access Bank Plc', 'Tier 1 Bank', 'ACCESS', 'active', 11.00, 'live', '2025-06-01', '2027-05-31', NOW() - INTERVAL '12 months'),
(3, 'United Bank for Africa', 'Tier 1 Bank', 'UBA', 'active', 12.00, 'testing', '2026-01-01', '2028-12-31', NOW() - INTERVAL '6 months'),
(4, 'Zenith Bank Plc', 'Tier 1 Bank', 'ZENITH', 'pending', 13.00, 'integration', '2026-07-01', '2028-06-30', NOW() - INTERVAL '1 month'),
(5, 'GTBank (Guaranty Trust)', 'Tier 1 Bank', 'GTB', 'active', 11.50, 'live', '2025-03-01', '2027-02-28', NOW() - INTERVAL '15 months')
ON CONFLICT (id) DO NOTHING;

INSERT INTO bancassurance_offers (id, "partnerId", "productName", "productType", "minPremium", "maxPremium", "targetCustomerSegment", status, "createdAt") VALUES
(1, 1, 'FBN Motor Shield', 'Auto', 15000, 500000, 'FBN Account Holders', 'active', NOW() - INTERVAL '12 months'),
(2, 1, 'FBN Life Secure', 'Life', 10000, 300000, 'FBN Savings 500K+', 'active', NOW() - INTERVAL '12 months'),
(3, 2, 'Access Health Plus', 'Health', 20000, 200000, 'Access Diamond', 'active', NOW() - INTERVAL '10 months'),
(4, 5, 'GTB Property Guard', 'Property', 25000, 1000000, 'GTB Mortgage', 'active', NOW() - INTERVAL '15 months'),
(5, 2, 'Access Agri Shield', 'Agricultural', 3000, 150000, 'Access USSD Farmers', 'active', NOW() - INTERVAL '8 months')
ON CONFLICT (id) DO NOTHING;

-- 21. CUSTOMER FEEDBACK
INSERT INTO customer_feedback (id, "userId", "feedbackType", rating, comment, "createdAt") VALUES
(1, 1, 'claims_process', 4, 'Claim was processed quickly. Adjuster was professional.', NOW() - INTERVAL '3 months'),
(2, 4, 'customer_service', 5, 'WhatsApp bot helped me check my policy instantly.', NOW() - INTERVAL '2 months'),
(3, 2, 'policy_purchase', 3, 'Good coverage but premium calculator was confusing.', NOW() - INTERVAL '4 months'),
(4, 9, 'agent_service', 5, 'Agent Kayode was extremely helpful with fleet policy.', NOW() - INTERVAL '3 months'),
(5, 6, 'claims_process', 4, 'Parametric payout arrived within 72 hours as promised.', NOW() - INTERVAL '1 week'),
(6, 8, 'product', 5, 'Crop Shield is exactly what small farmers need.', NOW() - INTERVAL '1 month'),
(7, 3, 'claims_process', 2, 'Property claim taking too long. 2 weeks no update.', NOW() - INTERVAL '5 days'),
(8, 12, 'customer_service', 4, 'USSD channel works well without internet.', NOW() - INTERVAL '2 months')
ON CONFLICT (id) DO NOTHING;

-- 22. COMPLIANCE FILINGS
INSERT INTO compliance_filings (id, filing_type, reference_number, status, reporting_period, submitted_to, submitted_at, total_transactions, total_amount, flagged_count, prepared_by, created_at) VALUES
(1, 'Annual Return', 'AR/NAICOM/2025/IP001', 'approved', '2025', 'NAICOM', '2026-03-15', 45000, 2400000000, 12, 5, NOW() - INTERVAL '3 months'),
(2, 'AML/CFT Report', 'AML/CBN/Q1/2026', 'submitted', 'Q1 2026', 'CBN/NFIU', '2026-04-28', 12500, 850000000, 47, 5, NOW() - INTERVAL '2 months'),
(3, 'NDPR Compliance', 'DPC/NITDA/2026', 'approved', '2025', 'NITDA', '2026-02-20', 0, 0, 23, 5, NOW() - INTERVAL '4 months'),
(4, 'Industry Report', 'IIR/NIA/Q1/2026', 'submitted', 'Q1 2026', 'NIA', '2026-04-25', 20000, 1200000000, 0, 5, NOW() - INTERVAL '2 months'),
(5, 'Complaint Report', 'CCR/NAICOM/Q1/2026', 'approved', 'Q1 2026', 'NAICOM', '2026-04-20', 156, 0, 8, 5, NOW() - INTERVAL '2 months')
ON CONFLICT (id) DO NOTHING;

-- 23. AUDIT TRAIL
INSERT INTO audit_trail (id, "userId", action, entity, "entityId", details, "ipAddress", "createdAt") VALUES
(1, 1, 'LOGIN', 'user', '1', '{"method":"email_password","device":"Chrome/Windows"}', '197.210.45.32', NOW() - INTERVAL '1 day'),
(2, 2, 'POLICY_APPROVED', 'policy', '1', '{"policyNumber":"POL-2026-MTR-00001","premium":25000}', '197.210.45.33', NOW() - INTERVAL '5 months'),
(3, 3, 'CLAIM_REVIEWED', 'claim', '2', '{"claimNumber":"CLM-2026-00002","decision":"Approved","amount":175000}', '197.210.45.34', NOW() - INTERVAL '1 month'),
(4, 5, 'NAICOM_FILED', 'filing', '1', '{"filingType":"Quarterly Returns","period":"Q1 2026"}', '197.210.45.35', NOW() - INTERVAL '2 months'),
(5, 7, 'TREATY_CREATED', 'treaty', '1', '{"treatyName":"Property Surplus Treaty 2026","reinsurer":"Africa Re"}', '197.210.45.36', NOW() - INTERVAL '6 months'),
(6, 1, 'SETTINGS_CHANGED', 'system', 'config', '{"setting":"auto_renewal","oldValue":"false","newValue":"true"}', '197.210.45.32', NOW() - INTERVAL '2 weeks'),
(7, 3, 'CLAIM_REJECTED', 'claim', '5', '{"claimNumber":"CLM-2026-00005","reason":"No police report within 24 hours","fraudScore":78.5}', '197.210.45.34', NOW() - INTERVAL '4 months'),
(8, 2, 'UNDERWRITING_DECISION', 'application', '3', '{"applicationId":"APP-2026-00003","decision":"Referred"}', '197.210.45.33', NOW() - INTERVAL '3 days')
ON CONFLICT (id) DO NOTHING;

-- 24. DYNAMIC PRICING
INSERT INTO dynamic_pricing_history (id, "productType", "previousRate", "newRate", "changeReason", "effectiveDate", "approvedBy", "createdAt") VALUES
(1, 'Motor Third Party', 0.45, 0.50, 'Increased claims frequency in Lagos (+12% YoY)', '2026-01-01', 2, NOW() - INTERVAL '7 months'),
(2, 'Health Individual', 4.00, 4.25, 'Medical inflation rate 18% (NBS Health CPI)', '2026-01-01', 2, NOW() - INTERVAL '7 months'),
(3, 'Agricultural Multi-Peril', 1.80, 1.50, 'Improved weather station coverage reduces basis risk', '2026-01-01', 6, NOW() - INTERVAL '7 months'),
(4, 'Parametric Weather', 9.00, 8.00, 'Lower-than-expected trigger activation rate', '2026-01-01', 6, NOW() - INTERVAL '7 months')
ON CONFLICT (id) DO NOTHING;

-- 25. EMERGENCY INCIDENTS
INSERT INTO emergency_incidents (id, "userId", type, description, latitude, longitude, status, "createdAt") VALUES
(1, 1, 'Motor Accident', 'Collision on Lekki-Epe Expressway near Chevron', 6.4281, 3.5023, 'resolved', NOW() - INTERVAL '2 weeks'),
(2, 4, 'Medical Emergency', 'Severe allergic reaction requiring ambulance', 4.8156, 7.0498, 'resolved', NOW() - INTERVAL '1 month'),
(3, 9, 'Property Fire', 'Office fire on 3rd floor. Fire service dispatched.', 6.4311, 3.4197, 'active', NOW() - INTERVAL '3 days')
ON CONFLICT (id) DO NOTHING;

-- 26. MICROINSURANCE POLICIES
INSERT INTO microinsurance_policies (id, "userId", "policyNumber", "productName", premium, "coverageAmount", status, "activatedAt", "expiresAt", "createdAt") VALUES
(1, 8, 'MIC-2026-00001', 'Crop Shield - Maize', 3500, 150000, 'active', NOW() - INTERVAL '1 month', NOW() + INTERVAL '5 months', NOW() - INTERVAL '1 month'),
(2, 13, 'MIC-2026-00002', 'Market Women Shield', 2000, 500000, 'active', NOW() - INTERVAL '2 months', NOW() + INTERVAL '10 months', NOW() - INTERVAL '2 months'),
(3, 15, 'MIC-2026-00003', 'Okada Rider Cover', 1500, 300000, 'active', NOW() - INTERVAL '3 months', NOW() + INTERVAL '9 months', NOW() - INTERVAL '3 months'),
(4, 11, 'MIC-2026-00004', 'Artisan Shield', 2500, 400000, 'pending', NULL, NULL, NOW() - INTERVAL '1 week'),
(5, 7, 'MIC-2026-00005', 'Livestock Basic - Goats', 1800, 200000, 'active', NOW() - INTERVAL '2 months', NOW() + INTERVAL '10 months', NOW() - INTERVAL '2 months')
ON CONFLICT (id) DO NOTHING;

-- 27. SME POLICIES
INSERT INTO sme_policies (id, "userId", "policyNumber", "businessName", "businessType", premium, "coverageAmount", status, "startDate", "endDate", "createdAt") VALUES
(1, 9, 'SME-2026-00001', 'Obasanjo Logistics Ltd', 'Logistics & Transport', 450000, 50000000, 'active', '2026-01-01', '2026-12-31', NOW() - INTERVAL '6 months'),
(2, 14, 'SME-2026-00002', 'Williams & Partners Law', 'Professional Services', 120000, 25000000, 'active', '2026-03-01', '2027-02-28', NOW() - INTERVAL '3 months'),
(3, 12, 'SME-2026-00003', 'Adesanya Fashion House', 'Retail & Fashion', 85000, 15000000, 'active', '2026-02-15', '2027-02-14', NOW() - INTERVAL '4 months'),
(4, 10, 'SME-2026-00004', 'TechHub Enugu', 'Technology', 65000, 10000000, 'active', '2026-04-01', '2027-03-31', NOW() - INTERVAL '2 months')
ON CONFLICT (id) DO NOTHING;

-- 28. GIG COVERAGE POLICIES
INSERT INTO gig_coverage_policies (id, "userId", "planId", "planName", platform, premium, coverage, status, "activatedAt", "expiresAt", "createdAt") VALUES
(1, 1, 'GIG-RIDE-01', 'Ride Shield Basic', 'Bolt', 1500, 500000, 'active', NOW() - INTERVAL '3 months', NOW() + INTERVAL '9 months', NOW() - INTERVAL '3 months'),
(2, 4, 'GIG-RIDE-02', 'Ride Shield Premium', 'Uber', 3000, 1500000, 'active', NOW() - INTERVAL '2 months', NOW() + INTERVAL '10 months', NOW() - INTERVAL '2 months'),
(3, 15, 'GIG-DELIVER-01', 'Delivery Cover', 'Jumia Food', 2000, 800000, 'active', NOW() - INTERVAL '1 month', NOW() + INTERVAL '11 months', NOW() - INTERVAL '1 month'),
(4, 8, 'GIG-ARTISAN-01', 'Artisan Cover', 'Fixr', 1200, 300000, 'expired', NOW() - INTERVAL '14 months', NOW() - INTERVAL '2 months', NOW() - INTERVAL '14 months'),
(5, 7, 'GIG-FREELANCE-01', 'Freelance Professional', 'Upwork', 2500, 1000000, 'active', NOW() - INTERVAL '4 months', NOW() + INTERVAL '8 months', NOW() - INTERVAL '4 months')
ON CONFLICT (id) DO NOTHING;

-- 29. REINSURANCE CESSIONS
INSERT INTO reinsurance_cessions (id, "treatyId", "policyId", "cededPremium", "cededSumAssured", "cessionDate", status, "createdAt") VALUES
(1, 2, 1, 10000, 2000000, '2026-01-15', 'active', NOW() - INTERVAL '5 months'),
(2, 2, 2, 74000, 18000000, '2026-02-01', 'active', NOW() - INTERVAL '4 months'),
(3, 1, 8, 245000, 175000000, '2026-01-01', 'active', NOW() - INTERVAL '6 months'),
(4, 4, 10, 60000, 25000000, '2025-06-01', 'active', NOW() - INTERVAL '12 months'),
(5, 4, 11, 125000, 50000000, '2024-01-01', 'active', NOW() - INTERVAL '30 months'),
(6, 4, 12, 7500000, 1250000000, '2026-01-01', 'active', NOW() - INTERVAL '6 months'),
(7, 5, 5, 42500, 5000000, '2026-01-01', 'active', NOW() - INTERVAL '6 months'),
(8, 5, 7, 1250000, 250000000, '2026-04-01', 'active', NOW() - INTERVAL '2 months'),
(9, 6, 15, 37500, 2500000, '2026-04-01', 'active', NOW() - INTERVAL '2 months'),
(10, 6, 16, 60000, 7500000, '2026-03-01', 'active', NOW() - INTERVAL '3 months')
ON CONFLICT (id) DO NOTHING;

-- 30. FAMILY MEMBERS
INSERT INTO family_members (id, "userId", name, relationship, "dateOfBirth", "policyId", "createdAt") VALUES
(1, 2, 'Emeka Nnamdi', 'Spouse', '1988-03-10', 5, NOW() - INTERVAL '6 months'),
(2, 2, 'Ada Nnamdi', 'Child', '2015-09-22', 5, NOW() - INTERVAL '6 months'),
(3, 2, 'Chukwuemeka Nnamdi', 'Child', '2018-12-05', 5, NOW() - INTERVAL '6 months'),
(4, 2, 'Obiageli Nnamdi', 'Child', '2021-04-18', 5, NOW() - INTERVAL '6 months'),
(5, 1, 'Kemi Ogundimu', 'Spouse', '1987-08-20', 10, NOW() - INTERVAL '12 months'),
(6, 1, 'Tunde Ogundimu', 'Child', '2012-01-15', 10, NOW() - INTERVAL '12 months')
ON CONFLICT (id) DO NOTHING;

-- Reset all sequences
SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE((SELECT MAX(id) FROM users), 1));
SELECT setval(pg_get_serial_sequence('customers', 'id'), COALESCE((SELECT MAX(id) FROM customers), 1));
SELECT setval(pg_get_serial_sequence('agents', 'id'), COALESCE((SELECT MAX(id) FROM agents), 1));
SELECT setval(pg_get_serial_sequence('policies', 'id'), COALESCE((SELECT MAX(id) FROM policies), 1));
SELECT setval(pg_get_serial_sequence('claims', 'id'), COALESCE((SELECT MAX(id) FROM claims), 1));
SELECT setval(pg_get_serial_sequence('claim_evidence', 'id'), COALESCE((SELECT MAX(id) FROM claim_evidence), 1));
SELECT setval(pg_get_serial_sequence('premium_rate_tables', 'id'), COALESCE((SELECT MAX(id) FROM premium_rate_tables), 1));
SELECT setval(pg_get_serial_sequence('premium_risk_factors', 'id'), COALESCE((SELECT MAX(id) FROM premium_risk_factors), 1));
SELECT setval(pg_get_serial_sequence('naicom_filings', 'id'), COALESCE((SELECT MAX(id) FROM naicom_filings), 1));
SELECT setval(pg_get_serial_sequence('compliance_reports', 'id'), COALESCE((SELECT MAX(id) FROM compliance_reports), 1));
SELECT setval(pg_get_serial_sequence('reinsurance_treaties', 'id'), COALESCE((SELECT MAX(id) FROM reinsurance_treaties), 1));
SELECT setval(pg_get_serial_sequence('actuarial_calculations', 'id'), COALESCE((SELECT MAX(id) FROM actuarial_calculations), 1));
SELECT setval(pg_get_serial_sequence('insurance_applications', 'id'), COALESCE((SELECT MAX(id) FROM insurance_applications), 1));
SELECT setval(pg_get_serial_sequence('agent_commissions', 'id'), COALESCE((SELECT MAX(id) FROM agent_commissions), 1));
SELECT setval(pg_get_serial_sequence('documents', 'id'), COALESCE((SELECT MAX(id) FROM documents), 1));
SELECT setval(pg_get_serial_sequence('analytics_events', 'id'), COALESCE((SELECT MAX(id) FROM analytics_events), 1));
SELECT setval(pg_get_serial_sequence('fraud_alerts', 'id'), COALESCE((SELECT MAX(id) FROM fraud_alerts), 1));
SELECT setval(pg_get_serial_sequence('bancassurance_partners', 'id'), COALESCE((SELECT MAX(id) FROM bancassurance_partners), 1));
SELECT setval(pg_get_serial_sequence('bancassurance_offers', 'id'), COALESCE((SELECT MAX(id) FROM bancassurance_offers), 1));
SELECT setval(pg_get_serial_sequence('customer_feedback', 'id'), COALESCE((SELECT MAX(id) FROM customer_feedback), 1));
SELECT setval(pg_get_serial_sequence('compliance_filings', 'id'), COALESCE((SELECT MAX(id) FROM compliance_filings), 1));
SELECT setval(pg_get_serial_sequence('reinsurance_cessions', 'id'), COALESCE((SELECT MAX(id) FROM reinsurance_cessions), 1));
SELECT setval(pg_get_serial_sequence('microinsurance_policies', 'id'), COALESCE((SELECT MAX(id) FROM microinsurance_policies), 1));
SELECT setval(pg_get_serial_sequence('sme_policies', 'id'), COALESCE((SELECT MAX(id) FROM sme_policies), 1));
SELECT setval(pg_get_serial_sequence('gig_coverage_policies', 'id'), COALESCE((SELECT MAX(id) FROM gig_coverage_policies), 1));
