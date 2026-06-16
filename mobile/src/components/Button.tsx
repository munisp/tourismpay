/**
 * Reusable Button component — primary, secondary, outline, danger variants.
 */
import React from "react";
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle } from "react-native";

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "outline" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

export function Button({ title, onPress, variant = "primary", size = "md", loading, disabled, style }: ButtonProps) {
  const btnStyle = [
    s.base,
    s[variant],
    s[`size_${size}`],
    (disabled || loading) && s.disabled,
    style,
  ];

  return (
    <TouchableOpacity style={btnStyle} onPress={onPress} disabled={disabled || loading}>
      {loading ? (
        <ActivityIndicator color={variant === "outline" ? "#6c63ff" : "#fff"} size="small" />
      ) : (
        <Text style={[s.text, s[`text_${variant}`], s[`textSize_${size}`]]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  base: { borderRadius: 10, alignItems: "center", justifyContent: "center" },
  primary: { backgroundColor: "#6c63ff" },
  secondary: { backgroundColor: "#1a1a2e" },
  outline: { backgroundColor: "transparent", borderWidth: 1, borderColor: "#6c63ff" },
  danger: { backgroundColor: "#ef4444" },
  ghost: { backgroundColor: "transparent" },
  disabled: { opacity: 0.5 },
  size_sm: { paddingHorizontal: 12, paddingVertical: 8 },
  size_md: { paddingHorizontal: 16, paddingVertical: 12 },
  size_lg: { paddingHorizontal: 20, paddingVertical: 16 },
  text: { fontWeight: "600" },
  text_primary: { color: "#fff" },
  text_secondary: { color: "#ccc" },
  text_outline: { color: "#6c63ff" },
  text_danger: { color: "#fff" },
  text_ghost: { color: "#6c63ff" },
  textSize_sm: { fontSize: 12 },
  textSize_md: { fontSize: 14 },
  textSize_lg: { fontSize: 16 },
});
