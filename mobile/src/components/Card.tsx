/**
 * Reusable Card component — base container for content sections.
 */
import React, { ReactNode } from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";

interface CardProps {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  style?: ViewStyle;
  variant?: "default" | "elevated" | "outlined";
}

export function Card({ title, subtitle, children, style, variant = "default" }: CardProps) {
  return (
    <View style={[s.card, variant === "elevated" && s.elevated, variant === "outlined" && s.outlined, style]}>
      {title && <Text style={s.title}>{title}</Text>}
      {subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: "#1a1a2e", borderRadius: 14, padding: 16, marginBottom: 12 },
  elevated: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8 },
  outlined: { borderWidth: 1, borderColor: "#2d2d44" },
  title: { color: "#fff", fontSize: 16, fontWeight: "600", marginBottom: 4 },
  subtitle: { color: "#888", fontSize: 12, marginBottom: 8 },
});
