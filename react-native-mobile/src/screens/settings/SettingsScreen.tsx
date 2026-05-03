import React from "react";
import { View, Text, SafeAreaView, ScrollView, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Card from "../../components/Card";
import { useAuthStore } from "../../hooks/useAuthStore";
import { useConnectivity } from "../../hooks/useConnectivity";
import { offlineStore } from "../../services/offlineStore";
import { colors, spacing, fontSize, borderRadius } from "../../theme";

const SETTINGS_ITEMS = [
  { icon: "shield-checkmark", label: "Security & Biometrics", screen: "Security" },
  { icon: "notifications", label: "Notification Preferences", screen: "NotificationPrefs" },
  { icon: "cloud-upload", label: "Offline Queue", screen: "OfflineQueue" },
  { icon: "language", label: "Language", screen: null },
  { icon: "moon", label: "Dark Mode", screen: null },
  { icon: "help-circle", label: "Help & Support", screen: null },
  { icon: "document-text", label: "Terms of Service", screen: null },
  { icon: "lock-closed", label: "Privacy Policy", screen: null },
] as const;

export default function SettingsScreen({ navigation }: { navigation: any }) {
  const { user, logout } = useAuthStore();
  const { bandwidthTier, connectionType } = useConnectivity();

  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Logout", style: "destructive", onPress: async () => { await logout(); navigation.replace("Login"); } },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* User info */}
        <Card>
          <View style={styles.userRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{user?.username?.[0]?.toUpperCase() ?? "U"}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.username}>{user?.username ?? "Guest"}</Text>
              <Text style={styles.role}>{user?.role ?? "unknown"}</Text>
            </View>
          </View>
        </Card>

        {/* Connection status */}
        <Card>
          <View style={styles.connRow}>
            <Ionicons name="wifi" size={20} color={bandwidthTier === "offline" ? colors.error : colors.success} />
            <Text style={styles.connText}>{connectionType} ({bandwidthTier})</Text>
          </View>
        </Card>

        {/* Settings items */}
        {SETTINGS_ITEMS.map((item) => (
          <TouchableOpacity key={item.label}
            onPress={() => item.screen ? navigation.navigate(item.screen) : null}>
            <Card>
              <View style={styles.itemRow}>
                <Ionicons name={item.icon as never} size={22} color={colors.primary} />
                <Text style={styles.itemLabel}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </View>
            </Card>
          </TouchableOpacity>
        ))}

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out" size={20} color={colors.error} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>

        <Text style={styles.version}>TourismPay v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.md },
  userRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary, justifyContent: "center", alignItems: "center" },
  avatarText: { color: colors.white, fontSize: fontSize.xl, fontWeight: "bold" },
  username: { color: colors.text, fontSize: fontSize.lg, fontWeight: "600" },
  role: { color: colors.primary, fontSize: fontSize.sm, textTransform: "capitalize" },
  connRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  connText: { color: colors.text, fontSize: fontSize.md, textTransform: "capitalize" },
  itemRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  itemLabel: { color: colors.text, fontSize: fontSize.md, flex: 1 },
  logoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.lg, marginTop: spacing.md },
  logoutText: { color: colors.error, fontSize: fontSize.lg, fontWeight: "600" },
  version: { color: colors.textMuted, textAlign: "center", fontSize: fontSize.xs, marginTop: spacing.md },
});
