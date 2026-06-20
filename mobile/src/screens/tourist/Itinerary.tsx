/**
 * Itinerary — User's trip itinerary from tRPC API.
 */
import React, { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator } from "react-native";
import { touristAPI } from "../../services/api";

export function Itinerary() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try { const data = await touristAPI.getItinerary(); setItems(data); } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

  if (loading) return <View style={[s.container, { justifyContent: "center", alignItems: "center" }]}><ActivityIndicator size="large" color="#6c63ff" /></View>;

  return (
    <ScrollView style={s.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6c63ff" />}>
      <Text style={s.title}>My Itinerary</Text>
      {items.length === 0 ? (
        <View style={s.empty}><Text style={s.emptyEmoji}>🗓</Text><Text style={s.emptyText}>No bookings yet</Text><Text style={s.emptySubtext}>Explore and book experiences to build your itinerary</Text></View>
      ) : (
        items.map((item, i) => (
          <View key={item.id ?? i} style={s.card}>
            <View style={s.timeline}>
              <View style={s.dot} />
              {i < items.length - 1 && <View style={s.line} />}
            </View>
            <View style={s.cardContent}>
              <Text style={s.itemDate}>{new Date(item.date).toLocaleDateString()}</Text>
              <Text style={s.itemName}>{item.name ?? item.experienceName}</Text>
              <Text style={s.itemDetail}>{item.location} | {item.time ?? "All day"}</Text>
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
  title: { color: "#fff", fontSize: 20, fontWeight: "700", marginTop: 8, marginBottom: 16 },
  empty: { backgroundColor: "#1a1a2e", borderRadius: 14, padding: 30, alignItems: "center", marginTop: 40 },
  emptyEmoji: { fontSize: 40, marginBottom: 8 },
  emptyText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  emptySubtext: { color: "#888", fontSize: 12, marginTop: 4, textAlign: "center" },
  card: { flexDirection: "row", marginBottom: 4 },
  timeline: { width: 20, alignItems: "center" },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#6c63ff", marginTop: 4 },
  line: { width: 2, flex: 1, backgroundColor: "#333", marginTop: 4 },
  cardContent: { flex: 1, backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, marginLeft: 10, marginBottom: 8 },
  itemDate: { color: "#6c63ff", fontSize: 10, fontWeight: "600" },
  itemName: { color: "#fff", fontSize: 14, fontWeight: "500", marginTop: 4 },
  itemDetail: { color: "#888", fontSize: 11, marginTop: 4 },
});
