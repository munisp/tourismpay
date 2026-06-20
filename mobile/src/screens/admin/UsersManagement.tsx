/**
 * UsersManagement — User list from tRPC API with search and role display.
 */
import React, { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, TextInput, StyleSheet, RefreshControl, ActivityIndicator } from "react-native";
import { adminAPI } from "../../services/api";

export function UsersManagement() {
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try { const data = await adminAPI.getUsers(); setUsers(data.users ?? []); } catch {} finally { setLoading(false); }
  }, [search]);

  useEffect(() => { setLoading(true); loadData(); }, [loadData]);
  const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

  if (loading && users.length === 0) return <View style={[s.container, { justifyContent: "center", alignItems: "center" }]}><ActivityIndicator size="large" color="#6c63ff" /></View>;

  return (
    <ScrollView style={s.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6c63ff" />}>
      <TextInput style={s.searchInput} placeholder="Search users..." placeholderTextColor="#666" value={search} onChangeText={setSearch} />
      <Text style={s.count}>{users.length} users</Text>
      {users.map((user) => (
        <View key={user.id} style={s.card}>
          <View style={s.avatar}><Text style={s.avatarText}>{(user.name ?? user.email ?? "?")[0].toUpperCase()}</Text></View>
          <View style={s.info}>
            <Text style={s.name}>{user.name ?? user.email}</Text>
            <Text style={s.role}>{user.role ?? "user"} | {user.email}</Text>
          </View>
          <View style={[s.dot, { backgroundColor: user.active !== false ? "#22c55e" : "#ef4444" }]} />
        </View>
      ))}
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a", padding: 16 },
  searchInput: { backgroundColor: "#1a1a2e", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: "#fff", fontSize: 14, marginTop: 8 },
  count: { color: "#888", fontSize: 12, marginTop: 10, marginBottom: 10 },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: "#1a1a2e", borderRadius: 12, padding: 12, marginBottom: 8, gap: 12 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#6c63ff33", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#6c63ff", fontSize: 14, fontWeight: "700" },
  info: { flex: 1 },
  name: { color: "#fff", fontSize: 13, fontWeight: "500" },
  role: { color: "#888", fontSize: 10, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
