/**
 * More Home — Grid of all platform features accessible via "More" tab.
 */
import React from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";

interface MenuItem {
  emoji: string;
  label: string;
  route: string;
  color: string;
}

const MENU_ITEMS: MenuItem[] = [
  { emoji: "🌍", label: "Africa Registry", route: "Africa", color: "#10b981" },
  { emoji: "📋", label: "KYB Onboarding", route: "KYB", color: "#6c63ff" },
  { emoji: "🏨", label: "Merchant Setup", route: "Onboarding", color: "#d97706" },
  { emoji: "🤖", label: "AI Copilot", route: "Copilot", color: "#06b6d4" },
  { emoji: "🌱", label: "Sustainability", route: "Sustainability", color: "#22c55e" },
  { emoji: "🪪", label: "Digital Identity", route: "Identity", color: "#8b5cf6" },
  { emoji: "🔔", label: "Notifications", route: "NotificationsList", color: "#f59e0b" },
  { emoji: "⚖️", label: "Settlement", route: "SettlementConsole", color: "#ec4899" },
  { emoji: "📜", label: "Compliance", route: "Compliance", color: "#ef4444" },
  { emoji: "📊", label: "Analytics", route: "Analytics", color: "#3b82f6" },
  { emoji: "🔒", label: "Security", route: "Security", color: "#f43f5e" },
  { emoji: "⚙️", label: "Settings", route: "Settings", color: "#64748b" },
];

export function MoreHomeScreen({ navigation }: any) {
  return (
    <ScrollView style={s.container}>
      <Text style={s.title}>More Features</Text>
      <View style={s.grid}>
        {MENU_ITEMS.map((item) => (
          <TouchableOpacity
            key={item.route}
            style={s.menuItem}
            onPress={() => navigation.navigate(item.route)}
          >
            <View style={[s.iconBox, { backgroundColor: item.color + "20" }]}>
              <Text style={s.emoji}>{item.emoji}</Text>
            </View>
            <Text style={s.menuLabel}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* App Info */}
      <View style={s.appInfo}>
        <Text style={s.appName}>TourismPay</Text>
        <Text style={s.appVersion}>v1.0.0 • React Native</Text>
        <Text style={s.appDesc}>Cross-border payments for African tourism</Text>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a", padding: 16 },
  title: { fontSize: 22, fontWeight: "700", color: "#fff", marginTop: 12, marginBottom: 20 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  menuItem: { width: "30%", alignItems: "center", marginBottom: 16 },
  iconBox: { width: 56, height: 56, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  emoji: { fontSize: 26 },
  menuLabel: { color: "#ccc", fontSize: 11, fontWeight: "500", marginTop: 6, textAlign: "center" },
  appInfo: { alignItems: "center", marginTop: 40, paddingBottom: 40 },
  appName: { color: "#6c63ff", fontSize: 16, fontWeight: "700" },
  appVersion: { color: "#666", fontSize: 11, marginTop: 4 },
  appDesc: { color: "#888", fontSize: 12, marginTop: 2 },
});
