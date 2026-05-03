import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, spacing, fontSize, borderRadius } from "../theme";

interface StatusBadgeProps {
  status: string;
  variant?: "success" | "warning" | "error" | "info" | "default";
}

export default function StatusBadge({ status, variant = "default" }: StatusBadgeProps) {
  const badgeColors: Record<string, { bg: string; text: string }> = {
    success: { bg: "#065f46", text: colors.success },
    warning: { bg: "#78350f", text: colors.warning },
    error: { bg: "#7f1d1d", text: colors.error },
    info: { bg: "#1e3a5f", text: colors.info },
    default: { bg: colors.surfaceLight, text: colors.textSecondary },
  };
  const c = badgeColors[variant] ?? badgeColors.default;

  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.text, { color: c.text }]}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    alignSelf: "flex-start",
  },
  text: { fontSize: fontSize.xs, fontWeight: "600" },
});
