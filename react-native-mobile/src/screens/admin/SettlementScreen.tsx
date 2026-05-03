import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, RefreshControl, SafeAreaView } from "react-native";
import Card from "../../components/Card";
import { api, type SettlementData } from "../../services/api";
import { colors, spacing, fontSize } from "../../theme";

export default function SettlementScreen() {
  const [data, setData] = useState<SettlementData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => { try { setData(await api.getSettlementData()); } catch {} };
  useEffect(() => { load(); }, []);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
        <Text style={styles.title}>Settlement Console</Text>
        <Card>
          <Text style={styles.total}>{data?.currency} {data?.totalAmount.toLocaleString() ?? "0"}</Text>
          <Text style={styles.label}>Total Volume</Text>
        </Card>
        <View style={styles.row}>
          <Card style={{ flex: 1 }}>
            <Text style={[styles.stat, { color: colors.warning }]}>{data?.pending ?? 0}</Text>
            <Text style={styles.statLabel}>Pending</Text>
          </Card>
          <Card style={{ flex: 1 }}>
            <Text style={[styles.stat, { color: colors.success }]}>{data?.completed ?? 0}</Text>
            <Text style={styles.statLabel}>Completed</Text>
          </Card>
          <Card style={{ flex: 1 }}>
            <Text style={[styles.stat, { color: colors.error }]}>{data?.failed ?? 0}</Text>
            <Text style={styles.statLabel}>Failed</Text>
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.md },
  title: { color: colors.text, fontSize: fontSize.xxl, fontWeight: "bold", marginBottom: spacing.md },
  total: { color: colors.text, fontSize: 36, fontWeight: "bold" },
  label: { color: colors.textSecondary },
  row: { flexDirection: "row", gap: spacing.sm },
  stat: { fontSize: fontSize.xxl, fontWeight: "bold" },
  statLabel: { color: colors.textMuted, fontSize: fontSize.sm },
});
