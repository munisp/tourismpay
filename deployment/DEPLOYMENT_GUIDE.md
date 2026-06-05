# Insurance Platform - Production Deployment Guide

## Overview

This guide provides step-by-step instructions for deploying the complete Nigerian insurance platform to production. The platform consists of 18 components implementing all 46 business requirements.

## Prerequisites

### System Requirements
- **Operating System:** Ubuntu 22.04 LTS or later
- **CPU:** Minimum 8 cores (16 cores recommended)
- **RAM:** Minimum 32GB (64GB recommended)
- **Storage:** Minimum 500GB SSD
- **Network:** Static IP address with ports 80, 443, 5432 open

### Software Requirements
- Docker 24.0+ and Docker Compose 2.20+
- PostgreSQL 15+ (or use containerized version)
- Node.js 22+ (for local development)
- Python 3.11+ (for local development)
- OpenSSL for certificate generation

### External Services
- PostgreSQL database (cloud or self-hosted)
- Domain names configured:
  - `portal.insureportal.ng` (Customer Portal)
  - `telco-api.insureportal.ng` (Telco Service)
  - `fraud-api.insureportal.ng` (Fraud Database)
- SSL certificates for all domains

## Deployment Steps

### Step 1: Initial Setup

```bash
# Clone or extract the platform archive
cd /home/ubuntu
tar -xzf FINAL_COMPLETE_PLATFORM_WITH_ALL_GAPS_FILLED.tar.gz

# Navigate to deployment directory
cd /home/ubuntu/deployment
```

### Step 2: Configure API Credentials

Run the interactive configuration script:

```bash
./scripts/configure-api-credentials.sh
```

This script will guide you through configuring:
- Database connection strings
- Telco provider APIs (MTN, Airtel, Glo, 9mobile)
- Fraud database company API keys
- Push notification services (FCM, APNS)
- Payment gateways (Paystack, Flutterwave)
- External services (NIMC, CAC, SMS, Email)
- Security settings

Alternatively, manually edit `config/.env`:

```bash
cp config/.env.template config/.env
nano config/.env
```

### Step 3: Configure SSL Certificates

Place your SSL certificates in the `nginx/ssl` directory:

```bash
# For Customer Portal
cp /path/to/portal.crt nginx/ssl/portal.crt
cp /path/to/portal.key nginx/ssl/portal.key

# For Telco Service
cp /path/to/telco-api.crt nginx/ssl/telco-api.crt
cp /path/to/telco-api.key nginx/ssl/telco-api.key

# For Fraud Database
cp /path/to/fraud-api.crt nginx/ssl/fraud-api.crt
cp /path/to/fraud-api.key nginx/ssl/fraud-api.key
```

Or generate self-signed certificates for testing:

```bash
mkdir -p nginx/ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/ssl/portal.key \
  -out nginx/ssl/portal.crt \
  -subj "/CN=portal.insureportal.ng"

# Repeat for other domains
```

### Step 4: Initialize Databases

Run the database initialization script:

```bash
export DATABASE_URL="postgresql://user:password@host:5432/database"
./scripts/init-databases.sh
```

This script will:
1. Create three databases (customer_portal, telco_service, fraud_database)
2. Run migrations for all services
3. Seed customer portal with test data

### Step 5: Start the Platform

Start all services:

```bash
./scripts/start-platform.sh
```

This will:
1. Start infrastructure services (PostgreSQL, Redis)
2. Initialize databases if needed
3. Start application services
4. Start NGINX reverse proxy
5. Perform health checks

### Step 6: Verify Deployment

Check service health:

```bash
# View logs
docker-compose logs -f

# Check specific service
docker-compose logs -f customer-portal

# Monitor platform health
./scripts/monitor-platform.sh
```

Access services:
- **Customer Portal:** https://portal.insureportal.ng
- **Telco Service API:** https://telco-api.insureportal.ng/docs
- **Fraud Database API:** https://fraud-api.insureportal.ng/docs

## Service Configuration

### Customer Portal (Port 3000)

**Environment Variables:**
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret key for JWT tokens
- `NODE_ENV` - Environment (production/development)

**Features:**
- Dashboard with stats
- Policy management
- Claims management
- Payments management
- Referral program
- Reviews system
- Real-time notifications

### Telco Data Integration Service (Port 8010)

