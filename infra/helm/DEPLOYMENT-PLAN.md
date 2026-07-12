# TourismPay Kubernetes Deployment Plan & Runbooks

**Author:** Manus AI  
**Date:** July 12, 2026  
**Target Environment:** Production (Kubernetes 1.28+)

This document outlines the comprehensive deployment strategy, execution runbooks, and rollback procedures for the TourismPay platform, encompassing the new eNaira/CBDC-NG Gateway, Permify ReBAC rollout, and the full middleware stack.

---

## 1. Architecture Overview

The TourismPay platform has evolved into a polyglot microservices architecture running on Kubernetes. The deployment is split into two primary Helm charts to separate stateful middleware from stateless application services.

### 1.1 Helm Chart Structure

*   **`middleware` Chart (`infra/helm/middleware`)**
    *   **Stateful Services:** PostgreSQL (Primary DB), TigerBeetle (Ledger), Redis (Cache/State), MinIO (Lakehouse Storage).
    *   **Event Streaming:** Kafka (Event Bus), Fluvio (Real-time Payment Streaming).
    *   **Orchestration & Auth:** Temporal (Workflows), Keycloak (Identity), Permify (ReBAC Authorization).
    *   **API Gateway:** APISIX + OpenAppSec WAF.
*   **`tourismpay` Chart (`infra/helm/tourismpay`)**
    *   **Stateless Services:** TypeScript Node.js Server, Go eNaira Gateway, Go Settlement Service, Rust KYC Service, Python ML Services.
    *   **Sidecars:** Dapr injected into all application pods for pub/sub and state management.

---

## 2. Pre-Deployment Prerequisites

Before executing the deployment, ensure the following prerequisites are met:

1.  **Kubernetes Cluster:** A highly available cluster (EKS, GKE, or AKS) running Kubernetes v1.28 or newer.
2.  **Storage Classes:** A default `StorageClass` supporting dynamic provisioning (e.g., `gp3` on AWS, `pd-ssd` on GCP) for stateful workloads.
3.  **Helm:** Helm v3.14+ installed on the deployment machine.
4.  **Dapr Operator:** The Dapr control plane must be installed on the cluster.
    ```bash
    helm repo add dapr https://dapr.github.io/helm-charts/
    helm upgrade --install dapr dapr/dapr --version=1.13 --namespace dapr-system --create-namespace --wait
    ```
5.  **Secrets Management:** External secrets (e.g., AWS Secrets Manager, HashiCorp Vault) configured and synced to Kubernetes `Secret` objects.

---

## 3. Deployment Runbook

The deployment must be executed in a strict sequence to ensure dependencies are available before dependent services start.

### Phase 1: Deploy Middleware Stack

The middleware stack contains all stateful data stores and event buses.

1.  **Update Dependencies:**
    ```bash
    cd infra/helm/middleware
    helm dependency update
    ```
2.  **Dry Run & Validation:**
    ```bash
    helm upgrade --install tourismpay-middleware . \
      --namespace tourismpay-system --create-namespace \
      --values values.yaml \
      --dry-run --debug
    ```
3.  **Execute Deployment:**
    ```bash
    helm upgrade --install tourismpay-middleware . \
      --namespace tourismpay-system --create-namespace \
      --values values.yaml \
      --wait --timeout 10m
    ```
4.  **Verification:**
    Ensure all stateful sets and deployments are running:
    ```bash
    kubectl get pods -n tourismpay-system
    # Verify TigerBeetle cluster formation
    kubectl logs -l app=tigerbeetle -n tourismpay-system
    ```

### Phase 2: Initialize Permify Schema

Before application services start, the Permify ReBAC schema must be written to the Permify server.

1.  **Execute Schema Job:**
    The middleware chart includes a post-install job that runs the Permify CLI to write the schema located in `scripts/permify/schema.perm`.
2.  **Verify Job Completion:**
    ```bash
    kubectl get jobs -n tourismpay-system -l app=permify-init
    # Should show 1/1 completions
    ```

### Phase 3: Execute Database Migrations

Run the Drizzle ORM migrations to ensure the PostgreSQL schema is up to date, including the new `0076_enaira_cbdc_fluvio.sql` migration.

