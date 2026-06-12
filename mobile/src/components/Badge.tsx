/**
 * Badge component — status indicators, tags, labels.
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";

interface BadgeProps {
  label: string;
  variant?: "default" | "success" | "warning" | "danger" | "info";
  size?: "sm" | "md";
}

export function Badge({ label, variant = "default", size = "sm" }: BadgeProps) {
  return (
    <View style={[s.base, s[variant], s[`size_${size}`]]}>
      <Text style={[s.text, s[`text_${variant}`], s[`textSize_${size}`]]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  base: { borderRadius: 6, alignSelf: "flex-start" },
  default: { backgroundColor: "#64748b20" },
  success: { backgroundColor: "#22c55e20" },
  warning: { backgroundColor: "#f59e0b20" },
  danger: { backgroundColor: "#ef444420" },
  info: { backgroundColor: "#6c63ff20" },
  size_sm: { paddingHorizontal: 8, paddingVertical: 2 },
  size_md: { paddingHorizontal: 10, paddingVertical: 4 },
  text: { fontWeight: "600" },
  text_default: { color: "#94a3b8" },
  text_success: { color: "#22c55e" },
  text_warning: { color: "#f59e0b" },
  text_danger: { color: "#ef4444" },
  text_info: { color: "#6c63ff" },
  textSize_sm: { fontSize: 10 },
  textSize_md: { fontSize: 12 },
});
