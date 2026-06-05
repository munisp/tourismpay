#!/bin/bash
set -e

# API Credential Configuration Script
# This script helps configure API credentials for all services

echo "=== Insurance Platform API Credential Configuration ==="
echo ""

CONFIG_DIR="/home/ubuntu/deployment/config"
ENV_FILE="$CONFIG_DIR/.env"

# Check if .env.template exists
if [ ! -f "$CONFIG_DIR/.env.template" ]; then
    echo "ERROR: .env.template not found in $CONFIG_DIR"
    exit 1
fi

# Create .env from template if it doesn't exist
if [ ! -f "$ENV_FILE" ]; then
    echo "Creating .env from template..."
    cp "$CONFIG_DIR/.env.template" "$ENV_FILE"
    echo "✓ .env file created"
    echo ""
fi

echo "This script will guide you through configuring API credentials."
echo "Press Enter to skip any optional field."
echo ""

# Function to prompt for input
prompt_input() {
    local var_name=$1
    local prompt_text=$2
    local is_secret=$3
    local current_value=$(grep "^$var_name=" "$ENV_FILE" | cut -d'=' -f2-)
    
    if [ -n "$current_value" ] && [ "$current_value" != "your_${var_name,,}_here" ]; then
        echo "Current value for $var_name: [already set]"
        read -p "Keep current value? (y/n): " keep
        if [ "$keep" = "y" ] || [ "$keep" = "Y" ]; then
            return
        fi
    fi
    
    if [ "$is_secret" = "true" ]; then
        read -sp "$prompt_text: " value
        echo ""
    else
        read -p "$prompt_text: " value
    fi
    
    if [ -n "$value" ]; then
        # Escape special characters for sed
        value=$(echo "$value" | sed 's/[\/&]/\\&/g')
        sed -i "s/^$var_name=.*/$var_name=$value/" "$ENV_FILE"
        echo "✓ $var_name configured"
    fi
}

# ============================================
# DATABASE CONFIGURATION
# ============================================

echo "--- Database Configuration ---"
prompt_input "DATABASE_URL" "PostgreSQL connection string (postgresql://user:pass@host:5432/db)" "false"
echo ""

# ============================================
# TELCO INTEGRATION
# ============================================

echo "--- Telco Integration (BR-INT-002) ---"
echo "Configure Nigerian telco provider API credentials"
echo ""

read -p "Configure MTN API? (y/n): " configure_mtn
if [ "$configure_mtn" = "y" ] || [ "$configure_mtn" = "Y" ]; then
    prompt_input "MTN_API_URL" "MTN API URL" "false"
    prompt_input "MTN_API_KEY" "MTN API Key" "true"
    prompt_input "MTN_API_SECRET" "MTN API Secret" "true"
fi
echo ""

read -p "Configure Airtel API? (y/n): " configure_airtel
if [ "$configure_airtel" = "y" ] || [ "$configure_airtel" = "Y" ]; then
    prompt_input "AIRTEL_API_URL" "Airtel API URL" "false"
    prompt_input "AIRTEL_API_KEY" "Airtel API Key" "true"
    prompt_input "AIRTEL_API_SECRET" "Airtel API Secret" "true"
fi
echo ""

read -p "Configure Glo API? (y/n): " configure_glo
if [ "$configure_glo" = "y" ] || [ "$configure_glo" = "Y" ]; then
    prompt_input "GLO_API_URL" "Glo API URL" "false"
    prompt_input "GLO_API_KEY" "Glo API Key" "true"
    prompt_input "GLO_API_SECRET" "Glo API Secret" "true"
fi
echo ""

read -p "Configure 9mobile API? (y/n): " configure_9mobile
if [ "$configure_9mobile" = "y" ] || [ "$configure_9mobile" = "Y" ]; then
    prompt_input "NINEMOBILE_API_URL" "9mobile API URL" "false"
    prompt_input "NINEMOBILE_API_KEY" "9mobile API Key" "true"
    prompt_input "NINEMOBILE_API_SECRET" "9mobile API Secret" "true"
fi
echo ""

# ============================================
# FRAUD DATABASE
# ============================================

echo "--- Cross-Company Fraud Database (BR-FRAUD-004) ---"
echo "Configure company API keys and NAICOM admin access"
echo ""

