# 12-Middleware Robustness Assessment

## Summary

| # | Middleware | Integration Level | Robustness Score | Status |
|---|-----------|------------------|-----------------|--------|
| 1 | PostgreSQL | Full | 95/100 | Production-ready |
| 2 | TigerBeetle | Planned | 15/100 | Not integrated |
| 3 | Redis | Ready | 40/100 | Interface ready, needs Redis server |
| 4 | Mojaloop | Stub | 20/100 | Payment gateway stubs only |
| 5 | Kafka | Planned | 10/100 | No integration |
| 6 | APISIX | Planned | 15/100 | No gateway configured |
| 7 | Keycloak | Partial | 35/100 | Custom auth, not Keycloak SSO |
| 8 | OpenAppSec | Planned | 10/100 | Security headers only |
| 9 | Permify | Planned | 20/100 | Role checks in-app |
| 10 | OpenSearch | Ready | 30/100 | Docker config ready |
| 11 | Fluvio | Planned | 5/100 | Not integrated |
| 12 | Dapr | Planned | 10/100 | Not integrated |

## Detailed Assessment

### 1. PostgreSQL — 95/100 ✅
- **Integration**: Full — 350+ routes query real PostgreSQL tables
- **Tables**: 230+ tables seeded with production-like data
- **Connection Pool**: pg Pool with configurable max (env var), idle timeout, statement timeout
- **Failover**: Connection retry on startup, graceful fallback messaging
- **Monitoring**: Pool stats exposed via /metrics endpoint
- **Gaps**: No read replicas, no pg_bouncer, no automated backups in compose

### 2. TigerBeetle — 15/100 ⚠️
- **Integration**: Not connected — no TigerBeetle client in dependencies
- **Current State**: Financial accounting done via PostgreSQL GL tables
- **Use Case**: Double-entry accounting ledger for premium/claims transactions
- **Recommendation**: Add tigerbeetle-node client, create accounts for assets/liabilities/revenue, migrate GL entries to TigerBeetle transfers
- **Blocked By**: TigerBeetle server not running in compose

### 3. Redis — 40/100 ⚠️
- **Integration**: Docker config ready, session store interface designed
- **Current State**: Sessions use in-memory Map (Redis-ready interface)
- **Rate Limiting**: In-memory sliding window (should be Redis-backed for multi-instance)
- **Recommendation**: Connect ioredis, migrate sessions, rate limits, and cache to Redis
- **Docker**: Redis 7 in compose with maxmemory and AOF persistence

### 4. Mojaloop — 20/100 ⚠️
- **Integration**: Payment gateway stubs (Paystack/Flutterwave/InsurePortal Pay)
- **Current State**: Can initiate payments and generate references, but no Mojaloop DFSP integration
- **Recommendation**: Implement Mojaloop PISP API for peer-to-peer premium payments, add DFSP adapter for settlement
- **Use Case**: Mobile money insurance premium payments via Mojaloop hub

### 5. Kafka — 10/100 ❌
- **Integration**: No Kafka client in project
- **Current State**: All operations synchronous
- **Recommendation**: Add event sourcing for claims lifecycle (submitted→reviewed→approved→paid), policy events, audit trail as event stream
- **Use Case**: Async processing for NAICOM report generation, bulk policy renewals, fraud detection pipeline

### 6. APISIX — 15/100 ⚠️
- **Integration**: No API gateway in front of service
- **Current State**: Express serves directly with rate limiting middleware
- **Recommendation**: Deploy APISIX as reverse proxy with JWT validation, request transformation, traffic mirroring
- **Use Case**: Multi-tenant routing, canary deployments, API versioning

### 7. Keycloak — 35/100 ⚠️
- **Integration**: Custom auth (bcrypt + session tokens) — not Keycloak SSO
- **Current State**: 2FA (TOTP), password reset, rate limiting, KYC gate all working
- **Recommendation**: Replace custom auth with Keycloak OIDC flow, import existing users, configure realms (customer/agent/admin)
- **Use Case**: SSO across all InsurePortal services, federated identity for banking partners

### 8. OpenAppSec — 10/100 ❌
- **Integration**: Security headers added (CSP, HSTS, X-Frame, etc.)
- **Current State**: No WAF/runtime protection
- **Recommendation**: Deploy OpenAppSec as sidecar, configure rules for SQL injection, XSS, API abuse
- **Use Case**: ML-based threat detection without signatures

### 9. Permify — 20/100 ⚠️
- **Integration**: Role-based checks in application code (admin/agent/customer)
- **Current State**: Hardcoded role checks in route handlers
- **Recommendation**: Migrate to Permify relationship-based access control, define schemas for org→policy→claim permissions
- **Use Case**: Fine-grained authorization (agent can only see their assigned policies)

### 10. OpenSearch — 30/100 ⚠️
- **Integration**: Docker config ready, no application client
- **Current State**: Search uses PostgreSQL ILIKE queries
- **Recommendation**: Index policies, claims, customers into OpenSearch, add full-text search with relevance scoring and facets
- **Use Case**: Customer portal search bar, claims investigation, regulatory document search

### 11. Fluvio — 5/100 ❌
- **Integration**: Not connected
- **Current State**: No streaming data pipelines
- **Recommendation**: Use Fluvio for real-time telematics data ingestion, USSD session streaming, IoT parametric trigger data
- **Use Case**: Low-latency streaming for parametric insurance triggers (rainfall/temperature sensors)

### 12. Dapr — 10/100 ❌
- **Integration**: Not connected
- **Current State**: Direct HTTP calls between frontend and backend
- **Recommendation**: Use Dapr sidecar for service invocation, pub/sub, state management, secrets management
- **Use Case**: Multi-service orchestration when microservices split occurs

## Production Readiness Recommendations

### Immediate (P0):
1. Connect Redis for sessions + rate limiting + caching
2. Add OpenSearch for full-text search across portal
3. Configure APISIX gateway for JWT validation + rate limiting

### Short-term (P1):
4. Integrate Keycloak for SSO (banking partner federation)
5. Add Kafka for event sourcing (claims lifecycle, audit events)
6. Deploy TigerBeetle for double-entry accounting

### Medium-term (P2):
7. Add Permify for fine-grained RBAC
8. Deploy OpenAppSec WAF
9. Integrate Fluvio for real-time data streaming
10. Add Dapr for service mesh when splitting to microservices
