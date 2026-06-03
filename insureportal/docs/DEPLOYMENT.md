# Deployment Guide

## Environments

| Environment | Purpose | Infrastructure |
|-------------|---------|---------------|
| Development | Local dev | Docker Compose (middleware only) |
| Staging | Integration testing | Docker Compose (full stack) |
| Production | Live traffic | Kubernetes + Helm |

## Prerequisites

- Kubernetes 1.28+
- Helm 3.14+
- kubectl configured with cluster access
- Container registry with built images
- DNS configured for ingress domains

## Production Deployment

### 1. Create Namespace and Secrets

```bash
kubectl create namespace ngapp

# Database credentials
kubectl create secret generic ngapp-db-credentials \
  --from-literal=url="postgres://ngapp:PASSWORD@db-host:5432/ngapp?sslmode=require" \
  -n ngapp

# Redis credentials
kubectl create secret generic ngapp-redis-credentials \
  --from-literal=url="redis://:PASSWORD@redis-host:6379" \
  -n ngapp

# Keycloak admin
kubectl create secret generic ngapp-keycloak-credentials \
  --from-literal=admin-password="KEYCLOAK_ADMIN_PASSWORD" \
  -n ngapp

# Grafana admin
kubectl create secret generic ngapp-grafana-credentials \
  --from-literal=admin-password="GRAFANA_ADMIN_PASSWORD" \
  -n ngapp
```

### 2. Install Monitoring Stack

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm install monitoring prometheus-community/kube-prometheus-stack \
  -f monitoring/prometheus-values.yaml \
  -n observability --create-namespace
```

### 3. Deploy OpenTelemetry Collector

```bash
kubectl apply -f monitoring/otel-collector.yaml
```

### 4. Install NGApp Platform

```bash
helm install ngapp helm/ngapp-platform/ \
  -f helm/ngapp-platform/values.yaml \
  --set global.domain=your-domain.com \
  --set global.imageRegistry=your-registry.com \
  -n ngapp
```

### 5. Verify Deployment

```bash
# Check all pods are running
kubectl get pods -n ngapp

# Check services
kubectl get svc -n ngapp

# Check ingress
kubectl get ingress -n ngapp

# Run health checks
for svc in $(kubectl get svc -n ngapp -o jsonpath='{.items[*].metadata.name}'); do
  echo "$svc: $(kubectl exec -n ngapp deploy/$svc -- wget -qO- http://localhost:8080/health 2>/dev/null || echo 'N/A')"
done
```

### 6. Seed Database

```bash
kubectl run seed --rm -it --image=node:20-alpine \
  --env="DATABASE_URL=postgres://..." \
  -n ngapp -- sh -c "npm install && node server/seed-comprehensive.mjs"
```

## Scaling

### Manual Scaling

```bash
# Scale a specific service
kubectl scale deployment claims-adjudication-engine --replicas=5 -n ngapp
```

### Autoscaling (HPA)

All services have HPA configured by default:
- Min: 2 replicas
- Max: 8 replicas
- Target CPU: 75%

Override per service in `values.yaml`:
```yaml
services:
  ussd-gateway:
    replicaCount: 4
    autoscaling:
      maxReplicas: 20
      targetCPUUtilizationPercentage: 60
```

## Rollback

```bash
# View release history
helm history ngapp -n ngapp

# Rollback to previous version
helm rollback ngapp 1 -n ngapp
```

## Disaster Recovery

The `disaster-recovery-module` service handles automated failover:
- Monitors all service health endpoints every 30s
- Triggers Temporal workflow on 3 consecutive failures
- Failover workflow: drain traffic → promote replica → verify → switch DNS
- RTO target: 15 minutes
- RPO target: 1 hour (Postgres WAL shipping)

## Monitoring

### Grafana Dashboards
- **NGApp Platform Overview** — Request rate, error rate, latency P99
- **Claims Pipeline** — Submitted/approved/rejected/escalated rates
- **Database Health** — Connection pool, query latency, replication lag
- **Kafka Health** — Consumer lag, throughput, partition status

### Alerts
| Alert | Severity | Condition |
|-------|----------|-----------|
| ServiceDown | Critical | Service unreachable for 5m |
| HighErrorRate | Warning | >5% error rate for 5m |
| HighLatency | Warning | P99 >2s for 5m |
| PodCrashLooping | Critical | Restart rate >0 for 5m |
| DBPoolExhausted | Critical | 0 available connections for 2m |
| HighMemoryUsage | Warning | >90% memory limit for 5m |
