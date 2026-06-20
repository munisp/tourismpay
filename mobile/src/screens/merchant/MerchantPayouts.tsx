/**
 * MerchantPayouts — Payout history and balance from tRPC API.
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator,
} from "react-native";
import { merchantAPI } from "../../services/api";

export function MerchantPayouts() {
  const [payouts, setPayouts] = useState<any[]>([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const data = await merchantAPI.getPayouts();
      setPayouts(Array.isArray(data) ? data : []);
      setBalance(0);
    } catch {
      // Offline
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

  if (loading) {
    return <View style={[s.container, { justifyContent: "center", alignItems: "center" }]}><ActivityIndicator size="large" color="#6c63ff" /></View>;
  }

  return (
    <ScrollView style={s.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6c63ff" />}>
      <View style={s.balanceCard}>
        <Text style={s.balanceLabel}>Pending Balance</Text>
        <Text style={s.balanceAmount}>${balance.toLocaleString()}</Text>
        <Text style={s.nextPayout}>Next payout in ~2 business days</Text>
      </View>

      <Text style={s.section}>Recent Payouts</Text>
      {payouts.length === 0 ? (
        <View style={s.emptyState}>
          <Text style={s.emptyEmoji}>💰</Text>
          <Text style={s.emptyText}>No payouts yet</Text>
        </View>
      ) : (
        payouts.map((payout) => (
          <View key={payout.id} style={s.payoutCard}>
            <View style={s.payoutRow}>
              <Text style={s.payoutAmount}>${payout.amount?.toFixed(2)}</Text>
              <View style={[s.statusBadge, payout.status === "completed" ? s.completed : s.pending]}>
                <Text style={s.statusText}>{payout.status}</Text>
              </View>
            </View>
            <Text style={s.payoutDate}>{new Date(payout.createdAt).toLocaleDateString()} via {payout.method ?? "Bank Transfer"}</Text>
          </View>
        ))
      )}
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a", padding: 16 },
  balanceCard: { backgroundColor: "#1a1a2e", borderRadius: 16, padding: 24, alignItems: "center", marginTop: 8 },
  balanceLabel: { color: "#888", fontSize: 12 },
  balanceAmount: { color: "#fff", fontSize: 32, fontWeight: "700", marginTop: 4 },
  nextPayout: { color: "#6c63ff", fontSize: 11, marginTop: 8 },
  section: { color: "#fff", fontSize: 16, fontWeight: "600", marginTop: 24, marginBottom: 12 },
  emptyState: { backgroundColor: "#1a1a2e", borderRadius: 14, padding: 30, alignItems: "center" },
  emptyEmoji: { fontSize: 36, marginBottom: 8 },
  emptyText: { color: "#888", fontSize: 14 },
  payoutCard: { backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, marginBottom: 8 },
  payoutRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  payoutAmount: { color: "#fff", fontSize: 16, fontWeight: "600" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  completed: { backgroundColor: "rgba(34,197,94,0.15)" },
  pending: { backgroundColor: "rgba(245,158,11,0.15)" },
  statusText: { fontSize: 10, fontWeight: "600", color: "#22c55e" },
  payoutDate: { color: "#888", fontSize: 11, marginTop: 6 },
});
