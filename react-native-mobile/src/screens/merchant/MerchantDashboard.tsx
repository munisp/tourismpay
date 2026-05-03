import React, { useState, useEffect } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, SafeAreaView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Card from "../../components/Card";
import ConnectivityBanner from "../../components/ConnectivityBanner";
import { api, type RevenueData } from "../../services/api";
import { colors, spacing, fontSize, borderRadius } from "../../theme";

const ACTIONS = [
  { key: "products", icon: "pricetag", label: "Products", tab: "Products" },
  { key: "bookings", icon: "calendar", label: "Bookings", tab: "Bookings" },
  { key: "qr", icon: "qr-code", label: "QR Codes", tab: "QRCodes" },
  { key: "staff", icon: "people", label: "Staff", screen: "StaffScreen" },
  { key: "payouts", icon: "cash", label: "Payouts", screen: "PayoutsScreen" },
  { key: "kyb", icon: "document-text", label: "KYB", screen: "KYBOnboarding" },
] as const;

export default function MerchantDashboard({ navigation }: { navigation: any }) {
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const data = await api.getMerchantRevenue();
      setRevenue(data);
    } catch { /* offline */ }
  };

  useEffect(() => { load(); }, []);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <SafeAreaView style={styles.container}>
      <ConnectivityBanner />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <Text style={styles.title}>Business Dashboard</Text>

        {/* Revenue summary */}
        <Card>
          <Text style={styles.sectionTitle}>Revenue</Text>
          <Text style={styles.revenue}>
            {revenue?.currency ?? "USD"} {revenue?.totalRevenue.toLocaleString() ?? "0"}
          </Text>
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{revenue?.transactions ?? 0}</Text>
              <Text style={styles.statLabel}>Transactions</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: revenue?.trend && revenue.trend >= 0 ? colors.success : colors.error }]}>
                {revenue?.trend ? `${revenue.trend > 0 ? "+" : ""}${revenue.trend}%` : "—"}
              </Text>
              <Text style={styles.statLabel}>Trend</Text>
            </View>
          </View>
        </Card>

        {/* Revenue breakdown */}
        {revenue?.breakdown && revenue.breakdown.length > 0 && (
          <Card>
            <Text style={styles.sectionTitle}>Breakdown</Text>
            {revenue.breakdown.map((b) => (
              <View key={b.category} style={styles.breakdownRow}>
                <Text style={styles.breakdownCat}>{b.category}</Text>
                <Text style={styles.breakdownAmount}>{revenue.currency} {b.amount.toLocaleString()}</Text>
              </View>
            ))}
          </Card>
        )}

        {/* Quick actions */}
        <View style={styles.actionsGrid}>
          {ACTIONS.map((a) => (
            <TouchableOpacity key={a.key} style={styles.actionCard}
              onPress={() => "tab" in a ? navigation.navigate(a.tab) : navigation.navigate(a.screen)}>
              <Ionicons name={a.icon as never} size={28} color={colors.primary} />
              <Text style={styles.actionLabel}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.md },
  title: { color: colors.text, fontSize: fontSize.xxl, fontWeight: "bold", marginBottom: spacing.md },
  sectionTitle: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: "600", marginBottom: spacing.sm, textTransform: "uppercase" },
  revenue: { color: colors.text, fontSize: 36, fontWeight: "bold" },
  statsRow: { flexDirection: "row", marginTop: spacing.md, gap: spacing.lg },
  stat: { alignItems: "center" },
  statValue: { color: colors.text, fontSize: fontSize.xl, fontWeight: "bold" },
  statLabel: { color: colors.textMuted, fontSize: fontSize.sm },
  breakdownRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border },
  breakdownCat: { color: colors.text, fontSize: fontSize.md },
  breakdownAmount: { color: colors.secondary, fontSize: fontSize.md, fontWeight: "600" },
  actionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  actionCard: {
    width: "31%", backgroundColor: colors.surface, borderRadius: borderRadius.lg,
    padding: spacing.md, alignItems: "center", borderWidth: 1, borderColor: colors.border,
  },
  actionLabel: { color: colors.text, fontSize: fontSize.sm, marginTop: spacing.xs },
});
