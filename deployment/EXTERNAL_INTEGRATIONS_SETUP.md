# External Integrations Setup Guide

This guide covers setting up all external integrations for the insurance platform.

---

## 1. Payment Gateway Integration

### Paystack Setup

**Sign up:** https://paystack.com/signup

**Get API Keys:**
1. Log in to Paystack Dashboard
2. Navigate to Settings → API Keys & Webhooks
3. Copy your **Secret Key** and **Public Key**

**Configure:**
```bash
export PAYSTACK_SECRET_KEY="sk_live_xxxxxxxxxxxxx"
export PAYSTACK_PUBLIC_KEY="pk_live_xxxxxxxxxxxxx"
```

**Test Connection:**
```bash
curl https://api.paystack.co/transaction/initialize \
  -H "Authorization: Bearer $PAYSTACK_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","amount":"10000"}'
```

### Flutterwave Setup

**Sign up:** https://flutterwave.com/signup

**Get API Keys:**
1. Log in to Flutterwave Dashboard
2. Navigate to Settings → API
3. Copy your **Secret Key** and **Public Key**

**Configure:**
```bash
export FLUTTERWAVE_SECRET_KEY="FLWSECK-xxxxxxxxxxxxx"
export FLUTTERWAVE_PUBLIC_KEY="FLWPUBK-xxxxxxxxxxxxx"
```

**Test Connection:**
```bash
curl https://api.flutterwave.com/v3/payments \
  -H "Authorization: Bearer $FLUTTERWAVE_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{"tx_ref":"test-123","amount":"1000","currency":"NGN","redirect_url":"https://example.com","customer":{"email":"test@example.com"}}'
```

---

## 2. Telco Provider Integration

### MTN Nigeria

**Contact:** MTN Business Solutions  
**Website:** https://www.mtnonline.com/business  
**Email:** business@mtnonline.com  
**Phone:** +234 803 000 0123

**Required Documents:**
- CAC Certificate
- Company Profile
- Use Case Description
- Technical Integration Plan

**API Access:**
- MTN Developer Portal: https://developer.mtn.com/
- Request API credentials for:
  - Airtime balance check
  - Transaction history
  - Account age verification

**Configure:**
```bash
export MTN_API_KEY="mtn_xxxxxxxxxxxxx"
export MTN_API_SECRET="xxxxxxxxxxxxx"
export MTN_BASE_URL="https://api.mtn.com/v1"
```

### Airtel Nigeria

**Contact:** Airtel Business  
**Website:** https://www.airtel.com.ng/business  
**Email:** business@ng.airtel.com  
**Phone:** +234 708 000 0000

**API Documentation:** https://developers.airtel.africa/

**Configure:**
```bash
export AIRTEL_API_KEY="airtel_xxxxxxxxxxxxx"
export AIRTEL_API_SECRET="xxxxxxxxxxxxx"
export AIRTEL_BASE_URL="https://api.airtel.africa/v1"
```

### Glo Nigeria

**Contact:** Glo Business Solutions  
**Website:** https://www.gloworld.com/ng/business  
**Email:** business@gloworld.com  
**Phone:** +234 805 000 0000

**Configure:**
```bash
export GLO_API_KEY="glo_xxxxxxxxxxxxx"
export GLO_API_SECRET="xxxxxxxxxxxxx"
export GLO_BASE_URL="https://api.gloworld.com/v1"
```

### 9mobile Nigeria

**Contact:** 9mobile Business  
**Website:** https://9mobile.com.ng/business  
**Email:** business@9mobile.com.ng  
**Phone:** +234 809 000 0000

**Configure:**
```bash
export NINEMOBILE_API_KEY="9mobile_xxxxxxxxxxxxx"
export NINEMOBILE_API_SECRET="xxxxxxxxxxxxx"
export NINEMOBILE_BASE_URL="https://api.9mobile.com.ng/v1"
```

---

## 3. Verification Services

### NIMC (National Identity Management Commission) - NIN Verification

**Contact:** NIMC  
**Website:** https://nimc.gov.ng/  
**Email:** info@nimc.gov.ng  
**Phone:** +234 1 448 0000

**Required:**
- CAC Certificate
- Letter of Intent
- Technical Integration Plan
- Data Protection Compliance Certificate

**API Access:**
- Apply through NIMC Portal
- Approval takes 4-6 weeks
- Cost: ₦50 per verification

**Configure:**
```bash
export NIMC_API_KEY="nimc_xxxxxxxxxxxxx"
export NIMC_API_SECRET="xxxxxxxxxxxxx"
export NIMC_BASE_URL="https://api.nimc.gov.ng/v1"
```

**Test Endpoint:**
```bash
curl https://api.nimc.gov.ng/v1/verify/nin \
  -H "Authorization: Bearer $NIMC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"nin":"12345678901","first_name":"John","last_name":"Doe"}'
```

### CAC (Corporate Affairs Commission) - Business Verification

