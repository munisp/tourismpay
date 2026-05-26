import React, { useState, useEffect } from "react";
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, SafeAreaView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Card from "../../components/Card";
import { api } from "../../services/api";
import { colors, spacing, fontSize, borderRadius } from "../../theme";

interface MLModel {
  name: string;
  status: string;
  accuracy: number;
  framework: string;
  lastTrained?: string;
}

const DEFAULT_MODELS: MLModel[] = [
  { name: "Fraud XGBoost", status: "active", accuracy: 0.99, framework: "XGBoost", lastTrained: "2026-04-28" },
  { name: "Fraud GNN", status: "active", accuracy: 0.76, framework: "PyTorch Geometric", lastTrained: "2026-04-28" },
  { name: "FX Transformer", status: "active", accuracy: 0.85, framework: "PyTorch", lastTrained: "2026-04-28" },
  { name: "BIS Risk LightGBM", status: "active", accuracy: 0.90, framework: "LightGBM", lastTrained: "2026-04-28" },
];

export default function MLDashboardScreen() {
  const [models, setModels] = useState<MLModel[]>(DEFAULT_MODELS);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const data = await api.trpcQuery("pythonServices.listModels");
      if (Array.isArray(data) && data.length > 0) setModels(data as MLModel[]);
    } catch { /* use defaults */ }
  };

  useEffect(() => { load(); }, []);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const accuracyColor = (acc: number) => acc >= 0.9 ? colors.success : acc >= 0.75 ? colors.warning : colors.error;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <Text style={styles.title}>ML / AI Models</Text>

        <View style={styles.summaryRow}>
          <Card style={[styles.summaryCard, { borderLeftColor: colors.success, borderLeftWidth: 3 }]}>
            <Text style={styles.summaryValue}>{models.filter((m) => m.status === "active").length}</Text>
            <Text style={styles.summaryLabel}>Active</Text>
          </Card>
          <Card style={[styles.summaryCard, { borderLeftColor: colors.primary, borderLeftWidth: 3 }]}>
            <Text style={styles.summaryValue}>{models.length}</Text>
            <Text style={styles.summaryLabel}>Total</Text>
          </Card>
        </View>

        {models.map((m, i) => (
          <Card key={i} style={styles.modelCard}>
            <View style={styles.modelHeader}>
              <View style={styles.modelLeft}>
                <Ionicons name="analytics" size={24} color={colors.primary} />
                <View style={{ marginLeft: spacing.sm }}>
                  <Text style={styles.modelName}>{m.name}</Text>
                  <Text style={styles.framework}>{m.framework}</Text>
                </View>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: m.status === "active" ? colors.success + "22" : colors.textSecondary + "22" }]}>
                <Text style={[styles.statusText, { color: m.status === "active" ? colors.success : colors.textSecondary }]}>{m.status}</Text>
              </View>
            </View>

            <View style={styles.accuracyRow}>
              <Text style={styles.accuracyLabel}>Accuracy</Text>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${m.accuracy * 100}%`, backgroundColor: accuracyColor(m.accuracy) }]} />
              </View>
              <Text style={[styles.accuracyValue, { color: accuracyColor(m.accuracy) }]}>{(m.accuracy * 100).toFixed(1)}%</Text>
            </View>

            {m.lastTrained && (
              <Text style={styles.lastTrained}>Last trained: {m.lastTrained}</Text>
            )}
          </Card>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  title: { fontSize: fontSize.xl, fontWeight: "700", padding: spacing.md, color: colors.text },
  summaryRow: { flexDirection: "row", paddingHorizontal: spacing.md, gap: spacing.sm },
  summaryCard: { flex: 1, padding: spacing.md, alignItems: "center" },
  summaryValue: { fontSize: fontSize.xl, fontWeight: "700", color: colors.text },
  summaryLabel: { fontSize: fontSize.sm, color: colors.textSecondary },
  modelCard: { marginHorizontal: spacing.md, marginTop: spacing.sm, padding: spacing.md },
  modelHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modelLeft: { flexDirection: "row", alignItems: "center" },
  modelName: { fontSize: fontSize.md, fontWeight: "600", color: colors.text },
  framework: { fontSize: fontSize.sm, color: colors.textSecondary },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: borderRadius.sm },
  statusText: { fontSize: fontSize.xs, fontWeight: "600" },
  accuracyRow: { flexDirection: "row", alignItems: "center", marginTop: spacing.sm },
  accuracyLabel: { fontSize: fontSize.sm, color: colors.textSecondary, width: 64 },
  progressBar: { flex: 1, height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3 },
  accuracyValue: { fontSize: fontSize.sm, fontWeight: "600", width: 48, textAlign: "right" },
  lastTrained: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: spacing.xs },
});
