import React, { useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
  SafeAreaView, ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "../../hooks/useAuthStore";
import { colors, spacing, fontSize, borderRadius } from "../../theme";

const ROLES = [
  { key: "tourist", label: "Tourist", icon: "airplane", description: "Travel, pay, explore Africa" },
  { key: "merchant", label: "Merchant", icon: "storefront", description: "Accept payments, manage business" },
  { key: "admin", label: "Admin", icon: "shield-checkmark", description: "Platform operations & compliance" },
  { key: "compliance_officer", label: "Compliance", icon: "document-text", description: "KYB & AML reviews" },
  { key: "settlement_officer", label: "Settlement", icon: "cash", description: "Manage settlements & payouts" },
  { key: "noc_operator", label: "NOC Operator", icon: "pulse", description: "Network operations center" },
  { key: "bis_analyst", label: "BIS Analyst", icon: "analytics", description: "Financial intelligence & reports" },
] as const;

export default function LoginScreen({ navigation }: { navigation: any }) {
  const [loading, setLoading] = useState<string | null>(null);
  const { login } = useAuthStore();

  const handleLogin = async (role: string) => {
    setLoading(role);
    try {
      await login(role);
      switch (role) {
        case "merchant":
          navigation.replace("MerchantTabs");
          break;
        case "admin":
        case "compliance_officer":
        case "settlement_officer":
        case "noc_operator":
        case "bis_analyst":
          navigation.replace("AdminTabs");
          break;
        default:
          navigation.replace("TouristTabs");
      }
    } catch {
      Alert.alert("Login Failed", "Could not connect to server. Check your connection and try again.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>TourismPay</Text>
        <Text style={styles.subtitle}>Select your role to continue</Text>

        {ROLES.map((role) => (
          <TouchableOpacity
            key={role.key}
            style={styles.roleCard}
            onPress={() => handleLogin(role.key)}
            disabled={loading !== null}
          >
            <Ionicons name={role.icon as never} size={28} color={colors.primary} />
            <View style={styles.roleInfo}>
              <Text style={styles.roleLabel}>{role.label}</Text>
              <Text style={styles.roleDesc}>{role.description}</Text>
            </View>
            {loading === role.key ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingTop: spacing.xxl },
  title: { color: colors.text, fontSize: fontSize.xxxl, fontWeight: "bold", textAlign: "center" },
  subtitle: { color: colors.textSecondary, fontSize: fontSize.md, textAlign: "center", marginBottom: spacing.xl },
  roleCard: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.surface,
    borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  roleInfo: { flex: 1, marginLeft: spacing.md },
  roleLabel: { color: colors.text, fontSize: fontSize.lg, fontWeight: "600" },
  roleDesc: { color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 2 },
});
