import React, { useState, useEffect } from "react";
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, SafeAreaView, TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Card from "../../components/Card";
import { api } from "../../services/api";
import { colors, spacing, fontSize, borderRadius } from "../../theme";

interface Settlement {
  id: string;
  status: string;
  amount: number;
  currency: string;
  createdAt: string;
}

export default function PaymentSwitchScreen() {
  const [dashboard, setDashboard] = useState<Record<string, number>>({});
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const [d, s] = await Promise.all([
        api.trpcQuery("paymentSwitch.getDashboard").catch(() => ({})),
        api.trpcQuery("paymentSwitch.listSettlements").catch(() => []),
      ]);
      setDashboard(d as Record<string, number>);
      setSettlements((s as Settlement[]) || []);
    } catch { /* handled above */ }
  };

  useEffect(() => { load(); }, []);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const statusColor = (status: string) => {
    if (status === "completed") return colors.success;
    if (status === "pending") return colors.warning;
    return colors.error;
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <Text style={styles.title}>Payment Switch</Text>

        <View style={styles.statsRow}>
          {[
            { label: "Participants", value: dashboard.totalParticipants ?? 0, icon: "people" as const, color: colors.primary },
            { label: "Settlements", value: dashboard.totalSettlements ?? 0, icon: "swap-horizontal" as const, color: colors.warning },
            { label: "Webhooks", value: dashboard.totalWebhooks ?? 0, icon: "code-slash" as const, color: colors.info },
          ].map((s) => (
            <Card key={s.label} style={styles.statCard}>
              <Ionicons name={s.icon} size={24} color={s.color} />
              <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </Card>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Recent Settlements</Text>
        {settlements.length === 0 && <Text style={styles.emptyText}>No settlements yet</Text>}
        {settlements.map((s) => (
          <Card key={s.id} style={styles.settlementCard}>
            <View style={styles.settlementRow}>
              <View>
                <Text style={styles.settlementId}>#{s.id}</Text>
                <Text style={styles.settlementDate}>{s.createdAt?.substring(0, 10)}</Text>
              </View>
              <View style={styles.settlementRight}>
                <Text style={styles.settlementAmount}>{s.currency} {s.amount?.toFixed(2)}</Text>
                <View style={[styles.badge, { backgroundColor: statusColor(s.status) + "22" }]}>
                  <Text style={[styles.badgeText, { color: statusColor(s.status) }]}>{s.status}</Text>
                </View>
              </View>
            </View>
          </Card>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  title: { fontSize: fontSize.xl, fontWeight: "700", padding: spacing.md, color: colors.text },
  statsRow: { flexDirection: "row", paddingHorizontal: spacing.sm, gap: spacing.sm },
  statCard: { flex: 1, alignItems: "center", padding: spacing.md },
  statValue: { fontSize: fontSize.lg, fontWeight: "700", marginTop: spacing.xs },
  statLabel: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: "600", paddingHorizontal: spacing.md, paddingTop: spacing.md, color: colors.text },
  settlementCard: { marginHorizontal: spacing.md, marginTop: spacing.sm, padding: spacing.md },
  settlementRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  settlementId: { fontSize: fontSize.md, fontWeight: "600", color: colors.text },
  settlementDate: { fontSize: fontSize.sm, color: colors.textSecondary },
  settlementRight: { alignItems: "flex-end" },
  settlementAmount: { fontSize: fontSize.md, fontWeight: "600", color: colors.text },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: borderRadius.sm, marginTop: 4 },
  badgeText: { fontSize: fontSize.xs, fontWeight: "600" },
  emptyText: { textAlign: "center", padding: spacing.xl, color: colors.textSecondary },
});
