/**
 * Admin Dashboard — platform overview with real-time metrics from tRPC API.
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator,
} from "react-native";
import { adminAPI, ServiceHealthData } from "../../services/api";

export function AdminDashboard({ navigation }: any) {
  const [health, setHealth] = useState<ServiceHealthData[]>([]);
  const [finance, setFinance] = useState<{ totalVolume: number; totalFees: number; activeWallets: number; pendingSettlements: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [healthData, financeData] = await Promise.all([
        adminAPI.getServiceHealth(),
        adminAPI.getFinanceOverview(),
      ]);
      setHealth(healthData);
      setFinance(financeData);
    } catch {
      // Graceful fallback
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const healthyCount = health.filter(s => s.status === "healthy").length;
  const degradedCount = health.filter(s => s.status === "degraded").length;
  const downCount = health.filter(s => s.status === "down").length;

  if (loading) {
    return (
      <View style={[s.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color="#6c63ff" />
      </View>
    );
  }

  return (
    <ScrollView style={s.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6c63ff" />}>
      <Text style={s.title}>Platform Admin</Text>

      {/* Service Health */}
      <View style={s.healthRow}>
        <View style={[s.healthCard, { borderColor: "#22c55e" }]}>
          <Text style={[s.healthNum, { color: "#22c55e" }]}>{healthyCount}</Text>
          <Text style={s.healthLabel}>Healthy</Text>
        </View>
        <View style={[s.healthCard, { borderColor: "#f59e0b" }]}>
          <Text style={[s.healthNum, { color: "#f59e0b" }]}>{degradedCount}</Text>
          <Text style={s.healthLabel}>Degraded</Text>
        </View>
        <View style={[s.healthCard, { borderColor: "#ef4444" }]}>
          <Text style={[s.healthNum, { color: "#ef4444" }]}>{downCount}</Text>
          <Text style={s.healthLabel}>Down</Text>
        </View>
      </View>

      {/* Financial Summary */}
      {finance && (
        <View style={s.financeCard}>
          <Text style={s.financeTitle}>Platform Financials</Text>
          <View style={s.financeRow}>
            <View style={s.financeItem}>
              <Text style={s.financeNum}>${(finance.totalVolume / 1000000).toFixed(1)}M</Text>
              <Text style={s.financeLabel}>Volume</Text>
            </View>
            <View style={s.financeItem}>
              <Text style={s.financeNum}>${(finance.totalFees / 1000).toFixed(0)}K</Text>
              <Text style={s.financeLabel}>Fees</Text>
            </View>
            <View style={s.financeItem}>
              <Text style={s.financeNum}>{finance.activeWallets}</Text>
              <Text style={s.financeLabel}>Wallets</Text>
            </View>
            <View style={s.financeItem}>
              <Text style={s.financeNum}>{finance.pendingSettlements}</Text>
              <Text style={s.financeLabel}>Pending</Text>
            </View>
          </View>
        </View>
      )}

      {/* Quick Actions */}
      <Text style={s.section}>Manage</Text>
      <View style={s.actionsGrid}>
        <TouchableOpacity style={s.action} onPress={() => navigation.navigate("KYBApps")}>
          <Text style={s.actionEmoji}>📋</Text>
          <Text style={s.actionText}>KYB Apps</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.action} onPress={() => navigation.navigate("BIS")}>
          <Text style={s.actionEmoji}>🔍</Text>
          <Text style={s.actionText}>BIS</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.action} onPress={() => navigation.navigate("Users")}>
          <Text style={s.actionEmoji}>👥</Text>
          <Text style={s.actionText}>Users</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.action} onPress={() => navigation.navigate("Audit")}>
          <Text style={s.actionEmoji}>📝</Text>
          <Text style={s.actionText}>Audit Log</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.action} onPress={() => navigation.navigate("Health")}>
          <Text style={s.actionEmoji}>❤️</Text>
          <Text style={s.actionText}>Health</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.action} onPress={() => navigation.navigate("KillSwitch")}>
          <Text style={s.actionEmoji}>🛑</Text>
          <Text style={s.actionText}>Kill Switch</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.action} onPress={() => navigation.navigate("ExchangeRates")}>
          <Text style={s.actionEmoji}>💱</Text>
          <Text style={s.actionText}>FX Rates</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.action} onPress={() => navigation.navigate("Compliance")}>
          <Text style={s.actionEmoji}>⚖️</Text>
          <Text style={s.actionText}>Compliance</Text>
        </TouchableOpacity>
      </View>

      {/* Service Status List */}
      <Text style={s.section}>Service Status</Text>
      {health.map((service) => (
        <View key={service.service} style={s.serviceRow}>
          <View style={[s.statusDot, { backgroundColor: service.status === "healthy" ? "#22c55e" : service.status === "degraded" ? "#f59e0b" : "#ef4444" }]} />
          <View style={{ flex: 1 }}>
            <Text style={s.serviceName}>{service.service}</Text>
            <Text style={s.serviceLatency}>{service.latencyMs}ms | {(service.uptime * 100).toFixed(1)}% uptime</Text>
          </View>
        </View>
      ))}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a", padding: 16 },
  title: { fontSize: 22, fontWeight: "700", color: "#fff", marginTop: 12, marginBottom: 16 },
  healthRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  healthCard: { flex: 1, backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, alignItems: "center", borderWidth: 1 },
  healthNum: { fontSize: 24, fontWeight: "700" },
  healthLabel: { fontSize: 10, color: "#888", marginTop: 2 },
  financeCard: { backgroundColor: "#1a1a2e", borderRadius: 14, padding: 16, marginBottom: 16 },
  financeTitle: { color: "#fff", fontSize: 14, fontWeight: "600", marginBottom: 12 },
  financeRow: { flexDirection: "row", justifyContent: "space-between" },
  financeItem: { alignItems: "center" },
  financeNum: { color: "#6c63ff", fontSize: 16, fontWeight: "700" },
  financeLabel: { color: "#888", fontSize: 10, marginTop: 2 },
  section: { fontSize: 16, fontWeight: "600", color: "#fff", marginTop: 20, marginBottom: 12 },
  actionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  action: { width: "23%", alignItems: "center", backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14 },
  actionEmoji: { fontSize: 22, marginBottom: 4 },
  actionText: { fontSize: 9, color: "#ccc", textAlign: "center" },
  serviceRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#1a1a2e", borderRadius: 10, padding: 12, marginBottom: 6, gap: 10 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  serviceName: { color: "#fff", fontSize: 13, fontWeight: "500" },
  serviceLatency: { color: "#888", fontSize: 10, marginTop: 2 },
});
