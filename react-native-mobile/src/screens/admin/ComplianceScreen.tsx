import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, RefreshControl, SafeAreaView } from "react-native";
import Card from "../../components/Card";
import { api, type ComplianceData } from "../../services/api";
import { colors, spacing, fontSize } from "../../theme";

export default function ComplianceScreen() {
  const [data, setData] = useState<ComplianceData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => { try { setData(await api.getComplianceData()); } catch {} };
  useEffect(() => { load(); }, []);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const riskColor = (data?.riskScore ?? 0) < 30 ? colors.success : (data?.riskScore ?? 0) < 70 ? colors.warning : colors.error;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
        <Text style={styles.title}>Compliance</Text>
        <Card>
          <Text style={styles.section}>Risk Score</Text>
          <Text style={[styles.score, { color: riskColor }]}>{data?.riskScore ?? 0}</Text>
          <View style={styles.bar}><View style={[styles.barFill, { width: `${data?.riskScore ?? 0}%`, backgroundColor: riskColor }]} /></View>
        </Card>
        <View style={styles.row}>
          <Card style={{ flex: 1 }}>
            <Text style={[styles.stat, { color: colors.warning }]}>{data?.pendingReviews ?? 0}</Text>
            <Text style={styles.statLabel}>Pending</Text>
          </Card>
          <Card style={{ flex: 1 }}>
            <Text style={[styles.stat, { color: colors.success }]}>{data?.approved ?? 0}</Text>
            <Text style={styles.statLabel}>Approved</Text>
          </Card>
          <Card style={{ flex: 1 }}>
            <Text style={[styles.stat, { color: colors.error }]}>{data?.rejected ?? 0}</Text>
            <Text style={styles.statLabel}>Rejected</Text>
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
  section: { color: colors.textSecondary, fontSize: fontSize.sm, marginBottom: spacing.xs },
  score: { fontSize: 48, fontWeight: "bold" },
  bar: { height: 8, backgroundColor: colors.surfaceLight, borderRadius: 4, marginTop: spacing.sm },
  barFill: { height: "100%", borderRadius: 4 },
  row: { flexDirection: "row", gap: spacing.sm },
  stat: { fontSize: fontSize.xxl, fontWeight: "bold" },
  statLabel: { color: colors.textMuted, fontSize: fontSize.sm },
});
