import React, { useState, useEffect } from "react";
import { View, Text, FlatList, StyleSheet, RefreshControl, SafeAreaView } from "react-native";
import Card from "../../components/Card";
import StatusBadge from "../../components/StatusBadge";
import { api, type StaffMember } from "../../services/api";
import { colors, spacing, fontSize } from "../../theme";

export default function StaffScreen() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try { const data = await api.getMerchantStaff(); if (Array.isArray(data)) setStaff(data); } catch {}
  };
  useEffect(() => { load(); }, []);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Staff Management</Text>
      <FlatList data={staff} keyExtractor={(i) => i.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Card>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.email}>{item.email}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.role}>{item.role}</Text>
                <StatusBadge status={item.status} variant={item.status === "active" ? "success" : "default"} />
              </View>
            </View>
          </Card>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No staff members</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  title: { color: colors.text, fontSize: fontSize.xxl, fontWeight: "bold", padding: spacing.md },
  list: { padding: spacing.md },
  row: { flexDirection: "row" },
  name: { color: colors.text, fontSize: fontSize.lg, fontWeight: "600" },
  email: { color: colors.textSecondary, fontSize: fontSize.sm },
  role: { color: colors.primary, fontSize: fontSize.sm, marginBottom: 4 },
  empty: { color: colors.textMuted, textAlign: "center", padding: spacing.xl },
});
