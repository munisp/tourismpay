import React, { useState, useEffect } from "react";
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, SafeAreaView, TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Card from "../../components/Card";
import { api } from "../../services/api";
import { colors, spacing, fontSize, borderRadius } from "../../theme";

interface Investigation {
  id: string;
  entityName: string;
  riskLevel: string;
  status: string;
  assignedTo: string;
  createdAt: string;
}

export default function BISInvestigationScreen() {
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const data = await api.trpcQuery("bis.list");
      setInvestigations((data as Investigation[]) || []);
    } catch { /* ignore */ }
  };

  useEffect(() => { load(); }, []);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const riskColor = (level: string) => {
    if (level === "critical") return colors.error;
    if (level === "high") return "#f97316";
    if (level === "medium") return colors.warning;
    return colors.success;
  };

  const statusIcon = (status: string): "checkmark-circle" | "hourglass" | "alert-circle" | "close-circle" => {
    if (status === "resolved") return "checkmark-circle";
    if (status === "in_progress") return "hourglass";
    if (status === "escalated") return "alert-circle";
    return "close-circle";
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <Text style={styles.title}>BIS Investigations</Text>

        <View style={styles.summaryRow}>
          {["pending", "in_progress", "resolved", "escalated"].map((status) => {
            const count = investigations.filter((i) => i.status === status).length;
            return (
              <Card key={status} style={styles.summaryCard}>
                <Text style={styles.summaryCount}>{count}</Text>
                <Text style={styles.summaryLabel}>{status.replace("_", " ")}</Text>
              </Card>
            );
          })}
        </View>

        {investigations.length === 0 && <Text style={styles.emptyText}>No investigations found</Text>}
        {investigations.map((inv) => (
          <Card key={inv.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardLeft}>
                <Ionicons name={statusIcon(inv.status)} size={20} color={riskColor(inv.riskLevel)} />
                <View style={{ marginLeft: spacing.sm }}>
                  <Text style={styles.entityName}>{inv.entityName}</Text>
                  <Text style={styles.meta}>Assigned: {inv.assignedTo || "Unassigned"}</Text>
                </View>
              </View>
              <View style={[styles.riskBadge, { backgroundColor: riskColor(inv.riskLevel) + "22" }]}>
                <Text style={[styles.riskText, { color: riskColor(inv.riskLevel) }]}>{inv.riskLevel}</Text>
              </View>
            </View>
            <View style={styles.cardFooter}>
              <Text style={styles.dateText}>{inv.createdAt?.substring(0, 10)}</Text>
              <View style={[styles.statusBadge, { backgroundColor: colors.primary + "22" }]}>
                <Text style={[styles.statusText, { color: colors.primary }]}>{inv.status?.replace("_", " ")}</Text>
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
  summaryRow: { flexDirection: "row", paddingHorizontal: spacing.sm, gap: spacing.sm },
  summaryCard: { flex: 1, alignItems: "center", padding: spacing.sm },
  summaryCount: { fontSize: fontSize.lg, fontWeight: "700", color: colors.text },
  summaryLabel: { fontSize: 10, color: colors.textSecondary, textTransform: "capitalize" },
  card: { marginHorizontal: spacing.md, marginTop: spacing.sm, padding: spacing.md },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  entityName: { fontSize: fontSize.md, fontWeight: "600", color: colors.text },
  meta: { fontSize: fontSize.sm, color: colors.textSecondary },
  riskBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: borderRadius.sm },
  riskText: { fontSize: fontSize.xs, fontWeight: "600", textTransform: "capitalize" },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.sm },
  dateText: { fontSize: fontSize.sm, color: colors.textSecondary },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: borderRadius.sm },
  statusText: { fontSize: fontSize.xs, fontWeight: "600", textTransform: "capitalize" },
  emptyText: { textAlign: "center", padding: spacing.xl, color: colors.textSecondary },
});
