import React, { useState, useEffect } from "react";
import { View, Text, FlatList, StyleSheet, RefreshControl, SafeAreaView } from "react-native";
import Card from "../../components/Card";
import StatusBadge from "../../components/StatusBadge";
import { api, type Payout } from "../../services/api";
import { colors, spacing, fontSize } from "../../theme";

export default function PayoutsScreen() {
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try { const data = await api.getPayoutHistory(); if (Array.isArray(data)) setPayouts(data); } catch {}
  };
  useEffect(() => { load(); }, []);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const statusVariant = (s: string) =>
    s === "completed" ? "success" : s === "pending" ? "warning" : s === "failed" ? "error" : "default";

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Payout History</Text>
      <FlatList data={payouts} keyExtractor={(i) => i.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Card>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.amount}>{item.currency} {item.amount.toFixed(2)}</Text>
                <Text style={styles.date}>Scheduled: {item.scheduledDate}</Text>
                {item.completedDate && <Text style={styles.date}>Completed: {item.completedDate}</Text>}
              </View>
              <StatusBadge status={item.status} variant={statusVariant(item.status)} />
            </View>
          </Card>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No payouts yet</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  title: { color: colors.text, fontSize: fontSize.xxl, fontWeight: "bold", padding: spacing.md },
  list: { padding: spacing.md },
  row: { flexDirection: "row", alignItems: "center" },
  amount: { color: colors.text, fontSize: fontSize.lg, fontWeight: "bold" },
  date: { color: colors.textMuted, fontSize: fontSize.sm },
  empty: { color: colors.textMuted, textAlign: "center", padding: spacing.xl },
});
