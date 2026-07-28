/**
 * Tourist Experience — Discover, Map, History, Loyalty, Wallet tabs.
 */
import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator, TextInput } from "react-native";
import { useApiData } from "../../hooks/useApiData";

export function TouristExperience({ navigation }: any) {
  const [activeTab, setActiveTab] = useState("discover");
  const [search, setSearch] = useState("");
  const { data, loading, error, refresh, refreshing } = useApiData<any>({
    endpoint: "tourist.discover",
    defaultValue: { items: [] },
  });
  const items: any[] = data?.items ?? (Array.isArray(data) ? data : []);
  const filtered = items.filter((e: any) =>
    !search || (e.name ?? "").toLowerCase().includes(search.toLowerCase())
  );
  const tabs = ["Discover", "Map", "History", "Loyalty", "Wallet"];
  return (
    <View style={s.container}>
      <View style={s.tabBar}>
        {tabs.map(tab => (
          <TouchableOpacity
            key={tab}
            style={[s.tab, activeTab === tab.toLowerCase() && s.tabActive]}
            onPress={() => setActiveTab(tab.toLowerCase())}
          >
            <Text style={[s.tabText, activeTab === tab.toLowerCase() && s.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {activeTab === "discover" && (
        <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#6c63ff" />}>
          <TextInput
            style={s.search}
            placeholder="Search experiences..."
            placeholderTextColor="#666"
            value={search}
            onChangeText={setSearch}
          />
          {loading && !error ? (
            <ActivityIndicator size="large" color="#6c63ff" style={{ marginTop: 40 }} />
          ) : error ? (
            <Text style={s.errorText}>{error}</Text>
          ) : filtered.length === 0 ? (
            <View style={s.empty}><Text style={s.emptyEmoji}>🌍</Text><Text style={s.emptyText}>No experiences found</Text></View>
          ) : (
            filtered.map((exp: any, idx: number) => (
              <TouchableOpacity key={exp.id ?? idx} style={s.card} onPress={() => navigation.navigate("ProductCatalog", { id: exp.id })}>
                <View style={s.cardRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.cardTitle}>{exp.name ?? "Experience"}</Text>
                    <Text style={s.cardSub}>{exp.location ?? exp.category ?? ""}</Text>
                  </View>
                  <View>
                    <Text style={s.price}>{exp.currency ?? "USD"} {exp.price ?? "—"}</Text>
                    {exp.rating && <Text style={s.rating}>⭐ {exp.rating}</Text>}
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
      {activeTab !== "discover" && (
        <View style={s.center}>
          <Text style={s.comingSoon}>{tabs.find(t => t.toLowerCase() === activeTab)} coming soon</Text>
        </View>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a" },
  tabBar: { flexDirection: "row", backgroundColor: "#1a1a2e", paddingHorizontal: 8 },
  tab: { flex: 1, paddingVertical: 12, alignItems: "center" },
  tabActive: { borderBottomWidth: 2, borderBottomColor: "#6c63ff" },
  tabText: { color: "#666", fontSize: 12, fontWeight: "500" },
  tabTextActive: { color: "#6c63ff" },
  search: { backgroundColor: "#1a1a2e", borderRadius: 10, padding: 12, color: "#fff", margin: 16, borderWidth: 1, borderColor: "#2d2d44" },
  errorText: { color: "#ef4444", textAlign: "center", padding: 16 },
  empty: { alignItems: "center", padding: 40 },
  emptyEmoji: { fontSize: 36, marginBottom: 8 },
  emptyText: { color: "#888", fontSize: 14 },
  card: { backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, marginHorizontal: 16, marginBottom: 10 },
  cardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  cardTitle: { fontSize: 14, fontWeight: "600", color: "#fff" },
  cardSub: { fontSize: 12, color: "#888", marginTop: 4 },
  price: { color: "#6c63ff", fontSize: 13, fontWeight: "600" },
  rating: { color: "#f59e0b", fontSize: 11, marginTop: 2, textAlign: "right" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  comingSoon: { color: "#888", fontSize: 14 },
});
