import React, { useState, useEffect } from "react";
import { View, Text, FlatList, StyleSheet, RefreshControl, SafeAreaView } from "react-native";
import Card from "../../components/Card";
import { api, type AuditLog } from "../../services/api";
import { colors, spacing, fontSize } from "../../theme";

export default function AuditLogScreen() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => { try { const d = await api.getAuditLogs(); if (Array.isArray(d)) setLogs(d); } catch {} };
  useEffect(() => { load(); }, []);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Audit Log</Text>
      <FlatList data={logs} keyExtractor={(i) => i.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Card>
            <Text style={styles.action}>{item.action}</Text>
            <Text style={styles.details}>{item.details}</Text>
            <View style={styles.meta}>
              <Text style={styles.metaText}>User #{item.userId}</Text>
              <Text style={styles.metaText}>{item.ipAddress}</Text>
              <Text style={styles.metaText}>{item.timestamp}</Text>
            </View>
          </Card>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No audit logs</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  title: { color: colors.text, fontSize: fontSize.xxl, fontWeight: "bold", padding: spacing.md },
  list: { padding: spacing.md },
  action: { color: colors.text, fontSize: fontSize.lg, fontWeight: "600" },
  details: { color: colors.textSecondary, fontSize: fontSize.md, marginTop: 4 },
  meta: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm },
  metaText: { color: colors.textMuted, fontSize: fontSize.xs },
  empty: { color: colors.textMuted, textAlign: "center", padding: spacing.xl },
});
