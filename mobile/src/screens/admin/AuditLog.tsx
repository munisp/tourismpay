/**
 * AuditLog — Platform audit trail from tRPC API.
 */
import React, { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator } from "react-native";
import { adminAPI } from "../../services/api";

export function AuditLog() {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try { const data = await adminAPI.getAuditLog({ limit: 50 }); setEntries(data); } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

  const actionColor = (action: string) => {
    if (action.includes("create") || action.includes("approve")) return "#22c55e";
    if (action.includes("delete") || action.includes("reject")) return "#ef4444";
    if (action.includes("update") || action.includes("modify")) return "#f59e0b";
    return "#6c63ff";
  };

  if (loading) return <View style={[s.container, { justifyContent: "center", alignItems: "center" }]}><ActivityIndicator size="large" color="#6c63ff" /></View>;

  return (
    <ScrollView style={s.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6c63ff" />}>
      <Text style={s.title}>Audit Trail</Text>
      <Text style={s.subtitle}>{entries.length} entries</Text>
      {entries.map((entry, i) => (
        <View key={entry.id ?? i} style={s.card}>
          <View style={[s.actionDot, { backgroundColor: actionColor(entry.action ?? "") }]} />
          <View style={s.content}>
            <Text style={s.action}>{entry.action}</Text>
            <Text style={s.details} numberOfLines={1}>{entry.details ?? entry.resource}</Text>
            <Text style={s.meta}>{entry.user ?? "system"} | {new Date(entry.timestamp ?? entry.createdAt).toLocaleString()}</Text>
          </View>
        </View>
      ))}
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a", padding: 16 },
  title: { color: "#fff", fontSize: 18, fontWeight: "600", marginTop: 8 },
  subtitle: { color: "#888", fontSize: 12, marginTop: 4, marginBottom: 16 },
  card: { flexDirection: "row", alignItems: "flex-start", backgroundColor: "#1a1a2e", borderRadius: 10, padding: 12, marginBottom: 6, gap: 10 },
  actionDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  content: { flex: 1 },
  action: { color: "#fff", fontSize: 12, fontWeight: "600" },
  details: { color: "#888", fontSize: 11, marginTop: 2 },
  meta: { color: "#666", fontSize: 10, marginTop: 4 },
});
