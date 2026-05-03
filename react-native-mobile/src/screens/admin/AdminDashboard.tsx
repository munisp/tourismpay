import React, { useState, useEffect } from "react";
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, SafeAreaView, TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Card from "../../components/Card";
import { api, type ServiceHealthData, type MiddlewareHealthData } from "../../services/api";
import { colors, spacing, fontSize, borderRadius } from "../../theme";

export default function AdminDashboard({ navigation }: { navigation: any }) {
  const [serviceHealth, setServiceHealth] = useState<ServiceHealthData | null>(null);
  const [middlewareHealth, setMiddlewareHealth] = useState<MiddlewareHealthData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const [sh, mh] = await Promise.all([
      api.getServiceHealth().catch(() => null),
      api.getMiddlewareHealth().catch(() => null),
    ]);
    if (sh) setServiceHealth(sh);
    if (mh) setMiddlewareHealth(mh);
  };
  useEffect(() => { load(); }, []);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const healthySvc = serviceHealth?.services.filter((s) => s.status === "healthy").length ?? 0;
  const totalSvc = serviceHealth?.services.length ?? 0;
  const healthyMw = middlewareHealth?.services.filter((s) => s.status === "healthy").length ?? 0;
  const totalMw = middlewareHealth?.services.length ?? 0;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
        <Text style={styles.title}>Admin Dashboard</Text>

        {/* Platform health */}
        <View style={styles.statsRow}>
          <Card style={{ flex: 1 }}>
            <Text style={styles.statLabel}>Services</Text>
            <Text style={styles.statValue}>{healthySvc}/{totalSvc}</Text>
            <Text style={styles.statSub}>healthy</Text>
          </Card>
          <Card style={{ flex: 1 }}>
            <Text style={styles.statLabel}>Middleware</Text>
            <Text style={styles.statValue}>{healthyMw}/{totalMw}</Text>
            <Text style={styles.statSub}>online</Text>
          </Card>
          <Card style={{ flex: 1 }}>
            <Text style={styles.statLabel}>Uptime</Text>
            <Text style={styles.statValue}>{serviceHealth?.uptime?.toFixed(1) ?? "—"}%</Text>
            <Text style={styles.statSub}>30 days</Text>
          </Card>
        </View>

        {/* Quick nav */}
        {[
          { icon: "people", label: "User Management", screen: "Users" },
          { icon: "document-text", label: "Audit Log", screen: "AuditLogScreen" },
          { icon: "shield-checkmark", label: "KYB Applications", screen: "KYBReviewScreen" },
          { icon: "pulse", label: "Service Health", screen: "Health" },
          { icon: "cash", label: "Settlement Console", screen: "SettlementScreen" },
          { icon: "analytics", label: "Compliance", screen: "Compliance" },
        ].map((item) => (
          <TouchableOpacity key={item.label} onPress={() => navigation.navigate(item.screen)}>
            <Card>
              <View style={styles.navRow}>
                <Ionicons name={item.icon as never} size={24} color={colors.primary} />
                <Text style={styles.navLabel}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </View>
            </Card>
          </TouchableOpacity>
        ))}

        {/* Middleware services */}
        {middlewareHealth && (
          <Card>
            <Text style={styles.sectionTitle}>Middleware Services</Text>
            {middlewareHealth.services.slice(0, 8).map((s) => (
              <View key={s.name} style={styles.mwRow}>
                <View style={[styles.mwDot, { backgroundColor: s.status === "healthy" ? colors.success : colors.error }]} />
                <Text style={styles.mwName}>{s.name}</Text>
                <Text style={styles.mwLang}>{s.language}</Text>
                <Text style={styles.mwPort}>:{s.port}</Text>
              </View>
            ))}
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.md },
  title: { color: colors.text, fontSize: fontSize.xxl, fontWeight: "bold", marginBottom: spacing.md },
  statsRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  statLabel: { color: colors.textSecondary, fontSize: fontSize.xs, textTransform: "uppercase" },
  statValue: { color: colors.text, fontSize: fontSize.xxl, fontWeight: "bold" },
  statSub: { color: colors.textMuted, fontSize: fontSize.xs },
  navRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  navLabel: { color: colors.text, fontSize: fontSize.lg, flex: 1 },
  sectionTitle: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: "600", marginBottom: spacing.sm, textTransform: "uppercase" },
  mwRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.xs, gap: spacing.sm },
  mwDot: { width: 8, height: 8, borderRadius: 4 },
  mwName: { color: colors.text, fontSize: fontSize.md, flex: 1 },
  mwLang: { color: colors.primary, fontSize: fontSize.xs },
  mwPort: { color: colors.textMuted, fontSize: fontSize.xs },
});
