/**
 * ARTourism — AR-enabled destinations and events (matches PWA stub level).
 */
import React from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, RefreshControl, ActivityIndicator } from "react-native";
import { useApiData } from "../../hooks/useApiData";

export function ARTourism({ navigation }: any) {
  const { data: countries, loading: cLoading, error: cError, refresh: cRefresh, refreshing: cRefreshing } = useApiData<any[]>({
    endpoint: "africa.countries",
    defaultValue: [],
  });
  const { data: events, loading: eLoading, refresh: eRefresh } = useApiData<any[]>({
    endpoint: "africa.events",
    defaultValue: [],
  });

  const handleLaunchAR = (destination?: string) => {
    Alert.alert("🥽 AR Experience", destination ? `Launching AR for ${destination}...` : "AR experience launching...", [
      { text: "OK" }
    ]);
  };

  const loading = cLoading || eLoading;
  const onRefresh = () => { cRefresh(); eRefresh(); };

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#6c63ff" /></View>;

  return (
    <ScrollView style={s.container} refreshControl={<RefreshControl refreshing={cRefreshing} onRefresh={onRefresh} tintColor="#6c63ff" />}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.title}>🥽 AR Tourism</Text>
          <Text style={s.subtitle}>Augmented reality experiences for African destinations</Text>
        </View>
        <TouchableOpacity style={s.launchBtn} onPress={() => handleLaunchAR()}>
          <Text style={s.launchBtnText}>Launch AR</Text>
        </TouchableOpacity>
      </View>

      {/* AR-enabled Destinations */}
      <Text style={s.sectionTitle}>AR-Enabled Destinations</Text>
      {(!countries || countries.length === 0) ? (
        <View style={s.empty}><Text style={s.emptyText}>No AR destinations registered yet</Text></View>
      ) : (
        <View style={s.grid}>
          {countries.slice(0, 8).map((c: any, i: number) => (
            <TouchableOpacity key={c.code ?? i} style={s.destCard} onPress={() => handleLaunchAR(c.name)}>
              <Text style={s.destFlag}>{c.flag ?? "🌍"}</Text>
              <Text style={s.destName}>{c.name}</Text>
              <Text style={s.destCode}>{c.code}</Text>
              <View style={s.arBadge}><Text style={s.arBadgeText}>AR Ready</Text></View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Upcoming AR Events */}
      <Text style={s.sectionTitle}>Upcoming AR Events</Text>
      {(!events || events.length === 0) ? (
        <View style={s.empty}><Text style={s.emptyText}>No AR events scheduled</Text></View>
      ) : (
        events.slice(0, 5).map((e: any, i: number) => (
          <View key={e.id ?? i} style={s.eventCard}>
            <View style={s.eventRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.eventName}>{e.name}</Text>
                <Text style={s.eventMeta}>{e.country} · {e.startDate ? new Date(e.startDate).toLocaleDateString() : "TBD"}</Text>
              </View>
              <TouchableOpacity style={s.eventLaunchBtn} onPress={() => handleLaunchAR(e.name)}>
                <Text style={s.eventLaunchText}>View AR</Text>
              </TouchableOpacity>
            </View>
            {e.description && <Text style={s.eventDesc}>{e.description}</Text>}
          </View>
        ))
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a", padding: 16 },
  center: { flex: 1, backgroundColor: "#0f0f1a", justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  title: { color: "#fff", fontSize: 22, fontWeight: "700" },
  subtitle: { color: "#888", fontSize: 12, marginTop: 4, maxWidth: 200 },
  launchBtn: { backgroundColor: "#6c63ff", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  launchBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  sectionTitle: { color: "#fff", fontSize: 15, fontWeight: "700", marginBottom: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 },
  destCard: { width: "47%", backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, alignItems: "center", borderWidth: 1, borderColor: "#6c63ff20" },
  destFlag: { fontSize: 32, marginBottom: 6 },
  destName: { color: "#fff", fontSize: 13, fontWeight: "600", textAlign: "center" },
  destCode: { color: "#888", fontSize: 10, marginTop: 2 },
  arBadge: { marginTop: 8, backgroundColor: "#6c63ff20", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  arBadgeText: { color: "#6c63ff", fontSize: 10, fontWeight: "600" },
  eventCard: { backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, marginBottom: 8 },
  eventRow: { flexDirection: "row", alignItems: "center" },
  eventName: { color: "#e5e7eb", fontSize: 13, fontWeight: "600" },
  eventMeta: { color: "#888", fontSize: 11, marginTop: 2 },
  eventLaunchBtn: { backgroundColor: "#6c63ff20", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: "#6c63ff40" },
  eventLaunchText: { color: "#6c63ff", fontSize: 12, fontWeight: "600" },
  eventDesc: { color: "#888", fontSize: 11, marginTop: 8, lineHeight: 16 },
  empty: { alignItems: "center", padding: 30 },
  emptyText: { color: "#888", fontSize: 14 },
});
