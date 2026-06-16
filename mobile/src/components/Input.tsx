/**
 * Input component — styled text input with label, error, and icon support.
 */
import React from "react";
import { View, Text, TextInput, StyleSheet, TextInputProps } from "react-native";

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  icon?: string;
}

export function Input({ label, error, icon, style, ...props }: InputProps) {
  return (
    <View style={s.container}>
      {label && <Text style={s.label}>{label}</Text>}
      <View style={[s.inputWrapper, error && s.inputError]}>
        {icon && <Text style={s.icon}>{icon}</Text>}
        <TextInput
          style={[s.input, style]}
          placeholderTextColor="#666"
          {...props}
        />
      </View>
      {error && <Text style={s.errorText}>{error}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  container: { marginBottom: 12 },
  label: { color: "#ccc", fontSize: 12, fontWeight: "500", marginBottom: 6 },
  inputWrapper: { flexDirection: "row", alignItems: "center", backgroundColor: "#1a1a2e", borderRadius: 10, borderWidth: 1, borderColor: "#2d2d44", overflow: "hidden" },
  inputError: { borderColor: "#ef4444" },
  icon: { fontSize: 16, paddingLeft: 12 },
  input: { flex: 1, padding: 12, color: "#fff", fontSize: 14 },
  errorText: { color: "#ef4444", fontSize: 11, marginTop: 4 },
});
