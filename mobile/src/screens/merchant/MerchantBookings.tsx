/**
 * MerchantBookings — Booking list from tRPC API with status filtering.
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator,
} from "react-native";
import { merchantAPI } from "../../services/api";

type BookingStatus = "all" | "confirmed" | "pending" | "cancelled";

export function MerchantBookings() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [filter, setFilter] = useState<BookingStatus>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const data = await merchantAPI.getBookings({ status: filter === "all" ? undefined : filter });
      setBookings(data.bookings ?? []);
    } catch {
      // Offline
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { setLoading(true); loadData(); }, [loadData]);
  const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

  const statusColor = (status: string) => {
    switch (status) {
      case "confirmed": return "#22c55e";
      case "pending": return "#f59e0b";
      case "cancelled": return "#ef4444";
      default: return "#888";
    }
  };

  if (loading) {
    return <View style={[s.container, { justifyContent: "center", alignItems: "center" }]}><ActivityIndicator size="large" color="#6c63ff" /></View>;
  }

  return (
    <ScrollView style={s.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6c63ff" />}>
      {/* Filter Tabs */}
      <View style={s.filterRow}>
        {(["all", "confirmed", "pending", "cancelled"] as BookingStatus[]).map((f) => (
          <TouchableOpacity key={f} style={[s.filterBtn, filter === f && s.filterActive]} onPress={() => setFilter(f)}>
            <Text style={[s.filterText, filter === f && s.filterActiveText]}>{f.charAt(0).toUpperCase() + f.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {bookings.length === 0 ? (
        <View style={s.emptyState}>
          <Text style={s.emptyEmoji}>📅</Text>
          <Text style={s.emptyText}>No bookings</Text>
        </View>
      ) : (
        bookings.map((booking) => (
          <View key={booking.id} style={s.bookingCard}>
            <View style={s.bookingHeader}>
              <Text style={s.guestName}>{booking.guestName ?? "Guest"}</Text>
              <View style={[s.statusPill, { backgroundColor: statusColor(booking.status) + "22" }]}>
                <Text style={[s.statusText, { color: statusColor(booking.status) }]}>{booking.status}</Text>
              </View>
            </View>
            <Text style={s.bookingDetail}>{booking.productName ?? "Experience"}</Text>
            <View style={s.bookingMeta}>
              <Text style={s.metaText}>{new Date(booking.checkIn ?? booking.date).toLocaleDateString()}</Text>
              <Text style={s.metaText}>{booking.nights ?? 1} night(s)</Text>
              <Text style={s.metaPrice}>${booking.total?.toFixed(2) ?? "0.00"}</Text>
            </View>
          </View>
        ))
      )}
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a", padding: 16 },
  filterRow: { flexDirection: "row", gap: 6, marginTop: 8, marginBottom: 16 },
  filterBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: "#1a1a2e" },
  filterActive: { backgroundColor: "#6c63ff" },
  filterText: { color: "#888", fontSize: 11, fontWeight: "500" },
  filterActiveText: { color: "#fff" },
  emptyState: { backgroundColor: "#1a1a2e", borderRadius: 14, padding: 30, alignItems: "center", marginTop: 40 },
  emptyEmoji: { fontSize: 40, marginBottom: 8 },
  emptyText: { color: "#888", fontSize: 14 },
  bookingCard: { backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, marginBottom: 10 },
  bookingHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  guestName: { color: "#fff", fontSize: 14, fontWeight: "600" },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: "600", textTransform: "capitalize" },
  bookingDetail: { color: "#888", fontSize: 12, marginTop: 6 },
  bookingMeta: { flexDirection: "row", gap: 12, marginTop: 8 },
  metaText: { color: "#666", fontSize: 11 },
  metaPrice: { color: "#22c55e", fontSize: 12, fontWeight: "600" },
});
