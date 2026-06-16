/**
 * Inbound Bookings — Reservations received from external GDS/OTA channels.
 */
import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";

export function InboundBookings() {
  const [filter, setFilter] = useState<"all" | "pending" | "confirmed">("all");

  return (
    <ScrollView style={s.container}>
      {/* Filter */}
      <View style={s.filterRow}>
        {(["all", "pending", "confirmed"] as const).map((f) => (
          <TouchableOpacity key={f} style={[s.filterPill, filter === f && s.filterActive]} onPress={() => setFilter(f)}>
            <Text style={[s.filterText, filter === f && s.filterActiveText]}>{f.charAt(0).toUpperCase() + f.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Stats */}
      <View style={s.statsRow}>
        <View style={s.stat}><Text style={s.statVal}>0</Text><Text style={s.statLabel}>Total</Text></View>
        <View style={s.stat}><Text style={s.statVal}>0</Text><Text style={s.statLabel}>Pending</Text></View>
        <View style={s.stat}><Text style={s.statVal}>$0</Text><Text style={s.statLabel}>Revenue</Text></View>
      </View>

      {/* Empty State */}
      <View style={s.empty}>
        <Text style={s.emptyEmoji}>📥</Text>
        <Text style={s.emptyTitle}>No inbound bookings</Text>
        <Text style={s.emptySubtext}>
          Once you connect channels like Sabre, Amadeus, or Expedia, reservations will automatically flow in here.
        </Text>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a", padding: 16 },
  filterRow: { flexDirection: "row", gap: 8, marginTop: 8, marginBottom: 16 },
  filterPill: { flex: 1, backgroundColor: "#1a1a2e", borderRadius: 8, paddingVertical: 8, alignItems: "center" },
  filterActive: { backgroundColor: "#6c63ff" },
  filterText: { color: "#888", fontSize: 12, fontWeight: "500" },
  filterActiveText: { color: "#fff" },
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  stat: { flex: 1, backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, alignItems: "center" },
  statVal: { fontSize: 18, fontWeight: "700", color: "#fff" },
  statLabel: { fontSize: 10, color: "#888", marginTop: 4 },
  empty: { alignItems: "center", marginTop: 40, padding: 20 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { color: "#fff", fontSize: 18, fontWeight: "600" },
  emptySubtext: { color: "#888", fontSize: 13, marginTop: 8, textAlign: "center", lineHeight: 20 },
});
