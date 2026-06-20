/**
 * TripSummary — Trip overview and spending summary from tRPC API.
 */
import React, { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator } from "react-native";
import { touristAPI } from "../../services/api";

export function TripSummary({ route }: any) {
  const { shareToken } = route.params ?? {};
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try { const data = await touristAPI.getTripSummary(shareToken); setSummary(data); } catch {} finally { setLoading(false); }
  }, [shareToken]);

  useEffect(() => { loadData(); }, [loadData]);
  const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

  if (loading) return <View style={[s.container, { justifyContent: "center", alignItems: "center" }]}><ActivityIndicator size="large" color="#6c63ff" /></View>;
  if (!summary) return <View style={s.container}><Text style={s.emptyText}>No trip data</Text></View>;

  return (
    <ScrollView style={s.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6c63ff" />}>
      <Text style={s.title}>{summary.destination ?? "My Trip"}</Text>
      <Text style={s.subtitle}>{summary.startDate && `${new Date(summary.startDate).toLocaleDateString()} — ${new Date(summary.endDate).toLocaleDateString()}`}</Text>

      <View style={s.statsRow}>
        <View style={s.statCard}><Text style={s.statNum}>{summary.totalBookings ?? 0}</Text><Text style={s.statLabel}>Bookings</Text></View>
        <View style={s.statCard}><Text style={s.statNum}>${(summary.totalSpent ?? 0).toLocaleString()}</Text><Text style={s.statLabel}>Spent</Text></View>
        <View style={s.statCard}><Text style={s.statNum}>{summary.daysRemaining ?? 0}</Text><Text style={s.statLabel}>Days Left</Text></View>
      </View>

      {summary.categories && (
        <>
          <Text style={s.section}>Spending by Category</Text>
          {summary.categories.map((cat: any, i: number) => (
            <View key={i} style={s.catRow}>
              <Text style={s.catName}>{cat.name}</Text>
              <View style={s.catBar}><View style={[s.catFill, { width: `${(cat.amount / (summary.totalSpent || 1)) * 100}%` }]} /></View>
              <Text style={s.catAmount}>${cat.amount.toLocaleString()}</Text>
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
  title: { color: "#fff", fontSize: 22, fontWeight: "700", marginTop: 8 },
  subtitle: { color: "#888", fontSize: 12, marginTop: 4 },
  statsRow: { flexDirection: "row", gap: 8, marginTop: 16 },
  statCard: { flex: 1, backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, alignItems: "center" },
  statNum: { color: "#fff", fontSize: 18, fontWeight: "700" },
  statLabel: { color: "#888", fontSize: 10, marginTop: 4 },
  section: { color: "#fff", fontSize: 14, fontWeight: "600", marginTop: 24, marginBottom: 10 },
  catRow: { flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 8 },
  catName: { color: "#fff", fontSize: 12, width: 80 },
  catBar: { flex: 1, height: 6, backgroundColor: "#333", borderRadius: 3, overflow: "hidden" },
  catFill: { height: "100%", backgroundColor: "#6c63ff", borderRadius: 3 },
  catAmount: { color: "#888", fontSize: 11, width: 60, textAlign: "right" },
  emptyText: { color: "#888", fontSize: 14, textAlign: "center", marginTop: 60 },
});