prompt_input "FRAUD_DB_COMPANY_KEYS" "Company API keys (format: COMPANY_A:key1,COMPANY_B:key2)" "true"
prompt_input "NAICOM_ADMIN_API_KEY" "NAICOM admin API key" "true"
echo ""

# ============================================
# MOBILE PUSH NOTIFICATIONS
# ============================================

echo "--- Mobile Push Notifications (BR-CUST-004) ---"
echo ""

read -p "Configure Firebase Cloud Messaging (Android)? (y/n): " configure_fcm
if [ "$configure_fcm" = "y" ] || [ "$configure_fcm" = "Y" ]; then
    prompt_input "FCM_SERVER_KEY" "FCM Server Key" "true"
    prompt_input "FCM_SENDER_ID" "FCM Sender ID" "false"
fi
echo ""

read -p "Configure Apple Push Notification Service (iOS)? (y/n): " configure_apns
if [ "$configure_apns" = "y" ] || [ "$configure_apns" = "Y" ]; then
    prompt_input "APNS_KEY_ID" "APNS Key ID" "false"
    prompt_input "APNS_TEAM_ID" "APNS Team ID" "false"
    prompt_input "APNS_AUTH_KEY_PATH" "Path to APNS Auth Key (.p8 file)" "false"
fi
echo ""

# ============================================
# PAYMENT GATEWAYS
# ============================================

echo "--- Payment Gateways (BR-INT-001) ---"
echo ""

read -p "Configure Paystack? (y/n): " configure_paystack
if [ "$configure_paystack" = "y" ] || [ "$configure_paystack" = "Y" ]; then
    prompt_input "PAYSTACK_SECRET_KEY" "Paystack Secret Key" "true"
    prompt_input "PAYSTACK_PUBLIC_KEY" "Paystack Public Key" "false"
fi
echo ""

read -p "Configure Flutterwave? (y/n): " configure_flutterwave
if [ "$configure_flutterwave" = "y" ] || [ "$configure_flutterwave" = "Y" ]; then
    prompt_input "FLUTTERWAVE_SECRET_KEY" "Flutterwave Secret Key" "true"
    prompt_input "FLUTTERWAVE_PUBLIC_KEY" "Flutterwave Public Key" "false"
fi
echo ""

# ============================================
# EXTERNAL SERVICES
# ============================================

echo "--- External Services ---"
echo ""

read -p "Configure NIN Verification (NIMC)? (y/n): " configure_nimc
if [ "$configure_nimc" = "y" ] || [ "$configure_nimc" = "Y" ]; then
    prompt_input "NIMC_API_URL" "NIMC API URL" "false"
    prompt_input "NIMC_API_KEY" "NIMC API Key" "true"
fi
echo ""

read -p "Configure CAC Verification? (y/n): " configure_cac
if [ "$configure_cac" = "y" ] || [ "$configure_cac" = "Y" ]; then
    prompt_input "CAC_API_URL" "CAC API URL" "false"
    prompt_input "CAC_API_KEY" "CAC API Key" "true"
fi
echo ""

# ============================================
# SECURITY
# ============================================

echo "--- Security Configuration ---"
echo ""

# Generate JWT secret if not set
current_jwt=$(grep "^JWT_SECRET=" "$ENV_FILE" | cut -d'=' -f2-)
if [ -z "$current_jwt" ] || [ "$current_jwt" = "your_very_long_random_secret_key_here_at_least_32_characters" ]; then
    echo "Generating secure JWT secret..."
    jwt_secret=$(openssl rand -base64 48)
    sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$jwt_secret/" "$ENV_FILE"
    echo "✓ JWT secret generated"
fi
echo ""

# ============================================
# SUMMARY
# ============================================

echo "=== Configuration Complete ==="
echo ""
echo "Configuration file: $ENV_FILE"
echo ""
echo "Next steps:"
echo "1. Review the .env file and verify all credentials"
echo "2. Run ./init-databases.sh to initialize databases"
echo "3. Run docker-compose up to start all services"
echo ""
echo "Security reminder:"
echo "- Never commit .env file to version control"
echo "- Rotate API keys regularly"
echo "- Use environment-specific credentials for production"
