/**
 * SecurityHome — Wired to tRPC API
 */
import React from "react";
import { View, Text, ScrollView, RefreshControl, StyleSheet, ActivityIndicator } from "react-native";
import { useApiData } from "../../hooks/useApiData";

export function SecurityHome({ navigation }: any) {
  const { data, loading, error, refresh, refreshing } = useApiData<any>({
    endpoint: "security.getOverview",
    defaultValue: { threatLevel: "low", activeSessions: 0, lastLogin: "", twoFactor: false },
  });

  if (loading) return <View style={s.loadingContainer}><ActivityIndicator size="large" color="#6366f1" /></View>;

  return (
    <ScrollView style={s.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#6366f1" />}>
      <Text style={s.title}>Security Home</Text>
      {error && <Text style={s.error}>{error}</Text>}
      <View style={s.statsRow}>
        <View style={s.stat}><Text style={s.statNum}>{String(data?.threatLevel ?? "—")}</Text><Text style={s.statLabel}>Threat Level</Text></View>
        <View style={s.stat}><Text style={s.statNum}>{String(data?.activeSessions ?? "—")}</Text><Text style={s.statLabel}>Active Sessions</Text></View>
        <View style={s.stat}><Text style={s.statNum}>{String(data?.lastLogin ?? "—")}</Text><Text style={s.statLabel}>Last Login</Text></View>
        <View style={s.stat}><Text style={s.statNum}>{String(data?.twoFactor ?? "—")}</Text><Text style={s.statLabel}>2FA</Text></View>
      </View>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a", padding: 16 },
  loadingContainer: { flex: 1, backgroundColor: "#0f0f1a", justifyContent: "center", alignItems: "center" },
  title: { fontSize: 22, fontWeight: "700", color: "#fff", marginTop: 12, marginBottom: 16 },
  error: { color: "#ef4444", fontSize: 12, marginBottom: 8 },
  section: { fontSize: 16, fontWeight: "600", color: "#fff", marginTop: 16, marginBottom: 12 },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  stat: { flex: 1, minWidth: "45%", backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, alignItems: "center" },
  statNum: { fontSize: 16, fontWeight: "700", color: "#fff" },
  statLabel: { fontSize: 10, color: "#888", marginTop: 4 },
  card: { backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, marginBottom: 10 },
  cardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { fontSize: 14, fontWeight: "600", color: "#fff", flex: 1 },
  cardSub: { fontSize: 12, color: "#888", marginTop: 4 },
  cardDate: { fontSize: 10, color: "#666", marginTop: 4 },
  cardAmount: { fontSize: 14, fontWeight: "700", color: "#6366f1" },
  statusBadge: { fontSize: 10, color: "#f59e0b", fontWeight: "600", backgroundColor: "#f59e0b20", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, overflow: "hidden" },
  statusGreen: { color: "#10b981", backgroundColor: "#10b98120" },
  badge: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#6366f1", marginLeft: 8 },
});
