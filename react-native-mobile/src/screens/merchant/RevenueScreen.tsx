import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, RefreshControl, SafeAreaView } from "react-native";
import Card from "../../components/Card";
import { api, type RevenueData } from "../../services/api";
import { colors, spacing, fontSize } from "../../theme";

export default function RevenueScreen() {
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try { setRevenue(await api.getMerchantRevenue()); } catch { /* offline */ }
  };
  useEffect(() => { load(); }, []);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
        <Text style={styles.title}>Revenue Analytics</Text>
        <Card>
          <Text style={styles.label}>Total Revenue</Text>
          <Text style={styles.amount}>{revenue?.currency} {revenue?.totalRevenue.toLocaleString() ?? "0"}</Text>
          <Text style={styles.sub}>{revenue?.transactions ?? 0} transactions</Text>
        </Card>
        <Card>
          <Text style={styles.label}>Category Breakdown</Text>
          {revenue?.breakdown.map((b) => (
            <View key={b.category} style={styles.row}>
              <Text style={styles.cat}>{b.category}</Text>
              <Text style={styles.val}>{revenue.currency} {b.amount.toLocaleString()}</Text>
            </View>
          ))}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.md },
  title: { color: colors.text, fontSize: fontSize.xxl, fontWeight: "bold", marginBottom: spacing.md },
  label: { color: colors.textSecondary, fontSize: fontSize.sm, marginBottom: spacing.xs },
  amount: { color: colors.text, fontSize: 36, fontWeight: "bold" },
  sub: { color: colors.textMuted, fontSize: fontSize.md },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border },
  cat: { color: colors.text, fontSize: fontSize.md },
  val: { color: colors.secondary, fontWeight: "600" },
});
