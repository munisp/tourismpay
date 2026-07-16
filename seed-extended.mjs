/**
 * seed-extended.mjs — TourismPay Extended Seed Script
 *
 * Seeds the 80+ additional tables not covered by the base seed.mjs.
 * Run after seed.mjs.
 *
 * Usage:
 *   POSTGRES_URL=postgresql://... node seed-extended.mjs
 *   node seed-extended.mjs
 *
 * Idempotent — uses ON CONFLICT DO NOTHING.
 */
import pg from "pg";
import { randomUUID } from "crypto";

const { Pool } = pg;

const POSTGRES_URL =
  process.env.POSTGRES_URL ??
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/tourismpay?sslmode=disable";

const pool = new Pool({ connectionString: POSTGRES_URL, ssl: false });

const now = () => new Date();
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000);
const daysFromNow = (n) => new Date(Date.now() + n * 86_400_000);

async function seedExtended() {
  const client = await pool.connect();
  let seeded = 0;

  async function safeInsert(table, sql, params = []) {
    try {
      await client.query(sql, params);
      seeded++;
    } catch (e) {
      if (!e.message.includes("does not exist") && !e.message.includes("duplicate")) {
        console.warn(`  [SKIP] ${table}: ${e.message.slice(0, 80)}`);
      }
    }
  }

  try {
    await client.query("BEGIN");

    // ── Commission Tiers ──────────────────────────────────────────────────────
    await safeInsert("commissionTiers", `
      INSERT INTO commission_tiers (id, name, min_months, motor_rate, health_rate, life_rate)
      VALUES
        ($1, 'New Agent', 0, 0.08, 0.12, 0.10),
        ($2, 'Standard', 6, 0.10, 0.15, 0.12),
        ($3, 'Senior', 24, 0.12, 0.18, 0.15),
        ($4, 'Elite', 48, 0.15, 0.22, 0.18)
      ON CONFLICT DO NOTHING
    `, [randomUUID(), randomUUID(), randomUUID(), randomUUID()]);

    // ── Commission Rules ──────────────────────────────────────────────────────
    await safeInsert("commissionRules", `
      INSERT INTO commission_rules (id, name, type, rate, min_amount, max_amount, is_active, created_at)
      VALUES
        ($1, 'Cash In Commission', 'cash_in', 0.005, 100, 500000, true, $5),
        ($2, 'Cash Out Commission', 'cash_out', 0.0075, 100, 200000, true, $5),
        ($3, 'Transfer Commission', 'transfer', 0.003, 500, 1000000, true, $5),
        ($4, 'Bill Pay Commission', 'bill_payment', 0.01, 0, 50000, true, $5)
      ON CONFLICT DO NOTHING
    `, [randomUUID(), randomUUID(), randomUUID(), randomUUID(), now()]);

    // ── Fee Rules ─────────────────────────────────────────────────────────────
    await safeInsert("feeRules", `
      INSERT INTO fee_rules (id, name, transaction_type, fixed_fee, percentage_fee, min_fee, max_fee, currency, is_active)
      VALUES
        ($1, 'Cash In Fee', 'cash_in', 50, 0.001, 50, 500, 'NGN', true),
        ($2, 'Cash Out Fee', 'cash_out', 100, 0.005, 100, 2000, 'NGN', true),
        ($3, 'Transfer Fee', 'transfer', 25, 0.003, 50, 1500, 'NGN', true),
        ($4, 'Airtime Fee', 'airtime', 0, 0, 0, 0, 'NGN', true)
      ON CONFLICT DO NOTHING
    `, [randomUUID(), randomUUID(), randomUUID(), randomUUID()]);

    // ── KYC Sessions ──────────────────────────────────────────────────────────
    await safeInsert("kycSessions", `
      INSERT INTO kyc_sessions (id, agent_id, status, liveness_passed, document_type, document_number, created_at, completed_at)
      VALUES
        ($1, 1, 'completed', true, 'bvn', '22345678901', $3, $4),
        ($2, 2, 'completed', true, 'nin', '12345678901', $3, $4)
      ON CONFLICT DO NOTHING
    `, [randomUUID(), randomUUID(), daysAgo(30), daysAgo(29)]);

    // ── Fraud Rules ───────────────────────────────────────────────────────────
    await safeInsert("fraudRules", `
      INSERT INTO fraud_rules (id, name, description, condition_type, threshold, action, severity, is_active, created_at)
      VALUES
        ($1, 'High Value Transaction', 'Flag transactions above threshold', 'amount_exceeds', 500000, 'flag', 'high', true, $7),
        ($2, 'Velocity Check', 'More than 10 transactions in 5 minutes', 'velocity', 10, 'block', 'critical', true, $7),
        ($3, 'Unusual Hours', 'Transactions between 1am-5am', 'time_range', 0, 'flag', 'medium', true, $7),
        ($4, 'New Device', 'Transaction from unregistered device', 'new_device', 0, 'flag', 'high', true, $7),
        ($5, 'Geo Anomaly', 'Transaction far from usual location', 'geo_distance', 50, 'flag', 'high', true, $7),
        ($6, 'Duplicate Amount', 'Same amount within 2 minutes', 'duplicate_amount', 120, 'flag', 'medium', true, $7)
      ON CONFLICT DO NOTHING
    `, [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID(), now()]);

    // ── Ecommerce Categories ──────────────────────────────────────────────────
    await safeInsert("ecommerceCategories", `
      INSERT INTO ecommerce_categories (id, name, slug, description, parent_id, is_active, sort_order, created_at)
      VALUES
        ($1, 'Safari & Tours', 'safari-tours', 'Guided safari and tour packages', NULL, true, 1, $8),
        ($2, 'Accommodation', 'accommodation', 'Hotels, lodges, and vacation rentals', NULL, true, 2, $8),
        ($3, 'Transportation', 'transportation', 'Flights, car rentals, and transfers', NULL, true, 3, $8),
        ($4, 'Activities', 'activities', 'Adventure sports, cultural experiences', NULL, true, 4, $8),
        ($5, 'Travel Insurance', 'travel-insurance', 'Comprehensive travel coverage', NULL, true, 5, $8),
        ($6, 'Dining', 'dining', 'Restaurant reservations and food tours', NULL, true, 6, $8),
        ($7, 'Souvenirs', 'souvenirs', 'Local crafts and memorabilia', NULL, true, 7, $8)
      ON CONFLICT DO NOTHING
    `, [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID(), now()]);

    // ── Ecommerce Products ────────────────────────────────────────────────────
    const catId1 = randomUUID();
    const catId2 = randomUUID();
    await safeInsert("ecommerceProducts", `
      INSERT INTO ecommerce_products (id, name, slug, description, price, currency, category_id, sku, stock_quantity, is_active, created_at)
      VALUES
        ($1, 'Masai Mara 3-Day Safari', 'masai-mara-3day', 'All-inclusive 3-day guided safari in Masai Mara', 250000, 'KES', NULL, 'SAF-MM-3D', 50, true, $7),
        ($2, 'Zanzibar Beach Resort 5N', 'zanzibar-beach-5n', '5-night stay at premium beach resort in Zanzibar', 800000, 'TZS', NULL, 'ACC-ZB-5N', 20, true, $7),
        ($3, 'Victoria Falls Bungee Jump', 'vic-falls-bungee', 'Adrenaline bungee jumping at Victoria Falls', 150000, 'ZMW', NULL, 'ACT-VF-BJ', 100, true, $7),
        ($4, 'Cape Town City Tour', 'cape-town-tour', 'Full-day guided tour of Cape Town highlights', 95000, 'ZAR', NULL, 'TUR-CT-FD', 80, true, $7),
        ($5, 'Serengeti Migration Package', 'serengeti-migration', '7-day great migration viewing package', 1500000, 'TZS', NULL, 'SAF-SG-7D', 15, true, $7),
        ($6, 'Lagos Food Tour', 'lagos-food-tour', 'Evening street food tour through Lagos Island', 35000, 'NGN', NULL, 'DIN-LG-FT', 200, true, $7)
      ON CONFLICT DO NOTHING
    `, [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID(), now()]);

    // ── API Keys ──────────────────────────────────────────────────────────────
    await safeInsert("apiKeys", `
      INSERT INTO api_keys (id, name, key_hash, prefix, scopes, rate_limit, is_active, created_by, created_at, expires_at)
      VALUES
        ($1, 'Mobile App Key', 'sha256_placeholder_1', 'tp_live_', '{"read","write"}', 1000, true, 'system', $4, $5),
        ($2, 'POS Terminal Key', 'sha256_placeholder_2', 'tp_pos_', '{"transactions","read"}', 500, true, 'system', $4, $5),
        ($3, 'Partner API Key', 'sha256_placeholder_3', 'tp_partner_', '{"read"}', 100, true, 'system', $4, $5)
      ON CONFLICT DO NOTHING
    `, [randomUUID(), randomUUID(), randomUUID(), now(), daysFromNow(365)]);

    // ── SLA Definitions ───────────────────────────────────────────────────────
    await safeInsert("sla_definitions", `
      INSERT INTO sla_definitions (id, name, description, target_ms, warning_ms, critical_ms, service_name, is_active)
      VALUES
        ($1, 'Transaction Processing', 'End-to-end transaction completion', 3000, 2000, 5000, 'transaction-service', true),
        ($2, 'KYC Verification', 'Identity verification turnaround', 300000, 180000, 600000, 'kyc-service', true),
        ($3, 'Float Top-Up', 'Agent float top-up processing', 60000, 30000, 120000, 'float-service', true),
        ($4, 'Notification Delivery', 'SMS/push notification delivery', 5000, 3000, 10000, 'notification-service', true)
      ON CONFLICT DO NOTHING
    `, [randomUUID(), randomUUID(), randomUUID(), randomUUID()]);

    // ── GL Accounts (Chart of Accounts) ───────────────────────────────────────
    await safeInsert("gl_accounts", `
      INSERT INTO gl_accounts (id, code, name, type, currency, is_active, parent_id, created_at)
      VALUES
        ($1, '1000', 'Assets', 'asset', 'NGN', true, NULL, $9),
        ($2, '1100', 'Cash and Bank', 'asset', 'NGN', true, $1, $9),
        ($3, '1200', 'Agent Float Pool', 'asset', 'NGN', true, $1, $9),
        ($4, '2000', 'Liabilities', 'liability', 'NGN', true, NULL, $9),
        ($5, '2100', 'Customer Deposits', 'liability', 'NGN', true, $4, $9),
        ($6, '3000', 'Revenue', 'revenue', 'NGN', true, NULL, $9),
        ($7, '3100', 'Transaction Fees', 'revenue', 'NGN', true, $6, $9),
        ($8, '3200', 'Commission Revenue', 'revenue', 'NGN', true, $6, $9)
      ON CONFLICT DO NOTHING
    `, [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID(), now()]);

    // ── Notification Channels ─────────────────────────────────────────────────
    await safeInsert("notification_channels", `
      INSERT INTO notification_channels (id, name, type, config, is_active, created_at)
      VALUES
        ($1, 'Termii SMS', 'sms', '{"provider":"termii","sender_id":"TourismPay"}', true, $5),
        ($2, 'Firebase Push', 'push', '{"provider":"firebase","project_id":"tourismpay-prod"}', true, $5),
        ($3, 'SendGrid Email', 'email', '{"provider":"sendgrid","from":"noreply@tourismpay.com"}', true, $5),
        ($4, 'WhatsApp Business', 'whatsapp', '{"provider":"whatsapp_business","phone":"+234800000000"}', true, $5)
      ON CONFLICT DO NOTHING
    `, [randomUUID(), randomUUID(), randomUUID(), randomUUID(), now()]);

    // ── Webhook Endpoints ─────────────────────────────────────────────────────
    await safeInsert("webhookEndpoints", `
      INSERT INTO webhook_endpoints (id, url, events, secret_hash, is_active, created_at, merchant_id)
      VALUES
        ($1, 'https://partner1.example.com/webhooks/tourismpay', '{"transaction.completed","kyc.approved"}', 'whsec_placeholder_1', true, $4, 'merchant_001'),
        ($2, 'https://partner2.example.com/webhooks', '{"transaction.completed","payout.sent"}', 'whsec_placeholder_2', true, $4, 'merchant_002'),
        ($3, 'https://insurance.example.com/hooks', '{"claim.filed","policy.renewed"}', 'whsec_placeholder_3', true, $4, 'merchant_003')
      ON CONFLICT DO NOTHING
    `, [randomUUID(), randomUUID(), randomUUID(), now()]);

    // ── Receipt Templates ─────────────────────────────────────────────────────
    await safeInsert("receiptTemplates", `
      INSERT INTO receipt_templates (id, name, type, template_html, is_default, created_at)
      VALUES
        ($1, 'Standard POS Receipt', 'pos', '<div class="receipt"><h3>TourismPay</h3><p>Transaction: {{txId}}</p><p>Amount: {{amount}}</p><p>Date: {{date}}</p></div>', true, $4),
        ($2, 'Mobile Receipt', 'mobile', '<div class="receipt-mobile"><h4>TourismPay</h4><p>{{type}} - {{amount}}</p><p>Ref: {{txId}}</p></div>', false, $4),
        ($3, 'Email Receipt', 'email', '<html><body><h2>TourismPay Transaction Receipt</h2><table><tr><td>Amount</td><td>{{amount}}</td></tr></table></body></html>', false, $4)
      ON CONFLICT DO NOTHING
    `, [randomUUID(), randomUUID(), randomUUID(), now()]);

    // ── Training Courses ──────────────────────────────────────────────────────
    await safeInsert("trainingCourses", `
      INSERT INTO training_courses (id, title, description, category, duration_minutes, is_mandatory, passing_score, is_active, created_at)
      VALUES
        ($1, 'Agent Onboarding Essentials', 'Core training for new TourismPay agents', 'onboarding', 60, true, 80, true, $6),
        ($2, 'AML/CFT Compliance', 'Anti-money laundering and counter-terrorism financing', 'compliance', 90, true, 85, true, $6),
        ($3, 'KYC Procedures', 'Customer identity verification best practices', 'compliance', 45, true, 80, true, $6),
        ($4, 'POS Terminal Operations', 'Using the 54Link POS terminal effectively', 'operations', 30, false, 70, true, $6),
        ($5, 'Tourism Product Knowledge', 'Understanding TourismPay products and services', 'product', 40, false, 75, true, $6)
      ON CONFLICT DO NOTHING
    `, [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID(), now()]);

    // ── Platform Settings ─────────────────────────────────────────────────────
    await safeInsert("platformSettings", `
      INSERT INTO platform_settings (id, key, value, category, description, updated_at)
      VALUES
        ($1, 'maintenance_mode', 'false', 'system', 'Enable/disable maintenance mode', $8),
        ($2, 'max_daily_transaction_limit', '5000000', 'limits', 'Maximum daily transaction amount per agent (kobo)', $8),
        ($3, 'kyc_expiry_days', '365', 'compliance', 'Days before KYC documents expire', $8),
        ($4, 'min_float_balance', '10000', 'float', 'Minimum float balance warning threshold (kobo)', $8),
        ($5, 'session_timeout_minutes', '30', 'security', 'Agent session timeout in minutes', $8),
        ($6, 'otp_expiry_seconds', '300', 'security', 'OTP expiration time in seconds', $8),
        ($7, 'max_login_attempts', '5', 'security', 'Maximum login attempts before lockout', $8)
      ON CONFLICT DO NOTHING
    `, [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID(), now()]);

    // ── Velocity Limits ───────────────────────────────────────────────────────
    await safeInsert("velocityLimits", `
      INSERT INTO velocity_limits (id, name, transaction_type, max_count, max_amount, time_window_minutes, tier, is_active)
      VALUES
        ($1, 'Cash In Hourly', 'cash_in', 20, 1000000, 60, 'standard', true),
        ($2, 'Cash Out Hourly', 'cash_out', 10, 500000, 60, 'standard', true),
        ($3, 'Transfer Daily', 'transfer', 50, 5000000, 1440, 'standard', true),
        ($4, 'Cash In Hourly (Gold)', 'cash_in', 50, 3000000, 60, 'gold', true),
        ($5, 'Cash Out Hourly (Gold)', 'cash_out', 25, 1500000, 60, 'gold', true)
      ON CONFLICT DO NOTHING
    `, [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()]);

    // ── Deployments (devops-platform) ──────────────────────────────────────────
    await safeInsert("deployments", `
      INSERT INTO deployments (service_name, version, environment, status, deployed_at)
      VALUES
        ('customer-portal', '2.5.1', 'production', 'healthy', $1),
        ('claims-engine', '1.8.0', 'staging', 'canary_validating', $2),
        ('agent-mobile-app', '3.1.0', 'production', 'healthy', $3),
        ('payment-gateway', '4.0.2', 'production', 'healthy', $4),
        ('notification-service', '1.2.0', 'production', 'healthy', $5)
      ON CONFLICT DO NOTHING
    `, [daysAgo(2), daysAgo(0), daysAgo(5), daysAgo(1), daysAgo(3)]);

    // ── Float Accounts (agent wallets) ──────────────────────────────────────────
    await safeInsert("floatAccounts", `
      INSERT INTO float_accounts (agent_id, balance, currency, last_topup_at, created_at)
      VALUES
        (1, 125000.00, 'ZAR', $1, $2),
        (2, 85000.00, 'ZAR', $3, $4),
        (3, 200000.00, 'ZAR', $5, $6)
      ON CONFLICT DO NOTHING
    `, [daysAgo(1), daysAgo(30), daysAgo(2), daysAgo(25), daysAgo(0), daysAgo(20)]);

    // ── Commissions ─────────────────────────────────────────────────────────────
    await safeInsert("commissions", `
      INSERT INTO commissions (agent_id, amount, type, status, created_at)
      VALUES
        (1, 15000.00, 'new_business', 'credited', $1),
        (1, 8000.00, 'renewal', 'credited', $2),
        (1, 22000.00, 'new_business', 'pending', $3),
        (2, 12000.00, 'new_business', 'credited', $4),
        (2, 5000.00, 'renewal', 'pending', $5)
      ON CONFLICT DO NOTHING
    `, [daysAgo(5), daysAgo(3), daysAgo(0), daysAgo(2), daysAgo(1)]);

    // ── Offline Sync Queue (mobile offline-first) ───────────────────────────────
    await safeInsert("offlineSyncQueue", `
      INSERT INTO offline_sync_queue (device_id, payload, status, created_at)
      VALUES
        ('DEV-001', '{"type":"transaction","amount":5000}', 'pending', $1),
        ('DEV-002', '{"type":"checkin","lat":-26.2}', 'synced', $2),
        ('DEV-001', '{"type":"claim","policy_id":1}', 'pending', $3)
      ON CONFLICT DO NOTHING
    `, [daysAgo(0), daysAgo(1), daysAgo(0)]);

    // ── Notification Log ────────────────────────────────────────────────────────
    await safeInsert("notificationLog", `
      INSERT INTO notification_log (title, body, channel, status, created_at)
      VALUES
        ('Payment Received', 'Transaction of ZAR 5,000 completed', 'push', 'delivered', $1),
        ('KYC Approved', 'Your identity verification is complete', 'email', 'delivered', $2),
        ('Float Low', 'Your float balance is below ZAR 10,000', 'sms', 'delivered', $3),
        ('Commission Credited', 'ZAR 15,000 commission added to wallet', 'push', 'delivered', $4)
      ON CONFLICT DO NOTHING
    `, [daysAgo(0), daysAgo(1), daysAgo(2), daysAgo(0)]);

    await client.query("COMMIT");
    console.log(`\nExtended seed complete: ${seeded} table groups seeded.`);
    console.log("Run after seed.mjs to have full realistic data.");

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Seed error:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seedExtended();