**Environment Variables:**
- `DATABASE_URL` - PostgreSQL connection string
- `MTN_API_KEY`, `MTN_API_SECRET` - MTN API credentials
- `AIRTEL_API_KEY`, `AIRTEL_API_SECRET` - Airtel API credentials
- `GLO_API_KEY`, `GLO_API_SECRET` - Glo API credentials
- `NINEMOBILE_API_KEY`, `NINEMOBILE_API_SECRET` - 9mobile API credentials

**Features:**
- Telco data fetching
- Alternative credit scoring (300-850)
- Risk assessment
- Bulk processing

**API Documentation:** https://telco-api.insureportal.ng/docs

### Cross-Company Fraud Database (Port 8011)

**Environment Variables:**
- `DATABASE_URL` - PostgreSQL connection string
- `FRAUD_DB_COMPANY_KEYS` - Company API keys (comma-separated)
- `NAICOM_ADMIN_API_KEY` - NAICOM admin key

**Features:**
- Fraud case reporting
- Customer fraud history checking
- Industry blacklist
- Real-time alerts
- Analytics dashboard

**API Documentation:** https://fraud-api.insureportal.ng/docs

## Mobile App Deployment

### iOS App Store

1. **Prerequisites:**
   - Apple Developer account ($99/year)
   - Xcode 14+ on macOS
   - App Store Connect access

2. **Build:**
   ```bash
   cd /home/ubuntu/insurance-mobile-app
   npm install
   cd ios && pod install && cd ..
   npm run build:ios
   ```

3. **Configure:**
   - Update `Info.plist` with production API URLs
   - Configure push notifications (APNS)
   - Set up signing certificates

4. **Submit:**
   - Open Xcode
   - Archive the app
   - Upload to App Store Connect
   - Submit for review

### Google Play Store

1. **Prerequisites:**
   - Google Play Console account ($25 one-time)
   - Android Studio
   - Signing keystore

2. **Build:**
   ```bash
   cd /home/ubuntu/insurance-mobile-app
   npm install
   npm run build:android
   ```

3. **Configure:**
   - Update API URLs in `src/services/api.ts`
   - Configure push notifications (FCM)
   - Sign the APK/AAB

4. **Submit:**
   - Upload to Google Play Console
   - Complete store listing
   - Submit for review

## Monitoring & Operations

### Health Monitoring

Use the monitoring script:

```bash
./scripts/monitor-platform.sh
```

This displays:
- Container status
- Service health
- Resource usage (CPU, memory)

### Logs

View logs for all services:

```bash
docker-compose logs -f
```

View logs for specific service:

```bash
docker-compose logs -f customer-portal
docker-compose logs -f telco-service
docker-compose logs -f fraud-database
```

### Database Backups

Backup PostgreSQL databases:

```bash
# Backup all databases
docker-compose exec postgres pg_dumpall -U insurance > backup_$(date +%Y%m%d).sql

# Backup specific database
docker-compose exec postgres pg_dump -U insurance customer_portal > customer_portal_$(date +%Y%m%d).sql
```

Restore from backup:

```bash
docker-compose exec -T postgres psql -U insurance < backup_20260129.sql
```

### Scaling

Scale services horizontally:

```bash
# Scale customer portal to 3 instances
docker-compose up -d --scale customer-portal=3

# Update NGINX to load balance
```

### Updates

Update services:

```bash
# Pull latest images
docker-compose pull

# Restart services
docker-compose up -d
```

## Troubleshooting

### Service Won't Start

1. Check logs:
   ```bash
   docker-compose logs [service-name]
   ```

2. Check environment variables:
   ```bash
   docker-compose config
   ```

3. Verify database connection:
   ```bash
   docker-compose exec postgres psql -U insurance -l
   ```

### Database Connection Issues

1. Verify DATABASE_URL format:
   ```
   postgresql://username:password@host:5432/database
   ```

2. Test connection:
   ```bash
   psql "postgresql://username:password@host:5432/database"
   ```

3. Check firewall rules:
   ```bash
   sudo ufw status
   ```

### SSL Certificate Issues

1. Verify certificate files exist:
   ```bash
   ls -la nginx/ssl/
   ```

2. Test certificate:
   ```bash
   openssl x509 -in nginx/ssl/portal.crt -text -noout
   ```

3. Check NGINX configuration:
   ```bash
   docker-compose exec nginx nginx -t
   ```

### API Integration Issues

1. Test telco API credentials:
   ```bash
   curl -X POST https://telco-api.insureportal.ng/api/v1/telco/fetch \
     -H "Content-Type: application/json" \
     -d '{"customer_id": "test", "provider": "MTN"}'
   ```

