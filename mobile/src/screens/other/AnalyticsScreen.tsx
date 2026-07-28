/**
 * AnalyticsScreen — Cross-platform analytics with visual charts (PWA parity).
 * Uses pure React Native View-based bar charts (no external charting library needed).
 */
import React, { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator } from "react-native";
import { adminAPI } from "../../services/api";

function BarChart({ data, maxVal, color = "#6c63ff" }: { data: { label: string; value: number }[]; maxVal: number; color?: string }) {
  if (!data.length) return null;
  return (
    <View style={{ marginTop: 8 }}>
      {data.map((d, i) => (
        <View key={i} style={{ marginBottom: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ color: "#888", fontSize: 10, width: 60 }} numberOfLines={1}>{d.label}</Text>
            <View style={{ flex: 1, height: 18, backgroundColor: "#2a2a3e", borderRadius: 4, overflow: "hidden" }}>
              <View style={{ width: `${maxVal > 0 ? (d.value / maxVal) * 100 : 0}%`, height: 18, backgroundColor: color, borderRadius: 4 }} />
            </View>
            <Text style={{ color: "#fff", fontSize: 10, width: 40, textAlign: "right" }}>{d.value}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export function AnalyticsScreen({ navigation }: any) {
  const [data, setData] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [dau, setDau] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<"overview" | "health" | "users" | "kyb">("overview");

  const load = useCallback(async () => {
    try {
      const [summary, h, d] = await Promise.all([
        adminAPI.getAnalytics?.() ?? {},
        adminAPI.getPlatformHealth?.() ?? {},
        adminAPI.getDAUByRole?.() ?? {},
      ]);
      setData(summary);
      setHealth(h);
      setDau(d);
    } catch { /* empty state */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const TABS = [
    { id: "overview" as const, label: "Overview", icon: "📊" },
    { id: "health" as const, label: "Health", icon: "💚" },
    { id: "users" as const, label: "Users", icon: "👥" },
    { id: "kyb" as const, label: "KYB", icon: "📋" },
  ];

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#6c63ff" /></View>;

  const kpis = [
    { label: "Total Users", value: data?.totalUsers ?? 0, icon: "👥", color: "#6c63ff" },
    { label: "Active Wallets", value: data?.activeWallets ?? 0, icon: "💳", color: "#10b981" },
    { label: "TX Volume (30d)", value: data?.txVolume30d ?? 0, icon: "💹", color: "#f59e0b" },
    { label: "KYB Rate", value: `${data?.kybRate ?? 0}%`, icon: "✅", color: "#3b82f6" },
  ];

  const healthData = (health?.services ?? []).map((s: any) => ({ label: s.name, value: s.score ?? 0 }));
  const dauData = (dau?.byRole ?? []).map((r: any) => ({ label: r.role, value: r.count ?? 0 }));
  const maxHealth = Math.max(...healthData.map((d: any) => d.value), 100);
  const maxDau = Math.max(...dauData.map((d: any) => d.value), 1);

  return (
    <View style={s.root}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabBar} contentContainerStyle={s.tabBarContent}>
        {TABS.map(t => (
          <TouchableOpacity key={t.id} style={[s.tab, tab === t.id && s.tabActive]} onPress={() => setTab(t.id)}>
            <Text style={s.tabIcon}>{t.icon}</Text>
            <Text style={[s.tabLabel, tab === t.id && s.tabLabelActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <ScrollView style={s.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#6c63ff" />}>
        {tab === "overview" && (
          <>
            <Text style={s.sectionTitle}>Platform KPIs</Text>
            <View style={s.kpiGrid}>
              {kpis.map((k, i) => (
                <View key={i} style={[s.kpiCard, { borderColor: k.color + "40" }]}>
                  <Text style={s.kpiIcon}>{k.icon}</Text>
                  <Text style={[s.kpiValue, { color: k.color }]}>{typeof k.value === "number" ? k.value.toLocaleString() : k.value}</Text>
                  <Text style={s.kpiLabel}>{k.label}</Text>
                </View>
              ))}
            </View>
            <View style={s.card}>
              <Text style={s.cardTitle}>QR Payment Volume (30d)</Text>
              <Text style={[s.bigNum, { color: "#f59e0b" }]}>{(data?.qrVolume30d ?? 0).toLocaleString()}</Text>
            </View>
            <View style={s.card}>
              <Text style={s.cardTitle}>Revenue (30d)</Text>
              <Text style={[s.bigNum, { color: "#10b981" }]}>${(data?.revenue30d ?? 0).toLocaleString()}</Text>
            </View>
          </>
        )}
        {tab === "health" && (
          <>
            <Text style={s.sectionTitle}>Service Health Scores</Text>
            {healthData.length === 0 ? <View style={s.empty}><Text style={s.emptyText}>No health data</Text></View> : (
              <View style={s.card}><BarChart data={healthData} maxVal={maxHealth} color="#10b981" /></View>
            )}
          </>
        )}
        {tab === "users" && (
          <>
            <Text style={s.sectionTitle}>Daily Active Users by Role</Text>
            {dauData.length === 0 ? <View style={s.empty}><Text style={s.emptyText}>No DAU data</Text></View> : (
              <View style={s.card}><BarChart data={dauData} maxVal={maxDau} color="#6c63ff" /></View>
            )}
          </>
        )}
        {tab === "kyb" && (
          <>
            <Text style={s.sectionTitle}>KYB Completion Rate</Text>
            <View style={s.card}>
              <Text style={s.cardSub}>Overall KYB Rate</Text>
              <Text style={[s.bigNum, { color: "#3b82f6" }]}>{data?.kybRate ?? 0}%</Text>
              <View style={{ height: 8, backgroundColor: "#2a2a3e", borderRadius: 4, marginTop: 8, overflow: "hidden" }}>
                <View style={{ width: `${data?.kybRate ?? 0}%`, height: 8, backgroundColor: "#3b82f6", borderRadius: 4 }} />
              </View>
            </View>
            {(data?.kybByCountry ?? []).map((c: any, i: number) => (
              <View key={i} style={s.card}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={s.cardTitle}>{c.country}</Text>
                  <Text style={{ color: "#3b82f6", fontWeight: "700" }}>{c.rate}%</Text>
                </View>
                <View style={{ height: 4, backgroundColor: "#2a2a3e", borderRadius: 2, marginTop: 6, overflow: "hidden" }}>
                  <View style={{ width: `${c.rate}%`, height: 4, backgroundColor: "#3b82f6", borderRadius: 2 }} />
                </View>
              </View>
            ))}
          </>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0f0f1a" },
  center: { flex: 1, backgroundColor: "#0f0f1a", justifyContent: "center", alignItems: "center" },
  container: { flex: 1, padding: 16 },
  tabBar: { backgroundColor: "#1a1a2e", borderBottomWidth: 1, borderBottomColor: "#2a2a3e" },
  tabBarContent: { paddingHorizontal: 8, paddingVertical: 8, gap: 4 },
  tab: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  tabActive: { backgroundColor: "#6c63ff20", borderWidth: 1, borderColor: "#6c63ff" },
  tabIcon: { fontSize: 14 },
  tabLabel: { color: "#888", fontSize: 12, fontWeight: "500" },
  tabLabelActive: { color: "#6c63ff" },
  sectionTitle: { color: "#fff", fontSize: 15, fontWeight: "700", marginBottom: 12 },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  kpiCard: { flex: 1, minWidth: "45%", backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, alignItems: "center", borderWidth: 1 },
  kpiIcon: { fontSize: 24, marginBottom: 6 },
  kpiValue: { fontSize: 22, fontWeight: "700" },
  kpiLabel: { color: "#888", fontSize: 10, marginTop: 4, textAlign: "center" },
  card: { backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, marginBottom: 8 },
  cardTitle: { color: "#e5e7eb", fontSize: 13, fontWeight: "600" },
  cardSub: { color: "#888", fontSize: 11 },
  bigNum: { fontSize: 28, fontWeight: "700", marginTop: 4 },
  empty: { alignItems: "center", padding: 40 },
  emptyText: { color: "#888", fontSize: 14 },
});
