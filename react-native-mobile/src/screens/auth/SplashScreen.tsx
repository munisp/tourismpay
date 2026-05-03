import React, { useEffect } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useAuthStore } from "../../hooks/useAuthStore";
import { colors, fontSize } from "../../theme";

export default function SplashScreen({ navigation }: { navigation: any }) {
  const { restore, isAuthenticated, user, isLoading } = useAuthStore();

  useEffect(() => {
    restore();
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      navigation.replace("Login");
      return;
    }
    switch (user?.role) {
      case "merchant":
        navigation.replace("MerchantTabs");
        break;
      case "admin":
        navigation.replace("AdminTabs");
        break;
      default:
        navigation.replace("TouristTabs");
    }
  }, [isLoading, isAuthenticated, user]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>TourismPay</Text>
      <Text style={styles.subtitle}>Pan-African Travel & Payments</Text>
      <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center" },
  title: { color: colors.text, fontSize: fontSize.xxxl, fontWeight: "bold" },
  subtitle: { color: colors.textSecondary, fontSize: fontSize.md, marginTop: 8 },
  spinner: { marginTop: 32 },
});
