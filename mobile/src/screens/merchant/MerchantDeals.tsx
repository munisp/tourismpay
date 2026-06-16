/**
 * MerchantDeals — Deal Leaderboard
 */
import React from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";

export function MerchantDeals({ navigation }: any) {
  return (
    <ScrollView style={s.container}>
      <Text style={s.title}>Deal Leaderboard</Text>
      {/* Stats */}
      <View style={s.statsRow}>
        <View style={s.stat}><Text style={s.statNum}>#—</Text><Text style={s.statLabel}>Your Rank</Text></View>
        <View style={s.stat}><Text style={s.statNum}>0</Text><Text style={s.statLabel}>Active Deals</Text></View>
        <View style={s.stat}><Text style={s.statNum}>0</Text><Text style={s.statLabel}>Bookings</Text></View>
      </View>
      {/* Content */}
      <Text style={s.section}>Top Deals</Text>
      <View style={s.emptyState}>
        <Text style={s.emptyEmoji}>🏆</Text>
        <Text style={s.emptyText}>No deals yet</Text>
        <Text style={s.emptySubtext}>Create flash deals to boost visibility and earn leaderboard points</Text>
      </View>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a", padding: 16 },
  title: { fontSize: 22, fontWeight: "700", color: "#fff", marginTop: 12, marginBottom: 16 },
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  stat: { flex: 1, backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, alignItems: "center" },
  statNum: { fontSize: 18, fontWeight: "700", color: "#fff" },
  statLabel: { fontSize: 10, color: "#888", marginTop: 4 },
  actionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  actionBtn: { width: "30%", backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, alignItems: "center" },
  actionEmoji: { fontSize: 22, marginBottom: 4 },
  actionLabel: { fontSize: 10, color: "#ccc" },
  section: { fontSize: 16, fontWeight: "600", color: "#fff", marginTop: 16, marginBottom: 12 },
  emptyState: { backgroundColor: "#1a1a2e", borderRadius: 14, padding: 30, alignItems: "center" },
  emptyEmoji: { fontSize: 40, marginBottom: 10 },
  emptyText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  emptySubtext: { color: "#888", fontSize: 12, marginTop: 4, textAlign: "center" },
});
