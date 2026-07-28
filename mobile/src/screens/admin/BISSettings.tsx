/**
 * BIS Settings Screen — wired to tRPC API via useApiData hook.
 */
import React from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator } from "react-native";
import { useApiData } from "../../hooks/useApiData";

export function BISSettings({ navigation }: any) {
  const { data, loading, error, refresh, refreshing } = useApiData<any>({
    endpoint: "bisSettings.getSettings",
    defaultValue: { items: [] },
  });
  const items: any[] = data?.items ?? (Array.isArray(data) ? data : []);
  if (loading && !error) return <View style={s.center}><ActivityIndicator size="large" color="#6c63ff" /></View>;
  if (error) return <View style={s.center}><Text style={s.errorText}>{error}</Text></View>;
  return (
    <ScrollView style={s.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#6c63ff" />}>
      <View style={s.headerRow}>
        <Text style={s.title}>BIS Settings</Text>
        
      </View>
      
      {items.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyEmoji}>⚙️</Text>
          <Text style={s.emptyText}>No BIS settings configured</Text>
        </View>
      ) : (
        items.map((item: any, idx: number) => (
          <View key={item.id ?? idx} style={s.card}>
            <View style={s.cardRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle}>{item.key ?? item.settingKey ?? "Setting"}</Text>
                <Text style={s.cardSub}>{String(item.value ?? "—")}</Text>
              </View>
            </View>
          </View>
        ))
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a", padding: 16 },
  center: { flex: 1, backgroundColor: "#0f0f1a", justifyContent: "center", alignItems: "center" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: "700", color: "#fff" },
  errorText: { color: "#ef4444", textAlign: "center", padding: 16 },
  empty: { backgroundColor: "#1a1a2e", borderRadius: 14, padding: 30, alignItems: "center", marginTop: 40 },
  emptyEmoji: { fontSize: 36, marginBottom: 8 },
  emptyText: { color: "#888", fontSize: 14 },
  card: { backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, marginBottom: 10 },
  cardTitle: { fontSize: 14, fontWeight: "600", color: "#fff" },
  cardSub: { fontSize: 12, color: "#888", marginTop: 4 },
  cardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  badge: { fontSize: 10, color: "#6c63ff", fontWeight: "600", backgroundColor: "#6c63ff20", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: "hidden" },
  badgeGreen: { color: "#22c55e", backgroundColor: "#22c55e20" },
  badgeRed: { color: "#ef4444", backgroundColor: "#ef444420" },
  badgeAmber: { color: "#f59e0b", backgroundColor: "#f59e0b20" },
  actionBtn: { backgroundColor: "#6c63ff", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  actionBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" },
});
