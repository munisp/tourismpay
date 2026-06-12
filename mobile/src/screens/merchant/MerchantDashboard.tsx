/**
 * Merchant Dashboard — Native mobile home screen for merchants.
 * Shows revenue summary, recent bookings, quick actions, and alerts.
 */
import React from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";

export function MerchantDashboard({ navigation }: any) {
  return (
    <ScrollView style={s.container}>
      {/* Revenue Summary */}
      <View style={s.revenueCard}>
        <Text style={s.revenueLabel}>Today's Revenue</Text>
        <Text style={s.revenueAmount}>$0.00</Text>
        <Text style={s.revenueChange}>Connect channels to start earning</Text>
      </View>

      {/* Quick Actions Grid */}
      <View style={s.actionsGrid}>
        <TouchableOpacity style={s.actionCard} onPress={() => navigation.navigate("Revenue")}>
          <Text style={s.actionEmoji}>📊</Text>
          <Text style={s.actionLabel}>Revenue</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.actionCard} onPress={() => navigation.navigate("QRCodes")}>
          <Text style={s.actionEmoji}>📱</Text>
          <Text style={s.actionLabel}>QR Codes</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.actionCard} onPress={() => navigation.navigate("Products")}>
          <Text style={s.actionEmoji}>🛍️</Text>
          <Text style={s.actionLabel}>Products</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.actionCard} onPress={() => navigation.navigate("Bookings")}>
          <Text style={s.actionEmoji}>📋</Text>
          <Text style={s.actionLabel}>Bookings</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.actionCard} onPress={() => navigation.navigate("Channels")}>
          <Text style={s.actionEmoji}>🌐</Text>
          <Text style={s.actionLabel}>Channels</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.actionCard} onPress={() => navigation.navigate("Cashier")}>
          <Text style={s.actionEmoji}>💳</Text>
          <Text style={s.actionLabel}>Cashier</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.actionCard} onPress={() => navigation.navigate("Availability")}>
          <Text style={s.actionEmoji}>📅</Text>
          <Text style={s.actionLabel}>Calendar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.actionCard} onPress={() => navigation.navigate("Payouts")}>
          <Text style={s.actionEmoji}>💰</Text>
          <Text style={s.actionLabel}>Payouts</Text>
        </TouchableOpacity>
      </View>

      {/* Recent Bookings */}
      <Text style={s.section}>Recent Bookings</Text>
      <View style={s.emptyState}>
        <Text style={s.emptyEmoji}>📭</Text>
        <Text style={s.emptyText}>No bookings yet</Text>
        <Text style={s.emptySubtext}>Connect distribution channels to start receiving bookings</Text>
      </View>

      {/* Channel Status */}
      <Text style={s.section}>Channel Status</Text>
      <View style={s.channelRow}>
        <View style={s.channelItem}><Text style={s.chEmoji}>🌐</Text><Text style={s.chName}>Sabre</Text><View style={s.offDot} /></View>
        <View style={s.channelItem}><Text style={s.chEmoji}>✈️</Text><Text style={s.chName}>Amadeus</Text><View style={s.offDot} /></View>
        <View style={s.channelItem}><Text style={s.chEmoji}>🏨</Text><Text style={s.chName}>Expedia</Text><View style={s.offDot} /></View>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a", padding: 16 },
  revenueCard: { backgroundColor: "#1a1a2e", borderRadius: 16, padding: 24, marginTop: 8, alignItems: "center", borderWidth: 1, borderColor: "#6c63ff30" },
  revenueLabel: { color: "#888", fontSize: 13 },
  revenueAmount: { color: "#fff", fontSize: 36, fontWeight: "700", marginTop: 4 },
  revenueChange: { color: "#6c63ff", fontSize: 12, marginTop: 4 },
  actionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 20 },
  actionCard: { width: "23%", backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, alignItems: "center" },
  actionEmoji: { fontSize: 22, marginBottom: 4 },
  actionLabel: { fontSize: 10, color: "#ccc", fontWeight: "500" },
  section: { fontSize: 16, fontWeight: "600", color: "#fff", marginTop: 24, marginBottom: 12 },
  emptyState: { backgroundColor: "#1a1a2e", borderRadius: 14, padding: 30, alignItems: "center" },
  emptyEmoji: { fontSize: 40, marginBottom: 10 },
  emptyText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  emptySubtext: { color: "#888", fontSize: 12, marginTop: 4, textAlign: "center" },
  channelRow: { flexDirection: "row", gap: 10 },
  channelItem: { flex: 1, backgroundColor: "#1a1a2e", borderRadius: 10, padding: 12, alignItems: "center", flexDirection: "row", gap: 6 },
  chEmoji: { fontSize: 16 },
  chName: { color: "#ccc", fontSize: 11, flex: 1 },
  offDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#666" },
});
