import React from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { useAuth } from "../hooks/useAuth";

export function DashboardScreen() {
  const { user } = useAuth();
  return (
    <ScrollView style={s.container}>
      <Text style={s.greeting}>Welcome back{user?.name ? `, ${user.name}` : ""}</Text>
      <View style={s.statsGrid}>
        <View style={s.statCard}><Text style={s.statNum}>—</Text><Text style={s.statLabel}>Transactions</Text></View>
        <View style={s.statCard}><Text style={s.statNum}>—</Text><Text style={s.statLabel}>Revenue</Text></View>
        <View style={s.statCard}><Text style={s.statNum}>—</Text><Text style={s.statLabel}>Bookings</Text></View>
        <View style={s.statCard}><Text style={s.statNum}>—</Text><Text style={s.statLabel}>Channels</Text></View>
      </View>
      <Text style={s.section}>Quick Actions</Text>
      <View style={s.actionsRow}>
        <TouchableOpacity style={s.action}><Text style={s.actionIcon}>📱</Text><Text style={s.actionText}>QR Pay</Text></TouchableOpacity>
        <TouchableOpacity style={s.action}><Text style={s.actionIcon}>💱</Text><Text style={s.actionText}>Exchange</Text></TouchableOpacity>
        <TouchableOpacity style={s.action}><Text style={s.actionIcon}>📊</Text><Text style={s.actionText}>Analytics</Text></TouchableOpacity>
        <TouchableOpacity style={s.action}><Text style={s.actionIcon}>🔔</Text><Text style={s.actionText}>Alerts</Text></TouchableOpacity>
      </View>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a", padding: 16 },
  greeting: { fontSize: 22, fontWeight: "700", color: "#fff", marginTop: 16, marginBottom: 20 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statCard: { width: "48%", backgroundColor: "#1a1a2e", borderRadius: 12, padding: 16, alignItems: "center" },
  statNum: { fontSize: 24, fontWeight: "700", color: "#fff" },
  statLabel: { fontSize: 12, color: "#888", marginTop: 4 },
  section: { fontSize: 16, fontWeight: "600", color: "#fff", marginTop: 24, marginBottom: 12 },
  actionsRow: { flexDirection: "row", justifyContent: "space-between" },
  action: { alignItems: "center", backgroundColor: "#1a1a2e", borderRadius: 12, padding: 16, width: "23%" },
  actionIcon: { fontSize: 24, marginBottom: 6 },
  actionText: { fontSize: 11, color: "#ccc" },
});
