# Unified Insurance Platform - DevOps Deployment Guide

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Infrastructure Requirements](#infrastructure-requirements)
3. [Prerequisites](#prerequisites)
4. [Kubernetes Cluster Setup](#kubernetes-cluster-setup)
5. [Middleware Stack Deployment](#middleware-stack-deployment)
6. [Application Services Deployment](#application-services-deployment)
7. [Database Setup](#database-setup)
8. [Monitoring & Observability](#monitoring--observability)
9. [CI/CD Pipeline](#cicd-pipeline)
10. [Security Configuration](#security-configuration)
11. [Scaling & High Availability](#scaling--high-availability)
12. [Disaster Recovery](#disaster-recovery)
13. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

The Unified Insurance Platform consists of 58 microservices integrated with a robust middleware stack:

### Core Middleware Stack (7 Systems)
| System | Purpose | Port |
|--------|---------|------|
| Apache Kafka | Event streaming, async messaging | 9092 |
| Redis | Caching, session management, pub/sub | 6379 |
| Temporal | Workflow orchestration, saga patterns | 7233 |
| TigerBeetle | High-performance financial ledger | 3000 |
| Apache Lakehouse (Iceberg) | Analytics, data lake | 8181 |
| Dapr | Service mesh, state management | 3500 |
| Fluvio | Real-time streaming | 9003 |

### Application Services
- **Customer Portal** (Next.js/tRPC) - Port 3000
- **Claims Adjudication Engine** (Go) - Port 8001
- **Policy Workflow Service** (Go) - Port 8002
- **KYC/KYB System** (Go/Python) - Ports 8003-8006
- **Fraud Detection** (Go/Python) - Port 8007
- **Communication Service** (Go) - Port 8008
- **Geospatial Service** (Go/Python) - Port 8009
- **Telco Integration** (Go) - Port 8010
- **ERPNext Integration** (Go) - Port 8011
- **OpenIMIS Integration** (Go) - Port 8012
- **Mobile API Gateway** (Go) - Port 8013

---

## Infrastructure Requirements

### Minimum Production Requirements

| Resource | Specification |
|----------|--------------|
| Kubernetes Cluster | 3 master nodes, 6+ worker nodes |
| Worker Node CPU | 8 cores minimum |
| Worker Node RAM | 32GB minimum |
| Storage | 500GB SSD per node |
| Network | 10Gbps internal, 1Gbps external |

### Recommended Production Setup

| Resource | Specification |
|----------|--------------|
| Kubernetes Cluster | 3 master nodes, 12 worker nodes |
| Worker Node CPU | 16 cores |
| Worker Node RAM | 64GB |
| Storage | 1TB NVMe SSD per node |
| Network | 25Gbps internal, 10Gbps external |

### Cloud Provider Options
- **AWS EKS** (Recommended for Nigeria - af-south-1 region)
- **Google GKE**
- **Azure AKS**
- **DigitalOcean Kubernetes**
- **On-premises** (Rancher/k3s)

---

## Prerequisites

### Required Tools
```bash
# Install kubectl
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl

# Install Helm 3
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

# Install Terraform
wget https://releases.hashicorp.com/terraform/1.6.0/terraform_1.6.0_linux_amd64.zip
unzip terraform_1.6.0_linux_amd64.zip
sudo mv terraform /usr/local/bin/

# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Dapr CLI
wget -q https://raw.githubusercontent.com/dapr/cli/master/install/install.sh -O - | /bin/bash

# Install Temporal CLI
curl -sSf https://temporal.download/cli.sh | sh

# Install Fluvio CLI
curl -fsS https://hub.fluvio.io/install/install.sh | bash
```

### Required Accounts & Credentials
- Container registry access (Docker Hub, ECR, GCR, or private)
- Cloud provider credentials
- Domain names and SSL certificates
- External API credentials (see EXTERNAL_INTEGRATIONS_SETUP.md)

---

## Kubernetes Cluster Setup

### Option 1: AWS EKS (Recommended)

```bash
# Create EKS cluster with eksctl
eksctl create cluster \
  --name insurance-platform \
  --region af-south-1 \
  --version 1.28 \
  --nodegroup-name workers \
  --node-type m5.2xlarge \
  --nodes 6 \
  --nodes-min 3 \
  --nodes-max 12 \
  --managed \
  --with-oidc \
  --ssh-access \
  --ssh-public-key ~/.ssh/id_rsa.pub

# Configure kubectl
aws eks update-kubeconfig --name insurance-platform --region af-south-1
```

### Option 2: On-Premises with k3s

```bash
# On master node
curl -sfL https://get.k3s.io | sh -s - server \
  --cluster-init \
  --tls-san=<master-ip> \
  --disable traefik

# Get token
cat /var/lib/rancher/k3s/server/node-token

# On worker nodes
curl -sfL https://get.k3s.io | K3S_URL=https://<master-ip>:6443 \
  K3S_TOKEN=<token> sh -
```

### Create Namespaces

```bash
kubectl create namespace insurance-platform
kubectl create namespace middleware
kubectl create namespace monitoring
kubectl create namespace ingress
```

---

## Middleware Stack Deployment

### 1. Apache Kafka (Strimzi Operator)

```bash
# Install Strimzi Operator
kubectl create namespace kafka
kubectl apply -f 'https://strimzi.io/install/latest?namespace=kafka' -n kafka

# Deploy Kafka Cluster
cat <<EOF | kubectl apply -f -
apiVersion: kafka.strimzi.io/v1beta2
kind: Kafka
metadata:
  name: insurance-kafka
  namespace: kafka
spec:
  kafka:
    version: 3.6.0
    replicas: 3
    listeners:
      - name: plain
        port: 9092
        type: internal
        tls: false
      - name: tls
        port: 9093
        type: internal
        tls: true
    config:
      offsets.topic.replication.factor: 3
      transaction.state.log.replication.factor: 3
      transaction.state.log.min.isr: 2
      default.replication.factor: 3
      min.insync.replicas: 2
    storage:
      type: persistent-claim
      size: 100Gi
      class: gp3
  zookeeper:
    replicas: 3
    storage:
      type: persistent-claim
      size: 50Gi
      class: gp3
  entityOperator:
    topicOperator: {}
    userOperator: {}
EOF

# Create Topics
cat <<EOF | kubectl apply -f -
apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaTopic
metadata:
  name: policy-events
  namespace: kafka
  labels:
    strimzi.io/cluster: insurance-kafka
spec:
  partitions: 12
  replicas: 3
  config:
    retention.ms: 604800000
---
apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaTopic
metadata:
  name: claims-events
  namespace: kafka
  labels:
    strimzi.io/cluster: insurance-kafka
spec:
  partitions: 12
  replicas: 3
---
apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaTopic
metadata:
  name: payment-events
  namespace: kafka
  labels:
    strimzi.io/cluster: insurance-kafka
spec:
  partitions: 12
  replicas: 3
---
apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaTopic
metadata:
  name: fraud-alerts
  namespace: kafka
  labels:
    strimzi.io/cluster: insurance-kafka
spec:
  partitions: 6
  replicas: 3
---
apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaTopic
metadata:
  name: audit-trail
  namespace: kafka
  labels:
    strimzi.io/cluster: insurance-kafka
spec:
  partitions: 12
  replicas: 3
EOF
```

### 2. Redis Cluster

```bash
# Install Redis using Helm
helm repo add bitnami https://charts.bitnami.com/bitnami
helm install redis bitnami/redis-cluster \
  --namespace middleware \
  --set cluster.nodes=6 \
  --set cluster.replicas=1 \
  --set persistence.size=10Gi \
  --set password=<secure-password>
```

### 3. Temporal Cluster

```bash
# Install Temporal using Helm
helm repo add temporal https://go.temporal.io/helm-charts
helm install temporal temporal/temporal \
  --namespace middleware \
  --set server.replicaCount=3 \
  --set cassandra.config.cluster_size=3 \
  --set prometheus.enabled=true \
  --set grafana.enabled=true \
  --set elasticsearch.enabled=true
```

### 4. TigerBeetle

```bash
# Deploy TigerBeetle StatefulSet
cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: tigerbeetle
  namespace: middleware
spec:
  serviceName: tigerbeetle
  replicas: 3
  selector:
    matchLabels:
      app: tigerbeetle
  template:
    metadata:
      labels:
        app: tigerbeetle
    spec:
      containers:
      - name: tigerbeetle
        image: ghcr.io/tigerbeetle/tigerbeetle:latest
        ports:
        - containerPort: 3000
        volumeMounts:
        - name: data
          mountPath: /var/lib/tigerbeetle
        resources:
          requests:
            memory: "8Gi"
            cpu: "4"
          limits:
            memory: "16Gi"
            cpu: "8"
  volumeClaimTemplates:
  - metadata:
      name: data
    spec:
      accessModes: ["ReadWriteOnce"]
      storageClassName: gp3
      resources:
        requests:
          storage: 100Gi
---
apiVersion: v1
kind: Service
metadata:
  name: tigerbeetle
  namespace: middleware
spec:
  selector:
    app: tigerbeetle
  ports:
  - port: 3000
    targetPort: 3000
  clusterIP: None
EOF
```

### 5. Apache Iceberg (Lakehouse)

```bash
# Deploy Iceberg REST Catalog
cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: iceberg-rest
  namespace: middleware
spec:
  replicas: 2
  selector:
    matchLabels:
      app: iceberg-rest
  template:
    metadata:
      labels:
        app: iceberg-rest
    spec:
      containers:
      - name: iceberg-rest
        image: tabulario/iceberg-rest:latest
        ports:
        - containerPort: 8181
        env:
        - name: CATALOG_WAREHOUSE
          value: "s3://insurance-lakehouse/warehouse"
        - name: CATALOG_IO__IMPL
          value: "org.apache.iceberg.aws.s3.S3FileIO"
        - name: AWS_REGION
          value: "af-south-1"
        resources:
          requests:
            memory: "2Gi"
            cpu: "1"
---
apiVersion: v1
kind: Service
metadata:
  name: iceberg-rest
  namespace: middleware
spec:
  selector:
    app: iceberg-rest
  ports:
  - port: 8181
    targetPort: 8181
EOF
```

### 6. Dapr

```bash
# Install Dapr on Kubernetes
dapr init -k --runtime-version 1.12.0

# Deploy Dapr Components
cat <<EOF | kubectl apply -f -
apiVersion: dapr.io/v1alpha1
kind: Component
metadata:
  name: statestore
  namespace: insurance-platform
spec:
  type: state.redis
  version: v1
  metadata:
  - name: redisHost
    value: redis-cluster.middleware.svc.cluster.local:6379
  - name: redisPassword
    secretKeyRef:
      name: redis-secret
      key: password
---
apiVersion: dapr.io/v1alpha1
kind: Component
metadata:
  name: pubsub
  namespace: insurance-platform
spec:
  type: pubsub.kafka
  version: v1
  metadata:
  - name: brokers
    value: insurance-kafka-kafka-bootstrap.kafka.svc.cluster.local:9092
  - name: authType
    value: "none"
---
apiVersion: dapr.io/v1alpha1
kind: Component
metadata:
  name: binding-cron
  namespace: insurance-platform
spec:
  type: bindings.cron
  version: v1
  metadata:
  - name: schedule
    value: "@every 1h"
EOF
```

### 7. Fluvio

```bash
# Install Fluvio on Kubernetes
fluvio cluster start --k8

# Create Topics
fluvio topic create policy-stream --partitions 6
fluvio topic create claims-stream --partitions 6
fluvio topic create real-time-analytics --partitions 12
```

---

## Application Services Deployment

### Build and Push Docker Images

```bash
# Set registry
export REGISTRY=your-registry.com/insurance-platform

# Build all services
cd /path/to/unified-insurance-platform

# Customer Portal
docker build -t $REGISTRY/customer-portal:latest ./customer-portal-full
docker push $REGISTRY/customer-portal:latest

# Claims Adjudication Engine
docker build -t $REGISTRY/claims-adjudication:latest ./claims-adjudication-engine
docker push $REGISTRY/claims-adjudication:latest

# Policy Workflow
docker build -t $REGISTRY/policy-workflow:latest ./policy-workflow-go
docker push $REGISTRY/policy-workflow:latest

# KYC/KYB Services
docker build -t $REGISTRY/kyc-orchestrator:latest ./kyc-kyb-system/kyc-orchestrator-service
docker push $REGISTRY/kyc-orchestrator:latest

# Fraud Detection
docker build -t $REGISTRY/fraud-detection:latest ./fraud-detection-go
docker push $REGISTRY/fraud-detection:latest

# Communication Service
docker build -t $REGISTRY/communication:latest ./communication-service
docker push $REGISTRY/communication:latest

# Continue for all services...
```

### Deploy Application Services

```bash
# Create secrets
kubectl create secret generic db-credentials \
  --namespace insurance-platform \
  --from-literal=postgres-url="postgresql://user:password@postgres:5432/insurance" \
  --from-literal=redis-url="redis://:password@redis:6379"

kubectl create secret generic api-keys \
  --namespace insurance-platform \
  --from-literal=jwt-secret="your-jwt-secret" \
  --from-literal=paystack-key="sk_live_xxx" \
  --from-literal=flutterwave-key="FLWSECK-xxx"

# Deploy Customer Portal
cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: customer-portal
  namespace: insurance-platform
spec:
  replicas: 3
  selector:
    matchLabels:
      app: customer-portal
  template:
    metadata:
      labels:
        app: customer-portal
      annotations:
        dapr.io/enabled: "true"
        dapr.io/app-id: "customer-portal"
        dapr.io/app-port: "3000"
    spec:
      containers:
      - name: customer-portal
        image: your-registry.com/insurance-platform/customer-portal:latest
        ports:
        - containerPort: 3000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: postgres-url
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: redis-url
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: api-keys
              key: jwt-secret
        - name: KAFKA_BROKERS
          value: "insurance-kafka-kafka-bootstrap.kafka.svc.cluster.local:9092"
        - name: TEMPORAL_ADDRESS
          value: "temporal-frontend.middleware.svc.cluster.local:7233"
        - name: TIGERBEETLE_ADDRESS
          value: "tigerbeetle.middleware.svc.cluster.local:3000"
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /api/health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /api/health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: customer-portal
  namespace: insurance-platform
spec:
  selector:
    app: customer-portal
  ports:
  - port: 3000
    targetPort: 3000
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: customer-portal-hpa
  namespace: insurance-platform
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: customer-portal
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
EOF
```

### Deploy Claims Adjudication Engine

```bash
cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: claims-adjudication
  namespace: insurance-platform
spec:
  replicas: 3
  selector:
    matchLabels:
      app: claims-adjudication
  template:
    metadata:
      labels:
        app: claims-adjudication
      annotations:
        dapr.io/enabled: "true"
        dapr.io/app-id: "claims-adjudication"
        dapr.io/app-port: "8001"
    spec:
      containers:
      - name: claims-adjudication
        image: your-registry.com/insurance-platform/claims-adjudication:latest
        ports:
        - containerPort: 8001
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: postgres-url
        - name: KAFKA_BROKERS
          value: "insurance-kafka-kafka-bootstrap.kafka.svc.cluster.local:9092"
        - name: TEMPORAL_ADDRESS
          value: "temporal-frontend.middleware.svc.cluster.local:7233"
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: redis-url
        - name: TIGERBEETLE_ADDRESS
          value: "tigerbeetle.middleware.svc.cluster.local:3000"
        - name: LAKEHOUSE_URL
          value: "http://iceberg-rest.middleware.svc.cluster.local:8181"
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"
---
apiVersion: v1
kind: Service
metadata:
  name: claims-adjudication
  namespace: insurance-platform
spec:
  selector:
    app: claims-adjudication
  ports:
  - port: 8001
    targetPort: 8001
EOF
```

---

## Database Setup

### PostgreSQL (Primary Database)

```bash
# Install PostgreSQL using Helm
helm install postgresql bitnami/postgresql-ha \
  --namespace insurance-platform \
  --set postgresql.replicaCount=3 \
  --set postgresql.password=<secure-password> \
  --set postgresql.database=insurance \
  --set persistence.size=100Gi \
  --set persistence.storageClass=gp3

# Run migrations
kubectl run migrations --rm -it --restart=Never \
  --namespace insurance-platform \
  --image=your-registry.com/insurance-platform/migrations:latest \
  --env="DATABASE_URL=postgresql://user:password@postgresql-ha-pgpool:5432/insurance" \
  -- npm run migrate
```

### Database Schema Initialization

```bash
# Connect to PostgreSQL
kubectl exec -it postgresql-ha-postgresql-0 -n insurance-platform -- psql -U postgres

# Create databases
CREATE DATABASE customer_portal;
CREATE DATABASE claims_service;
CREATE DATABASE kyc_service;
CREATE DATABASE fraud_database;
CREATE DATABASE telco_service;

# Create users with appropriate permissions
CREATE USER app_user WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE customer_portal TO app_user;
GRANT ALL PRIVILEGES ON DATABASE claims_service TO app_user;
-- Continue for other databases
```

---

## Monitoring & Observability

### Prometheus & Grafana Stack

```bash
# Install kube-prometheus-stack
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --set grafana.adminPassword=<admin-password> \
  --set prometheus.prometheusSpec.retention=30d \
  --set prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.resources.requests.storage=100Gi
```

### Jaeger (Distributed Tracing)

```bash
# Install Jaeger Operator
kubectl create namespace observability
kubectl apply -f https://github.com/jaegertracing/jaeger-operator/releases/download/v1.50.0/jaeger-operator.yaml -n observability

# Deploy Jaeger
cat <<EOF | kubectl apply -f -
apiVersion: jaegertracing.io/v1
kind: Jaeger
metadata:
  name: jaeger
  namespace: observability
spec:
  strategy: production
  storage:
    type: elasticsearch
    elasticsearch:
      nodeCount: 3
      resources:
        requests:
          cpu: 1
          memory: 4Gi
EOF
```

### Loki (Log Aggregation)

```bash
# Install Loki Stack
helm install loki grafana/loki-stack \
  --namespace monitoring \
  --set promtail.enabled=true \
  --set loki.persistence.enabled=true \
  --set loki.persistence.size=50Gi
```

---

## CI/CD Pipeline

### GitHub Actions Workflow

```yaml
# .github/workflows/deploy.yml
name: Deploy to Kubernetes

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  REGISTRY: your-registry.com
  IMAGE_TAG: ${{ github.sha }}

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service:
          - customer-portal
          - claims-adjudication
          - policy-workflow
          - kyc-orchestrator
          - fraud-detection
          - communication-service
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      
      - name: Login to Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ secrets.REGISTRY_USERNAME }}
          password: ${{ secrets.REGISTRY_PASSWORD }}
      
      - name: Build and Push
        uses: docker/build-push-action@v5
        with:
          context: ./${{ matrix.service }}
          push: true
          tags: |
            ${{ env.REGISTRY }}/insurance-platform/${{ matrix.service }}:${{ env.IMAGE_TAG }}
            ${{ env.REGISTRY }}/insurance-platform/${{ matrix.service }}:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      
      - name: Configure kubectl
        uses: azure/k8s-set-context@v3
        with:
          kubeconfig: ${{ secrets.KUBE_CONFIG }}
      
      - name: Deploy to Kubernetes
        run: |
          kubectl set image deployment/customer-portal \
            customer-portal=${{ env.REGISTRY }}/insurance-platform/customer-portal:${{ env.IMAGE_TAG }} \
            -n insurance-platform
          kubectl set image deployment/claims-adjudication \
            claims-adjudication=${{ env.REGISTRY }}/insurance-platform/claims-adjudication:${{ env.IMAGE_TAG }} \
            -n insurance-platform
          # Continue for other services
      
      - name: Wait for rollout
        run: |
          kubectl rollout status deployment/customer-portal -n insurance-platform
          kubectl rollout status deployment/claims-adjudication -n insurance-platform
```

---

## Security Configuration

### Network Policies

```bash
cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
  namespace: insurance-platform
spec:
  podSelector: {}
  policyTypes:
  - Ingress
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-internal
  namespace: insurance-platform
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: insurance-platform
    - namespaceSelector:
        matchLabels:
          name: middleware
    - namespaceSelector:
        matchLabels:
          name: ingress
EOF
```

### Pod Security Standards

```bash
kubectl label namespace insurance-platform \
  pod-security.kubernetes.io/enforce=restricted \
  pod-security.kubernetes.io/audit=restricted \
  pod-security.kubernetes.io/warn=restricted
```

### Secrets Management with Vault

```bash
# Install Vault
helm repo add hashicorp https://helm.releases.hashicorp.com
helm install vault hashicorp/vault \
  --namespace vault \
  --set server.ha.enabled=true \
  --set server.ha.replicas=3

# Configure Kubernetes auth
vault auth enable kubernetes
vault write auth/kubernetes/config \
  kubernetes_host="https://$KUBERNETES_PORT_443_TCP_ADDR:443"
```

---

## Scaling & High Availability

### Horizontal Pod Autoscaling

All services are configured with HPA. Adjust thresholds based on load testing:

```bash
# View HPA status
kubectl get hpa -n insurance-platform

# Adjust HPA settings
kubectl patch hpa customer-portal-hpa -n insurance-platform \
  --patch '{"spec":{"maxReplicas":30}}'
```

### KEDA (Event-Driven Autoscaling)

```bash
# Install KEDA
helm repo add kedacore https://kedacore.github.io/charts
helm install keda kedacore/keda --namespace keda --create-namespace

# Scale based on Kafka lag
cat <<EOF | kubectl apply -f -
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: claims-processor-scaler
  namespace: insurance-platform
spec:
  scaleTargetRef:
    name: claims-processor
  minReplicaCount: 2
  maxReplicaCount: 50
  triggers:
  - type: kafka
    metadata:
      bootstrapServers: insurance-kafka-kafka-bootstrap.kafka.svc.cluster.local:9092
      consumerGroup: claims-processor
      topic: claims-events
      lagThreshold: "100"
EOF
```

---

## Disaster Recovery

### Backup Strategy

```bash
# Install Velero for cluster backup
velero install \
  --provider aws \
  --plugins velero/velero-plugin-for-aws:v1.8.0 \
  --bucket insurance-backups \
  --backup-location-config region=af-south-1 \
  --snapshot-location-config region=af-south-1 \
  --secret-file ./credentials-velero

# Schedule daily backups
velero schedule create daily-backup \
  --schedule="0 2 * * *" \
  --include-namespaces insurance-platform,middleware \
  --ttl 720h
```

### Database Backup

```bash
# CronJob for PostgreSQL backup
cat <<EOF | kubectl apply -f -
apiVersion: batch/v1
kind: CronJob
metadata:
  name: postgres-backup
  namespace: insurance-platform
spec:
  schedule: "0 */6 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: backup
            image: postgres:15
            command:
            - /bin/sh
            - -c
            - |
              pg_dumpall -h postgresql-ha-pgpool -U postgres | \
              gzip > /backup/backup-\$(date +%Y%m%d-%H%M%S).sql.gz
              aws s3 cp /backup/*.gz s3://insurance-backups/postgres/
            volumeMounts:
            - name: backup
              mountPath: /backup
          volumes:
          - name: backup
            emptyDir: {}
          restartPolicy: OnFailure
EOF
```

---

## Troubleshooting

### Common Issues

**1. Pod CrashLoopBackOff**
```bash
kubectl logs <pod-name> -n insurance-platform --previous
kubectl describe pod <pod-name> -n insurance-platform
```

**2. Database Connection Issues**
```bash
# Test connectivity
kubectl run test-db --rm -it --restart=Never \
  --image=postgres:15 \
  -- psql -h postgresql-ha-pgpool -U postgres -c "SELECT 1"
```

**3. Kafka Consumer Lag**
```bash
# Check consumer groups
kubectl exec -it insurance-kafka-kafka-0 -n kafka -- \
  bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --all-groups
```

**4. Temporal Workflow Issues**
```bash
# Check workflow status
tctl --address temporal-frontend.middleware.svc.cluster.local:7233 \
  workflow list --namespace default
```

### Health Check Endpoints

| Service | Health Endpoint |
|---------|-----------------|
| Customer Portal | /api/health |
| Claims Engine | /health |
| Policy Workflow | /health |
| KYC Service | /health |
| Fraud Detection | /health |

### Useful Commands

```bash
# View all pods
kubectl get pods -n insurance-platform -o wide

# View logs
kubectl logs -f deployment/customer-portal -n insurance-platform

# Execute into pod
kubectl exec -it deployment/customer-portal -n insurance-platform -- /bin/sh

# Port forward for debugging
kubectl port-forward svc/customer-portal 3000:3000 -n insurance-platform

# View resource usage
kubectl top pods -n insurance-platform
kubectl top nodes
```

---

## Environment Variables Reference

See `deployment/config/.env.template` for complete list of all environment variables required for each service.

## Support

For technical support:
- Documentation: https://docs.insureportal.ng
- Email: devops@insureportal.ng
