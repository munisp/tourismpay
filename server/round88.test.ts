/**
 * Round 88 — Integration tests
 * 1. PaymentSwitchPortal page exists and exports a default component
 * 2. AppShell nav includes the PS Admin Portal entry
 * 3. App.tsx registers /paymentswitch/portal route
 * 4. HA config files exist for all 10 infrastructure services
 * 5. Kafka HA: 3 brokers, min ISR=2, replication=3
 * 6. Redis HA: sentinel quorum=2, 3 sentinel nodes
 * 7. Keycloak HA: 2 nodes, KC_CACHE=ispn
 * 8. TigerBeetle HA: 3 replicas, replica-count=3
 * 9. APISIX HA: 3-node etcd, 2 gateway nodes
 * 10. Permify HA: 2 nodes
 * 11. Fluvio HA: 3 SPU nodes
 * 12. Dapr HA: Redis Sentinel state store + Kafka pub/sub + circuit breaker
 * 13. Kubernetes: PodDisruptionBudgets + HPA + topologySpreadConstraints
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const root = join(__dirname, "..");

function readFile(rel: string) {
  return readFileSync(join(root, rel), "utf-8");
}

function fileExists(rel: string) {
  return existsSync(join(root, rel));
}

describe("Round 88: PS Portal + HA Configs", () => {
  // ── PaymentSwitchPortal page ────────────────────────────────────────────
  it("PaymentSwitchPortal page file exists", () => {
    expect(fileExists("client/src/pages/paymentswitch/PaymentSwitchPortal.tsx")).toBe(true);
  });

  it("PaymentSwitchPortal exports default function", () => {
    const src = readFile("client/src/pages/paymentswitch/PaymentSwitchPortal.tsx");
    expect(src).toContain("export default function PaymentSwitchPortal");
  });

  it("PaymentSwitchPortal renders an iframe with sandbox attribute", () => {
    const src = readFile("client/src/pages/paymentswitch/PaymentSwitchPortal.tsx");
    expect(src).toContain("<iframe");
    expect(src).toContain("sandbox=");
  });

  it("PaymentSwitchPortal has fullscreen toggle", () => {
    const src = readFile("client/src/pages/paymentswitch/PaymentSwitchPortal.tsx");
    expect(src).toContain("isFullscreen");
    expect(src).toContain("toggleFullscreen");
  });

  it("PaymentSwitchPortal has refresh and open-external actions", () => {
    const src = readFile("client/src/pages/paymentswitch/PaymentSwitchPortal.tsx");
    expect(src).toContain("handleRefresh");
    expect(src).toContain("handleOpenExternal");
  });

  // ── AppShell nav ────────────────────────────────────────────────────────
  it("AppShell includes PS Admin Portal nav item", () => {
    const src = readFile("client/src/components/layout/AppShell.tsx");
    expect(src).toContain("/paymentswitch/portal");
    expect(src).toContain("PS Admin Portal");
  });

  it("AppShell imports Monitor icon", () => {
    const src = readFile("client/src/components/layout/AppShell.tsx");
    expect(src).toContain("Monitor");
  });

  it("AppShell PS Admin Portal is role-restricted to admin and noc_operator", () => {
    const src = readFile("client/src/components/layout/AppShell.tsx");
    expect(src).toMatch(/PS Admin Portal.*noc_operator|noc_operator.*PS Admin Portal/s);
  });

  // ── App.tsx route ───────────────────────────────────────────────────────
  it("App.tsx registers /paymentswitch/portal route", () => {
    const src = readFile("client/src/App.tsx");
    expect(src).toContain('path="/paymentswitch/portal"');
    expect(src).toContain("PSPortal");
  });

  it("App.tsx imports PaymentSwitchPortal as PSPortal", () => {
    const src = readFile("client/src/App.tsx");
    expect(src).toContain('import PSPortal from "./pages/paymentswitch/PaymentSwitchPortal"');
  });

  // ── HA config files exist ───────────────────────────────────────────────
  const haServices = [
    "kafka", "redis", "keycloak", "temporal", "tigerbeetle",
    "apisix", "permify", "fluvio", "openappsec",
  ];

  haServices.forEach((svc) => {
    it(`HA config exists for ${svc}`, () => {
      expect(fileExists(`infra/ha/${svc}/docker-compose.yml`)).toBe(true);
    });
  });

  it("Kubernetes HA manifest exists", () => {
    expect(fileExists("infra/ha/kubernetes/tourismpay-deployment.yaml")).toBe(true);
  });

  it("Dapr components manifest exists", () => {
    expect(fileExists("infra/ha/dapr/components.yaml")).toBe(true);
  });

  it("HA README exists", () => {
    expect(fileExists("infra/ha/README.md")).toBe(true);
  });

  // ── Kafka HA specifics ──────────────────────────────────────────────────
  it("Kafka HA: 3 brokers configured", () => {
    const cfg = readFile("infra/ha/kafka/docker-compose.yml");
    expect(cfg).toContain("kafka-1");
    expect(cfg).toContain("kafka-2");
    expect(cfg).toContain("kafka-3");
  });

  it("Kafka HA: min ISR=2 and replication=3", () => {
    const cfg = readFile("infra/ha/kafka/docker-compose.yml");
    expect(cfg).toContain('KAFKA_MIN_INSYNC_REPLICAS: "2"');
    expect(cfg).toContain('KAFKA_DEFAULT_REPLICATION_FACTOR: "3"');
  });

  it("Kafka HA: KRaft mode (no ZooKeeper)", () => {
    const cfg = readFile("infra/ha/kafka/docker-compose.yml");
    expect(cfg).toContain("KAFKA_PROCESS_ROLES");
    expect(cfg).not.toContain("zookeeper");
  });

  // ── Redis HA specifics ──────────────────────────────────────────────────
  it("Redis HA: 3 sentinel nodes", () => {
    const cfg = readFile("infra/ha/redis/docker-compose.yml");
    expect(cfg).toContain("redis-sentinel-1");
    expect(cfg).toContain("redis-sentinel-2");
    expect(cfg).toContain("redis-sentinel-3");
  });

  it("Redis HA: sentinel quorum=2", () => {
    const cfg = readFile("infra/ha/redis/docker-compose.yml");
    expect(cfg).toContain("sentinel monitor mymaster redis-primary 6379 2");
  });

  it("Redis HA: primary + 2 replicas", () => {
    const cfg = readFile("infra/ha/redis/docker-compose.yml");
    expect(cfg).toContain("redis-primary");
    expect(cfg).toContain("redis-replica-1");
    expect(cfg).toContain("redis-replica-2");
  });

  // ── Keycloak HA specifics ───────────────────────────────────────────────
  it("Keycloak HA: 2 nodes", () => {
    const cfg = readFile("infra/ha/keycloak/docker-compose.yml");
    expect(cfg).toContain("keycloak-1");
    expect(cfg).toContain("keycloak-2");
  });

  it("Keycloak HA: uses ispn cache for clustering", () => {
    const cfg = readFile("infra/ha/keycloak/docker-compose.yml");
    expect(cfg).toContain("KC_CACHE: ispn");
  });

  it("Keycloak HA: nginx load balancer", () => {
    expect(fileExists("infra/ha/keycloak/nginx-keycloak.conf")).toBe(true);
    const cfg = readFile("infra/ha/keycloak/nginx-keycloak.conf");
    expect(cfg).toContain("upstream keycloak_backend");
    expect(cfg).toContain("least_conn");
  });

  // ── TigerBeetle HA specifics ────────────────────────────────────────────
  it("TigerBeetle HA: 3 replicas", () => {
    const cfg = readFile("infra/ha/tigerbeetle/docker-compose.yml");
    expect(cfg).toContain("tigerbeetle-0");
    expect(cfg).toContain("tigerbeetle-1");
    expect(cfg).toContain("tigerbeetle-2");
  });

  it("TigerBeetle HA: replica-count=3", () => {
    const cfg = readFile("infra/ha/tigerbeetle/docker-compose.yml");
    expect(cfg).toContain("--replica-count=3");
  });

  // ── APISIX HA specifics ─────────────────────────────────────────────────
  it("APISIX HA: 2 gateway nodes", () => {
    const cfg = readFile("infra/ha/apisix/docker-compose.yml");
    expect(cfg).toContain("apisix-1");
    expect(cfg).toContain("apisix-2");
  });

  it("APISIX HA: 3-node etcd cluster", () => {
    const cfg = readFile("infra/ha/apisix/docker-compose.yml");
    expect(cfg).toContain("etcd-1");
    expect(cfg).toContain("etcd-2");
    expect(cfg).toContain("etcd-3");
  });

  it("APISIX config has plugin list", () => {
    expect(fileExists("infra/ha/apisix/apisix-config.yaml")).toBe(true);
    const cfg = readFile("infra/ha/apisix/apisix-config.yaml");
    expect(cfg).toContain("jwt-auth");
    expect(cfg).toContain("limit-count");
  });

  // ── Kubernetes specifics ────────────────────────────────────────────────
  it("Kubernetes: PodDisruptionBudget for PWA", () => {
    const cfg = readFile("infra/ha/kubernetes/tourismpay-deployment.yaml");
    expect(cfg).toContain("PodDisruptionBudget");
    expect(cfg).toContain("tourismpay-pwa-pdb");
  });

  it("Kubernetes: HPA for PWA with CPU/memory metrics", () => {
    const cfg = readFile("infra/ha/kubernetes/tourismpay-deployment.yaml");
    expect(cfg).toContain("HorizontalPodAutoscaler");
    expect(cfg).toContain("averageUtilization: 70");
  });

  it("Kubernetes: topologySpreadConstraints for zone-aware scheduling", () => {
    const cfg = readFile("infra/ha/kubernetes/tourismpay-deployment.yaml");
    expect(cfg).toContain("topologySpreadConstraints");
    expect(cfg).toContain("topology.kubernetes.io/zone");
  });

  it("Kubernetes: PDB for BIS and PaymentSwitch", () => {
    const cfg = readFile("infra/ha/kubernetes/tourismpay-deployment.yaml");
    expect(cfg).toContain("bis-service-pdb");
    expect(cfg).toContain("payment-switch-pdb");
  });

  it("Kubernetes: Ingress with TLS", () => {
    const cfg = readFile("infra/ha/kubernetes/tourismpay-deployment.yaml");
    expect(cfg).toContain("Ingress");
    expect(cfg).toContain("cert-manager.io/cluster-issuer");
  });

  // ── Dapr specifics ──────────────────────────────────────────────────────
  it("Dapr: Redis Sentinel state store", () => {
    const cfg = readFile("infra/ha/dapr/components.yaml");
    expect(cfg).toContain("state.redis");
    expect(cfg).toContain("sentinelMasterName");
  });

  it("Dapr: Kafka pub/sub", () => {
    const cfg = readFile("infra/ha/dapr/components.yaml");
    expect(cfg).toContain("pubsub.kafka");
    expect(cfg).toContain("kafka-1:9092,kafka-2:9092,kafka-3:9092");
  });

  it("Dapr: Resiliency policy with circuit breaker", () => {
    const cfg = readFile("infra/ha/dapr/components.yaml");
    expect(cfg).toContain("circuitBreakers");
    expect(cfg).toContain("consecutiveFailures >= 5");
  });

  it("Dapr: Subscriptions for payment and fraud events", () => {
    const cfg = readFile("infra/ha/dapr/components.yaml");
    expect(cfg).toContain("payment.completed");
    expect(cfg).toContain("fraud.alert");
  });

  // ── Permify HA specifics ────────────────────────────────────────────────
  it("Permify HA: 2 nodes", () => {
    const cfg = readFile("infra/ha/permify/docker-compose.yml");
    expect(cfg).toContain("permify-1");
    expect(cfg).toContain("permify-2");
  });

  // ── Fluvio HA specifics ─────────────────────────────────────────────────
  it("Fluvio HA: 3 SPU nodes", () => {
    const cfg = readFile("infra/ha/fluvio/docker-compose.yml");
    expect(cfg).toContain("fluvio-spu-1");
    expect(cfg).toContain("fluvio-spu-2");
    expect(cfg).toContain("fluvio-spu-3");
  });

  it("Fluvio HA: SC (System Controller) node", () => {
    const cfg = readFile("infra/ha/fluvio/docker-compose.yml");
    expect(cfg).toContain("fluvio-sc");
  });

  // ── HA README ───────────────────────────────────────────────────────────
  it("HA README has service map table", () => {
    const readme = readFile("infra/ha/README.md");
    expect(readme).toContain("TourismPay HA Infrastructure");
    expect(readme).toContain("Kafka");
    expect(readme).toContain("TigerBeetle");
    expect(readme).toContain("Startup Order");
  });
});
