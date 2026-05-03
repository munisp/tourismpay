import React, { useState, useEffect } from "react";
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, SafeAreaView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Card from "../../components/Card";
import { api, type LoyaltyData } from "../../services/api";
import { colors, spacing, fontSize, borderRadius } from "../../theme";

const TIERS = ["Bronze", "Silver", "Gold", "Platinum", "Diamond"];

export default function LoyaltyScreen() {
  const [loyalty, setLoyalty] = useState<LoyaltyData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const data = await api.getLoyaltyPoints();
      setLoyalty(data);
    } catch { /* offline */ }
  };

  useEffect(() => { load(); }, []);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const tierIndex = TIERS.indexOf(loyalty?.tier ?? "Bronze");
  const progress = loyalty ? (loyalty.points / loyalty.nextTierPoints) * 100 : 0;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <Text style={styles.title}>Loyalty & Rewards</Text>

        <Card>
          <View style={styles.pointsHeader}>
            <Ionicons name="star" size={32} color={colors.warning} />
            <Text style={styles.points}>{loyalty?.points.toLocaleString() ?? "0"}</Text>
            <Text style={styles.pointsLabel}>points</Text>
          </View>
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Tier Progress</Text>
          <View style={styles.tierRow}>
            {TIERS.map((tier, i) => (
              <View key={tier} style={[styles.tierDot, i <= tierIndex && styles.tierDotActive]}>
                <Text style={[styles.tierText, i <= tierIndex && styles.tierTextActive]}>{tier[0]}</Text>
              </View>
            ))}
          </View>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${Math.min(progress, 100)}%` }]} />
          </View>
          <Text style={styles.progressText}>
            {loyalty?.points ?? 0} / {loyalty?.nextTierPoints ?? 1000} to {TIERS[Math.min(tierIndex + 1, TIERS.length - 1)]}
          </Text>
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          {loyalty?.history.slice(0, 10).map((tx) => (
            <View key={tx.id} style={styles.historyRow}>
              <View style={styles.historyIcon}>
                <Ionicons
                  name={tx.points > 0 ? "add-circle" : "remove-circle"}
                  size={20}
                  color={tx.points > 0 ? colors.success : colors.error}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.historyDesc}>{tx.description}</Text>
                <Text style={styles.historyDate}>{tx.date}</Text>
              </View>
              <Text style={[styles.historyPoints, { color: tx.points > 0 ? colors.success : colors.error }]}>
                {tx.points > 0 ? "+" : ""}{tx.points}
              </Text>
            </View>
          ))}
          {!loyalty?.history.length && <Text style={styles.empty}>No activity yet</Text>}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.md },
  title: { color: colors.text, fontSize: fontSize.xxl, fontWeight: "bold", marginBottom: spacing.md },
  pointsHeader: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
  points: { color: colors.text, fontSize: 48, fontWeight: "bold" },
  pointsLabel: { color: colors.textSecondary, fontSize: fontSize.lg },
  sectionTitle: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: "600", marginBottom: spacing.sm, textTransform: "uppercase" },
  tierRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.sm },
  tierDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceLight, justifyContent: "center", alignItems: "center" },
  tierDotActive: { backgroundColor: colors.primary },
  tierText: { color: colors.textMuted, fontSize: fontSize.xs, fontWeight: "bold" },
  tierTextActive: { color: colors.white },
  progressBar: { height: 8, backgroundColor: colors.surfaceLight, borderRadius: 4, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.primary, borderRadius: 4 },
  progressText: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: spacing.xs, textAlign: "center" },
  historyRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  historyIcon: { marginRight: spacing.sm },
  historyDesc: { color: colors.text, fontSize: fontSize.md },
  historyDate: { color: colors.textMuted, fontSize: fontSize.xs },
  historyPoints: { fontSize: fontSize.md, fontWeight: "bold" },
  empty: { color: colors.textMuted, textAlign: "center", padding: spacing.lg },
});
