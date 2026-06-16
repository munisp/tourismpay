/**
 * Rate Parity — Monitor and ensure consistent pricing across all distribution channels.
 */
import React from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";

export function RateParity() {
  return (
    <ScrollView style={s.container}>
      <Text style={s.desc}>Monitor price consistency across all connected channels. Rate parity violations can lead to channel penalties.</Text>

      {/* Parity Score */}
      <View style={s.scoreCard}>
        <Text style={s.scoreLabel}>Rate Parity Score</Text>
        <Text style={s.scoreValue}>—</Text>
        <Text style={s.scoreSubtext}>Connect channels to start monitoring</Text>
      </View>

      {/* Alerts */}
      <Text style={s.section}>Parity Alerts</Text>
      <View style={s.statsRow}>
        <View style={s.stat}><Text style={[s.statVal, { color: "#22c55e" }]}>0</Text><Text style={s.statLabel}>In Parity</Text></View>
        <View style={s.stat}><Text style={[s.statVal, { color: "#f59e0b" }]}>0</Text><Text style={s.statLabel}>Warnings</Text></View>
        <View style={s.stat}><Text style={[s.statVal, { color: "#ef4444" }]}>0</Text><Text style={s.statLabel}>Violations</Text></View>
      </View>

      {/* Channel Comparison */}
      <Text style={s.section}>Channel Price Comparison</Text>
      <View style={s.empty}>
        <Text style={s.emptyEmoji}>⚖️</Text>
        <Text style={s.emptyTitle}>No data available</Text>
        <Text style={s.emptySubtext}>Connect 2+ channels and map products to see price comparisons across platforms</Text>
      </View>

      {/* Info */}
      <View style={s.infoCard}>
        <Text style={s.infoTitle}>Why Rate Parity Matters</Text>
        <Text style={s.infoText}>Maintaining consistent rates across channels prevents:</Text>
        <Text style={s.infoBullet}>• Channel contract violations and delisting</Text>
        <Text style={s.infoBullet}>• Guest confusion and negative reviews</Text>
        <Text style={s.infoBullet}>• Revenue leakage from rate undercutting</Text>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a", padding: 16 },
  desc: { color: "#888", fontSize: 13, lineHeight: 20, marginTop: 8, marginBottom: 16 },
  scoreCard: { backgroundColor: "#1a1a2e", borderRadius: 16, padding: 24, alignItems: "center", borderWidth: 1, borderColor: "#6c63ff30" },
  scoreLabel: { color: "#888", fontSize: 12 },
  scoreValue: { fontSize: 36, fontWeight: "700", color: "#fff", marginTop: 4 },
  scoreSubtext: { color: "#6c63ff", fontSize: 12, marginTop: 4 },
  section: { fontSize: 16, fontWeight: "600", color: "#fff", marginTop: 24, marginBottom: 12 },
  statsRow: { flexDirection: "row", gap: 8 },
  stat: { flex: 1, backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, alignItems: "center" },
  statVal: { fontSize: 18, fontWeight: "700" },
  statLabel: { fontSize: 10, color: "#888", marginTop: 4 },
  empty: { alignItems: "center", marginTop: 20, marginBottom: 20 },
  emptyEmoji: { fontSize: 36, marginBottom: 8 },
  emptyTitle: { color: "#fff", fontSize: 14, fontWeight: "600" },
  emptySubtext: { color: "#888", fontSize: 12, marginTop: 4, textAlign: "center" },
  infoCard: { backgroundColor: "#1a1a2e", borderRadius: 12, padding: 16, marginTop: 8 },
  infoTitle: { color: "#fff", fontSize: 14, fontWeight: "600", marginBottom: 8 },
  infoText: { color: "#888", fontSize: 12, marginBottom: 6 },
  infoBullet: { color: "#888", fontSize: 12, lineHeight: 20 },
});