**Contact:** CAC  
**Website:** https://www.cac.gov.ng/  
**Email:** info@cac.gov.ng  
**Phone:** +234 1 461 6900

**API Access:**
- CAC Portal: https://services.cac.gov.ng/
- Request API credentials
- Cost: ₦100 per verification

**Configure:**
```bash
export CAC_API_KEY="cac_xxxxxxxxxxxxx"
export CAC_API_SECRET="xxxxxxxxxxxxx"
export CAC_BASE_URL="https://api.cac.gov.ng/v1"
```

### NIBSS (Nigeria Inter-Bank Settlement System) - BVN Verification

**Contact:** NIBSS  
**Website:** https://nibss-plc.com.ng/  
**Email:** info@nibss-plc.com.ng  
**Phone:** +234 1 448 5500

**Required:**
- Banking license or partnership with licensed bank
- Technical integration approval
- Data security audit

**API Access:**
- Apply through NIBSS Portal
- Cost: ₦20 per verification

**Configure:**
```bash
export NIBSS_API_KEY="nibss_xxxxxxxxxxxxx"
export NIBSS_API_SECRET="xxxxxxxxxxxxx"
export NIBSS_BASE_URL="https://api.nibss-plc.com.ng/v1"
```

---

## 4. SMS Gateway Integration

### Termii

**Sign up:** https://termii.com/signup

**Get API Key:**
1. Log in to Termii Dashboard
2. Navigate to API Settings
3. Copy your API Key

**Configure:**
```bash
export TERMII_API_KEY="TLxxxxxxxxxxxxx"
export TERMII_SENDER_ID="InsureCo"
```

**Test:**
```bash
curl https://api.ng.termii.com/api/sms/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+2348012345678",
    "from": "InsureCo",
    "sms": "Test message",
    "type": "plain",
    "api_key": "'$TERMII_API_KEY'",
    "channel": "generic"
  }'
```

---

## 5. Email Service Integration

### SendGrid

**Sign up:** https://signup.sendgrid.com/

**Get API Key:**
1. Log in to SendGrid Dashboard
2. Navigate to Settings → API Keys
3. Create new API Key with Full Access

**Configure:**
```bash
export SENDGRID_API_KEY="SG.xxxxxxxxxxxxx"
export SENDGRID_FROM_EMAIL="noreply@insureco.ng"
export SENDGRID_FROM_NAME="InsureCo"
```

**Test:**
```bash
curl https://api.sendgrid.com/v3/mail/send \
  -H "Authorization: Bearer $SENDGRID_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "personalizations": [{"to": [{"email": "test@example.com"}]}],
    "from": {"email": "'$SENDGRID_FROM_EMAIL'"},
    "subject": "Test Email",
    "content": [{"type": "text/plain", "value": "Test message"}]
  }'
```

---

## 6. WhatsApp Business API

### Twilio WhatsApp

**Sign up:** https://www.twilio.com/try-twilio

**Setup WhatsApp:**
1. Log in to Twilio Console
2. Navigate to Messaging → Try it Out → Send a WhatsApp message
3. Follow setup wizard

**Configure:**
```bash
export TWILIO_ACCOUNT_SID="ACxxxxxxxxxxxxx"
export TWILIO_AUTH_TOKEN="xxxxxxxxxxxxx"
export TWILIO_WHATSAPP_NUMBER="whatsapp:+14155238886"
```

**Test:**
```bash
curl -X POST "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Messages.json" \
  -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \
  --data-urlencode "From=$TWILIO_WHATSAPP_NUMBER" \
  --data-urlencode "To=whatsapp:+2348012345678" \
  --data-urlencode "Body=Test WhatsApp message"
```

---

## 7. Document Storage (S3-Compatible)

### AWS S3

**Sign up:** https://aws.amazon.com/

**Create Bucket:**
1. Log in to AWS Console
2. Navigate to S3
3. Create bucket: `insureco-documents-ng`
4. Set region: `af-south-1` (Cape Town) for data sovereignty

**Create IAM User:**
1. Navigate to IAM → Users
2. Create user with programmatic access
3. Attach policy: `AmazonS3FullAccess`
4. Save Access Key ID and Secret Access Key

**Configure:**
```bash
export AWS_ACCESS_KEY_ID="AKIAxxxxxxxxxxxxx"
export AWS_SECRET_ACCESS_KEY="xxxxxxxxxxxxx"
export AWS_REGION="af-south-1"
export AWS_S3_BUCKET="insureco-documents-ng"
```

---

## 8. Push Notifications

### Firebase Cloud Messaging (FCM)

**Setup:**
1. Go to https://console.firebase.google.com/
2. Create new project
3. Add Android and iOS apps
4. Download `google-services.json` (Android) and `GoogleService-Info.plist` (iOS)
5. Navigate to Project Settings → Cloud Messaging
6. Copy Server Key

