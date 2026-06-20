/**
 * MerchantRevenue — Revenue analytics from tRPC API with period selector.
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator,
} from "react-native";
import { merchantAPI } from "../../services/api";

type Period = "day" | "week" | "month" | "year";

export function MerchantRevenue() {
  const [revenue, setRevenue] = useState<any>(null);
  const [period, setPeriod] = useState<Period>("week");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const data = await merchantAPI.getRevenue(period);
      setRevenue(data);
    } catch {
      // Offline
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { setLoading(true); loadData(); }, [loadData]);

  const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

  if (loading) {
    return <View style={[s.container, { justifyContent: "center", alignItems: "center" }]}><ActivityIndicator size="large" color="#6c63ff" /></View>;
  }

  return (
    <ScrollView style={s.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6c63ff" />}>
      {/* Period Selector */}
      <View style={s.periodRow}>
        {(["day", "week", "month", "year"] as Period[]).map((p) => (
          <TouchableOpacity key={p} style={[s.periodBtn, period === p && s.periodActive]} onPress={() => setPeriod(p)}>
            <Text style={[s.periodText, period === p && s.periodActiveText]}>{p.charAt(0).toUpperCase() + p.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Revenue Summary */}
      <View style={s.summaryCard}>
        <Text style={s.summaryLabel}>Total Revenue</Text>
        <Text style={s.summaryAmount}>${(revenue?.total ?? 0).toLocaleString()}</Text>
        <Text style={[s.change, (revenue?.changePercent ?? 0) >= 0 ? s.positive : s.negative]}>
          {(revenue?.changePercent ?? 0) >= 0 ? "+" : ""}{revenue?.changePercent ?? 0}% vs prev period
        </Text>
      </View>

      {/* Breakdown */}
      <View style={s.breakdownRow}>
        <View style={s.breakdownCard}>
          <Text style={s.breakdownLabel}>Transactions</Text>
          <Text style={s.breakdownValue}>{revenue?.transactionCount ?? 0}</Text>
        </View>
        <View style={s.breakdownCard}>
          <Text style={s.breakdownLabel}>Avg Ticket</Text>
          <Text style={s.breakdownValue}>${(revenue?.avgTicket ?? 0).toFixed(2)}</Text>
        </View>
      </View>

      <View style={s.breakdownRow}>
        <View style={s.breakdownCard}>
          <Text style={s.breakdownLabel}>QR Payments</Text>
          <Text style={s.breakdownValue}>${(revenue?.qrRevenue ?? 0).toLocaleString()}</Text>
        </View>
        <View style={s.breakdownCard}>
          <Text style={s.breakdownLabel}>Bookings</Text>
          <Text style={s.breakdownValue}>${(revenue?.bookingRevenue ?? 0).toLocaleString()}</Text>
        </View>
      </View>

      {/* Top Products */}
      {revenue?.topProducts && revenue.topProducts.length > 0 && (
        <>
          <Text style={s.section}>Top Products</Text>
          {revenue.topProducts.map((product: any, i: number) => (
            <View key={i} style={s.productRow}>
              <Text style={s.productRank}>#{i + 1}</Text>
              <View style={s.productInfo}>
                <Text style={s.productName}>{product.name}</Text>
                <Text style={s.productSales}>{product.salesCount} sales</Text>
              </View>
              <Text style={s.productRevenue}>${product.revenue.toLocaleString()}</Text>
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
  periodRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  periodBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: "#1a1a2e", alignItems: "center" },
  periodActive: { backgroundColor: "#6c63ff" },
  periodText: { color: "#888", fontSize: 12, fontWeight: "500" },
  periodActiveText: { color: "#fff" },
  summaryCard: { backgroundColor: "#1a1a2e", borderRadius: 16, padding: 24, alignItems: "center", marginTop: 16 },
  summaryLabel: { color: "#888", fontSize: 12 },
  summaryAmount: { color: "#fff", fontSize: 36, fontWeight: "700", marginTop: 4 },
  change: { fontSize: 13, marginTop: 8 },
  positive: { color: "#22c55e" },
  negative: { color: "#ef4444" },
  breakdownRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  breakdownCard: { flex: 1, backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, alignItems: "center" },
  breakdownLabel: { color: "#888", fontSize: 10, marginBottom: 4 },
  breakdownValue: { color: "#fff", fontSize: 16, fontWeight: "600" },
  section: { color: "#fff", fontSize: 16, fontWeight: "600", marginTop: 24, marginBottom: 12 },
  productRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#1a1a2e", borderRadius: 10, padding: 12, marginBottom: 8 },
  productRank: { color: "#6c63ff", fontSize: 14, fontWeight: "700", width: 30 },
  productInfo: { flex: 1 },
  productName: { color: "#fff", fontSize: 13, fontWeight: "500" },
  productSales: { color: "#888", fontSize: 11 },
  productRevenue: { color: "#22c55e", fontSize: 14, fontWeight: "600" },
});
