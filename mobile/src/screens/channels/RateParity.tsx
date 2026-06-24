/**
 * RateParity — Wired to tRPC API
 */
import React from "react";
import { View, Text, ScrollView, RefreshControl, StyleSheet, ActivityIndicator } from "react-native";
import { useApiData } from "../../hooks/useApiData";

export function RateParity({ navigation }: any) {
  const { data, loading, error, refresh, refreshing } = useApiData<any>({
    endpoint: "channelManager.getRateParity",
    defaultValue: { channels: [] },
  });

  if (loading) return <View style={s.loadingContainer}><ActivityIndicator size="large" color="#6366f1" /></View>;

  const items = data?.channels || [];

  return (
    <ScrollView style={s.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#6366f1" />}>
      <Text style={s.title}>Rate Parity</Text>
      {error && <Text style={s.error}>{error}</Text>}
      {items.length === 0 ? (
        <View style={s.emptyState}>
          <Text style={s.emptyText}>No rate parity data</Text>
        </View>
      ) : (
        items.map((item: any) => (
          <View key={item.id} style={s.card}><View style={s.cardRow}><Text style={s.cardTitle}>{item.name}</Text><Text style={s.cardAmount}>{item.parityScore}%</Text></View><Text style={s.cardDate}>Last check: {item.lastCheck}</Text></View>
        ))
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a", padding: 16 },
  loadingContainer: { flex: 1, backgroundColor: "#0f0f1a", justifyContent: "center", alignItems: "center" },
  title: { fontSize: 22, fontWeight: "700", color: "#fff", marginTop: 12, marginBottom: 16 },
  error: { color: "#ef4444", fontSize: 12, marginBottom: 8 },
  emptyState: { backgroundColor: "#1a1a2e", borderRadius: 14, padding: 30, alignItems: "center" },
  emptyText: { color: "#888", fontSize: 14 },
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
