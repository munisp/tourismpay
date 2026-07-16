#!/bin/bash
set -e

# Database Initialization Script for Insurance Platform
# This script initializes all PostgreSQL databases for the platform

echo "=== Insurance Platform Database Initialization ==="
echo ""

# Check if DATABASE_URL is provided
if [ -z "$DATABASE_URL" ]; then
    echo "ERROR: DATABASE_URL environment variable is required"
    echo "Example: postgresql://user:password@host:5432/database"
    exit 1
fi

# Parse DATABASE_URL
DB_USER=$(echo $DATABASE_URL | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
DB_PASS=$(echo $DATABASE_URL | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')
DB_HOST=$(echo $DATABASE_URL | sed -n 's/.*@\([^:]*\):.*/\1/p')
DB_PORT=$(echo $DATABASE_URL | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
DB_NAME=$(echo $DATABASE_URL | sed -n 's/.*\/\([^?]*\).*/\1/p')

echo "Database Configuration:"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  User: $DB_USER"
echo "  Database: $DB_NAME"
echo ""

# Test connection
echo "Testing database connection..."
PGPASSWORD=$DB_PASS psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c "SELECT version();" > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✓ Database connection successful"
else
    echo "✗ Database connection failed"
    exit 1
fi
echo ""

# Create databases if they don't exist
echo "Creating databases..."

# Customer Portal Database
PGPASSWORD=$DB_PASS psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c "CREATE DATABASE customer_portal;" 2>/dev/null || echo "  - customer_portal already exists"

# Telco Service Database
PGPASSWORD=$DB_PASS psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c "CREATE DATABASE telco_service;" 2>/dev/null || echo "  - telco_service already exists"

# Fraud Database
PGPASSWORD=$DB_PASS psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c "CREATE DATABASE fraud_database;" 2>/dev/null || echo "  - fraud_database already exists"

echo "✓ All databases created"
echo ""

# Initialize Customer Portal Schema
echo "Initializing customer portal schema..."
cd /home/ubuntu/customer-portal-full
export DATABASE_URL="postgresql://$DB_USER:$DB_PASS@$DB_HOST:$DB_PORT/customer_portal"
pnpm db:push
echo "✓ Customer portal schema initialized"
echo ""

# Initialize Telco Service Schema
echo "Initializing telco service schema..."
cd /home/ubuntu/telco-data-integration-service
export DATABASE_URL="postgresql://$DB_USER:$DB_PASS@$DB_HOST:$DB_PORT/telco_service"
python3 -c "
from app.models.telco_data import Base
from app.services.database import engine
Base.metadata.create_all(bind=engine)
print('✓ Telco service schema initialized')
"
echo ""

# Initialize Fraud Database Schema
echo "Initializing fraud database schema..."
cd /home/ubuntu/cross-company-fraud-database
export DATABASE_URL="postgresql://$DB_USER:$DB_PASS@$DB_HOST:$DB_PORT/fraud_database"
python3 -c "
from app.models.fraud_record import Base
from app.services.database import engine
Base.metadata.create_all(bind=engine)
print('✓ Fraud database schema initialized')
"
echo ""

# Seed customer portal with test data
echo "Seeding customer portal with test data..."
cd /home/ubuntu/customer-portal-full
export DATABASE_URL="postgresql://$DB_USER:$DB_PASS@$DB_HOST:$DB_PORT/customer_portal"
node server/seed.mjs
echo "✓ Customer portal seeded"
echo ""

echo "=== Database Initialization Complete ==="
echo ""
echo "Next steps:"
echo "1. Configure API credentials in .env files"
echo "2. Start the services with docker-compose up"
echo "3. Access customer portal at http://localhost:3000"
