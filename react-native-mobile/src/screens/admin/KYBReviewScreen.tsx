import React, { useState, useEffect } from "react";
import { View, Text, FlatList, StyleSheet, RefreshControl, SafeAreaView, TouchableOpacity } from "react-native";
import Card from "../../components/Card";
import StatusBadge from "../../components/StatusBadge";
import { api, type KybApplication } from "../../services/api";
import { colors, spacing, fontSize } from "../../theme";

export default function KYBReviewScreen() {
  const [apps, setApps] = useState<KybApplication[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => { try { const d = await api.getKybApplications(); if (Array.isArray(d)) setApps(d); } catch {} };
  useEffect(() => { load(); }, []);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const statusVariant = (s: string) =>
    s === "approved" ? "success" : s === "pending" ? "warning" : s === "rejected" ? "error" : "default";

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>KYB Applications</Text>
      <FlatList data={apps} keyExtractor={(i) => i.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Card>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.businessName}</Text>
                <Text style={styles.country}>{item.country}</Text>
                <Text style={styles.meta}>{item.documents} docs | Submitted: {item.submittedAt}</Text>
              </View>
              <StatusBadge status={item.status} variant={statusVariant(item.status)} />
            </View>
          </Card>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No applications</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  title: { color: colors.text, fontSize: fontSize.xxl, fontWeight: "bold", padding: spacing.md },
  list: { padding: spacing.md },
  row: { flexDirection: "row", alignItems: "center" },
  name: { color: colors.text, fontSize: fontSize.lg, fontWeight: "600" },
  country: { color: colors.primary, fontSize: fontSize.sm },
  meta: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 4 },
  empty: { color: colors.textMuted, textAlign: "center", padding: spacing.xl },
});
