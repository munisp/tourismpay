/**
 * ListItem — reusable list row with icon, title, subtitle, and trailing action.
 */
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

interface ListItemProps {
  icon?: string;
  title: string;
  subtitle?: string;
  trailing?: string;
  trailingColor?: string;
  onPress?: () => void;
}

export function ListItem({ icon, title, subtitle, trailing, trailingColor, onPress }: ListItemProps) {
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper style={s.container} onPress={onPress}>
      {icon && <Text style={s.icon}>{icon}</Text>}
      <View style={s.content}>
        <Text style={s.title}>{title}</Text>
        {subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
      </View>
      {trailing && <Text style={[s.trailing, trailingColor ? { color: trailingColor } : undefined]}>{trailing}</Text>}
      {onPress && <Text style={s.chevron}>›</Text>}
    </Wrapper>
  );
}

const s = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "center", backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, marginBottom: 8, gap: 12 },
  icon: { fontSize: 22 },
  content: { flex: 1 },
  title: { color: "#fff", fontSize: 14, fontWeight: "500" },
  subtitle: { color: "#888", fontSize: 12, marginTop: 2 },
  trailing: { color: "#6c63ff", fontSize: 13, fontWeight: "600" },
  chevron: { color: "#666", fontSize: 20, marginLeft: 4 },
});