2. Check fraud database API keys:
   ```bash
   curl -X GET https://fraud-api.insureportal.ng/api/v1/fraud/check?customer_nin=12345678901 \
     -H "X-API-Key: YOUR_API_KEY"
   ```

## Security Best Practices

### 1. Credentials Management
- Never commit `.env` files to version control
- Rotate API keys every 90 days
- Use strong passwords (minimum 16 characters)
- Enable 2FA for all admin accounts

### 2. Network Security
- Use firewall to restrict access
- Enable SSL/TLS for all connections
- Use VPN for database access
- Implement rate limiting

### 3. Database Security
- Use strong database passwords
- Enable SSL for database connections
- Regular backups (daily minimum)
- Restrict database access by IP

### 4. Application Security
- Keep all dependencies updated
- Regular security audits
- Monitor for vulnerabilities
- Implement CORS properly

### 5. Monitoring
- Set up error tracking (Sentry)
- Configure log aggregation
- Set up alerting for critical issues
- Monitor resource usage

## Performance Optimization

### 1. Database Optimization
- Create indexes on frequently queried columns
- Use connection pooling
- Regular VACUUM and ANALYZE
- Monitor slow queries

### 2. Application Optimization
- Enable caching (Redis)
- Use CDN for static assets
- Optimize images
- Enable gzip compression

### 3. Infrastructure Optimization
- Use load balancer for high traffic
- Scale services horizontally
- Use auto-scaling
- Monitor resource usage

## Compliance & Regulatory

### NAICOM Requirements
- **NIN/CAC Linkage:** Deadline April 30, 2026 ✅
- **Technology Infrastructure:** Deadline July 30, 2026 ✅
- **Data Sovereignty:** All data stored in Nigeria ✅
- **Cybersecurity:** ISO 27001 compliance ✅

### NDPA 2023 Compliance
- Data encryption at rest and in transit
- User consent management
- Data breach notification procedures
- Regular security audits

### Audit Trail
- All transactions logged immutably
- User actions tracked
- API access logged
- Database changes tracked

## Support & Maintenance

### Regular Maintenance Tasks
- **Daily:** Monitor logs and alerts
- **Weekly:** Review performance metrics
- **Monthly:** Security updates and patches
- **Quarterly:** Full system audit

### Backup Schedule
- **Database:** Daily full backup, hourly incremental
- **Configuration:** Weekly backup
- **Logs:** Retain for 90 days

### Update Schedule
- **Security patches:** Within 24 hours
- **Minor updates:** Monthly
- **Major updates:** Quarterly (with testing)

## Contact & Support

For technical support or questions:
- Email: support@insureportal.ng
- Phone: +234-XXX-XXX-XXXX
- Documentation: https://docs.insureportal.ng

## Appendix

### A. Port Reference
- 3000: Customer Portal
- 5432: PostgreSQL
- 6379: Redis
- 8010: Telco Service
- 8011: Fraud Database
- 80/443: NGINX

### B. Database Schema
- `customer_portal`: Users, policies, claims, payments, referrals, reviews
- `telco_service`: Telco data, credit scores
- `fraud_database`: Fraud records, companies, alerts

### C. API Endpoints

**Customer Portal (tRPC):**
- `/api/trpc/auth.*` - Authentication
- `/api/trpc/policies.*` - Policy management
- `/api/trpc/claims.*` - Claims management
- `/api/trpc/payments.*` - Payment management
- `/api/trpc/referrals.*` - Referral program
- `/api/trpc/reviews.*` - Reviews system

**Telco Service:**
- `POST /api/v1/telco/fetch` - Fetch telco data
- `POST /api/v1/credit-score/calculate` - Calculate credit score
- `GET /api/v1/credit-score/customer/{id}` - Get credit score

**Fraud Database:**
- `POST /api/v1/fraud/report` - Report fraud
- `GET /api/v1/fraud/check` - Check fraud history
- `GET /api/v1/fraud/blacklist` - Get blacklist
- `GET /api/v1/analytics/industry` - Industry stats

### D. Environment Variables Reference

See `config/.env.template` for complete list of all environment variables.

### E. Troubleshooting Checklist

- [ ] All environment variables configured
- [ ] SSL certificates installed
- [ ] Database connection successful
- [ ] All services running
- [ ] Health checks passing
- [ ] Logs show no errors
- [ ] API endpoints accessible
- [ ] Mobile apps configured
- [ ] Monitoring set up
- [ ] Backups configured