1.  **Run Migration Job:**
    ```bash
    # Assuming a migration job template exists or running an ephemeral pod
    kubectl run drizzle-migrate --image=tourismpay/server:latest \
      --namespace tourismpay-system \
      --env="DATABASE_URL=$(kubectl get secret pg-credentials -n tourismpay-system -o jsonpath='{.data.url}' | base64 -d)" \
      --restart=Never -- pnpm run db:migrate
    ```
2.  **Verify Completion:**
    ```bash
    kubectl logs drizzle-migrate -n tourismpay-system
    kubectl delete pod drizzle-migrate -n tourismpay-system
    ```

### Phase 4: Deploy TourismPay Applications

Deploy the stateless application services.

1.  **Update Dependencies:**
    ```bash
    cd ../tourismpay
    helm dependency update
    ```
2.  **Execute Deployment:**
    ```bash
    helm upgrade --install tourismpay-apps . \
      --namespace tourismpay-apps --create-namespace \
      --values values.yaml \
      --wait --timeout 5m
    ```
3.  **Verify Dapr Injection:**
    Ensure all application pods have 2 containers (the app and the `daprd` sidecar).
    ```bash
    kubectl get pods -n tourismpay-apps
    # READY column should show 2/2
    ```

---

## 4. Post-Deployment Validation

After deployment, run the integration test suites to validate the environment.

1.  **Run eNaira Gateway Tests:**
    ```bash
    kubectl exec -it deploy/enaira-gateway -n tourismpay-apps -- go test -tags=integration ./tests/integration/...
    ```
2.  **Run Python Lakehouse Tests:**
    ```bash
    kubectl exec -it deploy/python-services -n tourismpay-apps -- pytest tests/
    ```
3.  **Validate APISIX Routing:**
    ```bash
    curl -I https://api.tourismpay.com/health
    # Expected: 200 OK
    ```

---

## 5. Rollback Procedures

If critical failures are detected during or immediately after deployment, execute the following rollback steps.

### 5.1 Rollback Application Services (Stateless)

If the issue is isolated to the application logic (e.g., eNaira gateway bugs, tRPC router errors):

1.  **Identify Previous Revision:**
    ```bash
    helm history tourismpay-apps -n tourismpay-apps
    ```
2.  **Execute Rollback:**
    ```bash
    # Replace <REVISION_NUMBER> with the last known good revision
    helm rollback tourismpay-apps <REVISION_NUMBER> -n tourismpay-apps --wait
    ```

### 5.2 Rollback Middleware (Stateful) - *High Risk*

**WARNING:** Rolling back middleware involves stateful data stores. Downgrading database schemas or ledger formats can lead to data corruption.

1.  **Database Schema Reversal:**
    If the Drizzle migration `0076` caused issues, it must be manually reverted using custom SQL, as Drizzle does not natively support automated `down` migrations in production.
2.  **Rollback Helm Release:**
    ```bash
    helm rollback tourismpay-middleware <REVISION_NUMBER> -n tourismpay-system --wait
    ```

### 5.3 Emergency Traffic Drain (APISIX)

If a severe security vulnerability is detected (e.g., Permify authorization bypass), block all external traffic immediately via APISIX.

```bash
# Apply a global deny-all plugin configuration to APISIX
kubectl apply -f infra/apisix/emergency-block.yaml -n tourismpay-system
```

---

## 6. Monitoring & Observability

Post-deployment, monitor the following critical metrics via Grafana and Prometheus:

| Component | Critical Metrics to Monitor | Alert Threshold |
| :--- | :--- | :--- |
| **eNaira Gateway** | HTTP 5xx Rate, CBN API Latency | >1% 5xx, Latency >2s |
| **Permify** | Check API Latency, Cache Hit Ratio | Latency >50ms |
| **TigerBeetle** | Commit Latency, Disk I/O Wait | Latency >10ms |
| **Fluvio** | Consumer Lag (eNaira Stream) | Lag >1000 messages |
| **Dapr** | Sidecar CPU/Memory, Pub/Sub Drop Rate | OOMKills, Drop >0 |

*End of Runbook*
