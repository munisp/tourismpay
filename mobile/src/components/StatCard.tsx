/**
 * StatCard — compact metric display for dashboard summary rows.
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";

interface StatCardProps {
  value: string | number;
  label: string;
  color?: string;
  trend?: "up" | "down" | "neutral";
}

export function StatCard({ value, label, color, trend }: StatCardProps) {
  const trendColors = { up: "#22c55e", down: "#ef4444", neutral: "#888" };

  return (
    <View style={s.card}>
      <Text style={[s.value, color ? { color } : undefined]}>{value}</Text>
      <Text style={s.label}>{label}</Text>
      {trend && (
        <Text style={[s.trend, { color: trendColors[trend] }]}>
          {trend === "up" ? "↑" : trend === "down" ? "↓" : "→"}
        </Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { flex: 1, backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, alignItems: "center" },
  value: { fontSize: 18, fontWeight: "700", color: "#fff" },
  label: { fontSize: 10, color: "#888", marginTop: 4 },
  trend: { fontSize: 12, marginTop: 2 },
});
