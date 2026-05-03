import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useConnectivity, type BandwidthTier } from "../hooks/useConnectivity";
import { colors, spacing, fontSize } from "../theme";

const bannerConfig: Record<BandwidthTier, { icon: string; label: string; color: string } | null> = {
  offline: { icon: "cloud-offline", label: "No connection — working offline", color: colors.error },
  "2g": { icon: "cellular", label: "Very slow connection — limited features", color: colors.warning },
  "3g": { icon: "cellular", label: "Slow connection", color: colors.warning },
  "4g": null,
  wifi: null,
};

export default function ConnectivityBanner() {
  const { bandwidthTier } = useConnectivity();
  const config = bannerConfig[bandwidthTier];
  if (!config) return null;

  return (
    <View style={[styles.banner, { backgroundColor: config.color + "20" }]}>
      <Ionicons name={config.icon as never} size={16} color={config.color} />
      <Text style={[styles.text, { color: config.color }]}>{config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    borderRadius: 8,
  },
  text: { fontSize: fontSize.sm, fontWeight: "500" },
});
