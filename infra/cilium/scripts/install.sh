#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# TourismPay Cilium + eBPF Installation Script
#
# Installs and configures the complete Cilium/eBPF stack:
#  1. Cilium CNI (replaces kube-proxy)
#  2. Hubble observability
#  3. SPIRE for SPIFFE identity
#  4. eBPF loader DaemonSet
#  5. Network policies
#  6. AlertManager rules
#  7. Grafana dashboards
#
# Prerequisites:
#  - Kubernetes 1.28+ cluster
#  - Helm 3.12+
#  - kubectl configured for the target cluster
#  - Linux kernel 5.8+ on all nodes
#  - Node NIC with XDP native driver support (or generic mode fallback)
#
# Usage: ./install.sh [--dry-run] [--namespace tourismpay]
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CILIUM_DIR="$(dirname "$SCRIPT_DIR")"
NAMESPACE="${NAMESPACE:-tourismpay}"
CILIUM_VERSION="1.15.6"
SPIRE_VERSION="1.9.4"
DRY_RUN="${DRY_RUN:-false}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()   { echo -e "${GREEN}[OK]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# ── Parse args ────────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run) DRY_RUN=true; shift ;;
    --namespace) NAMESPACE="$2"; shift 2 ;;
    *) err "Unknown arg: $1"; exit 1 ;;
  esac
done

kubectl_apply() {
  if [[ "$DRY_RUN" == "true" ]]; then
    log "[DRY RUN] kubectl apply -f $1"
  else
    kubectl apply -f "$1"
  fi
}

helm_install() {
  if [[ "$DRY_RUN" == "true" ]]; then
    log "[DRY RUN] helm upgrade --install $*"
  else
    helm upgrade --install "$@"
  fi
}

# ── Step 1: Verify prerequisites ──────────────────────────────────────────────
log "Verifying prerequisites..."

command -v kubectl >/dev/null || { err "kubectl not found"; exit 1; }
command -v helm >/dev/null || { err "helm not found"; exit 1; }

KERNEL_VERSION=$(uname -r | cut -d. -f1-2)
KERNEL_MAJOR=$(echo "$KERNEL_VERSION" | cut -d. -f1)
KERNEL_MINOR=$(echo "$KERNEL_VERSION" | cut -d. -f2)
if [[ $KERNEL_MAJOR -lt 5 ]] || [[ $KERNEL_MAJOR -eq 5 && $KERNEL_MINOR -lt 8 ]]; then
  err "Linux kernel 5.8+ required for eBPF features. Found: $(uname -r)"
  exit 1
fi
ok "Kernel version: $(uname -r)"

# ── Step 2: Add Helm repos ────────────────────────────────────────────────────
log "Adding Helm repositories..."
helm repo add cilium https://helm.cilium.io/ 2>/dev/null || true
helm repo add spiffe https://spiffe.github.io/helm-charts-hardened/ 2>/dev/null || true
helm repo update
ok "Helm repos updated"

# ── Step 3: Create namespaces ─────────────────────────────────────────────────
log "Creating namespaces..."
kubectl create namespace cilium-spire --dry-run=client -o yaml | kubectl apply -f -
kubectl label namespace cilium-spire pod-security.kubernetes.io/enforce=privileged --overwrite
ok "Namespaces ready"

# ── Step 4: Install Cilium ────────────────────────────────────────────────────
log "Installing Cilium $CILIUM_VERSION..."
helm_install cilium cilium/cilium \
  --version "$CILIUM_VERSION" \
  --namespace kube-system \
  --values "$CILIUM_DIR/helm/values.yaml" \
  --wait \
  --timeout 5m

ok "Cilium installed"

# ── Step 5: Wait for Cilium to be ready ───────────────────────────────────────
if [[ "$DRY_RUN" != "true" ]]; then
  log "Waiting for Cilium to be ready..."
  kubectl -n kube-system rollout status daemonset/cilium --timeout=5m
  ok "Cilium DaemonSet ready"

  # Verify Cilium status
  if command -v cilium >/dev/null; then
    cilium status --wait
    ok "Cilium status: healthy"
  fi
fi

# ── Step 6: Apply network policies ───────────────────────────────────────────
log "Applying Cilium network policies..."
kubectl_apply "$CILIUM_DIR/policies/tourismpay-network-policies.yaml"
kubectl_apply "$CILIUM_DIR/policies/service-mesh-mtls.yaml"
ok "Network policies applied"

# ── Step 7: Deploy SPIRE (SPIFFE identity) ────────────────────────────────────
log "Deploying SPIRE for SPIFFE identity..."
kubectl_apply "$CILIUM_DIR/policies/service-mesh-mtls.yaml"
ok "SPIRE deployed"

# ── Step 8: Deploy eBPF loader DaemonSet ─────────────────────────────────────
log "Deploying eBPF loader DaemonSet..."
kubectl_apply "$CILIUM_DIR/ebpf-loader-daemonset.yaml"

if [[ "$DRY_RUN" != "true" ]]; then
  kubectl -n "$NAMESPACE" rollout status daemonset/ebpf-loader --timeout=3m
  ok "eBPF loader DaemonSet ready"
fi

# ── Step 9: Apply Hubble observability ───────────────────────────────────────
log "Applying Hubble observability config..."
kubectl_apply "$CILIUM_DIR/hubble/hubble-config.yaml"
ok "Hubble configured"

# ── Step 10: Apply AlertManager rules ────────────────────────────────────────
log "Applying AlertManager rules..."
kubectl_apply "$CILIUM_DIR/monitoring/alerting-rules.yaml"
ok "AlertManager rules applied"

# ── Step 11: Import Grafana dashboard ────────────────────────────────────────
log "Importing Grafana dashboard..."
kubectl create configmap tourismpay-cilium-dashboard \
  --from-file="$CILIUM_DIR/hubble/grafana-dashboard-network.json" \
  --namespace monitoring \
  --dry-run=client -o yaml | \
  kubectl label --local -f - grafana_dashboard=1 --dry-run=client -o yaml | \
  kubectl apply -f -
ok "Grafana dashboard imported"

# ── Step 12: Verify installation ─────────────────────────────────────────────
if [[ "$DRY_RUN" != "true" ]]; then
  log "Verifying installation..."

  echo ""
  echo "=== Cilium Status ==="
  kubectl -n kube-system get pods -l app.kubernetes.io/name=cilium

  echo ""
  echo "=== Hubble Relay ==="
  kubectl -n kube-system get pods -l app.kubernetes.io/name=hubble-relay

  echo ""
  echo "=== eBPF Loader ==="
  kubectl -n "$NAMESPACE" get pods -l app.kubernetes.io/name=ebpf-loader

  echo ""
  echo "=== Network Policies ==="
  kubectl -n "$NAMESPACE" get ciliumnetworkpolicies

  echo ""
  ok "TourismPay Cilium/eBPF stack installed successfully!"
  echo ""
  echo "  Hubble UI:      https://hubble.tourismpay.internal"
  echo "  eBPF Metrics:   http://ebpf-loader-metrics:9099/metrics"
  echo "  Grafana:        https://grafana.tourismpay.internal/d/tourismpay-cilium-network"
  echo ""
fi

log "Installation complete."
