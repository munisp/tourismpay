/**
 * MerchantStaff — Staff list from tRPC API with roles.
 */
import React, { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator } from "react-native";
import { merchantAPI } from "../../services/api";

export function MerchantStaff() {
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try { const data = await merchantAPI.getStaff(); setStaff(data); } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

  if (loading) return <View style={[s.container, { justifyContent: "center", alignItems: "center" }]}><ActivityIndicator size="large" color="#6c63ff" /></View>;

  return (
    <ScrollView style={s.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6c63ff" />}>
      <Text style={s.title}>{staff.length} Staff Members</Text>
      {staff.length === 0 ? (
        <View style={s.empty}><Text style={s.emptyText}>No staff added yet</Text></View>
      ) : (
        staff.map((member) => (
          <View key={member.id} style={s.card}>
            <View style={s.avatar}><Text style={s.avatarText}>{(member.name ?? "?")[0].toUpperCase()}</Text></View>
            <View style={s.info}>
              <Text style={s.name}>{member.name}</Text>
              <Text style={s.role}>{member.role ?? "Staff"}</Text>
            </View>
            <View style={[s.statusDot, { backgroundColor: member.active ? "#22c55e" : "#666" }]} />
          </View>
        ))
      )}
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a", padding: 16 },
  title: { color: "#fff", fontSize: 18, fontWeight: "600", marginTop: 8, marginBottom: 16 },
  empty: { backgroundColor: "#1a1a2e", borderRadius: 14, padding: 30, alignItems: "center" },
  emptyText: { color: "#888", fontSize: 14 },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, marginBottom: 8, gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#6c63ff33", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#6c63ff", fontSize: 16, fontWeight: "700" },
  info: { flex: 1 },
  name: { color: "#fff", fontSize: 14, fontWeight: "500" },
  role: { color: "#888", fontSize: 11, textTransform: "capitalize" },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
});
