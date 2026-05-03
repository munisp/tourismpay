import React, { useState } from "react";
import { View, Text, SafeAreaView, ScrollView, StyleSheet, Switch, TouchableOpacity, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Card from "../../components/Card";
import { colors, spacing, fontSize, borderRadius } from "../../theme";

export default function SecurityScreen() {
  const [biometricEnabled, setBiometricEnabled] = useState(true);
  const [pinEnabled, setPinEnabled] = useState(false);
  const [twoFA, setTwoFA] = useState(false);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Card>
          <Text style={styles.section}>Authentication</Text>
          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingLabel}>Biometric Login</Text>
              <Text style={styles.settingDesc}>Use Face ID / Fingerprint</Text>
            </View>
            <Switch value={biometricEnabled} onValueChange={setBiometricEnabled} trackColor={{ true: colors.primary }} />
          </View>
          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingLabel}>PIN Code</Text>
              <Text style={styles.settingDesc}>6-digit PIN as backup</Text>
            </View>
            <Switch value={pinEnabled} onValueChange={setPinEnabled} trackColor={{ true: colors.primary }} />
          </View>
          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingLabel}>Two-Factor Auth</Text>
              <Text style={styles.settingDesc}>TOTP authenticator app</Text>
            </View>
            <Switch value={twoFA} onValueChange={setTwoFA} trackColor={{ true: colors.primary }} />
          </View>
        </Card>

        <Card>
          <Text style={styles.section}>Session Management</Text>
          <TouchableOpacity style={styles.actionRow} onPress={() => Alert.alert("Sessions", "All other sessions have been revoked.")}>
            <Ionicons name="close-circle" size={20} color={colors.error} />
            <Text style={styles.actionText}>Revoke All Other Sessions</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionRow} onPress={() => Alert.alert("Password", "Password change flow would open here.")}>
            <Ionicons name="key" size={20} color={colors.primary} />
            <Text style={styles.actionText}>Change Password</Text>
          </TouchableOpacity>
        </Card>

        <Card>
          <Text style={styles.section}>Transaction Security</Text>
          <Text style={styles.desc}>Payments over $100 require biometric confirmation. Cross-border transfers require 2FA.</Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.md },
  section: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: "600", marginBottom: spacing.md, textTransform: "uppercase" },
  settingRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  settingLabel: { color: colors.text, fontSize: fontSize.md, fontWeight: "600" },
  settingDesc: { color: colors.textMuted, fontSize: fontSize.sm },
  actionRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md },
  actionText: { color: colors.text, fontSize: fontSize.md },
  desc: { color: colors.textSecondary, fontSize: fontSize.md, lineHeight: 22 },
});
