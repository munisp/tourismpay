# InsurePortal Deployment Guide

## Prerequisites

- Kubernetes cluster (1.28+) or Docker Compose for staging
- Helm 3.x
- kubectl configured with cluster access
- Container registry access (ghcr.io/munisp/insureportal)

## Staging Deployment (Docker Compose)

```bash
cd insureportal/infrastructure/deploy/staging

# Copy and configure environment
cp .env.staging .env
# Edit .env with your values

# Start all services
docker compose up -d

# Verify
docker compose ps
curl http://localhost:5002/api/health
```

The staging stack includes: PostgreSQL, Redis, Kafka, Keycloak, Temporal, OpenSearch.

## Production Deployment (Kubernetes + Helm)

### 1. Namespace Setup

```bash
kubectl create namespace insureportal
kubectl config set-context --current --namespace=insureportal
```

### 2. Create Secrets

```bash
# Database credentials
kubectl create secret generic insureportal-db-credentials \
  --from-literal=username=insureportal \
  --from-literal=password=$DB_PASSWORD \
  --from-literal=host=$DB_HOST

# Redis credentials
kubectl create secret generic insureportal-redis-credentials \
  --from-literal=password=$REDIS_PASSWORD \
  --from-literal=host=$REDIS_HOST

# Kafka credentials
kubectl create secret generic insureportal-kafka-credentials \
  --from-literal=username=$KAFKA_USER \
  --from-literal=password=$KAFKA_PASSWORD

# Keycloak credentials
kubectl create secret generic insureportal-keycloak-credentials \
  --from-literal=client-id=$KEYCLOAK_CLIENT_ID \
  --from-literal=client-secret=$KEYCLOAK_CLIENT_SECRET
```

### 3. Deploy with Helm

```bash
cd insureportal/infrastructure/helm/insurance-platform

# Install
helm install insureportal . \
  -f values-production.yaml \
  --set image.tag=$IMAGE_TAG \
  --set postgresql.external.host=$DB_HOST \
  --set redis.external.host=$REDIS_HOST \
  --set kafka.external.brokers=$KAFKA_BROKERS \
  --set keycloak.external.url=$KEYCLOAK_URL

# Upgrade
helm upgrade insureportal . \
  -f values-production.yaml \
  --set image.tag=$NEW_IMAGE_TAG
```

### 4. Verify

```bash
kubectl get pods -l app=insureportal
kubectl get svc
curl https://insureportal.ng/api/health
```

## Blue-Green Deployment

InsurePortal supports blue-green deployments via Helm:

```bash
# Deploy green (new version)
helm install insureportal-green . \
  -f values-production.yaml \
  --set image.tag=$NEW_TAG \
  --set service.name=insureportal-green

# Verify green is healthy
kubectl exec -it $(kubectl get pod -l version=green -o name | head -1) \
  -- curl localhost:5002/api/health

# Switch traffic (update ingress)
kubectl patch ingress insureportal \
  -p '{"spec":{"rules":[{"host":"insureportal.ng","http":{"paths":[{"path":"/","pathType":"Prefix","backend":{"service":{"name":"insureportal-green","port":{"number":5002}}}}]}}]}}'

# Verify in production
curl https://insureportal.ng/api/health

# Remove old blue
helm uninstall insureportal-blue
```

## Canary Deployment

For gradual rollouts, use APISIX traffic splitting:

```bash
# Deploy canary with 10% traffic
helm install insureportal-canary . \
  -f values-production.yaml \
  --set image.tag=$CANARY_TAG \
  --set replicaCount=1

# Configure APISIX traffic split
curl http://apisix-admin:9180/apisix/admin/routes/insureportal \
  -X PUT -d '{
    "uri": "/*",
    "upstream": {
      "type": "roundrobin",
      "nodes": {
        "insureportal-stable:5002": 90,
        "insureportal-canary:5002": 10
      }
    }
  }'

# Monitor canary metrics in Grafana
# If healthy, increase to 50%, then 100%
# If errors spike, roll back by removing canary upstream
```

## Monitoring Stack

```bash
cd insureportal/infrastructure/monitoring

# Deploy Prometheus + Grafana
docker compose -f docker-compose.monitoring.yml up -d

# Grafana: http://localhost:3000 (admin/admin)
# Prometheus: http://localhost:9090
# Alertmanager: http://localhost:9093
```

## Log Aggregation

```bash
cd insureportal/infrastructure/logging

# Deploy OpenSearch + Fluentd
docker compose -f docker-compose.logging.yml up -d

# OpenSearch Dashboards: http://localhost:5601
# Fluentd receives logs on port 24224
```

## Database Migrations

```bash
cd insureportal

# Generate migration from schema changes
npx drizzle-kit generate

# Apply migrations
npx drizzle-kit migrate

# Seed data (development/staging only)
node server/seed-comprehensive.mjs
```

## Rollback

```bash
# Helm rollback
helm rollback insureportal [REVISION]

# Check history
helm history insureportal

# Database rollback (if needed)
# Migrations are forward-only; restore from backup if needed
```

## Health Checks

| Endpoint | Port | Description |
|----------|------|-------------|
| `/api/health` | 5002 | Main application health |
| `/health` | 8090-8099 | Individual Go services |
| `/metrics` | 9464 | Prometheus metrics |
| `/ready` | 5002 | Kubernetes readiness |

## Environment Variables

See [.env.example](../.env.example) for the complete list of 317 environment variables.

Key categories:
- Database: `DATABASE_URL`, `REDIS_URL`
- Auth: `KEYCLOAK_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`
- Messaging: `KAFKA_BROKERS`, `KAFKA_CLIENT_ID`
- Observability: `OTEL_ENABLED`, `OTEL_EXPORTER_OTLP_ENDPOINT`
- Services: `SERVICE_DISCOVERY_HOST` (configures all service URLs)