**Configure:**
```bash
export FCM_SERVER_KEY="AAAAxxxxxxxxxxxxx"
export FCM_SENDER_ID="123456789012"
```

**Test:**
```bash
curl -X POST https://fcm.googleapis.com/fcm/send \
  -H "Authorization: key=$FCM_SERVER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "device_token_here",
    "notification": {
      "title": "Test Notification",
      "body": "This is a test"
    }
  }'
```

---

## Configuration Summary

Create a `.env` file with all credentials:

```bash
# Payment Gateways
PAYSTACK_SECRET_KEY=sk_live_xxxxxxxxxxxxx
PAYSTACK_PUBLIC_KEY=pk_live_xxxxxxxxxxxxx
FLUTTERWAVE_SECRET_KEY=FLWSECK-xxxxxxxxxxxxx
FLUTTERWAVE_PUBLIC_KEY=FLWPUBK-xxxxxxxxxxxxx

# Telco Providers
MTN_API_KEY=mtn_xxxxxxxxxxxxx
MTN_API_SECRET=xxxxxxxxxxxxx
AIRTEL_API_KEY=airtel_xxxxxxxxxxxxx
AIRTEL_API_SECRET=xxxxxxxxxxxxx
GLO_API_KEY=glo_xxxxxxxxxxxxx
GLO_API_SECRET=xxxxxxxxxxxxx
NINEMOBILE_API_KEY=9mobile_xxxxxxxxxxxxx
NINEMOBILE_API_SECRET=xxxxxxxxxxxxx

# Verification Services
NIMC_API_KEY=nimc_xxxxxxxxxxxxx
NIMC_API_SECRET=xxxxxxxxxxxxx
CAC_API_KEY=cac_xxxxxxxxxxxxx
CAC_API_SECRET=xxxxxxxxxxxxx
NIBSS_API_KEY=nibss_xxxxxxxxxxxxx
NIBSS_API_SECRET=xxxxxxxxxxxxx

# Communication
TERMII_API_KEY=TLxxxxxxxxxxxxx
TERMII_SENDER_ID=InsureCo
SENDGRID_API_KEY=SG.xxxxxxxxxxxxx
SENDGRID_FROM_EMAIL=noreply@insureco.ng
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxx
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886

# Storage
AWS_ACCESS_KEY_ID=AKIAxxxxxxxxxxxxx
AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxx
AWS_REGION=af-south-1
AWS_S3_BUCKET=insureco-documents-ng

# Push Notifications
FCM_SERVER_KEY=AAAAxxxxxxxxxxxxx
FCM_SENDER_ID=123456789012
```

---

## Integration Timeline

| Integration | Setup Time | Approval Time | Total |
|------------|------------|---------------|-------|
| Payment Gateways | 1 day | Instant | 1 day |
| Telco Providers | 2 days | 2-4 weeks | 3-5 weeks |
| NIMC (NIN) | 1 day | 4-6 weeks | 5-7 weeks |
| CAC | 1 day | 1-2 weeks | 2-3 weeks |
| NIBSS (BVN) | 2 days | 2-3 weeks | 3-4 weeks |
| SMS/Email | 1 day | Instant | 1 day |
| WhatsApp | 1 day | 1-2 days | 2-3 days |
| Storage (S3) | 1 day | Instant | 1 day |
| Push (FCM) | 1 day | Instant | 1 day |

**Critical Path:** NIMC approval (5-7 weeks)

---

## Cost Estimates (Monthly)

| Service | Cost | Volume |
|---------|------|--------|
| Paystack | 1.5% + ₦100 | Per transaction |
| Flutterwave | 1.4% | Per transaction |
| NIMC | ₦50 | Per verification |
| CAC | ₦100 | Per verification |
| NIBSS | ₦20 | Per verification |
| Termii SMS | ₦2.50 | Per SMS |
| SendGrid | $19.95 | 40,000 emails |
| Twilio WhatsApp | $0.005 | Per message |
| AWS S3 | $0.023/GB | Storage |
| FCM | Free | Unlimited |

**Estimated Monthly Cost (10,000 customers):**
- Verifications: ₦1.7M
- Communications: ₦500K
- Storage: ₦50K
- **Total: ~₦2.25M/month**

---

## Next Steps

1. **Immediate (Week 1):**
   - Set up payment gateways (Paystack, Flutterwave)
   - Set up SMS/Email (Termii, SendGrid)
   - Set up storage (AWS S3)
   - Set up push notifications (FCM)

2. **Short-term (Weeks 2-4):**
   - Apply for NIMC, CAC, NIBSS access
   - Contact telco providers
   - Set up WhatsApp Business

3. **Medium-term (Weeks 5-8):**
   - Complete verification service integrations
   - Complete telco integrations
   - Test end-to-end flows

4. **Production (Week 9+):**
   - Go live with all integrations
   - Monitor usage and costs
   - Optimize based on actual usage patterns
