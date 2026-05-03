import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, RefreshControl, SafeAreaView } from "react-native";
import Card from "../../components/Card";
import { api, type ServiceHealthData, type MiddlewareHealthData } from "../../services/api";
import { colors, spacing, fontSize, borderRadius } from "../../theme";

export default function ServiceHealthScreen() {
  const [services, setServices] = useState<ServiceHealthData | null>(null);
  const [middleware, setMiddleware] = useState<MiddlewareHealthData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const [s, m] = await Promise.all([
      api.getServiceHealth().catch(() => null),
      api.getMiddlewareHealth().catch(() => null),
    ]);
    if (s) setServices(s);
    if (m) setMiddleware(m);
  };
  useEffect(() => { load(); }, []);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
        <Text style={styles.title}>Service Health</Text>

        {services && (
          <Card>
            <Text style={styles.section}>Application Services</Text>
            <Text style={styles.uptime}>Uptime: {services.uptime.toFixed(2)}%</Text>
            {services.services.map((s) => (
              <View key={s.name} style={styles.svcRow}>
                <View style={[styles.dot, { backgroundColor: s.status === "healthy" ? colors.success : s.status === "degraded" ? colors.warning : colors.error }]} />
                <Text style={styles.svcName}>{s.name}</Text>
                <Text style={styles.latency}>{s.latency}ms</Text>
              </View>
            ))}
          </Card>
        )}

        {middleware && (
          <Card>
            <Text style={styles.section}>Middleware Services</Text>
            {middleware.services.map((s) => (
              <View key={s.name} style={styles.svcRow}>
                <View style={[styles.dot, { backgroundColor: s.status === "healthy" ? colors.success : colors.error }]} />
                <Text style={styles.svcName}>{s.name}</Text>
                <Text style={styles.lang}>{s.language}</Text>
                <Text style={styles.port}>:{s.port}</Text>
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
  section: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: "600", marginBottom: spacing.sm, textTransform: "uppercase" },
  uptime: { color: colors.success, fontSize: fontSize.xl, fontWeight: "bold", marginBottom: spacing.md },
  svcRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.xs, gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  svcName: { color: colors.text, fontSize: fontSize.md, flex: 1 },
  latency: { color: colors.textMuted, fontSize: fontSize.sm },
  lang: { color: colors.primary, fontSize: fontSize.xs },
  port: { color: colors.textMuted, fontSize: fontSize.xs },
});
