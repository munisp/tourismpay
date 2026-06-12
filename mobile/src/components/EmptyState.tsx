/**
 * Empty State component — displayed when lists have no data.
 */
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";

interface EmptyStateProps {
  emoji: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ emoji, title, subtitle, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={s.container}>
      <Text style={s.emoji}>{emoji}</Text>
      <Text style={s.title}>{title}</Text>
      {subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
      {actionLabel && onAction && (
        <TouchableOpacity style={s.actionBtn} onPress={onAction}>
          <Text style={s.actionText}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { alignItems: "center", padding: 40 },
  emoji: { fontSize: 48, marginBottom: 12 },
  title: { color: "#fff", fontSize: 16, fontWeight: "600", textAlign: "center" },
  subtitle: { color: "#888", fontSize: 13, marginTop: 6, textAlign: "center", lineHeight: 20 },
  actionBtn: { marginTop: 16, backgroundColor: "#6c63ff", borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  actionText: { color: "#fff", fontWeight: "600", fontSize: 13 },
});
