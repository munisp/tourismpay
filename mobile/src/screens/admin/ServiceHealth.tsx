/**
 * ServiceHealth — Platform service health from tRPC API.
 */
import React, { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator } from "react-native";
import { adminAPI } from "../../services/api";

export function ServiceHealth() {
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try { const data = await adminAPI.getServiceHealth(); setServices(Array.isArray(data) ? data : []); } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

  const statusColor = (status: string) => {
    switch (status) { case "healthy": return "#22c55e"; case "degraded": return "#f59e0b"; case "down": return "#ef4444"; default: return "#888"; }
  };

  if (loading) return <View style={[s.container, { justifyContent: "center", alignItems: "center" }]}><ActivityIndicator size="large" color="#6c63ff" /></View>;

  const healthy = services.filter(s => s.status === "healthy").length;
  const degraded = services.filter(s => s.status === "degraded").length;
  const down = services.filter(s => s.status === "down").length;

  return (
    <ScrollView style={s.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6c63ff" />}>
      <View style={s.summary}>
        <View style={[s.summaryCard, { borderLeftColor: "#22c55e" }]}><Text style={[s.summaryNum, { color: "#22c55e" }]}>{healthy}</Text><Text style={s.summaryLabel}>Healthy</Text></View>
        <View style={[s.summaryCard, { borderLeftColor: "#f59e0b" }]}><Text style={[s.summaryNum, { color: "#f59e0b" }]}>{degraded}</Text><Text style={s.summaryLabel}>Degraded</Text></View>
        <View style={[s.summaryCard, { borderLeftColor: "#ef4444" }]}><Text style={[s.summaryNum, { color: "#ef4444" }]}>{down}</Text><Text style={s.summaryLabel}>Down</Text></View>
      </View>

      <Text style={s.section}>All Services</Text>
      {services.map((service, i) => (
        <View key={service.name ?? i} style={s.serviceCard}>
          <View style={[s.statusDot, { backgroundColor: statusColor(service.status) }]} />
          <View style={s.serviceInfo}>
            <Text style={s.serviceName}>{service.name}</Text>
            <Text style={s.serviceDetail}>Latency: {service.latency ?? 0}ms | Uptime: {service.uptime ?? "99.9"}%</Text>
          </View>
        </View>
      ))}
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a", padding: 16 },
  summary: { flexDirection: "row", gap: 8, marginTop: 8, marginBottom: 16 },
  summaryCard: { flex: 1, backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, alignItems: "center", borderLeftWidth: 3 },
  summaryNum: { fontSize: 22, fontWeight: "700" },
  summaryLabel: { color: "#888", fontSize: 10, marginTop: 4 },
  section: { color: "#fff", fontSize: 14, fontWeight: "600", marginBottom: 10 },
  serviceCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#1a1a2e", borderRadius: 10, padding: 12, marginBottom: 6, gap: 10 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  serviceInfo: { flex: 1 },
  serviceName: { color: "#fff", fontSize: 13, fontWeight: "500" },
  serviceDetail: { color: "#888", fontSize: 10, marginTop: 2 },
});
