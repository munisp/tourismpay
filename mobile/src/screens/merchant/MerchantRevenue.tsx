/**
 * Merchant Revenue — Revenue analytics with charts, breakdowns, and period selection.
 */
import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";

type Period = "today" | "week" | "month" | "year";

export function MerchantRevenue() {
  const [period, setPeriod] = useState<Period>("week");

  const periodData: Record<Period, { revenue: string; txCount: number; avgOrder: string; growth: string }> = {
    today: { revenue: "$0.00", txCount: 0, avgOrder: "$0.00", growth: "—" },
    week: { revenue: "$0.00", txCount: 0, avgOrder: "$0.00", growth: "—" },
    month: { revenue: "$0.00", txCount: 0, avgOrder: "$0.00", growth: "—" },
    year: { revenue: "$0.00", txCount: 0, avgOrder: "$0.00", growth: "—" },
  };

  const data = periodData[period];

  return (
    <ScrollView style={s.container}>
      {/* Period Selector */}
      <View style={s.periodRow}>
        {(["today", "week", "month", "year"] as Period[]).map((p) => (
          <TouchableOpacity
            key={p}
            style={[s.periodBtn, period === p && s.periodActive]}
            onPress={() => setPeriod(p)}
          >
            <Text style={[s.periodText, period === p && s.periodActiveText]}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Revenue Card */}
      <View style={s.mainCard}>
        <Text style={s.mainLabel}>Total Revenue</Text>
        <Text style={s.mainAmount}>{data.revenue}</Text>
        <Text style={s.mainGrowth}>{data.growth} vs previous period</Text>
      </View>

      {/* Metrics Grid */}
      <View style={s.metricsRow}>
        <View style={s.metric}><Text style={s.metricVal}>{data.txCount}</Text><Text style={s.metricLabel}>Transactions</Text></View>
        <View style={s.metric}><Text style={s.metricVal}>{data.avgOrder}</Text><Text style={s.metricLabel}>Avg Order</Text></View>
        <View style={s.metric}><Text style={s.metricVal}>{data.growth}</Text><Text style={s.metricLabel}>Growth</Text></View>
      </View>

      <View style={s.chartBox}>
        <Text style={s.chartLabel}>Revenue Chart</Text>
        <View style={s.chartArea}>
          {[0.3, 0.5, 0.7, 0.4, 0.8, 0.6, 0.9].map((h, i) => (
            <View key={i} style={[s.bar, { height: h * 100 }]} />
          ))}
        </View>
      </View>

      {/* Revenue by Source */}
      <Text style={s.section}>Revenue by Source</Text>
      {[
        { name: "Direct Bookings", pct: "42%", color: "#6c63ff" },
        { name: "Channel (Sabre)", pct: "23%", color: "#2563eb" },
        { name: "Channel (Expedia)", pct: "19%", color: "#ca8a04" },
        { name: "Walk-in (Cashier)", pct: "16%", color: "#10b981" },
      ].map((src) => (
        <View key={src.name} style={s.sourceRow}>
          <View style={[s.sourceDot, { backgroundColor: src.color }]} />
          <Text style={s.sourceName}>{src.name}</Text>
          <Text style={s.sourcePct}>{src.pct}</Text>
        </View>
      ))}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a", padding: 16 },
  periodRow: { flexDirection: "row", backgroundColor: "#1a1a2e", borderRadius: 10, padding: 4, marginTop: 8 },
  periodBtn: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 8 },
  periodActive: { backgroundColor: "#6c63ff" },
  periodText: { color: "#888", fontSize: 13, fontWeight: "500" },
  periodActiveText: { color: "#fff" },
  mainCard: { backgroundColor: "#1a1a2e", borderRadius: 16, padding: 24, marginTop: 16, alignItems: "center" },
  mainLabel: { color: "#888", fontSize: 12 },
  mainAmount: { color: "#fff", fontSize: 32, fontWeight: "700", marginTop: 4 },
  mainGrowth: { color: "#888", fontSize: 12, marginTop: 4 },
  metricsRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  metric: { flex: 1, backgroundColor: "#1a1a2e", borderRadius: 10, padding: 12, alignItems: "center" },
  metricVal: { color: "#fff", fontSize: 16, fontWeight: "700" },
  metricLabel: { color: "#888", fontSize: 10, marginTop: 4 },
  chartBox: { backgroundColor: "#1a1a2e", borderRadius: 14, padding: 16, marginTop: 16 },
  chartLabel: { color: "#fff", fontSize: 14, fontWeight: "600", marginBottom: 12 },
  chartArea: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", height: 100, gap: 4 },
  bar: { flex: 1, backgroundColor: "#6c63ff", borderRadius: 4 },
  section: { fontSize: 16, fontWeight: "600", color: "#fff", marginTop: 24, marginBottom: 12 },
  sourceRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#1a1a2e", borderRadius: 10, padding: 12, marginBottom: 8 },
  sourceDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  sourceName: { flex: 1, color: "#ccc", fontSize: 13 },
  sourcePct: { color: "#fff", fontWeight: "600", fontSize: 13 },
});
