/**
 * BiometricAuth — Native biometric authentication screen with Face ID / Touch ID / Fingerprint.
 * Uses react-native-biometrics for hardware-level security.
 */
import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Switch } from "react-native";
import { biometricService, BiometricType } from "../../services/biometrics";
import { useAuth } from "../../hooks/useAuth";

export function BiometricAuth({ navigation }: any) {
  const { biometricAvailable, biometricEnabled, enableBiometric, disableBiometric } = useAuth();
  const [biometricType, setBiometricType] = useState<BiometricType>("None");
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    checkBiometric();
  }, []);

  const checkBiometric = async () => {
    const capability = await biometricService.checkCapability();
    setBiometricType(capability.type);
  };

  const handleToggle = async (value: boolean) => {
    if (value) {
      const success = await enableBiometric();
      if (!success) {
        Alert.alert("Failed", "Could not enable biometric authentication");
      }
    } else {
      await disableBiometric();
    }
  };

  const handleTest = async () => {
    setTesting(true);
    const result = await biometricService.authenticate("Test authentication");
    setTesting(false);

    if (result.success) {
      Alert.alert("Success", "Biometric authentication verified");
    } else {
      Alert.alert("Failed", result.error ?? "Authentication failed");
    }
  };

  const handleTransactionTest = async () => {
    setTesting(true);
    const result = await biometricService.authenticateForTransaction(100, "USD");
    setTesting(false);

    if (result.success) {
      Alert.alert("Confirmed", "Transaction would be authorized");
    } else {
      Alert.alert("Declined", result.error ?? "Transaction authentication failed");
    }
  };

  const biometricIcon = biometricType === "FaceID" ? "🆔" : biometricType === "TouchID" ? "👆" : "🔒";
  const biometricLabel = biometricType === "FaceID" ? "Face ID" : biometricType === "TouchID" ? "Touch ID" : "Fingerprint";

  return (
    <ScrollView style={s.container}>
      <Text style={s.title}>Biometric Authentication</Text>

      {/* Status */}
      <View style={s.statsRow}>
        <View style={s.stat}>
          <Text style={s.statNum}>{biometricIcon}</Text>
          <Text style={s.statLabel}>{biometricLabel}</Text>
        </View>
        <View style={s.stat}>
          <Text style={s.statNum}>{biometricAvailable ? "✓" : "✗"}</Text>
          <Text style={s.statLabel}>Available</Text>
        </View>
        <View style={s.stat}>
          <Text style={s.statNum}>{biometricEnabled ? "ON" : "OFF"}</Text>
          <Text style={s.statLabel}>Enabled</Text>
        </View>
      </View>

      {/* Toggle */}
      <View style={s.toggleRow}>
        <View>
          <Text style={s.toggleTitle}>Enable {biometricLabel}</Text>
          <Text style={s.toggleSubtext}>Use {biometricLabel} for login and transaction confirmation</Text>
        </View>
        <Switch
          value={biometricEnabled}
          onValueChange={handleToggle}
          trackColor={{ false: "#2d2d44", true: "#6c63ff80" }}
          thumbColor={biometricEnabled ? "#6c63ff" : "#888"}
          disabled={!biometricAvailable}
        />
      </View>

      {/* Actions */}
      {biometricAvailable && (
        <>
          <Text style={s.section}>Test Authentication</Text>
          <TouchableOpacity style={s.testBtn} onPress={handleTest} disabled={testing}>
            <Text style={s.testBtnEmoji}>{biometricIcon}</Text>
            <Text style={s.testBtnText}>Test {biometricLabel}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.testBtn} onPress={handleTransactionTest} disabled={testing}>
            <Text style={s.testBtnEmoji}>💳</Text>
            <Text style={s.testBtnText}>Test Transaction Confirmation</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Info */}
      <Text style={s.section}>Security Info</Text>
      <View style={s.infoCard}>
        <Text style={s.infoText}>
          Biometric data never leaves your device. TourismPay uses {biometricLabel} to:{"\n\n"}
          • Unlock the app quickly{"\n"}
          • Confirm transactions over $50{"\n"}
          • Authorize wallet operations{"\n"}
          • Sign payment approvals cryptographically
        </Text>
      </View>

      {!biometricAvailable && (
        <View style={s.warningCard}>
          <Text style={s.warningEmoji}>⚠️</Text>
          <Text style={s.warningText}>
            Biometric authentication is not available on this device. Please set up Face ID or fingerprint in your device settings.
          </Text>
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a", padding: 16 },
  title: { fontSize: 22, fontWeight: "700", color: "#fff", marginTop: 12, marginBottom: 16 },
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  stat: { flex: 1, backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, alignItems: "center" },
  statNum: { fontSize: 22, fontWeight: "700", color: "#fff" },
  statLabel: { fontSize: 10, color: "#888", marginTop: 4 },
  toggleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#1a1a2e", borderRadius: 12, padding: 16, marginBottom: 16 },
  toggleTitle: { color: "#fff", fontSize: 14, fontWeight: "600" },
  toggleSubtext: { color: "#888", fontSize: 11, marginTop: 2, maxWidth: 240 },
  section: { fontSize: 16, fontWeight: "600", color: "#fff", marginTop: 20, marginBottom: 12 },
  testBtn: { flexDirection: "row", alignItems: "center", backgroundColor: "#1a1a2e", borderRadius: 12, padding: 16, marginBottom: 10, gap: 12 },
  testBtnEmoji: { fontSize: 24 },
  testBtnText: { color: "#fff", fontSize: 14, fontWeight: "500" },
  infoCard: { backgroundColor: "#1a1a2e", borderRadius: 12, padding: 16 },
  infoText: { color: "#ccc", fontSize: 13, lineHeight: 20 },
  warningCard: { flexDirection: "row", backgroundColor: "#f59e0b15", borderRadius: 12, padding: 16, marginTop: 16, gap: 10, alignItems: "center", borderWidth: 1, borderColor: "#f59e0b30" },
  warningEmoji: { fontSize: 24 },
  warningText: { flex: 1, color: "#f59e0b", fontSize: 12, lineHeight: 18 },
});
