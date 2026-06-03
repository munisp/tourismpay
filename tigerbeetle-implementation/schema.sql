-- Insurance Platform Database Schema
-- PostgreSQL 14+

-- Create payments table
CREATE TABLE IF NOT EXISTS payments (
    id BIGSERIAL PRIMARY KEY,
    transaction_id VARCHAR(255) UNIQUE NOT NULL,
    policy_id VARCHAR(255) NOT NULL,
    customer_id VARCHAR(255) NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'NGN',
    payment_type VARCHAR(50) NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    original_payment_id BIGINT REFERENCES payments(id),
    refund_reason TEXT,
    processed_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_payments_policy_id ON payments(policy_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_transaction_id ON payments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);
CREATE INDEX IF NOT EXISTS idx_payments_payment_type ON payments(payment_type);

-- Create policies table
CREATE TABLE IF NOT EXISTS policies (
    id VARCHAR(255) PRIMARY KEY,
    policy_number VARCHAR(100) UNIQUE NOT NULL,
    customer_id VARCHAR(255) NOT NULL,
    policy_type VARCHAR(50) NOT NULL,
    sum_assured DECIMAL(15, 2) NOT NULL,
    premium DECIMAL(15, 2) NOT NULL,
    premium_frequency VARCHAR(50) NOT NULL,
    duration_months INTEGER NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(50) NOT NULL,
    agent_id VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for policies
CREATE INDEX IF NOT EXISTS idx_policies_customer_id ON policies(customer_id);
CREATE INDEX IF NOT EXISTS idx_policies_policy_number ON policies(policy_number);
CREATE INDEX IF NOT EXISTS idx_policies_status ON policies(status);
CREATE INDEX IF NOT EXISTS idx_policies_agent_id ON policies(agent_id);
CREATE INDEX IF NOT EXISTS idx_policies_created_at ON policies(created_at);

-- Create customers table
CREATE TABLE IF NOT EXISTS customers (
    id VARCHAR(255) PRIMARY KEY,
    nin VARCHAR(11) UNIQUE,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone_number VARCHAR(20) NOT NULL,
    date_of_birth DATE,
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100) DEFAULT 'Nigeria',
    nin_verified BOOLEAN DEFAULT FALSE,
    nin_verified_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for customers
CREATE INDEX IF NOT EXISTS idx_customers_nin ON customers(nin);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_phone_number ON customers(phone_number);

-- Create verification_records table
CREATE TABLE IF NOT EXISTS verification_records (
    id BIGSERIAL PRIMARY KEY,
    customer_id VARCHAR(255) NOT NULL,
    verification_type VARCHAR(50) NOT NULL,
    nin VARCHAR(11),
    cac_number VARCHAR(50),
    verification_status VARCHAR(50) NOT NULL,
    verification_response JSONB,
    verified_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for verification_records
CREATE INDEX IF NOT EXISTS idx_verification_records_customer_id ON verification_records(customer_id);
CREATE INDEX IF NOT EXISTS idx_verification_records_nin ON verification_records(nin);
CREATE INDEX IF NOT EXISTS idx_verification_records_cac_number ON verification_records(cac_number);

-- Create agents table
CREATE TABLE IF NOT EXISTS agents (
    id VARCHAR(255) PRIMARY KEY,
    agent_code VARCHAR(50) UNIQUE NOT NULL,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    phone_number VARCHAR(20) NOT NULL,
    commission_rate DECIMAL(5, 2) NOT NULL DEFAULT 10.00,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    territory VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for agents
CREATE INDEX IF NOT EXISTS idx_agents_agent_code ON agents(agent_code);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);

-- Create claims table
CREATE TABLE IF NOT EXISTS claims (
    id VARCHAR(255) PRIMARY KEY,
    claim_number VARCHAR(100) UNIQUE NOT NULL,
    policy_id VARCHAR(255) NOT NULL REFERENCES policies(id),
    customer_id VARCHAR(255) NOT NULL,
    claim_amount DECIMAL(15, 2) NOT NULL,
    claim_type VARCHAR(50) NOT NULL,
    claim_date DATE NOT NULL,
    incident_date DATE NOT NULL,
    incident_description TEXT NOT NULL,
    status VARCHAR(50) NOT NULL,
    fraud_score DECIMAL(5, 2),
    approved_amount DECIMAL(15, 2),
    rejection_reason TEXT,
    processed_by VARCHAR(255),
    processed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for claims
CREATE INDEX IF NOT EXISTS idx_claims_policy_id ON claims(policy_id);
CREATE INDEX IF NOT EXISTS idx_claims_customer_id ON claims(customer_id);
CREATE INDEX IF NOT EXISTS idx_claims_claim_number ON claims(claim_number);
CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);
CREATE INDEX IF NOT EXISTS idx_claims_created_at ON claims(created_at);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers to automatically update updated_at
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_policies_updated_at BEFORE UPDATE ON policies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON agents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_claims_updated_at BEFORE UPDATE ON claims
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert sample company accounts data (for reference)
-- Note: Actual TigerBeetle accounts are created in the ledger, not in PostgreSQL
COMMENT ON TABLE payments IS 'Stores payment transaction records. Corresponding TigerBeetle transfers are identified by transaction_id.';
COMMENT ON TABLE policies IS 'Stores insurance policy information.';
COMMENT ON TABLE customers IS 'Stores customer information including NIN verification status.';
COMMENT ON TABLE verification_records IS 'Stores NIN and CAC verification records.';
COMMENT ON TABLE agents IS 'Stores insurance agent information.';
COMMENT ON TABLE claims IS 'Stores insurance claim information.';
