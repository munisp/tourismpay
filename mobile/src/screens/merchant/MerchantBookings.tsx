/**
 * Merchant Bookings — Booking inbox with status filtering, detail view, and confirmation actions.
 */
import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";

type BookingStatus = "all" | "pending" | "confirmed" | "completed" | "cancelled";

interface Booking {
  id: string;
  guestName: string;
  product: string;
  date: string;
  status: BookingStatus;
  amount: number;
  source: string;
}

export function MerchantBookings() {
  const [filter, setFilter] = useState<BookingStatus>("all");
  const [bookings] = useState<Booking[]>([]);

  const statuses: BookingStatus[] = ["all", "pending", "confirmed", "completed", "cancelled"];
  const filtered = filter === "all" ? bookings : bookings.filter((b) => b.status === filter);

  return (
    <ScrollView style={s.container}>
      {/* Status Filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterRow}>
        {statuses.map((st) => (
          <TouchableOpacity
            key={st}
            style={[s.filterPill, filter === st && s.filterActive]}
            onPress={() => setFilter(st)}
          >
            <Text style={[s.filterText, filter === st && s.filterActiveText]}>
              {st.charAt(0).toUpperCase() + st.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Booking List */}
      {filtered.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyEmoji}>📋</Text>
          <Text style={s.emptyTitle}>No bookings yet</Text>
          <Text style={s.emptySubtext}>
            Bookings from tourists, channels (Sabre, Expedia, etc.), and direct will appear here
          </Text>
        </View>
      ) : (
        filtered.map((b) => (
          <View key={b.id} style={s.bookingCard}>
            <View style={s.bookingTop}>
              <Text style={s.guestName}>{b.guestName}</Text>
              <View style={[s.statusBadge, { backgroundColor: statusColor(b.status) }]}>
                <Text style={s.statusText}>{b.status}</Text>
              </View>
            </View>
            <Text style={s.bookingProduct}>{b.product}</Text>
            <View style={s.bookingMeta}>
              <Text style={s.metaText}>📅 {b.date}</Text>
              <Text style={s.metaText}>💰 ${b.amount}</Text>
              <Text style={s.metaText}>📡 {b.source}</Text>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

function statusColor(status: string): string {
  switch (status) {
    case "pending": return "#f59e0b30";
    case "confirmed": return "#22c55e30";
    case "completed": return "#6c63ff30";
    case "cancelled": return "#ef444430";
    default: return "#64748b30";
  }
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a", padding: 16 },
  filterRow: { marginTop: 8, marginBottom: 16, maxHeight: 36 },
  filterPill: { backgroundColor: "#1a1a2e", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6, marginRight: 8 },
  filterActive: { backgroundColor: "#6c63ff" },
  filterText: { color: "#888", fontSize: 12 },
  filterActiveText: { color: "#fff" },
  empty: { alignItems: "center", marginTop: 80 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { color: "#fff", fontSize: 18, fontWeight: "600" },
  emptySubtext: { color: "#888", fontSize: 13, marginTop: 6, textAlign: "center", lineHeight: 20 },
  bookingCard: { backgroundColor: "#1a1a2e", borderRadius: 12, padding: 16, marginBottom: 10 },
  bookingTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  guestName: { color: "#fff", fontSize: 15, fontWeight: "600" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { color: "#fff", fontSize: 10, fontWeight: "600", textTransform: "uppercase" },
  bookingProduct: { color: "#ccc", fontSize: 13, marginTop: 4 },
  bookingMeta: { flexDirection: "row", gap: 12, marginTop: 8 },
  metaText: { color: "#888", fontSize: 11 },
});
