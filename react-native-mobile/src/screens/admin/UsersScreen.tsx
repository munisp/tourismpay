import React, { useState, useEffect } from "react";
import {
  View, Text, FlatList, StyleSheet, RefreshControl, SafeAreaView, TextInput,
} from "react-native";
import Card from "../../components/Card";
import StatusBadge from "../../components/StatusBadge";
import { api, type AdminUser } from "../../services/api";
import { colors, spacing, fontSize, borderRadius } from "../../theme";

export default function UsersScreen() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => { try { const d = await api.getUsers(); if (Array.isArray(d)) setUsers(d); } catch {} };
  useEffect(() => { load(); }, []);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const filtered = users.filter((u) =>
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.role.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Users ({users.length})</Text>
        <TextInput style={styles.search} placeholder="Search users..." placeholderTextColor={colors.textMuted}
          value={search} onChangeText={setSearch} />
      </View>
      <FlatList data={filtered} keyExtractor={(i) => i.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Card>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.username}</Text>
                <Text style={styles.email}>{item.email}</Text>
                <Text style={styles.meta}>Last login: {item.lastLogin}</Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <StatusBadge status={item.role} variant="info" />
                <StatusBadge status={item.status} variant={item.status === "active" ? "success" : "error"} />
              </View>
            </View>
          </Card>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No users found</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { padding: spacing.md },
  title: { color: colors.text, fontSize: fontSize.xxl, fontWeight: "bold", marginBottom: spacing.sm },
  search: { backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.md, color: colors.text, borderWidth: 1, borderColor: colors.border },
  list: { padding: spacing.md },
  row: { flexDirection: "row" },
  name: { color: colors.text, fontSize: fontSize.lg, fontWeight: "600" },
  email: { color: colors.textSecondary, fontSize: fontSize.sm },
  meta: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 4 },
  empty: { color: colors.textMuted, textAlign: "center", padding: spacing.xl },
});
