# TourismPay HA Infrastructure

All services are configured for High Availability. Each component directory contains a `docker-compose.yml` that can be started independently or via the master startup script below.

## Prerequisites

```bash
docker network create tourismpay-infra
```

## Service Map

| Service | HA Mode | Nodes | Port(s) |
|---|---|---|---|
| Kafka | KRaft 3-node | 3 brokers | 9092–9094 |
| Redis | Sentinel | 1 primary + 2 replicas + 3 sentinels | 6379, 26379–26381 |
| Keycloak | Active-active | 2 nodes + PostgreSQL | 8080 (LB) |
| Temporal | Multi-service | 2× frontend/history/matching/worker | 7233–7234 |
| TigerBeetle | VR consensus | 3 replicas | 3000–3002 |
| APISIX | Active-active | 2 gateways + 3-node etcd | 9080, 9443 |
| Dapr | Kubernetes sidecar | Per-pod | — |
| Permify | Active-active | 2 nodes + PostgreSQL | 3476–3479 |
| Fluvio | SC + 3 SPU | 4 nodes | 9003, 9010–9015 |
| OpenAppSec | Active-active | 2 WAF nodes | 80, 443 |

## Startup Order

```bash
# 1. Core data layer
cd kafka && docker compose up -d
cd ../redis && docker compose up -d

# 2. Identity & authorization
cd ../keycloak && docker compose up -d
cd ../permify && docker compose up -d

# 3. Workflow & ledger
cd ../temporal && docker compose up -d
cd ../tigerbeetle && docker compose up -d

# 4. Streaming
cd ../fluvio && docker compose up -d

# 5. API gateway & security
cd ../apisix && docker compose up -d
cd ../openappsec && docker compose up -d

# 6. Apply Kubernetes manifests
kubectl apply -f ../kubernetes/tourismpay-deployment.yaml

# 7. Apply Dapr components
kubectl apply -f ../dapr/components.yaml
```

## Health Checks

```bash
# Kafka
docker exec kafka-1 kafka-broker-api-versions --bootstrap-server localhost:9092

# Redis
redis-cli -p 6379 -a $REDIS_PASSWORD ping

# Keycloak
curl http://localhost:8080/health/ready

# TigerBeetle
nc -z localhost 3000 && echo "OK"

# APISIX
curl http://localhost:9180/apisix/admin/routes -H 'X-API-KEY: tourismpay-admin-key'

# Permify
curl http://localhost:3476/healthz
```
