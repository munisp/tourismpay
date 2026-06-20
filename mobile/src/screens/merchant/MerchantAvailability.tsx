/**
 * MerchantAvailability — Availability calendar from tRPC API.
 */
import React, { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator } from "react-native";
import { merchantAPI } from "../../services/api";

export function MerchantAvailability() {
  const [availability, setAvailability] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try { const data = await merchantAPI.getAvailability(); setAvailability(data); } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

  if (loading) return <View style={[s.container, { justifyContent: "center", alignItems: "center" }]}><ActivityIndicator size="large" color="#6c63ff" /></View>;

  const slots = availability?.slots ?? [];

  return (
    <ScrollView style={s.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6c63ff" />}>
      <Text style={s.title}>Availability</Text>
      <View style={s.summary}>
        <View style={s.summaryItem}><Text style={s.summaryNum}>{availability?.totalSlots ?? 0}</Text><Text style={s.summaryLabel}>Total Slots</Text></View>
        <View style={s.summaryItem}><Text style={s.summaryNum}>{availability?.bookedSlots ?? 0}</Text><Text style={s.summaryLabel}>Booked</Text></View>
        <View style={s.summaryItem}><Text style={[s.summaryNum, { color: "#22c55e" }]}>{availability?.availableSlots ?? 0}</Text><Text style={s.summaryLabel}>Available</Text></View>
      </View>

      {slots.length > 0 && (
        <>
          <Text style={s.section}>This Week</Text>
          {slots.map((slot: any, i: number) => (
            <View key={i} style={s.slotCard}>
              <Text style={s.slotDay}>{slot.day}</Text>
              <View style={s.slotBar}>
                <View style={[s.slotFill, { width: `${(slot.booked / slot.total) * 100}%` }]} />
              </View>
              <Text style={s.slotText}>{slot.booked}/{slot.total}</Text>
            </View>
          ))}
        </>
      )}
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a", padding: 16 },
  title: { color: "#fff", fontSize: 18, fontWeight: "600", marginTop: 8, marginBottom: 16 },
  summary: { flexDirection: "row", gap: 8, marginBottom: 20 },
  summaryItem: { flex: 1, backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, alignItems: "center" },
  summaryNum: { color: "#fff", fontSize: 20, fontWeight: "700" },
  summaryLabel: { color: "#888", fontSize: 10, marginTop: 4 },
  section: { color: "#fff", fontSize: 14, fontWeight: "600", marginBottom: 10 },
  slotCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#1a1a2e", borderRadius: 10, padding: 12, marginBottom: 6, gap: 10 },
  slotDay: { color: "#fff", fontSize: 12, fontWeight: "500", width: 40 },
  slotBar: { flex: 1, height: 6, backgroundColor: "#333", borderRadius: 3, overflow: "hidden" },
  slotFill: { height: "100%", backgroundColor: "#6c63ff", borderRadius: 3 },
  slotText: { color: "#888", fontSize: 11, width: 40, textAlign: "right" },
});
