import React, { useState } from "react";
import { View, Text, SafeAreaView, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, fontSize, borderRadius } from "../../theme";

export default function QRScanScreen({ navigation }: { navigation: any }) {
  const [scanned, setScanned] = useState(false);

  const handleBarCodeScanned = (data: string) => {
    setScanned(true);
    Alert.alert("QR Scanned", `Payment data: ${data}`, [
      { text: "Pay Now", onPress: () => navigation.navigate("Payment", { recipientId: data }) },
      { text: "Cancel", onPress: () => setScanned(false) },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.cameraPlaceholder}>
        <Ionicons name="qr-code" size={120} color={colors.textMuted} />
        <Text style={styles.hint}>Point camera at QR code</Text>
        <Text style={styles.subHint}>Camera access requires device permissions</Text>

        {/* Simulated scan button for demo */}
        <TouchableOpacity
          style={styles.scanBtn}
          onPress={() => handleBarCodeScanned("merchant-001-payment-50-usd")}
        >
          <Ionicons name="scan" size={20} color={colors.white} />
          <Text style={styles.scanText}>Simulate Scan</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.optionBtn}>
          <Ionicons name="images" size={24} color={colors.primary} />
          <Text style={styles.optionText}>Gallery</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.optionBtn}>
          <Ionicons name="flash" size={24} color={colors.primary} />
          <Text style={styles.optionText}>Flash</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.optionBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={24} color={colors.error} />
          <Text style={styles.optionText}>Close</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.black },
  cameraPlaceholder: { flex: 1, justifyContent: "center", alignItems: "center" },
  hint: { color: colors.text, fontSize: fontSize.lg, marginTop: spacing.md },
  subHint: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: spacing.xs },
  scanBtn: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.primary, borderRadius: borderRadius.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, marginTop: spacing.xl },
  scanText: { color: colors.white, fontSize: fontSize.md, fontWeight: "600" },
  bottomBar: { flexDirection: "row", justifyContent: "space-around", paddingVertical: spacing.lg, backgroundColor: colors.background },
  optionBtn: { alignItems: "center" },
  optionText: { color: colors.textSecondary, fontSize: fontSize.xs, marginTop: spacing.xs },
});
