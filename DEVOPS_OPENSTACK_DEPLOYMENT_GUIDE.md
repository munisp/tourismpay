# Unified Insurance Platform - OpenStack On-Premise Deployment Guide

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [OpenStack Infrastructure Requirements](#openstack-infrastructure-requirements)
3. [Prerequisites](#prerequisites)
4. [OpenStack Environment Setup](#openstack-environment-setup)
5. [Kubernetes on OpenStack](#kubernetes-on-openstack)
6. [Storage Configuration](#storage-configuration)
7. [Networking Setup](#networking-setup)
8. [Container Registry Setup](#container-registry-setup)
9. [Middleware Stack Deployment](#middleware-stack-deployment)
10. [Application Services Deployment](#application-services-deployment)
11. [Database Setup](#database-setup)
12. [Monitoring & Observability](#monitoring--observability)
13. [CI/CD Pipeline](#cicd-pipeline)
14. [Security Configuration](#security-configuration)
15. [Scaling & High Availability](#scaling--high-availability)
16. [Disaster Recovery](#disaster-recovery)
17. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

The Unified Insurance Platform consists of 58 microservices integrated with a robust middleware stack, deployed on OpenStack private cloud infrastructure.

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

## OpenStack Infrastructure Requirements

### OpenStack Services Required
| Service | Component | Purpose |
|---------|-----------|---------|
| Nova | Compute | Virtual machine provisioning |
| Neutron | Networking | Network management, load balancing |
| Cinder | Block Storage | Persistent volumes for databases |
| Swift | Object Storage | Document storage, backups |
| Glance | Image | VM and container images |
| Keystone | Identity | Authentication and authorization |
| Heat | Orchestration | Infrastructure as Code |
| Octavia | Load Balancer | External load balancing |
| Magnum | Container Orchestration | Kubernetes cluster management |
| Barbican | Key Management | Secrets management |

### Minimum Hardware Requirements

| Component | Specification | Quantity |
|-----------|--------------|----------|
| Controller Nodes | 8 cores, 32GB RAM, 500GB SSD | 3 |
| Compute Nodes | 32 cores, 128GB RAM, 1TB NVMe | 6+ |
| Storage Nodes | 8 cores, 32GB RAM, 10TB HDD + 500GB SSD | 3+ |
| Network | 10Gbps internal, 1Gbps external | - |

### Recommended Production Setup

| Component | Specification | Quantity |
|-----------|--------------|----------|
| Controller Nodes | 16 cores, 64GB RAM, 1TB NVMe | 3 |
| Compute Nodes | 64 cores, 256GB RAM, 2TB NVMe | 12+ |
| Storage Nodes | 16 cores, 64GB RAM, 50TB HDD + 2TB NVMe | 6+ |
| Network | 25Gbps internal, 10Gbps external | - |

---

## Prerequisites

### Required Tools

```bash
# Install OpenStack CLI
pip install python-openstackclient python-magnumclient python-octaviaclient python-heatclient

# Install kubectl
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl

# Install Helm 3
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

# Install Terraform with OpenStack provider
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

### OpenStack Credentials Setup

```bash
# Create OpenStack RC file (clouds.yaml)
mkdir -p ~/.config/openstack

cat > ~/.config/openstack/clouds.yaml << 'EOF'
clouds:
  insurance-platform:
    auth:
      auth_url: https://openstack.yourdomain.com:5000/v3
      username: admin
      password: <your-password>
      project_name: insurance-platform
      project_domain_name: Default
      user_domain_name: Default
    region_name: RegionOne
    interface: public
    identity_api_version: 3
EOF

# Set environment
export OS_CLOUD=insurance-platform

# Verify connection
openstack token issue
```

---

## OpenStack Environment Setup

### Step 1: Create Project and Users

```bash
# Create project
openstack project create --description "Insurance Platform Production" insurance-platform

# Create service account
openstack user create --project insurance-platform --password <secure-password> insurance-admin
openstack role add --project insurance-platform --user insurance-admin admin

# Create application users
openstack user create --project insurance-platform --password <secure-password> k8s-admin
openstack role add --project insurance-platform --user k8s-admin member
```

### Step 2: Configure Quotas

```bash
# Set compute quotas
openstack quota set \
  --instances 100 \
  --cores 500 \
  --ram 1024000 \
  --volumes 200 \
  --gigabytes 10000 \
  --floating-ips 50 \
  --secgroups 100 \
  --secgroup-rules 500 \
  insurance-platform
```

### Step 3: Upload Base Images

```bash
# Download Ubuntu 22.04 cloud image
wget https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-amd64.img

# Upload to Glance
openstack image create \
  --disk-format qcow2 \
  --container-format bare \
  --public \
  --file jammy-server-cloudimg-amd64.img \
  ubuntu-22.04

# Download Fedora CoreOS for Kubernetes nodes
wget https://builds.coreos.fedoraproject.org/prod/streams/stable/builds/39.20231101.3.0/x86_64/fedora-coreos-39.20231101.3.0-openstack.x86_64.qcow2.xz
xz -d fedora-coreos-39.20231101.3.0-openstack.x86_64.qcow2.xz

openstack image create \
  --disk-format qcow2 \
  --container-format bare \
  --public \
  --file fedora-coreos-39.20231101.3.0-openstack.x86_64.qcow2 \
  fedora-coreos-39
```

---

## Kubernetes on OpenStack

### Option 1: OpenStack Magnum (Recommended)

```bash
# Create cluster template
openstack coe cluster template create k8s-template \
  --image fedora-coreos-39 \
  --keypair insurance-keypair \
  --external-network external \
  --fixed-network insurance-network \
  --fixed-subnet insurance-subnet \
  --dns-nameserver 8.8.8.8 \
  --flavor m1.xlarge \
  --master-flavor m1.xlarge \
  --docker-volume-size 100 \
  --network-driver flannel \
  --coe kubernetes \
  --labels kube_dashboard_enabled=true,ingress_controller=nginx,cinder_csi_enabled=true,cloud_provider_enabled=true

# Create Kubernetes cluster
openstack coe cluster create insurance-k8s \
  --cluster-template k8s-template \
  --master-count 3 \
  --node-count 6 \
  --master-flavor m1.2xlarge \
  --flavor m1.4xlarge \
  --keypair insurance-keypair

# Wait for cluster creation (15-30 minutes)
openstack coe cluster show insurance-k8s

# Get kubeconfig
openstack coe cluster config insurance-k8s --dir ~/.kube
export KUBECONFIG=~/.kube/config

# Verify cluster
kubectl get nodes
```

### Option 2: Manual Kubernetes Installation with Kubespray

```bash
# Clone Kubespray
git clone https://github.com/kubernetes-sigs/kubespray.git
cd kubespray

# Install requirements
pip install -r requirements.txt

# Create inventory from OpenStack
cp -rfp inventory/sample inventory/insurance-platform

# Configure OpenStack dynamic inventory
cat > inventory/insurance-platform/openstack.yml << 'EOF'
plugin: openstack.cloud.openstack
expand_hostvars: yes
fail_on_errors: yes
clouds:
  - insurance-platform
groups:
  kube_control_plane: "'k8s-master' in name"
  etcd: "'k8s-master' in name"
  kube_node: "'k8s-worker' in name"
  k8s_cluster:
    children:
      - kube_control_plane
      - kube_node
EOF

# Create VMs using Heat template
cat > k8s-infrastructure.yaml << 'EOF'
heat_template_version: 2021-04-16
description: Kubernetes Infrastructure for Insurance Platform

parameters:
  key_name:
    type: string
    default: insurance-keypair
  master_flavor:
    type: string
    default: m1.2xlarge
  worker_flavor:
    type: string
    default: m1.4xlarge
  image:
    type: string
    default: ubuntu-22.04
  network:
    type: string
    default: insurance-network
  master_count:
    type: number
    default: 3
  worker_count:
    type: number
    default: 6

resources:
  master_group:
    type: OS::Heat::ResourceGroup
    properties:
      count: { get_param: master_count }
      resource_def:
        type: OS::Nova::Server
        properties:
          name: k8s-master-%index%
          flavor: { get_param: master_flavor }
          image: { get_param: image }
          key_name: { get_param: key_name }
          networks:
            - network: { get_param: network }
          block_device_mapping_v2:
            - boot_index: 0
              delete_on_termination: true
              volume_size: 100
              image: { get_param: image }

  worker_group:
    type: OS::Heat::ResourceGroup
    properties:
      count: { get_param: worker_count }
      resource_def:
        type: OS::Nova::Server
        properties:
          name: k8s-worker-%index%
          flavor: { get_param: worker_flavor }
          image: { get_param: image }
          key_name: { get_param: key_name }
          networks:
            - network: { get_param: network }
          block_device_mapping_v2:
            - boot_index: 0
              delete_on_termination: true
              volume_size: 200
              image: { get_param: image }

outputs:
  master_ips:
    value: { get_attr: [master_group, first_address] }
  worker_ips:
    value: { get_attr: [worker_group, first_address] }
EOF

# Deploy infrastructure
openstack stack create -t k8s-infrastructure.yaml insurance-k8s-infra

# Run Kubespray
ansible-playbook -i inventory/insurance-platform/openstack.yml \
  --become --become-user=root \
  cluster.yml
```

### Create Namespaces

```bash
kubectl create namespace insurance-platform
kubectl create namespace middleware
kubectl create namespace monitoring
kubectl create namespace ingress
kubectl create namespace registry
```

---

## Storage Configuration

### Cinder Storage Class for Kubernetes

```bash
# Create Cinder storage class for general workloads
cat <<EOF | kubectl apply -f -
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: cinder-standard
  annotations:
    storageclass.kubernetes.io/is-default-class: "true"
provisioner: cinder.csi.openstack.org
parameters:
  type: standard
reclaimPolicy: Delete
allowVolumeExpansion: true
volumeBindingMode: WaitForFirstConsumer
---
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: cinder-ssd
provisioner: cinder.csi.openstack.org
parameters:
  type: ssd
reclaimPolicy: Delete
allowVolumeExpansion: true
volumeBindingMode: WaitForFirstConsumer
---
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: cinder-high-iops
provisioner: cinder.csi.openstack.org
parameters:
  type: high-iops
reclaimPolicy: Retain
allowVolumeExpansion: true
volumeBindingMode: WaitForFirstConsumer
EOF
```

### Configure Cinder CSI Driver

```bash
# Install OpenStack Cloud Provider
helm repo add cpo https://kubernetes.github.io/cloud-provider-openstack
helm install openstack-cinder-csi cpo/openstack-cinder-csi \
  --namespace kube-system \
  --set secret.enabled=true \
  --set secret.create=true \
  --set secret.name=cloud-config \
  --set-file secret.data.cloud-conf=/etc/kubernetes/cloud-config

# Create cloud-config secret
cat > /tmp/cloud-config << 'EOF'
[Global]
auth-url=https://openstack.yourdomain.com:5000/v3
username=k8s-admin
password=<your-password>
region=RegionOne
tenant-name=insurance-platform
domain-name=Default

[BlockStorage]
bs-version=v3
ignore-volume-az=true
EOF

kubectl create secret generic cloud-config \
  --from-file=cloud.conf=/tmp/cloud-config \
  -n kube-system
```

### Swift Object Storage Configuration

```bash
# Create Swift container for documents
openstack container create insurance-documents --public
openstack container create insurance-backups
openstack container create insurance-lakehouse

# Configure S3-compatible access (if using RadosGW or Swift S3 API)
cat > /tmp/swift-credentials << 'EOF'
[default]
aws_access_key_id = <swift-access-key>
aws_secret_access_key = <swift-secret-key>
EOF

# Create Kubernetes secret for Swift/S3 access
kubectl create secret generic swift-credentials \
  --namespace insurance-platform \
  --from-literal=access-key=<swift-access-key> \
  --from-literal=secret-key=<swift-secret-key> \
  --from-literal=endpoint=https://swift.yourdomain.com:8080/swift/v1
```

---

## Networking Setup

### Create Networks with Neutron

```bash
# Create internal network
openstack network create insurance-network

# Create subnet
openstack subnet create insurance-subnet \
  --network insurance-network \
  --subnet-range 10.10.0.0/16 \
  --gateway 10.10.0.1 \
  --dns-nameserver 8.8.8.8 \
  --dns-nameserver 8.8.4.4

# Create router
openstack router create insurance-router
openstack router set insurance-router --external-gateway external
openstack router add subnet insurance-router insurance-subnet

# Create security groups
openstack security group create insurance-k8s-master
openstack security group rule create --protocol tcp --dst-port 6443 insurance-k8s-master
openstack security group rule create --protocol tcp --dst-port 2379:2380 insurance-k8s-master
openstack security group rule create --protocol tcp --dst-port 10250:10252 insurance-k8s-master

openstack security group create insurance-k8s-worker
openstack security group rule create --protocol tcp --dst-port 10250 insurance-k8s-worker
openstack security group rule create --protocol tcp --dst-port 30000:32767 insurance-k8s-worker
```

### Configure Octavia Load Balancer

```bash
# Create load balancer for Kubernetes API
openstack loadbalancer create \
  --name insurance-k8s-api-lb \
  --vip-subnet-id insurance-subnet \
  --wait

# Create listener
openstack loadbalancer listener create \
  --name k8s-api-listener \
  --protocol TCP \
  --protocol-port 6443 \
  --loadbalancer insurance-k8s-api-lb \
  --wait

# Create pool
openstack loadbalancer pool create \
  --name k8s-api-pool \
  --protocol TCP \
  --lb-algorithm ROUND_ROBIN \
  --listener k8s-api-listener \
  --wait

# Add master nodes to pool
for i in 0 1 2; do
  MASTER_IP=$(openstack server show k8s-master-$i -f value -c addresses | grep -oP '10\.10\.\d+\.\d+')
  openstack loadbalancer member create \
    --name k8s-master-$i \
    --address $MASTER_IP \
    --protocol-port 6443 \
    k8s-api-pool \
    --wait
done

# Create floating IP for load balancer
openstack floating ip create external
FLOATING_IP=$(openstack floating ip list -f value -c "Floating IP Address" | head -1)
openstack loadbalancer set --vip-address $FLOATING_IP insurance-k8s-api-lb
```

### Ingress Controller with Octavia

```bash
# Install NGINX Ingress with OpenStack Load Balancer
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress \
  --set controller.service.type=LoadBalancer \
  --set controller.service.annotations."loadbalancer\.openstack\.org/floating-network-id"=<external-network-id> \
  --set controller.service.annotations."loadbalancer\.openstack\.org/flavor-id"=<lb-flavor-id> \
  --set controller.replicaCount=3
```

---

## Container Registry Setup

### Option 1: Harbor Registry (Recommended)

```bash
# Create VM for Harbor
openstack server create \
  --flavor m1.xlarge \
  --image ubuntu-22.04 \
  --network insurance-network \
  --security-group default \
  --key-name insurance-keypair \
  harbor-registry

# SSH into Harbor VM and install
ssh ubuntu@<harbor-ip>

# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.23.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Download and install Harbor
wget https://github.com/goharbor/harbor/releases/download/v2.9.0/harbor-offline-installer-v2.9.0.tgz
tar xvf harbor-offline-installer-v2.9.0.tgz
cd harbor

# Configure Harbor
cp harbor.yml.tmpl harbor.yml
# Edit harbor.yml with your settings:
# - hostname: registry.yourdomain.com
# - https certificate paths
# - admin password

# Install Harbor
./install.sh --with-trivy --with-chartmuseum

# Create project for insurance platform
# Access Harbor UI at https://registry.yourdomain.com
# Create project: insurance-platform
```

### Option 2: Docker Registry

```bash
# Deploy Docker Registry on Kubernetes
cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: docker-registry
  namespace: registry
spec:
  replicas: 2
  selector:
    matchLabels:
      app: docker-registry
  template:
    metadata:
      labels:
        app: docker-registry
    spec:
      containers:
      - name: registry
        image: registry:2
        ports:
        - containerPort: 5000
        env:
        - name: REGISTRY_STORAGE
          value: swift
        - name: REGISTRY_STORAGE_SWIFT_AUTHURL
          value: https://openstack.yourdomain.com:5000/v3
        - name: REGISTRY_STORAGE_SWIFT_USERNAME
          valueFrom:
            secretKeyRef:
              name: swift-credentials
              key: username
        - name: REGISTRY_STORAGE_SWIFT_PASSWORD
          valueFrom:
            secretKeyRef:
              name: swift-credentials
              key: password
        - name: REGISTRY_STORAGE_SWIFT_CONTAINER
          value: docker-registry
        volumeMounts:
        - name: certs
          mountPath: /certs
      volumes:
      - name: certs
        secret:
          secretName: registry-tls
---
apiVersion: v1
kind: Service
metadata:
  name: docker-registry
  namespace: registry
spec:
  selector:
    app: docker-registry
  ports:
  - port: 5000
    targetPort: 5000
EOF
```

### Configure Kubernetes to Use Private Registry

```bash
# Create registry secret
kubectl create secret docker-registry regcred \
  --namespace insurance-platform \
  --docker-server=registry.yourdomain.com \
  --docker-username=admin \
  --docker-password=<password> \
  --docker-email=admin@yourdomain.com

# Patch default service account
kubectl patch serviceaccount default \
  -n insurance-platform \
  -p '{"imagePullSecrets": [{"name": "regcred"}]}'
```

---

## Middleware Stack Deployment

### 1. Apache Kafka (Strimzi Operator)

```bash
# Install Strimzi Operator
kubectl create namespace kafka
kubectl apply -f 'https://strimzi.io/install/latest?namespace=kafka' -n kafka

# Deploy Kafka Cluster with Cinder storage
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
      class: cinder-ssd
  zookeeper:
    replicas: 3
    storage:
      type: persistent-claim
      size: 50Gi
      class: cinder-ssd
  entityOperator:
    topicOperator: {}
    userOperator: {}
EOF

# Create Kafka Topics
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
# Install Redis using Helm with Cinder storage
helm repo add bitnami https://charts.bitnami.com/bitnami
helm install redis bitnami/redis-cluster \
  --namespace middleware \
  --set cluster.nodes=6 \
  --set cluster.replicas=1 \
  --set persistence.size=10Gi \
  --set persistence.storageClass=cinder-ssd \
  --set password=<secure-password>
```

### 3. Temporal Cluster

```bash
# Install Temporal using Helm with Cinder storage
helm repo add temporal https://go.temporal.io/helm-charts
helm install temporal temporal/temporal \
  --namespace middleware \
  --set server.replicaCount=3 \
  --set cassandra.config.cluster_size=3 \
  --set cassandra.persistence.storageClass=cinder-ssd \
  --set prometheus.enabled=true \
  --set grafana.enabled=true \
  --set elasticsearch.enabled=true \
  --set elasticsearch.persistence.storageClass=cinder-ssd
```

### 4. TigerBeetle

```bash
# Deploy TigerBeetle StatefulSet with Cinder high-IOPS storage
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
      storageClassName: cinder-high-iops
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

### 5. Apache Iceberg (Lakehouse) with Swift Storage

```bash
# Deploy Iceberg REST Catalog with Swift backend
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
          value: "swift://insurance-lakehouse/warehouse"
        - name: CATALOG_IO__IMPL
          value: "org.apache.iceberg.hadoop.HadoopFileIO"
        - name: SWIFT_AUTH_URL
          value: "https://openstack.yourdomain.com:5000/v3"
        - name: SWIFT_USERNAME
          valueFrom:
            secretKeyRef:
              name: swift-credentials
              key: username
        - name: SWIFT_PASSWORD
          valueFrom:
            secretKeyRef:
              name: swift-credentials
              key: password
        - name: SWIFT_PROJECT_NAME
          value: "insurance-platform"
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
# Set registry (use your Harbor or private registry)
export REGISTRY=registry.yourdomain.com/insurance-platform

# Login to registry
docker login registry.yourdomain.com

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

# Continue for all 58 services...
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
      imagePullSecrets:
      - name: regcred
      containers:
      - name: customer-portal
        image: registry.yourdomain.com/insurance-platform/customer-portal:latest
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
        - name: SWIFT_AUTH_URL
          value: "https://openstack.yourdomain.com:5000/v3"
        - name: SWIFT_CONTAINER
          value: "insurance-documents"
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

### Create Ingress for External Access

```bash
cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: insurance-platform-ingress
  namespace: insurance-platform
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  tls:
  - hosts:
    - portal.yourdomain.com
    - api.yourdomain.com
    secretName: insurance-tls
  rules:
  - host: portal.yourdomain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: customer-portal
            port:
              number: 3000
  - host: api.yourdomain.com
    http:
      paths:
      - path: /claims
        pathType: Prefix
        backend:
          service:
            name: claims-adjudication
            port:
              number: 8001
      - path: /policies
        pathType: Prefix
        backend:
          service:
            name: policy-workflow
            port:
              number: 8002
      - path: /kyc
        pathType: Prefix
        backend:
          service:
            name: kyc-orchestrator
            port:
              number: 8003
EOF
```

---

## Database Setup

### PostgreSQL HA with Cinder Storage

```bash
# Install PostgreSQL HA using Helm
helm install postgresql bitnami/postgresql-ha \
  --namespace insurance-platform \
  --set postgresql.replicaCount=3 \
  --set postgresql.password=<secure-password> \
  --set postgresql.database=insurance \
  --set persistence.size=100Gi \
  --set persistence.storageClass=cinder-ssd \
  --set pgpool.replicaCount=2

# Run migrations
kubectl run migrations --rm -it --restart=Never \
  --namespace insurance-platform \
  --image=registry.yourdomain.com/insurance-platform/migrations:latest \
  --env="DATABASE_URL=postgresql://user:password@postgresql-ha-pgpool:5432/insurance" \
  -- npm run migrate
```

### Database Initialization

```bash
# Connect to PostgreSQL
kubectl exec -it postgresql-ha-postgresql-0 -n insurance-platform -- psql -U postgres

# Create databases
CREATE DATABASE customer_portal;
CREATE DATABASE claims_service;
CREATE DATABASE kyc_service;
CREATE DATABASE fraud_database;
CREATE DATABASE telco_service;

# Create users
CREATE USER app_user WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE customer_portal TO app_user;
GRANT ALL PRIVILEGES ON DATABASE claims_service TO app_user;
GRANT ALL PRIVILEGES ON DATABASE kyc_service TO app_user;
GRANT ALL PRIVILEGES ON DATABASE fraud_database TO app_user;
GRANT ALL PRIVILEGES ON DATABASE telco_service TO app_user;
```

---

## Monitoring & Observability

### Prometheus & Grafana Stack

```bash
# Install kube-prometheus-stack with Cinder storage
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --set grafana.adminPassword=<admin-password> \
  --set prometheus.prometheusSpec.retention=30d \
  --set prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.storageClassName=cinder-ssd \
  --set prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.resources.requests.storage=100Gi \
  --set alertmanager.alertmanagerSpec.storage.volumeClaimTemplate.spec.storageClassName=cinder-ssd
```

### Jaeger (Distributed Tracing)

```bash
# Install Jaeger Operator
kubectl create namespace observability
kubectl apply -f https://github.com/jaegertracing/jaeger-operator/releases/download/v1.50.0/jaeger-operator.yaml -n observability

# Deploy Jaeger with Cinder storage
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
      storage:
        storageClassName: cinder-ssd
        size: 50Gi
      resources:
        requests:
          cpu: 1
          memory: 4Gi
EOF
```

### Loki (Log Aggregation)

```bash
# Install Loki Stack with Cinder storage
helm install loki grafana/loki-stack \
  --namespace monitoring \
  --set promtail.enabled=true \
  --set loki.persistence.enabled=true \
  --set loki.persistence.storageClassName=cinder-ssd \
  --set loki.persistence.size=50Gi
```

---

## CI/CD Pipeline

### GitLab CI/CD (On-Premise)

```yaml
# .gitlab-ci.yml
stages:
  - build
  - test
  - deploy

variables:
  REGISTRY: registry.yourdomain.com/insurance-platform
  DOCKER_TLS_CERTDIR: ""

build:
  stage: build
  image: docker:24.0
  services:
    - docker:24.0-dind
  before_script:
    - docker login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD $REGISTRY
  script:
    - docker build -t $REGISTRY/customer-portal:$CI_COMMIT_SHA ./customer-portal-full
    - docker push $REGISTRY/customer-portal:$CI_COMMIT_SHA
    - docker tag $REGISTRY/customer-portal:$CI_COMMIT_SHA $REGISTRY/customer-portal:latest
    - docker push $REGISTRY/customer-portal:latest
  only:
    - main

test:
  stage: test
  image: node:22
  script:
    - cd customer-portal-full
    - npm ci
    - npm run test
    - npm run lint
  only:
    - main
    - merge_requests

deploy:
  stage: deploy
  image: bitnami/kubectl:latest
  before_script:
    - kubectl config set-cluster insurance-k8s --server=$KUBE_SERVER --certificate-authority=$KUBE_CA
    - kubectl config set-credentials deployer --token=$KUBE_TOKEN
    - kubectl config set-context insurance --cluster=insurance-k8s --user=deployer
    - kubectl config use-context insurance
  script:
    - kubectl set image deployment/customer-portal customer-portal=$REGISTRY/customer-portal:$CI_COMMIT_SHA -n insurance-platform
    - kubectl rollout status deployment/customer-portal -n insurance-platform
  only:
    - main
  environment:
    name: production
```

### Jenkins Pipeline (Alternative)

```groovy
// Jenkinsfile
pipeline {
    agent any
    
    environment {
        REGISTRY = 'registry.yourdomain.com/insurance-platform'
        KUBECONFIG = credentials('kubeconfig')
    }
    
    stages {
        stage('Build') {
            steps {
                script {
                    docker.withRegistry("https://${REGISTRY}", 'registry-credentials') {
                        def app = docker.build("${REGISTRY}/customer-portal:${env.BUILD_NUMBER}", './customer-portal-full')
                        app.push()
                        app.push('latest')
                    }
                }
            }
        }
        
        stage('Test') {
            steps {
                dir('customer-portal-full') {
                    sh 'npm ci'
                    sh 'npm run test'
                    sh 'npm run lint'
                }
            }
        }
        
        stage('Deploy') {
            steps {
                sh """
                    kubectl --kubeconfig=${KUBECONFIG} set image deployment/customer-portal \
                        customer-portal=${REGISTRY}/customer-portal:${env.BUILD_NUMBER} \
                        -n insurance-platform
                    kubectl --kubeconfig=${KUBECONFIG} rollout status deployment/customer-portal \
                        -n insurance-platform
                """
            }
        }
    }
}
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

### Barbican Secrets Management

```bash
# Store secrets in Barbican
openstack secret store \
  --name db-password \
  --payload-content-type text/plain \
  --payload <secure-password>

openstack secret store \
  --name jwt-secret \
  --payload-content-type text/plain \
  --payload <jwt-secret>

# Use External Secrets Operator to sync with Kubernetes
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets external-secrets/external-secrets \
  --namespace external-secrets \
  --create-namespace

# Create SecretStore for Barbican
cat <<EOF | kubectl apply -f -
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: barbican
  namespace: insurance-platform
spec:
  provider:
    barbican:
      auth:
        secretRef:
          authURL: https://openstack.yourdomain.com:5000/v3
          username:
            name: openstack-credentials
            key: username
          password:
            name: openstack-credentials
            key: password
          projectName: insurance-platform
          domainName: Default
EOF
```

### Pod Security Standards

```bash
kubectl label namespace insurance-platform \
  pod-security.kubernetes.io/enforce=restricted \
  pod-security.kubernetes.io/audit=restricted \
  pod-security.kubernetes.io/warn=restricted
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

### OpenStack Instance Auto-Scaling with Heat

```yaml
# auto-scaling-group.yaml
heat_template_version: 2021-04-16
description: Auto-scaling group for Kubernetes workers

parameters:
  min_size:
    type: number
    default: 6
  max_size:
    type: number
    default: 20

resources:
  worker_group:
    type: OS::Heat::AutoScalingGroup
    properties:
      min_size: { get_param: min_size }
      max_size: { get_param: max_size }
      resource:
        type: OS::Nova::Server
        properties:
          flavor: m1.4xlarge
          image: ubuntu-22.04
          key_name: insurance-keypair
          networks:
            - network: insurance-network
          user_data:
            str_replace:
              template: |
                #!/bin/bash
                curl -sfL https://get.k3s.io | K3S_URL=https://$MASTER_IP:6443 K3S_TOKEN=$TOKEN sh -
              params:
                $MASTER_IP: { get_param: master_ip }
                $TOKEN: { get_param: k3s_token }

  scale_up_policy:
    type: OS::Heat::ScalingPolicy
    properties:
      adjustment_type: change_in_capacity
      auto_scaling_group_id: { get_resource: worker_group }
      cooldown: 300
      scaling_adjustment: 2

  scale_down_policy:
    type: OS::Heat::ScalingPolicy
    properties:
      adjustment_type: change_in_capacity
      auto_scaling_group_id: { get_resource: worker_group }
      cooldown: 300
      scaling_adjustment: -1

  cpu_alarm_high:
    type: OS::Aodh::GnocchiAggregationByResourcesAlarm
    properties:
      metric: cpu_util
      aggregation_method: mean
      granularity: 300
      evaluation_periods: 2
      threshold: 80
      comparison_operator: gt
      alarm_actions:
        - { get_attr: [scale_up_policy, signal_url] }
      resource_type: instance

  cpu_alarm_low:
    type: OS::Aodh::GnocchiAggregationByResourcesAlarm
    properties:
      metric: cpu_util
      aggregation_method: mean
      granularity: 300
      evaluation_periods: 5
      threshold: 30
      comparison_operator: lt
      alarm_actions:
        - { get_attr: [scale_down_policy, signal_url] }
      resource_type: instance
```

---

## Disaster Recovery

### Backup Strategy with Swift

```bash
# Install Velero with Swift backend
velero install \
  --provider openstack \
  --plugins velero/velero-plugin-for-openstack:v0.6.0 \
  --bucket insurance-backups \
  --backup-location-config region=RegionOne,authUrl=https://openstack.yourdomain.com:5000/v3 \
  --secret-file ./openstack-credentials

# Schedule daily backups
velero schedule create daily-backup \
  --schedule="0 2 * * *" \
  --include-namespaces insurance-platform,middleware \
  --ttl 720h
```

### Database Backup to Swift

```bash
# CronJob for PostgreSQL backup to Swift
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
              pg_dumpall -h postgresql-ha-pgpool -U postgres | gzip > /backup/backup-\$(date +%Y%m%d-%H%M%S).sql.gz
              swift upload insurance-backups /backup/*.gz --object-name postgres/backup-\$(date +%Y%m%d-%H%M%S).sql.gz
            env:
            - name: OS_AUTH_URL
              value: https://openstack.yourdomain.com:5000/v3
            - name: OS_USERNAME
              valueFrom:
                secretKeyRef:
                  name: swift-credentials
                  key: username
            - name: OS_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: swift-credentials
                  key: password
            - name: OS_PROJECT_NAME
              value: insurance-platform
            volumeMounts:
            - name: backup
              mountPath: /backup
          volumes:
          - name: backup
            emptyDir: {}
          restartPolicy: OnFailure
EOF
```

### Cross-Region Replication

```bash
# Configure Swift container replication
openstack container set \
  --sync-to https://swift-region2.yourdomain.com:8080/v1/AUTH_insurance-platform/insurance-backups \
  --sync-key <replication-key> \
  insurance-backups
```

---

## Troubleshooting

### Common Issues

**1. Pod CrashLoopBackOff**
```bash
kubectl logs <pod-name> -n insurance-platform --previous
kubectl describe pod <pod-name> -n insurance-platform
```

**2. Cinder Volume Issues**
```bash
# Check PVC status
kubectl get pvc -n insurance-platform

# Check Cinder volumes
openstack volume list --project insurance-platform

# Check CSI driver logs
kubectl logs -n kube-system -l app=csi-cinder-controllerplugin
```

**3. Network Connectivity Issues**
```bash
# Check Neutron ports
openstack port list --network insurance-network

# Check security groups
openstack security group rule list insurance-k8s-worker

# Test connectivity from pod
kubectl exec -it <pod-name> -n insurance-platform -- curl -v http://service-name:port
```

**4. Load Balancer Issues**
```bash
# Check Octavia load balancer status
openstack loadbalancer list
openstack loadbalancer show insurance-k8s-api-lb

# Check listener and pool
openstack loadbalancer listener list
openstack loadbalancer pool list
openstack loadbalancer member list k8s-api-pool
```

**5. Image Pull Errors**
```bash
# Check registry connectivity
kubectl run test-registry --rm -it --restart=Never \
  --image=busybox -- wget -O- https://registry.yourdomain.com/v2/

# Check image pull secrets
kubectl get secret regcred -n insurance-platform -o yaml
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

# OpenStack resource status
openstack server list --project insurance-platform
openstack volume list --project insurance-platform
openstack network list
```

---

## Environment Variables Reference

See `deployment/config/.env.template` for complete list of all environment variables required for each service.

### OpenStack-Specific Environment Variables

```bash
# OpenStack Authentication
OS_AUTH_URL=https://openstack.yourdomain.com:5000/v3
OS_USERNAME=k8s-admin
OS_PASSWORD=<password>
OS_PROJECT_NAME=insurance-platform
OS_USER_DOMAIN_NAME=Default
OS_PROJECT_DOMAIN_NAME=Default
OS_REGION_NAME=RegionOne

# Swift Object Storage
SWIFT_AUTH_URL=https://openstack.yourdomain.com:5000/v3
SWIFT_CONTAINER=insurance-documents
SWIFT_TEMP_URL_KEY=<temp-url-key>

# Cinder Block Storage
CINDER_VOLUME_TYPE=ssd

# Neutron Networking
NEUTRON_NETWORK_ID=<network-id>
NEUTRON_SUBNET_ID=<subnet-id>
```

---

## Support

For technical support:
- Documentation: https://docs.insureportal.ng
- Email: devops@insureportal.ng
- OpenStack Support: https://openstack.yourdomain.com/support
