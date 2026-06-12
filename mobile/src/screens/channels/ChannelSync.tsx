/**
 * Channel Sync — Sync history and status for a specific connected channel.
 */
import React from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import type { ChannelStackParams } from "../../navigation/RootNavigator";

type Props = {
  navigation: NativeStackNavigationProp<ChannelStackParams, "ChannelSync">;
  route: RouteProp<ChannelStackParams, "ChannelSync">;
};

export function ChannelSync({ route }: Props) {
  const channelId = route.params?.channelId ?? "unknown";

  return (
    <ScrollView style={s.container}>
      <Text style={s.channelName}>{channelId.replace("_", " ").toUpperCase()}</Text>

      {/* Sync Stats */}
      <View style={s.statsRow}>
        <View style={s.stat}><Text style={s.statVal}>0</Text><Text style={s.statLabel}>Total Syncs</Text></View>
        <View style={s.stat}><Text style={s.statVal}>—</Text><Text style={s.statLabel}>Last Sync</Text></View>
        <View style={s.stat}><Text style={[s.statVal, { color: "#22c55e" }]}>0</Text><Text style={s.statLabel}>Errors</Text></View>
      </View>

      {/* Sync Types */}
      <Text style={s.section}>Sync Operations</Text>
      {["Rates Pushed", "Availability Pushed", "Bookings Pulled", "Confirmations Sent"].map((op) => (
        <View key={op} style={s.opRow}>
          <Text style={s.opName}>{op}</Text>
          <Text style={s.opStatus}>—</Text>
        </View>
      ))}

      {/* Sync History */}
      <Text style={s.section}>Sync History</Text>
      <View style={s.empty}>
        <Text style={s.emptyEmoji}>📡</Text>
        <Text style={s.emptyText}>No sync history yet</Text>
        <Text style={s.emptySubtext}>Syncs run automatically every 5 minutes once connected</Text>
      </View>

      {/* Manual Sync Button */}
      <TouchableOpacity style={s.syncBtn}>
        <Text style={s.syncBtnText}>↻ Trigger Manual Sync</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a", padding: 16 },
  channelName: { fontSize: 14, color: "#6c63ff", fontWeight: "600", letterSpacing: 1, marginTop: 8 },
  statsRow: { flexDirection: "row", gap: 8, marginTop: 16 },
  stat: { flex: 1, backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, alignItems: "center" },
  statVal: { fontSize: 18, fontWeight: "700", color: "#fff" },
  statLabel: { fontSize: 10, color: "#888", marginTop: 4 },
  section: { fontSize: 16, fontWeight: "600", color: "#fff", marginTop: 24, marginBottom: 12 },
  opRow: { flexDirection: "row", justifyContent: "space-between", backgroundColor: "#1a1a2e", borderRadius: 10, padding: 14, marginBottom: 8 },
  opName: { color: "#ccc", fontSize: 13 },
  opStatus: { color: "#888", fontSize: 13 },
  empty: { alignItems: "center", marginTop: 20 },
  emptyEmoji: { fontSize: 36, marginBottom: 8 },
  emptyText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  emptySubtext: { color: "#888", fontSize: 12, marginTop: 4, textAlign: "center" },
  syncBtn: { backgroundColor: "#6c63ff", borderRadius: 12, padding: 16, alignItems: "center", marginTop: 24 },
  syncBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
